declare class AutoClockInService {
    private static readonly MIN_BALANCE_SATS;
    private static readonly BLOCK_API_URLS;
    private static readonly MEMPOOL_API_URL;
    private static readonly TX_STATUS_API_URL;
    private static readonly MONITOR_INTERVAL_MS;
    private static readonly FALLBACK_BROADCAST_URLS;
    private config;
    private wallets;
    private currentTransactions;
    private isRunning;
    private lastProcessedHeight;
    private loggedNextTargetHeight;
    constructor();
    private loadConfig;
    private initializeWallets;
    private calculateNextClockInHeight;
    private getCurrentBlockHeight;
    private getFeeRateInfo;
    private checkWalletBalances;
    private executeClockIn;
    /**
     * Wraps the clock-in execution with a retry mechanism to handle transient network errors.
     * @param walletInfo The wallet to perform clock-in for.
     * @param feeRate The fee rate to use for the transaction.
     * @param maxRetries The maximum number of attempts.
     * @returns The transaction result if successful, otherwise null.
     */
    private executeClockInWithRetry;
    /**
     * Broadcasts a raw transaction using the primary provider, with fallbacks to public APIs.
     * This increases the chance of a successful broadcast even if the primary node is down.
     */
    private broadcastTransaction;
    private sendClockInTransactions;
    private monitorAndAccelerateTransactions;
    private accelerateTransactionsIfNeeded;
    private executeRBFTransaction;
    private checkTransactionConfirmations;
    private sendWebhookNotification;
    private log;
    start(): Promise<void>;
    private mainLoop;
    stop(): void;
    private chunkArray;
}
export { AutoClockInService };
