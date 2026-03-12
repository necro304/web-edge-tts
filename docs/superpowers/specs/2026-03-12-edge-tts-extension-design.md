# Edge TTS Integration Extension (Chromium)

## 1. Overview and Purpose

A local web application running on a Raspberry Pi (Chromium) requires high-quality native Text-to-Speech (TTS). Since Chromium lacks the native Windows/Edge TTS engine, this project implements a Chromium extension that bridges the gap. The extension securely connects to the Microsoft Edge TTS web service (via WebSockets), acting as a proxy within the browser, and plays the synthesized audio silently without requiring external server components on the Pi.

## 2. Architecture (Manifest V3)

The extension utilizes a Manifest V3 architecture with the following components:

*   **Content Script (`content.js`):** Injected into the target local web page. It injects an isolation script (`inject.js`) into the main page execution context.
*   **Injected Script (`inject.js`):** Exposes a global API `window.edgeTTS` to the local web application. It uses `window.postMessage` to send TTS requests securely to `content.js` and listens for `postMessage` events for state updates (e.g., playback finished, error).
*   **Service Worker (`background.js`):** The core logic. It receives requests from `content.js`, manages a WebSocket connection to `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1`, receives the binary audio stream, and forwards it to an Offscreen Document for playback. It manages concurrent requests by tracking the active stream and aborting it if a new request arrives (interrupt-and-replace strategy).
*   **Offscreen Document (`offscreen.html` & `offscreen.js`):** A hidden DOM environment used exclusively for audio playback. It receives audio chunks, decodes them, and plays them via the Web Audio API or HTML5 `<audio>`, streaming chunks as they arrive for minimal latency. It reports back playback start, end, and error events to the Service Worker.

## 3. Data Flow

1.  **Request:** The local web app calls `window.edgeTTS.speak('Texto', { voice: 'es-MX-DaliaNeural' })`. The text is broken into smaller chunks (e.g., by punctuation or max 1000 characters) if it exceeds the WebSocket payload limits.
2.  **Injection to Content:** `inject.js` sends a `postMessage` with the payload to `content.js`.
3.  **Content to Background:** `content.js` relays the message to `background.js` via `chrome.runtime.sendMessage`.
4.  **WebSocket Connection:** `background.js` establishes a WebSocket with the Edge TTS service, generating a UUID v4 for the Connection ID, and sends the SSML payload. The connection's HTTP headers are spoofed using the `chrome.declarativeNetRequest` API to mimic Microsoft Edge.
5.  **Audio Reception:** `background.js` receives the synthesized binary audio chunks.
6.  **Background to Offscreen:** `background.js` sends the audio chunks to `offscreen.js` via `chrome.runtime.sendMessage`.
7.  **Playback:** `offscreen.js` decodes and plays the audio silently on the Raspberry Pi's default audio output, streaming to reduce time-to-first-audio latency.
8.  **Event Feedback:** `offscreen.js` sends 'started', 'ended', or 'error' events back through `background.js` -> `content.js` -> `inject.js` to resolve or reject the initial Promise returned to the local app.

## 4. API Specification

The injected global object `window.edgeTTS` will provide the following methods:

### `speak(text, options)`

Synthesizes and plays the provided text. Returns a Promise that resolves when playback completes successfully, or rejects if an error occurs.

**Concurrent Behavior:** Calling `speak()` while audio is currently playing will interrupt the current playback and immediately start the new text. The Promise from the interrupted `speak()` call will be rejected with an "Interrupted" error.

*   `text` (String): The text to be spoken. If the text is very long, the extension will automatically chunk it into multiple WebSocket payloads to avoid service limits.
*   `options` (Object, optional):
    *   `voice` (String): The Edge TTS voice name (e.g., `'es-MX-DaliaNeural'`, `'es-ES-AlvaroNeural'`). Defaults to a predefined Spanish voice (e.g., `'es-MX-DaliaNeural'`).
    *   `rate` (String): Speaking rate (e.g., `'+0%'`, `'+10%'`, `'-10%'`). Defaults to `'+0%'`.
    *   `pitch` (String): Speaking pitch (e.g., `'+0Hz'`). Defaults to `'+0Hz'`.

**Returns:** `Promise<void>`

### `stop()`

Immediately halts any ongoing TTS playback and closes the current WebSocket connection if active. Returns a Promise that resolves when the stop action is complete. Any pending `speak` Promises will be rejected.

**Returns:** `Promise<void>`

## 5. Security and Permissions

The `manifest.json` will require the following permissions:

*   `"scripting"`: To inject scripts into the local web application.
*   `"offscreen"`: To create the hidden document for audio playback.
*   `"declarativeNetRequest"`: To modify HTTP headers (e.g., `Origin`, `User-Agent`) during the WebSocket handshake to successfully authenticate with the Edge TTS service.
*   `"host_permissions"`: To allow injection into specific local domains/IPs (e.g., `"http://localhost/*"`, `"http://127.0.0.1/*"`) and to apply `declarativeNetRequest` rules to `wss://speech.platform.bing.com/*`.

## 6. Edge TTS Implementation Details

The implementation must simulate an Edge browser client. Key elements include:

*   **WebSocket URL:** `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1...`
*   **Header Spoofing:** Standard WebSockets in browsers cannot set headers like `Origin`. The extension will use `chrome.declarativeNetRequest` with dynamic rules to append/modify headers for requests targeting `wss://speech.platform.bing.com/*` so the service accepts the connection as a genuine Edge browser.
*   **Connection ID:** A standard UUID v4 must be generated for each WebSocket connection.
*   **Headers/Parameters:** Requires including specific headers (e.g., `X-Timestamp`, `Content-Type: application/ssml+xml`) in the initial text payloads over the open socket.
*   **Payload Format:** The text must be formatted as SSML (Speech Synthesis Markup Language) before being sent over the WebSocket.
*   **Audio Format:** The extension will explicitly request the `audio-24khz-48kbitrate-mono-mp3` output format in the SSML/config. The extension must handle binary WebSocket messages (MP3 chunks) and stream them to the Offscreen Document.
*   **Text Length Limits:** Edge TTS typically limits payloads. The extension must implement logic to chunk long text (e.g., by sentences or character limit < 1000) and request audio sequentially over the WebSocket.

## 7. Development and Deployment

The extension will be developed locally and deployed manually to the Chromium instance on the Raspberry Pi by enabling "Developer mode" in `chrome://extensions/` and loading the unpacked directory.
