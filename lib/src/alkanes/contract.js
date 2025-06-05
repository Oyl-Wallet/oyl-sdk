"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deployReveal = exports.actualDeployRevealFee = exports.actualDeployCommitFee = exports.contractDeployment = void 0;
const tslib_1 = require("tslib");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const utils_1 = require("../shared/utils");
const alkanes_1 = require("./alkanes");
const psbt_1 = require("../psbt");
const contractDeployment = async ({ payload, utxos, account, protostone, provider, feeRate, signer, }) => {
    const { script, txId } = await (0, alkanes_1.deployCommit)({
        payload,
        utxos,
        account,
        provider,
        feeRate,
        signer,
    });
    await (0, utils_1.timeout)(3000);
    const reveal = await (0, exports.deployReveal)({
        commitTxId: txId,
        script,
        protostone,
        account,
        provider,
        feeRate,
        signer,
    });
    return { ...reveal, commitTx: txId };
};
exports.contractDeployment = contractDeployment;
const actualDeployCommitFee = async ({ payload, tweakedPublicKey, utxos, account, provider, feeRate, }) => {
    if (!feeRate) {
        feeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbt } = await (0, alkanes_1.createDeployCommitPsbt)({
        payload,
        utxos,
        tweakedPublicKey,
        account,
        provider,
        feeRate,
    });
    const { fee: estimatedFee } = await (0, psbt_1.getEstimatedFee)({
        feeRate,
        psbt,
        provider,
    });
    const { psbt: finalPsbt } = await (0, alkanes_1.createDeployCommitPsbt)({
        payload,
        utxos,
        tweakedPublicKey,
        account,
        provider,
        feeRate,
        fee: estimatedFee,
    });
    const { fee: finalFee, vsize } = await (0, psbt_1.getEstimatedFee)({
        feeRate,
        psbt: finalPsbt,
        provider,
    });
    return { fee: finalFee, vsize };
};
exports.actualDeployCommitFee = actualDeployCommitFee;
const actualDeployRevealFee = async ({ protostone, tweakedPublicKey, commitTxId, receiverAddress, script, provider, feeRate, }) => {
    if (!feeRate) {
        feeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbt } = await (0, alkanes_1.createDeployRevealPsbt)({
        protostone,
        commitTxId,
        receiverAddress,
        script,
        tweakedPublicKey,
        provider,
        feeRate,
    });
    const { fee: estimatedFee } = await (0, psbt_1.getEstimatedFee)({
        feeRate,
        psbt,
        provider,
    });
    const { psbt: finalPsbt } = await (0, alkanes_1.createDeployRevealPsbt)({
        protostone,
        commitTxId,
        receiverAddress,
        script,
        tweakedPublicKey,
        provider,
        feeRate,
        fee: estimatedFee,
    });
    const { fee: finalFee, vsize } = await (0, psbt_1.getEstimatedFee)({
        feeRate,
        psbt: finalPsbt,
        provider,
    });
    return { fee: finalFee, vsize };
};
exports.actualDeployRevealFee = actualDeployRevealFee;
const deployReveal = async ({ protostone, commitTxId, script, account, provider, feeRate, signer, }) => {
    const tweakedTaprootKeyPair = (0, utils_1.tweakSigner)(signer.taprootKeyPair, {
        network: provider.network,
    });
    const tweakedPublicKey = tweakedTaprootKeyPair.publicKey.toString('hex');
    const { fee } = await (0, exports.actualDeployRevealFee)({
        protostone,
        tweakedPublicKey,
        receiverAddress: account.taproot.address,
        commitTxId,
        script: Buffer.from(script, 'hex'),
        provider,
        feeRate,
    });
    const { psbt: finalRevealPsbt } = await (0, alkanes_1.createDeployRevealPsbt)({
        protostone,
        tweakedPublicKey,
        receiverAddress: account.taproot.address,
        commitTxId,
        script: Buffer.from(script, 'hex'),
        provider,
        feeRate,
        fee,
    });
    let finalReveal = bitcoin.Psbt.fromBase64(finalRevealPsbt, {
        network: provider.network,
    });
    finalReveal.signInput(0, tweakedTaprootKeyPair);
    finalReveal.finalizeInput(0);
    const finalSignedPsbt = finalReveal.toBase64();
    const revealResult = await provider.pushPsbt({
        psbtBase64: finalSignedPsbt,
    });
    return revealResult;
};
exports.deployReveal = deployReveal;
//# sourceMappingURL=contract.js.map