declare class AutoClockInService {
    private config;
    private wallets;
    private currentTransactions;
    private isRunning;
    private lastProcessedHeight;
    constructor();
    private loadConfig;
    private initializeWallets;
    private calculateNextClockInHeight;
    private isClockInBlock;
    private getCurrentBlockHeight;
    private getMedianFeeRate;
    private checkWalletBalances;
    private executeClockIn;
    private sendClockInTransactions;
    private monitorAndAccelerateTransactions;
    private accelerateTransactionsIfNeeded;
    private checkTransactionConfirmations;
    private sendWebhookNotification;
    private log;
    start(): Promise<void>;
    private mainLoop;
    stop(): void;
}
export { AutoClockInService };
