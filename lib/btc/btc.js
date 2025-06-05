"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitUtxos = exports.minimumFee = exports.actualFee = exports.send = exports.createPsbt = void 0;
const tslib_1 = require("tslib");
const errors_1 = require("../errors");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const utils_1 = require("../shared/utils");
const account_1 = require("../account/account");
const utils_2 = require("../shared/utils");
const createPsbt = async ({ utxos, toAddress, amount, feeRate, account, provider, fee, }) => {
    try {
        if (!utxos?.length) {
            throw new Error('No utxos provided');
        }
        if (!feeRate) {
            throw new Error('No feeRate provided');
        }
        const minTxSize = (0, exports.minimumFee)({
            taprootInputCount: 1,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        let calculatedFee = Math.max(minTxSize * feeRate, 250);
        let finalFee = fee ?? calculatedFee;
        let gatheredUtxos = (0, utils_1.findXAmountOfSats)(utxos, Number(finalFee) + Number(amount));
        if (!fee && gatheredUtxos.utxos.length > 1) {
            const txSize = (0, exports.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 2,
            });
            finalFee = Math.max(txSize * feeRate, 250);
            gatheredUtxos = (0, utils_1.findXAmountOfSats)(utxos, Number(finalFee) + Number(amount));
        }
        if (gatheredUtxos.totalAmount < Number(finalFee) + Number(amount)) {
            throw new Error('Insufficient Balance');
        }
        const psbt = new bitcoin.Psbt({
            network: provider.network,
        });
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
            value: Number(amount),
        });
        const changeAmount = gatheredUtxos.totalAmount - (finalFee + Number(amount));
        if (changeAmount > 295) {
            psbt.addOutput({
                address: account[account.spendStrategy.changeAddress].address,
                value: changeAmount,
            });
        }
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
exports.createPsbt = createPsbt;
const send = async ({ utxos, toAddress, amount, feeRate, account, provider, signer, fee, }) => {
    if (!fee) {
        fee = (await (0, exports.actualFee)({
            utxos,
            toAddress,
            amount,
            feeRate,
            account,
            provider,
            signer,
        })).fee;
    }
    const { psbt: finalPsbt } = await (0, exports.createPsbt)({
        utxos,
        toAddress,
        amount,
        feeRate,
        fee,
        account,
        provider,
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
const actualFee = async ({ utxos, toAddress, amount, feeRate, account, provider, signer, }) => {
    const { psbt } = await (0, exports.createPsbt)({
        utxos,
        toAddress: toAddress,
        amount: amount,
        feeRate: feeRate,
        account: account,
        provider: provider,
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
        utxos,
        toAddress: toAddress,
        amount: amount,
        feeRate: feeRate,
        fee: correctFee,
        account: account,
        provider: provider,
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
const minimumFee = ({ taprootInputCount, nonTaprootInputCount, outputCount, }) => {
    return (0, utils_1.calculateTaprootTxSize)(taprootInputCount, nonTaprootInputCount, outputCount);
};
exports.minimumFee = minimumFee;
const splitUtxos = async ({ utxos, feeRate, account, provider, signer, splitConfig, fee, }) => {
    try {
        if (!utxos?.length) {
            throw new Error('No utxos provided');
        }
        if (!feeRate) {
            throw new Error('No feeRate provided');
        }
        let outputs = [];
        if (splitConfig.mode === 'amounts_and_addresses') {
            // Mode 1: Split by specified amounts and addresses
            if (splitConfig.amounts.length !== splitConfig.addresses.length) {
                throw new Error('Amounts and addresses arrays must have the same length');
            }
            outputs = splitConfig.amounts.map((amount, index) => ({
                address: splitConfig.addresses[index],
                amount,
            }));
        }
        else if (splitConfig.mode === 'auto_generate') {
            // Mode 2: Auto-generate sub-wallets and split equally
            const { amount, accountCount, mnemonic } = splitConfig;
            if (accountCount < 1) {
                throw new Error('Account count must be at least 1');
            }
            // Generate n-1 child wallets (account at index 0 is the main one)
            const childAccounts = [];
            for (let i = 1; i < accountCount; i++) {
                const childAccount = (0, account_1.mnemonicToAccount)({
                    mnemonic,
                    opts: {
                        network: account.network,
                        index: i,
                        spendStrategy: account.spendStrategy,
                    },
                });
                childAccounts.push(childAccount);
            }
            // Add main account (index 0) and child accounts
            outputs = [
                { address: account.taproot.address, amount },
                ...childAccounts.map(childAccount => ({
                    address: childAccount.taproot.address,
                    amount,
                })),
            ];
        }
        else {
            throw new Error('Invalid split mode');
        }
        // Calculate total amount needed
        const totalSplitAmount = outputs.reduce((sum, output) => sum + output.amount, 0);
        // Estimate fee
        const estimatedFee = fee || (0, exports.minimumFee)({
            taprootInputCount: 1,
            nonTaprootInputCount: 0,
            outputCount: outputs.length,
        }) * feeRate;
        const totalAmountNeeded = totalSplitAmount + estimatedFee;
        // Select UTXOs
        const gatheredUtxos = (0, utils_1.findXAmountOfSats)(utxos, totalAmountNeeded);
        if (gatheredUtxos.totalAmount < totalAmountNeeded) {
            throw new Error('Insufficient balance for split operation');
        }
        // Recalculate fee based on actual number of inputs
        const actualFee = fee || (0, exports.minimumFee)({
            taprootInputCount: gatheredUtxos.utxos.length,
            nonTaprootInputCount: 0,
            outputCount: outputs.length + 1, // +1 for potential change output
        }) * feeRate;
        const actualTotalNeeded = totalSplitAmount + actualFee;
        if (gatheredUtxos.totalAmount < actualTotalNeeded) {
            // Try again with more UTXOs
            const newGatheredUtxos = (0, utils_1.findXAmountOfSats)(utxos, actualTotalNeeded);
            if (newGatheredUtxos.totalAmount < actualTotalNeeded) {
                throw new Error('Insufficient balance for split operation including fees');
            }
            Object.assign(gatheredUtxos, newGatheredUtxos);
        }
        // Create PSBT
        const psbt = new bitcoin.Psbt({ network: provider.network });
        // Add inputs
        for (const utxo of gatheredUtxos.utxos) {
            if ((0, utils_2.getAddressType)(utxo.address) === 0) {
                const previousTxHex = await provider.esplora.getTxHex(utxo.txId);
                psbt.addInput({
                    hash: utxo.txId,
                    index: utxo.outputIndex,
                    nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                });
            }
            else if ((0, utils_2.getAddressType)(utxo.address) === 2) {
                const redeemScript = bitcoin.script.compile([
                    bitcoin.opcodes.OP_0,
                    bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
                ]);
                psbt.addInput({
                    hash: utxo.txId,
                    index: utxo.outputIndex,
                    redeemScript,
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
            else {
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
        // Add split outputs
        for (const output of outputs) {
            psbt.addOutput({
                address: output.address,
                value: output.amount,
            });
        }
        // Add change output if needed
        const changeAmount = gatheredUtxos.totalAmount - totalSplitAmount - actualFee;
        if (changeAmount > 295) { // Dust threshold
            psbt.addOutput({
                address: account[account.spendStrategy.changeAddress].address,
                value: changeAmount,
            });
        }
        // Format inputs for signing
        const updatedPsbt = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: account.taproot.pubkey,
            network: provider.network,
        });
        // Sign and broadcast
        const { signedPsbt } = await signer.signAllInputs({
            rawPsbt: updatedPsbt.toBase64(),
            finalize: true,
        });
        const result = await provider.pushPsbt({
            psbtBase64: signedPsbt,
        });
        return {
            ...result,
            outputs,
            totalSplitAmount,
            fee: actualFee,
            changeAmount: changeAmount > 295 ? changeAmount : 0,
        };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.splitUtxos = splitUtxos;
//# sourceMappingURL=btc.js.map