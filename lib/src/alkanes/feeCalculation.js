"use strict";
/**
 * 精确费用计算模块
 *
 * 基于实际PSBT构建的vSize计算，确保费用估算的准确性
 * 支持Dry Run模式进行费用预估
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatFeeCalculationResult = exports.compareFeeCalculations = exports.calculateActualTransactionFees = exports.performDryRunFeeCalculation = exports.PARENT_TX_VSIZE = exports.calculateParentTxVSize = exports.HARDCODED_TRANSACTION_SIZES = void 0;
const chainMinting_1 = require("./chainMinting");
// ============================================================================
// 硬编码的精确交易大小 (基于实际测试结果)
// ============================================================================
/**
 * 硬编码的交易vSize - 基于实际构建和测试的结果
 */
exports.HARDCODED_TRANSACTION_SIZES = {
    /** 基础父交易vSize - 包含P2TR输入,P2WPKH中继输出,OP_RETURN,P2TR找零 (单分片) */
    PARENT_TX_VSIZE_BASE: 171,
    /** 每增加一个分片的父交易大小增量 */
    PARENT_TX_VSIZE_PER_SLICE: 33,
    /** 普通子交易vSize (1-23) - P2WPKH输入,P2WPKH输出,OP_RETURN */
    CHILD_TX_VSIZE: 138.5,
    /** 最后子交易vSize (24) - P2WPKH输入,P2TR输出,OP_RETURN */
    FINAL_CHILD_TX_VSIZE: 150.5
};
/**
 * 计算动态父交易vSize
 * 根据分片数量动态计算父交易的虚拟大小
 *
 * @param sliceCount 分片数量 (默认为1，适用于Project Snowball)
 * @returns 父交易的vSize
 */
function calculateParentTxVSize(sliceCount = 1) {
    if (sliceCount < 1) {
        throw new Error(`分片数量必须大于等于1: ${sliceCount}`);
    }
    // 基础大小 + 每个额外分片增加33
    const vSize = exports.HARDCODED_TRANSACTION_SIZES.PARENT_TX_VSIZE_BASE +
        (sliceCount - 1) * exports.HARDCODED_TRANSACTION_SIZES.PARENT_TX_VSIZE_PER_SLICE;
    return vSize;
}
exports.calculateParentTxVSize = calculateParentTxVSize;
/**
 * 为了向后兼容，保留原来的PARENT_TX_VSIZE常量 (单分片情况)
 */
exports.PARENT_TX_VSIZE = exports.HARDCODED_TRANSACTION_SIZES.PARENT_TX_VSIZE_BASE;
// ============================================================================
// 主要费用计算函数
// ============================================================================
/**
 * 执行精确费用计算
 *
 * 使用硬编码的准确交易大小进行精确费用计算
 * 支持动态父交易大小计算 (用于Project Supercluster)
 */
async function performDryRunFeeCalculation({ wallets, contractId, childCount, feeRate, provider, sliceCount = 1, isCpfpSlice = false }) {
    try {
        // 参数保留用于API兼容性
        void wallets;
        void provider;
        validateFeeCalculationParams(feeRate, childCount, isCpfpSlice);
        console.log(`🧮 费用计算: ${contractId.block}:${contractId.tx}, ${childCount}笔, ${feeRate} sat/vB${sliceCount > 1 ? `, ${sliceCount}分片` : ''}`);
        // 计算动态父交易大小和费用
        const parentTxVSize = calculateParentTxVSize(sliceCount);
        const parentTotalFee = Math.ceil(parentTxVSize * feeRate);
        // 普通子交易费用 (1到childCount-1)
        const normalChildFee = Math.ceil(exports.HARDCODED_TRANSACTION_SIZES.CHILD_TX_VSIZE * feeRate);
        const normalChildCount = childCount - 1;
        const normalChildTotalFees = normalChildFee * normalChildCount;
        // 最后子交易费用 (第childCount笔)
        const finalChildFee = Math.ceil(exports.HARDCODED_TRANSACTION_SIZES.FINAL_CHILD_TX_VSIZE * feeRate);
        // 最终输出dust阈值 (假设最终接收地址为P2TR)
        const finalOutputDust = 330; // P2TR dust threshold
        // 总费用计算
        const totalChildFees = normalChildTotalFees + finalChildFee;
        const relayFuelAmount = totalChildFees + finalOutputDust; // 包含最终输出的dust
        const totalRequiredFunding = parentTotalFee + relayFuelAmount;
        console.log(`💰 费用计算: 父交易=${parentTotalFee}, 子交易=${totalChildFees}, 总需求=${totalRequiredFunding} sats`);
        const result = {
            parentTx: {
                vSize: parentTxVSize,
                baseFee: parentTotalFee,
                totalFee: parentTotalFee,
                feeRate: feeRate
            },
            childTx: {
                vSize: exports.HARDCODED_TRANSACTION_SIZES.CHILD_TX_VSIZE,
                baseFee: normalChildFee,
                totalFee: normalChildFee,
                feeRate: feeRate
            },
            childCount: childCount,
            totalChildFees: totalChildFees,
            relayFuelAmount: relayFuelAmount,
            totalRequiredFunding: totalRequiredFunding,
            safetyBuffer: 0
        };
        return result;
    }
    catch (error) {
        console.error(`💥 费用计算失败:`, error.message);
        throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.FEE_CALCULATION_ERROR, `费用计算失败: ${error.message}`, { contractId, childCount, feeRate });
    }
}
exports.performDryRunFeeCalculation = performDryRunFeeCalculation;
/**
 * 基于硬编码大小的精确费用计算
 *
 * 使用硬编码的准确交易大小，与performDryRunFeeCalculation保持一致
 * 支持动态父交易大小计算 (用于Project Supercluster)
 */
async function calculateActualTransactionFees({ wallets, contractId, childCount, feeRate, provider, actualUtxos, sliceCount = 1 }) {
    try {
        console.log(`🎯 精确费用计算: ${actualUtxos.length} UTXOs`);
        // 使用与performDryRunFeeCalculation相同的逻辑
        return await performDryRunFeeCalculation({
            wallets,
            contractId,
            childCount,
            feeRate,
            provider,
            sliceCount
        });
    }
    catch (error) {
        console.error(`💥 费用计算失败:`, error.message);
        throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.FEE_CALCULATION_ERROR, `实际费用计算失败: ${error.message}`, { contractId, childCount, feeRate, utxoCount: actualUtxos.length });
    }
}
exports.calculateActualTransactionFees = calculateActualTransactionFees;
// ============================================================================
// 辅助函数
// ============================================================================
/**
 * 验证费用计算参数
 */
function validateFeeCalculationParams(feeRate, childCount, isCpfpSlice = false) {
    if (feeRate < chainMinting_1.SAFETY_PARAMS.MIN_FEE_RATE || feeRate > chainMinting_1.SAFETY_PARAMS.MAX_FEE_RATE) {
        throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.FEE_CALCULATION_ERROR, `费率超出安全范围: ${feeRate} (允许范围: ${chainMinting_1.SAFETY_PARAMS.MIN_FEE_RATE}-${chainMinting_1.SAFETY_PARAMS.MAX_FEE_RATE})`);
    }
    // 分片0（CPFP分片）最多24笔子交易，其他分片最多25笔子交易
    const maxChildCount = isCpfpSlice ? 24 : 25;
    const sliceType = isCpfpSlice ? 'CPFP分片' : '普通分片';
    if (childCount < 1 || childCount > maxChildCount) {
        throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.FEE_CALCULATION_ERROR, `子交易数量超出范围: ${childCount} (${sliceType}允许范围: 1-${maxChildCount})`);
    }
}
/**
 * 比较两次费用计算结果的差异
 */
function compareFeeCalculations(dryRun, actual) {
    const parentFeeDiff = actual.parentTx.totalFee - dryRun.parentTx.totalFee;
    const childFeeDiff = actual.childTx.totalFee - dryRun.childTx.totalFee;
    const totalDiff = actual.totalRequiredFunding - dryRun.totalRequiredFunding;
    const accuracy = 1 - Math.abs(totalDiff) / dryRun.totalRequiredFunding;
    return {
        parentFeeDiff,
        childFeeDiff,
        totalDiff,
        accuracy: Math.max(0, accuracy)
    };
}
exports.compareFeeCalculations = compareFeeCalculations;
/**
 * 格式化费用计算结果用于显示
 */
function formatFeeCalculationResult(result) {
    // 计算普通子交易和最后子交易的费用
    const normalChildFee = Math.ceil(exports.HARDCODED_TRANSACTION_SIZES.CHILD_TX_VSIZE * result.childTx.feeRate);
    const finalChildFee = Math.ceil(exports.HARDCODED_TRANSACTION_SIZES.FINAL_CHILD_TX_VSIZE * result.childTx.feeRate);
    const normalChildCount = result.childCount - 1;
    const finalOutputDust = 330;
    return `
📊 费用计算汇总:
├─ 父交易: ${result.parentTx.totalFee} sats (${result.parentTx.vSize} vB × ${result.parentTx.feeRate} sat/vB)
├─ 普通子交易 (1-${normalChildCount}): ${normalChildFee} sats × ${normalChildCount} = ${normalChildFee * normalChildCount} sats
├─ 最后子交易 (${result.childCount}): ${finalChildFee} sats (${exports.HARDCODED_TRANSACTION_SIZES.FINAL_CHILD_TX_VSIZE} vB × ${result.childTx.feeRate} sat/vB)
├─ 子交易总费用: ${result.totalChildFees} sats
├─ 最终输出dust: ${finalOutputDust} sats (P2TR minimum)
├─ 中继燃料: ${result.relayFuelAmount} sats (包含最终输出)
└─ 总需求: ${result.totalRequiredFunding} sats
`;
}
exports.formatFeeCalculationResult = formatFeeCalculationResult;
//# sourceMappingURL=feeCalculation.js.map