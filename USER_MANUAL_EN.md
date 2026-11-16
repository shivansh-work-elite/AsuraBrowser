# AsuraBrowser — User Manual

This guide covers everyday browsing and the tools available in the current AsuraBrowser build. It distinguishes live functionality from passive analysis so you know exactly what each tool does.

## Contents

1. [Getting started](#1-getting-started)
2. [Understanding the window](#2-understanding-the-window)
3. [Browsing and tabs](#3-browsing-and-tabs)
4. [Developer Workspace](#4-developer-workspace)
5. [Network Monitor and Response Preview](#5-network-monitor-and-response-preview)
6. [API Explorer](#6-api-explorer)
7. [Cookies and Bookmarks](#7-cookies-and-bookmarks)
8. [Console, DOM, and Storage](#8-console-dom-and-storage)
9. [Request Editor and Interceptor](#9-request-editor-and-interceptor)
10. [Security Lab and Evidence Reports](#10-security-lab-and-evidence-reports)
11. [Configuring ASURA AI](#11-configuring-asura-ai)
12. [Proxy, User-Agent, and Downloads](#12-proxy-user-agent-and-downloads)
13. [Privacy and authorized use](#13-privacy-and-authorized-use)
14. [Troubleshooting](#14-troubleshooting)
15. [Current limitations](#15-current-limitations)

## 1. Getting started

### Windows

1. Install Node.js 20 LTS or later.
2. Open the AsuraBrowser folder.
3. Run `SETUP.bat` once and wait for setup to finish.
4. Run `START.bat` to launch the browser.
5. Close the app using the normal window close control.

To run from a terminal in the project folder instead, run `npm install`, `npm run build`, and `npm start`.

## 2. Understanding the window

- **Title and tab bar:** app branding, open tabs, and the `+` new-tab button.
- **Navigation bar:** Back, Forward, Reload, Stop, Home, the address/search field, Bookmark, Downloads, and Settings.
- **Left sidebar:** Browser, AI Workspace, Network, API Explorer, DOM Inspector, Storage, Cookies, Bookmarks, Security Lab, Downloads, and Settings. Use the bottom arrow to collapse or expand the sidebar.
- **Website viewport:** the main center area renders the actual website.
- **ASURA AI panel:** shows the current page and real browser activity; configure an AI provider here to enable chat.
- **Developer Workspace:** the bottom panel contains Network and other tools. Drag its top edge to resize it, or press `WORKSPACE` to hide/show it.
- **Status bar:** loading/security status, request information, proxy and User-Agent labels, and page zoom.

On a smaller screen, collapse the sidebar, AI panel, or Developer Workspace to give the page more room. The `−` and `+` zoom controls adjust page zoom from 50% to 150%; clicking the percentage resets it to 90%.

### Keyboard shortcuts (Windows/Linux)

- `Ctrl+Shift+N` — open Network Monitor.
- `Ctrl+Shift+K` — open Cookies.
- `F12` — open Electron Developer Tools.
- `Ctrl+Q` — quit AsuraBrowser.

## 3. Browsing and tabs

### Open a website or search

1. Click the address/search field.
2. Enter a full URL, such as `https://example.com`, or type search terms.
3. Press `Enter` or click the Go arrow.

A hostname such as `example.com` without a scheme is opened using HTTPS. Other text is searched using the selected engine. Choose DuckDuckGo, Google, or Bing from Settings; the search-engine icon in the address bar cycles through the engines.

### Navigation

- **Back / Forward:** move through the active tab's navigation history when available.
- **Reload:** reload the current website.
- **Stop:** stop an in-progress navigation.
- **Home:** navigate to DuckDuckGo.
- **Bookmark (☆):** save the current URL; click again to remove the bookmark.

### Tabs

- Select `+` to open a new tab.
- Click a tab to switch to it.
- Select the tab's `×` to close it. The last open tab cannot be closed.

Tabs show the website title and, when available, its favicon. Each tab has its own website view.

## 4. Developer Workspace

The main workspace tabs are **Network**, **Console**, **Elements**, **Cookies**, and **Request Editor**. Open **More tools** for **Interceptor**, **Proxy**, **User-Agent**, **Settings**, **Security Lab**, **Automation**, **Downloads**, **Request Details**, **API Explorer**, **Storage**, and **Bookmarks**.

The workspace toolbar's **Export HAR** button saves captured request metadata to a HAR file. **Clear** clears the in-memory Network list; it does not clear cookies or site storage.

## 5. Network Monitor and Response Preview

The Network Monitor lists real HTTP/HTTPS requests from pages opened in AsuraBrowser. It does not monitor traffic from other applications.

### Find requests

- Type a URL, method, or status into the filter field.
- Select **All**, **Document**, **JS**, **CSS**, **Image**, **XHR**, **Fetch**, or **WS** to filter by resource type.
- The table shows Method, Status, Domain, Path, Type, Size, and Time.
- Select a row to inspect its request details.

### Inspect details

**Headers** shows the URL, method, status, and captured request/response headers. Sensitive headers such as Cookie, Authorization, and API-key headers are redacted. **Timing** shows the start time and elapsed duration. A request may show `pending` until it completes.

### Load a response preview

1. Select a completed request.
2. Select the **Response** details tab.
3. Click **Load response body**.

The preview loads the response for that captured request from the browser's page session. It is user-initiated, limited to text, JSON, XML, and JavaScript MIME types, and capped at 128 KB. Binary resources and responses that Chromium has already discarded cannot be previewed; the panel explains when the body is unavailable. Response bodies are not included in the HAR export.

### Export HAR

1. Select **Export HAR**.
2. Choose a file name and save location in the dialog.
3. Review the saved file before sharing it: request URLs and metadata may be sensitive.

## 6. API Explorer

The API Explorer groups endpoints that AsuraBrowser has already observed in Network Monitor.

1. Browse a website so real requests are captured.
2. Open **API Explorer** from the sidebar or **More tools**.
3. Filter by domain, path, or method.
4. Select an endpoint to see observed methods, statuses, resource types, request count, and last-observed time.

This is passive discovery only. It does not scan domains, probe undocumented routes, infer schemas, replay requests, or send extra traffic. Query strings are grouped with their pathname and are not shown in the endpoint list.

## 7. Cookies and Bookmarks

### Cookie Manager

The Cookies panel shows cookies for the **Current site** or, when selected, **All domains**.

- Search by cookie name, value, domain, or path.
- Values are visible by default. Choose **Hide** to mask one value and **Show** to reveal it again.
- **Copy** copies the cookie name and value.
- **Edit** opens a prompt to replace its value.
- **Del** removes the selected cookie.
- **+ Add Cookie** adds a `name=value` cookie for the current HTTP/HTTPS website.

Rows include domain, path, expiry, Secure, HttpOnly, and SameSite information. **Clear Cookies** in Settings removes cookies for the entire browser profile and may sign you out of websites. Only inspect or change cookies for accounts and systems you own or are authorized to test.

### Bookmarks

1. While viewing a page, click the `☆` toolbar button.
2. Open **Bookmarks** in the sidebar or **More tools**.
3. Use **Open** to revisit a saved address or **Remove** to delete it.
4. Search the list by title or URL.

Bookmarks are kept in the app's local renderer storage and are not synchronized to another device.

## 8. Console, DOM, and Storage

### Console

Console automatically receives browser-page console messages from AsuraBrowser tabs, including log, info, warning, and error messages. It retains up to 500 displayed entries at a time.

To evaluate a JavaScript expression on the active page, enter it in the Console input and press `Enter` or **RUN**. A website must be loaded first. The expression runs in that page's context and is subject to that page's permissions; do not run code you do not trust.

### Elements / DOM Inspector

Load a website, then use:

- **Inspect Page** — view up to 10,000 characters of the page's HTML.
- **Links** — list up to 200 links found on the page.
- **Forms** — list up to 100 forms and their fields.
- **Screenshot** — open a save dialog and write the current page snapshot as a PNG file.

### Storage

Storage inspects the active page's **current origin** only. **Refresh** lists its Local Storage and Session Storage key/value pairs, IndexedDB database names, and Cache Storage names. Values may contain private information.

**Clear current-site storage** asks for confirmation, then clears Local Storage, Session Storage, the current origin's IndexedDB databases, and Cache Storage. It temporarily navigates the tab away to release open database connections, then reloads the page; unsaved form data may be lost. This can sign you out or reset that site's settings. It does not clear cookies; use Cookies or Settings for that.

## 9. Request Editor and Interceptor

### Request Editor

1. Open **Request Editor**.
2. Select a method: GET, POST, PUT, PATCH, DELETE, HEAD, or OPTIONS.
3. Enter a complete URL. Optionally enter request headers as a JSON object and a request body.
4. Select **Send Request**, then read the status and response below.
5. **Clear** resets the editor.

Only send requests to endpoints you own or have written authorization to test. Browser CORS rules or the server may reject a request. Response text is limited to 5,000 characters. The editor does not have a separate cookie editor or an authentication workflow.

### Interceptor

Create a URL-pattern rule to **Block**, **Redirect**, or **Modify Headers** on matching browser requests. Use `*` as a wildcard. Toggle a rule to enable/disable it or select **Del** to remove it. A bad rule can prevent a website from loading. Rules are held in memory and may need to be recreated after restarting the app.

## 10. Security Lab and Evidence Reports

- **Target** adds an authorized target label to the local scope list.
- **View Scope** displays the saved labels.
- **Analyze Endpoints** summarizes domains already present in the Network Monitor.
- **Save Evidence** opens a dialog and writes a JSON report containing up to 1,000 captured request records, the target labels, and a timestamp.

The evidence report is passive browser evidence, not a vulnerability assessment. It contains no response bodies; common sensitive query parameter values and sensitive headers are redacted. Review the file for URLs or other private metadata before sharing it. Target labels do not restrict or enforce browser traffic. Obtain explicit permission before testing any system.

## 11. Configuring ASURA AI

ASURA AI connects to a provider that implements the OpenAI-compatible `/chat/completions` API. No provider or API key is bundled.

1. Expand **Configure AI provider** in the right-hand AI panel.
2. Enter the provider base URL, for example `https://api.openai.com/v1`.
3. Enter the model name expected by that provider.
4. Enter the API key if the provider requires one. For a local provider, a key may be omitted.
5. Select **Save & test**. AsuraBrowser saves the configuration and sends a short test message to verify the provider.
6. Once the panel reports that the provider is responding, use the chat field to ask questions.
7. **Disconnect** removes the saved provider settings and encrypted API key.

Remote providers must use HTTPS. HTTP is allowed only for `localhost` providers. API keys are encrypted with Electron's operating-system secure-storage facility and are never returned to the renderer after saving. If secure storage is unavailable, the app reports an error instead of saving the key.

Chat history is held in memory for the current window and is sent to the configured provider when you send a message. The current page title and URL are not shared unless you enable **Include current page title and URL**. The assistant can answer questions but has no browser-control tools; it cannot navigate, inspect pages, or perform tasks for you.

The panel's **Pause**, **Stop**, and **Take Control** buttons apply to the browser automation queue; they do not pause or control the AI chat request.

## 12. Proxy, User-Agent, and Downloads

### Proxy

1. Open **Proxy** under **More tools**.
2. Select HTTP, HTTPS, or SOCKS5, then enter the proxy host and port.
3. If required, enter proxy credentials.
4. Select **Apply Proxy Config**. Use the on/off toggle to enable or return to a direct connection.

Proxy settings are applied to AsuraBrowser's Electron session and affect browser traffic. Proxy credentials remain in memory and are not persisted to disk; closing the app clears them. A browser restart is required to begin with the direct-connection default. Verify the proxy endpoint is reachable before relying on it.

### User-Agent

Open **User-Agent** under **More tools**, choose a preset, or enter a custom string and select **Apply**. The selected value is applied to subsequent session requests. Some websites may behave differently when a User-Agent is changed.

### Downloads

Select the toolbar download button or sidebar **Downloads** item to see filenames, progress, size, and status for downloads. Download files only from sites you trust.

## 13. Privacy and authorized use

- Browser cookies and site storage use a persistent browser profile and can remain after the app closes. Clear the appropriate data from the relevant panels when needed.
- AsuraBrowser does not maintain a browsing-history database. Network records are held in memory and are cleared when the app exits; HAR and evidence exports are saved only when you request them.
- The HTTPS indicator describes the page URL's protocol; it is not a full assessment of whether a site is safe or trustworthy.
- Network Monitor captures traffic from AsuraBrowser pages only, not from other applications.
- Response previews and Storage can expose page data. Use them only for accounts and sites you are permitted to inspect.
- Never share another person's session cookie or access token.

## 14. Troubleshooting

| Problem | What to try |
|---|---|
| Search or navigation does not work | Enter the address/search field and press `Enter`. Check the spelling and connection; select **Retry** if a navigation error appears. |
| Page is blank or stuck | Select **Reload** and check whether the website is reachable. |
| Back/Forward is disabled | That tab has no earlier or later navigation entry in that direction yet. |
| Network list is empty | Reload a site, clear any active filters, and check that actual page requests have occurred. |
| API Explorer shows no endpoints | Browse a website first; the Explorer does not send discovery requests. |
| Response preview is unavailable | Wait for the request to finish. Only text/JSON/XML/JavaScript bodies are supported, and Chromium may discard old bodies. |
| Storage panel is empty | Open a website, select the active browser tab, then press **Refresh**. Storage is shown per origin. |
| AI test fails | Check the provider URL, model, key, network connection, and HTTPS certificate. Review the error displayed under the provider settings. |
| Proxy cannot connect | Verify the proxy scheme, host, port, and credentials; turn the proxy off to restore direct access. |
| Developer Workspace is hidden | Select `WORKSPACE` above the bottom panel. |

## 15. Current limitations

- API Explorer is intentionally passive and does not infer schemas, replay requests, or probe additional URLs.
- The AI provider must be supplied and configured by the user; AI chat itself does not control the browser.
- Screenshot files are PNG captures of the visible page viewport, not a full-page scrolling capture.
- The Response panel only previews a bounded set of textual response types; it is not a body-capture archive.
- Security Lab is not a vulnerability scanner or scope-enforcement boundary.
- The Request Editor does not provide an authentication manager or full response formatting workspace.
- Proxy and User-Agent settings apply to the running session and may reset when AsuraBrowser closes.
