# AsuraBrowser

An Electron browser shell built for an AI-assisted workflow, with live page rendering, in-memory network inspection, cookie management, and a glass-style interface.

## Setup (Windows)
1. Install Node.js 20 LTS or newer.
2. Extract this folder.
3. Double-click `SETUP.bat` once. It installs dependencies and builds TypeScript.
4. Double-click `START.bat` to launch.

You can also run `npm install`, `npm run build`, then `npm start` from this directory.

For step-by-step guides to browsing and the built-in tools, see the [English user manual](USER_MANUAL_EN.md) or [Hindi user manual](USER_MANUAL_HI.md).

## Privacy model
- Browsing runs in Electron's persistent `asura-browser` session.
- Cookies, cache, local storage and session storage may remain after AsuraBrowser exits. Clear cookies or cache from Settings when needed.
- AsuraBrowser does not maintain a browsing-history database or save passwords.
- Network entries are held in memory. HAR/JSON export is manual, does not include response bodies, and redacts headers such as `Cookie`, `Set-Cookie`, `Authorization` and API-key headers.
- Cookie values are visible by default in the Cookie Manager and can be hidden per cookie. Only add or inspect cookies for accounts and systems you own or are authorized to test. Do not paste someone else's session token.

## AI integration bridge
The trusted renderer exposes `window.asuraBrowser`:

```js
await window.asuraBrowser.navigate('https://example.com');
await window.asuraBrowser.waitForLoad();
const url = window.asuraBrowser.currentUrl();
const title = window.asuraBrowser.pageTitle();
const text = await window.asuraBrowser.visibleText();
const links = await window.asuraBrowser.links();
const requests = await window.asuraBrowser.network();
const cookies = await window.asuraBrowser.cookies();
await window.asuraBrowser.addCookie({
  url: 'https://example.com', name: 'my_session', value: 'YOUR_OWN_VALUE',
  path: '/', secure: true, httpOnly: false, sameSite: 'lax'
});
await window.asuraBrowser.setRequestHeaders({ 'X-Test-Mode': 'true' });
```

The `window.asura` bridge also provides lower-level `network`, `cookies`, `headers`, `rules`, `proxy`, `cache`, `storage`, and `devtools` methods. The bridge is exposed to the trusted app renderer, not as a public network service. To connect an external agent, integrate these calls through your own authenticated local controller; do not expose Electron IPC or a debugging port to the LAN.

## Notes
- Only HTTP and HTTPS navigation is accepted from the address bar.
- Network monitoring observes actual requests from pages loaded in the browser webview. It does not capture traffic from other applications.
- Custom request headers apply to subsequent browser requests until the app exits or they are cleared.
- A website may reject manually supplied cookies or headers due to domain, Secure, SameSite, HttpOnly, expiry, or server-side validation rules.
