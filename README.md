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

### Opening it on a PS5 (no messages, no sign-in)

Don't send links in PSN messages. Sony auto-deletes them and emails a Code of Conduct warning, and
warnings can lead to suspension. This route only uses system menus and public pages. Move the cursor
with the left stick, scroll with the right stick, select with ✕, go back with ○.

1. **Settings → Users and Accounts → Linked Services → YouTube.** If YouTube is already linked, unlink it first.
2. Choose **Link Account**, then **Use Browser** (bottom right). A Google sign-in page opens. **Don't sign in.**
3. Select **Terms** at the bottom of the page. Google's Terms of Service page opens.
4. Scroll to the very bottom and select **Google**. Google's search page opens.
5. Search **github** and select the **github.com** result.
6. On GitHub, select **Search**, type **ps5tv**, confirm, then select **ussa24/ps5tv**.
7. Select **▶ Open the PS5 probe** (top of the page) or the **ussa24.github.io/ps5tv/probe/** link under *About*.

If step 2 has no **Use Browser**: **Settings → Network → Connection Status → View PlayStation Network
Status**, select **Blog** at the bottom, then the **YouTube** icon. In France YouTube first shows "Before you
continue to YouTube": don't accept or reject, just select **Terms** at the very bottom, and you're at step 4.
(Where there's no cookie wall, select **Sign in** instead and continue from step 3.)

Steps 3–7 and the backup route were walked automatically (`tests/entry-route.spec.js`, logged out, with
PS5-like user agents). The console menus in steps 1–2 and the Google search in step 5 can only be
checked on the console.

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
