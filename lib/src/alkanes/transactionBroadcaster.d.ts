/**
 * 交易广播模块
 *
 * 实现带重试机制的顺序广播系统，确保链式交易按正确顺序提交
 * 支持父交易确认等待、子交易依次广播、完整的错误处理和状态跟踪
 */
import { Provider } from '../provider/provider';
import { BroadcastConfig, BroadcastResult, BatchBroadcastResult, BuiltTransaction } from './chainMinting';
import { IRpcClient } from '../rpclient/rpcFactory';
/**
 * 使用自定义RPC广播单个交易
 */
export declare function broadcastSingleTransactionWithRpc(psbtHex: string, expectedTxId: string, rpcClient?: IRpcClient, networkType?: string, config?: BroadcastConfig): Promise<BroadcastResult>;
/**
 * 广播单个交易（原函数，保持向后兼容）
 */
export declare function broadcastSingleTransaction(psbtHex: string, expectedTxId: string, provider: Provider, config?: BroadcastConfig): Promise<BroadcastResult>;
/**
 * 等待交易确认或节点接受
 */
export declare function waitForTransactionAcceptance(txId: string, provider: Provider, timeoutMs?: number): Promise<{
    accepted: boolean;
    confirmed: boolean;
    error?: string;
}>;
/**
 * 并行广播完整的交易链（不等待确认）
 *
 * 同时广播父交易和所有子交易，适用于链式铸造场景
 */
export declare function broadcastTransactionChainParallel({ parentTransaction, childTransactions, provider, config }: {
    parentTransaction: BuiltTransaction;
    childTransactions: BuiltTransaction[];
    provider: Provider;
    config?: BroadcastConfig;
}): Promise<BatchBroadcastResult>;
/**
 * 按顺序广播完整的交易链
 *
 * 首先广播父交易并等待确认，然后依次广播所有子交易
 */
export declare function broadcastTransactionChain({ parentTransaction, childTransactions, provider, config }: {
    parentTransaction: BuiltTransaction;
    childTransactions: BuiltTransaction[];
    provider: Provider;
    config?: BroadcastConfig;
}): Promise<BatchBroadcastResult>;
/**
 * 并行广播子交易（实验性功能）
 *
 * 在父交易确认后，并行广播多个子交易以提高速度
 * 注意：这可能导致依赖关系问题，仅在特定场景下使用
 */
export declare function broadcastChildTransactionsInParallel({ childTransactions, provider, config, batchSize }: {
    childTransactions: BuiltTransaction[];
    provider: Provider;
    config?: BroadcastConfig;
    batchSize?: number;
}): Promise<BroadcastResult[]>;
/**
 * 智能广播策略
 *
 * 根据网络状况和交易依赖关系自动选择最佳广播策略
 */
export declare function smartBroadcastTransactionChain({ parentTransaction, childTransactions, provider, config }: {
    parentTransaction: BuiltTransaction;
    childTransactions: BuiltTransaction[];
    provider: Provider;
    config?: BroadcastConfig;
}): Promise<BatchBroadcastResult>;
/**
 * 监控交易链的广播状态
 */
export declare function monitorTransactionChainStatus({ parentTxId, childTxIds, provider, pollIntervalMs, // 每10秒检查一次
maxMonitoringTimeMs }: {
    parentTxId: string;
    childTxIds: string[];
    provider: Provider;
    pollIntervalMs?: number;
    maxMonitoringTimeMs?: number;
}): Promise<{
    parentStatus: {
        confirmed: boolean;
        blockHeight?: number;
    };
    childStatuses: Array<{
        txId: string;
        confirmed: boolean;
        blockHeight?: number;
    }>;
    allConfirmed: boolean;
    monitoringTime: number;
}>;
/**
 * 格式化批量广播结果
 */
export declare function formatBatchBroadcastResult(result: BatchBroadcastResult): string;
/**
 * 生成广播摘要报告
 */
export declare function generateBroadcastSummary(result: BatchBroadcastResult): {
    summary: {
        totalTransactions: number;
        successfulTransactions: number;
        failedTransactions: number;
        successRate: number;
        parentSuccess: boolean;
        allChildrenSuccess: boolean;
    };
    details: {
        parentTx: {
            txId: string;
            success: boolean;
            retryCount: number;
            error?: string;
        };
        childTxs: Array<{
            txId: string;
            success: boolean;
            retryCount: number;
            error?: string;
        }>;
    };
    timestamp: number;
};
/**
 * 使用自定义RPC广播交易链
 */
export declare function broadcastTransactionChainWithRpc({ parentTransaction, childTransactions, rpcClient, networkType, config }: {
    parentTransaction: BuiltTransaction;
    childTransactions: BuiltTransaction[];
    rpcClient?: IRpcClient;
    networkType?: string;
    config?: BroadcastConfig;
}): Promise<BatchBroadcastResult>;
/**
 * 智能广播交易链 - 自动选择最佳RPC
 */
export declare function smartBroadcastTransactionChainWithRpc({ parentTransaction, childTransactions, networkType, config }: {
    parentTransaction: BuiltTransaction;
    childTransactions: BuiltTransaction[];
    networkType?: string;
    config?: BroadcastConfig;
}): Promise<BatchBroadcastResult>;
