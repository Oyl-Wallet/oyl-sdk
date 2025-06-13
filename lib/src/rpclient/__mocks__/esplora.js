"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EsploraRpc = void 0;
class EsploraRpc {
    async getAddressUtxo() {
        return [
            {
                txid: '1234',
                vout: 0,
                value: 1000,
                // ... other required UTXO fields
            },
        ];
    }
}
exports.EsploraRpc = EsploraRpc;
//# sourceMappingURL=esplora.js.map