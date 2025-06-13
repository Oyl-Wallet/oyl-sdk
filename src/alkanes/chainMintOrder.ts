/**
 * Chain-Mint 订单管理系统
 * 
 * 支持 Project Snowball (≤25 tokens) 和 Project Supercluster (>25 tokens) 订单管理
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
  RECOVERY_FAILED = 'recovery_failed',  // 恢复失败
  PARALLEL_EXECUTING = 'parallel_executing',   // 并行执行中 (Project Supercluster)
  PARTIAL_COMPLETED = 'partial_completed'      // 部分完成 (一些分片完成，一些失败)
}

/**
 * 订单执行模式
 */
export enum OrderExecutionMode {
  SNOWBALL = 'snowball',         // Project Snowball (≤25 tokens, 单链)
  SUPERCLUSTER = 'supercluster'  // Project Supercluster (>25 tokens, 并行)
}

/**
 * 分片状态
 */
export enum SliceStatus {
  PENDING = 'pending',           // 等待执行
  EXECUTING = 'executing',       // 执行中
  COMPLETED = 'completed',       // 完成
  FAILED = 'failed'              // 失败
}

/**
 * 分片进度信息 (Project Supercluster)
 */
export interface SliceProgress {
  sliceIndex: number
  status: SliceStatus
  relayAddress: string
  parentVoutIndex: number          // 在复合父交易中的vout索引
  mintCount: number               // 该分片要铸造的token数量
  completedChildTxs: number       // 已完成子交易数量
  lastTxId?: string               // 最后成功的交易ID
  lastOutputAmount?: number       // 最后的输出金额
  startTime?: number              // 分片开始时间
  endTime?: number                // 分片完成时间
  error?: {                       // 失败原因
    phase: 'preparation' | 'execution' | 'completion'
    message: string
    details?: any
  }
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
  
  // 执行模式 (新增)
  executionMode: OrderExecutionMode
  
  // 恢复关键信息
  relayWalletIndex: number        // 确保恢复时生成相同中继钱包 (Snowball模式)
  relayAddress: string            // 中继钱包地址 (Snowball模式) 
  
  // 执行状态
  status: OrderStatus
  
  // 执行参数（恢复时必需）
  executionParams: {
    feeRate: number              // 执行时使用的费率 (sat/vB)
    childCount: number           // 子交易数量 (Snowball模式)
    totalMints?: number          // 总铸造数量 (新增，两种模式都支持)
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
    // Project Supercluster 专用参数
    parallelConfig?: {
      cpfpMultiplier: number
      maxConcurrentSlices: number
      enableParallelExecution: boolean
      cpfpConfirmationTimeout: number
    }
  }
  
  // 进度信息（断点续传核心）
  progress: {
    // Snowball 模式进度 (保持向后兼容)
    parentTxId?: string           // 父交易ID
    completedChildTxs: number     // 已完成子交易数量 (0-24)
    lastTxId?: string             // 最后成功的交易ID
    lastOutputAmount?: number     // 最后的输出金额（用于链接下一笔）
    
    // Supercluster 模式进度 (新增)
    compositeParentTxId?: string  // 复合父交易ID
    totalSlices?: number          // 总分片数量
    completedSlices?: number      // 已完成分片数量
    slices?: SliceProgress[]      // 各分片详细进度
  }
  
  // 时间戳
  createdAt: number
  lastUpdatedAt: number
  
  // 中断时的诊断信息
  interruptInfo?: {
    reason: string
    relayBalance?: number         // Snowball模式
    failedSlices?: number[]       // Supercluster模式：失败的分片索引
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
    executionMode: OrderExecutionMode    // 新增
    createdAt: number
    contractId: AlkaneContractId
    network: string
    totalMints?: number                  // 新增：总铸造数量
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
   * 创建新订单 (支持Snowball和Supercluster模式)
   */
  async createOrder(config: {
    contractId: AlkaneContractId
    finalReceiverAddress: string
    network: 'bitcoin' | 'testnet' | 'regtest'
    // Snowball 模式参数 (保持向后兼容)
    relayWalletIndex?: number
    relayAddress?: string
    feeRate: number
    childCount?: number
    // 通用参数
    totalMints?: number
    executionMode?: OrderExecutionMode
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
    // Supercluster 模式参数
    parallelConfig?: {
      cpfpMultiplier: number
      maxConcurrentSlices: number
      enableParallelExecution: boolean
      cpfpConfirmationTimeout: number
    }
  }): Promise<ChainMintOrder> {
    
    const orderId = this.generateOrderId()
    const now = Date.now()
    
    // 自动检测执行模式 (如果未明确指定)
    const detectedMode = config.executionMode || 
      ((config.totalMints || config.childCount || 25) > 25 ? 
        OrderExecutionMode.SUPERCLUSTER : 
        OrderExecutionMode.SNOWBALL)
    
    // 验证模式与参数匹配
    if (detectedMode === OrderExecutionMode.SNOWBALL) {
      if (!config.relayWalletIndex && config.relayWalletIndex !== 0) {
        throw new Error('Snowball模式需要relayWalletIndex参数')
      }
      if (!config.relayAddress) {
        throw new Error('Snowball模式需要relayAddress参数')
      }
    }
    
    if (detectedMode === OrderExecutionMode.SUPERCLUSTER) {
      if (!config.parallelConfig) {
        throw new Error('Supercluster模式需要parallelConfig参数')
      }
      if (!config.totalMints || config.totalMints <= 25) {
        throw new Error('Supercluster模式需要totalMints > 25')
      }
    }
    
    const order: ChainMintOrder = {
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
    }
    
    // 保存订单文件
    await this.saveOrder(order)
    
    // 更新活跃订单列表
    await this.addToActiveOrders(order)
    
    console.log(`📝 订单创建: ${orderId}`)
    console.log(`   执行模式: ${detectedMode === OrderExecutionMode.SUPERCLUSTER ? 'Project Supercluster' : 'Project Snowball'}`)
    
    if (detectedMode === OrderExecutionMode.SNOWBALL) {
      console.log(`   中继地址: ${config.relayAddress}`)
      console.log(`   子交易数: ${config.childCount || 25}`)
    } else {
      console.log(`   总铸造量: ${config.totalMints} tokens`)
      console.log(`   分片数量: ${Math.ceil((config.totalMints || 25) / 25)}`)
      console.log(`   并行度: ${config.parallelConfig?.maxConcurrentSlices || 6}`)
    }
    
    console.log(`   如中断可恢复: oyl alkane chain-mint-resume --order-id ${orderId}`)
    
    return order
  }

  /**
   * 更新订单进度 (支持两种模式)
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
   * 初始化并行订单的分片状态 (Project Supercluster)
   */
  async initializeParallelSlices(orderId: string, slicesInfo: {
    sliceIndex: number
    relayAddress: string
    parentVoutIndex: number
    mintCount: number
  }[]): Promise<void> {
    const order = await this.loadOrder(orderId)
    if (!order) {
      throw new Error(`订单不存在: ${orderId}`)
    }
    
    if (order.executionMode !== OrderExecutionMode.SUPERCLUSTER) {
      throw new Error(`只有Supercluster模式的订单才能初始化分片状态`)
    }
    
    // 初始化分片进度
    const slices: SliceProgress[] = slicesInfo.map(info => ({
      sliceIndex: info.sliceIndex,
      status: SliceStatus.PENDING,
      relayAddress: info.relayAddress,
      parentVoutIndex: info.parentVoutIndex,
      mintCount: info.mintCount,
      completedChildTxs: 0
    }))
    
    order.progress.slices = slices
    order.progress.totalSlices = slices.length
    order.progress.completedSlices = 0
    order.lastUpdatedAt = Date.now()
    
    await this.saveOrder(order)
    
    console.log(`📋 分片状态已初始化: ${slices.length} 个分片`)
  }

  /**
   * 更新分片进度 (Project Supercluster)
   */
  async updateSliceProgress(orderId: string, sliceIndex: number, update: {
    status?: SliceStatus
    completedChildTxs?: number
    lastTxId?: string
    lastOutputAmount?: number
    startTime?: number
    endTime?: number
    error?: SliceProgress['error']
  }): Promise<void> {
    const order = await this.loadOrder(orderId)
    if (!order) {
      throw new Error(`订单不存在: ${orderId}`)
    }
    
    if (order.executionMode !== OrderExecutionMode.SUPERCLUSTER) {
      throw new Error(`只有Supercluster模式的订单才能更新分片进度`)
    }
    
    if (!order.progress.slices) {
      throw new Error(`订单分片状态未初始化`)
    }
    
    const sliceProgress = order.progress.slices.find(s => s.sliceIndex === sliceIndex)
    if (!sliceProgress) {
      throw new Error(`分片 ${sliceIndex} 不存在`)
    }
    
    // 更新分片状态
    Object.assign(sliceProgress, update)
    
    // 更新整体进度统计
    const completedSlicesCount = order.progress.slices.filter(s => s.status === SliceStatus.COMPLETED).length
    order.progress.completedSlices = completedSlicesCount
    
    // 检查是否所有分片都完成
    if (completedSlicesCount === order.progress.totalSlices) {
      order.status = OrderStatus.COMPLETED
    } else {
      // 检查是否有失败的分片
      const failedSlicesCount = order.progress.slices.filter(s => s.status === SliceStatus.FAILED).length
      if (failedSlicesCount > 0 && completedSlicesCount + failedSlicesCount === order.progress.totalSlices) {
        order.status = OrderStatus.PARTIAL_COMPLETED
      }
    }
    
    order.lastUpdatedAt = Date.now()
    await this.saveOrder(order)
    await this.updateActiveOrderStatus(orderId, order.status)
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
   * 获取所有中断的订单 (包括并行订单)
   */
  async getInterruptedOrders(): Promise<ChainMintOrder[]> {
    const activeOrders = await this.loadActiveOrders()
    const interruptedOrders: ChainMintOrder[] = []
    
    for (const orderInfo of activeOrders.orders) {
      if (orderInfo.status === OrderStatus.INTERRUPTED || 
          orderInfo.status === OrderStatus.PARTIAL_COMPLETED) {
        const order = await this.loadOrder(orderInfo.id)
        if (order) {
          interruptedOrders.push(order)
        }
      }
    }
    
    return interruptedOrders
  }

  /**
   * 获取可恢复的分片列表 (Project Supercluster)
   */
  async getRecoverableSlices(orderId: string): Promise<SliceProgress[]> {
    const order = await this.loadOrder(orderId)
    if (!order) {
      throw new Error(`订单不存在: ${orderId}`)
    }
    
    if (order.executionMode !== OrderExecutionMode.SUPERCLUSTER) {
      throw new Error(`只有Supercluster模式的订单才有分片信息`)
    }
    
    if (!order.progress.slices) {
      return []
    }
    
    // 返回未完成的分片（包括失败的和待执行的）
    return order.progress.slices.filter(slice => 
      slice.status === SliceStatus.PENDING || 
      slice.status === SliceStatus.FAILED ||
      slice.status === SliceStatus.EXECUTING
    )
  }

  /**
   * 重置失败的分片状态为待执行
   */
  async resetFailedSlices(orderId: string, sliceIndices?: number[]): Promise<void> {
    const order = await this.loadOrder(orderId)
    if (!order) {
      throw new Error(`订单不存在: ${orderId}`)
    }
    
    if (order.executionMode !== OrderExecutionMode.SUPERCLUSTER) {
      throw new Error(`只有Supercluster模式的订单才能重置分片状态`)
    }
    
    if (!order.progress.slices) {
      throw new Error(`订单分片状态未初始化`)
    }
    
    let resetCount = 0
    for (const slice of order.progress.slices) {
      if (slice.status === SliceStatus.FAILED || slice.status === SliceStatus.EXECUTING) {
        // 如果指定了特定分片，只重置这些分片
        if (!sliceIndices || sliceIndices.includes(slice.sliceIndex)) {
          slice.status = SliceStatus.PENDING
          slice.error = undefined
          slice.endTime = undefined
          resetCount++
        }
      }
    }
    
    // 如果有分片被重置，更新订单状态
    if (resetCount > 0) {
      order.status = OrderStatus.PARALLEL_EXECUTING
      order.lastUpdatedAt = Date.now()
      await this.saveOrder(order)
      await this.updateActiveOrderStatus(orderId, order.status)
      
      console.log(`🔄 已重置 ${resetCount} 个失败分片状态`)
    }
  }

  /**
   * 获取订单状态概览 (支持并行订单)
   */
  async getOrdersOverview(): Promise<{
    total: number
    executing: number
    parallelExecuting: number
    interrupted: number
    partialCompleted: number
    completed: number
    recoveryFailed: number
    orders: ChainMintOrder[]
  }> {
    const activeOrders = await this.loadActiveOrders()
    const orders: ChainMintOrder[] = []
    
    let executing = 0, parallelExecuting = 0, interrupted = 0, 
        partialCompleted = 0, completed = 0, recoveryFailed = 0
    
    for (const orderInfo of activeOrders.orders) {
      const order = await this.loadOrder(orderInfo.id)
      if (order) {
        orders.push(order)
        
        switch (order.status) {
          case OrderStatus.EXECUTING:
            executing++
            break
          case OrderStatus.PARALLEL_EXECUTING:
            parallelExecuting++
            break
          case OrderStatus.INTERRUPTED:
            interrupted++
            break
          case OrderStatus.PARTIAL_COMPLETED:
            partialCompleted++
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
      parallelExecuting,
      interrupted,
      partialCompleted,
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
      executionMode: order.executionMode,
      createdAt: order.createdAt,
      contractId: order.contractId,
      network: order.network,
      totalMints: order.executionParams.totalMints
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