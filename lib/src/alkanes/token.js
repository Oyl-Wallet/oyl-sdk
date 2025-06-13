"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.actualSplitFee = exports.createSplitPsbt = exports.split = exports.actualSendFee = exports.send = exports.createSendPsbt = exports.tokenDeployment = void 0;
const tslib_1 = require("tslib");
const btc_1 = require("../btc");
const integer_1 = require("@magiceden-oss/runestone-lib/dist/src/integer");
const index_js_1 = require("alkanes/lib/index.js");
const protoruneruneid_1 = require("alkanes/lib/protorune/protoruneruneid");
const errors_1 = require("../errors");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const utils_1 = require("../shared/utils");
const psbt_1 = require("../psbt");
const alkanes_1 = require("./alkanes");
const utxo_1 = require("../utxo");
const tokenDeployment = async ({ payload, utxos, account, protostone, provider, feeRate, signer, }) => {
    const { script, txId } = await (0, alkanes_1.deployCommit)({
        payload,
        utxos,
        account,
        provider,
        feeRate,
        signer,
    });
    await (0, utils_1.timeout)(3000);
    const reveal = await (0, alkanes_1.deployReveal)({
        protostone,
        script,
        commitTxId: txId,
        account,
        provider,
        feeRate,
        signer,
    });
    return { ...reveal, commitTx: txId };
};
exports.tokenDeployment = tokenDeployment;
const createSendPsbt = async ({ utxos, account, alkaneId, provider, toAddress, amount, feeRate, fee, }) => {
    try {
        let gatheredUtxos = (0, utxo_1.selectSpendableUtxos)(utxos, account.spendStrategy);
        const minFee = (0, btc_1.minimumFee)({
            taprootInputCount: 2,
            nonTaprootInputCount: 0,
            outputCount: 3,
        });
        const calculatedFee = minFee * feeRate < 250 ? 250 : minFee * feeRate;
        let finalFee = fee ? fee : calculatedFee;
        gatheredUtxos = (0, utils_1.findXAmountOfSats)([...gatheredUtxos.utxos], Number(finalFee) + Number(utils_1.inscriptionSats));
        if (gatheredUtxos.utxos.length > 1) {
            const txSize = (0, btc_1.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 3,
            });
            finalFee = Math.max(txSize * feeRate, 250);
            gatheredUtxos = (0, utils_1.findXAmountOfSats)([...gatheredUtxos.utxos], Number(finalFee) + Number(utils_1.inscriptionSats));
        }
        let psbt = new bitcoin.Psbt({ network: provider.network });
        const alkanesUtxos = await (0, utxo_1.selectAlkanesUtxos)({
            utxos,
            alkaneId,
            greatestToLeast: account.spendStrategy.utxoSortGreatestToLeast,
            targetNumberOfAlkanes: amount,
        });
        if (alkanesUtxos.utxos.length === 0) {
            throw new errors_1.OylTransactionError(Error('No Alkane Utxos Found'));
        }
        for await (const utxo of alkanesUtxos.utxos) {
            if ((0, utils_1.getAddressType)(utxo.address) === 0) {
                const previousTxHex = await provider.esplora.getTxHex(utxo.txId);
                psbt.addInput({
                    hash: utxo.txId,
                    index: utxo.outputIndex,
                    nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                });
            }
            if ((0, utils_1.getAddressType)(utxo.address) === 2) {
                const redeemScript = bitcoin.script.compile([
                    bitcoin.opcodes.OP_0,
                    bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
                ]);
                psbt.addInput({
                    hash: utxo.txId,
                    index: utxo.outputIndex,
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
            if ((0, utils_1.getAddressType)(utxo.address) === 1 ||
                (0, utils_1.getAddressType)(utxo.address) === 3) {
                psbt.addInput({
                    hash: utxo.txId,
                    index: utxo.outputIndex,
                    witnessUtxo: {
                        value: utxo.satoshis,
                        script: Buffer.from(utxo.scriptPk, 'hex'),
                    },
                });
            }
        }
        if (gatheredUtxos.totalAmount < finalFee + utils_1.inscriptionSats * 2) {
            throw new errors_1.OylTransactionError(Error('Insufficient Balance'));
        }
        for (let i = 0; i < gatheredUtxos.utxos.length; i++) {
            if ((0, utils_1.getAddressType)(gatheredUtxos.utxos[i].address) === 0) {
                const previousTxHex = await provider.esplora.getTxHex(gatheredUtxos.utxos[i].txId);
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                });
            }
            if ((0, utils_1.getAddressType)(gatheredUtxos.utxos[i].address) === 2) {
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
            if ((0, utils_1.getAddressType)(gatheredUtxos.utxos[i].address) === 1 ||
                (0, utils_1.getAddressType)(gatheredUtxos.utxos[i].address) === 3) {
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
        const protostone = (0, index_js_1.encodeRunestoneProtostone)({
            protostones: [
                index_js_1.ProtoStone.message({
                    protocolTag: 1n,
                    edicts: [
                        {
                            id: new protoruneruneid_1.ProtoruneRuneId((0, integer_1.u128)(BigInt(alkaneId.block)), (0, integer_1.u128)(BigInt(alkaneId.tx))),
                            amount: (0, integer_1.u128)(BigInt(amount)),
                            output: (0, integer_1.u32)(BigInt(1)),
                        },
                    ],
                    pointer: 0,
                    refundPointer: 0,
                    calldata: Buffer.from([]),
                }),
            ],
        }).encodedRunestone;
        psbt.addOutput({
            value: utils_1.inscriptionSats,
            address: account.taproot.address,
        });
        psbt.addOutput({
            value: utils_1.inscriptionSats,
            address: toAddress,
        });
        const output = { script: protostone, value: 0 };
        psbt.addOutput(output);
        const changeAmount = gatheredUtxos.totalAmount +
            alkanesUtxos.totalAmount -
            (finalFee + utils_1.inscriptionSats * 2);
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
exports.createSendPsbt = createSendPsbt;
const send = async ({ utxos, toAddress, amount, alkaneId, feeRate, account, provider, signer, }) => {
    const { fee } = await (0, exports.actualSendFee)({
        utxos,
        account,
        alkaneId,
        amount,
        provider,
        toAddress,
        feeRate,
    });
    const { psbt: finalPsbt } = await (0, exports.createSendPsbt)({
        utxos,
        account,
        alkaneId,
        amount,
        provider,
        toAddress,
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
const actualSendFee = async ({ utxos, account, alkaneId, provider, toAddress, amount, feeRate, }) => {
    const { psbt } = await (0, exports.createSendPsbt)({
        utxos,
        account,
        alkaneId,
        provider,
        toAddress,
        amount,
        feeRate,
    });
    const { fee: estimatedFee } = await (0, psbt_1.getEstimatedFee)({
        feeRate,
        psbt,
        provider,
    });
    const { psbt: finalPsbt } = await (0, exports.createSendPsbt)({
        utxos,
        account,
        alkaneId,
        provider,
        toAddress,
        amount,
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
exports.actualSendFee = actualSendFee;
const split = async ({ alkaneUtxos, gatheredUtxos, account, protostone, provider, feeRate, signer, }) => {
    const { fee } = await (0, exports.actualSplitFee)({
        alkaneUtxos,
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
        signer,
    });
    const { psbt: finalPsbt } = await (0, exports.createSplitPsbt)({
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
    const revealResult = await provider.pushPsbt({
        psbtBase64: signedPsbt,
    });
    return revealResult;
};
exports.split = split;
const createSplitPsbt = async ({ alkaneUtxos, gatheredUtxos, account, protostone, provider, feeRate, fee = 0, }) => {
    try {
        const originalGatheredUtxos = gatheredUtxos;
        const minTxSize = (0, btc_1.minimumFee)({
            taprootInputCount: 2,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        let calculatedFee = Math.max(minTxSize * feeRate, 250);
        let finalFee = fee === 0 ? calculatedFee : fee;
        gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee) + utils_1.inscriptionSats * alkaneUtxos.utxos.length * 2);
        let psbt = new bitcoin.Psbt({ network: provider.network });
        if (alkaneUtxos) {
            for await (const utxo of alkaneUtxos.utxos) {
                if ((0, utils_1.getAddressType)(utxo.address) === 0) {
                    const previousTxHex = await provider.esplora.getTxHex(utxo.txId);
                    psbt.addInput({
                        hash: utxo.txId,
                        index: utxo.outputIndex,
                        nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                    });
                }
                if ((0, utils_1.getAddressType)(utxo.address) === 2) {
                    const redeemScript = bitcoin.script.compile([
                        bitcoin.opcodes.OP_0,
                        bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
                    ]);
                    psbt.addInput({
                        hash: utxo.txId,
                        index: utxo.outputIndex,
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
                if ((0, utils_1.getAddressType)(utxo.address) === 1 ||
                    (0, utils_1.getAddressType)(utxo.address) === 3) {
                    psbt.addInput({
                        hash: utxo.txId,
                        index: utxo.outputIndex,
                        witnessUtxo: {
                            value: utxo.satoshis,
                            script: Buffer.from(utxo.scriptPk, 'hex'),
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
            if ((0, utils_1.getAddressType)(gatheredUtxos.utxos[i].address) === 0) {
                const previousTxHex = await provider.esplora.getTxHex(gatheredUtxos.utxos[i].txId);
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                });
            }
            if ((0, utils_1.getAddressType)(gatheredUtxos.utxos[i].address) === 2) {
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
            if ((0, utils_1.getAddressType)(gatheredUtxos.utxos[i].address) === 1 ||
                (0, utils_1.getAddressType)(gatheredUtxos.utxos[i].address) === 3) {
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
        for (let i = 0; i < alkaneUtxos.utxos.length * 2; i++) {
            psbt.addOutput({
                address: account.taproot.address,
                value: utils_1.inscriptionSats,
            });
        }
        const output = { script: protostone, value: 0 };
        psbt.addOutput(output);
        const changeAmount = gatheredUtxos.totalAmount +
            (alkaneUtxos?.totalAmount || 0) -
            finalFee -
            utils_1.inscriptionSats * alkaneUtxos.utxos.length * 2;
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
exports.createSplitPsbt = createSplitPsbt;
const actualSplitFee = async ({ gatheredUtxos, account, protostone, provider, feeRate, signer, alkaneUtxos, }) => {
    if (!feeRate) {
        feeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbt } = await (0, exports.createSplitPsbt)({
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
        alkaneUtxos,
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
    const { psbt: finalPsbt } = await (0, exports.createSplitPsbt)({
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
        alkaneUtxos,
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
exports.actualSplitFee = actualSplitFee;
//# sourceMappingURL=token.js.map