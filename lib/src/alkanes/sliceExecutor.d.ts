/**
 * Project Supercluster - 分片执行器
 *
 * 基于现有executeChildTransactionChainWithTracking的扩展，实现单个分片的完整执行
 * 100% 复用现有的子交易链构建和广播逻辑
 */
import { Provider } from '../provider/provider';
import { AlkaneContractId, BuiltTransaction } from './chainMinting';
import { MultiRelayWalletSystem, RelayWalletInfo } from './multiRelayWalletManager';
import { SliceFeeCalculation } from './parallelFeeCalculator';
/**
 * 单个分片执行配置
 */
export interface SliceExecutionConfig {
    /** 分片索引 */
    sliceIndex: number;
    /** 复合父交易ID */
    compositeParentTxId: string;
    /** 该分片在父交易中的vout索引 */
    parentVoutIndex: number;
    /** 该分片的中继钱包信息 */
    relayWallet: RelayWalletInfo;
    /** 主钱包（用于构建钱包组合） */
    mainWallet: MultiRelayWalletSystem['mainWallet'];
    /** 合约标识 */
    contractId: AlkaneContractId;
    /** 分片费用计算 */
    feeCalculation: SliceFeeCalculation;
    /** 最终接收地址 */
    finalReceiverAddress: string;
    /** 网络提供者 */
    provider: Provider;
    /** 广播配置 */
    broadcastConfig: any;
}
/**
 * 分片执行结果
 */
export interface SliceExecutionResult {
    /** 分片索引 */
    sliceIndex: number;
    /** 执行是否成功 */
    success: boolean;
    /** 开始时间 */
    startTime: number;
    /** 结束时间 */
    endTime: number;
    /** 执行时长 (毫秒) */
    duration: number;
    /** 完成的子交易列表 */
    childTransactions: BuiltTransaction[];
    /** 铸造的token数量 */
    mintedTokens: number;
    /** 最终输出金额 */
    finalOutputAmount: number;
    /** 错误信息 */
    error?: {
        phase: 'preparation' | 'execution' | 'completion';
        message: string;
        details?: any;
    };
}
/**
 * 分片进度回调函数
 */
export type SliceProgressCallback = (progress: {
    sliceIndex: number;
    currentStep: number;
    totalSteps: number;
    currentTxId?: string;
    message: string;
}) => void;
/**
 * 执行单个分片的完整子交易链
 *
 * 100% 复用executeChildTransactionChainWithTracking的核心逻辑
 * 扩展支持复合父交易的多输出结构
 */
export declare function executeSlice(config: SliceExecutionConfig, onProgress?: SliceProgressCallback): Promise<SliceExecutionResult>;
/**
 * 验证分片执行配置
 */
export declare function validateSliceExecutionConfig(config: SliceExecutionConfig): {
    isValid: boolean;
    errors: string[];
};
/**
 * 分析分片执行结果
 */
export declare function analyzeSliceExecutionResult(result: SliceExecutionResult): {
    efficiency: {
        successRate: number;
        timePerToken: number;
        avgTransactionTime: number;
    };
    performance: {
        totalDuration: number;
        transactionCount: number;
        effectiveTokens: number;
        feeEfficiency: number;
    };
    summary: string;
};
/**
 * 格式化分片执行结果
 */
export declare function formatSliceExecutionResult(result: SliceExecutionResult): string;
