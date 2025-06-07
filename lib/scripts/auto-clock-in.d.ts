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
    private getCurrentBlockHeight;
    private getFeeRateInfo;
    private checkWalletBalances;
    private executeClockIn;
    private sendClockInTransactions;
    private monitorAndAccelerateTransactions;
    private accelerateTransactionsIfNeeded;
    private executeRBFTransaction;
    private createRBFWithSameInputs;
    private checkTransactionConfirmations;
    private sendWebhookNotification;
    private log;
    start(): Promise<void>;
    private mainLoop;
    stop(): void;
}
export { AutoClockInService };
