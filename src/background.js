let currentRequest = null; // { tabId, msgId }
let creatingOffscreen;

async function setupOffscreenDocument(path) {
    if (await chrome.offscreen.hasDocument()) return;
    if (creatingOffscreen) {
        await creatingOffscreen;
    } else {
        creatingOffscreen = chrome.offscreen.createDocument({
            url: path,
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Play TTS audio silently'
        });
        await creatingOffscreen;
        creatingOffscreen = null;
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'speak') {
        currentRequest = { tabId: sender.tab.id, msgId: message.messageId };
        setupOffscreenDocument('offscreen.html').then(() => {
            chrome.runtime.sendMessage({
                action: 'offscreen-play-direct',
                messageId: message.messageId,
                text: message.text,
                options: message.options
            }).catch(e => console.error("Error forwarding speak to offscreen", e));
        }).catch(err => {
            console.error("Speak error:", err);
            sendEventToTab(sender.tab.id, 'error', message.messageId, err.message);
        });
        sendResponse({ status: 'started' });
    } else if (message.action === 'stop') {
        chrome.runtime.sendMessage({ action: 'offscreen-play-stop' }).catch(()=>{});
        if (currentRequest) {
            sendEventToTab(currentRequest.tabId, 'interrupted', currentRequest.msgId);
            currentRequest = null;
        }
        sendResponse({ status: 'stopped' });
    } else if (message.action === 'offscreen-event') {
        if (currentRequest && currentRequest.msgId === message.messageId) {
            sendEventToTab(currentRequest.tabId, message.event, currentRequest.msgId, message.error);
            if (message.event === 'ended' || message.event === 'error') {
                currentRequest = null;
            }
        }
    }
    return true; // async response
});

function sendEventToTab(tabId, eventName, messageId, error = null) {
    chrome.tabs.sendMessage(tabId, {
        type: 'edge-tts-event',
        event: eventName,
        messageId: messageId,
        error: error
    }).catch(() => {}); // ignore errors if tab is closed
}