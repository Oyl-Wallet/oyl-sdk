"use strict";
/**
 * Project Supercluster - 并行费用计算器
 *
 * 基于现有feeCalculation.ts的扩展，实现多分片并行费用计算
 * 100% 复用现有的HARDCODED_TRANSACTION_SIZES和performDryRunFeeCalculation逻辑
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatParallelFeeCalculation = exports.compareParallelVsSerialFees = exports.generateDynamicParallelFeeRates = exports.generateRecommendedParallelFeeRates = exports.calculateParallelFees = void 0;
const chainMinting_1 = require("./chainMinting");
const feeCalculation_1 = require("./feeCalculation");
// ============================================================================
// 主要功能函数
// ============================================================================
/**
 * 计算并行费用需求
 *
 * 基于现有的performDryRunFeeCalculation，扩展支持多分片计算
 */
async function calculateParallelFees({ walletSystem, contractId, totalMints, feeRateConfig, provider }) {
    try {
        console.log(`🧮 Project Supercluster 并行费用计算`);
        console.log(`   总铸造数量: ${totalMints}`);
        console.log(`   分片数量: ${walletSystem.totalSlices}`);
        console.log(`   标准费率: ${feeRateConfig.standardFeeRate} sat/vB`);
        console.log(`   CPFP费率: ${feeRateConfig.cpfpFeeRate} sat/vB`);
        validateParallelFeeParams(totalMints, feeRateConfig, walletSystem.totalSlices);
        // 1. 计算复合父交易费用
        const compositeParentFee = calculateCompositeParentFee(walletSystem.totalSlices, feeRateConfig.standardFeeRate);
        // 2. 计算各分片费用 (复用现有的performDryRunFeeCalculation)
        const sliceCalculations = [];
        for (let sliceIndex = 0; sliceIndex < walletSystem.totalSlices; sliceIndex++) {
            // 计算该分片的铸造数量
            const mintCount = calculateSliceMintCount(totalMints, sliceIndex, walletSystem.totalSlices);
            // 确定费率 (第一片使用CPFP加速)
            const isCpfpSlice = sliceIndex === 0;
            const feeRate = isCpfpSlice ? feeRateConfig.cpfpFeeRate : feeRateConfig.standardFeeRate;
            console.log(`   🧮 分片 ${sliceIndex}: ${mintCount} tokens, ${feeRate} sat/vB`);
            // 使用现有的费用计算逻辑 (传入dummy钱包用于API兼容性)
            const dummyWallets = {
                mainWallet: walletSystem.mainWallet,
                relayWallet: walletSystem.relayWallets[sliceIndex].wallet
            };
            const sliceFeeDetails = await (0, feeCalculation_1.performDryRunFeeCalculation)({
                wallets: dummyWallets,
                contractId,
                childCount: mintCount,
                feeRate,
                provider
            });
            sliceCalculations.push({
                sliceIndex,
                mintCount,
                feeRate,
                isCpfpSlice,
                feeDetails: sliceFeeDetails
            });
            console.log(`   ✅ 分片 ${sliceIndex}: ${sliceFeeDetails.totalRequiredFunding} sats`);
        }
        // 3. 计算总体统计
        const summary = calculateParallelSummary(compositeParentFee, sliceCalculations, feeRateConfig);
        const result = {
            compositeParentTx: compositeParentFee,
            sliceCalculations,
            totalSlices: walletSystem.totalSlices,
            totalMints,
            summary
        };
        console.log(`🧮 并行费用计算完成`);
        console.log(`   总父交易费用: ${summary.totalParentFee} sats`);
        console.log(`   总子交易费用: ${summary.totalChildFees} sats`);
        console.log(`   总网络费用: ${summary.totalNetworkFees} sats`);
        console.log(`   总资金需求: ${summary.totalRequiredFunding} sats`);
        console.log(`   预计耗时: ${summary.estimatedTimeMinutes} 分钟`);
        return result;
    }
    catch (error) {
        console.error(`💥 并行费用计算失败:`, error.message);
        throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.FEE_CALCULATION_ERROR, `并行费用计算失败: ${error.message}`, { contractId, totalMints, feeRateConfig });
    }
}
exports.calculateParallelFees = calculateParallelFees;
/**
 * 计算复合父交易费用
 *
 * 基于hardcoded的父交易基础大小，考虑多个分片输出
 */
function calculateCompositeParentFee(totalSlices, feeRate) {
    // 基础父交易大小 (1个输入 + 1个OP_RETURN + 1个找零)
    const baseTxSize = feeCalculation_1.HARDCODED_TRANSACTION_SIZES.PARENT_TX_VSIZE;
    // 每个额外的P2WPKH输出增加约31字节
    const additionalOutputSize = (totalSlices - 1) * 31; // 减1因为基础大小已包含1个输出
    const totalVSize = baseTxSize + additionalOutputSize;
    const totalFee = Math.ceil(totalVSize * feeRate);
    return {
        vSize: totalVSize,
        baseFee: totalFee,
        totalFee: totalFee,
        feeRate: feeRate,
        outputCount: totalSlices + 2,
        totalSliceOutputValue: 0 // 将在后续步骤中计算
    };
}
/**
 * 计算分片的铸造数量
 */
function calculateSliceMintCount(totalMints, sliceIndex, totalSlices) {
    const baseMintsPerSlice = Math.floor(totalMints / totalSlices);
    const remainder = totalMints % totalSlices;
    // 将余数分配给前面的分片
    if (sliceIndex < remainder) {
        return baseMintsPerSlice + 1;
    }
    else {
        return baseMintsPerSlice;
    }
}
/**
 * 计算并行执行的总体统计
 */
function calculateParallelSummary(compositeParentFee, sliceCalculations, feeRateConfig) {
    const totalParentFee = compositeParentFee.totalFee;
    const totalChildFees = sliceCalculations.reduce((sum, slice) => sum + slice.feeDetails.totalChildFees, 0);
    const totalNetworkFees = totalParentFee + totalChildFees;
    // 计算中继燃料总需求 (不包括父交易费用，因为那是从主钱包支付的)
    const totalRequiredFunding = sliceCalculations.reduce((sum, slice) => sum + slice.feeDetails.relayFuelAmount, 0) + totalParentFee;
    // 计算CPFP溢价
    const cpfpSlice = sliceCalculations.find(s => s.isCpfpSlice);
    const standardSlice = sliceCalculations.find(s => !s.isCpfpSlice);
    const cpfpPremium = cpfpSlice && standardSlice ?
        cpfpSlice.feeDetails.totalChildFees - standardSlice.feeDetails.totalChildFees : 0;
    // 预计执行时间 (CPFP加速 + 并行执行)
    // 假设CPFP确认需要1个区块(10分钟)，并行执行每批需要2分钟
    const estimatedTimeMinutes = 10 + (sliceCalculations.length - 1) * 2;
    return {
        totalParentFee,
        totalChildFees,
        totalNetworkFees,
        totalRequiredFunding,
        estimatedTimeMinutes,
        cpfpPremium
    };
}
// ============================================================================
// 费率配置生成器
// ============================================================================
/**
 * 生成推荐的并行费率配置
 */
function generateRecommendedParallelFeeRates(baseFeeRate, cpfpMultiplier = 3) {
    const standardFeeRate = Math.max(baseFeeRate, chainMinting_1.SAFETY_PARAMS.MIN_FEE_RATE);
    const cpfpFeeRate = Math.min(standardFeeRate * cpfpMultiplier, chainMinting_1.SAFETY_PARAMS.MAX_FEE_RATE);
    return {
        standardFeeRate,
        cpfpFeeRate,
        cpfpMultiplier
    };
}
exports.generateRecommendedParallelFeeRates = generateRecommendedParallelFeeRates;
/**
 * 基于网络状况的动态费率配置
 */
async function generateDynamicParallelFeeRates(provider, urgencyLevel = 'medium') {
    try {
        const feeEstimates = await provider.esplora.getFeeEstimates();
        let baseFeeRate;
        switch (urgencyLevel) {
            case 'low':
                baseFeeRate = feeEstimates['6'] || feeEstimates['144'] || 1; // 6 blocks or 144 blocks
                break;
            case 'high':
                baseFeeRate = feeEstimates['1'] || feeEstimates['3'] || 10; // next block or 3 blocks
                break;
            case 'medium':
            default:
                baseFeeRate = feeEstimates['3'] || feeEstimates['6'] || 5; // 3 or 6 blocks
                break;
        }
        return generateRecommendedParallelFeeRates(baseFeeRate);
    }
    catch (error) {
        console.warn(`⚠️ 无法获取网络费率估算，使用默认配置: ${error.message}`);
        return generateRecommendedParallelFeeRates(10); // 默认10 sat/vB
    }
}
exports.generateDynamicParallelFeeRates = generateDynamicParallelFeeRates;
// ============================================================================
// 验证和比较功能
// ============================================================================
/**
 * 验证并行费用计算参数
 */
function validateParallelFeeParams(totalMints, feeRateConfig, totalSlices) {
    if (totalMints < 1 || totalMints > 2500) {
        throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.FEE_CALCULATION_ERROR, `总铸造数量超出范围: ${totalMints} (允许范围: 1-2500)`);
    }
    if (feeRateConfig.standardFeeRate < chainMinting_1.SAFETY_PARAMS.MIN_FEE_RATE ||
        feeRateConfig.standardFeeRate > chainMinting_1.SAFETY_PARAMS.MAX_FEE_RATE) {
        throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.FEE_CALCULATION_ERROR, `标准费率超出安全范围: ${feeRateConfig.standardFeeRate}`);
    }
    if (feeRateConfig.cpfpFeeRate < feeRateConfig.standardFeeRate) {
        throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.FEE_CALCULATION_ERROR, `CPFP费率不能低于标准费率: ${feeRateConfig.cpfpFeeRate} < ${feeRateConfig.standardFeeRate}`);
    }
    if (totalSlices < 1 || totalSlices > 100) {
        throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.FEE_CALCULATION_ERROR, `分片数量超出范围: ${totalSlices} (允许范围: 1-100)`);
    }
}
/**
 * 比较并行费用与传统串行费用
 */
function compareParallelVsSerialFees(parallelFees, serialFeeRate) {
    // 计算串行执行的估算费用 (每次25个token，需要多次执行)
    const executionsNeeded = Math.ceil(parallelFees.totalMints / 25);
    const singleExecutionFee = Math.ceil(feeCalculation_1.HARDCODED_TRANSACTION_SIZES.PARENT_TX_VSIZE * serialFeeRate) +
        (24 * Math.ceil(feeCalculation_1.HARDCODED_TRANSACTION_SIZES.CHILD_TX_VSIZE * serialFeeRate)) +
        Math.ceil(feeCalculation_1.HARDCODED_TRANSACTION_SIZES.FINAL_CHILD_TX_VSIZE * serialFeeRate);
    const serialTotalFees = singleExecutionFee * executionsNeeded;
    const serialTimeMinutes = executionsNeeded * 30; // 假设每次执行需要30分钟
    const feeSaving = serialTotalFees - parallelFees.summary.totalNetworkFees;
    const timeSaving = serialTimeMinutes - parallelFees.summary.estimatedTimeMinutes;
    return {
        serialEstimate: {
            totalFees: serialTotalFees,
            totalExecutions: executionsNeeded,
            estimatedTimeMinutes: serialTimeMinutes
        },
        parallelAdvantage: {
            feeSaving,
            timeSaving,
            feeEfficiency: feeSaving / serialTotalFees,
            timeEfficiency: timeSaving / serialTimeMinutes
        }
    };
}
exports.compareParallelVsSerialFees = compareParallelVsSerialFees;
/**
 * 格式化并行费用计算结果
 */
function formatParallelFeeCalculation(result) {
    const cpfpSlices = result.sliceCalculations.filter(s => s.isCpfpSlice);
    const standardSlices = result.sliceCalculations.filter(s => !s.isCpfpSlice);
    return `
🧮 Project Supercluster 并行费用计算结果:
=====================================

📊 复合父交易:
├─ 交易大小: ${result.compositeParentTx.vSize} vB
├─ 输出数量: ${result.compositeParentTx.outputCount} (${result.totalSlices}个分片 + OP_RETURN + 找零)
├─ 费率: ${result.compositeParentTx.feeRate} sat/vB
└─ 总费用: ${result.compositeParentTx.totalFee} sats

🚀 CPFP加速分片 (${cpfpSlices.length}个):
${cpfpSlices.map(slice => `├─ 分片 ${slice.sliceIndex}: ${slice.mintCount} tokens, ${slice.feeDetails.totalRequiredFunding} sats (${slice.feeRate} sat/vB)`).join('\n')}

⚡ 标准分片 (${standardSlices.length}个):
${standardSlices.map(slice => `├─ 分片 ${slice.sliceIndex}: ${slice.mintCount} tokens, ${slice.feeDetails.totalRequiredFunding} sats (${slice.feeRate} sat/vB)`).join('\n')}

💰 费用汇总:
├─ 父交易费用: ${result.summary.totalParentFee} sats
├─ 子交易费用: ${result.summary.totalChildFees} sats
├─ 总网络费用: ${result.summary.totalNetworkFees} sats
├─ 总资金需求: ${result.summary.totalRequiredFunding} sats
├─ CPFP溢价: ${result.summary.cpfpPremium} sats
└─ 预计耗时: ${result.summary.estimatedTimeMinutes} 分钟

📈 性能提升:
├─ 总铸造量: ${result.totalMints} tokens
├─ 并行分片: ${result.totalSlices} 个
└─ 并行效率: ${((result.totalMints / result.totalSlices) / 25 * 100).toFixed(1)}% (相对于串行执行)
`;
}
exports.formatParallelFeeCalculation = formatParallelFeeCalculation;
// ============================================================================
// 导出
// ============================================================================
//# sourceMappingURL=parallelFeeCalculator.js.map