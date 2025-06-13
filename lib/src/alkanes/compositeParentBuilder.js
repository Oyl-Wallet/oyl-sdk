"use strict";
/**
 * Project Supercluster - 复合父交易构建器
 *
 * 基于现有buildSignAndBroadcastParentTransaction的扩展，实现复合父交易(TX₀)构建
 * 100% 复用现有的PSBT构建逻辑，支持多中继输出和CPFP机制
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatCompositeParentTransactionResult = exports.generateCompositeParentTransactionSummary = exports.validateCompositeParentTransactionParams = exports.validateCompositeParentTransactionOutputs = exports.buildSignAndBroadcastCompositeParentTransaction = void 0;
const tslib_1 = require("tslib");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const chainMinting_1 = require("./chainMinting");
const alkanes_1 = require("./alkanes");
const utils_1 = require("../shared/utils");
const transactionBroadcaster_1 = require("./transactionBroadcaster");
// ============================================================================
// 主要功能函数
// ============================================================================
/**
 * 构建、签名、广播复合父交易
 *
 * 复合父交易vout布局：
 * - vout 0-N: 各分片中继输出 (P2WPKH)
 * - vout N+1: OP_RETURN (Protostone指令)
 * - vout N+2: 主钱包找零 (P2TR, 可选)
 *
 * 关键特性：
 * - 100%复用现有buildSignAndBroadcastParentTransaction的PSBT逻辑
 * - 多输出版本的标准vout布局
 * - 支持CPFP加速第一个分片
 * - 保持向后兼容的Protostone消息格式
 */
async function buildSignAndBroadcastCompositeParentTransaction(config) {
    const { walletSystem, contractId, parallelFeeCalculation, provider, utxos, broadcastConfig } = config;
    try {
        console.log(`🏗️  构建复合父交易: ${contractId.block}:${contractId.tx}`);
        console.log(`   分片数量: ${walletSystem.totalSlices}`);
        console.log(`   总燃料需求: ${parallelFeeCalculation.summary.totalRequiredFunding} sats`);
        // 1. 选择足够的UTXO (复用现有逻辑)
        const totalNeeded = parallelFeeCalculation.summary.totalRequiredFunding;
        const selectedUtxos = (0, utils_1.findXAmountOfSats)(utxos, totalNeeded);
        if (selectedUtxos.totalAmount < totalNeeded) {
            throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.INSUFFICIENT_FUNDS, `主钱包资金不足: 需要 ${totalNeeded} sats, 可用 ${selectedUtxos.totalAmount} sats`, { required: totalNeeded, available: selectedUtxos.totalAmount });
        }
        console.log(`   输入: ${selectedUtxos.utxos.length} UTXOs (${selectedUtxos.totalAmount} sats)`);
        // 2. 创建PSBT (复用现有逻辑)
        const psbt = new bitcoin.Psbt({ network: provider.network });
        // 3. 添加输入 - 支持RBF (100%复用现有addRBFInput逻辑)
        for (const utxo of selectedUtxos.utxos) {
            await addRBFInput(psbt, utxo, walletSystem.mainWallet.account, provider);
        }
        // 4. 构建Protostone消息 (复用现有逻辑)
        const calldata = [
            BigInt(contractId.block),
            BigInt(contractId.tx),
            BigInt(77) // mint操作码
        ];
        const protostone = (0, alkanes_1.encodeProtostone)({
            protocolTag: 1n,
            edicts: [],
            pointer: 0,
            refundPointer: walletSystem.totalSlices + 1,
            calldata: calldata
        });
        console.log(`   Protostone: [${contractId.block}, ${contractId.tx}, 77] (${protostone.length} bytes)`);
        // 5. 添加分片中继输出 (扩展标准vout布局)
        const sliceOutputs = [];
        for (let sliceIndex = 0; sliceIndex < walletSystem.totalSlices; sliceIndex++) {
            const relayWallet = walletSystem.relayWallets[sliceIndex];
            const sliceCalculation = parallelFeeCalculation.sliceCalculations[sliceIndex];
            const relayAddress = relayWallet.address;
            const relayAmount = sliceCalculation.feeDetails.relayFuelAmount;
            // 验证dust阈值 (复用现有验证逻辑)
            (0, chainMinting_1.validateDustThreshold)(relayAmount, chainMinting_1.AddressType.P2WPKH);
            psbt.addOutput({
                address: relayAddress,
                value: relayAmount
            });
            const description = sliceCalculation.isCpfpSlice ?
                `CPFP加速分片 (${sliceCalculation.feeRate} sat/vB)` :
                `标准分片 (${sliceCalculation.feeRate} sat/vB)`;
            sliceOutputs.push({
                voutIndex: sliceIndex,
                sliceIndex,
                relayAddress,
                amount: relayAmount,
                description
            });
            console.log(`   vout${sliceIndex}: ${relayAmount} sats→分片${sliceIndex} (${sliceCalculation.mintCount} tokens, ${description})`);
        }
        // 6. 添加OP_RETURN指令输出 (复用现有逻辑)
        const instructionVoutIndex = walletSystem.totalSlices;
        psbt.addOutput({
            script: protostone,
            value: 0
        });
        console.log(`   vout${instructionVoutIndex}: OP_RETURN (Protostone指令)`);
        // 7. 计算找零并添加找零输出 (复用现有逻辑)
        const totalSliceOutputs = sliceOutputs.reduce((sum, output) => sum + output.amount, 0);
        const minerFee = parallelFeeCalculation.compositeParentTx.totalFee;
        const changeAmount = selectedUtxos.totalAmount - totalSliceOutputs - minerFee;
        let voutLayout = {
            sliceOutputs,
            instructionHub: {
                voutIndex: instructionVoutIndex,
                protostoneSize: protostone.length
            }
        };
        if (changeAmount >= 546) { // Bitcoin dust threshold
            const mainAddress = walletSystem.mainWallet.account.taproot.address;
            (0, chainMinting_1.validateDustThreshold)(changeAmount, chainMinting_1.AddressType.P2TR);
            const changeVoutIndex = instructionVoutIndex + 1;
            psbt.addOutput({
                address: mainAddress,
                value: changeAmount
            });
            voutLayout.mainWalletChange = {
                voutIndex: changeVoutIndex,
                changeAddress: mainAddress,
                amount: changeAmount
            };
            console.log(`   vout${changeVoutIndex}: ${changeAmount} sats→主钱包找零`);
        }
        // 8. 格式化PSBT用于签名 (复用现有逻辑)
        const formatted = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: walletSystem.mainWallet.account.taproot.pubkey,
            network: provider.network,
        });
        console.log(`   费用: ${minerFee} sats (${parallelFeeCalculation.compositeParentTx.feeRate} sat/vB, ${parallelFeeCalculation.compositeParentTx.vSize} vB)`);
        // 9. 立即签名并获取真实交易ID (复用现有逻辑)
        const { signedPsbtHex, realTxId } = await signPsbtAndGetTxId(formatted.toHex(), walletSystem.mainWallet.signer, '复合父交易');
        console.log(`✅ 复合父交易签名完成: ${realTxId}`);
        // 10. 立即广播复合父交易 (复用现有逻辑)
        const useCustomRpc = process.env.RPC_PROVIDER && process.env.RPC_PROVIDER !== 'sandshrew';
        console.log(`📡 广播复合父交易: ${realTxId} (${useCustomRpc ? process.env.RPC_PROVIDER : 'Provider'})`);
        let broadcastResult;
        if (useCustomRpc) {
            broadcastResult = await (0, transactionBroadcaster_1.broadcastSingleTransactionWithRpc)(signedPsbtHex, realTxId, undefined, // 使用默认的RPC客户端
            provider.networkType, broadcastConfig);
        }
        else {
            broadcastResult = await (0, transactionBroadcaster_1.broadcastSingleTransaction)(signedPsbtHex, realTxId, provider, broadcastConfig);
        }
        if (!broadcastResult.success) {
            throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.BROADCAST_ERROR, `复合父交易广播失败: ${broadcastResult.error}`, { txId: realTxId, error: broadcastResult.error });
        }
        console.log(`✅ 复合父交易广播成功，等待1秒同步...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const transaction = {
            psbtHex: signedPsbtHex,
            expectedTxId: realTxId,
            outputValue: totalSliceOutputs,
            type: 'parent',
            index: 0
        };
        return {
            transaction,
            voutLayout
        };
    }
    catch (error) {
        console.error(`💥 复合父交易构建失败:`, error.message);
        throw error instanceof chainMinting_1.ChainMintingError ? error : new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.TRANSACTION_BUILD_ERROR, `复合父交易构建失败: ${error.message}`, { contractId, totalSlices: walletSystem.totalSlices });
    }
}
exports.buildSignAndBroadcastCompositeParentTransaction = buildSignAndBroadcastCompositeParentTransaction;
// ============================================================================
// 辅助工具函数 (100%复用现有逻辑)
// ============================================================================
/**
 * 添加支持RBF的输入 (完全复用现有逻辑)
 */
async function addRBFInput(psbt, utxo, account, provider) {
    const addressType = (0, utils_1.getAddressType)(utxo.address);
    switch (addressType) {
        case 0: // P2PKH (Legacy)
            const prevHex = await provider.esplora.getTxHex(utxo.txId);
            psbt.addInput({
                hash: utxo.txId,
                index: utxo.outputIndex,
                nonWitnessUtxo: Buffer.from(prevHex, 'hex'),
                sequence: chainMinting_1.RBF_CONFIG.ENABLED_SEQUENCE, // 启用RBF
            });
            break;
        case 1: // P2WPKH (Native SegWit)
            psbt.addInput({
                hash: utxo.txId,
                index: utxo.outputIndex,
                witnessUtxo: {
                    value: utxo.satoshis,
                    script: Buffer.from(utxo.scriptPk, 'hex')
                },
                sequence: chainMinting_1.RBF_CONFIG.ENABLED_SEQUENCE, // 启用RBF
            });
            break;
        case 2: // P2SH-P2WPKH (Nested SegWit)
            const redeemScript = bitcoin.script.compile([
                bitcoin.opcodes.OP_0,
                bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex'))
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
                    ])
                },
                sequence: chainMinting_1.RBF_CONFIG.ENABLED_SEQUENCE, // 启用RBF
            });
            break;
        case 3: // P2TR (Taproot)
        default:
            psbt.addInput({
                hash: utxo.txId,
                index: utxo.outputIndex,
                witnessUtxo: {
                    value: utxo.satoshis,
                    script: Buffer.from(utxo.scriptPk, 'hex')
                },
                sequence: chainMinting_1.RBF_CONFIG.ENABLED_SEQUENCE, // 启用RBF
            });
            break;
    }
}
/**
 * 签名PSBT并获取真实交易ID (完全复用现有逻辑)
 */
async function signPsbtAndGetTxId(psbtHex, signer, txType) {
    try {
        // 签名PSBT
        const signedResult = await signer.signAllInputs({ rawPsbtHex: psbtHex });
        // 从签名的PSBT中提取真实交易ID
        const signedPsbt = bitcoin.Psbt.fromHex(signedResult.signedHexPsbt);
        const realTxId = signedPsbt.extractTransaction().getId();
        return {
            signedPsbtHex: signedResult.signedHexPsbt,
            realTxId
        };
    }
    catch (error) {
        console.error(`💥 ${txType}签名失败:`, error.message);
        throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.SIGNING_ERROR, `${txType}签名失败: ${error.message}`, { error: error.message, txType });
    }
}
// ============================================================================
// 验证和检查功能
// ============================================================================
/**
 * 验证复合父交易输出布局
 */
function validateCompositeParentTransactionOutputs(psbt, expectedSliceCount) {
    const errors = [];
    const outputs = psbt.txOutputs;
    const actualSliceCount = Math.max(0, outputs.length - 2); // 减去OP_RETURN和可能的找零
    // 检查最小输出数量 (至少包含分片输出和OP_RETURN)
    if (outputs.length < expectedSliceCount + 1) {
        errors.push(`复合父交易输出数量不足: ${outputs.length} (期望至少: ${expectedSliceCount + 1})`);
    }
    // 检查分片输出 (vout 0 到 N-1)
    for (let i = 0; i < expectedSliceCount; i++) {
        if (i >= outputs.length) {
            errors.push(`缺少分片输出 vout=${i}`);
            continue;
        }
        const sliceOutput = outputs[i];
        if (sliceOutput.value <= 0) {
            errors.push(`分片输出 vout=${i} 金额无效: ${sliceOutput.value}`);
        }
        if (sliceOutput.script.length !== 22) { // P2WPKH script length
            errors.push(`分片输出 vout=${i} 必须是P2WPKH`);
        }
    }
    // 检查OP_RETURN输出 (vout N)
    const opReturnIndex = expectedSliceCount;
    if (opReturnIndex < outputs.length) {
        const opReturnOutput = outputs[opReturnIndex];
        if (opReturnOutput.value !== 0) {
            errors.push(`OP_RETURN输出 vout=${opReturnIndex} 必须为0 sats: ${opReturnOutput.value}`);
        }
        if (opReturnOutput.script.length === 0 || opReturnOutput.script[0] !== bitcoin.opcodes.OP_RETURN) {
            errors.push(`vout=${opReturnIndex} 必须是OP_RETURN输出`);
        }
    }
    else {
        errors.push(`缺少OP_RETURN输出 vout=${opReturnIndex}`);
    }
    // 检查找零输出 (vout N+1, 可选)
    const changeIndex = expectedSliceCount + 1;
    if (changeIndex < outputs.length) {
        const changeOutput = outputs[changeIndex];
        if (changeOutput.value < 546) {
            errors.push(`找零输出 vout=${changeIndex} 低于dust阈值: ${changeOutput.value}`);
        }
    }
    return {
        isValid: errors.length === 0,
        errors,
        actualSliceCount
    };
}
exports.validateCompositeParentTransactionOutputs = validateCompositeParentTransactionOutputs;
/**
 * 验证复合父交易配置参数
 */
function validateCompositeParentTransactionParams(config) {
    const { walletSystem, contractId, parallelFeeCalculation, utxos } = config;
    const errors = [];
    // 验证钱包系统
    if (!walletSystem.mainWallet) {
        errors.push('主钱包未设置');
    }
    if (walletSystem.relayWallets.length === 0) {
        errors.push('没有中继钱包');
    }
    if (walletSystem.relayWallets.length !== walletSystem.totalSlices) {
        errors.push(`中继钱包数量不匹配: 期望${walletSystem.totalSlices}, 实际${walletSystem.relayWallets.length}`);
    }
    // 验证合约ID
    if (!contractId.block || !contractId.tx) {
        errors.push('合约ID不完整');
    }
    // 验证费用计算
    if (parallelFeeCalculation.summary.totalRequiredFunding <= 0) {
        errors.push('并行费用计算结果无效');
    }
    if (parallelFeeCalculation.sliceCalculations.length !== walletSystem.totalSlices) {
        errors.push(`分片费用计算数量不匹配: 期望${walletSystem.totalSlices}, 实际${parallelFeeCalculation.sliceCalculations.length}`);
    }
    // 验证UTXO
    if (!utxos || utxos.length === 0) {
        errors.push('没有可用的UTXO');
    }
    const totalAvailable = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
    if (totalAvailable < parallelFeeCalculation.summary.totalRequiredFunding) {
        errors.push(`主钱包UTXO总额不足: 需要 ${parallelFeeCalculation.summary.totalRequiredFunding}, 可用 ${totalAvailable}`);
    }
    return {
        isValid: errors.length === 0,
        errors
    };
}
exports.validateCompositeParentTransactionParams = validateCompositeParentTransactionParams;
/**
 * 生成复合父交易摘要
 */
function generateCompositeParentTransactionSummary(transaction, voutLayout, contractId) {
    const totalSliceOutputValue = voutLayout.sliceOutputs.reduce((sum, output) => sum + output.amount, 0);
    return {
        transactionId: transaction.expectedTxId,
        contractTarget: `${contractId.block}:${contractId.tx}`,
        timestamp: Date.now(),
        sliceCount: voutLayout.sliceOutputs.length,
        totalSliceOutputValue,
        voutLayout,
        summary: {
            mainWallet: {
                address: voutLayout.mainWalletChange?.changeAddress || 'N/A'
            },
            slices: voutLayout.sliceOutputs.map(output => ({
                sliceIndex: output.sliceIndex,
                relayAddress: output.relayAddress,
                amount: output.amount,
                voutIndex: output.voutIndex,
                description: output.description
            })),
            instruction: {
                voutIndex: voutLayout.instructionHub.voutIndex,
                protostoneSize: voutLayout.instructionHub.protostoneSize
            },
            change: voutLayout.mainWalletChange ? {
                voutIndex: voutLayout.mainWalletChange.voutIndex,
                address: voutLayout.mainWalletChange.changeAddress,
                amount: voutLayout.mainWalletChange.amount
            } : undefined
        }
    };
}
exports.generateCompositeParentTransactionSummary = generateCompositeParentTransactionSummary;
/**
 * 格式化复合父交易构建结果
 */
function formatCompositeParentTransactionResult(transaction, voutLayout) {
    const sliceOutputsText = voutLayout.sliceOutputs.map(output => `  vout${output.voutIndex}: ${output.amount} sats → 分片${output.sliceIndex} (${output.description})`).join('\n');
    const changeText = voutLayout.mainWalletChange ?
        `  vout${voutLayout.mainWalletChange.voutIndex}: ${voutLayout.mainWalletChange.amount} sats → 主钱包找零\n` : '';
    return `
🏗️  复合父交易构建结果:
├─ 交易ID: ${transaction.expectedTxId}
├─ 交易类型: ${transaction.type} (多分片)
├─ PSBT大小: ${Math.ceil(transaction.psbtHex.length / 2)} bytes
├─ 分片数量: ${voutLayout.sliceOutputs.length}
├─ 总输出金额: ${transaction.outputValue} sats
├─ 输出布局:
${sliceOutputsText}
  vout${voutLayout.instructionHub.voutIndex}: OP_RETURN (Protostone ${voutLayout.instructionHub.protostoneSize} bytes)
${changeText}└─ 状态: ✅ 已广播成功
`;
}
exports.formatCompositeParentTransactionResult = formatCompositeParentTransactionResult;
// ============================================================================
// 导出
// ============================================================================
//# sourceMappingURL=compositeParentBuilder.js.map