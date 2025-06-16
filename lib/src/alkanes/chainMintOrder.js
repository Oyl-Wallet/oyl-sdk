"use strict";
/**
 * Chain-Mint 订单管理系统
 *
 * 支持 Project Snowball (≤25 tokens) 和 Project Supercluster (>25 tokens) 订单管理
 * 实现简洁的订单状态记录和断点续传功能
 * 解决中断时资金锁在中继钱包的问题
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChainMintOrderManager = exports.SliceStatus = exports.OrderExecutionMode = exports.OrderStatus = void 0;
const tslib_1 = require("tslib");
const fs = tslib_1.__importStar(require("fs"));
const path = tslib_1.__importStar(require("path"));
// ============================================================================
// 数据结构定义
// ============================================================================
/**
 * 订单状态枚举（简单状态机）
 */
var OrderStatus;
(function (OrderStatus) {
    OrderStatus["EXECUTING"] = "executing";
    OrderStatus["INTERRUPTED"] = "interrupted";
    OrderStatus["COMPLETED"] = "completed";
    OrderStatus["RECOVERY_FAILED"] = "recovery_failed";
    OrderStatus["PARALLEL_EXECUTING"] = "parallel_executing";
    OrderStatus["PARTIAL_COMPLETED"] = "partial_completed"; // 部分完成 (一些分片完成，一些失败)
})(OrderStatus = exports.OrderStatus || (exports.OrderStatus = {}));
/**
 * 订单执行模式
 */
var OrderExecutionMode;
(function (OrderExecutionMode) {
    OrderExecutionMode["SNOWBALL"] = "snowball";
    OrderExecutionMode["SUPERCLUSTER"] = "supercluster"; // Project Supercluster (>25 tokens, 并行)
})(OrderExecutionMode = exports.OrderExecutionMode || (exports.OrderExecutionMode = {}));
/**
 * 分片状态
 */
var SliceStatus;
(function (SliceStatus) {
    SliceStatus["PENDING"] = "pending";
    SliceStatus["EXECUTING"] = "executing";
    SliceStatus["COMPLETED"] = "completed";
    SliceStatus["FAILED"] = "failed"; // 失败
})(SliceStatus = exports.SliceStatus || (exports.SliceStatus = {}));
// ============================================================================
// 订单管理器
// ============================================================================
class ChainMintOrderManager {
    ordersDir;
    activeOrdersFile;
    constructor(ordersDir) {
        this.ordersDir = ordersDir || path.join(process.cwd(), 'chain-mint-orders');
        this.activeOrdersFile = path.join(this.ordersDir, 'active_orders.json');
        // 确保目录存在
        this.ensureDirectoryExists();
    }
    /**
     * 创建新订单 (支持Snowball和Supercluster模式)
     */
    async createOrder(config) {
        const orderId = this.generateOrderId();
        const now = Date.now();
        // 自动检测执行模式 (如果未明确指定)
        const detectedMode = config.executionMode ||
            ((config.totalMints || config.childCount || 25) > 25 ?
                OrderExecutionMode.SUPERCLUSTER :
                OrderExecutionMode.SNOWBALL);
        // 验证模式与参数匹配
        if (detectedMode === OrderExecutionMode.SNOWBALL) {
            if (!config.relayWalletIndex && config.relayWalletIndex !== 0) {
                throw new Error('Snowball模式需要relayWalletIndex参数');
            }
            if (!config.relayAddress) {
                throw new Error('Snowball模式需要relayAddress参数');
            }
        }
        if (detectedMode === OrderExecutionMode.SUPERCLUSTER) {
            if (!config.parallelConfig) {
                throw new Error('Supercluster模式需要parallelConfig参数');
            }
            if (!config.totalMints || config.totalMints <= 25) {
                throw new Error('Supercluster模式需要totalMints > 25');
            }
        }
        const order = {
            id: orderId,
            contractId: config.contractId,
            finalReceiverAddress: config.finalReceiverAddress,
            network: config.network,
            executionMode: detectedMode,
            relayWalletIndex: config.relayWalletIndex || 0,
            relayAddress: config.relayAddress || '',
            status: detectedMode === OrderExecutionMode.SUPERCLUSTER ?
                OrderStatus.PARALLEL_EXECUTING : OrderStatus.EXECUTING,
            executionParams: {
                feeRate: config.feeRate,
                childCount: config.childCount || 25,
                totalMints: config.totalMints,
                broadcastConfig: config.broadcastConfig,
                verificationConfig: config.verificationConfig,
                parallelConfig: config.parallelConfig
            },
            progress: {
                completedChildTxs: 0,
                // Supercluster 模式初始化
                ...(detectedMode === OrderExecutionMode.SUPERCLUSTER && {
                    totalSlices: Math.ceil((config.totalMints || 25) / 25),
                    completedSlices: 0,
                    slices: []
                })
            },
            createdAt: now,
            lastUpdatedAt: now
        };
        // 保存订单文件
        await this.saveOrder(order);
        // 更新活跃订单列表
        await this.addToActiveOrders(order);
        console.log(`📝 订单创建: ${orderId}`);
        console.log(`   执行模式: ${detectedMode === OrderExecutionMode.SUPERCLUSTER ? 'Project Supercluster' : 'Project Snowball'}`);
        if (detectedMode === OrderExecutionMode.SNOWBALL) {
            console.log(`   中继地址: ${config.relayAddress}`);
            console.log(`   子交易数: ${config.childCount || 25}`);
        }
        else {
            console.log(`   总铸造量: ${config.totalMints} tokens`);
            console.log(`   分片数量: ${Math.ceil((config.totalMints || 25) / 25)}`);
            console.log(`   并行度: ${config.parallelConfig?.maxConcurrentSlices || 6}`);
        }
        console.log(`   如中断可恢复: oyl alkane chain-mint-resume --order-id ${orderId}`);
        return order;
    }
    /**
     * 更新订单进度 (支持两种模式)
     */
    async updateOrderProgress(orderId, progressUpdate) {
        const order = await this.loadOrder(orderId);
        if (!order) {
            throw new Error(`订单不存在: ${orderId}`);
        }
        // 更新进度
        Object.assign(order.progress, progressUpdate);
        order.lastUpdatedAt = Date.now();
        await this.saveOrder(order);
    }
    /**
     * 初始化并行订单的分片状态 (Project Supercluster)
     */
    async initializeParallelSlices(orderId, slicesInfo) {
        const order = await this.loadOrder(orderId);
        if (!order) {
            throw new Error(`订单不存在: ${orderId}`);
        }
        if (order.executionMode !== OrderExecutionMode.SUPERCLUSTER) {
            throw new Error(`只有Supercluster模式的订单才能初始化分片状态`);
        }
        // 初始化分片进度
        const slices = slicesInfo.map(info => ({
            sliceIndex: info.sliceIndex,
            status: SliceStatus.PENDING,
            relayAddress: info.relayAddress,
            parentVoutIndex: info.parentVoutIndex,
            mintCount: info.mintCount,
            completedChildTxs: 0
        }));
        order.progress.slices = slices;
        order.progress.totalSlices = slices.length;
        order.progress.completedSlices = 0;
        order.lastUpdatedAt = Date.now();
        await this.saveOrder(order);
        console.log(`📋 分片状态已初始化: ${slices.length} 个分片`);
    }
    /**
     * 更新分片进度 (Project Supercluster)
     */
    async updateSliceProgress(orderId, sliceIndex, update) {
        const order = await this.loadOrder(orderId);
        if (!order) {
            throw new Error(`订单不存在: ${orderId}`);
        }
        if (order.executionMode !== OrderExecutionMode.SUPERCLUSTER) {
            throw new Error(`只有Supercluster模式的订单才能更新分片进度`);
        }
        if (!order.progress.slices) {
            throw new Error(`订单分片状态未初始化`);
        }
        const sliceProgress = order.progress.slices.find(s => s.sliceIndex === sliceIndex);
        if (!sliceProgress) {
            throw new Error(`分片 ${sliceIndex} 不存在`);
        }
        // 更新分片状态
        Object.assign(sliceProgress, update);
        // 更新整体进度统计
        const completedSlicesCount = order.progress.slices.filter(s => s.status === SliceStatus.COMPLETED).length;
        order.progress.completedSlices = completedSlicesCount;
        // 检查是否所有分片都完成
        if (completedSlicesCount === order.progress.totalSlices) {
            order.status = OrderStatus.COMPLETED;
        }
        else {
            // 检查是否有失败的分片
            const failedSlicesCount = order.progress.slices.filter(s => s.status === SliceStatus.FAILED).length;
            if (failedSlicesCount > 0 && completedSlicesCount + failedSlicesCount === order.progress.totalSlices) {
                order.status = OrderStatus.PARTIAL_COMPLETED;
            }
        }
        order.lastUpdatedAt = Date.now();
        await this.saveOrder(order);
        await this.updateActiveOrderStatus(orderId, order.status);
    }
    /**
     * 标记订单为中断状态
     */
    async markOrderAsInterrupted(orderId, reason, relayBalance) {
        const order = await this.loadOrder(orderId);
        if (!order) {
            throw new Error(`订单不存在: ${orderId}`);
        }
        order.status = OrderStatus.INTERRUPTED;
        order.lastUpdatedAt = Date.now();
        order.interruptInfo = {
            reason,
            relayBalance
        };
        await this.saveOrder(order);
        await this.updateActiveOrderStatus(orderId, OrderStatus.INTERRUPTED);
        console.log(`⏸️  订单中断: ${orderId} - ${reason}`);
    }
    /**
     * 标记订单为完成状态
     */
    async markOrderAsCompleted(orderId) {
        const order = await this.loadOrder(orderId);
        if (!order) {
            throw new Error(`订单不存在: ${orderId}`);
        }
        order.status = OrderStatus.COMPLETED;
        order.lastUpdatedAt = Date.now();
        await this.saveOrder(order);
        await this.updateActiveOrderStatus(orderId, OrderStatus.COMPLETED);
        console.log(`✅ 订单完成: ${orderId}`);
    }
    /**
     * 记录恢复尝试
     */
    async recordRecoveryAttempt(orderId) {
        const order = await this.loadOrder(orderId);
        if (!order) {
            throw new Error(`订单不存在: ${orderId}`);
        }
        if (!order.recoveryInfo) {
            order.recoveryInfo = {
                attempts: 0,
                lastAttemptAt: Date.now(),
                maxRetries: 3
            };
        }
        order.recoveryInfo.attempts += 1;
        order.recoveryInfo.lastAttemptAt = Date.now();
        order.lastUpdatedAt = Date.now();
        await this.saveOrder(order);
    }
    /**
     * 标记订单为恢复失败状态
     */
    async markOrderAsRecoveryFailed(orderId, reason) {
        const order = await this.loadOrder(orderId);
        if (!order) {
            throw new Error(`订单不存在: ${orderId}`);
        }
        order.status = OrderStatus.RECOVERY_FAILED;
        order.lastUpdatedAt = Date.now();
        if (!order.recoveryInfo) {
            order.recoveryInfo = {
                attempts: 0,
                lastAttemptAt: Date.now(),
                maxRetries: 3
            };
        }
        order.recoveryInfo.lastFailureReason = reason;
        await this.saveOrder(order);
        await this.updateActiveOrderStatus(orderId, OrderStatus.RECOVERY_FAILED);
        console.log(`💥 订单恢复失败: ${orderId} - ${reason}`);
    }
    /**
     * 重置订单为中断状态（用于强制重试）
     */
    async resetOrderToInterrupted(orderId) {
        const order = await this.loadOrder(orderId);
        if (!order) {
            throw new Error(`订单不存在: ${orderId}`);
        }
        order.status = OrderStatus.INTERRUPTED;
        order.lastUpdatedAt = Date.now();
        // 清除恢复信息，允许重新开始
        order.recoveryInfo = undefined;
        await this.saveOrder(order);
        await this.updateActiveOrderStatus(orderId, OrderStatus.INTERRUPTED);
        console.log(`🔄 订单重置为中断状态: ${orderId}`);
    }
    /**
     * 加载订单
     */
    async loadOrder(orderId) {
        const orderFile = path.join(this.ordersDir, `${orderId}.json`);
        if (!fs.existsSync(orderFile)) {
            return null;
        }
        try {
            const content = fs.readFileSync(orderFile, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            console.error(`加载订单失败: ${orderId}`, error);
            return null;
        }
    }
    /**
     * 获取所有中断的订单 (包括并行订单)
     */
    async getInterruptedOrders() {
        const activeOrders = await this.loadActiveOrders();
        const interruptedOrders = [];
        for (const orderInfo of activeOrders.orders) {
            if (orderInfo.status === OrderStatus.INTERRUPTED ||
                orderInfo.status === OrderStatus.PARTIAL_COMPLETED) {
                const order = await this.loadOrder(orderInfo.id);
                if (order) {
                    interruptedOrders.push(order);
                }
            }
        }
        return interruptedOrders;
    }
    /**
     * 获取可恢复的分片列表 (Project Supercluster)
     */
    async getRecoverableSlices(orderId) {
        const order = await this.loadOrder(orderId);
        if (!order) {
            throw new Error(`订单不存在: ${orderId}`);
        }
        if (order.executionMode !== OrderExecutionMode.SUPERCLUSTER) {
            throw new Error(`只有Supercluster模式的订单才有分片信息`);
        }
        if (!order.progress.slices) {
            return [];
        }
        // 返回未完成的分片（包括失败的和待执行的）
        return order.progress.slices.filter(slice => slice.status === SliceStatus.PENDING ||
            slice.status === SliceStatus.FAILED ||
            slice.status === SliceStatus.EXECUTING);
    }
    /**
     * 重置失败的分片状态为待执行
     */
    async resetFailedSlices(orderId, sliceIndices) {
        const order = await this.loadOrder(orderId);
        if (!order) {
            throw new Error(`订单不存在: ${orderId}`);
        }
        if (order.executionMode !== OrderExecutionMode.SUPERCLUSTER) {
            throw new Error(`只有Supercluster模式的订单才能重置分片状态`);
        }
        if (!order.progress.slices) {
            throw new Error(`订单分片状态未初始化`);
        }
        let resetCount = 0;
        for (const slice of order.progress.slices) {
            if (slice.status === SliceStatus.FAILED || slice.status === SliceStatus.EXECUTING) {
                // 如果指定了特定分片，只重置这些分片
                if (!sliceIndices || sliceIndices.includes(slice.sliceIndex)) {
                    slice.status = SliceStatus.PENDING;
                    slice.error = undefined;
                    slice.endTime = undefined;
                    resetCount++;
                }
            }
        }
        // 如果有分片被重置，更新订单状态
        if (resetCount > 0) {
            order.status = OrderStatus.PARALLEL_EXECUTING;
            order.lastUpdatedAt = Date.now();
            await this.saveOrder(order);
            await this.updateActiveOrderStatus(orderId, order.status);
            console.log(`🔄 已重置 ${resetCount} 个失败分片状态`);
        }
    }
    /**
     * 获取订单状态概览 (支持并行订单)
     */
    async getOrdersOverview() {
        const activeOrders = await this.loadActiveOrders();
        const orders = [];
        let executing = 0, parallelExecuting = 0, interrupted = 0, partialCompleted = 0, completed = 0, recoveryFailed = 0;
        for (const orderInfo of activeOrders.orders) {
            const order = await this.loadOrder(orderInfo.id);
            if (order) {
                orders.push(order);
                switch (order.status) {
                    case OrderStatus.EXECUTING:
                        executing++;
                        break;
                    case OrderStatus.PARALLEL_EXECUTING:
                        parallelExecuting++;
                        break;
                    case OrderStatus.INTERRUPTED:
                        interrupted++;
                        break;
                    case OrderStatus.PARTIAL_COMPLETED:
                        partialCompleted++;
                        break;
                    case OrderStatus.COMPLETED:
                        completed++;
                        break;
                    case OrderStatus.RECOVERY_FAILED:
                        recoveryFailed++;
                        break;
                }
            }
        }
        return {
            total: orders.length,
            executing,
            parallelExecuting,
            interrupted,
            partialCompleted,
            completed,
            recoveryFailed,
            orders: orders.sort((a, b) => b.createdAt - a.createdAt) // 最新的在前
        };
    }
    // ============================================================================
    // 私有方法
    // ============================================================================
    ensureDirectoryExists() {
        if (!fs.existsSync(this.ordersDir)) {
            fs.mkdirSync(this.ordersDir, { recursive: true });
        }
    }
    generateOrderId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `order_${timestamp}_${random}`;
    }
    async saveOrder(order) {
        const orderFile = path.join(this.ordersDir, `${order.id}.json`);
        fs.writeFileSync(orderFile, JSON.stringify(order, null, 2));
    }
    async loadActiveOrders() {
        if (!fs.existsSync(this.activeOrdersFile)) {
            return {
                orders: [],
                lastUpdated: Date.now()
            };
        }
        try {
            const content = fs.readFileSync(this.activeOrdersFile, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            console.error('加载活跃订单列表失败', error);
            return {
                orders: [],
                lastUpdated: Date.now()
            };
        }
    }
    async saveActiveOrders(activeOrders) {
        fs.writeFileSync(this.activeOrdersFile, JSON.stringify(activeOrders, null, 2));
    }
    async addToActiveOrders(order) {
        const activeOrders = await this.loadActiveOrders();
        activeOrders.orders.push({
            id: order.id,
            status: order.status,
            executionMode: order.executionMode,
            createdAt: order.createdAt,
            contractId: order.contractId,
            network: order.network,
            totalMints: order.executionParams.totalMints
        });
        activeOrders.lastUpdated = Date.now();
        await this.saveActiveOrders(activeOrders);
    }
    async updateActiveOrderStatus(orderId, status) {
        const activeOrders = await this.loadActiveOrders();
        const orderIndex = activeOrders.orders.findIndex(o => o.id === orderId);
        if (orderIndex !== -1) {
            activeOrders.orders[orderIndex].status = status;
            activeOrders.lastUpdated = Date.now();
            await this.saveActiveOrders(activeOrders);
        }
    }
}
exports.ChainMintOrderManager = ChainMintOrderManager;
//# sourceMappingURL=chainMintOrder.js.map