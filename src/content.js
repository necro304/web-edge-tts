// Inject script into the main page context
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function() {
    this.remove();
};
(document.head || document.documentElement).appendChild(script);

// Listen for messages from the injected script
window.addEventListener('message', (event) => {
    // Only accept messages from the same window
    if (event.source !== window) return;

    if (event.data && event.data.source === 'edge-tts-inject') {
        // Forward the message to the background service worker
        chrome.runtime.sendMessage(event.data, (response) => {
            // Send back simple acknowledgments if needed
            window.postMessage({
                source: 'edge-tts-content',
                messageId: event.data.messageId,
                response: response
            }, '*');
        });
    }
});

// Listen for events (started, ended, error) from background and forward to injected script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'edge-tts-event') {
        window.postMessage({
            source: 'edge-tts-content-event',
            event: message.event,
            messageId: message.messageId,
            error: message.error
        }, '*');
    }
});