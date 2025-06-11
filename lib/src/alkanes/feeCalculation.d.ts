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
    /** 父交易vSize - 包含P2TR输入,P2WPKH中继输出,OP_RETURN,P2TR找零 */
    readonly PARENT_TX_VSIZE: 185;
    /** 普通子交易vSize (1-23) - P2WPKH输入,P2WPKH输出,OP_RETURN */
    readonly CHILD_TX_VSIZE: 146.25;
    /** 最后子交易vSize (24) - P2WPKH输入,P2TR输出,OP_RETURN */
    readonly FINAL_CHILD_TX_VSIZE: 158.5;
};
/**
 * 执行精确费用计算
 *
 * 使用硬编码的准确交易大小进行精确费用计算
 */
export declare function performDryRunFeeCalculation({ wallets, contractId, childCount, feeRate, provider }: {
    wallets: ChainMintingWallets;
    contractId: AlkaneContractId;
    childCount: number;
    feeRate: number;
    provider: Provider;
}): Promise<ChainMintingFeeCalculation>;
/**
 * 基于硬编码大小的精确费用计算
 *
 * 使用硬编码的准确交易大小，与performDryRunFeeCalculation保持一致
 */
export declare function calculateActualTransactionFees({ wallets, contractId, childCount, feeRate, provider, actualUtxos }: {
    wallets: ChainMintingWallets;
    contractId: AlkaneContractId;
    childCount: number;
    feeRate: number;
    provider: Provider;
    actualUtxos: FormattedUtxo[];
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
