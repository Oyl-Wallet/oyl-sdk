"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OylTransactionError = void 0;
class OylTransactionError extends Error {
    successTxIds; // The IDs of the transactions that were successful before the error occurred
    constructor(error, successTxIds) {
        super(error.message);
        this.name = 'OylTransactionError';
        this.stack = `${this.stack}\nCaused by: ${error.stack}`;
        this.successTxIds = successTxIds || [];
    }
}
exports.OylTransactionError = OylTransactionError;
//# sourceMappingURL=OylTransactionError.js.map