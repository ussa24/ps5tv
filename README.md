# PS5 TV

## ▶ [Open the PS5 probe](https://ussa24.github.io/ps5tv/probe/)

A live-TV web player for the stock PS5 browser, driven by the DualSense. No jailbreak, no homebrew.

**Status:** phase 2. Only the console probe is live; the player gets built from what the probe reports.

## Probe

`site/probe/` checks what the PS5's hidden WebKit browser can actually do: codecs, MSE, native HLS,
hls.js, mpegts.js, mixed content, CORS, controller key and gamepad mapping, fullscreen, storage
persistence across reboots, and large-playlist performance. It then shows the results as a QR code
to scan with a phone.

It only plays public test streams. It never asks for or sends IPTV credentials.

Decode a pasted result:

```
node tools/decode.js "PS5P1Z:..."
```

## Tests

```
npm test
```

Runs the probe end to end in Playwright WebKit (with an approximate PS5 user agent) and in Edge, which
has H.264, to check the playback paths.
