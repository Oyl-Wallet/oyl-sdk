/**
 * Project Supercluster - 并行协调器
 *
 * 核心协调器，集成所有Phase 1组件实现完整的并行链式铸造流程
 * CPFP第一批 + 等待确认 + 并行执行
 */
import * as bitcoin from 'bitcoinjs-lib';
import { Provider } from '../provider/provider';
import { FormattedUtxo } from '../utxo/types';
import { AlkaneContractId, BuiltTransaction } from './chainMinting';
import { MultiRelayWalletSystem } from './multiRelayWalletManager';
import { ParallelFeeCalculation, ParallelFeeRateConfig } from './parallelFeeCalculator';
import { CompositeParentVoutLayout } from './compositeParentBuilder';
import { SliceExecutionResult } from './sliceExecutor';
/**
 * 并行铸造执行配置
 */
export interface ParallelMintingConfig {
    /** 合约标识 */
    contractId: AlkaneContractId;
    /** 总铸造数量 */
    totalMints: number;
    /** 最终接收地址 */
    finalReceiverAddress: string;
    /** 网络类型 */
    network: bitcoin.Network;
    /** 费率配置 */
    feeRateConfig?: ParallelFeeRateConfig;
    /** 费率紧急程度 (用于动态费率) */
    urgencyLevel?: 'low' | 'medium' | 'high';
    /** 主钱包UTXO */
    utxos: FormattedUtxo[];
    /** 网络提供者 */
    provider: Provider;
    /** 广播配置 */
    broadcastConfig?: any;
    /** 是否并行执行 (默认true) */
    enableParallelExecution?: boolean;
    /** 最大并发分片数 (默认6) */
    maxConcurrentSlices?: number;
    /** CPFP确认超时时间 (毫秒, 默认600000=10分钟) */
    cpfpConfirmationTimeout?: number;
}
/**
 * 并行铸造执行结果
 */
export interface ParallelMintingResult {
    /** 执行是否成功 */
    success: boolean;
    /** 开始时间 */
    startTime: number;
    /** 结束时间 */
    endTime: number;
    /** 总执行时长 */
    totalDuration: number;
    /** 钱包系统 */
    walletSystem: MultiRelayWalletSystem;
    /** 费用计算 */
    feeCalculation: ParallelFeeCalculation;
    /** 复合父交易 */
    compositeParentTx: {
        transaction: BuiltTransaction;
        voutLayout: CompositeParentVoutLayout;
    };
    /** 分片执行结果 */
    sliceResults: SliceExecutionResult[];
    /** 执行统计 */
    statistics: {
        totalSlices: number;
        successfulSlices: number;
        failedSlices: number;
        totalTransactions: number;
        totalTokensMinted: number;
        totalFeesPaid: number;
        averageSliceTime: number;
        parallelEfficiency: number;
    };
    /** 错误信息 */
    error?: {
        phase: 'preparation' | 'parent_tx' | 'cpfp_wait' | 'parallel_execution' | 'completion';
        message: string;
        details?: any;
    };
}
/**
 * 并行进度回调
 */
export type ParallelProgressCallback = (progress: {
    phase: 'preparation' | 'parent_tx' | 'cpfp_wait' | 'parallel_execution' | 'completion';
    overallProgress: number;
    message: string;
    sliceProgress?: {
        completedSlices: number;
        totalSlices: number;
        currentlyExecuting: number[];
    };
    sliceDetails?: {
        sliceIndex: number;
        currentStep: number;
        totalSteps: number;
        message: string;
    };
}) => void;
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
export declare function executeParallelChainMinting(config: ParallelMintingConfig, onProgress?: ParallelProgressCallback): Promise<ParallelMintingResult>;
/**
 * 格式化并行铸造结果
 */
export declare function formatParallelMintingResult(result: ParallelMintingResult): string;
/**
 * 验证并行铸造配置
 */
export declare function validateParallelMintingConfig(config: ParallelMintingConfig): {
    isValid: boolean;
    errors: string[];
};
