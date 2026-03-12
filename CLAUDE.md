# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome Extension (Manifest V3) that proxies Edge TTS requests from a local web app running on a Raspberry Pi. It connects to Microsoft's Bing Speech WebSocket service (`wss://speech.platform.bing.com`) and plays synthesized audio via an offscreen document. No build step — plain JavaScript loaded directly as an unpacked extension.

## Development

**No build system.** Source files in `src/` are loaded directly by Chrome/Chromium.

- Install to browser: `chrome://extensions/` → Developer mode → Load unpacked → select `src/`
- Test scripts (Node.js): `node test-tts.js`, `node test-tts-gec.js`, `node test-tts-headers.js`
- No linter, no bundler, no test framework configured

## Architecture

Four-layer message-passing pipeline:

```
inject.js (page context) ──postMessage──► content.js ──chrome.runtime──► background.js ──chrome.runtime──► offscreen.js
                                                                                                              │
                                                                                                    WebSocket to Bing TTS
                                                                                                              │
Events flow back the same path: offscreen → background → content → inject (resolves/rejects Promise)
```

### Components

| File | Context | Role |
|------|---------|------|
| `src/inject.js` | Page JS context | Exposes `window.edgeTTS.speak(text, opts)` / `.stop()` API via Promises |
| `src/content.js` | Content script | Bridge between page and extension; injects `inject.js` |
| `src/background.js` | Service worker | Routes messages, manages offscreen document lifecycle, tracks active tab/request |
| `src/offscreen.js` | Offscreen document | Core TTS engine: WebSocket connection, SEC-MS-GEC token generation, MP3 streaming via Media Source Extensions |
| `src/offscreen.html` | Hidden DOM | Minimal HTML that loads `offscreen.js` for audio playback |
| `src/rules.json` | declarativeNetRequest | Spoofs Origin and User-Agent headers on Bing WebSocket requests |
| `src/manifest.json` | Extension config | Manifest V3 with permissions: scripting, offscreen, declarativeNetRequest |

### Key Implementation Details

- **Auth token**: `offscreen.js` generates SEC-MS-GEC token via SHA-256 hash (Web Crypto API) with a time-rounded value
- **Audio streaming**: Uses MediaSource + SourceBuffer to append MP3 chunks as they arrive from WebSocket
- **Interrupt-and-replace**: New `speak()` call interrupts any in-progress playback
- **Default voice**: `es-MX-DaliaNeural` (Mexican Spanish)
- **Audio format**: `audio-24khz-48kbitrate-mono-mp3`
- **SSML**: Text is wrapped in SSML before sending; XML special chars must be escaped

### Public API (for consuming web apps)

```js
await window.edgeTTS.speak('Texto a hablar', {
  voice: 'es-MX-DaliaNeural',  // optional
  rate: '+0%',                   // optional
  pitch: '+0Hz'                  // optional
});
await window.edgeTTS.stop();
```

## Deployment

Unpacked extension loaded manually on Raspberry Pi Chromium via Developer mode. No store publishing.
