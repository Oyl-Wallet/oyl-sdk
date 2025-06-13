/**
 * 链上验证和资产查询模块
 *
 * 实现Project Snowball链式铸造的完整验证系统：
 * - 交易确认状态监控
 * - 最终资产余额验证
 * - 链条执行状态查询
 * - 实时进度显示
 */
import { Provider } from '../provider/provider';
import { AlkaneContractId, BuiltTransaction } from './chainMinting';
/**
 * 单笔交易确认状态
 */
export interface TransactionStatus {
    /** 交易ID */
    txId: string;
    /** 交易索引 (0=父交易, 1-24=子交易) */
    index: number;
    /** 交易类型 */
    type: 'parent' | 'child';
    /** 是否已确认 */
    confirmed: boolean;
    /** 确认区块高度 */
    blockHeight?: number;
    /** 确认时间戳 */
    confirmationTime?: number;
    /** 是否在交易池中 */
    inMempool: boolean;
    /** 状态检查时间 */
    lastChecked: number;
    /** 错误信息 */
    error?: string;
}
/**
 * 链条整体执行状态
 */
export interface ChainExecutionStatus {
    /** 链条ID (父交易ID) */
    chainId: string;
    /** 合约ID */
    contractId: AlkaneContractId;
    /** 最终接收地址 */
    finalReceiverAddress: string;
    /** 开始时间 */
    startTime: number;
    /** 完成时间 */
    completionTime?: number;
    /** 总交易数 */
    totalTransactions: number;
    /** 已确认交易数 */
    confirmedTransactions: number;
    /** 失败交易数 */
    failedTransactions: number;
    /** 整体状态 */
    overallStatus: 'pending' | 'in_progress' | 'completed' | 'failed';
    /** 所有交易状态 */
    transactions: TransactionStatus[];
    /** 最终资产余额验证 */
    finalAssetBalance?: AssetBalanceVerification;
    /** 执行摘要 */
    executionSummary: ChainExecutionSummary;
}
/**
 * 资产余额验证结果
 */
export interface AssetBalanceVerification {
    /** 接收地址 */
    receiverAddress: string;
    /** 期望的alkane token数量 */
    expectedTokenCount: number;
    /** 实际的alkane token数量 */
    actualTokenCount: number;
    /** 验证是否通过 */
    verified: boolean;
    /** 详细的token信息 */
    tokenDetails: AlkaneTokenDetail[];
    /** 验证时间 */
    verificationTime: number;
    /** 错误信息 */
    error?: string;
}
/**
 * Alkane Token详细信息
 */
export interface AlkaneTokenDetail {
    /** Token ID */
    tokenId: string;
    /** Token名称 */
    name: string;
    /** Token符号 */
    symbol: string;
    /** 数量 */
    amount: number;
    /** 所在UTXO */
    utxo: {
        txId: string;
        outputIndex: number;
    };
}
/**
 * 链条执行摘要
 */
export interface ChainExecutionSummary {
    /** 执行耗时 (毫秒) */
    totalDuration: number;
    /** 平均交易确认时间 (毫秒) */
    averageConfirmationTime: number;
    /** 最慢交易确认时间 (毫秒) */
    slowestConfirmationTime: number;
    /** 成功率 */
    successRate: number;
    /** 费用总计 */
    totalFeesSpent: number;
    /** 最终输出价值 */
    finalOutputValue: number;
    /** 是否完全成功 */
    fullySuccessful: boolean;
}
/**
 * 验证配置
 */
export interface VerificationConfig {
    /** 轮询间隔 (毫秒) */
    pollInterval: number;
    /** 最大等待时间 (毫秒, 0=无限等待) */
    maxWaitTime: number;
    /** 是否启用详细日志 */
    verboseLogging: boolean;
    /** 是否检查资产余额 */
    checkAssetBalance: boolean;
    /** 进度回调函数 */
    onProgress?: (status: ChainExecutionStatus) => void;
    /** 完成回调函数 */
    onComplete?: (status: ChainExecutionStatus) => void;
}
export declare const DEFAULT_VERIFICATION_CONFIG: VerificationConfig;
/**
 * 链上验证管理器
 */
export declare class ChainVerificationManager {
    private provider;
    private config;
    private currentStatus?;
    private monitoringInterval?;
    constructor(provider: Provider, config?: Partial<VerificationConfig>);
    /**
     * 开始验证链条执行状态
     */
    startVerification({ parentTx, childTxs, contractId, finalReceiverAddress }: {
        parentTx: BuiltTransaction;
        childTxs: BuiltTransaction[];
        contractId: AlkaneContractId;
        finalReceiverAddress: string;
    }): Promise<ChainExecutionStatus>;
    /**
     * 停止验证监控
     */
    stopVerification(): void;
    /**
     * 获取当前状态
     */
    getCurrentStatus(): ChainExecutionStatus | undefined;
    /**
     * 开始监控循环
     */
    private startMonitoring;
    /**
     * 更新所有交易状态
     */
    private updateTransactionStatuses;
    /**
     * 检查单笔交易状态
     */
    private checkTransactionStatus;
    /**
     * 更新整体状态
     */
    private updateOverallStatus;
    /**
     * 更新执行摘要
     */
    private updateExecutionSummary;
    /**
     * 检查验证是否完成
     */
    private isVerificationComplete;
    /**
     * 完成验证流程
     */
    private completeVerification;
    /**
     * 验证最终资产余额
     */
    private verifyFinalAssetBalance;
    /**
     * 检查地址的alkane资产余额
     */
    private checkAssetBalance;
    /**
     * 输出最终摘要
     */
    private logFinalSummary;
    /**
     * 日志输出
     */
    private log;
}
/**
 * 快速验证链条执行状态
 */
export declare function verifyChainExecution({ parentTx, childTxs, contractId, finalReceiverAddress, provider, config }: {
    parentTx: BuiltTransaction;
    childTxs: BuiltTransaction[];
    contractId: AlkaneContractId;
    finalReceiverAddress: string;
    provider: Provider;
    config?: Partial<VerificationConfig>;
}): Promise<ChainExecutionStatus>;
/**
 * 格式化验证结果用于显示
 */
export declare function formatVerificationResult(status: ChainExecutionStatus): string;
