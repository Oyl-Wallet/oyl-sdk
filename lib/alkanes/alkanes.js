"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deployCommit = exports.bumpFee = exports.createBumpFeePsbt = exports.actualBumpFeeFee = exports.createTransactReveal = exports.execute = exports.executeReveal = exports.actualExecuteFee = exports.actualTransactRevealFee = exports.findAlkaneUtxos = exports.createDeployReveal = exports.createDeployCommit = exports.createExecutePsbt = void 0;
const tslib_1 = require("tslib");
const btc_1 = require("../btc");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const index_1 = require("alkanes/lib/index");
const utils_1 = require("../shared/utils");
const errors_1 = require("../errors");
const utils_2 = require("../shared/utils");
const bip371_1 = require("bitcoinjs-lib/src/psbt/bip371");
const bip341_1 = require("bitcoinjs-lib/src/payments/bip341");
const contract_1 = require("./contract");
const createExecutePsbt = async ({ gatheredUtxos, account, protostone, provider, feeRate, fee = 0, }) => {
    try {
        const originalGatheredUtxos = gatheredUtxos;
        const minTxSize = (0, btc_1.minimumFee)({
            taprootInputCount: 2,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        let calculatedFee = Math.max(minTxSize * feeRate, 250);
        let finalFee = fee === 0 ? calculatedFee : fee;
        gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee));
        let psbt = new bitcoin.Psbt({ network: provider.network });
        if (fee === 0 && gatheredUtxos.utxos.length > 1) {
            const txSize = (0, btc_1.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 2,
            });
            finalFee = txSize * feeRate < 250 ? 250 : txSize * feeRate;
            if (gatheredUtxos.totalAmount < finalFee) {
                throw new errors_1.OylTransactionError(Error('Insufficient Balance'));
            }
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
                    sequence: 0xfffffffd,
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
                    sequence: 0xfffffffd,
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
                    sequence: 0xfffffffd,
                    witnessUtxo: {
                        value: gatheredUtxos.utxos[i].satoshis,
                        script: Buffer.from(gatheredUtxos.utxos[i].scriptPk, 'hex'),
                    },
                });
            }
        }
        psbt.addOutput({
            address: account.taproot.address,
            value: 546,
        });
        const output = { script: protostone, value: 0 };
        psbt.addOutput(output);
        const changeAmount = gatheredUtxos.totalAmount - finalFee - 546;
        psbt.addOutput({
            address: account[account.spendStrategy.changeAddress].address,
            value: changeAmount,
        });
        const formattedPsbtTx = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: account.taproot.pubkey,
            network: provider.network,
        });
        return {
            psbt: formattedPsbtTx.toBase64(),
            psbtHex: formattedPsbtTx.toHex(),
        };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.createExecutePsbt = createExecutePsbt;
const createDeployCommit = async ({ payload, gatheredUtxos, tweakedTaprootKeyPair, account, provider, feeRate, fee, }) => {
    try {
        const originalGatheredUtxos = gatheredUtxos;
        const minFee = (0, btc_1.minimumFee)({
            taprootInputCount: 2,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        const calculatedFee = minFee * feeRate < 250 ? 250 : minFee * feeRate;
        let finalFee = fee ? fee : calculatedFee;
        let psbt = new bitcoin.Psbt({ network: provider.network });
        const script = Buffer.from((0, index_1.p2tr_ord_reveal)((0, bip371_1.toXOnly)(tweakedTaprootKeyPair.publicKey), [payload])
            .script);
        const inscriberInfo = bitcoin.payments.p2tr({
            internalPubkey: (0, bip371_1.toXOnly)(tweakedTaprootKeyPair.publicKey),
            scriptTree: {
                output: script,
            },
            network: provider.network,
        });
        const wasmDeploySize = (0, utils_1.getVSize)(Buffer.from(payload.body)) * feeRate;
        gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, wasmDeploySize + Number(utils_1.inscriptionSats) + finalFee * 2);
        if (!fee && gatheredUtxos.utxos.length > 1) {
            const txSize = (0, btc_1.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 2,
            });
            finalFee = txSize * feeRate < 250 ? 250 : txSize * feeRate;
            if (gatheredUtxos.totalAmount < finalFee) {
                gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, wasmDeploySize + Number(utils_1.inscriptionSats) + finalFee * 2);
            }
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
        if (gatheredUtxos.totalAmount <
            finalFee * 2 + utils_1.inscriptionSats + wasmDeploySize) {
            throw new errors_1.OylTransactionError(Error('Insufficient Balance'));
        }
        psbt.addOutput({
            value: finalFee + wasmDeploySize + 546,
            address: inscriberInfo.address,
        });
        const changeAmount = gatheredUtxos.totalAmount -
            (finalFee * 2 + wasmDeploySize + utils_1.inscriptionSats);
        psbt.addOutput({
            address: account[account.spendStrategy.changeAddress].address,
            value: changeAmount,
        });
        const formattedPsbtTx = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: account.taproot.pubkey,
            network: provider.network,
        });
        return { psbt: formattedPsbtTx.toBase64(), script };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.createDeployCommit = createDeployCommit;
const createDeployReveal = async ({ protostone, receiverAddress, script, feeRate, tweakedTaprootKeyPair, provider, fee = 0, commitTxId, }) => {
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
        const revealTxBaseFee = minFee * feeRate < 250 ? 250 : minFee * feeRate;
        const revealTxChange = fee === 0 ? 0 : Number(revealTxBaseFee) - fee;
        const commitTxOutput = await (0, utils_1.getOutputValueByVOutIndex)({
            txId: commitTxId,
            vOut: 0,
            esploraRpc: provider.esplora,
        });
        if (!commitTxOutput) {
            throw new errors_1.OylTransactionError(new Error('Error getting vin #0 value'));
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
            address: receiverAddress,
        });
        psbt.addOutput({
            value: 0,
            script: protostone,
        });
        if (revealTxChange > 546) {
            psbt.addOutput({
                value: revealTxChange,
                address: receiverAddress,
            });
        }
        return {
            psbt: psbt.toBase64(),
            fee: revealTxChange,
        };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.createDeployReveal = createDeployReveal;
const findAlkaneUtxos = async ({ address, greatestToLeast, provider, alkaneId, targetNumberOfAlkanes, }) => {
    const res = await provider.alkanes.getAlkanesByAddress({
        address: address,
        protocolTag: '1',
    });
    const matchingRunesWithOutpoints = res.flatMap((outpoint) => outpoint.runes
        .filter((value) => value.rune.id.block === alkaneId.block &&
        value.rune.id.tx === alkaneId.tx)
        .map((rune) => ({ rune, outpoint })));
    const sortedRunesWithOutpoints = matchingRunesWithOutpoints.sort((a, b) => greatestToLeast
        ? Number(b.rune.balance) - Number(a.rune.balance)
        : Number(a.rune.balance) - Number(b.rune.balance));
    let totalSatoshis = 0;
    let totalBalanceBeingSent = 0;
    const alkaneUtxos = [];
    for (const alkane of sortedRunesWithOutpoints) {
        if (totalBalanceBeingSent < targetNumberOfAlkanes &&
            Number(alkane.rune.balance) > 0) {
            const satoshis = Number(alkane.outpoint.output.value);
            alkaneUtxos.push({
                txId: alkane.outpoint.outpoint.txid,
                txIndex: alkane.outpoint.outpoint.vout,
                script: alkane.outpoint.output.script,
                address,
                amountOfAlkanes: alkane.rune.balance,
                satoshis,
            });
            totalSatoshis += satoshis;
            totalBalanceBeingSent +=
                Number(alkane.rune.balance) / 10 ** alkane.rune.rune.divisibility;
        }
        else {
            break;
        }
    }
    return { alkaneUtxos, totalSatoshis };
};
exports.findAlkaneUtxos = findAlkaneUtxos;
const actualTransactRevealFee = async ({ protostone, tweakedTaprootKeyPair, commitTxId, receiverAddress, script, provider, feeRate, }) => {
    if (!feeRate) {
        feeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbt: initReveal } = await (0, exports.createTransactReveal)({
        protostone,
        commitTxId,
        receiverAddress,
        script,
        tweakedTaprootKeyPair,
        provider,
        feeRate,
    });
    let rawPsbt = bitcoin.Psbt.fromBase64(initReveal, {
        network: provider.network,
    });
    rawPsbt.signInput(0, tweakedTaprootKeyPair);
    rawPsbt.finalizeInput(0);
    const rawSignedPsbt = rawPsbt.extractTransaction().toHex();
    const vsize = (await provider.sandshrew.bitcoindRpc.testMemPoolAccept([rawSignedPsbt]))[0].vsize;
    const correctFee = vsize * feeRate;
    const { psbt: finalReveal } = await (0, exports.createTransactReveal)({
        protostone,
        commitTxId,
        receiverAddress,
        script,
        tweakedTaprootKeyPair,
        provider,
        feeRate,
        fee: correctFee,
    });
    let finalPsbt = bitcoin.Psbt.fromBase64(finalReveal, {
        network: provider.network,
    });
    finalPsbt.signInput(0, tweakedTaprootKeyPair);
    finalPsbt.finalizeInput(0);
    const finalSignedPsbt = rawPsbt.extractTransaction().toHex();
    const finalVsize = (await provider.sandshrew.bitcoindRpc.testMemPoolAccept([finalSignedPsbt]))[0].vsize;
    const finalFee = finalVsize * feeRate;
    return { fee: finalFee };
};
exports.actualTransactRevealFee = actualTransactRevealFee;
const actualExecuteFee = async ({ gatheredUtxos, account, protostone, provider, feeRate, signer, }) => {
    if (!feeRate) {
        feeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbt } = await (0, exports.createExecutePsbt)({
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
    });
    const { signedPsbt } = await signer.signAllInputs({
        rawPsbt: psbt,
        finalize: true,
    });
    let rawPsbt = bitcoin.Psbt.fromBase64(signedPsbt, {
        network: account.network,
    })
        .extractTransaction()
        .toHex();
    const vsize = (await provider.sandshrew.bitcoindRpc.testMemPoolAccept([rawPsbt]))[0].vsize;
    const correctFee = vsize * feeRate;
    const { psbt: finalPsbt } = await (0, exports.createExecutePsbt)({
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
        fee: correctFee,
    });
    const { signedPsbt: finalSignedPsbt } = await signer.signAllInputs({
        rawPsbt: finalPsbt,
        finalize: true,
    });
    let finalRawPsbt = bitcoin.Psbt.fromBase64(finalSignedPsbt, {
        network: account.network,
    })
        .extractTransaction()
        .toHex();
    const finalVsize = (await provider.sandshrew.bitcoindRpc.testMemPoolAccept([finalRawPsbt]))[0].vsize;
    const finalFee = finalVsize * feeRate;
    return { fee: finalFee };
};
exports.actualExecuteFee = actualExecuteFee;
const executeReveal = async ({ protostone, commitTxId, script, account, provider, feeRate, signer, }) => {
    const tweakedTaprootKeyPair = (0, utils_1.tweakSigner)(signer.taprootKeyPair, {
        network: provider.network,
    });
    const { fee } = await (0, exports.actualTransactRevealFee)({
        protostone,
        tweakedTaprootKeyPair,
        receiverAddress: account.taproot.address,
        commitTxId,
        script: Buffer.from(script, 'hex'),
        provider,
        feeRate,
    });
    const { psbt: finalRevealPsbt } = await (0, exports.createTransactReveal)({
        protostone,
        tweakedTaprootKeyPair,
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
exports.executeReveal = executeReveal;
const execute = async ({ gatheredUtxos, account, protostone, provider, feeRate, signer, }) => {
    const { fee } = await (0, exports.actualExecuteFee)({
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
        signer,
    });
    const { psbt: finalPsbt } = await (0, exports.createExecutePsbt)({
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
        fee,
    });
    const { signedPsbt } = await signer.signAllInputs({
        rawPsbt: finalPsbt,
        finalize: true,
    });
    const revealResult = await provider.pushPsbt({
        psbtBase64: signedPsbt,
    });
    return revealResult;
};
exports.execute = execute;
const createTransactReveal = async ({ protostone, receiverAddress, script, feeRate, tweakedTaprootKeyPair, provider, fee = 0, commitTxId, }) => {
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
        const revealTxBaseFee = minFee * feeRate < 250 ? 250 : minFee * feeRate;
        const revealTxChange = fee === 0 ? 0 : Number(revealTxBaseFee) - fee;
        const commitTxOutput = await (0, utils_1.getOutputValueByVOutIndex)({
            txId: commitTxId,
            vOut: 0,
            esploraRpc: provider.esplora,
        });
        if (!commitTxOutput) {
            throw new errors_1.OylTransactionError(new Error('Error getting vin #0 value'));
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
            address: receiverAddress,
        });
        psbt.addOutput({
            value: 0,
            script: protostone,
        });
        if (revealTxChange > 546) {
            psbt.addOutput({
                value: revealTxChange,
                address: receiverAddress,
            });
        }
        return {
            psbt: psbt.toBase64(),
            fee: revealTxChange,
        };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.createTransactReveal = createTransactReveal;
const actualBumpFeeFee = async ({ txid, account, provider, newFeeRate, signer, }) => {
    if (!newFeeRate) {
        newFeeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbt } = await (0, exports.createBumpFeePsbt)({
        txid,
        account,
        provider,
        newFeeRate,
    });
    const { signedPsbt } = await signer.signAllInputs({
        rawPsbt: psbt,
        finalize: true,
    });
    let rawPsbt = bitcoin.Psbt.fromBase64(signedPsbt, {
        network: account.network,
    })
        .extractTransaction()
        .toHex();
    const vsize = (await provider.sandshrew.bitcoindRpc.testMemPoolAccept([rawPsbt]))[0].vsize;
    const correctFee = vsize * newFeeRate;
    return { fee: correctFee };
};
exports.actualBumpFeeFee = actualBumpFeeFee;
const createBumpFeePsbt = async ({ txid, account, provider, newFeeRate, fee = 0, }) => {
    try {
        const txInfo = await provider.esplora.getTxInfo(txid);
        const txHex = await provider.esplora.getTxHex(txid);
        const tx = bitcoin.Transaction.fromHex(txHex);
        let psbt = new bitcoin.Psbt({ network: provider.network });
        for (let i = 0; i < tx.ins.length; i++) {
            const input = tx.ins[i];
            const vin = txInfo.vin[i];
            psbt.addInput({
                hash: input.hash.reverse().toString('hex'),
                index: input.index,
                sequence: 0xfffffffd,
                witnessUtxo: {
                    script: Buffer.from(vin.prevout.scriptpubkey, 'hex'),
                    value: vin.prevout.value,
                }
            });
        }
        for (let i = 0; i < tx.outs.length - 1; i++) {
            psbt.addOutput({
                script: tx.outs[i].script,
                value: tx.outs[i].value
            });
        }
        const changeOutput = tx.outs[tx.outs.length - 1];
        const finalFee = fee === 0 ? newFeeRate * tx.virtualSize() : fee;
        psbt.addOutput({
            script: changeOutput.script,
            value: changeOutput.value - (finalFee - txInfo.fee)
        });
        return { psbt: psbt.toBase64() };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.createBumpFeePsbt = createBumpFeePsbt;
const bumpFee = async ({ txid, newFeeRate, account, provider, signer, }) => {
    const { fee } = await (0, exports.actualBumpFeeFee)({
        txid,
        account,
        provider,
        newFeeRate,
        signer,
    });
    const { psbt: finalPsbt } = await (0, exports.createBumpFeePsbt)({
        txid,
        account,
        provider,
        newFeeRate,
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
exports.bumpFee = bumpFee;
const deployCommit = async ({ payload, gatheredUtxos, account, provider, feeRate, signer, }) => {
    const tweakedTaprootKeyPair = (0, utils_1.tweakSigner)(signer.taprootKeyPair, {
        network: provider.network,
    });
    const { fee: commitFee } = await (0, contract_1.actualDeployCommitFee)({
        payload,
        gatheredUtxos,
        tweakedTaprootKeyPair,
        account,
        provider,
        feeRate,
        signer,
    });
    const { psbt: finalPsbt, script } = await (0, exports.createDeployCommit)({
        payload,
        gatheredUtxos,
        tweakedTaprootKeyPair,
        account,
        provider,
        feeRate,
        fee: commitFee,
    });
    const { signedPsbt } = await signer.signAllInputs({
        rawPsbt: finalPsbt,
        finalize: true,
    });
    const result = await provider.pushPsbt({
        psbtBase64: signedPsbt,
    });
    console.log('commit:', result);
    return { ...result, script: script.toString('hex') };
};
exports.deployCommit = deployCommit;
//# sourceMappingURL=alkanes.js.map