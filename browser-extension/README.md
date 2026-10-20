# WhatsApp Web Call Bridge Extension for Dynamic Island

Manifest V3 browser extension that bridges WhatsApp Web incoming and active calls to the Linux Dynamic Island desktop widget.

## How It Works

1. **DOM Observation**: A `MutationObserver` on `https://web.whatsapp.com` watches for incoming/active call dialogs without reading chat messages or user data.
2. **Contact Metadata**: Extracts the caller name and avatar URL if available in the call dialog.
3. **Local Bridge**: Communicates over loopback HTTP (`127.0.0.1:14425`) with your local Dynamic Island app.
4. **Action Execution**: When you swipe to answer or click decline in Dynamic Island, the extension executes the corresponding action on the page and verifies that the call state changes before reporting success.

---

## Installation (Chromium / Chrome / Brave / Edge)

1. Open your browser and navigate to the Extensions page:
   - Chrome / Brave: `chrome://extensions/`
   - Edge: `edge://extensions/`
2. Enable **Developer mode** (toggle in top-right corner).
3. Click **Load unpacked** (Muat yang belum dibongkar).
4. Select the `~/project/dynamic-island/browser-extension` folder.
5. Click the extension icon in your browser toolbar to open the popup.
6. Copy the session token from:
   ```bash
   cat ~/.config/dynamic-island/session.token
   ```
7. Paste the token into the popup and click **Save & Test Connection**.
8. A green indicator `"Connected to Dynamic Island (127.0.0.1)"` will confirm the connection.

---

## Browser Compatibility

- **Chromium / Google Chrome / Brave / Microsoft Edge**: Fully supported via native Manifest V3.
- **Mozilla Firefox**:
  - Firefox uses a different background script model (`background.scripts`) and strict Content Security Policies on extension-to-localhost connections.
  - Recommended browser for testing and daily use: Chromium or Google Chrome.

---

## Security Features

- **Strict Loopback Binding**: Server binds strictly to `127.0.0.1`. Never exposed to LAN or WAN.
- **Random Session Token**: Generated fresh on each desktop app startup with high entropy.
- **Origin Validation**: Rejects requests whose `Origin` header does not match `https://web.whatsapp.com` or browser extension schemas.
- **Action Expiration & Deduplication**: User actions expire after 15 seconds to prevent replaying stale actions.
- **Payload Size Limits**: Max 64 KB to prevent buffer overruns or denial-of-service.

