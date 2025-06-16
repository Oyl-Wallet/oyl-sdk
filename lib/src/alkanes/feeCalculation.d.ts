/**
 * 精确费用计算模块
 *
 * 基于实际PSBT构建的vSize计算，确保费用估算的准确性
 * 支持Dry Run模式进行费用预估
 */
import { Provider } from '../provider/provider';
import { FormattedUtxo } from '../utxo/types';
import { ChainMintingFeeCalculation, ChainMintingWallets, AlkaneContractId } from './chainMinting';
/**
 * 硬编码的交易vSize - 基于实际构建和测试的结果
 */
export declare const HARDCODED_TRANSACTION_SIZES: {
    /** 基础父交易vSize - 包含P2TR输入,P2WPKH中继输出,OP_RETURN,P2TR找零 (单分片) */
    readonly PARENT_TX_VSIZE_BASE: 171;
    /** 每增加一个分片的父交易大小增量 */
    readonly PARENT_TX_VSIZE_PER_SLICE: 33;
    /** 普通子交易vSize (1-23) - P2WPKH输入,P2WPKH输出,OP_RETURN */
    readonly CHILD_TX_VSIZE: 138.5;
    /** 最后子交易vSize (24) - P2WPKH输入,P2TR输出,OP_RETURN */
    readonly FINAL_CHILD_TX_VSIZE: 150.5;
};
/**
 * 计算动态父交易vSize
 * 根据分片数量动态计算父交易的虚拟大小
 *
 * @param sliceCount 分片数量 (默认为1，适用于Project Snowball)
 * @returns 父交易的vSize
 */
export declare function calculateParentTxVSize(sliceCount?: number): number;
/**
 * 为了向后兼容，保留原来的PARENT_TX_VSIZE常量 (单分片情况)
 */
export declare const PARENT_TX_VSIZE: 171;
/**
 * 执行精确费用计算
 *
 * 使用硬编码的准确交易大小进行精确费用计算
 * 支持动态父交易大小计算 (用于Project Supercluster)
 */
export declare function performDryRunFeeCalculation({ wallets, contractId, childCount, feeRate, provider, sliceCount, isCpfpSlice }: {
    wallets: ChainMintingWallets;
    contractId: AlkaneContractId;
    childCount: number;
    feeRate: number;
    provider: Provider;
    sliceCount?: number;
    isCpfpSlice?: boolean;
}): Promise<ChainMintingFeeCalculation>;
/**
 * 基于硬编码大小的精确费用计算
 *
 * 使用硬编码的准确交易大小，与performDryRunFeeCalculation保持一致
 * 支持动态父交易大小计算 (用于Project Supercluster)
 */
export declare function calculateActualTransactionFees({ wallets, contractId, childCount, feeRate, provider, actualUtxos, sliceCount }: {
    wallets: ChainMintingWallets;
    contractId: AlkaneContractId;
    childCount: number;
    feeRate: number;
    provider: Provider;
    actualUtxos: FormattedUtxo[];
    sliceCount?: number;
}): Promise<ChainMintingFeeCalculation>;
/**
 * 比较两次费用计算结果的差异
 */
export declare function compareFeeCalculations(dryRun: ChainMintingFeeCalculation, actual: ChainMintingFeeCalculation): {
    parentFeeDiff: number;
    childFeeDiff: number;
    totalDiff: number;
    accuracy: number;
};
/**
 * 格式化费用计算结果用于显示
 */
export declare function formatFeeCalculationResult(result: ChainMintingFeeCalculation): string;
