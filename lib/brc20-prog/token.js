"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inscribeJson = void 0;
const tslib_1 = require("tslib");
const alkanes_1 = require("../alkanes/alkanes");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const utils_1 = require("../shared/utils");
const inscribeJson = async ({ json, utxos, account, provider, feeRate, signer, }) => {
    const payload = {
        body: Buffer.from(JSON.stringify(json)),
        cursed: false,
        tags: { contentType: 'text/plain' },
    };
    const { script, txId, commitPsbt } = await (0, alkanes_1.deployCommit)({
        payload,
        utxos,
        account,
        provider,
        feeRate,
        signer,
        protostone: Buffer.from([]), // No protostone for brc20-prog
    });
    await (0, utils_1.timeout)(3000);
    const reveal = await (0, alkanes_1.deployReveal)({
        payload,
        utxos,
        protostone: Buffer.from([]),
        script,
        commitTxId: txId,
        commitPsbt: bitcoin.Psbt.fromBase64(commitPsbt, {
            network: provider.network,
        }),
        account,
        provider,
        feeRate,
        signer,
    });
    return { ...reveal, commitTx: txId };
};
exports.inscribeJson = inscribeJson;
//# sourceMappingURL=token.js.map