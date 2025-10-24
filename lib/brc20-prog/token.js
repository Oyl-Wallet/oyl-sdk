"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inscribeJson = void 0;
const tslib_1 = require("tslib");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const utils_1 = require("../shared/utils");
const errors_1 = require("../errors");
const bip371_1 = require("bitcoinjs-lib/src/psbt/bip371");
const bip341_1 = require("bitcoinjs-lib/src/payments/bip341");
async function commit({ utxos, account, provider, feeRate, tweakedTaprootPublicKey, inscription, }) {
    const gatheredUtxos = (0, utils_1.findXAmountOfSats)(utxos, 10000);
    const psbt = new bitcoin.Psbt({ network: provider.network });
    const commitTxSize = (0, utils_1.calculateTaprootTxSize)(1, 0, 2);
    const feeForCommit = commitTxSize * feeRate;
    const revealTxSize = (0, utils_1.calculateTaprootTxSize)(1, 0, 2);
    const feeForReveal = revealTxSize * feeRate;
    const totalFee = feeForCommit + feeForReveal + 1092; // 546 for each tx
    const script = (0, utils_1.createInscriptionScript)(tweakedTaprootPublicKey, inscription);
    const outputScript = bitcoin.script.compile(script);
    const inscriberInfo = bitcoin.payments.p2tr({
        internalPubkey: tweakedTaprootPublicKey,
        scriptTree: { output: outputScript },
        network: provider.network,
    });
    psbt.addOutput({
        value: feeForReveal + 546,
        address: inscriberInfo.address,
    });
    await (0, utils_1.addInputUtxosToPsbt)(gatheredUtxos.utxos, psbt, account, provider);
    const changeAmount = gatheredUtxos.totalAmount - totalFee;
    psbt.addOutput({
        address: account.taproot.address,
        value: changeAmount,
    });
    const formattedPsbt = await (0, utils_1.formatInputsToSign)({
        _psbt: psbt,
        senderPublicKey: account.taproot.pubkey,
        network: provider.network,
    });
    return {
        psbt: formattedPsbt.toBase64(),
        script: outputScript,
    };
}
async function reveal({ provider, feeRate, script, commitTxId, tweakedTaprootKeyPair, account, }) {
    const psbt = new bitcoin.Psbt({ network: provider.network });
    const revealTxSize = (0, utils_1.calculateTaprootTxSize)(1, 0, 2);
    const feeForReveal = revealTxSize * feeRate;
    const commitTxOutput = await (0, utils_1.getOutputValueByVOutIndex)({
        txId: commitTxId,
        vOut: 0,
        esploraRpc: provider.esplora,
    });
    if (!commitTxOutput) {
        throw new Error('Error getting vin #0 value');
    }
    const p2pk_redeem = { output: script };
    const { output, witness } = bitcoin.payments.p2tr({
        internalPubkey: (0, bip371_1.toXOnly)(tweakedTaprootKeyPair.publicKey),
        scriptTree: p2pk_redeem,
        redeem: p2pk_redeem,
        network: provider.network,
    });
    psbt.addInput({
        hash: commitTxId,
        index: 0,
        witnessUtxo: {
            value: commitTxOutput.value,
            script: output,
        },
        tapLeafScript: [
            {
                leafVersion: bip341_1.LEAF_VERSION_TAPSCRIPT,
                script: p2pk_redeem.output,
                controlBlock: witness[witness.length - 1],
            },
        ],
    });
    psbt.addOutput({
        value: 546,
        address: account.taproot.address,
    });
    const changeAmount = commitTxOutput.value - feeForReveal - 546;
    if (changeAmount > 546) {
        psbt.addOutput({
            value: changeAmount,
            address: account.taproot.address,
        });
    }
    psbt.signInput(0, tweakedTaprootKeyPair);
    psbt.finalizeInput(0);
    return {
        psbt: psbt.toBase64(),
    };
}
const inscribeJson = async ({ json, utxos, account, provider, feeRate, signer, }) => {
    try {
        if (!feeRate) {
            feeRate = (await provider.esplora.getFeeEstimates())['1'];
        }
        const tweakedTaprootKeyPair = (0, utils_1.tweakSigner)(signer.taprootKeyPair, { network: provider.network });
        const tweakedTaprootPublicKey = (0, bip371_1.toXOnly)(tweakedTaprootKeyPair.publicKey);
        const inscription = JSON.stringify(json);
        const { psbt: commitPsbt, script } = await commit({
            utxos,
            account,
            provider,
            feeRate,
            tweakedTaprootPublicKey,
            inscription,
        });
        const { signedPsbt: commitSigned } = await signer.signAllInputs({
            rawPsbt: commitPsbt,
            finalize: true,
        });
        const { txId: commitTxId } = await provider.pushPsbt({
            psbtBase64: commitSigned,
        });
        await (0, utils_1.waitForTransaction)({
            txId: commitTxId,
            sandshrewBtcClient: provider.sandshrew,
            esploraClient: provider.esplora,
        });
        const { psbt: revealPsbt } = await reveal({
            provider,
            feeRate,
            script,
            commitTxId,
            tweakedTaprootKeyPair,
            account,
        });
        const { txId: revealTxId } = await provider.pushPsbt({
            psbtBase64: revealPsbt,
        });
        return { commitTxId, revealTxId };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.inscribeJson = inscribeJson;
//# sourceMappingURL=token.js.map