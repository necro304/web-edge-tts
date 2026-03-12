(function() {
    let messageCounter = 0;
    const pendingPromises = new Map();

    function sendMessage(action, payload) {
        return new Promise((resolve, reject) => {
            const messageId = ++messageCounter;
            pendingPromises.set(messageId, { resolve, reject });

            window.postMessage({
                source: 'edge-tts-inject',
                messageId: messageId,
                action: action,
                ...payload
            }, '*');
        });
    }

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;

        // Handle async events (started, ended, error, interrupted) from the content script
        if (event.data && event.data.source === 'edge-tts-content-event') {
            const { event: eventName, messageId, error } = event.data;
            const promiseHandlers = pendingPromises.get(messageId);

            if (promiseHandlers) {
                if (eventName === 'ended') {
                    promiseHandlers.resolve();
                    pendingPromises.delete(messageId);
                } else if (eventName === 'error') {
                    promiseHandlers.reject(new Error(error || 'TTS Error'));
                    pendingPromises.delete(messageId);
                } else if (eventName === 'interrupted') {
                    promiseHandlers.reject(new Error('Interrupted by another TTS request'));
                    pendingPromises.delete(messageId);
                }
            }
        }
    });

    window.edgeTTS = {
        speak: function(text, options = {}) {
            if (!text) return Promise.reject(new Error('No text provided'));
            return sendMessage('speak', { text, options });
        },
        stop: function() {
            sendMessage('stop', {});
            return Promise.resolve();
        }
    };
    
    console.log("Edge TTS Extension API injected. Use window.edgeTTS.speak('text')");
})();