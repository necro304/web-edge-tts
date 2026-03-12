let mediaSource;
let sourceBuffer;
let audioElement;
let queue = [];
let currentMessageId = null;
let currentSocket = null;

function generateUUID() {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function getSecMsGec() {
    const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    const ticks = Math.floor(Date.now() / 1000 + 11644473600) * 10000000;
    const roundedTicks = ticks - (ticks % 3000000000);
    const strToHash = `${roundedTicks}${TRUSTED_CLIENT_TOKEN}`;
    
    const encoder = new TextEncoder();
    const data = encoder.encode(strToHash);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return hashHex;
}

function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

function initAudio() {
    if (audioElement) {
        audioElement.pause();
        audioElement.src = '';
    }
    audioElement = new Audio();
    mediaSource = new MediaSource();
    audioElement.src = URL.createObjectURL(mediaSource);
    
    mediaSource.addEventListener('sourceopen', () => {
        try {
            sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
            sourceBuffer.addEventListener('updateend', processQueue);
        } catch (e) {
            console.error('MSE sourceopen error', e);
        }
    });

    audioElement.addEventListener('ended', () => {
        chrome.runtime.sendMessage({ action: 'offscreen-event', event: 'ended', messageId: currentMessageId });
    });
    audioElement.addEventListener('error', (e) => {
        console.error("Audio element error", audioElement.error);
        chrome.runtime.sendMessage({ action: 'offscreen-event', event: 'error', error: 'Audio playback error', messageId: currentMessageId });
    });
}

function processQueue() {
    if (sourceBuffer && !sourceBuffer.updating && queue.length > 0 && mediaSource.readyState === 'open') {
        const chunk = queue.shift();
        try {
            sourceBuffer.appendBuffer(chunk);
        } catch (e) {
            console.error('MSE append error', e);
        }
    }
}

async function startPlayback(msgId, text, options) {
    if (currentSocket) {
        try { currentSocket.close(); } catch(e){}
    }
    
    currentMessageId = msgId;
    queue = [];
    initAudio();
    audioElement.play().catch(e => {
        chrome.runtime.sendMessage({ action: 'offscreen-event', event: 'error', error: 'Autoplay failed', messageId: msgId });
    });

    const voice = options?.voice || 'es-MX-DaliaNeural';
    const rate = options?.rate || '+0%';
    const pitch = options?.pitch || '+0Hz';
    
    const connectionId = generateUUID();
    const gec = await getSecMsGec();
    
    // We connect directly from the offscreen document. 
    // declarativeNetRequest rules apply cleanly to offscreen documents.
    const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${connectionId}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=1-143.0.3650.75`;

    currentSocket = new WebSocket(url);
    
    currentSocket.onopen = () => {
        const configMsg = `X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
        currentSocket.send(configMsg);

        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}'>${escapeXml(text)}</prosody></voice></speak>`;
        const requestMsg = `X-RequestId:${connectionId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\n\r\n${ssml}`;
        currentSocket.send(requestMsg);
    };

    currentSocket.onmessage = async (event) => {
        if (typeof event.data === 'string') {
            if (event.data.includes('Path:turn.end')) {
                currentSocket.close();
                currentSocket = null;
                const endStream = () => {
                    if (mediaSource && mediaSource.readyState === 'open') {
                        if (sourceBuffer && !sourceBuffer.updating && queue.length === 0) {
                            try { mediaSource.endOfStream(); } catch(e){}
                        } else {
                            setTimeout(endStream, 50);
                        }
                    }
                };
                endStream();
            }
        } else if (event.data instanceof Blob) {
            const buffer = await event.data.arrayBuffer();
            const view = new Uint8Array(buffer);
            let headerEnd = -1;
            
            for (let i = 0; i < view.length - 3; i++) {
                if (view[i] === 0x0D && view[i+1] === 0x0A && view[i+2] === 0x0D && view[i+3] === 0x0A) {
                    headerEnd = i + 4;
                    break;
                }
            }

            if (headerEnd !== -1) {
                const audioData = buffer.slice(headerEnd);
                queue.push(audioData);
                processQueue();
            }
        }
    };

    currentSocket.onerror = (error) => {
        console.error('WebSocket Error:', error);
        chrome.runtime.sendMessage({ action: 'offscreen-event', event: 'error', error: 'WebSocket connection failed (403 or network error)', messageId: msgId });
    };
}

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'offscreen-play-direct') {
        startPlayback(message.messageId, message.text, message.options).catch(e => {
            console.error("Error starting playback", e);
        });
    } else if (message.action === 'offscreen-play-stop') {
        if (audioElement) {
            audioElement.pause();
        }
        queue = [];
        if (mediaSource && mediaSource.readyState === 'open') {
            try { mediaSource.endOfStream(); } catch(e){}
        }
        if (currentSocket) {
            try { currentSocket.close(); } catch(e){}
            currentSocket = null;
        }
    }
});