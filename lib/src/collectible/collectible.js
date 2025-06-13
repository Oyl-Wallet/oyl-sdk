"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.actualFee = exports.send = exports.findCollectible = exports.createPsbt = void 0;
const tslib_1 = require("tslib");
const btc_1 = require("../btc/btc");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const utils_1 = require("../shared/utils");
const errors_1 = require("../errors");
const utils_2 = require("../shared/utils");
const createPsbt = async ({ gatheredUtxos, account, inscriptionId, provider, inscriptionAddress, toAddress, feeRate, fee, }) => {
    try {
        const originalGatheredUtxos = gatheredUtxos;
        const minFee = (0, btc_1.minimumFee)({
            taprootInputCount: 1,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        const calculatedFee = minFee * feeRate < 250 ? 250 : minFee * feeRate;
        let finalFee = fee ? fee : calculatedFee;
        let psbt = new bitcoin.Psbt({ network: provider.network });
        const { txId, voutIndex, data } = await (0, exports.findCollectible)({
            address: inscriptionAddress,
            provider,
            inscriptionId,
        });
        if ((0, utils_2.getAddressType)(inscriptionAddress) === 0) {
            const previousTxHex = await provider.esplora.getTxHex(txId);
            psbt.addInput({
                hash: txId,
                index: parseInt(voutIndex),
                nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
            });
        }
        if ((0, utils_2.getAddressType)(inscriptionAddress) === 2) {
            const redeemScript = bitcoin.script.compile([
                bitcoin.opcodes.OP_0,
                bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
            ]);
            psbt.addInput({
                hash: txId,
                index: parseInt(voutIndex),
                redeemScript: redeemScript,
                witnessUtxo: {
                    value: data.value,
                    script: bitcoin.script.compile([
                        bitcoin.opcodes.OP_HASH160,
                        bitcoin.crypto.hash160(redeemScript),
                        bitcoin.opcodes.OP_EQUAL,
                    ]),
                },
            });
        }
        if ((0, utils_2.getAddressType)(inscriptionAddress) === 1 ||
            (0, utils_2.getAddressType)(inscriptionAddress) === 3) {
            psbt.addInput({
                hash: txId,
                index: parseInt(voutIndex),
                witnessUtxo: {
                    script: Buffer.from(data.scriptpubkey, 'hex'),
                    value: data.value,
                },
            });
        }
        psbt.addOutput({
            address: toAddress,
            value: data.value,
        });
        gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee));
        if (!fee && gatheredUtxos.utxos.length > 1) {
            const txSize = (0, btc_1.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 2,
            });
            finalFee = txSize * feeRate < 250 ? 250 : txSize * feeRate;
            gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee));
        }
        if (gatheredUtxos.totalAmount < finalFee) {
            throw new errors_1.OylTransactionError(Error('Insufficient balance'));
        }
        for (let i = 0; i < gatheredUtxos.utxos.length; i++) {
            if ((0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 0) {
                const previousTxHex = await provider.esplora.getTxHex(gatheredUtxos.utxos[i].txId);
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                });
            }
            if ((0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 2) {
                const redeemScript = bitcoin.script.compile([
                    bitcoin.opcodes.OP_0,
                    bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
                ]);
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    redeemScript: redeemScript,
                    witnessUtxo: {
                        value: gatheredUtxos.utxos[i].satoshis,
                        script: bitcoin.script.compile([
                            bitcoin.opcodes.OP_HASH160,
                            bitcoin.crypto.hash160(redeemScript),
                            bitcoin.opcodes.OP_EQUAL,
                        ]),
                    },
                });
            }
            if ((0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 1 ||
                (0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 3) {
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    witnessUtxo: {
                        value: gatheredUtxos.utxos[i].satoshis,
                        script: Buffer.from(gatheredUtxos.utxos[i].scriptPk, 'hex'),
                    },
                });
            }
        }
        const changeAmount = gatheredUtxos.totalAmount - finalFee;
        psbt.addOutput({
            address: account[account.spendStrategy.changeAddress].address,
            value: changeAmount,
        });
        const formattedPsbtTx = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: account.taproot.pubkey,
            network: provider.network,
        });
        return { psbt: formattedPsbtTx.toBase64() };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.createPsbt = createPsbt;
const findCollectible = async ({ address, provider, inscriptionId, }) => {
    const collectibleData = await provider.ord.getInscriptionById(inscriptionId);
    if (collectibleData.address !== address) {
        throw new Error('Inscription does not belong to the address given');
    }
    const inscriptionTxId = collectibleData.satpoint.split(':')[0];
    const inscriptionTxVOutIndex = collectibleData.satpoint.split(':')[1];
    const inscriptionUtxoDetails = await provider.esplora.getTxInfo(inscriptionTxId);
    const inscriptionUtxoData = inscriptionUtxoDetails.vout[inscriptionTxVOutIndex];
    const outputId = `${inscriptionTxId}:${inscriptionTxVOutIndex}`;
    const [inscriptionsOnOutput, isSpentArray] = await Promise.all([
        provider.ord.getTxOutput(outputId),
        provider.esplora.getTxOutspends(inscriptionTxId),
    ]);
    const isSpent = isSpentArray[inscriptionTxVOutIndex];
    //NOTE: The inscriptionsOnOutput.runes array check is only for sandshrew v1
    if (inscriptionsOnOutput.inscriptions.length > 1 ||
        Array.isArray(inscriptionsOnOutput.runes)
        ? Number(inscriptionsOnOutput.runes.length) > 0
        : Object.keys(inscriptionsOnOutput.runes).length > 0) {
        throw new Error('Unable to send from UTXO with multiple inscriptions. Split UTXO before sending.');
    }
    if (isSpent.spent) {
        throw new Error('Inscription is missing');
    }
    return {
        txId: inscriptionTxId,
        voutIndex: inscriptionTxVOutIndex,
        data: inscriptionUtxoData,
    };
};
exports.findCollectible = findCollectible;
const send = async ({ gatheredUtxos, toAddress, inscriptionId, inscriptionAddress, feeRate, account, provider, signer, fee, }) => {
    if (!inscriptionAddress) {
        inscriptionAddress = account.taproot.address;
    }
    if (!fee) {
        fee = (await (0, exports.actualFee)({
            gatheredUtxos,
            account,
            inscriptionId,
            provider,
            inscriptionAddress,
            toAddress,
            feeRate,
            signer,
        })).fee;
    }
    const { psbt: finalPsbt } = await (0, exports.createPsbt)({
        gatheredUtxos,
        account,
        inscriptionId,
        provider,
        toAddress,
        inscriptionAddress: inscriptionAddress,
        feeRate,
        fee,
    });
    const { signedPsbt } = await signer.signAllInputs({
        rawPsbt: finalPsbt,
        finalize: true,
    });
    const result = await provider.pushPsbt({
        psbtBase64: signedPsbt,
    });
    return result;
};
exports.send = send;
const actualFee = async ({ gatheredUtxos, account, inscriptionId, provider, inscriptionAddress = account.taproot.address, toAddress, feeRate, signer, }) => {
    const { psbt } = await (0, exports.createPsbt)({
        gatheredUtxos,
        account,
        inscriptionId,
        provider,
        inscriptionAddress,
        toAddress,
        feeRate,
    });
    const { signedPsbt } = await signer.signAllInputs({
        rawPsbt: psbt,
        finalize: true,
    });
    let rawPsbt = bitcoin.Psbt.fromBase64(signedPsbt, {
        network: account.network,
    });
    const signedHexPsbt = rawPsbt.extractTransaction().toHex();
    const vsize = (await provider.sandshrew.bitcoindRpc.testMemPoolAccept([signedHexPsbt]))[0].vsize;
    const correctFee = vsize * feeRate;
    const { psbt: finalPsbt } = await (0, exports.createPsbt)({
        gatheredUtxos,
        account,
        inscriptionId,
        provider,
        inscriptionAddress,
        toAddress,
        feeRate,
        fee: correctFee,
    });
    const { signedPsbt: signedAll } = await signer.signAllInputs({
        rawPsbt: finalPsbt,
        finalize: true,
    });
    let finalRawPsbt = bitcoin.Psbt.fromBase64(signedAll, {
        network: account.network,
    });
    const finalSignedHexPsbt = finalRawPsbt.extractTransaction().toHex();
    const finalVsize = (await provider.sandshrew.bitcoindRpc.testMemPoolAccept([finalSignedHexPsbt]))[0].vsize;
    const finalFee = finalVsize * feeRate;
    return { fee: finalFee };
};
exports.actualFee = actualFee;
//# sourceMappingURL=collectible.js.map