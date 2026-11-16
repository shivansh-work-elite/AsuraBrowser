"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const controller_1 = require("./controller");
// Browsing data lives in a persistent Electron session so cookies survive
// restarts. Browsing history is intentionally not recorded; only cookies and
// cache are persisted by Electron's session storage.
const PARTITION = 'persist:asura-browser';
const SECRET = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|authentication)$/i;
function redactHeaders(input = {}) { const out = {}; for (const [k, v] of Object.entries(input))
    out[k] = SECRET.test(k) ? '[REDACTED]' : Array.isArray(v) ? v.join(', ') : String(v); return out; }
class AsuraBrowser {
    constructor() {
        this.win = null;
        this.logs = new Map();
        this.downloads = [];
        this.rules = [];
        this.extraHeaders = {};
        this.proxy = { host: '', port: 8080, scheme: 'http', enabled: false, username: '', password: '' };
        this.debugRequests = new Map();
        this.aiConfigFile = '';
        this.aiEndpoint = '';
        this.aiModel = '';
        this.encryptedAIKey = '';
    }
    async init() { await electron_1.app.whenReady(); this.automation = new controller_1.AsuraAutomationController(electron_1.app.getPath('userData')); await this.automation.start(); this.ses = electron_1.session.fromPartition(PARTITION); this.aiConfigFile = path.join(electron_1.app.getPath('userData'), 'ai-provider.json'); this.loadAIConfig(); this.attachWebviewDebuggers(); electron_1.app.on('login', (event, _contents, details, authInfo, callback) => { if (authInfo.isProxy && this.proxy.enabled && authInfo.host === this.proxy.host && Number(authInfo.port) === this.proxy.port && this.proxy.username) {
        event.preventDefault();
        callback(this.proxy.username, this.proxy.password);
    } }); this.captureNetwork(); this.ipc(); this.createWindow(); this.menu(); electron_1.app.on('activate', () => { if (!electron_1.BrowserWindow.getAllWindows().length)
        this.createWindow(); }); electron_1.app.on('window-all-closed', () => { if (process.platform !== 'darwin')
        electron_1.app.quit(); }); }
    createWindow() { this.win = new electron_1.BrowserWindow({ width: 1500, height: 950, minWidth: 900, minHeight: 600, title: 'AsuraBrowser', backgroundColor: '#090b10', webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, '../preload/preload.js'), webviewTag: true, sandbox: true } }); this.win.loadFile(path.join(__dirname, '../../src/renderer/index.html')); this.win.on('closed', () => this.win = null); }
    captureNetwork() {
        this.ses.on('will-download', (_event, item) => {
            const entry = { id: `${Date.now()}-${item.getFilename()}`, filename: item.getFilename(), path: item.getSavePath(), received: item.getReceivedBytes(), total: item.getTotalBytes(), state: 'progressing', startedAt: Date.now() };
            this.downloads.unshift(entry);
            if (this.downloads.length > 100)
                this.downloads.length = 100;
            const update = () => { entry.path = item.getSavePath(); entry.received = item.getReceivedBytes(); entry.total = item.getTotalBytes(); entry.state = item.getState(); this.win?.webContents.send('downloads:update', entry); };
            item.on('updated', update);
            item.once('done', update);
            update();
        });
        this.ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (d, cb) => { for (const r of this.rules) {
            if (!r.enabled || !this.match(d.url, r.urlPattern))
                continue;
            if (r.action === 'block') {
                cb({ cancel: true });
                return;
            }
            if (r.action === 'redirect' && r.redirectUrl) {
                cb({ redirectURL: r.redirectUrl });
                return;
            }
        } cb({}); });
        this.ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (d, cb) => { const e = { id: d.id, url: d.url, method: d.method, timestamp: Date.now(), type: d.resourceType || 'other', status: 'pending', requestHeaders: redactHeaders(d.requestHeaders) }; this.logs.set(d.id, e); this.win?.webContents.send('network:update', e); const headers = { ...d.requestHeaders, ...this.extraHeaders }; for (const r of this.rules) {
            if (!r.enabled || r.action !== 'modify-headers' || !this.match(d.url, r.urlPattern))
                continue;
            Object.assign(headers, r.addHeaders || {});
            for (const h of r.removeHeaders || [])
                delete headers[h];
        } cb({ requestHeaders: headers }); });
        this.ses.webRequest.onCompleted({ urls: ['*://*/*'] }, d => { const e = this.logs.get(d.id); if (!e)
            return; e.status = d.statusCode; e.statusLine = d.statusLine; e.responseHeaders = redactHeaders(d.responseHeaders); const cl = (d.responseHeaders || {})['content-length'] || (d.responseHeaders || {})['Content-Length']; e.size = Number(Array.isArray(cl) ? cl[0] : cl) || 0; e.duration = Date.now() - e.timestamp; this.win?.webContents.send('network:update', e); });
        this.ses.webRequest.onErrorOccurred({ urls: ['*://*/*'] }, d => { const e = this.logs.get(d.id); if (!e)
            return; e.status = 'error'; e.error = d.error; e.duration = Date.now() - e.timestamp; this.win?.webContents.send('network:update', e); });
    }
    loadAIConfig() {
        try {
            if (!fs.existsSync(this.aiConfigFile))
                return;
            const saved = JSON.parse(fs.readFileSync(this.aiConfigFile, 'utf8'));
            this.aiEndpoint = typeof saved.endpoint === 'string' ? saved.endpoint : '';
            this.aiModel = typeof saved.model === 'string' ? saved.model : '';
            this.encryptedAIKey = typeof saved.encryptedKey === 'string' ? saved.encryptedKey : '';
        }
        catch (error) {
            console.error('Could not load AI provider settings:', error);
        }
    }
    attachWebviewDebuggers() {
        electron_1.app.on('web-contents-created', (_event, contents) => {
            contents.on('did-attach-webview', (_attachEvent, guest) => {
                try {
                    if (guest.debugger.isAttached())
                        return;
                    guest.debugger.attach('1.3');
                    guest.debugger.sendCommand('Network.enable', { maxTotalBufferSize: 5 * 1024 * 1024, maxResourceBufferSize: 256 * 1024 });
                    guest.debugger.on('message', (_event, method, params) => {
                        if (method === 'Network.requestWillBeSent') {
                            const startedAt = Number(params.wallTime) ? Number(params.wallTime) * 1000 : Date.now();
                            const requestId = String(params.requestId), key = `${guest.id}:${requestId}`;
                            this.debugRequests.set(key, { webContents: guest, key, requestId, url: String(params.request?.url || ''), method: String(params.request?.method || 'GET'), startedAt, mimeType: '', finished: false });
                        }
                        else if (method === 'Network.responseReceived') {
                            const request = this.debugRequests.get(`${guest.id}:${params.requestId}`);
                            if (request) {
                                request.mimeType = String(params.response?.mimeType || '');
                                this.linkDebugRequest(request);
                            }
                        }
                        else if (method === 'Network.loadingFinished') {
                            const request = this.debugRequests.get(`${guest.id}:${params.requestId}`);
                            if (request)
                                request.finished = true;
                        }
                        else if (method === 'Network.loadingFailed') {
                            const request = this.debugRequests.get(`${guest.id}:${params.requestId}`);
                            if (request) {
                                request.finished = true;
                                request.error = String(params.errorText || 'The request failed before its response body was available.');
                            }
                        }
                        while (this.debugRequests.size > 500)
                            this.debugRequests.delete(this.debugRequests.keys().next().value);
                    });
                    guest.on('destroyed', () => { for (const [id, request] of this.debugRequests)
                        if (request.webContents === guest)
                            this.debugRequests.delete(id); });
                }
                catch (error) {
                    console.warn('Response preview is unavailable for this page:', error);
                }
            });
        });
    }
    linkDebugRequest(request) {
        let best;
        let distance = 15000;
        for (const entry of this.logs.values()) {
            if (entry.cdpRequestId || entry.url !== request.url || entry.method !== request.method)
                continue;
            const gap = Math.abs(entry.timestamp - request.startedAt);
            if (gap < distance) {
                best = entry;
                distance = gap;
            }
        }
        if (best)
            best.cdpRequestId = request.key;
    }
    async captureResponseBody(id) {
        const entry = this.logs.get(id);
        if (!entry?.cdpRequestId)
            throw new Error('Response body is not available for this request. Reload the page and try again.');
        const request = this.debugRequests.get(entry.cdpRequestId);
        if (!request)
            throw new Error('The selected request is no longer available for preview.');
        const deadline = Date.now() + 2500;
        while (!request.finished && Date.now() < deadline)
            await new Promise(resolve => setTimeout(resolve, 25));
        if (!request.finished)
            throw new Error('Wait for the selected request to finish, then try again.');
        if (request.error)
            throw new Error(request.error);
        if (!/^(text\/|application\/(json|.+\+json|xml|.+\+xml|javascript|x-javascript))/i.test(request.mimeType))
            throw new Error('Response preview is limited to text, JSON, XML, and JavaScript content.');
        const result = await request.webContents.debugger.sendCommand('Network.getResponseBody', { requestId: request.requestId });
        const body = result.base64Encoded ? Buffer.from(result.body, 'base64').toString('utf8') : result.body;
        const limit = 128 * 1024;
        return { body: body.slice(0, limit), truncated: body.length > limit, mimeType: request.mimeType };
    }
    normalizeAIEndpoint(input) {
        let url;
        try {
            url = new URL(input.trim());
        }
        catch {
            throw new Error('Enter a valid AI provider base URL.');
        }
        if (url.username || url.password || url.hash || url.search)
            throw new Error('The provider URL cannot contain credentials, a query, or a fragment.');
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
            throw new Error('Use HTTPS for remote providers; HTTP is allowed only for localhost providers.');
        return url.toString().replace(/\/+$/, '');
    }
    getAIKey() { if (!this.encryptedAIKey)
        return ''; if (!electron_1.safeStorage.isEncryptionAvailable())
        throw new Error('Secure credential storage is unavailable on this system.'); return electron_1.safeStorage.decryptString(Buffer.from(this.encryptedAIKey, 'base64')); }
    getAIConfig() { return { endpoint: this.aiEndpoint, model: this.aiModel, hasApiKey: !!this.encryptedAIKey, configured: !!this.aiEndpoint && !!this.aiModel }; }
    setAIConfig(input) {
        const endpoint = this.normalizeAIEndpoint(input.endpoint || '');
        const model = String(input.model || '').trim();
        if (!model || model.length > 200)
            throw new Error('Enter a model name (up to 200 characters).');
        const apiKey = String(input.apiKey || '');
        if (apiKey.length > 4096)
            throw new Error('The API key is too long.');
        if (apiKey && !electron_1.safeStorage.isEncryptionAvailable())
            throw new Error('Secure credential storage is unavailable on this system.');
        this.aiEndpoint = endpoint;
        this.aiModel = model;
        if (input.clearKey)
            this.encryptedAIKey = '';
        else if (apiKey)
            this.encryptedAIKey = electron_1.safeStorage.encryptString(apiKey).toString('base64');
        fs.mkdirSync(path.dirname(this.aiConfigFile), { recursive: true });
        fs.writeFileSync(this.aiConfigFile, JSON.stringify({ endpoint, model, encryptedKey: this.encryptedAIKey }), { mode: 0o600 });
        return this.getAIConfig();
    }
    clearAIConfig() { this.aiEndpoint = ''; this.aiModel = ''; this.encryptedAIKey = ''; try {
        if (fs.existsSync(this.aiConfigFile))
            fs.unlinkSync(this.aiConfigFile);
    }
    catch (error) {
        throw new Error(`Could not remove AI settings: ${String(error)}`);
    } return true; }
    async requestAI(messages) {
        if (!this.aiEndpoint || !this.aiModel)
            throw new Error('Configure an AI provider and model first.');
        if (!Array.isArray(messages) || !messages.length || messages.length > 12)
            throw new Error('Send between 1 and 12 chat messages.');
        const safeMessages = messages.map(message => { if (!['user', 'assistant'].includes(message.role) || typeof message.content !== 'string')
            throw new Error('Invalid chat message.'); return { role: message.role, content: message.content.slice(0, 8000) }; });
        const endpoint = new URL(this.aiEndpoint);
        endpoint.pathname = (endpoint.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '') || '') + '/chat/completions';
        const payload = JSON.stringify({ model: this.aiModel, messages: [{ role: 'system', content: 'You are AsuraBrowser AI. Answer clearly and help with browser and development questions. For security work, assist only with systems the user owns or is explicitly authorized to test. You do not have browser-control tools; never claim to have performed actions you did not perform.' }, ...safeMessages], max_tokens: 1000, stream: false });
        const client = endpoint.protocol === 'https:' ? https : http;
        const key = this.getAIKey();
        return new Promise((resolve, reject) => {
            const req = client.request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...(key ? { Authorization: `Bearer ${key}` } : {}) }, timeout: 35000 }, res => {
                let response = '';
                res.setEncoding('utf8');
                res.on('data', chunk => { response += chunk; if (response.length > 1024 * 1024)
                    req.destroy(new Error('AI provider response exceeded 1 MB.')); });
                res.on('end', () => { if ((res.statusCode || 500) < 200 || (res.statusCode || 500) >= 300) {
                    reject(new Error(`AI provider returned HTTP ${res.statusCode}: ${response.slice(0, 500)}`));
                    return;
                } try {
                    const data = JSON.parse(response);
                    const content = data.choices?.[0]?.message?.content;
                    if (typeof content !== 'string')
                        throw new Error('Provider response did not contain assistant text.');
                    resolve({ content: content.slice(0, 30000) });
                }
                catch (error) {
                    reject(error);
                } });
            });
            req.on('timeout', () => req.destroy(new Error('AI provider request timed out.')));
            req.on('error', reject);
            req.end(payload);
        });
    }
    async saveImage(dataUrl) {
        const match = /^data:image\/png;base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl);
        if (!match || match[1].length > 28 * 1024 * 1024)
            throw new Error('Screenshot data is invalid or too large.');
        const result = await electron_1.dialog.showSaveDialog(this.win, { defaultPath: 'asura-screenshot.png', filters: [{ name: 'PNG Image', extensions: ['png'] }] });
        if (result.canceled || !result.filePath)
            return { success: false };
        await fs.promises.writeFile(result.filePath, Buffer.from(match[1], 'base64'));
        return { success: true, path: result.filePath };
    }
    async saveEvidenceReport(input) {
        const targets = Array.isArray(input.targets) ? input.targets.slice(0, 100).map(target => { const value = target; return { domain: String(value?.domain || '').slice(0, 253), enabled: value?.enabled === true, added: Number(value?.added) || 0 }; }) : [];
        const requests = Array.isArray(input.requests) ? input.requests.slice(0, 1000).map(raw => {
            const request = raw;
            let url = String(request.url || '');
            try {
                const parsed = new URL(url);
                for (const key of [...parsed.searchParams.keys()])
                    if (/token|key|auth|secret|password|session|signature|code/i.test(key))
                        parsed.searchParams.set(key, '[REDACTED]');
                url = parsed.toString();
            }
            catch { }
            return { id: request.id, url, method: String(request.method || '').slice(0, 32), timestamp: Number(request.timestamp) || 0, type: String(request.type || '').slice(0, 40), status: request.status, statusLine: request.statusLine, requestHeaders: redactHeaders(request.requestHeaders || {}), responseHeaders: redactHeaders(request.responseHeaders || {}), duration: request.duration, size: request.size, error: request.error };
        }) : [];
        const report = { application: 'AsuraBrowser', version: electron_1.app.getVersion(), generatedAt: new Date().toISOString(), notice: 'Passive browser evidence only. This report is not a vulnerability assessment; test only systems you own or are authorized to assess.', authorizedScope: targets, requests };
        const result = await electron_1.dialog.showSaveDialog(this.win, { defaultPath: 'asura-evidence.json', filters: [{ name: 'JSON Evidence Report', extensions: ['json'] }] });
        if (result.canceled || !result.filePath)
            return { success: false };
        await fs.promises.writeFile(result.filePath, JSON.stringify(report, null, 2), 'utf8');
        return { success: true, path: result.filePath };
    }
    match(url, p) { try {
        return new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')).test(url);
    }
    catch {
        return url.includes(p);
    } }
    ipc() {
        electron_1.ipcMain.handle('network:get', () => Array.from(this.logs.values(), ({ cdpRequestId, ...entry }) => entry));
        electron_1.ipcMain.handle('network:clear', () => { this.logs.clear(); return true; });
        electron_1.ipcMain.handle('network:capture-body', (_, id) => this.captureResponseBody(id));
        electron_1.ipcMain.handle('downloads:get', () => this.downloads);
        electron_1.ipcMain.handle('network:export', async (_, fmt) => { const result = await electron_1.dialog.showSaveDialog(this.win, { defaultPath: `asura-network.${fmt}`, filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }] }); if (result.canceled || !result.filePath)
            return { success: false }; const logs = Array.from(this.logs.values()); const data = fmt === 'json' ? JSON.stringify(logs, null, 2) : JSON.stringify({ log: { version: '1.2', creator: { name: 'AsuraBrowser', version: '1.0.0' }, entries: logs.map(e => ({ startedDateTime: new Date(e.timestamp).toISOString(), time: e.duration || 0, request: { method: e.method, url: e.url, httpVersion: 'HTTP/1.1', headers: Object.entries(e.requestHeaders || {}).map(([name, value]) => ({ name, value })), headersSize: -1, bodySize: -1 }, response: { status: typeof e.status === 'number' ? e.status : 0, statusText: e.statusLine || '', httpVersion: 'HTTP/1.1', headers: Object.entries(e.responseHeaders || {}).map(([name, value]) => ({ name, value: String(value) })), content: { size: 0, mimeType: '' }, headersSize: -1, bodySize: -1 }, cache: {}, timings: { send: 0, wait: e.duration || 0, receive: 0 } })) } }, null, 2); fs.writeFileSync(result.filePath, data); return { success: true, path: result.filePath }; });
        electron_1.ipcMain.handle('cookies:get', (_, url) => this.ses.cookies.get(url ? { url } : {}));
        electron_1.ipcMain.handle('cookies:set', async (_, c) => { await this.ses.cookies.set(c); return true; });
        electron_1.ipcMain.handle('cookies:remove', async (_, url, name) => { await this.ses.cookies.remove(url, name); return true; });
        electron_1.ipcMain.handle('cookies:clear', async () => { await this.ses.clearStorageData({ storages: ['cookies'] }); return true; });
        electron_1.ipcMain.handle('proxy:set', async (_, c) => {
            const host = String(c.host || '').trim().replace(/^\[|\]$/g, '');
            const port = Number(c.port);
            const scheme = ['http', 'https', 'socks5'].includes(c.scheme || 'http') ? c.scheme || 'http' : 'http';
            if (c.enabled && (!host || host.includes('://') || /[\s/@;]/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535))
                throw new Error('Enter a valid proxy host and port.');
            if (c.enabled) {
                await this.ses.setProxy({ proxyRules: `${scheme}://${host.includes(':') ? `[${host}]` : host}:${port}` });
                this.proxy = { host, port, scheme, enabled: true, username: String(c.username || ''), password: String(c.password || '') };
            }
            else {
                await this.ses.setProxy({ proxyRules: 'direct://' });
                this.proxy = { host, port: 8080, scheme: 'http', enabled: false, username: '', password: '' };
            }
            await this.ses.closeAllConnections();
            return this.proxy;
        });
        electron_1.ipcMain.handle('proxy:get', () => ({ host: this.proxy.host, port: this.proxy.port, scheme: this.proxy.scheme, enabled: this.proxy.enabled, hasCredentials: !!this.proxy.username }));
        electron_1.ipcMain.handle('rules:get', () => this.rules);
        electron_1.ipcMain.handle('rules:set', (_, r) => { this.rules = Array.isArray(r) ? r : []; return true; });
        electron_1.ipcMain.handle('headers:set', (_, h) => { this.extraHeaders = h && typeof h === 'object' ? h : {}; return true; });
        electron_1.ipcMain.handle('headers:get', () => this.extraHeaders);
        electron_1.ipcMain.handle('cache:clear', () => this.ses.clearCache());
        electron_1.ipcMain.handle('storage:clear', (_, type) => { const allowed = ['cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']; if (!allowed.includes(type))
            throw new Error('Unsupported storage type'); return this.ses.clearStorageData({ storages: [type] }); });
        electron_1.ipcMain.handle('storage:clear-origin', (_, origin) => { let parsed; try {
            parsed = new URL(origin);
        }
        catch {
            throw new Error('Invalid storage origin.');
        } if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin)
            throw new Error('Storage can only be cleared for an HTTP or HTTPS origin.'); return this.ses.clearStorageData({ origin, storages: ['indexdb', 'localstorage', 'cachestorage'] }); });
        electron_1.ipcMain.handle('ua:set', (_, ua) => { if (typeof ua !== 'string' || ua.trim().length < 5 || ua.length > 1024)
            throw new Error('Enter a valid User-Agent string.'); this.ses.setUserAgent(ua.trim()); return true; });
        electron_1.ipcMain.handle('devtools:open', () => this.win?.webContents.openDevTools({ mode: 'detach' }));
        electron_1.ipcMain.handle('clipboard:write', (_, v) => electron_1.clipboard.writeText(v));
        electron_1.ipcMain.handle('screenshot:save', (_, dataUrl) => this.saveImage(dataUrl));
        electron_1.ipcMain.handle('evidence:save', (_, input) => this.saveEvidenceReport(input || {}));
        electron_1.ipcMain.handle('ai:config:get', () => this.getAIConfig());
        electron_1.ipcMain.handle('ai:config:set', (_, input) => this.setAIConfig(input));
        electron_1.ipcMain.handle('ai:config:clear', () => this.clearAIConfig());
        electron_1.ipcMain.handle('ai:chat', (_, messages) => this.requestAI(messages));
    }
    menu() { const send = (p) => () => this.win?.webContents.send('panel:open', p); electron_1.Menu.setApplicationMenu(electron_1.Menu.buildFromTemplate([{ label: 'AsuraBrowser', submenu: [{ label: 'About AsuraBrowser', role: 'about' }, { type: 'separator' }, { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => electron_1.app.quit() }] }, { label: 'Tools', submenu: [{ label: 'Network Monitor', accelerator: 'CmdOrCtrl+Shift+N', click: send('network') }, { label: 'Cookie Manager', accelerator: 'CmdOrCtrl+Shift+K', click: send('cookies') }, { label: 'Headers', click: send('headers') }, { label: 'DevTools', accelerator: 'F12', click: () => this.win?.webContents.openDevTools() }] }, { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] }])); }
}
if (electron_1.app.requestSingleInstanceLock()) {
    new AsuraBrowser().init().catch((error) => { console.error('AsuraBrowser startup failed:', error); electron_1.app.quit(); });
}
else {
    electron_1.app.quit();
}
//# sourceMappingURL=main.js.map