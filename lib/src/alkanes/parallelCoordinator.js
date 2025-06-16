"use strict";
/**
 * Project Supercluster - 并行协调器
 *
 * 核心协调器，集成所有Phase 1组件实现完整的并行链式铸造流程
 * CPFP第一批 + 等待确认 + 并行执行
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeParallelChainMintingWithTracking = exports.resumeParallelChainMinting = exports.validateParallelMintingConfig = exports.formatParallelMintingResult = exports.executeParallelChainMinting = void 0;
const tslib_1 = require("tslib");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const chainMinting_1 = require("./chainMinting");
const multiRelayWalletManager_1 = require("./multiRelayWalletManager");
const parallelFeeCalculator_1 = require("./parallelFeeCalculator");
const compositeParentBuilder_1 = require("./compositeParentBuilder");
const sliceExecutor_1 = require("./sliceExecutor");
const transactionBroadcaster_1 = require("./transactionBroadcaster");
// ============================================================================
// 主要功能函数
// ============================================================================
/**
 * 执行完整的Project Supercluster并行铸造流程
 *
 * 完整流程：
 * 1. 生成多中继钱包系统
 * 2. 计算并行费用需求
 * 3. 构建并广播复合父交易
 * 4. 等待CPFP分片确认 (可选)
 * 5. 并行执行所有分片
 * 6. 汇总结果和统计
 */
async function executeParallelChainMinting(config, onProgress) {
    const startTime = Date.now();
    try {
        console.log(`🚀 PROJECT SUPERCLUSTER 并行铸造启动`);
        console.log(`   目标合约: ${config.contractId.block}:${config.contractId.tx}`);
        console.log(`   总铸造量: ${config.totalMints} tokens`);
        console.log(`   接收地址: ${config.finalReceiverAddress}`);
        onProgress?.({
            phase: 'preparation',
            overallProgress: 0,
            message: 'PROJECT SUPERCLUSTER 初始化...'
        });
        // Phase 1: 生成钱包系统
        console.log(`\n📦 Phase 1: 生成多中继钱包系统`);
        const walletSystem = await (0, multiRelayWalletManager_1.generateMultiRelayWallets)(config.network, config.totalMints);
        (0, multiRelayWalletManager_1.displayWalletSystemInfo)(walletSystem);
        const walletValidation = (0, multiRelayWalletManager_1.validateMultiRelayWalletSystem)(walletSystem);
        if (!walletValidation.isValid) {
            throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.INVALID_ADDRESS_TYPE, `钱包系统验证失败: ${walletValidation.errors.join(', ')}`, walletValidation);
        }
        onProgress?.({
            phase: 'preparation',
            overallProgress: 10,
            message: `生成 ${walletSystem.totalSlices} 个中继钱包`
        });
        // Phase 2: 计算并行费用
        console.log(`\n📦 Phase 2: 计算并行费用需求`);
        let feeRateConfig = config.feeRateConfig;
        if (!feeRateConfig) {
            feeRateConfig = await (0, parallelFeeCalculator_1.generateDynamicParallelFeeRates)(config.provider, config.urgencyLevel || 'medium');
            console.log(`   动态费率: 标准=${feeRateConfig.standardFeeRate}, CPFP=${feeRateConfig.cpfpFeeRate} sat/vB`);
        }
        const feeCalculation = await (0, parallelFeeCalculator_1.calculateParallelFees)({
            walletSystem,
            contractId: config.contractId,
            totalMints: config.totalMints,
            feeRateConfig,
            provider: config.provider
        });
        console.log((0, parallelFeeCalculator_1.formatParallelFeeCalculation)(feeCalculation));
        onProgress?.({
            phase: 'preparation',
            overallProgress: 20,
            message: `并行费用计算完成: ${feeCalculation.summary.totalRequiredFunding} sats`
        });
        // Phase 3: 构建并广播复合父交易
        console.log(`\n📦 Phase 3: 构建并广播复合父交易`);
        const compositeParentConfig = {
            walletSystem,
            contractId: config.contractId,
            parallelFeeCalculation: feeCalculation,
            provider: config.provider,
            utxos: config.utxos,
            broadcastConfig: config.broadcastConfig || {}
        };
        const configValidation = (0, compositeParentBuilder_1.validateCompositeParentTransactionParams)(compositeParentConfig);
        if (!configValidation.isValid) {
            throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.INVALID_ADDRESS_TYPE, `复合父交易配置无效: ${configValidation.errors.join(', ')}`, configValidation);
        }
        const compositeParentResult = await (0, compositeParentBuilder_1.buildSignAndBroadcastCompositeParentTransaction)(compositeParentConfig);
        console.log((0, compositeParentBuilder_1.formatCompositeParentTransactionResult)(compositeParentResult.transaction, compositeParentResult.voutLayout));
        onProgress?.({
            phase: 'parent_tx',
            overallProgress: 40,
            message: `复合父交易广播成功: ${compositeParentResult.transaction.expectedTxId.substring(0, 8)}...`
        });
        // Phase 4: 等待CPFP分片确认 (可选)
        const cpfpSlice = feeCalculation.sliceCalculations.find(s => s.isCpfpSlice);
        if (cpfpSlice && config.cpfpConfirmationTimeout && config.cpfpConfirmationTimeout > 0) {
            console.log(`\n📦 Phase 4: 等待CPFP分片确认`);
            console.log(`   CPFP费率: ${cpfpSlice.feeRate} sat/vB`);
            console.log(`   确认超时: ${config.cpfpConfirmationTimeout / 1000} 秒`);
            onProgress?.({
                phase: 'cpfp_wait',
                overallProgress: 50,
                message: `等待CPFP加速确认 (${cpfpSlice.feeRate} sat/vB)`
            });
            try {
                await (0, transactionBroadcaster_1.waitForTransactionAcceptance)(compositeParentResult.transaction.expectedTxId, config.provider, config.cpfpConfirmationTimeout);
                console.log(`✅ CPFP分片确认成功`);
            }
            catch (error) {
                console.warn(`⚠️  CPFP分片确认超时，继续执行: ${error.message}`);
            }
        }
        // Phase 5: 等待父交易确认后并行执行分片
        console.log(`\n📦 Phase 5: 等待父交易确认后执行分片`);
        // 正确的执行逻辑：只要父交易被区块打包确认，就能进行分片1-分片M的并行执行
        // 分片与分片之间并行，分片内还是串行
        const shouldUseParallel = config.enableParallelExecution !== false;
        console.log(`   执行模式: ${shouldUseParallel ? '并行' : '串行'}`);
        console.log(`   分片数量: ${walletSystem.totalSlices}`);
        console.log(`   逻辑: 父交易确认后 → 分片间并行执行，分片内串行`);
        if (shouldUseParallel) {
            console.log(`   最大并发: ${config.maxConcurrentSlices || 6} 个分片`);
        }
        const sliceResults = await executeAllSlicesInParallel({
            walletSystem,
            feeCalculation,
            compositeParentTx: compositeParentResult.transaction,
            voutLayout: compositeParentResult.voutLayout,
            contractId: config.contractId,
            finalReceiverAddress: config.finalReceiverAddress,
            provider: config.provider,
            broadcastConfig: config.broadcastConfig || {},
            enableParallel: shouldUseParallel,
            maxConcurrent: config.maxConcurrentSlices || 6,
            onProgress: (sliceIndex, progress) => {
                onProgress?.({
                    phase: 'parallel_execution',
                    overallProgress: 60 + (progress.currentStep / progress.totalSteps) * 30,
                    message: `执行分片 ${sliceIndex}`,
                    sliceDetails: {
                        sliceIndex,
                        currentStep: progress.currentStep,
                        totalSteps: progress.totalSteps,
                        message: progress.message
                    }
                });
            }
        });
        // Phase 6: 汇总结果
        console.log(`\n📦 Phase 6: 汇总执行结果`);
        const endTime = Date.now();
        const statistics = calculateParallelStatistics(sliceResults, startTime, endTime);
        onProgress?.({
            phase: 'completion',
            overallProgress: 100,
            message: `并行铸造完成: ${statistics.totalTokensMinted} tokens`
        });
        const result = {
            success: true,
            startTime,
            endTime,
            totalDuration: endTime - startTime,
            walletSystem,
            feeCalculation,
            compositeParentTx: compositeParentResult,
            sliceResults,
            statistics
        };
        console.log(`\n🎉 PROJECT SUPERCLUSTER 完成！`);
        console.log(`   总耗时: ${(result.totalDuration / 1000).toFixed(1)} 秒`);
        console.log(`   成功分片: ${statistics.successfulSlices}/${statistics.totalSlices}`);
        console.log(`   铸造tokens: ${statistics.totalTokensMinted}`);
        console.log(`   并行效率: ${(statistics.parallelEfficiency * 100).toFixed(1)}%`);
        return result;
    }
    catch (error) {
        const endTime = Date.now();
        console.error(`💥 PROJECT SUPERCLUSTER 失败: ${error.message}`);
        return {
            success: false,
            startTime,
            endTime,
            totalDuration: endTime - startTime,
            walletSystem: {},
            feeCalculation: {},
            compositeParentTx: {
                transaction: {},
                voutLayout: {}
            },
            sliceResults: [],
            statistics: {
                totalSlices: 0,
                successfulSlices: 0,
                failedSlices: 0,
                totalTransactions: 0,
                totalTokensMinted: 0,
                totalFeesPaid: 0,
                averageSliceTime: 0,
                parallelEfficiency: 0
            },
            error: {
                phase: 'preparation',
                message: error.message,
                details: error
            }
        };
    }
}
exports.executeParallelChainMinting = executeParallelChainMinting;
/**
 * 并行执行所有分片
 */
async function executeAllSlicesInParallel({ walletSystem, feeCalculation, compositeParentTx, voutLayout, contractId, finalReceiverAddress, provider, broadcastConfig, enableParallel = true, maxConcurrent = 6, onProgress }) {
    const sliceConfigs = feeCalculation.sliceCalculations.map((sliceCalc, index) => {
        const relayWallet = walletSystem.relayWallets[index];
        const sliceOutput = voutLayout.sliceOutputs[index];
        const config = {
            sliceIndex: sliceCalc.sliceIndex,
            compositeParentTxId: compositeParentTx.expectedTxId,
            parentVoutIndex: sliceOutput.voutIndex,
            relayWallet,
            mainWallet: walletSystem.mainWallet,
            contractId,
            feeCalculation: sliceCalc,
            finalReceiverAddress,
            provider,
            broadcastConfig
        };
        // 验证分片配置
        const validation = (0, sliceExecutor_1.validateSliceExecutionConfig)(config);
        if (!validation.isValid) {
            throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.INVALID_ADDRESS_TYPE, `分片 ${sliceCalc.sliceIndex} 配置无效: ${validation.errors.join(', ')}`, validation);
        }
        return config;
    });
    if (!enableParallel) {
        // 串行执行模式
        console.log(`   执行模式: 串行`);
        const results = [];
        for (const config of sliceConfigs) {
            const result = await (0, sliceExecutor_1.executeSlice)(config, (progress) => {
                onProgress?.(config.sliceIndex, progress);
            });
            results.push(result);
            console.log((0, sliceExecutor_1.formatSliceExecutionResult)(result));
        }
        return results;
    }
    else {
        // 并行执行模式
        console.log(`   执行模式: 并行 (最大并发: ${maxConcurrent})`);
        const executeSliceWithProgress = async (config) => {
            return (0, sliceExecutor_1.executeSlice)(config, (progress) => {
                onProgress?.(config.sliceIndex, progress);
            });
        };
        // 控制并发执行
        const results = [];
        const executing = [];
        for (let i = 0; i < sliceConfigs.length; i++) {
            const config = sliceConfigs[i];
            // 启动分片执行
            const slicePromise = executeSliceWithProgress(config);
            executing.push(slicePromise);
            // 控制并发数量
            if (executing.length >= maxConcurrent || i === sliceConfigs.length - 1) {
                const batchResults = await Promise.allSettled(executing);
                // 处理批次结果
                for (const batchResult of batchResults) {
                    if (batchResult.status === 'fulfilled') {
                        results.push(batchResult.value);
                        console.log((0, sliceExecutor_1.formatSliceExecutionResult)(batchResult.value));
                    }
                    else {
                        console.error(`💥 分片执行失败: ${batchResult.reason}`);
                        // 创建失败结果
                        results.push({
                            sliceIndex: -1,
                            success: false,
                            startTime: Date.now(),
                            endTime: Date.now(),
                            duration: 0,
                            childTransactions: [],
                            mintedTokens: 0,
                            finalOutputAmount: 0,
                            error: {
                                phase: 'execution',
                                message: batchResult.reason?.message || 'Unknown error'
                            }
                        });
                    }
                }
                // 清空执行队列
                executing.length = 0;
            }
        }
        return results;
    }
}
/**
 * 计算并行执行统计
 */
function calculateParallelStatistics(sliceResults, startTime, endTime) {
    const totalSlices = sliceResults.length;
    const successfulSlices = sliceResults.filter(r => r.success).length;
    const failedSlices = totalSlices - successfulSlices;
    const totalTransactions = sliceResults.reduce((sum, r) => sum + r.childTransactions.length, 0);
    const totalTokensMinted = sliceResults.reduce((sum, r) => sum + r.mintedTokens, 0);
    // 估算总费用 (基于成功的分片)
    const successfulResults = sliceResults.filter(r => r.success);
    const totalFeesPaid = successfulResults.reduce((sum, r) => {
        // 估算: 每个交易平均费用 * 交易数量
        return sum + (r.childTransactions.length * 150); // 假设平均150 sats/tx
    }, 0);
    const averageSliceTime = successfulResults.length > 0 ?
        successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length : 0;
    // 计算并行效率: 如果串行执行需要的时间 vs 实际并行时间
    const totalExecutionTime = endTime - startTime;
    const estimatedSerialTime = averageSliceTime * totalSlices;
    const parallelEfficiency = estimatedSerialTime > 0 ?
        Math.min(1.0, estimatedSerialTime / totalExecutionTime) : 0;
    return {
        totalSlices,
        successfulSlices,
        failedSlices,
        totalTransactions,
        totalTokensMinted,
        totalFeesPaid,
        averageSliceTime: Math.round(averageSliceTime),
        parallelEfficiency
    };
}
// ============================================================================
// 辅助工具函数
// ============================================================================
/**
 * 格式化并行铸造结果
 */
function formatParallelMintingResult(result) {
    if (!result.success) {
        return `
❌ PROJECT SUPERCLUSTER 执行失败:
├─ 失败阶段: ${result.error?.phase}
├─ 错误信息: ${result.error?.message}
├─ 执行时长: ${(result.totalDuration / 1000).toFixed(1)} 秒
└─ 状态: 🔴 未完成
`;
    }
    return `
🎉 PROJECT SUPERCLUSTER 执行成功:
=====================================

📊 执行统计:
├─ 总执行时长: ${(result.totalDuration / 1000).toFixed(1)} 秒
├─ 分片数量: ${result.statistics.totalSlices}
├─ 成功分片: ${result.statistics.successfulSlices}
├─ 失败分片: ${result.statistics.failedSlices}
├─ 总交易数: ${result.statistics.totalTransactions}
├─ 铸造tokens: ${result.statistics.totalTokensMinted}
├─ 总费用: ${result.statistics.totalFeesPaid} sats
├─ 平均分片时间: ${(result.statistics.averageSliceTime / 1000).toFixed(1)} 秒
└─ 并行效率: ${(result.statistics.parallelEfficiency * 100).toFixed(1)}%

🏗️  复合父交易:
├─ 交易ID: ${result.compositeParentTx.transaction.expectedTxId}
├─ 分片输出: ${result.compositeParentTx.voutLayout.sliceOutputs.length} 个
└─ 总输出金额: ${result.compositeParentTx.transaction.outputValue} sats

🔗 分片执行结果:
${result.sliceResults.map(slice => {
        const status = slice.success ? '✅' : '❌';
        const duration = (slice.duration / 1000).toFixed(1);
        return `├─ 分片${slice.sliceIndex}: ${status} ${slice.mintedTokens} tokens, ${slice.childTransactions.length} txs, ${duration}s`;
    }).join('\n')}

🎯 最终状态: 🟢 完成
`;
}
exports.formatParallelMintingResult = formatParallelMintingResult;
/**
 * 验证并行铸造配置
 */
function validateParallelMintingConfig(config) {
    const errors = [];
    // 验证基本参数
    if (config.totalMints < 1 || config.totalMints > 2500) {
        errors.push(`总铸造数量超出范围: ${config.totalMints} (允许: 1-2500)`);
    }
    if (!config.contractId.block || !config.contractId.tx) {
        errors.push('合约ID不完整');
    }
    if (!config.finalReceiverAddress) {
        errors.push('最终接收地址未设置');
    }
    if (!config.utxos || config.utxos.length === 0) {
        errors.push('没有可用的UTXO');
    }
    // 验证费率配置
    if (config.feeRateConfig) {
        if (config.feeRateConfig.standardFeeRate <= 0) {
            errors.push('标准费率必须大于0');
        }
        if (config.feeRateConfig.cpfpFeeRate < config.feeRateConfig.standardFeeRate) {
            errors.push('CPFP费率不能低于标准费率');
        }
    }
    // 验证并发参数
    if (config.maxConcurrentSlices && (config.maxConcurrentSlices < 1 || config.maxConcurrentSlices > 20)) {
        errors.push(`最大并发分片数超出范围: ${config.maxConcurrentSlices} (允许: 1-20)`);
    }
    return {
        isValid: errors.length === 0,
        errors
    };
}
exports.validateParallelMintingConfig = validateParallelMintingConfig;
// ============================================================================
// 中断恢复功能 (新增)
// ============================================================================
/**
 * 恢复中断的并行铸造执行
 */
async function resumeParallelChainMinting(orderId, onProgress) {
    const startTime = Date.now();
    try {
        console.log(`🔄 PROJECT SUPERCLUSTER 恢复执行: ${orderId}`);
        // 1. 加载中断的订单
        const { ChainMintOrderManager, OrderExecutionMode, OrderStatus, SliceStatus } = await Promise.resolve().then(() => tslib_1.__importStar(require('./chainMintOrder')));
        const orderManager = new ChainMintOrderManager();
        const order = await orderManager.loadOrder(orderId);
        if (!order) {
            throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.INVALID_ADDRESS_TYPE, `订单不存在: ${orderId}`);
        }
        if (order.executionMode !== OrderExecutionMode.SUPERCLUSTER) {
            throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.INVALID_ADDRESS_TYPE, `订单不是Supercluster模式: ${order.executionMode}`);
        }
        if (order.status !== OrderStatus.INTERRUPTED && order.status !== OrderStatus.PARTIAL_COMPLETED) {
            throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.INVALID_ADDRESS_TYPE, `订单状态不支持恢复: ${order.status}`);
        }
        console.log(`   订单状态: ${order.status}`);
        console.log(`   创建时间: ${new Date(order.createdAt).toLocaleString()}`);
        console.log(`   总分片数: ${order.progress.totalSlices}`);
        console.log(`   已完成分片: ${order.progress.completedSlices}`);
        onProgress?.({
            phase: 'preparation',
            overallProgress: 5,
            message: `加载中断订单: ${orderId}`
        });
        // 2. 重建钱包系统
        console.log(`\n📦 重建钱包系统...`);
        const network = order.network === 'bitcoin' ? bitcoin.networks.bitcoin :
            order.network === 'testnet' ? bitcoin.networks.testnet :
                bitcoin.networks.regtest;
        const walletSystem = await (0, multiRelayWalletManager_1.generateMultiRelayWallets)(network, order.executionParams.totalMints || 25);
        // 3. 验证分片信息一致性
        if (!order.progress.slices || order.progress.slices.length !== walletSystem.totalSlices) {
            throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.INVALID_ADDRESS_TYPE, `分片信息不一致: 期望${walletSystem.totalSlices}, 订单中${order.progress.slices?.length || 0}`);
        }
        // 验证中继地址是否匹配
        for (let i = 0; i < walletSystem.totalSlices; i++) {
            const expectedAddress = walletSystem.relayWallets[i].address;
            const savedAddress = order.progress.slices[i].relayAddress;
            if (expectedAddress !== savedAddress) {
                console.warn(`⚠️  分片 ${i} 地址不匹配: 期望${expectedAddress}, 订单中${savedAddress}`);
                // 可以选择继续或终止，这里选择更新为当前地址
                order.progress.slices[i].relayAddress = expectedAddress;
            }
        }
        onProgress?.({
            phase: 'preparation',
            overallProgress: 15,
            message: `钱包系统验证完成`
        });
        // 4. 重建费用计算配置
        console.log(`\n📦 重建费用配置...`);
        const feeRateConfig = {
            standardFeeRate: order.executionParams.feeRate,
            cpfpFeeRate: order.executionParams.feeRate * (order.executionParams.parallelConfig?.cpfpMultiplier || 3),
            cpfpMultiplier: order.executionParams.parallelConfig?.cpfpMultiplier || 3
        };
        console.log(`   标准费率: ${feeRateConfig.standardFeeRate} sat/vB`);
        console.log(`   CPFP费率: ${feeRateConfig.cpfpFeeRate} sat/vB`);
        // 5. 检查复合父交易状态
        const compositeParentTxId = order.progress.compositeParentTxId;
        if (!compositeParentTxId) {
            throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.INVALID_ADDRESS_TYPE, `复合父交易ID缺失，无法恢复执行`);
        }
        console.log(`\n📦 验证复合父交易: ${compositeParentTxId.substring(0, 8)}...`);
        onProgress?.({
            phase: 'preparation',
            overallProgress: 25,
            message: `验证复合父交易状态`
        });
        // 6. 分析可恢复的分片
        const recoverableSlices = order.progress.slices.filter(slice => slice.status === SliceStatus.PENDING ||
            slice.status === SliceStatus.FAILED ||
            slice.status === SliceStatus.EXECUTING);
        const completedSlices = order.progress.slices.filter(slice => slice.status === SliceStatus.COMPLETED);
        console.log(`\n📦 分片恢复分析:`);
        console.log(`   已完成分片: ${completedSlices.length} 个`);
        console.log(`   可恢复分片: ${recoverableSlices.length} 个`);
        if (recoverableSlices.length === 0) {
            console.log(`✅ 所有分片已完成，标记订单为完成状态`);
            await orderManager.markOrderAsCompleted(orderId);
            return {
                success: true,
                startTime,
                endTime: Date.now(),
                totalDuration: Date.now() - startTime,
                walletSystem,
                feeCalculation: {},
                compositeParentTx: {
                    transaction: { expectedTxId: compositeParentTxId },
                    voutLayout: {}
                },
                sliceResults: [],
                statistics: {
                    totalSlices: order.progress.totalSlices || 0,
                    successfulSlices: completedSlices.length,
                    failedSlices: 0,
                    totalTransactions: 0,
                    totalTokensMinted: completedSlices.reduce((sum, slice) => sum + slice.mintCount, 0),
                    totalFeesPaid: 0,
                    averageSliceTime: 0,
                    parallelEfficiency: 1.0
                }
            };
        }
        // 7. 重置失败的分片状态
        const failedSliceIndices = recoverableSlices.filter(s => s.status === SliceStatus.FAILED).map(s => s.sliceIndex);
        if (failedSliceIndices.length > 0) {
            console.log(`🔄 重置失败分片: [${failedSliceIndices.join(', ')}]`);
            await orderManager.resetFailedSlices(orderId, failedSliceIndices);
        }
        onProgress?.({
            phase: 'parallel_execution',
            overallProgress: 40,
            message: `开始恢复 ${recoverableSlices.length} 个分片`,
            sliceProgress: {
                completedSlices: completedSlices.length,
                totalSlices: order.progress.totalSlices || 0,
                currentlyExecuting: recoverableSlices.map(s => s.sliceIndex)
            }
        });
        // 8. 执行分片恢复
        console.log(`\n📦 开始分片恢复执行...`);
        const sliceResults = await executeRecoverableSlicesInParallel({
            orderId,
            orderManager,
            walletSystem,
            recoverableSlices,
            compositeParentTxId,
            contractId: order.contractId,
            finalReceiverAddress: order.finalReceiverAddress,
            feeRateConfig,
            broadcastConfig: order.executionParams.broadcastConfig,
            maxConcurrent: order.executionParams.parallelConfig?.maxConcurrentSlices || 6,
            onProgress: (sliceIndex, progress) => {
                onProgress?.({
                    phase: 'parallel_execution',
                    overallProgress: 50 + (progress.currentStep / progress.totalSteps) * 40,
                    message: `恢复分片 ${sliceIndex}`,
                    sliceDetails: {
                        sliceIndex,
                        currentStep: progress.currentStep,
                        totalSteps: progress.totalSteps,
                        message: progress.message
                    }
                });
            }
        });
        // 9. 汇总最终结果
        const endTime = Date.now();
        const allSlicesResults = [...completedSlices, ...sliceResults];
        const statistics = calculateRecoveryStatistics(allSlicesResults, startTime, endTime);
        // 10. 更新订单最终状态
        const allCompleted = sliceResults.every(r => r.success);
        if (allCompleted) {
            await orderManager.markOrderAsCompleted(orderId);
            console.log(`✅ 恢复执行完成，订单已标记为完成`);
        }
        else {
            await orderManager.updateOrderProgress(orderId, {
                completedSlices: statistics.successfulSlices
            });
            console.log(`⚠️  部分分片恢复失败，订单保持部分完成状态`);
        }
        onProgress?.({
            phase: 'completion',
            overallProgress: 100,
            message: `恢复完成: ${statistics.totalTokensMinted} tokens`
        });
        const result = {
            success: allCompleted,
            startTime,
            endTime,
            totalDuration: endTime - startTime,
            walletSystem,
            feeCalculation: {},
            compositeParentTx: {
                transaction: { expectedTxId: compositeParentTxId },
                voutLayout: {}
            },
            sliceResults: sliceResults,
            statistics
        };
        console.log(`\n🎉 PROJECT SUPERCLUSTER 恢复完成！`);
        console.log(`   恢复耗时: ${(result.totalDuration / 1000).toFixed(1)} 秒`);
        console.log(`   成功分片: ${statistics.successfulSlices}/${statistics.totalSlices}`);
        console.log(`   新增tokens: ${sliceResults.filter(r => r.success).reduce((sum, r) => sum + r.mintedTokens, 0)}`);
        return result;
    }
    catch (error) {
        const endTime = Date.now();
        console.error(`💥 PROJECT SUPERCLUSTER 恢复失败: ${error.message}`);
        return {
            success: false,
            startTime,
            endTime,
            totalDuration: endTime - startTime,
            walletSystem: {},
            feeCalculation: {},
            compositeParentTx: {
                transaction: {},
                voutLayout: {}
            },
            sliceResults: [],
            statistics: {
                totalSlices: 0,
                successfulSlices: 0,
                failedSlices: 0,
                totalTransactions: 0,
                totalTokensMinted: 0,
                totalFeesPaid: 0,
                averageSliceTime: 0,
                parallelEfficiency: 0
            },
            error: {
                phase: 'preparation',
                message: error.message,
                details: error
            }
        };
    }
}
exports.resumeParallelChainMinting = resumeParallelChainMinting;
/**
 * 并行执行可恢复的分片
 */
async function executeRecoverableSlicesInParallel({ orderId, orderManager, walletSystem, recoverableSlices, compositeParentTxId, contractId, finalReceiverAddress, feeRateConfig, broadcastConfig, maxConcurrent = 6, onProgress }) {
    // 导入需要的枚举
    const { SliceStatus } = await Promise.resolve().then(() => tslib_1.__importStar(require('./chainMintOrder')));
    // 为可恢复分片创建执行配置
    const sliceConfigs = recoverableSlices.map(sliceProgress => {
        const relayWallet = walletSystem.relayWallets[sliceProgress.sliceIndex];
        const config = {
            sliceIndex: sliceProgress.sliceIndex,
            compositeParentTxId,
            parentVoutIndex: sliceProgress.parentVoutIndex,
            relayWallet,
            mainWallet: walletSystem.mainWallet,
            contractId,
            feeCalculation: {
                sliceIndex: sliceProgress.sliceIndex,
                mintCount: sliceProgress.mintCount,
                feeRate: sliceProgress.sliceIndex === 0 ? feeRateConfig.cpfpFeeRate : feeRateConfig.standardFeeRate,
                isCpfpSlice: sliceProgress.sliceIndex === 0,
                feeDetails: {
                    relayFuelAmount: 15000,
                    childTx: { totalFee: 150 }
                }
            },
            finalReceiverAddress,
            provider: {},
            broadcastConfig,
            // 恢复相关参数
            resumeFromTxId: sliceProgress.lastTxId,
            resumeFromStep: sliceProgress.completedChildTxs,
            resumeOutputAmount: sliceProgress.lastOutputAmount
        };
        return config;
    });
    console.log(`   执行模式: 并行恢复 (最大并发: ${maxConcurrent})`);
    // 执行分片恢复（支持断点续传）
    const executeSliceWithRecovery = async (config) => {
        // 更新分片状态为执行中
        await orderManager.updateSliceProgress(orderId, config.sliceIndex, {
            status: SliceStatus.EXECUTING,
            startTime: Date.now()
        });
        try {
            const result = await executeSliceWithResume(config, (progress) => {
                onProgress?.(config.sliceIndex, progress);
            });
            // 更新分片状态为完成
            await orderManager.updateSliceProgress(orderId, config.sliceIndex, {
                status: result.success ? SliceStatus.COMPLETED : SliceStatus.FAILED,
                endTime: Date.now(),
                error: result.error
            });
            return result;
        }
        catch (error) {
            // 更新分片状态为失败
            await orderManager.updateSliceProgress(orderId, config.sliceIndex, {
                status: SliceStatus.FAILED,
                endTime: Date.now(),
                error: {
                    phase: 'execution',
                    message: error.message
                }
            });
            throw error;
        }
    };
    // 控制并发执行
    const results = [];
    const executing = [];
    for (let i = 0; i < sliceConfigs.length; i++) {
        const config = sliceConfigs[i];
        // 启动分片恢复执行
        const slicePromise = executeSliceWithRecovery(config);
        executing.push(slicePromise);
        // 控制并发数量
        if (executing.length >= maxConcurrent || i === sliceConfigs.length - 1) {
            const batchResults = await Promise.allSettled(executing);
            // 处理批次结果
            for (const batchResult of batchResults) {
                if (batchResult.status === 'fulfilled') {
                    results.push(batchResult.value);
                    console.log((0, sliceExecutor_1.formatSliceExecutionResult)(batchResult.value));
                }
                else {
                    console.error(`💥 分片恢复失败: ${batchResult.reason}`);
                    // 创建失败结果
                    results.push({
                        sliceIndex: -1,
                        success: false,
                        startTime: Date.now(),
                        endTime: Date.now(),
                        duration: 0,
                        childTransactions: [],
                        mintedTokens: 0,
                        finalOutputAmount: 0,
                        error: {
                            phase: 'execution',
                            message: batchResult.reason?.message || 'Unknown error'
                        }
                    });
                }
            }
            // 清空执行队列
            executing.length = 0;
        }
    }
    return results;
}
/**
 * 支持断点续传的分片执行
 */
async function executeSliceWithResume(config, onProgress) {
    // 如果有恢复参数，从断点继续
    if (config.resumeFromTxId && config.resumeFromStep > 0) {
        console.log(`🔄 分片 ${config.sliceIndex} 从断点恢复: 第${config.resumeFromStep}步, TxID=${config.resumeFromTxId.substring(0, 8)}...`);
        // 修改执行配置，从断点开始
        const modifiedConfig = {
            ...config,
            parentTxId: config.resumeFromTxId,
            parentOutputValue: config.resumeOutputAmount,
            startFromStep: config.resumeFromStep
        };
        return (0, sliceExecutor_1.executeSlice)(modifiedConfig, onProgress);
    }
    else {
        // 正常从头执行
        return (0, sliceExecutor_1.executeSlice)(config, onProgress);
    }
}
/**
 * 计算恢复执行统计
 */
function calculateRecoveryStatistics(allSliceResults, startTime, endTime) {
    const totalSlices = allSliceResults.length;
    const successfulSlices = allSliceResults.filter(r => r.status === 'completed' || r.success).length;
    const failedSlices = totalSlices - successfulSlices;
    const totalTransactions = allSliceResults.reduce((sum, r) => {
        return sum + (r.childTransactions?.length || 0);
    }, 0);
    const totalTokensMinted = allSliceResults.reduce((sum, r) => {
        return sum + (r.mintedTokens || r.mintCount || 0);
    }, 0);
    const totalFeesPaid = successfulSlices * 150 * 25; // 估算
    const averageSliceTime = (endTime - startTime) / Math.max(1, successfulSlices);
    const parallelEfficiency = successfulSlices / totalSlices;
    return {
        totalSlices,
        successfulSlices,
        failedSlices,
        totalTransactions,
        totalTokensMinted,
        totalFeesPaid,
        averageSliceTime: Math.round(averageSliceTime),
        parallelEfficiency
    };
}
// ============================================================================
// 状态同步功能 (增强现有执行流程)
// ============================================================================
/**
 * 增强版executeParallelChainMinting - 支持完整状态同步和配置保存
 */
async function executeParallelChainMintingWithTracking(config, onProgress) {
    const startTime = Date.now();
    try {
        console.log(`🚀 PROJECT SUPERCLUSTER 增强版并行铸造启动`);
        console.log(`   目标合约: ${config.contractId.block}:${config.contractId.tx}`);
        console.log(`   总铸造量: ${config.totalMints} tokens`);
        console.log(`   接收地址: ${config.finalReceiverAddress}`);
        // 1. 创建订单追踪
        const { ChainMintOrderManager, OrderExecutionMode, SliceStatus } = await Promise.resolve().then(() => tslib_1.__importStar(require('./chainMintOrder')));
        const orderManager = new ChainMintOrderManager();
        const order = await orderManager.createOrder({
            contractId: config.contractId,
            finalReceiverAddress: config.finalReceiverAddress,
            network: config.network === bitcoin.networks.bitcoin ? 'bitcoin' :
                config.network === bitcoin.networks.testnet ? 'testnet' : 'regtest',
            executionMode: OrderExecutionMode.SUPERCLUSTER,
            totalMints: config.totalMints,
            feeRate: config.feeRateConfig?.standardFeeRate || 10,
            broadcastConfig: config.broadcastConfig || {
                maxRetries: 3,
                retryDelayMs: 1000,
                confirmationTimeoutMs: 30000,
                waitForAcceptance: false
            },
            parallelConfig: {
                cpfpMultiplier: config.feeRateConfig?.cpfpMultiplier || 3,
                maxConcurrentSlices: config.maxConcurrentSlices || 6,
                enableParallelExecution: config.enableParallelExecution !== false,
                cpfpConfirmationTimeout: config.cpfpConfirmationTimeout || 600000
            }
        });
        console.log(`📝 创建订单追踪: ${order.id}`);
        onProgress?.({
            phase: 'preparation',
            overallProgress: 0,
            message: 'PROJECT SUPERCLUSTER 增强版初始化...'
        });
        // Phase 1: 生成钱包系统并保存分片配置
        console.log(`\n📦 Phase 1: 生成多中继钱包系统并保存分片配置`);
        const walletSystem = await (0, multiRelayWalletManager_1.generateMultiRelayWallets)(config.network, config.totalMints);
        (0, multiRelayWalletManager_1.displayWalletSystemInfo)(walletSystem);
        // 初始化分片状态到订单中
        console.log(`📋 保存分片配置...`);
        await initializeSliceConfigurations(orderManager, order.id, walletSystem, config);
        onProgress?.({
            phase: 'preparation',
            overallProgress: 10,
            message: `生成 ${walletSystem.totalSlices} 个中继钱包并保存配置`
        });
        // Phase 2: 计算并行费用
        console.log(`\n📦 Phase 2: 计算并行费用需求`);
        let feeRateConfig = config.feeRateConfig;
        if (!feeRateConfig) {
            feeRateConfig = await (0, parallelFeeCalculator_1.generateDynamicParallelFeeRates)(config.provider, config.urgencyLevel || 'medium');
            console.log(`   动态费率: 标准=${feeRateConfig.standardFeeRate}, CPFP=${feeRateConfig.cpfpFeeRate} sat/vB`);
        }
        const feeCalculation = await (0, parallelFeeCalculator_1.calculateParallelFees)({
            walletSystem,
            contractId: config.contractId,
            totalMints: config.totalMints,
            feeRateConfig,
            provider: config.provider
        });
        console.log((0, parallelFeeCalculator_1.formatParallelFeeCalculation)(feeCalculation));
        // 更新分片费率配置
        await updateSliceConfigurations(orderManager, order.id, feeCalculation, feeRateConfig);
        onProgress?.({
            phase: 'preparation',
            overallProgress: 20,
            message: `并行费用计算完成: ${feeCalculation.summary.totalRequiredFunding} sats`
        });
        // Phase 3: 构建并广播复合父交易
        console.log(`\n📦 Phase 3: 构建并广播复合父交易`);
        const compositeParentConfig = {
            walletSystem,
            contractId: config.contractId,
            parallelFeeCalculation: feeCalculation,
            provider: config.provider,
            utxos: config.utxos,
            broadcastConfig: config.broadcastConfig || {}
        };
        const compositeParentResult = await (0, compositeParentBuilder_1.buildSignAndBroadcastCompositeParentTransaction)(compositeParentConfig);
        console.log((0, compositeParentBuilder_1.formatCompositeParentTransactionResult)(compositeParentResult.transaction, compositeParentResult.voutLayout));
        // 保存复合父交易信息和分片输出位置
        await orderManager.updateOrderProgress(order.id, {
            compositeParentTxId: compositeParentResult.transaction.expectedTxId
        });
        await updateSliceVoutMapping(orderManager, order.id, compositeParentResult.voutLayout);
        onProgress?.({
            phase: 'parent_tx',
            overallProgress: 40,
            message: `复合父交易广播成功: ${compositeParentResult.transaction.expectedTxId.substring(0, 8)}...`
        });
        // Phase 4: 并行执行分片，实时保存每个分片的进度
        console.log(`\n📦 Phase 4: 并行执行分片，实时追踪进度`);
        const shouldUseParallel = config.enableParallelExecution !== false;
        console.log(`   执行模式: ${shouldUseParallel ? '并行' : '串行'}`);
        console.log(`   分片数量: ${walletSystem.totalSlices}`);
        console.log(`   逻辑: 分片0立即开始 → 父交易确认后 → 分片1-M并行执行，各分片内串行`);
        const sliceResults = await executeAllSlicesWithTracking({
            orderId: order.id,
            orderManager,
            walletSystem,
            feeCalculation,
            compositeParentTx: compositeParentResult.transaction,
            voutLayout: compositeParentResult.voutLayout,
            contractId: config.contractId,
            finalReceiverAddress: config.finalReceiverAddress,
            provider: config.provider,
            broadcastConfig: config.broadcastConfig || {},
            enableParallel: shouldUseParallel,
            maxConcurrent: config.maxConcurrentSlices || 6,
            onProgress: (sliceIndex, progress) => {
                onProgress?.({
                    phase: 'parallel_execution',
                    overallProgress: 50 + (progress.currentStep / progress.totalSteps) * 40,
                    message: `执行分片 ${sliceIndex}`,
                    sliceDetails: {
                        sliceIndex,
                        currentStep: progress.currentStep,
                        totalSteps: progress.totalSteps,
                        message: progress.message
                    }
                });
            }
        });
        // Phase 5: 汇总结果并标记订单完成
        console.log(`\n📦 Phase 5: 汇总执行结果`);
        const endTime = Date.now();
        const statistics = calculateParallelStatistics(sliceResults, startTime, endTime);
        // 标记订单完成
        const allSuccessful = sliceResults.every(r => r.success);
        if (allSuccessful) {
            await orderManager.markOrderAsCompleted(order.id);
            console.log(`✅ 订单标记为完成: ${order.id}`);
        }
        else {
            await orderManager.markOrderAsInterrupted(order.id, '部分分片执行失败');
            console.log(`⚠️  订单标记为中断: ${order.id}`);
        }
        onProgress?.({
            phase: 'completion',
            overallProgress: 100,
            message: `并行铸造完成: ${statistics.totalTokensMinted} tokens`
        });
        const result = {
            success: allSuccessful,
            startTime,
            endTime,
            totalDuration: endTime - startTime,
            walletSystem,
            feeCalculation,
            compositeParentTx: compositeParentResult,
            sliceResults,
            statistics
        };
        console.log(`\n🎉 PROJECT SUPERCLUSTER 增强版完成！`);
        console.log(`   总耗时: ${(result.totalDuration / 1000).toFixed(1)} 秒`);
        console.log(`   成功分片: ${statistics.successfulSlices}/${statistics.totalSlices}`);
        console.log(`   铸造tokens: ${statistics.totalTokensMinted}`);
        console.log(`   并行效率: ${(statistics.parallelEfficiency * 100).toFixed(1)}%`);
        console.log(`   订单ID: ${order.id}`);
        return result;
    }
    catch (error) {
        const endTime = Date.now();
        console.error(`💥 PROJECT SUPERCLUSTER 增强版失败: ${error.message}`);
        return {
            success: false,
            startTime,
            endTime,
            totalDuration: endTime - startTime,
            walletSystem: {},
            feeCalculation: {},
            compositeParentTx: {
                transaction: {},
                voutLayout: {}
            },
            sliceResults: [],
            statistics: {
                totalSlices: 0,
                successfulSlices: 0,
                failedSlices: 0,
                totalTransactions: 0,
                totalTokensMinted: 0,
                totalFeesPaid: 0,
                averageSliceTime: 0,
                parallelEfficiency: 0
            },
            error: {
                phase: 'preparation',
                message: error.message,
                details: error
            }
        };
    }
}
exports.executeParallelChainMintingWithTracking = executeParallelChainMintingWithTracking;
// ============================================================================
// 分片配置管理和追踪功能
// ============================================================================
/**
 * 初始化分片配置到订单中
 */
async function initializeSliceConfigurations(orderManager, orderId, walletSystem, config) {
    const { SliceStatus } = await Promise.resolve().then(() => tslib_1.__importStar(require('./chainMintOrder')));
    // 计算每个分片的mint数量
    const tokensPerSlice = 25;
    const totalSlices = walletSystem.totalSlices;
    const lastSliceTokens = config.totalMints % tokensPerSlice || tokensPerSlice;
    const sliceConfigs = [];
    for (let i = 0; i < totalSlices; i++) {
        const relayWallet = walletSystem.relayWallets[i];
        const mintCount = i === totalSlices - 1 ? lastSliceTokens : tokensPerSlice;
        const sliceConfig = {
            sliceIndex: i,
            status: SliceStatus.PENDING,
            relayAddress: relayWallet.address,
            relayWalletIndex: relayWallet.derivationIndex,
            mintCount,
            // 保存原始配置，用于恢复
            originalConfig: {
                contractId: config.contractId,
                finalReceiverAddress: config.finalReceiverAddress,
                broadcastConfig: config.broadcastConfig || {
                    maxRetries: 3,
                    retryDelayMs: 1000,
                    confirmationTimeoutMs: 30000,
                    waitForAcceptance: false
                }
            },
            // 执行状态
            completedChildTxs: 0,
            lastTxId: null,
            lastOutputAmount: 0,
            parentVoutIndex: -1,
            // 时间戳
            createdAt: Date.now(),
            startTime: null,
            endTime: null,
            // 错误信息
            error: null
        };
        sliceConfigs.push(sliceConfig);
    }
    // 更新订单的分片配置
    await orderManager.updateOrderProgress(orderId, {
        totalSlices: totalSlices,
        slices: sliceConfigs
    });
    console.log(`✅ 初始化 ${totalSlices} 个分片配置`);
    sliceConfigs.forEach((slice, index) => {
        console.log(`   分片${index}: ${slice.mintCount} tokens, 中继地址=${slice.relayAddress}`);
    });
}
/**
 * 更新分片费率配置
 */
async function updateSliceConfigurations(orderManager, orderId, feeCalculation, feeRateConfig) {
    const order = await orderManager.loadOrder(orderId);
    if (!order || !order.progress.slices) {
        throw new Error(`无法加载订单或分片配置: ${orderId}`);
    }
    // 更新每个分片的费率配置
    const updatedSlices = order.progress.slices.map((slice, index) => {
        const sliceCalc = feeCalculation.sliceCalculations[index];
        return {
            ...slice,
            feeRateConfig: {
                feeRate: sliceCalc.feeRate,
                isCpfpSlice: sliceCalc.isCpfpSlice,
                standardFeeRate: feeRateConfig.standardFeeRate,
                cpfpFeeRate: feeRateConfig.cpfpFeeRate,
                cpfpMultiplier: feeRateConfig.cpfpMultiplier
            },
            estimatedFees: {
                relayFuelAmount: sliceCalc.feeDetails.relayFuelAmount,
                childTxFee: sliceCalc.feeDetails.childTx.totalFee,
                totalEstimatedFee: sliceCalc.feeDetails.relayFuelAmount + sliceCalc.feeDetails.childTx.totalFee
            }
        };
    });
    await orderManager.updateOrderProgress(orderId, {
        slices: updatedSlices
    });
    console.log(`✅ 更新分片费率配置完成`);
}
/**
 * 更新分片的vout映射信息
 */
async function updateSliceVoutMapping(orderManager, orderId, voutLayout) {
    const order = await orderManager.loadOrder(orderId);
    if (!order || !order.progress.slices) {
        throw new Error(`无法加载订单或分片配置: ${orderId}`);
    }
    // 更新每个分片的父交易输出位置
    const updatedSlices = order.progress.slices.map((slice, index) => {
        const sliceOutput = voutLayout.sliceOutputs[index];
        return {
            ...slice,
            parentVoutIndex: sliceOutput.voutIndex,
            parentOutputAmount: sliceOutput.amount
        };
    });
    await orderManager.updateOrderProgress(orderId, {
        slices: updatedSlices
    });
    console.log(`✅ 更新分片vout映射完成`);
}
/**
 * 执行所有分片并实时追踪每个分片的状态
 */
async function executeAllSlicesWithTracking({ orderId, orderManager, walletSystem, feeCalculation, compositeParentTx, voutLayout, contractId, finalReceiverAddress, provider, broadcastConfig, enableParallel = true, maxConcurrent = 6, onProgress }) {
    const { SliceStatus } = await Promise.resolve().then(() => tslib_1.__importStar(require('./chainMintOrder')));
    // 获取订单当前状态
    const order = await orderManager.loadOrder(orderId);
    if (!order || !order.progress.slices) {
        throw new Error(`无法加载订单分片配置: ${orderId}`);
    }
    // 为每个分片创建执行配置，保留原始配置参数
    const sliceConfigs = feeCalculation.sliceCalculations.map((sliceCalc, index) => {
        const relayWallet = walletSystem.relayWallets[index];
        const sliceOutput = voutLayout.sliceOutputs[index];
        const sliceProgress = order.progress.slices[index];
        const config = {
            sliceIndex: sliceCalc.sliceIndex,
            compositeParentTxId: compositeParentTx.expectedTxId,
            parentVoutIndex: sliceOutput.voutIndex,
            relayWallet,
            mainWallet: walletSystem.mainWallet,
            contractId,
            feeCalculation: sliceCalc,
            finalReceiverAddress,
            provider,
            broadcastConfig: sliceProgress.originalConfig.broadcastConfig,
            // 保存分片特定的配置
            sliceSpecificConfig: {
                mintCount: sliceProgress.mintCount,
                feeRateConfig: sliceProgress.feeRateConfig,
                estimatedFees: sliceProgress.estimatedFees,
                relayAddress: sliceProgress.relayAddress,
                relayWalletIndex: sliceProgress.relayWalletIndex
            }
        };
        return config;
    });
    // 执行分片，根据逻辑：分片0立即开始，分片1-M等待父交易确认后并行开始
    console.log(`   执行策略: 分片0串行启动 → 父交易确认 → 分片1-${walletSystem.totalSlices - 1}${enableParallel ? '并行' : '串行'}执行`);
    const results = [];
    if (walletSystem.totalSlices === 1) {
        // 只有一个分片，直接执行
        console.log(`   只有一个分片，直接执行`);
        const result = await executeSliceWithTracking(orderManager, orderId, sliceConfigs[0], onProgress);
        results.push(result);
    }
    else {
        // 多分片执行逻辑
        console.log(`   多分片执行: 分片0先行，其余${enableParallel ? '并行' : '串行'}执行`);
        // 分片0立即开始（CPFP分片）
        console.log(`\n🚀 启动分片0 (CPFP分片)...`);
        const slice0Result = await executeSliceWithTracking(orderManager, orderId, sliceConfigs[0], onProgress);
        results.push(slice0Result);
        console.log(`✅ 分片0完成，状态: ${slice0Result.success ? '成功' : '失败'}`);
        // 等待父交易被区块打包确认（无超时，循环等待）
        console.log(`\n⏳ 等待父交易被区块打包确认...`);
        let confirmed = false;
        while (!confirmed) {
            try {
                const acceptanceResult = await (0, transactionBroadcaster_1.waitForTransactionAcceptance)(compositeParentTx.expectedTxId, provider, 0 // 无超时，无限等待
                );
                if (acceptanceResult.confirmed) {
                    console.log(`✅ 父交易已被区块打包确认，开始执行剩余分片`);
                    confirmed = true;
                }
                else {
                    console.log(`⏳ 父交易仍在内存池中，继续等待区块确认...`);
                    // 检查是否为模拟模式
                    if (broadcastConfig?.simulationMode) {
                        // 模拟模式：随机等待10-30秒后模拟确认完成
                        const randomWaitTime = Math.floor(Math.random() * (30000 - 10000 + 1)) + 10000;
                        console.log(`   🎭 模拟模式：模拟区块打包时间，等待 ${(randomWaitTime / 1000).toFixed(1)} 秒...`);
                        await new Promise(resolve => setTimeout(resolve, randomWaitTime));
                        console.log(`✅ 模拟模式：模拟父交易已被区块打包确认，继续执行剩余分片`);
                        confirmed = true; // 跳出循环，继续流程
                    }
                    else {
                        // 正常模式：等待5秒后重试
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }
            }
            catch (error) {
                console.log(`⏳ 检查父交易状态失败，继续等待: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 5000)); // 等待5秒后重试
            }
        }
        // 执行剩余分片
        if (sliceConfigs.length > 1) {
            const remainingConfigs = sliceConfigs.slice(1);
            const remainingResults = await executeRemainingSlicesWithTracking(orderManager, orderId, remainingConfigs, enableParallel, maxConcurrent, onProgress);
            results.push(...remainingResults);
        }
    }
    return results;
}
/**
 * 执行单个分片并追踪状态
 */
async function executeSliceWithTracking(orderManager, orderId, config, onProgress) {
    const { SliceStatus } = await Promise.resolve().then(() => tslib_1.__importStar(require('./chainMintOrder')));
    // 更新分片状态为执行中
    await orderManager.updateSliceProgress(orderId, config.sliceIndex, {
        status: SliceStatus.EXECUTING,
        startTime: Date.now()
    });
    try {
        console.log(`🔄 开始执行分片 ${config.sliceIndex}...`);
        const result = await (0, sliceExecutor_1.executeSlice)(config, (progress) => {
            // 实时更新分片进度到订单，使用真实的交易ID
            orderManager.updateSliceProgress(orderId, config.sliceIndex, {
                completedChildTxs: progress.currentStep,
                lastTxId: progress.currentTxId || `progress-${progress.currentStep}`,
                lastOutputAmount: 0 // TODO: 获取真实的输出金额
            });
            onProgress?.(config.sliceIndex, progress);
        });
        // 更新分片状态为完成或失败
        await orderManager.updateSliceProgress(orderId, config.sliceIndex, {
            status: result.success ? SliceStatus.COMPLETED : SliceStatus.FAILED,
            endTime: Date.now(),
            error: result.error,
            completedChildTxs: result.childTransactions.length,
            lastTxId: result.childTransactions[result.childTransactions.length - 1]?.expectedTxId || null,
            lastOutputAmount: result.finalOutputAmount
        });
        console.log(`${result.success ? '✅' : '❌'} 分片 ${config.sliceIndex} 执行完成: ${result.success ? '成功' : '失败'}`);
        return result;
    }
    catch (error) {
        // 更新分片状态为失败
        await orderManager.updateSliceProgress(orderId, config.sliceIndex, {
            status: SliceStatus.FAILED,
            endTime: Date.now(),
            error: {
                phase: 'execution',
                message: error.message
            }
        });
        console.error(`💥 分片 ${config.sliceIndex} 执行失败: ${error.message}`);
        throw error;
    }
}
/**
 * 执行剩余分片（并行或串行）
 */
async function executeRemainingSlicesWithTracking(orderManager, orderId, sliceConfigs, enableParallel, maxConcurrent, onProgress) {
    if (!enableParallel) {
        // 串行执行剩余分片
        console.log(`   执行模式: 串行`);
        const results = [];
        for (const config of sliceConfigs) {
            const result = await executeSliceWithTracking(orderManager, orderId, config, onProgress);
            results.push(result);
        }
        return results;
    }
    else {
        // 并行执行剩余分片
        console.log(`   执行模式: 并行 (最大并发: ${maxConcurrent})`);
        const results = [];
        const executing = [];
        for (let i = 0; i < sliceConfigs.length; i++) {
            const config = sliceConfigs[i];
            // 启动分片执行
            const slicePromise = executeSliceWithTracking(orderManager, orderId, config, onProgress);
            executing.push(slicePromise);
            // 控制并发数量
            if (executing.length >= maxConcurrent || i === sliceConfigs.length - 1) {
                const batchResults = await Promise.allSettled(executing);
                // 处理批次结果
                for (const batchResult of batchResults) {
                    if (batchResult.status === 'fulfilled') {
                        results.push(batchResult.value);
                    }
                    else {
                        console.error(`💥 分片执行失败: ${batchResult.reason}`);
                        // 创建失败结果
                        results.push({
                            sliceIndex: -1,
                            success: false,
                            startTime: Date.now(),
                            endTime: Date.now(),
                            duration: 0,
                            childTransactions: [],
                            mintedTokens: 0,
                            finalOutputAmount: 0,
                            error: {
                                phase: 'execution',
                                message: batchResult.reason?.message || 'Unknown error'
                            }
                        });
                    }
                }
                // 清空执行队列
                executing.length = 0;
            }
        }
        return results;
    }
}
// ============================================================================
// 导出
// ============================================================================
//# sourceMappingURL=parallelCoordinator.js.map