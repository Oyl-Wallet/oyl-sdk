/**
 * Chain-Mint 订单管理系统
 *
 * 支持 Project Snowball (≤25 tokens) 和 Project Supercluster (>25 tokens) 订单管理
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
    RECOVERY_FAILED = "recovery_failed",
    PARALLEL_EXECUTING = "parallel_executing",
    PARTIAL_COMPLETED = "partial_completed"
}
/**
 * 订单执行模式
 */
export declare enum OrderExecutionMode {
    SNOWBALL = "snowball",
    SUPERCLUSTER = "supercluster"
}
/**
 * 分片状态
 */
export declare enum SliceStatus {
    PENDING = "pending",
    EXECUTING = "executing",
    COMPLETED = "completed",
    FAILED = "failed"
}
/**
 * 分片进度信息 (Project Supercluster)
 */
export interface SliceProgress {
    sliceIndex: number;
    status: SliceStatus;
    relayAddress: string;
    parentVoutIndex: number;
    mintCount: number;
    completedChildTxs: number;
    lastTxId?: string;
    lastOutputAmount?: number;
    startTime?: number;
    endTime?: number;
    error?: {
        phase: 'preparation' | 'execution' | 'completion';
        message: string;
        details?: any;
    };
}
/**
 * Chain-Mint 订单
 */
export interface ChainMintOrder {
    id: string;
    contractId: AlkaneContractId;
    finalReceiverAddress: string;
    network: 'bitcoin' | 'testnet' | 'regtest';
    executionMode: OrderExecutionMode;
    relayWalletIndex: number;
    relayAddress: string;
    status: OrderStatus;
    executionParams: {
        feeRate: number;
        childCount: number;
        totalMints?: number;
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
        parallelConfig?: {
            cpfpMultiplier: number;
            maxConcurrentSlices: number;
            enableParallelExecution: boolean;
            cpfpConfirmationTimeout: number;
        };
    };
    progress: {
        parentTxId?: string;
        completedChildTxs: number;
        lastTxId?: string;
        lastOutputAmount?: number;
        compositeParentTxId?: string;
        totalSlices?: number;
        completedSlices?: number;
        slices?: SliceProgress[];
    };
    createdAt: number;
    lastUpdatedAt: number;
    interruptInfo?: {
        reason: string;
        relayBalance?: number;
        failedSlices?: number[];
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
        executionMode: OrderExecutionMode;
        createdAt: number;
        contractId: AlkaneContractId;
        network: string;
        totalMints?: number;
    }[];
    lastUpdated: number;
}
export declare class ChainMintOrderManager {
    private ordersDir;
    private activeOrdersFile;
    constructor(ordersDir?: string);
    /**
     * 创建新订单 (支持Snowball和Supercluster模式)
     */
    createOrder(config: {
        contractId: AlkaneContractId;
        finalReceiverAddress: string;
        network: 'bitcoin' | 'testnet' | 'regtest';
        relayWalletIndex?: number;
        relayAddress?: string;
        feeRate: number;
        childCount?: number;
        totalMints?: number;
        executionMode?: OrderExecutionMode;
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
        parallelConfig?: {
            cpfpMultiplier: number;
            maxConcurrentSlices: number;
            enableParallelExecution: boolean;
            cpfpConfirmationTimeout: number;
        };
    }): Promise<ChainMintOrder>;
    /**
     * 更新订单进度 (支持两种模式)
     */
    updateOrderProgress(orderId: string, progressUpdate: Partial<ChainMintOrder['progress']>): Promise<void>;
    /**
     * 初始化并行订单的分片状态 (Project Supercluster)
     */
    initializeParallelSlices(orderId: string, slicesInfo: {
        sliceIndex: number;
        relayAddress: string;
        parentVoutIndex: number;
        mintCount: number;
    }[]): Promise<void>;
    /**
     * 更新分片进度 (Project Supercluster)
     */
    updateSliceProgress(orderId: string, sliceIndex: number, update: {
        status?: SliceStatus;
        completedChildTxs?: number;
        lastTxId?: string;
        lastOutputAmount?: number;
        startTime?: number;
        endTime?: number;
        error?: SliceProgress['error'];
    }): Promise<void>;
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
     * 获取所有中断的订单 (包括并行订单)
     */
    getInterruptedOrders(): Promise<ChainMintOrder[]>;
    /**
     * 获取可恢复的分片列表 (Project Supercluster)
     */
    getRecoverableSlices(orderId: string): Promise<SliceProgress[]>;
    /**
     * 重置失败的分片状态为待执行
     */
    resetFailedSlices(orderId: string, sliceIndices?: number[]): Promise<void>;
    /**
     * 获取订单状态概览 (支持并行订单)
     */
    getOrdersOverview(): Promise<{
        total: number;
        executing: number;
        parallelExecuting: number;
        interrupted: number;
        partialCompleted: number;
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
