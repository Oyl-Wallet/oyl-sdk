"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.alkaneMultiSend = exports.actualAlkaneMultiSendFee = exports.createAlkaneMultiSendPsbt = exports.actualSplitFee = exports.createSplitPsbt = exports.split = exports.actualSendFee = exports.send = exports.createSendPsbt = exports.inscribePayload = void 0;
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
const inscribePayload = async ({ alkanesUtxos, payload, utxos, account, protostone, provider, feeRate, signer, }) => {
    const { script, txId, commitPsbt } = await (0, alkanes_1.deployCommit)({
        payload,
        utxos,
        account,
        provider,
        feeRate,
        signer,
        protostone,
    });
    await (0, utils_1.timeout)(3000);
    const reveal = await (0, alkanes_1.deployReveal)({
        payload,
        alkanesUtxos,
        utxos,
        protostone,
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
exports.inscribePayload = inscribePayload;
const createSendPsbt = async ({ utxos, account, alkaneId, provider, toAddress, amount, feeRate, fee, }) => {
    try {
        let alkanesAddress;
        let alkanesPubkey;
        if (account.taproot) {
            alkanesAddress = account.taproot.address;
            alkanesPubkey = account.taproot.pubkey;
        }
        else if (account.nativeSegwit) {
            alkanesAddress = account.nativeSegwit.address;
            alkanesPubkey = account.nativeSegwit.pubkey;
        }
        else {
            throw new Error('No taproot or nativeSegwit address found');
        }
        const totalSpendableUtxos = (0, utxo_1.selectSpendableUtxos)(utxos, account.spendStrategy);
        const minFee = (0, btc_1.minimumFee)({
            taprootInputCount: 2,
            nonTaprootInputCount: 0,
            outputCount: 3,
        });
        const calculatedFee = minFee * feeRate < 250 ? 250 : minFee * feeRate;
        let finalFee = fee ? fee : calculatedFee;
        let gatheredUtxos = (0, utils_1.findXAmountOfSats)(totalSpendableUtxos.utxos, Number(finalFee) + Number(utils_1.inscriptionSats) * 2);
        if (gatheredUtxos.utxos.length > 1) {
            const txSize = (0, btc_1.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 3,
            });
            finalFee = Math.max(txSize * feeRate, 250);
            gatheredUtxos = (0, utils_1.findXAmountOfSats)(totalSpendableUtxos.utxos, Number(finalFee) + Number(utils_1.inscriptionSats) * 2);
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
        await (0, utils_1.addInputUtxosToPsbt)(alkanesUtxos.utxos, psbt, account, provider);
        if (gatheredUtxos.totalAmount < finalFee + utils_1.inscriptionSats * 2) {
            throw new errors_1.OylTransactionError(Error('Insufficient Balance'));
        }
        await (0, utils_1.addInputUtxosToPsbt)(gatheredUtxos.utxos, psbt, account, provider);
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
                    calldata: (0, index_js_1.encipher)([BigInt(2), BigInt(0), BigInt(77)]),
                }),
            ],
        }).encodedRunestone;
        psbt.addOutput({
            value: utils_1.inscriptionSats,
            address: alkanesAddress,
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
            senderPublicKey: alkanesPubkey,
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
        let alkanesAddress;
        let alkanesPubkey;
        if (account.taproot) {
            alkanesAddress = account.taproot.address;
            alkanesPubkey = account.taproot.pubkey;
        }
        else if (account.nativeSegwit) {
            alkanesAddress = account.nativeSegwit.address;
            alkanesPubkey = account.nativeSegwit.pubkey;
        }
        else {
            throw new Error('No taproot or nativeSegwit address found');
        }
        const originalGatheredUtxos = gatheredUtxos;
        const minTxSize = (0, btc_1.minimumFee)({
            taprootInputCount: 2,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        let calculatedFee = Math.max(minTxSize * feeRate, 250);
        let finalFee = fee === 0 ? calculatedFee : fee;
        gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee) + 546 * alkaneUtxos.utxos.length * 2);
        let psbt = new bitcoin.Psbt({ network: provider.network });
        if (alkaneUtxos) {
            await (0, utils_1.addInputUtxosToPsbt)(alkaneUtxos.utxos, psbt, account, provider);
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
        await (0, utils_1.addInputUtxosToPsbt)(gatheredUtxos.utxos, psbt, account, provider);
        for (let i = 0; i < alkaneUtxos.utxos.length * 2; i++) {
            psbt.addOutput({
                address: alkanesAddress,
                value: 546,
            });
        }
        const output = { script: protostone, value: 0 };
        psbt.addOutput(output);
        const changeAmount = gatheredUtxos.totalAmount +
            (alkaneUtxos?.totalAmount || 0) -
            finalFee -
            546 * alkaneUtxos.utxos.length * 2;
        psbt.addOutput({
            address: account[account.spendStrategy.changeAddress].address,
            value: changeAmount,
        });
        const formattedPsbtTx = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: alkanesPubkey,
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
const createAlkaneMultiSendPsbt = async ({ sends, alkaneId, utxos, account, provider, feeRate, fee = 0, }) => {
    try {
        const SAT_PER_VBYTE = feeRate ?? 1;
        const MIN_RELAY = 546n;
        let alkanesAddress;
        let alkanesPubkey;
        if (account.taproot) {
            alkanesAddress = account.taproot.address;
            alkanesPubkey = account.taproot.pubkey;
        }
        else if (account.nativeSegwit) {
            alkanesAddress = account.nativeSegwit.address;
            alkanesPubkey = account.nativeSegwit.pubkey;
        }
        else {
            throw new Error('No taproot or nativeSegwit address found');
        }
        // first output is refund, then all the send targets, then the op return
        const edicts = sends.map((send, index) => {
            return {
                id: new protoruneruneid_1.ProtoruneRuneId((0, integer_1.u128)(BigInt(alkaneId.block)), (0, integer_1.u128)(BigInt(alkaneId.tx))),
                amount: (0, integer_1.u128)(BigInt(send.amount)),
                output: (0, integer_1.u32)(BigInt(index + 1)),
            };
        });
        const totalAmount = sends.reduce((sum, send) => sum + send.amount, 0);
        const alkanesUtxos = await (0, utxo_1.selectAlkanesUtxos)({
            utxos,
            alkaneId,
            greatestToLeast: account.spendStrategy.utxoSortGreatestToLeast,
            targetNumberOfAlkanes: totalAmount,
        });
        if (alkanesUtxos.utxos.length === 0) {
            throw new errors_1.OylTransactionError(Error('No Alkane Utxos Found'));
        }
        const protostone = (0, index_js_1.encodeRunestoneProtostone)({
            protostones: [
                index_js_1.ProtoStone.message({
                    protocolTag: 1n,
                    edicts,
                    pointer: 0,
                    refundPointer: 0,
                    calldata: Buffer.from([]),
                }),
            ],
        }).encodedRunestone;
        const spendTargets = sends.length * 546;
        const minTxSize = (0, btc_1.minimumFee)({
            taprootInputCount: 1,
            nonTaprootInputCount: 0,
            outputCount: 3 + sends.length,
        });
        const minFee = Math.max(minTxSize * SAT_PER_VBYTE, 250);
        let minerFee = fee === 0 ? minFee : fee;
        let spendableUtxos = (0, utxo_1.selectSpendableUtxos)(utxos, account.spendStrategy);
        let satsNeeded = spendTargets + minerFee;
        let gatheredUtxos = (0, utils_1.findXAmountOfSats)(spendableUtxos.utxos, satsNeeded);
        if (fee === 0 && gatheredUtxos.utxos.length > 1) {
            const newSize = (0, btc_1.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 2 + sends.length,
            });
            minerFee = Math.max(newSize * SAT_PER_VBYTE, 250);
            satsNeeded = spendTargets + minerFee;
            if (gatheredUtxos.totalAmount < satsNeeded) {
                throw new errors_1.OylTransactionError(Error('Insufficient balance'));
            }
        }
        const psbt = new bitcoin.Psbt({ network: provider.network });
        await (0, utils_1.addInputUtxosToPsbt)(alkanesUtxos.utxos, psbt, account, provider);
        if (gatheredUtxos.totalAmount < satsNeeded) {
            throw new errors_1.OylTransactionError(Error('Insufficient Balance'));
        }
        await (0, utils_1.addInputUtxosToPsbt)(gatheredUtxos.utxos, psbt, account, provider);
        psbt.addOutput({
            value: utils_1.inscriptionSats,
            address: alkanesAddress,
        });
        for (const send of sends) {
            psbt.addOutput({ address: send.address, value: 546 });
        }
        psbt.addOutput({ script: protostone, value: 0 });
        const inputsTotal = gatheredUtxos.totalAmount + alkanesUtxos.totalAmount;
        const outputsTotal = psbt.txOutputs.reduce((sum, o) => sum + o.value, 0);
        let change = inputsTotal - outputsTotal - minerFee;
        if (change < 0)
            throw new errors_1.OylTransactionError(Error('Insufficient balance'));
        if (change >= Number(MIN_RELAY)) {
            psbt.addOutput({
                address: account[account.spendStrategy.changeAddress].address,
                value: change,
            });
        }
        const formatted = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: alkanesPubkey,
            network: provider.network,
        });
        return {
            psbt: formatted.toBase64(),
            psbtHex: formatted.toHex(),
        };
    }
    catch (err) {
        throw new errors_1.OylTransactionError(err);
    }
};
exports.createAlkaneMultiSendPsbt = createAlkaneMultiSendPsbt;
const actualAlkaneMultiSendFee = async ({ sends, alkaneId, utxos, account, provider, feeRate, }) => {
    const { psbt } = await (0, exports.createAlkaneMultiSendPsbt)({
        sends,
        alkaneId,
        utxos,
        account,
        provider,
        feeRate,
    });
    const { fee: estimatedFee } = await (0, psbt_1.getEstimatedFee)({
        feeRate,
        psbt,
        provider,
    });
    const { psbt: finalPsbt } = await (0, exports.createAlkaneMultiSendPsbt)({
        sends,
        alkaneId,
        utxos,
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
exports.actualAlkaneMultiSendFee = actualAlkaneMultiSendFee;
const alkaneMultiSend = async ({ sends, alkaneId, utxos, account, provider, signer, feeRate, }) => {
    const { fee } = await (0, exports.actualAlkaneMultiSendFee)({
        sends,
        alkaneId,
        utxos,
        account,
        provider,
        feeRate,
    });
    const { psbt: finalPsbt } = await (0, exports.createAlkaneMultiSendPsbt)({
        sends,
        alkaneId,
        utxos,
        account,
        provider,
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
exports.alkaneMultiSend = alkaneMultiSend;
//# sourceMappingURL=token.js.map