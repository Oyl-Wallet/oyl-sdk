/**
 * Project Supercluster - 并行费用计算器
 *
 * 基于现有feeCalculation.ts的扩展，实现多分片并行费用计算
 * 100% 复用现有的HARDCODED_TRANSACTION_SIZES和performDryRunFeeCalculation逻辑
 */
import { Provider } from '../provider/provider';
import { ChainMintingFeeCalculation, AlkaneContractId } from './chainMinting';
import { MultiRelayWalletSystem } from './multiRelayWalletManager';
/**
 * 单个分片的费用计算结果
 */
export interface SliceFeeCalculation {
    /** 分片索引 */
    sliceIndex: number;
    /** 分片内的铸造数量 */
    mintCount: number;
    /** 使用的费率 */
    feeRate: number;
    /** 是否为CPFP加速分片 */
    isCpfpSlice: boolean;
    /** 分片费用详情 (复用现有结构) */
    feeDetails: ChainMintingFeeCalculation;
}
/**
 * 复合父交易费用分析
 */
export interface CompositeParentFeeAnalysis {
    /** 交易虚拟大小 */
    vSize: number;
    /** 基础费用 */
    baseFee: number;
    /** 总费用 */
    totalFee: number;
    /** 费率 */
    feeRate: number;
    /** 输出数量 (分片数量 + OP_RETURN + 找零) */
    outputCount: number;
    /** 分片输出总金额 */
    totalSliceOutputValue: number;
}
/**
 * 并行费用计算结果
 */
export interface ParallelFeeCalculation {
    /** 复合父交易费用分析 */
    compositeParentTx: CompositeParentFeeAnalysis;
    /** 各分片费用计算列表 */
    sliceCalculations: SliceFeeCalculation[];
    /** 总分片数量 */
    totalSlices: number;
    /** 总铸造数量 */
    totalMints: number;
    /** 总体统计 */
    summary: {
        totalParentFee: number;
        totalChildFees: number;
        totalNetworkFees: number;
        totalRequiredFunding: number;
        estimatedTimeMinutes: number;
        cpfpPremium: number;
    };
}
/**
 * 并行费率配置
 */
export interface ParallelFeeRateConfig {
    /** 标准费率 (sat/vB) */
    standardFeeRate: number;
    /** CPFP加速费率 (sat/vB) - 用于第一批 */
    cpfpFeeRate: number;
    /** CPFP费率倍数 (默认3倍标准费率) */
    cpfpMultiplier?: number;
}
/**
 * 计算并行费用需求
 *
 * 基于现有的performDryRunFeeCalculation，扩展支持多分片计算
 */
export declare function calculateParallelFees({ walletSystem, contractId, totalMints, feeRateConfig, provider }: {
    walletSystem: MultiRelayWalletSystem;
    contractId: AlkaneContractId;
    totalMints: number;
    feeRateConfig: ParallelFeeRateConfig;
    provider: Provider;
}): Promise<ParallelFeeCalculation>;
/**
 * 生成推荐的并行费率配置
 */
export declare function generateRecommendedParallelFeeRates(baseFeeRate: number, cpfpMultiplier?: number): ParallelFeeRateConfig;
/**
 * 基于网络状况的动态费率配置
 */
export declare function generateDynamicParallelFeeRates(provider: Provider, urgencyLevel?: 'low' | 'medium' | 'high'): Promise<ParallelFeeRateConfig>;
/**
 * 比较并行费用与传统串行费用
 */
export declare function compareParallelVsSerialFees(parallelFees: ParallelFeeCalculation, serialFeeRate: number): {
    serialEstimate: {
        totalFees: number;
        totalExecutions: number;
        estimatedTimeMinutes: number;
    };
    parallelAdvantage: {
        feeSaving: number;
        timeSaving: number;
        feeEfficiency: number;
        timeEfficiency: number;
    };
};
/**
 * 格式化并行费用计算结果
 */
export declare function formatParallelFeeCalculation(result: ParallelFeeCalculation): string;
