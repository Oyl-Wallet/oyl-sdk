/**
 * Chain-Mint 订单管理系统
 * 
 * 实现简洁的订单状态记录和断点续传功能
 * 解决中断时资金锁在中继钱包的问题
 */

import * as fs from 'fs'
import * as path from 'path'
import { AlkaneContractId } from './chainMinting'

// ============================================================================
// 数据结构定义
// ============================================================================

/**
 * 订单状态枚举（简单状态机）
 */
export enum OrderStatus {
  EXECUTING = 'executing',       // 执行中
  INTERRUPTED = 'interrupted',   // 中断
  COMPLETED = 'completed',       // 完成
  RECOVERY_FAILED = 'recovery_failed'  // 恢复失败
}

/**
 * Chain-Mint 订单
 */
export interface ChainMintOrder {
  // 基本信息
  id: string
  contractId: AlkaneContractId
  finalReceiverAddress: string
  network: 'bitcoin' | 'testnet' | 'regtest'
  
  // 恢复关键信息
  relayWalletIndex: number        // 确保恢复时生成相同中继钱包
  relayAddress: string            // 中继钱包地址
  
  // 执行状态
  status: OrderStatus
  
  // 执行参数（恢复时必需）
  executionParams: {
    feeRate: number              // 执行时使用的费率 (sat/vB)
    childCount: number           // 子交易数量
    broadcastConfig: {           // 广播配置
      maxRetries: number
      retryDelayMs: number
      confirmationTimeoutMs: number
      waitForAcceptance: boolean
    }
    verificationConfig?: {       // 验证配置（可选）
      enabled: boolean
      pollInterval: number
      maxWaitTime: number
      verboseLogging: boolean
      checkAssetBalance: boolean
    }
  }
  
  // 进度信息（断点续传核心）
  progress: {
    parentTxId?: string           // 父交易ID
    completedChildTxs: number     // 已完成子交易数量 (0-24)
    lastTxId?: string             // 最后成功的交易ID
    lastOutputAmount?: number     // 最后的输出金额（用于链接下一笔）
  }
  
  // 时间戳
  createdAt: number
  lastUpdatedAt: number
  
  // 中断时的诊断信息
  interruptInfo?: {
    reason: string
    relayBalance?: number
  }
  
  // 恢复重试信息
  recoveryInfo?: {
    attempts: number              // 恢复尝试次数
    lastAttemptAt: number        // 最后尝试时间
    lastFailureReason?: string   // 最后失败原因
    maxRetries: number           // 最大重试次数
  }
}

/**
 * 活跃订单列表
 */
export interface ActiveOrdersList {
  orders: {
    id: string
    status: OrderStatus
    createdAt: number
    contractId: AlkaneContractId
    network: string
  }[]
  lastUpdated: number
}

// ============================================================================
// 订单管理器
// ============================================================================

export class ChainMintOrderManager {
  private ordersDir: string
  private activeOrdersFile: string

  constructor(ordersDir?: string) {
    this.ordersDir = ordersDir || path.join(process.cwd(), 'chain-mint-orders')
    this.activeOrdersFile = path.join(this.ordersDir, 'active_orders.json')
    
    // 确保目录存在
    this.ensureDirectoryExists()
  }

  /**
   * 创建新订单
   */
  async createOrder(config: {
    contractId: AlkaneContractId
    finalReceiverAddress: string
    network: 'bitcoin' | 'testnet' | 'regtest'
    relayWalletIndex: number
    relayAddress: string
    feeRate: number
    childCount: number
    broadcastConfig: {
      maxRetries: number
      retryDelayMs: number
      confirmationTimeoutMs: number
      waitForAcceptance: boolean
    }
    verificationConfig?: {
      enabled: boolean
      pollInterval: number
      maxWaitTime: number
      verboseLogging: boolean
      checkAssetBalance: boolean
    }
  }): Promise<ChainMintOrder> {
    
    const orderId = this.generateOrderId()
    const now = Date.now()
    
    const order: ChainMintOrder = {
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
    }
    
    // 保存订单文件
    await this.saveOrder(order)
    
    // 更新活跃订单列表
    await this.addToActiveOrders(order)
    
    console.log(`📝 订单创建: ${orderId}`)
    console.log(`   中继地址: ${config.relayAddress}`)
    console.log(`   如中断可恢复: oyl alkane chain-mint-resume --order-id ${orderId}`)
    
    return order
  }

  /**
   * 更新订单进度
   */
  async updateOrderProgress(orderId: string, progressUpdate: Partial<ChainMintOrder['progress']>): Promise<void> {
    const order = await this.loadOrder(orderId)
    if (!order) {
      throw new Error(`订单不存在: ${orderId}`)
    }
    
    // 更新进度
    Object.assign(order.progress, progressUpdate)
    order.lastUpdatedAt = Date.now()
    
    await this.saveOrder(order)
  }

  /**
   * 标记订单为中断状态
   */
  async markOrderAsInterrupted(orderId: string, reason: string, relayBalance?: number): Promise<void> {
    const order = await this.loadOrder(orderId)
    if (!order) {
      throw new Error(`订单不存在: ${orderId}`)
    }
    
    order.status = OrderStatus.INTERRUPTED
    order.lastUpdatedAt = Date.now()
    order.interruptInfo = {
      reason,
      relayBalance
    }
    
    await this.saveOrder(order)
    await this.updateActiveOrderStatus(orderId, OrderStatus.INTERRUPTED)
    
    console.log(`⏸️  订单中断: ${orderId} - ${reason}`)
  }

  /**
   * 标记订单为完成状态
   */
  async markOrderAsCompleted(orderId: string): Promise<void> {
    const order = await this.loadOrder(orderId)
    if (!order) {
      throw new Error(`订单不存在: ${orderId}`)
    }
    
    order.status = OrderStatus.COMPLETED
    order.lastUpdatedAt = Date.now()
    
    await this.saveOrder(order)
    await this.updateActiveOrderStatus(orderId, OrderStatus.COMPLETED)
    
    console.log(`✅ 订单完成: ${orderId}`)
  }

  /**
   * 记录恢复尝试
   */
  async recordRecoveryAttempt(orderId: string): Promise<void> {
    const order = await this.loadOrder(orderId)
    if (!order) {
      throw new Error(`订单不存在: ${orderId}`)
    }

    if (!order.recoveryInfo) {
      order.recoveryInfo = {
        attempts: 0,
        lastAttemptAt: Date.now(),
        maxRetries: 3
      }
    }

    order.recoveryInfo.attempts += 1
    order.recoveryInfo.lastAttemptAt = Date.now()
    order.lastUpdatedAt = Date.now()

    await this.saveOrder(order)
  }

  /**
   * 标记订单为恢复失败状态
   */
  async markOrderAsRecoveryFailed(orderId: string, reason: string): Promise<void> {
    const order = await this.loadOrder(orderId)
    if (!order) {
      throw new Error(`订单不存在: ${orderId}`)
    }

    order.status = OrderStatus.RECOVERY_FAILED
    order.lastUpdatedAt = Date.now()
    
    if (!order.recoveryInfo) {
      order.recoveryInfo = {
        attempts: 0,
        lastAttemptAt: Date.now(),
        maxRetries: 3
      }
    }
    
    order.recoveryInfo.lastFailureReason = reason

    await this.saveOrder(order)
    await this.updateActiveOrderStatus(orderId, OrderStatus.RECOVERY_FAILED)
    
    console.log(`💥 订单恢复失败: ${orderId} - ${reason}`)
  }

  /**
   * 重置订单为中断状态（用于强制重试）
   */
  async resetOrderToInterrupted(orderId: string): Promise<void> {
    const order = await this.loadOrder(orderId)
    if (!order) {
      throw new Error(`订单不存在: ${orderId}`)
    }

    order.status = OrderStatus.INTERRUPTED
    order.lastUpdatedAt = Date.now()
    
    // 清除恢复信息，允许重新开始
    order.recoveryInfo = undefined

    await this.saveOrder(order)
    await this.updateActiveOrderStatus(orderId, OrderStatus.INTERRUPTED)
    
    console.log(`🔄 订单重置为中断状态: ${orderId}`)
  }

  /**
   * 加载订单
   */
  async loadOrder(orderId: string): Promise<ChainMintOrder | null> {
    const orderFile = path.join(this.ordersDir, `${orderId}.json`)
    
    if (!fs.existsSync(orderFile)) {
      return null
    }
    
    try {
      const content = fs.readFileSync(orderFile, 'utf-8')
      return JSON.parse(content) as ChainMintOrder
    } catch (error) {
      console.error(`加载订单失败: ${orderId}`, error)
      return null
    }
  }

  /**
   * 获取所有中断的订单
   */
  async getInterruptedOrders(): Promise<ChainMintOrder[]> {
    const activeOrders = await this.loadActiveOrders()
    const interruptedOrders: ChainMintOrder[] = []
    
    for (const orderInfo of activeOrders.orders) {
      if (orderInfo.status === OrderStatus.INTERRUPTED) {
        const order = await this.loadOrder(orderInfo.id)
        if (order) {
          interruptedOrders.push(order)
        }
      }
    }
    
    return interruptedOrders
  }

  /**
   * 获取订单状态概览
   */
  async getOrdersOverview(): Promise<{
    total: number
    executing: number
    interrupted: number
    completed: number
    recoveryFailed: number
    orders: ChainMintOrder[]
  }> {
    const activeOrders = await this.loadActiveOrders()
    const orders: ChainMintOrder[] = []
    
    let executing = 0, interrupted = 0, completed = 0, recoveryFailed = 0
    
    for (const orderInfo of activeOrders.orders) {
      const order = await this.loadOrder(orderInfo.id)
      if (order) {
        orders.push(order)
        
        switch (order.status) {
          case OrderStatus.EXECUTING:
            executing++
            break
          case OrderStatus.INTERRUPTED:
            interrupted++
            break
          case OrderStatus.COMPLETED:
            completed++
            break
          case OrderStatus.RECOVERY_FAILED:
            recoveryFailed++
            break
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
    }
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.ordersDir)) {
      fs.mkdirSync(this.ordersDir, { recursive: true })
    }
  }

  private generateOrderId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `order_${timestamp}_${random}`
  }

  private async saveOrder(order: ChainMintOrder): Promise<void> {
    const orderFile = path.join(this.ordersDir, `${order.id}.json`)
    fs.writeFileSync(orderFile, JSON.stringify(order, null, 2))
  }

  private async loadActiveOrders(): Promise<ActiveOrdersList> {
    if (!fs.existsSync(this.activeOrdersFile)) {
      return {
        orders: [],
        lastUpdated: Date.now()
      }
    }
    
    try {
      const content = fs.readFileSync(this.activeOrdersFile, 'utf-8')
      return JSON.parse(content) as ActiveOrdersList
    } catch (error) {
      console.error('加载活跃订单列表失败', error)
      return {
        orders: [],
        lastUpdated: Date.now()
      }
    }
  }

  private async saveActiveOrders(activeOrders: ActiveOrdersList): Promise<void> {
    fs.writeFileSync(this.activeOrdersFile, JSON.stringify(activeOrders, null, 2))
  }

  private async addToActiveOrders(order: ChainMintOrder): Promise<void> {
    const activeOrders = await this.loadActiveOrders()
    
    activeOrders.orders.push({
      id: order.id,
      status: order.status,
      createdAt: order.createdAt,
      contractId: order.contractId,
      network: order.network
    })
    
    activeOrders.lastUpdated = Date.now()
    await this.saveActiveOrders(activeOrders)
  }

  private async updateActiveOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
    const activeOrders = await this.loadActiveOrders()
    
    const orderIndex = activeOrders.orders.findIndex(o => o.id === orderId)
    if (orderIndex !== -1) {
      activeOrders.orders[orderIndex].status = status
      activeOrders.lastUpdated = Date.now()
      await this.saveActiveOrders(activeOrders)
    }
  }
}