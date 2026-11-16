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
exports.AsuraAutomationController = void 0;
const electron_1 = require("electron");
const node_crypto_1 = require("node:crypto");
const node_net_1 = require("node:net");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
const MAX_FRAME_BYTES = 16 * 1024 * 1024;
const MAX_NETWORK_ENTRIES = 1000;
const SENSITIVE_NAME = /(?:authorization|cookie|token|jwt|secret|password|passwd|api.?key|access.?key|session|csrf|credential|signature)/i;
const ACTIONS = new Set([
    "health", "cancel", "ensure", "close", "status", "navigate", "back", "forward", "reload", "snapshot", "title", "text", "links",
    "forms", "click", "type", "press", "select", "hover", "scroll", "wait", "screenshot", "eval", "tabs",
    "new_tab", "close_tab", "switch_tab", "console", "websocket", "cookies", "storage", "network",
    "network_clear", "profiles", "cookies_set", "control",
]);
function controllerPaths() {
    const suffix = (0, node_crypto_1.createHash)("sha256").update(os.homedir().toLowerCase()).digest("hex").slice(0, 16);
    const directory = path.join(os.tmpdir(), `asurabrowser-${suffix}`);
    return {
        directory,
        info: path.join(directory, "controller.json"),
        address: process.platform === "win32" ? `\\\\.\\pipe\\asurabrowser-${suffix}` : path.join(directory, "controller.sock"),
    };
}
function digest(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
function safeUrl(value) {
    try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol))
            return "";
        url.username = "";
        url.password = "";
        for (const key of [...url.searchParams.keys()]) {
            if (SENSITIVE_NAME.test(key))
                url.searchParams.set(key, "[REDACTED]");
        }
        return url.toString().slice(0, 4096);
    }
    catch {
        return "";
    }
}
function safeHeaders(input) {
    const output = {};
    for (const [name, raw] of Object.entries(input ?? {}).slice(0, 64)) {
        const value = Array.isArray(raw) ? raw.join(", ") : String(raw ?? "");
        if (/^set-cookie$/i.test(name)) {
            output[name.toLowerCase()] = value
                .split(/,(?=[^;,]+=)/)
                .map((cookie) => cookie.replace(/^(\s*[^=;,\s]+)=([^;]*)/, "$1=[REDACTED]"))
                .join(", ")
                .slice(0, 2048);
        }
        else {
            output[name.toLowerCase()] = (SENSITIVE_NAME.test(name) ? "[REDACTED]" : value).slice(0, 2048);
        }
    }
    return output;
}
function asString(value, name, limit = 20000) {
    if (typeof value !== "string" || value.length > limit)
        throw new Error(`${name} must be a string no longer than ${limit} characters`);
    return value;
}
function validUrl(value) {
    const raw = asString(value, "url", 8192);
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        throw new Error("URL must be absolute HTTP or HTTPS");
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
        throw new Error("Only HTTP(S) URLs without embedded credentials are supported");
    }
    return url.toString();
}
function quote(value) {
    return JSON.stringify(value);
}
function boundedPush(list, value) {
    list.push(value.slice(0, 2000));
    if (list.length > 500)
        list.splice(0, list.length - 500);
}
function constantTimeEqual(left, right) {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && (0, node_crypto_1.timingSafeEqual)(a, b);
}
class AsuraAutomationController {
    constructor(userDataPath) {
        this.userDataPath = userDataPath;
        this.paths = controllerPaths();
        this.token = (0, node_crypto_1.randomBytes)(32).toString("hex");
        this.sessions = new Map();
        this.operations = new Map();
        this.sessionStorageListener = (event, action, data) => this.handleSessionStorage(event, action, data);
    }
    async start() {
        fs.mkdirSync(this.paths.directory, { recursive: true, mode: 0o700 });
        electron_1.ipcMain.on("asura:profile:session-storage", this.sessionStorageListener);
        const server = (0, node_net_1.createServer)((socket) => this.accept(socket));
        this.server = server;
        try {
            fs.unlinkSync(this.paths.address);
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
        }
        await new Promise((resolve, reject) => {
            const onError = (error) => reject(error);
            server.once("error", onError);
            server.listen(this.paths.address, () => {
                server.off("error", onError);
                resolve();
            });
        });
        const info = JSON.stringify({ version: 1, address: this.paths.address, token: this.token });
        fs.writeFileSync(this.paths.info, info, { encoding: "utf8", mode: 0o600 });
        electron_1.app.on("will-quit", () => void this.stop());
    }
    async stop() {
        electron_1.ipcMain.removeListener("asura:profile:session-storage", this.sessionStorageListener);
        for (const entry of this.sessions.values()) {
            for (const tab of entry.tabs)
                if (!tab.window.isDestroyed())
                    tab.window.destroy();
        }
        this.sessions.clear();
        if (this.server) {
            const server = this.server;
            this.server = undefined;
            await new Promise((resolve) => server.close(() => resolve()));
        }
        try {
            const info = JSON.parse(fs.readFileSync(this.paths.info, "utf8"));
            if (info.token === this.token)
                fs.unlinkSync(this.paths.info);
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
        }
        if (process.platform !== "win32") {
            try {
                fs.unlinkSync(this.paths.address);
            }
            catch (error) {
                if (error.code !== "ENOENT")
                    throw error;
            }
        }
    }
    accept(socket) {
        socket.setEncoding("utf8");
        let pending = "";
        let queue = Promise.resolve();
        socket.on("data", (chunk) => {
            pending += chunk;
            if (Buffer.byteLength(pending) > MAX_FRAME_BYTES) {
                socket.destroy(new Error("Controller request exceeds the maximum frame size"));
                return;
            }
            let newline;
            while ((newline = pending.indexOf("\n")) >= 0) {
                const line = pending.slice(0, newline);
                pending = pending.slice(newline + 1);
                queue = queue.then(async () => {
                    let id;
                    try {
                        const request = JSON.parse(line);
                        id = typeof request?.id === "string" ? request.id : undefined;
                        const response = await this.dispatch(request);
                        socket.write(`${JSON.stringify({ id: request.id, ok: true, result: response })}\n`);
                    }
                    catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        socket.write(`${JSON.stringify({ id, ok: false, error: message.slice(0, 2000) })}\n`);
                    }
                });
            }
        });
    }
    async dispatch(request) {
        if (!request || typeof request !== "object" || typeof request.id !== "string" || request.id.length > 80) {
            throw new Error("Malformed controller request");
        }
        if (typeof request.token !== "string" || !constantTimeEqual(request.token, this.token)) {
            throw new Error("Controller authentication failed");
        }
        if (!ACTIONS.has(request.action))
            throw new Error("Unsupported controller action");
        if (request.action === "health")
            return { version: 1 };
        if (request.action === "profiles")
            return this.profileOperation(request.args ?? {});
        const key = asString(request.key, "session key", 512);
        if (!key.trim())
            throw new Error("Session key is required");
        if (request.action === "cancel") {
            const target = asString(request.args?.operationId, "operation ID", 80);
            this.operations.get(`${key}:${target}`)?.abort();
            const entry = this.sessions.get(key);
            entry?.tabs[entry.activeTab]?.window.webContents.stop();
            return true;
        }
        if (request.action === "close") {
            const current = this.sessions.get(key);
            if (!current)
                return false;
            this.sessions.delete(key);
            for (const tab of current.tabs)
                if (!tab.window.isDestroyed())
                    tab.window.close();
            return true;
        }
        let entry = this.sessions.get(key);
        if (request.action === "ensure" && !entry) {
            entry = await this.createSession(key, request.headless !== false);
            this.sessions.set(key, entry);
        }
        if (!entry)
            throw new Error("AsuraBrowser session is not open; use action=open first");
        const operationId = `${key}:${request.id}`;
        const controller = new AbortController();
        this.operations.set(operationId, controller);
        try {
            return await this.runExclusive(entry, () => this.execute(entry, request, controller.signal));
        }
        finally {
            this.operations.delete(operationId);
        }
    }
    async createSession(key, headless) {
        const profileId = digest(key).slice(0, 40);
        const partition = `persist:eliteasura-${profileId}`;
        const ses = electron_1.session.fromPartition(partition);
        const entry = {
            key, partition, session: ses, tabs: [], activeTab: 0, headless, owner: "ai", lease: (0, node_crypto_1.randomBytes)(16).toString("hex"),
            network: new Map(), startedAt: new Map(), redirectFrom: new Map(), redirectPending: new Set(),
            requestRecords: new Map(), requestSequence: 0, console: [], websocket: [], closeEvents: [],
        };
        this.attachNetwork(entry);
        this.createWindow(entry, headless);
        return entry;
    }
    createWindow(entry, headless) {
        const window = new electron_1.BrowserWindow({
            width: 1280, height: 800, show: !headless, title: "AsuraBrowser",
            webPreferences: {
                contextIsolation: true, nodeIntegration: false, sandbox: true, partition: entry.partition,
                preload: path.join(__dirname, "automation-preload.js"),
            },
        });
        const tab = { window, url: "about:blank", title: "New Tab" };
        entry.tabs.push(tab);
        entry.activeTab = entry.tabs.length - 1;
        window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
            boundedPush(entry.console, `${level} ${sourceId}:${line} ${message}`);
        });
        window.webContents.on("did-navigate", (_event, url) => { tab.url = safeUrl(url) || "about:blank"; });
        window.webContents.on("page-title-updated", (_event, title) => { tab.title = title.slice(0, 500); });
        window.webContents.on("render-process-gone", (_event, details) => {
            for (const listener of entry.closeEvents)
                listener(`Renderer crashed: ${details.reason}`);
        });
        const debuggerApi = window.webContents.debugger;
        debuggerApi.attach("1.3");
        void debuggerApi.sendCommand("Network.enable").catch((error) => {
            console.warn("AsuraBrowser could not enable native WebSocket observation:", error);
        });
        debuggerApi.on("message", (_event, method, params) => {
            if (method === "Network.webSocketCreated") {
                boundedPush(entry.websocket, `opened ${safeUrl(String(params.url ?? "")) || "[invalid URL]"}`);
            }
            else if (method === "Network.webSocketClosed") {
                boundedPush(entry.websocket, `closed ${String(params.requestId ?? "unknown").slice(0, 80)}`);
            }
        });
        window.on("closed", () => {
            const index = entry.tabs.findIndex((value) => value.window === window);
            if (index >= 0) {
                entry.tabs.splice(index, 1);
                entry.activeTab = Math.max(0, Math.min(entry.activeTab, entry.tabs.length - 1));
            }
            if (entry.tabs.length === 0)
                this.sessions.delete(entry.key);
        });
        void window.loadURL("about:blank");
    }
    attachNetwork(entry) {
        const ses = entry.session;
        ses.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => {
            const requestId = String(details.id);
            const url = safeUrl(details.url);
            if (url) {
                const redirectFrom = entry.redirectPending.delete(requestId) ? entry.requestRecords.get(requestId) : undefined;
                const id = `${requestId}:${++entry.requestSequence}`;
                const record = {
                    id, timestamp: Date.now(), url, method: String(details.method).slice(0, 24), type: String(details.resourceType),
                    requestHeaders: {}, ...(redirectFrom ? { redirectFrom } : {}),
                };
                entry.network.set(id, record);
                entry.startedAt.set(id, Date.now());
                entry.requestRecords.set(requestId, id);
                while (entry.network.size > MAX_NETWORK_ENTRIES) {
                    const oldest = entry.network.keys().next().value;
                    if (!oldest)
                        break;
                    entry.network.delete(oldest);
                    entry.startedAt.delete(oldest);
                }
            }
            callback({});
        });
        ses.webRequest.onBeforeSendHeaders({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => {
            const recordID = entry.requestRecords.get(String(details.id));
            const record = recordID ? entry.network.get(recordID) : undefined;
            if (record)
                record.requestHeaders = safeHeaders(details.requestHeaders);
            callback({ requestHeaders: details.requestHeaders });
        });
        ses.webRequest.onHeadersReceived({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => {
            const recordID = entry.requestRecords.get(String(details.id));
            const record = recordID ? entry.network.get(recordID) : undefined;
            if (record)
                record.responseHeaders = safeHeaders(details.responseHeaders);
            callback({ responseHeaders: details.responseHeaders });
        });
        ses.webRequest.onBeforeRedirect({ urls: ["http://*/*", "https://*/*"] }, (details) => {
            const requestId = String(details.id);
            const recordID = entry.requestRecords.get(requestId);
            const record = recordID ? entry.network.get(recordID) : undefined;
            if (record) {
                record.status = details.statusCode;
                record.statusLine = details.statusLine;
                record.redirectUrl = safeUrl(details.redirectURL);
                record.responseHeaders = safeHeaders(details.responseHeaders);
                record.duration = Math.max(0, Date.now() - (entry.startedAt.get(record.id) ?? Date.now()));
            }
            entry.redirectPending.add(requestId);
        });
        ses.webRequest.onCompleted({ urls: ["http://*/*", "https://*/*"] }, (details) => {
            const requestId = String(details.id);
            const recordID = entry.requestRecords.get(requestId);
            const record = recordID ? entry.network.get(recordID) : undefined;
            if (!record)
                return;
            record.status = details.statusCode;
            record.statusLine = details.statusLine;
            record.responseHeaders = safeHeaders(details.responseHeaders);
            record.duration = Math.max(0, Date.now() - (entry.startedAt.get(record.id) ?? Date.now()));
            const length = details.responseHeaders?.["content-length"]?.[0];
            record.size = length && /^\d+$/.test(length) ? Number(length) : undefined;
            entry.requestRecords.delete(requestId);
        });
        ses.webRequest.onErrorOccurred({ urls: ["http://*/*", "https://*/*"] }, (details) => {
            const requestId = String(details.id);
            const recordID = entry.requestRecords.get(requestId);
            const record = recordID ? entry.network.get(recordID) : undefined;
            if (!record)
                return;
            record.error = String(details.error).slice(0, 256);
            record.duration = Math.max(0, Date.now() - (entry.startedAt.get(record.id) ?? Date.now()));
            entry.requestRecords.delete(requestId);
        });
    }
    async runExclusive(entry, operation) {
        const previous = entry.queue ?? Promise.resolve();
        let release;
        entry.queue = new Promise((resolve) => { release = resolve; });
        await previous;
        try {
            return await operation();
        }
        finally {
            release();
        }
    }
    async execute(entry, request, signal) {
        const args = request.args ?? {};
        let tab = entry.tabs[entry.activeTab];
        if (!tab && request.action !== "ensure")
            throw new Error("Browser window is closed; use action=open to recover the session");
        const contents = tab?.window.webContents;
        const evalPage = async (script) => {
            if (!contents || contents.isDestroyed())
                throw new Error("Browser renderer is unavailable");
            return contents.executeJavaScript(script, true);
        };
        const currentUrl = () => safeUrl(contents?.getURL() ?? "") || "";
        const requireControl = () => {
            if (entry.owner !== "ai")
                throw new Error("Browser is not under AI control; release control before AI actions.");
            if (args.lease !== undefined && args.lease !== entry.lease)
                throw new Error("Browser control lease is stale.");
        };
        const checkCancelled = () => {
            if (signal.aborted)
                throw new Error("Browser action cancelled");
        };
        if (!["ensure", "status", "control"].includes(request.action))
            requireControl();
        switch (request.action) {
            case "ensure": return this.status(entry);
            case "status": return this.status(entry);
            case "control": {
                const operation = asString(args.operation, "control operation", 32);
                if (operation === "status")
                    return { owner: entry.owner, lease: entry.lease };
                const requestedOwner = args.owner;
                if (requestedOwner !== undefined && !["ai", "user", "transitioning"].includes(String(requestedOwner))) {
                    throw new Error("Unsupported browser control owner");
                }
                if (requestedOwner !== undefined)
                    entry.owner = requestedOwner;
                else if (operation === "take" || operation === "pause")
                    entry.owner = "user";
                else if (operation === "give" || operation === "resume")
                    entry.owner = "ai";
                else
                    throw new Error("Unsupported control operation");
                entry.lease = (0, node_crypto_1.randomBytes)(16).toString("hex");
                return { owner: entry.owner, lease: entry.lease };
            }
            case "navigate": {
                requireControl();
                const url = validUrl(args.url);
                await tab.window.loadURL(url);
                checkCancelled();
                return { url: currentUrl(), title: tab.title };
            }
            case "back":
                requireControl();
                tab.window.webContents.goBack();
                return { url: currentUrl() };
            case "forward":
                requireControl();
                tab.window.webContents.goForward();
                return { url: currentUrl() };
            case "reload":
                requireControl();
                tab.window.webContents.reload();
                return { url: currentUrl() };
            case "snapshot":
                return { url: currentUrl(), title: tab.title, html: await evalPage("document.documentElement.outerHTML") };
            case "title": return { url: currentUrl(), title: tab.title };
            case "text": return await evalPage("document.body?.innerText ?? ''");
            case "links":
                return await evalPage("Array.from(document.querySelectorAll('a[href]')).map((e) => ({text:(e.innerText||e.getAttribute('aria-label')||'').trim(),href:e.href})).slice(0,300)");
            case "forms":
                return await evalPage("Array.from(document.forms).map((f) => ({action:f.action,method:f.method,fields:Array.from(f.elements).map((e) => ({name:e.name,type:e.type,required:e.required,autocomplete:e.autocomplete}))})).slice(0,100)");
            case "click": {
                requireControl();
                const selector = quote(asString(args.selector, "selector", 2000));
                return await evalPage(`(()=>{const e=document.querySelector(${selector});if(!e)throw new Error('Element not found');e.click();return true})()`);
            }
            case "type": {
                requireControl();
                const selector = quote(asString(args.selector, "selector", 2000));
                const text = quote(asString(args.text, "text", 20000));
                return await evalPage(`(()=>{const e=document.querySelector(${selector});if(!e)throw new Error('Element not found');if(!('value' in e))throw new Error('Element is not editable');e.focus();e.value=${text};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
            }
            case "press": {
                requireControl();
                const selector = quote(asString(args.selector, "selector", 2000));
                const key = quote(asString(args.key, "key", 64));
                return await evalPage(`(()=>{const e=document.querySelector(${selector});if(!e)throw new Error('Element not found');e.dispatchEvent(new KeyboardEvent('keydown',{key:${key},bubbles:true}));e.dispatchEvent(new KeyboardEvent('keyup',{key:${key},bubbles:true}));return true})()`);
            }
            case "select": {
                requireControl();
                const selector = quote(asString(args.selector, "selector", 2000));
                const value = quote(asString(args.value, "value", 2000));
                return await evalPage(`(()=>{const e=document.querySelector(${selector});if(!e)throw new Error('Element not found');if(e.tagName!=='SELECT')throw new Error('Element is not a select');e.value=${value};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
            }
            case "hover": {
                requireControl();
                const selector = quote(asString(args.selector, "selector", 2000));
                return await evalPage(`(()=>{const e=document.querySelector(${selector});if(!e)throw new Error('Element not found');e.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));return true})()`);
            }
            case "scroll": {
                requireControl();
                const amount = Number(args.amount ?? 800);
                if (!Number.isFinite(amount) || Math.abs(amount) > 100000)
                    throw new Error("Scroll amount must be finite and within 100000");
                await evalPage(`window.scrollBy(0,${amount})`);
                return true;
            }
            case "wait": {
                const selector = args.selector === undefined ? undefined : asString(args.selector, "selector", 2000);
                const timeout = Number(args.timeoutMs ?? 1000);
                if (!Number.isFinite(timeout) || timeout < 0 || timeout > 30000)
                    throw new Error("Wait timeout must be between 0 and 30000 ms");
                if (selector)
                    await evalPage(`new Promise((resolve,reject)=>{const end=Date.now()+${timeout};const check=()=>{if(document.querySelector(${quote(selector)}))resolve(true);else if(Date.now()>=end)reject(new Error('Selector wait timed out'));else setTimeout(check,50)};check()})`);
                else
                    await new Promise((resolve, reject) => {
                        const timer = setTimeout(resolve, timeout);
                        signal.addEventListener("abort", () => {
                            clearTimeout(timer);
                            reject(new Error("Browser action cancelled"));
                        }, { once: true });
                    });
                checkCancelled();
                return true;
            }
            case "screenshot": {
                const fullPage = args.fullPage !== false;
                const selector = args.selector === undefined ? undefined : asString(args.selector, "selector", 2000);
                const debuggerApi = tab.window.webContents.debugger;
                if (selector) {
                    const document = await debuggerApi.sendCommand("DOM.getDocument");
                    const found = await debuggerApi.sendCommand("DOM.querySelector", {
                        nodeId: document.root.nodeId, selector,
                    });
                    if (!found.nodeId)
                        throw new Error("Screenshot selector did not match an element");
                    const box = await debuggerApi.sendCommand("DOM.getBoxModel", { nodeId: found.nodeId });
                    const xs = box.model.content.filter((_value, index) => index % 2 === 0);
                    const ys = box.model.content.filter((_value, index) => index % 2 === 1);
                    const x = Math.max(0, Math.min(...xs));
                    const y = Math.max(0, Math.min(...ys));
                    const width = Math.max(1, Math.min(8192, Math.max(...xs) - x));
                    const height = Math.max(1, Math.min(8192, Math.max(...ys) - y));
                    const result = await debuggerApi.sendCommand("Page.captureScreenshot", {
                        format: "png", captureBeyondViewport: true,
                        clip: { x, y, width, height, scale: 1 },
                    });
                    return { data: result.data, mimeType: "image/png" };
                }
                if (fullPage) {
                    const size = await evalPage("({width:Math.min(document.documentElement.scrollWidth,8192),height:Math.min(document.documentElement.scrollHeight,8192)})");
                    const result = await debuggerApi.sendCommand("Page.captureScreenshot", {
                        format: "png", captureBeyondViewport: true,
                        clip: { x: 0, y: 0, width: Math.max(1, size.width), height: Math.max(1, size.height), scale: 1 },
                    });
                    return { data: result.data, mimeType: "image/png" };
                }
                const image = await tab.window.webContents.capturePage();
                return { data: image.toPNG().toString("base64"), mimeType: "image/png" };
            }
            case "eval": {
                requireControl();
                const script = asString(args.script, "script", 50000);
                return await evalPage(`(async()=>(${script}))()`);
            }
            case "tabs": return entry.tabs.map((value, index) => ({ index, url: value.url, title: value.title, active: index === entry.activeTab }));
            case "new_tab": {
                requireControl();
                this.createWindow(entry, entry.headless);
                tab = entry.tabs[entry.activeTab];
                if (args.url)
                    await tab.window.loadURL(validUrl(args.url));
                return { index: entry.activeTab, url: tab.url, title: tab.title };
            }
            case "close_tab": {
                requireControl();
                const index = Number(args.index ?? entry.activeTab);
                if (!Number.isInteger(index) || !entry.tabs[index])
                    throw new Error("Tab index does not exist");
                entry.tabs[index].window.close();
                return { closed: index, activeTab: entry.activeTab };
            }
            case "switch_tab": {
                const index = Number(args.index);
                if (!Number.isInteger(index) || !entry.tabs[index])
                    throw new Error("Tab index does not exist");
                entry.activeTab = index;
                return { index, url: entry.tabs[index].url, title: entry.tabs[index].title };
            }
            case "console": return entry.console.slice(-100);
            case "websocket": return entry.websocket.slice(-100);
            case "cookies": return entry.session.cookies.get(currentUrl() ? { url: currentUrl() } : {});
            case "cookies_set": {
                requireControl();
                const cookies = args.cookies;
                if (!Array.isArray(cookies) || cookies.length > 64)
                    throw new Error("Cookie import must contain at most 64 cookies");
                for (const cookie of cookies) {
                    if (!cookie || typeof cookie !== "object")
                        throw new Error("Cookie import contains an invalid cookie");
                    await entry.session.cookies.set(cookie);
                }
                return { count: cookies.length };
            }
            case "storage": return await evalPage("({localStorage:Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])),sessionStorage:Object.fromEntries(Object.keys(sessionStorage).map(k=>[k,sessionStorage.getItem(k)]))})");
            case "network": return [...entry.network.values()].slice(-1000);
            case "network_clear":
                entry.network.clear();
                return true;
        }
    }
    status(entry) {
        const tab = entry.tabs[entry.activeTab];
        return {
            key: entry.key, partition: entry.partition, owner: entry.owner, lease: entry.lease, headless: entry.headless,
            crashed: !tab || tab.window.isDestroyed() || tab.window.webContents.isCrashed(),
            tabs: entry.tabs.map((value, index) => ({ index, url: value.url, title: value.title, active: index === entry.activeTab })),
            url: tab?.url ?? "", title: tab?.title ?? "",
        };
    }
    profileOperation(args) {
        const operation = asString(args.operation, "profile operation", 32);
        const file = path.join(this.userDataPath, "eliteasura-profiles.json");
        let names = [];
        try {
            const saved = JSON.parse(fs.readFileSync(file, "utf8"));
            if (Array.isArray(saved))
                names = saved.filter((value) => typeof value === "string");
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
        }
        if (operation === "list")
            return names;
        const name = asString(args.name, "profile name", 64);
        if (!/^[A-Za-z0-9._-]{1,64}$/.test(name))
            throw new Error("Profile names may contain only letters, numbers, dot, underscore, and hyphen");
        if (operation === "create" || operation === "select") {
            if (!names.includes(name)) {
                names.push(name);
                fs.writeFileSync(file, JSON.stringify(names.sort(), null, 2), { encoding: "utf8", mode: 0o600 });
            }
            return { name, ready: true };
        }
        throw new Error("Profile clearing and deletion are disabled to preserve existing browser data");
    }
    handleSessionStorage(event, action, input) {
        const sender = event.sender;
        const entry = [...this.sessions.values()].find((item) => item.tabs.some((tab) => tab.window.webContents === sender));
        if (!entry) {
            event.returnValue = action === "read" ? "{}" : false;
            return;
        }
        let origin;
        try {
            origin = new URL(sender.getURL()).origin;
            if (!["http:", "https:"].includes(new URL(origin).protocol))
                throw new Error();
        }
        catch {
            event.returnValue = action === "read" ? "{}" : false;
            return;
        }
        const file = path.join(this.userDataPath, "eliteasura-profiles", digest(entry.key).slice(0, 40), `${digest(origin)}.session.enc`);
        if (action === "read") {
            try {
                if (!electron_1.safeStorage.isEncryptionAvailable() || electron_1.safeStorage.getSelectedStorageBackend() === "basic_text") {
                    throw new Error("The operating system does not provide encrypted profile storage");
                }
                const decrypted = electron_1.safeStorage.decryptString(fs.readFileSync(file));
                event.returnValue = decrypted.slice(0, 1048576);
            }
            catch (error) {
                if (error.code !== "ENOENT")
                    console.error("Could not restore isolated browser session storage:", error);
                event.returnValue = "{}";
            }
            return;
        }
        try {
            if (!electron_1.safeStorage.isEncryptionAvailable() || electron_1.safeStorage.getSelectedStorageBackend() === "basic_text") {
                throw new Error("The operating system does not provide encrypted profile storage");
            }
            if (!input || typeof input !== "object" || Array.isArray(input))
                throw new Error("Session storage snapshot is malformed");
            const clean = {};
            let bytes = 0;
            for (const [key, value] of Object.entries(input)) {
                if (typeof value !== "string" || key.length > 512 || value.length > 64000)
                    continue;
                bytes += Buffer.byteLength(key) + Buffer.byteLength(value);
                if (bytes > 1048576)
                    throw new Error("Session storage snapshot exceeds 1 MiB");
                clean[key] = value;
            }
            fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
            fs.writeFileSync(file, electron_1.safeStorage.encryptString(JSON.stringify(clean)), { mode: 0o600 });
            event.returnValue = true;
        }
        catch (error) {
            console.error("Could not persist isolated browser session storage:", error);
            event.returnValue = false;
        }
    }
}
exports.AsuraAutomationController = AsuraAutomationController;
//# sourceMappingURL=controller.js.map