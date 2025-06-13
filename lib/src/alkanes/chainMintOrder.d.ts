/**
 * Chain-Mint 订单管理系统
 *
 * 实现简洁的订单状态记录和断点续传功能
 * 解决中断时资金锁在中继钱包的问题
 */
import { AlkaneContractId } from './chainMinting';
/**
 * 订单状态枚举（简单状态机）
 */
export declare enum OrderStatus {
    EXECUTING = "executing",
    INTERRUPTED = "interrupted",
    COMPLETED = "completed",
    RECOVERY_FAILED = "recovery_failed"
}
/**
 * Chain-Mint 订单
 */
export interface ChainMintOrder {
    id: string;
    contractId: AlkaneContractId;
    finalReceiverAddress: string;
    network: 'bitcoin' | 'testnet' | 'regtest';
    relayWalletIndex: number;
    relayAddress: string;
    status: OrderStatus;
    executionParams: {
        feeRate: number;
        childCount: number;
        broadcastConfig: {
            maxRetries: number;
            retryDelayMs: number;
            confirmationTimeoutMs: number;
            waitForAcceptance: boolean;
        };
        verificationConfig?: {
            enabled: boolean;
            pollInterval: number;
            maxWaitTime: number;
            verboseLogging: boolean;
            checkAssetBalance: boolean;
        };
    };
    progress: {
        parentTxId?: string;
        completedChildTxs: number;
        lastTxId?: string;
        lastOutputAmount?: number;
    };
    createdAt: number;
    lastUpdatedAt: number;
    interruptInfo?: {
        reason: string;
        relayBalance?: number;
    };
    recoveryInfo?: {
        attempts: number;
        lastAttemptAt: number;
        lastFailureReason?: string;
        maxRetries: number;
    };
}
/**
 * 活跃订单列表
 */
export interface ActiveOrdersList {
    orders: {
        id: string;
        status: OrderStatus;
        createdAt: number;
        contractId: AlkaneContractId;
        network: string;
    }[];
    lastUpdated: number;
}
export declare class ChainMintOrderManager {
    private ordersDir;
    private activeOrdersFile;
    constructor(ordersDir?: string);
    /**
     * 创建新订单
     */
    createOrder(config: {
        contractId: AlkaneContractId;
        finalReceiverAddress: string;
        network: 'bitcoin' | 'testnet' | 'regtest';
        relayWalletIndex: number;
        relayAddress: string;
        feeRate: number;
        childCount: number;
        broadcastConfig: {
            maxRetries: number;
            retryDelayMs: number;
            confirmationTimeoutMs: number;
            waitForAcceptance: boolean;
        };
        verificationConfig?: {
            enabled: boolean;
            pollInterval: number;
            maxWaitTime: number;
            verboseLogging: boolean;
            checkAssetBalance: boolean;
        };
    }): Promise<ChainMintOrder>;
    /**
     * 更新订单进度
     */
    updateOrderProgress(orderId: string, progressUpdate: Partial<ChainMintOrder['progress']>): Promise<void>;
    /**
     * 标记订单为中断状态
     */
    markOrderAsInterrupted(orderId: string, reason: string, relayBalance?: number): Promise<void>;
    /**
     * 标记订单为完成状态
     */
    markOrderAsCompleted(orderId: string): Promise<void>;
    /**
     * 记录恢复尝试
     */
    recordRecoveryAttempt(orderId: string): Promise<void>;
    /**
     * 标记订单为恢复失败状态
     */
    markOrderAsRecoveryFailed(orderId: string, reason: string): Promise<void>;
    /**
     * 重置订单为中断状态（用于强制重试）
     */
    resetOrderToInterrupted(orderId: string): Promise<void>;
    /**
     * 加载订单
     */
    loadOrder(orderId: string): Promise<ChainMintOrder | null>;
    /**
     * 获取所有中断的订单
     */
    getInterruptedOrders(): Promise<ChainMintOrder[]>;
    /**
     * 获取订单状态概览
     */
    getOrdersOverview(): Promise<{
        total: number;
        executing: number;
        interrupted: number;
        completed: number;
        recoveryFailed: number;
        orders: ChainMintOrder[];
    }>;
    private ensureDirectoryExists;
    private generateOrderId;
    private saveOrder;
    private loadActiveOrders;
    private saveActiveOrders;
    private addToActiveOrders;
    private updateActiveOrderStatus;
}
