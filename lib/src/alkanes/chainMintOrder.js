"use strict";
/**
 * Chain-Mint 订单管理系统
 *
 * 实现简洁的订单状态记录和断点续传功能
 * 解决中断时资金锁在中继钱包的问题
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChainMintOrderManager = exports.OrderStatus = void 0;
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
    OrderStatus["RECOVERY_FAILED"] = "recovery_failed"; // 恢复失败
})(OrderStatus = exports.OrderStatus || (exports.OrderStatus = {}));
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
     * 创建新订单
     */
    async createOrder(config) {
        const orderId = this.generateOrderId();
        const now = Date.now();
        const order = {
            id: orderId,
            contractId: config.contractId,
            finalReceiverAddress: config.finalReceiverAddress,
            network: config.network,
            relayWalletIndex: config.relayWalletIndex,
            relayAddress: config.relayAddress,
            status: OrderStatus.EXECUTING,
            executionParams: {
                feeRate: config.feeRate,
                childCount: config.childCount,
                broadcastConfig: config.broadcastConfig,
                verificationConfig: config.verificationConfig
            },
            progress: {
                completedChildTxs: 0
            },
            createdAt: now,
            lastUpdatedAt: now
        };
        // 保存订单文件
        await this.saveOrder(order);
        // 更新活跃订单列表
        await this.addToActiveOrders(order);
        console.log(`📝 订单创建: ${orderId}`);
        console.log(`   中继地址: ${config.relayAddress}`);
        console.log(`   如中断可恢复: oyl alkane chain-mint-resume --order-id ${orderId}`);
        return order;
    }
    /**
     * 更新订单进度
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
     * 获取所有中断的订单
     */
    async getInterruptedOrders() {
        const activeOrders = await this.loadActiveOrders();
        const interruptedOrders = [];
        for (const orderInfo of activeOrders.orders) {
            if (orderInfo.status === OrderStatus.INTERRUPTED) {
                const order = await this.loadOrder(orderInfo.id);
                if (order) {
                    interruptedOrders.push(order);
                }
            }
        }
        return interruptedOrders;
    }
    /**
     * 获取订单状态概览
     */
    async getOrdersOverview() {
        const activeOrders = await this.loadActiveOrders();
        const orders = [];
        let executing = 0, interrupted = 0, completed = 0, recoveryFailed = 0;
        for (const orderInfo of activeOrders.orders) {
            const order = await this.loadOrder(orderInfo.id);
            if (order) {
                orders.push(order);
                switch (order.status) {
                    case OrderStatus.EXECUTING:
                        executing++;
                        break;
                    case OrderStatus.INTERRUPTED:
                        interrupted++;
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
            interrupted,
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
            createdAt: order.createdAt,
            contractId: order.contractId,
            network: order.network
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