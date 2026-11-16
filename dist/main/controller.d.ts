export declare class AsuraAutomationController {
    private readonly userDataPath;
    private readonly paths;
    private readonly token;
    private readonly sessions;
    private readonly operations;
    private server?;
    private readonly sessionStorageListener;
    constructor(userDataPath: string);
    start(): Promise<void>;
    stop(): Promise<void>;
    private accept;
    private dispatch;
    private createSession;
    private createWindow;
    private attachNetwork;
    private runExclusive;
    private execute;
    private status;
    private profileOperation;
    private handleSessionStorage;
}
