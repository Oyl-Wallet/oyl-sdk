"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTransactReveal = exports.execute = exports.executePsbt = exports.actualExecuteFee = exports.actualTransactRevealFee = exports.findAlkaneUtxos = exports.deployReveal = exports.createDeployRevealPsbt = exports.deployCommit = exports.createDeployCommitPsbt = exports.createExecutePsbt = exports.encodeProtostone = void 0;
const tslib_1 = require("tslib");
const btc_1 = require("../btc");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const index_1 = require("alkanes/lib/index");
const utils_1 = require("../shared/utils");
const psbt_1 = require("../psbt");
const errors_1 = require("../errors");
const utils_2 = require("../shared/utils");
const bip371_1 = require("bitcoinjs-lib/src/psbt/bip371");
const bip341_1 = require("bitcoinjs-lib/src/payments/bip341");
const contract_1 = require("./contract");
const encodeProtostone = ({ protocolTag = 1n, edicts = [], pointer = 0, refundPointer = 0, calldata, }) => {
    return (0, index_1.encodeRunestoneProtostone)({
        protostones: [
            index_1.ProtoStone.message({
                protocolTag,
                edicts,
                pointer,
                refundPointer,
                calldata: (0, index_1.encipher)(calldata),
            }),
        ],
    }).encodedRunestone;
};
exports.encodeProtostone = encodeProtostone;
const createExecutePsbt = async ({ frontendFee, feeAddress, alkaneUtxos, gatheredUtxos, account, protostone, provider, feeRate, fee = 0, }) => {
    try {
        const originalGatheredUtxos = gatheredUtxos;
        const minTxSize = (0, btc_1.minimumFee)({
            taprootInputCount: 2,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        let calculatedFee = Math.max(minTxSize * feeRate, 250);
        let finalFee = fee === 0 ? calculatedFee : fee;
        gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee) + 546 + (frontendFee || 0));
        let psbt = new bitcoin.Psbt({ network: provider.network });
        if (alkaneUtxos) {
            for await (const utxo of alkaneUtxos.alkaneUtxos) {
                if ((0, utils_2.getAddressType)(utxo.address) === 0) {
                    const previousTxHex = await provider.esplora.getTxHex(utxo.txId);
                    psbt.addInput({
                        hash: utxo.txId,
                        index: parseInt(utxo.txIndex),
                        nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                    });
                }
                if ((0, utils_2.getAddressType)(utxo.address) === 2) {
                    const redeemScript = bitcoin.script.compile([
                        bitcoin.opcodes.OP_0,
                        bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
                    ]);
                    psbt.addInput({
                        hash: utxo.txId,
                        index: parseInt(utxo.txIndex),
                        redeemScript: redeemScript,
                        witnessUtxo: {
                            value: utxo.satoshis,
                            script: bitcoin.script.compile([
                                bitcoin.opcodes.OP_HASH160,
                                bitcoin.crypto.hash160(redeemScript),
                                bitcoin.opcodes.OP_EQUAL,
                            ]),
                        },
                    });
                }
                if ((0, utils_2.getAddressType)(utxo.address) === 1 ||
                    (0, utils_2.getAddressType)(utxo.address) === 3) {
                    psbt.addInput({
                        hash: utxo.txId,
                        index: parseInt(utxo.txIndex),
                        witnessUtxo: {
                            value: utxo.satoshis,
                            script: Buffer.from(utxo.script, 'hex'),
                        },
                    });
                }
            }
        }
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
            address: account.taproot.address,
            value: 546,
        });
        const output = { script: protostone, value: 0 };
        psbt.addOutput(output);
        const changeAmount = gatheredUtxos.totalAmount +
            (alkaneUtxos?.totalSatoshis || 0) -
            finalFee -
            546 -
            (frontendFee || 0);
        throw new errors_1.OylTransactionError(new Error('The change amount is ' + changeAmount));
        psbt.addOutput({
            address: account[account.spendStrategy.changeAddress].address,
            value: changeAmount,
        });
        if (frontendFee && feeAddress) {
            psbt.addOutput({
                address: feeAddress,
                value: frontendFee,
            });
        }
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
const createDeployCommitPsbt = async ({ payload, gatheredUtxos, tweakedPublicKey, account, provider, feeRate, fee, }) => {
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
        const script = Buffer.from((0, index_1.p2tr_ord_reveal)((0, bip371_1.toXOnly)(Buffer.from(tweakedPublicKey, 'hex')), [payload])
            .script);
        const inscriberInfo = bitcoin.payments.p2tr({
            internalPubkey: (0, bip371_1.toXOnly)(Buffer.from(tweakedPublicKey, 'hex')),
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
exports.createDeployCommitPsbt = createDeployCommitPsbt;
const deployCommit = async ({ payload, gatheredUtxos, account, provider, feeRate, signer, }) => {
    const tweakedTaprootKeyPair = (0, utils_1.tweakSigner)(signer.taprootKeyPair, {
        network: provider.network,
    });
    const tweakedPublicKey = tweakedTaprootKeyPair.publicKey.toString('hex');
    const { fee: commitFee } = await (0, contract_1.actualDeployCommitFee)({
        payload,
        gatheredUtxos,
        tweakedPublicKey,
        account,
        provider,
        feeRate,
    });
    const { psbt: finalPsbt, script } = await (0, exports.createDeployCommitPsbt)({
        payload,
        gatheredUtxos,
        tweakedPublicKey,
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
    return { ...result, script: script.toString('hex') };
};
exports.deployCommit = deployCommit;
const createDeployRevealPsbt = async ({ protostone, receiverAddress, script, feeRate, tweakedPublicKey, provider, fee = 0, commitTxId, }) => {
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
            internalPubkey: (0, bip371_1.toXOnly)(Buffer.from(tweakedPublicKey, 'hex')),
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
exports.createDeployRevealPsbt = createDeployRevealPsbt;
const deployReveal = async ({ protostone, commitTxId, script, account, provider, feeRate, signer, }) => {
    const tweakedTaprootKeyPair = (0, utils_1.tweakSigner)(signer.taprootKeyPair, {
        network: provider.network,
    });
    const tweakedPublicKey = tweakedTaprootKeyPair.publicKey.toString('hex');
    const { fee } = await (0, exports.actualTransactRevealFee)({
        protostone,
        tweakedPublicKey,
        receiverAddress: account.taproot.address,
        commitTxId,
        script: Buffer.from(script, 'hex'),
        provider,
        feeRate,
    });
    const { psbt: finalRevealPsbt } = await (0, exports.createTransactReveal)({
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
const findAlkaneUtxos = async ({ address, greatestToLeast, provider, alkaneId, targetNumberOfAlkanes, }) => {
    const res = await provider.alkanes.getAlkanesByAddress({
        address: address,
        protocolTag: '1',
    });
    const matchingRunesWithOutpoints = res.flatMap((outpoint) => outpoint.runes
        .filter((value) => Number(value.rune.id.block) === Number(alkaneId.block) &&
        Number(value.rune.id.tx) === Number(alkaneId.tx))
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
                ...alkane.rune.rune,
            });
            totalSatoshis += satoshis;
            totalBalanceBeingSent +=
                Number(alkane.rune.balance) /
                    (alkane.rune.rune.divisibility == 1
                        ? 1
                        : 10 ** alkane.rune.rune.divisibility);
        }
    }
    if (totalBalanceBeingSent < targetNumberOfAlkanes) {
        throw new errors_1.OylTransactionError(Error('Insuffiecient balance of alkanes.'));
    }
    return { alkaneUtxos, totalSatoshis, totalBalanceBeingSent };
};
exports.findAlkaneUtxos = findAlkaneUtxos;
const actualTransactRevealFee = async ({ protostone, tweakedPublicKey, commitTxId, receiverAddress, script, provider, feeRate, }) => {
    if (!feeRate) {
        feeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbt } = await (0, exports.createTransactReveal)({
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
    const { psbt: finalPsbt } = await (0, exports.createTransactReveal)({
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
exports.actualTransactRevealFee = actualTransactRevealFee;
const actualExecuteFee = async ({ gatheredUtxos, account, protostone, provider, feeRate, alkaneUtxos, frontendFee, feeAddress, }) => {
    if (!feeRate) {
        feeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbt } = await (0, exports.createExecutePsbt)({
        frontendFee,
        feeAddress,
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
        alkaneUtxos,
    });
    const { fee: estimatedFee } = await (0, psbt_1.getEstimatedFee)({
        feeRate,
        psbt,
        provider,
    });
    const { psbt: finalPsbt } = await (0, exports.createExecutePsbt)({
        frontendFee,
        feeAddress,
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
        alkaneUtxos,
        fee: estimatedFee,
    });
    const { fee: finalFee, vsize } = await (0, psbt_1.getEstimatedFee)({
        feeRate,
        psbt: finalPsbt,
        provider,
    });
    return { fee: finalFee, vsize };
};
exports.actualExecuteFee = actualExecuteFee;
const executePsbt = async ({ alkaneUtxos, gatheredUtxos, account, protostone, provider, feeRate, frontendFee, feeAddress, }) => {
    const { fee } = await (0, exports.actualExecuteFee)({
        frontendFee,
        feeAddress,
        alkaneUtxos,
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
    });
    const { psbt: finalPsbt } = await (0, exports.createExecutePsbt)({
        frontendFee,
        feeAddress,
        alkaneUtxos,
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
        fee,
    });
    return { psbt: finalPsbt, fee };
};
exports.executePsbt = executePsbt;
const execute = async ({ alkaneUtxos, gatheredUtxos, account, protostone, provider, feeRate, signer, frontendFee, feeAddress, }) => {
    const { fee } = await (0, exports.actualExecuteFee)({
        frontendFee,
        feeAddress,
        alkaneUtxos,
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
    });
    const { psbt: finalPsbt } = await (0, exports.createExecutePsbt)({
        frontendFee,
        feeAddress,
        alkaneUtxos,
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
    const pushResult = await provider.pushPsbt({
        psbtBase64: signedPsbt,
    });
    return pushResult;
};
exports.execute = execute;
const createTransactReveal = async ({ protostone, receiverAddress, script, feeRate, tweakedPublicKey, provider, fee = 0, commitTxId, }) => {
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
            internalPubkey: (0, bip371_1.toXOnly)(Buffer.from(tweakedPublicKey, 'hex')),
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
//# sourceMappingURL=alkanes.js.map