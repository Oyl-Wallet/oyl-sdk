"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.send = exports.transfer = exports.reveal = exports.commit = exports.transferEstimate = void 0;
const tslib_1 = require("tslib");
const errors_1 = require("../errors");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const utils_1 = require("../shared/utils");
const btc_1 = require("../btc/btc");
const bip371_1 = require("bitcoinjs-lib/src/psbt/bip371");
const bip341_1 = require("bitcoinjs-lib/src/payments/bip341");
const utils_2 = require("../shared/utils");
const transferEstimate = async ({ gatheredUtxos, toAddress, feeRate, account, provider, fee, }) => {
    try {
        const originalGatheredUtxos = gatheredUtxos;
        if (!feeRate) {
            feeRate = (await provider.esplora.getFeeEstimates())['1'];
        }
        const psbt = new bitcoin.Psbt({ network: provider.network });
        const minFee = (0, btc_1.minimumFee)({
            taprootInputCount: 1,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        let calculatedFee = minFee * feeRate < 250 ? 250 : minFee * feeRate;
        let finalFee = fee ? fee : calculatedFee;
        gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee) + utils_1.inscriptionSats);
        if (!fee && gatheredUtxos.utxos.length > 1) {
            const txSize = (0, btc_1.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 2,
            });
            finalFee = Math.max(txSize * feeRate, 250);
            gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee) + utils_1.inscriptionSats);
        }
        if (gatheredUtxos.totalAmount < finalFee + utils_1.inscriptionSats) {
            throw new errors_1.OylTransactionError(Error('Insufficient Balance'));
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
        psbt.addOutput({
            address: toAddress,
            value: utils_1.inscriptionSats,
        });
        const changeAmount = gatheredUtxos.totalAmount - (finalFee + utils_1.inscriptionSats);
        psbt.addOutput({
            address: account[account.spendStrategy.changeAddress].address,
            value: changeAmount,
        });
        const updatedPsbt = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: account.taproot.pubkey,
            network: provider.network,
        });
        return { psbt: updatedPsbt.toBase64(), fee: finalFee };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.transferEstimate = transferEstimate;
const commit = async ({ gatheredUtxos, ticker, amount, feeRate, account, tweakedTaprootPublicKey, provider, finalTransferFee, fee, }) => {
    try {
        const originalGatheredUtxos = gatheredUtxos;
        const content = `{"p":"brc-20","op":"transfer","tick":"${ticker}","amt":"${amount}"}`;
        if (!feeRate) {
            feeRate = (await provider.esplora.getFeeEstimates())['1'];
        }
        const psbt = new bitcoin.Psbt({ network: provider.network });
        const commitTxSize = (0, utils_1.calculateTaprootTxSize)(1, 0, 2);
        const feeForCommit = commitTxSize * feeRate < 250 ? 250 : commitTxSize * feeRate;
        const revealTxSize = (0, utils_1.calculateTaprootTxSize)(1, 0, 2);
        const feeForReveal = revealTxSize * feeRate < 250 ? 250 : revealTxSize * feeRate;
        const baseEstimate = Number(feeForCommit) + Number(feeForReveal) + utils_1.inscriptionSats;
        let finalFee = fee ? fee + Number(feeForReveal) + utils_1.inscriptionSats : baseEstimate;
        const script = (0, utils_1.createInscriptionScript)(tweakedTaprootPublicKey, content);
        const outputScript = bitcoin.script.compile(script);
        const inscriberInfo = bitcoin.payments.p2tr({
            internalPubkey: tweakedTaprootPublicKey,
            scriptTree: { output: outputScript },
            network: provider.network,
        });
        psbt.addOutput({
            value: Number(feeForReveal) + utils_1.inscriptionSats,
            address: inscriberInfo.address,
        });
        gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee) + Number(finalTransferFee));
        if (!fee && gatheredUtxos.utxos.length > 1) {
            const txSize = (0, btc_1.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 2,
            });
            finalFee =
                txSize * feeRate < 250
                    ? 250
                    : txSize * feeRate + Number(feeForReveal) + utils_1.inscriptionSats;
            gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee) + Number(finalTransferFee));
        }
        if (gatheredUtxos.totalAmount < finalFee) {
            throw new errors_1.OylTransactionError(Error('Insufficient Balance'));
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
        const updatedPsbt = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: account.taproot.pubkey,
            network: provider.network,
        });
        return { psbt: updatedPsbt.toBase64(), fee: finalFee, script: outputScript };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.commit = commit;
const reveal = async ({ receiverAddress, script, feeRate, tweakedTaprootKeyPair, provider, fee = 0, commitTxId, }) => {
    try {
        if (!feeRate) {
            feeRate = (await provider.esplora.getFeeEstimates())['1'];
        }
        const psbt = new bitcoin.Psbt({ network: provider.network });
        const minFee = (0, btc_1.minimumFee)({
            taprootInputCount: 1,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        const revealTxBaseFee = minFee * feeRate < utils_1.inscriptionSats ? utils_1.inscriptionSats : minFee * feeRate;
        const revealTxChange = fee === 0 ? 0 : Number(revealTxBaseFee) - fee;
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
            value: utils_1.inscriptionSats,
            address: receiverAddress,
        });
        if (revealTxChange > utils_1.inscriptionSats) {
            psbt.addOutput({
                value: revealTxChange,
                address: receiverAddress,
            });
        }
        psbt.signInput(0, tweakedTaprootKeyPair);
        psbt.finalizeInput(0);
        return {
            psbt: psbt.toBase64(),
            psbtHex: psbt.extractTransaction().toHex(),
            fee: revealTxChange,
        };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.reveal = reveal;
const transfer = async ({ commitChangeUtxoId, revealTxId, toAddress, feeRate, account, provider, fee, }) => {
    try {
        if (!feeRate) {
            feeRate = (await provider.esplora.getFeeEstimates())['1'];
        }
        const psbt = new bitcoin.Psbt({ network: provider.network });
        const [utxoInfo, revealInfo] = await provider.sandshrew.multiCall([
            ['esplora_tx', [commitChangeUtxoId]],
            ['esplora_tx', [revealTxId]],
        ]);
        const minFee = (0, btc_1.minimumFee)({
            taprootInputCount: 2,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        let calculatedFee = minFee * feeRate < 250 ? 250 : minFee * feeRate;
        let finalFee = fee ? fee : calculatedFee;
        let totalValue = 0;
        psbt.addInput({
            hash: revealTxId,
            index: 0,
            witnessUtxo: {
                script: Buffer.from(revealInfo.result.vout[0].scriptpubkey, 'hex'),
                value: utils_1.inscriptionSats,
            },
        });
        const allAddresses = [
            account.taproot.address,
            account.nativeSegwit.address,
            account.nestedSegwit.address,
            account.legacy.address,
        ];
        for (let i = 0; i < utxoInfo.result.vout.length; i++) {
            if (allAddresses.includes(utxoInfo.result.vout[i].scriptpubkey_address)) {
                if ((0, utils_2.getAddressType)(utxoInfo.result.vout[i].scriptpubkey_address) === 0) {
                    const previousTxHex = await provider.esplora.getTxHex(commitChangeUtxoId);
                    psbt.addInput({
                        hash: commitChangeUtxoId,
                        index: i,
                        nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                    });
                }
                if ((0, utils_2.getAddressType)(utxoInfo.result.vout[i].scriptpubkey_address) === 2) {
                    const redeemScript = bitcoin.script.compile([
                        bitcoin.opcodes.OP_0,
                        bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
                    ]);
                    psbt.addInput({
                        hash: commitChangeUtxoId,
                        index: i,
                        redeemScript: redeemScript,
                        witnessUtxo: {
                            value: utxoInfo.result.vout[i].value,
                            script: bitcoin.script.compile([
                                bitcoin.opcodes.OP_HASH160,
                                bitcoin.crypto.hash160(redeemScript),
                                bitcoin.opcodes.OP_EQUAL,
                            ]),
                        },
                    });
                }
                if ((0, utils_2.getAddressType)(utxoInfo.result.vout[i].scriptpubkey_address) === 1 ||
                    (0, utils_2.getAddressType)(utxoInfo.result.vout[i].scriptpubkey_address) === 3) {
                    psbt.addInput({
                        hash: commitChangeUtxoId,
                        index: i,
                        witnessUtxo: {
                            value: utxoInfo.result.vout[i].value,
                            script: Buffer.from(utxoInfo.result.vout[i].scriptpubkey, 'hex'),
                        },
                    });
                }
                totalValue += utxoInfo.result.vout[i].value;
            }
        }
        psbt.addOutput({
            address: toAddress,
            value: utils_1.inscriptionSats,
        });
        psbt.addOutput({
            address: account[account.spendStrategy.changeAddress].address,
            value: totalValue - finalFee,
        });
        const formattedPsbt = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: account.taproot.pubkey,
            network: provider.network,
        });
        return { psbt: formattedPsbt.toBase64() };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.transfer = transfer;
const send = async ({ gatheredUtxos, toAddress, ticker, amount, account, provider, feeRate, signer, }) => {
    let successTxIds = [];
    const estimate = await (0, exports.transferEstimate)({
        gatheredUtxos,
        toAddress: toAddress,
        feeRate: feeRate,
        account: account,
        provider: provider,
    });
    const tweakedTaprootKeyPair = (0, utils_1.tweakSigner)(signer.taprootKeyPair, { network: provider.network });
    const tweakedTaprootPublicKey = (0, bip371_1.toXOnly)(tweakedTaprootKeyPair.publicKey);
    const { psbt: dryCommitPsbt } = await (0, exports.commit)({
        gatheredUtxos,
        ticker: ticker,
        amount: amount,
        feeRate: feeRate,
        tweakedTaprootPublicKey,
        account: account,
        provider: provider,
        finalTransferFee: estimate.fee,
    });
    const { signedPsbt: commitSigned } = await signer.signAllInputs({
        rawPsbt: dryCommitPsbt,
        finalize: true,
    });
    const commitFee = await (0, utils_1.getFee)({
        provider,
        psbt: commitSigned,
        feeRate: feeRate,
    });
    const { psbt: finalCommitPsbt, script } = await (0, exports.commit)({
        gatheredUtxos,
        ticker: ticker,
        amount: amount,
        feeRate: feeRate,
        tweakedTaprootPublicKey,
        account: account,
        provider: provider,
        fee: commitFee,
        finalTransferFee: estimate.fee,
    });
    const { signedPsbt: finalCommitSigned } = await signer.signAllInputs({
        rawPsbt: finalCommitPsbt,
        finalize: true,
    });
    const { txId: commitTxId } = await provider.pushPsbt({
        psbtBase64: finalCommitSigned,
    });
    successTxIds.push(commitTxId);
    const { psbt: revealPsbt } = await (0, exports.reveal)({
        feeRate: feeRate,
        tweakedTaprootKeyPair,
        provider: provider,
        script: script,
        commitTxId: commitTxId,
        receiverAddress: account.taproot.address,
    });
    const revealFee = await (0, utils_1.getFee)({
        provider,
        psbt: revealPsbt,
        feeRate: feeRate,
    });
    const { psbt: finalRevealPsbt } = await (0, exports.reveal)({
        feeRate: feeRate,
        tweakedTaprootKeyPair,
        provider: provider,
        script: script,
        commitTxId: commitTxId,
        receiverAddress: account.taproot.address,
        fee: revealFee,
    });
    const { txId: revealTxId } = await provider.pushPsbt({
        psbtBase64: finalRevealPsbt,
    });
    if (!revealTxId) {
        throw new Error('Unable to reveal inscription.');
    }
    successTxIds.push(revealTxId);
    await (0, utils_1.waitForTransaction)({
        txId: revealTxId,
        sandshrewBtcClient: provider.sandshrew,
    });
    const { psbt: transferPsbt } = await (0, exports.transfer)({
        feeRate,
        account,
        provider,
        revealTxId,
        commitChangeUtxoId: commitTxId,
        toAddress,
    });
    const { signedPsbt: transferSigned } = await signer.signAllInputs({
        rawPsbt: transferPsbt,
        finalize: true,
    });
    const transferFee = await (0, utils_1.getFee)({
        provider,
        psbt: transferSigned,
        feeRate: feeRate,
    });
    const { psbt: finalTransferPsbt } = await (0, exports.transfer)({
        feeRate,
        account,
        provider,
        revealTxId,
        commitChangeUtxoId: commitTxId,
        toAddress,
        fee: transferFee,
    });
    const { signedPsbt: finalTransferSigned } = await signer.signAllInputs({
        rawPsbt: finalTransferPsbt,
        finalize: true,
    });
    const { txId: transferTxId } = await provider.pushPsbt({
        psbtBase64: finalTransferSigned,
    });
    return {
        txId: transferTxId,
        rawTxn: finalTransferSigned,
        sendBrc20Txids: [...successTxIds, transferTxId],
    };
};
exports.send = send;
//# sourceMappingURL=brc20.js.map