"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.etchReveal = exports.etchCommit = exports.mint = exports.send = exports.actualEtchRevealFee = exports.actualEtchCommitFee = exports.actualMintFee = exports.actualSendFee = exports.findRuneUtxos = exports.getRuneOutpoints = exports.createEtchReveal = exports.createEtchCommit = exports.createMintPsbt = exports.createSendPsbt = void 0;
const tslib_1 = require("tslib");
const btc_1 = require("../btc/btc");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const utils_1 = require("../shared/utils");
const errors_1 = require("../errors");
const utils_2 = require("../shared/utils");
const bip371_1 = require("bitcoinjs-lib/src/psbt/bip371");
const bip341_1 = require("bitcoinjs-lib/src/payments/bip341");
const runestone_lib_1 = require("@magiceden-oss/runestone-lib");
const createSendPsbt = async ({ gatheredUtxos, account, runeId, provider, inscriptionAddress = account.taproot.address, toAddress, amount, feeRate, fee, }) => {
    try {
        const originalGatheredUtxos = gatheredUtxos;
        const minFee = (0, btc_1.minimumFee)({
            taprootInputCount: 2,
            nonTaprootInputCount: 0,
            outputCount: 3,
        });
        const calculatedFee = minFee * feeRate < 250 ? 250 : minFee * feeRate;
        let finalFee = fee ? fee : calculatedFee;
        gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee) + Number(utils_1.inscriptionSats));
        if (gatheredUtxos.utxos.length > 1) {
            const txSize = (0, btc_1.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 3,
            });
            finalFee = Math.max(txSize * feeRate, 250);
            gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee) + Number(amount));
        }
        let psbt = new bitcoin.Psbt({ network: provider.network });
        const { runeUtxos, runeTotalSatoshis, divisibility } = await (0, exports.findRuneUtxos)({
            address: inscriptionAddress,
            greatestToLeast: account.spendStrategy.utxoSortGreatestToLeast,
            provider,
            runeId,
            targetNumberOfRunes: amount,
        });
        for await (const utxo of runeUtxos) {
            if ((0, utils_2.getAddressType)(utxo.address) === 0) {
                const previousTxHex = await provider.esplora.getTxHex(utxo.txId);
                psbt.addInput({
                    hash: utxo.txId,
                    index: parseInt(utxo.outputIndex),
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
                    index: parseInt(utxo.outputIndex),
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
                    index: parseInt(utxo.outputIndex),
                    witnessUtxo: {
                        value: utxo.satoshis,
                        script: Buffer.from(utxo.scriptPk, 'hex'),
                    },
                });
            }
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
        const script = (0, utils_1.createRuneSendScript)({
            runeId,
            amount,
            divisibility,
            sendOutputIndex: 2,
            pointer: 1,
        });
        const output = { script: script, value: 0 };
        psbt.addOutput(output);
        const changeAmount = gatheredUtxos.totalAmount - (finalFee + utils_1.inscriptionSats);
        psbt.addOutput({
            value: utils_1.inscriptionSats,
            address: account.taproot.address,
        });
        psbt.addOutput({
            value: runeTotalSatoshis,
            address: toAddress,
        });
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
const createMintPsbt = async ({ gatheredUtxos, account, runeId, provider, feeRate, fee, }) => {
    try {
        const originalGatheredUtxos = gatheredUtxos;
        const minTxSize = (0, btc_1.minimumFee)({
            taprootInputCount: 2,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        let calculatedFee = Math.max(minTxSize * feeRate, 250);
        let finalFee = fee ?? calculatedFee;
        gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee) + Number(utils_1.inscriptionSats));
        let psbt = new bitcoin.Psbt({ network: provider.network });
        if (!fee && gatheredUtxos.utxos.length > 1) {
            const txSize = (0, btc_1.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 2,
            });
            finalFee = txSize * feeRate < 250 ? 250 : txSize * feeRate;
            if (gatheredUtxos.totalAmount < finalFee + utils_1.inscriptionSats) {
                throw new errors_1.OylTransactionError(Error('Insufficient Balance'));
            }
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
        const script = (0, utils_1.createRuneMintScript)({
            runeId,
            pointer: 1,
        });
        const output = { script, value: 0 };
        psbt.addOutput(output);
        const changeAmount = gatheredUtxos.totalAmount - (finalFee + utils_1.inscriptionSats);
        psbt.addOutput({
            value: utils_1.inscriptionSats,
            address: account.taproot.address,
        });
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
exports.createMintPsbt = createMintPsbt;
const createEtchCommit = async ({ gatheredUtxos, taprootKeyPair, tweakedTaprootKeyPair, runeName, account, provider, feeRate, fee, }) => {
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
        let runeNameHex = (0, utils_1.runeFromStr)(runeName).toString(16);
        if (runeNameHex.length % 2 !== 0) {
            runeNameHex = '0' + runeNameHex;
        }
        const runeNameLittleEndian = (0, utils_1.hexToLittleEndian)(runeNameHex);
        const runeNameLittleEndianUint8 = Uint8Array.from(Buffer.from(runeNameLittleEndian, 'hex'));
        let script = [
            (0, bip371_1.toXOnly)(tweakedTaprootKeyPair.publicKey),
            bitcoin.opcodes.OP_CHECKSIG,
            bitcoin.opcodes.OP_0,
            bitcoin.opcodes.OP_IF,
            Buffer.from(runeNameLittleEndianUint8),
            bitcoin.opcodes.OP_ENDIF,
        ];
        const outputScript = bitcoin.script.compile(script);
        const inscriberInfo = bitcoin.payments.p2tr({
            internalPubkey: (0, bip371_1.toXOnly)(tweakedTaprootKeyPair.publicKey),
            scriptTree: { output: outputScript },
            network: provider.network,
        });
        psbt.addOutput({
            value: Number(finalFee) + utils_1.inscriptionSats,
            address: inscriberInfo.address,
        });
        gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee) + Number(utils_1.inscriptionSats));
        if (!fee && gatheredUtxos.utxos.length > 1) {
            const txSize = (0, btc_1.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 2,
            });
            finalFee = txSize * feeRate < 250 ? 250 : txSize * feeRate;
            if (gatheredUtxos.totalAmount < finalFee) {
                gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee) + Number(utils_1.inscriptionSats));
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
        if (gatheredUtxos.totalAmount < finalFee + utils_1.inscriptionSats) {
            throw new errors_1.OylTransactionError(Error('Insufficient Balance'));
        }
        const changeAmount = gatheredUtxos.totalAmount - (finalFee * 2 + utils_1.inscriptionSats);
        psbt.addOutput({
            address: account[account.spendStrategy.changeAddress].address,
            value: changeAmount,
        });
        const formattedPsbtTx = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: account.taproot.pubkey,
            network: provider.network,
        });
        return { psbt: formattedPsbtTx.toBase64(), script: outputScript };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.createEtchCommit = createEtchCommit;
const createEtchReveal = async ({ symbol, cap, premine, perMintAmount, turbo, divisibility, runeName, receiverAddress, script, feeRate, tweakedTaprootKeyPair, provider, fee = 0, commitTxId, }) => {
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
        const runestone = (0, runestone_lib_1.encodeRunestone)({
            etching: {
                runeName,
                divisibility,
                symbol,
                premine,
                terms: {
                    cap,
                    amount: perMintAmount,
                },
                turbo,
            },
            pointer: 1,
        }).encodedRunestone;
        psbt.addOutput({
            value: 0,
            script: runestone,
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
exports.createEtchReveal = createEtchReveal;
const getRuneOutpoints = async ({ address, provider, runeId, }) => {
    const addressOutpoints = await provider.ord.getOrdData(address);
    const spacedRuneName = await provider.ord.getRuneById(runeId);
    const runeName = spacedRuneName.entry.spaced_rune;
    const ordOutputs = await batchOrdOutput({
        outpoints: addressOutpoints.outputs,
        provider: provider,
        rune_name: runeName,
    });
    const runeUtxosOutpoints = await mapRuneBalances({
        ordOutputs: ordOutputs,
        provider: provider,
    });
    return runeUtxosOutpoints;
};
exports.getRuneOutpoints = getRuneOutpoints;
const mapRuneBalances = async ({ ordOutputs, provider, }) => {
    const runeOutpoints = [];
    for (let i = 0; i < ordOutputs.length; i++) {
        const singleRuneOutpoint = {};
        singleRuneOutpoint['output'] = ordOutputs[i].result.output;
        singleRuneOutpoint['wallet_addr'] = ordOutputs[i].result.address;
        const [txId, txIndex] = ordOutputs[i].result.output.split(':');
        singleRuneOutpoint['pkscript'] = (await provider.esplora.getTxInfo(txId)).vout[txIndex].scriptpubkey;
        singleRuneOutpoint['balances'] = [];
        singleRuneOutpoint['decimals'] = [];
        singleRuneOutpoint['rune_ids'] = [];
        for (const rune in ordOutputs[i].result.runes) {
            singleRuneOutpoint['balances'].push(ordOutputs[i].result.runes[rune].amount);
            singleRuneOutpoint['decimals'].push(ordOutputs[i].result.runes[rune].divisibility);
            singleRuneOutpoint['rune_ids'].push((await provider.ord.getRuneByName(rune)).id);
        }
        runeOutpoints.push(singleRuneOutpoint);
    }
    return runeOutpoints;
};
const batchOrdOutput = async ({ outpoints, provider, rune_name, }) => {
    const MAX_OUTPOINTS_PER_CALL = 1000;
    const ordOutputs = [];
    for (let i = 0; i < outpoints.length; i += MAX_OUTPOINTS_PER_CALL) {
        const batch = outpoints.slice(i, i + MAX_OUTPOINTS_PER_CALL);
        const multiCall = batch.map((outpoint) => {
            return ['ord_output', [outpoint]];
        });
        const results = await provider.sandshrew.multiCall(multiCall);
        for (let i = 0; i < results.length; i++) {
            results[i].result['output'] = batch[i];
        }
        const filteredResult = results.filter((output) => Object.keys(output.result.runes).includes(rune_name));
        ordOutputs.push(...filteredResult);
    }
    return ordOutputs;
};
const findRuneUtxos = async ({ address, greatestToLeast, provider, runeId, targetNumberOfRunes, }) => {
    const runeUtxos = [];
    const runeUtxoOutpoints = await (0, exports.getRuneOutpoints)({
        address: address,
        provider: provider,
        runeId: runeId,
    });
    if (greatestToLeast) {
        runeUtxoOutpoints?.sort((a, b) => b.satoshis - a.satoshis);
    }
    else {
        runeUtxoOutpoints?.sort((a, b) => a.satoshis - b.satoshis);
    }
    let runeTotalSatoshis = 0;
    let runeTotalAmount = 0;
    let divisibility;
    for (const rune of runeUtxoOutpoints) {
        if (runeTotalAmount < targetNumberOfRunes) {
            const index = rune.rune_ids.indexOf(runeId);
            if (index !== -1) {
                const txSplit = rune.output.split(':');
                const txHash = txSplit[0];
                const txIndex = txSplit[1];
                const txDetails = await provider.esplora.getTxInfo(txHash);
                if (!txDetails?.vout || txDetails.vout.length < 1) {
                    throw new Error('Unable to find rune utxo');
                }
                const outputId = `${txHash}:${txIndex}`;
                const [inscriptionsOnOutput] = await Promise.all([
                    provider.ord.getTxOutput(outputId),
                ]);
                if (inscriptionsOnOutput.inscriptions.length > 0) {
                    throw new Error('Unable to send from UTXO with multiple inscriptions. Split UTXO before sending.');
                }
                const satoshis = txDetails.vout[txIndex].value;
                const holderAddress = rune.wallet_addr;
                runeUtxos.push({
                    txId: txHash,
                    outputIndex: txIndex,
                    scriptPk: rune.pkscript,
                    address: holderAddress,
                    amountOfRunes: rune.balances[index],
                    satoshis,
                });
                runeTotalSatoshis += satoshis;
                runeTotalAmount += rune.balances[index] / 10 ** rune.decimals[index];
                if (divisibility === undefined) {
                    divisibility = rune.decimals[index];
                }
            }
        }
        else {
            break;
        }
    }
    return { runeUtxos, runeTotalSatoshis, divisibility };
};
exports.findRuneUtxos = findRuneUtxos;
const actualSendFee = async ({ gatheredUtxos, account, runeId, provider, inscriptionAddress = account.taproot.address, toAddress, amount, feeRate, signer, }) => {
    if (!feeRate) {
        feeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbt } = await (0, exports.createSendPsbt)({
        gatheredUtxos,
        account,
        runeId,
        provider,
        inscriptionAddress,
        toAddress,
        amount,
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
    const { psbt: finalPsbt } = await (0, exports.createSendPsbt)({
        gatheredUtxos,
        account,
        runeId,
        provider,
        inscriptionAddress,
        toAddress,
        amount,
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
exports.actualSendFee = actualSendFee;
const actualMintFee = async ({ gatheredUtxos, account, runeId, provider, feeRate, signer, }) => {
    if (!feeRate) {
        feeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbt } = await (0, exports.createMintPsbt)({
        gatheredUtxos,
        account,
        runeId,
        provider,
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
    const { psbt: finalPsbt } = await (0, exports.createMintPsbt)({
        gatheredUtxos,
        account,
        runeId,
        provider,
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
exports.actualMintFee = actualMintFee;
const actualEtchCommitFee = async ({ tweakedTaprootKeyPair, taprootKeyPair, gatheredUtxos, account, runeName, provider, feeRate, signer, }) => {
    if (!feeRate) {
        feeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbt } = await (0, exports.createEtchCommit)({
        gatheredUtxos,
        taprootKeyPair,
        tweakedTaprootKeyPair,
        runeName,
        account,
        provider,
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
    const { psbt: finalPsbt } = await (0, exports.createEtchCommit)({
        gatheredUtxos,
        taprootKeyPair,
        tweakedTaprootKeyPair,
        runeName,
        account,
        provider,
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
exports.actualEtchCommitFee = actualEtchCommitFee;
const actualEtchRevealFee = async ({ tweakedTaprootKeyPair, taprootKeyPair, symbol, cap, premine, perMintAmount, turbo, divisibility, runeName, commitTxId, receiverAddress, script, account, provider, feeRate, signer, }) => {
    if (!feeRate) {
        feeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbt } = await (0, exports.createEtchReveal)({
        commitTxId,
        receiverAddress,
        script,
        tweakedTaprootKeyPair,
        symbol,
        cap,
        premine,
        perMintAmount,
        turbo,
        divisibility,
        runeName,
        provider,
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
    const { psbt: finalPsbt } = await (0, exports.createEtchReveal)({
        commitTxId,
        receiverAddress,
        script,
        tweakedTaprootKeyPair,
        symbol,
        cap,
        premine,
        perMintAmount,
        turbo,
        divisibility,
        runeName,
        provider,
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
exports.actualEtchRevealFee = actualEtchRevealFee;
const send = async ({ gatheredUtxos, toAddress, amount, runeId, inscriptionAddress, feeRate, account, provider, signer, }) => {
    if (!inscriptionAddress) {
        inscriptionAddress = account.taproot.address;
    }
    const { fee } = await (0, exports.actualSendFee)({
        gatheredUtxos,
        account,
        runeId,
        amount,
        provider,
        toAddress,
        inscriptionAddress,
        feeRate,
        signer,
    });
    const { psbt: finalPsbt } = await (0, exports.createSendPsbt)({
        gatheredUtxos,
        account,
        runeId,
        amount,
        provider,
        toAddress,
        inscriptionAddress,
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
const mint = async ({ gatheredUtxos, account, runeId, provider, feeRate, signer, }) => {
    const { fee } = await (0, exports.actualMintFee)({
        gatheredUtxos,
        account,
        runeId,
        provider,
        feeRate,
        signer,
    });
    const { psbt: finalPsbt } = await (0, exports.createMintPsbt)({
        gatheredUtxos,
        account,
        runeId,
        provider,
        feeRate,
        fee: fee,
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
exports.mint = mint;
const etchCommit = async ({ gatheredUtxos, runeName, account, provider, feeRate, signer, }) => {
    const tweakedTaprootKeyPair = (0, utils_1.tweakSigner)(signer.taprootKeyPair, {
        network: provider.network,
    });
    const { fee: commitFee } = await (0, exports.actualEtchCommitFee)({
        gatheredUtxos,
        taprootKeyPair: signer.taprootKeyPair,
        tweakedTaprootKeyPair,
        runeName,
        account,
        provider,
        feeRate,
        signer,
    });
    const { psbt: finalPsbt, script } = await (0, exports.createEtchCommit)({
        gatheredUtxos,
        taprootKeyPair: signer.taprootKeyPair,
        tweakedTaprootKeyPair,
        runeName,
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
exports.etchCommit = etchCommit;
const etchReveal = async ({ symbol, cap, premine, perMintAmount, turbo, divisibility, commitTxId, script, runeName, account, provider, feeRate, signer, }) => {
    const tweakedTaprootKeyPair = (0, utils_1.tweakSigner)(signer.taprootKeyPair, {
        network: provider.network,
    });
    const { fee } = await (0, exports.actualEtchRevealFee)({
        taprootKeyPair: signer.taprootKeyPair,
        tweakedTaprootKeyPair,
        receiverAddress: account.taproot.address,
        commitTxId,
        script: Buffer.from(script, 'hex'),
        symbol,
        cap,
        premine,
        perMintAmount,
        turbo,
        divisibility,
        runeName,
        account,
        provider,
        feeRate,
        signer,
    });
    const { psbt: finalRevealPsbt } = await (0, exports.createEtchReveal)({
        tweakedTaprootKeyPair,
        receiverAddress: account.taproot.address,
        commitTxId,
        script: Buffer.from(script, 'hex'),
        symbol,
        cap,
        premine,
        perMintAmount,
        turbo,
        divisibility,
        runeName,
        provider,
        feeRate,
        fee,
    });
    const { signedPsbt: revealSignedPsbt } = await signer.signAllInputs({
        rawPsbt: finalRevealPsbt,
        finalize: true,
    });
    const revealResult = await provider.pushPsbt({
        psbtBase64: revealSignedPsbt,
    });
    return revealResult;
};
exports.etchReveal = etchReveal;
//# sourceMappingURL=rune.js.map