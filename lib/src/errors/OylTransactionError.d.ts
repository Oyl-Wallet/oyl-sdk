export declare class OylTransactionError extends Error {
    successTxIds: string[];
    constructor(error: Error, successTxIds?: string[]);
}
