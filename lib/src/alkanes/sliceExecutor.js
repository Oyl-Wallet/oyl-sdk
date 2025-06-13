"use strict";
/**
 * Project Supercluster - 分片执行器
 *
 * 基于现有executeChildTransactionChainWithTracking的扩展，实现单个分片的完整执行
 * 100% 复用现有的子交易链构建和广播逻辑
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatSliceExecutionResult = exports.analyzeSliceExecutionResult = exports.validateSliceExecutionConfig = exports.executeSlice = void 0;
const chainMinting_1 = require("./chainMinting");
const transactionBuilder_1 = require("./transactionBuilder");
const transactionBroadcaster_1 = require("./transactionBroadcaster");
// ============================================================================
// 主要功能函数
// ============================================================================
/**
 * 执行单个分片的完整子交易链
 *
 * 100% 复用executeChildTransactionChainWithTracking的核心逻辑
 * 扩展支持复合父交易的多输出结构
 */
async function executeSlice(config, onProgress) {
    const { sliceIndex, compositeParentTxId, parentVoutIndex, relayWallet, mainWallet, contractId, feeCalculation, finalReceiverAddress, provider, broadcastConfig } = config;
    const startTime = Date.now();
    try {
        console.log(`🔗 执行分片 ${sliceIndex}: ${feeCalculation.mintCount} tokens`);
        console.log(`   父交易: ${compositeParentTxId.substring(0, 8)}...:${parentVoutIndex}`);
        console.log(`   中继地址: ${relayWallet.address}`);
        console.log(`   费率: ${feeCalculation.feeRate} sat/vB ${feeCalculation.isCpfpSlice ? '(CPFP加速)' : ''}`);
        // 1. 构建钱包组合 (复用现有ChainMintingWallets格式)
        const wallets = {
            mainWallet,
            relayWallet: relayWallet.wallet
        };
        // 2. 获取初始参数
        const childCount = feeCalculation.mintCount;
        const childTxFee = feeCalculation.feeDetails.childTx.totalFee;
        const initialRelayAmount = feeCalculation.feeDetails.relayFuelAmount;
        onProgress?.({
            sliceIndex,
            currentStep: 0,
            totalSteps: childCount,
            message: `准备执行 ${childCount} 笔子交易`
        });
        // 3. 执行子交易链 (100%复用现有逻辑)
        const childTransactions = await executeChildTransactionChainWithTracking({
            parentTxId: compositeParentTxId,
            parentVoutIndex,
            initialRelayAmount,
            wallets,
            contractId,
            childCount,
            childTxFee,
            finalReceiverAddress,
            provider,
            broadcastConfig,
            sliceIndex,
            onProgress: (step, txId, message) => {
                onProgress?.({
                    sliceIndex,
                    currentStep: step,
                    totalSteps: childCount,
                    currentTxId: txId,
                    message
                });
            }
        });
        const endTime = Date.now();
        const finalTransaction = childTransactions[childTransactions.length - 1];
        console.log(`✅ 分片 ${sliceIndex} 执行完成`);
        console.log(`   完成交易: ${childTransactions.length} 笔`);
        console.log(`   铸造tokens: ${feeCalculation.mintCount}`);
        console.log(`   最终输出: ${finalTransaction?.outputValue || 0} sats`);
        console.log(`   耗时: ${((endTime - startTime) / 1000).toFixed(1)} 秒`);
        return {
            sliceIndex,
            success: true,
            startTime,
            endTime,
            duration: endTime - startTime,
            childTransactions,
            mintedTokens: feeCalculation.mintCount,
            finalOutputAmount: finalTransaction?.outputValue || 0
        };
    }
    catch (error) {
        const endTime = Date.now();
        console.error(`💥 分片 ${sliceIndex} 执行失败: ${error.message}`);
        return {
            sliceIndex,
            success: false,
            startTime,
            endTime,
            duration: endTime - startTime,
            childTransactions: [],
            mintedTokens: 0,
            finalOutputAmount: 0,
            error: {
                phase: 'execution',
                message: error.message,
                details: error
            }
        };
    }
}
exports.executeSlice = executeSlice;
/**
 * 执行子交易链并实时更新进度 (100%复用现有逻辑)
 *
 * 这是对原始executeChildTransactionChainWithTracking函数的轻微扩展
 * 增加了对复合父交易vout索引的支持
 */
async function executeChildTransactionChainWithTracking({ parentTxId, parentVoutIndex = 0, // 新增: 父交易vout索引 (默认0保持向后兼容)
initialRelayAmount, wallets, contractId, childCount, childTxFee, finalReceiverAddress, provider, broadcastConfig, sliceIndex, onProgress }) {
    const completedTxs = [];
    let currentTxId = parentTxId;
    let currentOutputValue = initialRelayAmount;
    let currentVoutIndex = parentVoutIndex; // 追踪当前使用的vout索引
    for (let i = 1; i <= childCount; i++) {
        const isLastTransaction = (i === childCount);
        const slicePrefix = sliceIndex !== undefined ? `分片${sliceIndex} ` : '';
        console.log(`📦 ${slicePrefix}构建子交易 ${i}/${childCount}${isLastTransaction ? ' (最后)' : ''}`);
        onProgress?.(i, currentTxId, `构建子交易 ${i}/${childCount}`);
        try {
            // 构建子交易 (100%复用现有逻辑)
            const childTx = await (0, transactionBuilder_1.buildChildTransaction)({
                parentTxId: currentTxId,
                parentOutputValue: currentOutputValue,
                transactionIndex: i,
                isLastTransaction,
                finalReceiverAddress,
                wallets,
                contractId,
                childTxFee,
                provider
            });
            // 广播子交易 (100%复用现有逻辑，支持自定义RPC)
            const useCustomRpc = process.env.RPC_PROVIDER && process.env.RPC_PROVIDER !== 'sandshrew';
            console.log(`📡 ${slicePrefix}广播子交易 ${i}: ${childTx.expectedTxId.substring(0, 8)}... (${useCustomRpc ? process.env.RPC_PROVIDER : 'Provider'})`);
            let broadcastResult;
            if (useCustomRpc) {
                broadcastResult = await (0, transactionBroadcaster_1.broadcastSingleTransactionWithRpc)(childTx.psbtHex, childTx.expectedTxId, undefined, // 使用默认的RPC客户端
                provider.networkType, broadcastConfig);
            }
            else {
                broadcastResult = await (0, transactionBroadcaster_1.broadcastSingleTransaction)(childTx.psbtHex, childTx.expectedTxId, provider, broadcastConfig);
            }
            if (!broadcastResult.success) {
                throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.BROADCAST_ERROR, `${slicePrefix}子交易 ${i} 广播失败: ${broadcastResult.error}`, { sliceIndex, transactionIndex: i, txId: childTx.expectedTxId, error: broadcastResult.error });
            }
            completedTxs.push({
                ...childTx,
                index: i,
                isLast: isLastTransaction
            });
            console.log(`✅ ${slicePrefix}子交易 ${i} 完成: ${childTx.expectedTxId}`);
            onProgress?.(i, childTx.expectedTxId, `子交易 ${i} 广播成功`);
            // 检查是否为最后交易（通过输出金额判断）
            if (childTx.outputValue <= 330) {
                console.log(`🎉 ${slicePrefix}检测到最后交易 (输出=${childTx.outputValue} sats)，提前结束`);
                break;
            }
            // 为下一笔交易准备
            currentTxId = childTx.expectedTxId;
            currentOutputValue = childTx.outputValue;
            currentVoutIndex = 0; // 子交易总是使用vout=0作为输入
            // 短暂延迟避免网络拥堵 (复用现有逻辑)
            if (!isLastTransaction) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        catch (error) {
            console.error(`💥 ${slicePrefix}子交易 ${i} 失败: ${error.message}`);
            throw error instanceof chainMinting_1.ChainMintingError ? error : new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.TRANSACTION_BUILD_ERROR, `${slicePrefix}子交易 ${i} 执行失败: ${error.message}`, { sliceIndex, transactionIndex: i, error: error.message });
        }
    }
    return completedTxs;
}
// ============================================================================
// 分片执行验证和分析
// ============================================================================
/**
 * 验证分片执行配置
 */
function validateSliceExecutionConfig(config) {
    const errors = [];
    // 验证分片索引
    if (config.sliceIndex < 0) {
        errors.push(`分片索引无效: ${config.sliceIndex}`);
    }
    // 验证父交易ID
    if (!config.compositeParentTxId || config.compositeParentTxId.length !== 64) {
        errors.push(`复合父交易ID格式无效: ${config.compositeParentTxId}`);
    }
    // 验证vout索引
    if (config.parentVoutIndex < 0) {
        errors.push(`父交易vout索引无效: ${config.parentVoutIndex}`);
    }
    // 验证中继钱包
    if (!config.relayWallet.address) {
        errors.push('中继钱包地址未设置');
    }
    if (config.relayWallet.sliceIndex !== config.sliceIndex) {
        errors.push(`中继钱包分片索引不匹配: 期望${config.sliceIndex}, 实际${config.relayWallet.sliceIndex}`);
    }
    // 验证费用计算
    if (config.feeCalculation.mintCount <= 0 || config.feeCalculation.mintCount > 25) {
        errors.push(`分片铸造数量超出范围: ${config.feeCalculation.mintCount} (允许: 1-25)`);
    }
    if (config.feeCalculation.feeDetails.relayFuelAmount <= 0) {
        errors.push(`中继燃料金额无效: ${config.feeCalculation.feeDetails.relayFuelAmount}`);
    }
    // 验证合约ID
    if (!config.contractId.block || !config.contractId.tx) {
        errors.push('合约ID不完整');
    }
    return {
        isValid: errors.length === 0,
        errors
    };
}
exports.validateSliceExecutionConfig = validateSliceExecutionConfig;
/**
 * 分析分片执行结果
 */
function analyzeSliceExecutionResult(result) {
    const successRate = result.success ? 1.0 : 0.0;
    const timePerToken = result.mintedTokens > 0 ? result.duration / result.mintedTokens : 0;
    const avgTransactionTime = result.childTransactions.length > 0 ?
        result.duration / result.childTransactions.length : 0;
    const efficiency = {
        successRate,
        timePerToken: Math.round(timePerToken),
        avgTransactionTime: Math.round(avgTransactionTime)
    };
    const performance = {
        totalDuration: result.duration,
        transactionCount: result.childTransactions.length,
        effectiveTokens: result.mintedTokens,
        feeEfficiency: result.mintedTokens > 0 ? result.finalOutputAmount / result.mintedTokens : 0
    };
    const durationSeconds = (result.duration / 1000).toFixed(1);
    const summary = result.success ?
        `分片${result.sliceIndex}: ✅ ${result.mintedTokens} tokens, ${result.childTransactions.length} txs, ${durationSeconds}s` :
        `分片${result.sliceIndex}: ❌ 失败 (${result.error?.message})`;
    return {
        efficiency,
        performance,
        summary
    };
}
exports.analyzeSliceExecutionResult = analyzeSliceExecutionResult;
/**
 * 格式化分片执行结果
 */
function formatSliceExecutionResult(result) {
    const analysis = analyzeSliceExecutionResult(result);
    if (!result.success) {
        return `
❌ 分片 ${result.sliceIndex} 执行失败:
├─ 错误阶段: ${result.error?.phase}
├─ 错误信息: ${result.error?.message}
├─ 执行时长: ${(result.duration / 1000).toFixed(1)} 秒
└─ 完成交易: ${result.childTransactions.length} 笔
`;
    }
    return `
✅ 分片 ${result.sliceIndex} 执行成功:
├─ 铸造tokens: ${result.mintedTokens}
├─ 完成交易: ${result.childTransactions.length} 笔
├─ 最终输出: ${result.finalOutputAmount} sats
├─ 执行时长: ${(result.duration / 1000).toFixed(1)} 秒
├─ 平均速度: ${analysis.efficiency.timePerToken}ms/token
└─ 交易速度: ${analysis.efficiency.avgTransactionTime}ms/tx
`;
}
exports.formatSliceExecutionResult = formatSliceExecutionResult;
// ============================================================================
// 导出
// ============================================================================
//# sourceMappingURL=sliceExecutor.js.map