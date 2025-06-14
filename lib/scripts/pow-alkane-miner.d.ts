declare class PowAlkaneMiner {
    private config;
    private wallet;
    private isRunning;
    constructor();
    private loadConfig;
    private initializeWallet;
    private selectBestUtxo;
    private static hexToBytes;
    private static bytesToHex;
    private static prepareFixedData;
    private static computeHash;
    private mineNonce;
    private executeAlkaneContract;
    start(): Promise<void>;
    stop(): void;
    private log;
}
export { PowAlkaneMiner };
