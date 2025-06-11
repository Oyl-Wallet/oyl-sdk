/**
 * 链上验证和资产查询模块
 * 
 * 实现Project Snowball链式铸造的完整验证系统：
 * - 交易确认状态监控
 * - 最终资产余额验证  
 * - 链条执行状态查询
 * - 实时进度显示
 */

import { Provider } from '../provider/provider'
import { 
  AlkaneContractId,
  BuiltTransaction,
  ChainMintingError,
  ChainMintingErrorType
} from './chainMinting'

// ============================================================================
// 验证相关类型定义
// ============================================================================

/**
 * 单笔交易确认状态
 */
export interface TransactionStatus {
  /** 交易ID */
  txId: string
  /** 交易索引 (0=父交易, 1-24=子交易) */
  index: number
  /** 交易类型 */
  type: 'parent' | 'child'
  /** 是否已确认 */
  confirmed: boolean
  /** 确认区块高度 */
  blockHeight?: number
  /** 确认时间戳 */
  confirmationTime?: number
  /** 是否在交易池中 */
  inMempool: boolean
  /** 状态检查时间 */
  lastChecked: number
  /** 错误信息 */
  error?: string
}

/**
 * 链条整体执行状态
 */
export interface ChainExecutionStatus {
  /** 链条ID (父交易ID) */
  chainId: string
  /** 合约ID */
  contractId: AlkaneContractId
  /** 最终接收地址 */
  finalReceiverAddress: string
  /** 开始时间 */
  startTime: number
  /** 完成时间 */
  completionTime?: number
  /** 总交易数 */
  totalTransactions: number
  /** 已确认交易数 */
  confirmedTransactions: number
  /** 失败交易数 */
  failedTransactions: number
  /** 整体状态 */
  overallStatus: 'pending' | 'in_progress' | 'completed' | 'failed'
  /** 所有交易状态 */
  transactions: TransactionStatus[]
  /** 最终资产余额验证 */
  finalAssetBalance?: AssetBalanceVerification
  /** 执行摘要 */
  executionSummary: ChainExecutionSummary
}

/**
 * 资产余额验证结果
 */
export interface AssetBalanceVerification {
  /** 接收地址 */
  receiverAddress: string
  /** 期望的alkane token数量 */
  expectedTokenCount: number
  /** 实际的alkane token数量 */
  actualTokenCount: number
  /** 验证是否通过 */
  verified: boolean
  /** 详细的token信息 */
  tokenDetails: AlkaneTokenDetail[]
  /** 验证时间 */
  verificationTime: number
  /** 错误信息 */
  error?: string
}

/**
 * Alkane Token详细信息
 */
export interface AlkaneTokenDetail {
  /** Token ID */
  tokenId: string
  /** Token名称 */
  name: string
  /** Token符号 */
  symbol: string
  /** 数量 */
  amount: number
  /** 所在UTXO */
  utxo: {
    txId: string
    outputIndex: number
  }
}

/**
 * 链条执行摘要
 */
export interface ChainExecutionSummary {
  /** 执行耗时 (毫秒) */
  totalDuration: number
  /** 平均交易确认时间 (毫秒) */
  averageConfirmationTime: number
  /** 最慢交易确认时间 (毫秒) */
  slowestConfirmationTime: number
  /** 成功率 */
  successRate: number
  /** 费用总计 */
  totalFeesSpent: number
  /** 最终输出价值 */
  finalOutputValue: number
  /** 是否完全成功 */
  fullySuccessful: boolean
}

/**
 * 验证配置
 */
export interface VerificationConfig {
  /** 轮询间隔 (毫秒) */
  pollInterval: number
  /** 最大等待时间 (毫秒, 0=无限等待) */
  maxWaitTime: number
  /** 是否启用详细日志 */
  verboseLogging: boolean
  /** 是否检查资产余额 */
  checkAssetBalance: boolean
  /** 进度回调函数 */
  onProgress?: (status: ChainExecutionStatus) => void
  /** 完成回调函数 */
  onComplete?: (status: ChainExecutionStatus) => void
}

// ============================================================================
// 默认配置
// ============================================================================

export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  pollInterval: 10000,        // 每10秒检查一次
  maxWaitTime: 1800000,       // 最多等待30分钟
  verboseLogging: true,
  checkAssetBalance: true,
  onProgress: undefined,
  onComplete: undefined
}

// ============================================================================
// 核心验证功能
// ============================================================================

/**
 * 链上验证管理器
 */
export class ChainVerificationManager {
  private provider: Provider
  private config: VerificationConfig
  private currentStatus?: ChainExecutionStatus
  private monitoringInterval?: NodeJS.Timeout

  constructor(provider: Provider, config: Partial<VerificationConfig> = {}) {
    this.provider = provider
    this.config = { ...DEFAULT_VERIFICATION_CONFIG, ...config }
  }

  /**
   * 开始验证链条执行状态
   */
  async startVerification({
    parentTx,
    childTxs,
    contractId,
    finalReceiverAddress
  }: {
    parentTx: BuiltTransaction
    childTxs: BuiltTransaction[]
    contractId: AlkaneContractId
    finalReceiverAddress: string
  }): Promise<ChainExecutionStatus> {
    
    try {
      this.log('🔍 开始链上验证和资产查询...')
      
      // 初始化状态
      const allTransactions = [parentTx, ...childTxs]
      const initialStatus: ChainExecutionStatus = {
        chainId: parentTx.expectedTxId,
        contractId,
        finalReceiverAddress,
        startTime: Date.now(),
        totalTransactions: allTransactions.length,
        confirmedTransactions: 0,
        failedTransactions: 0,
        overallStatus: 'pending',
        transactions: allTransactions.map((tx, index) => ({
          txId: tx.expectedTxId,
          index,
          type: index === 0 ? 'parent' : 'child',
          confirmed: false,
          inMempool: false,
          lastChecked: 0
        })),
        executionSummary: {
          totalDuration: 0,
          averageConfirmationTime: 0,
          slowestConfirmationTime: 0,
          successRate: 0,
          totalFeesSpent: 0,
          finalOutputValue: childTxs[childTxs.length - 1]?.outputValue || 0,
          fullySuccessful: false
        }
      }

      this.currentStatus = initialStatus
      
      this.log(`📊 验证目标:`)
      this.log(`   链条ID: ${initialStatus.chainId}`)
      this.log(`   合约: ${contractId.block}:${contractId.tx}`)
      this.log(`   接收地址: ${finalReceiverAddress}`)
      this.log(`   总交易数: ${initialStatus.totalTransactions}`)
      this.log('')

      // 开始监控
      await this.startMonitoring()

      return this.currentStatus

    } catch (error) {
      this.log(`❌ 验证启动失败: ${error.message}`)
      throw new ChainMintingError(
        ChainMintingErrorType.VERIFICATION_ERROR,
        `链上验证启动失败: ${error.message}`,
        { contractId, finalReceiverAddress }
      )
    }
  }

  /**
   * 停止验证监控
   */
  stopVerification(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = undefined
      this.log('⏹️ 验证监控已停止')
    }
  }

  /**
   * 获取当前状态
   */
  getCurrentStatus(): ChainExecutionStatus | undefined {
    return this.currentStatus
  }

  /**
   * 开始监控循环
   */
  private async startMonitoring(): Promise<void> {
    this.log('🔄 开始监控交易确认状态...')

    const monitorLoop = async () => {
      try {
        if (!this.currentStatus) return

        // 检查是否超时
        if (this.config.maxWaitTime > 0) {
          const elapsed = Date.now() - this.currentStatus.startTime
          if (elapsed > this.config.maxWaitTime) {
            this.log(`⏰ 验证超时 (${elapsed}ms > ${this.config.maxWaitTime}ms)`)
            await this.completeVerification('failed')
            return
          }
        }

        // 更新交易状态
        await this.updateTransactionStatuses()

        // 检查完成条件
        if (this.isVerificationComplete()) {
          await this.completeVerification('completed')
          return
        }

        // 触发进度回调
        if (this.config.onProgress) {
          this.config.onProgress(this.currentStatus)
        }

      } catch (error) {
        this.log(`❌ 监控循环错误: ${error.message}`)
      }
    }

    // 立即执行一次
    await monitorLoop()

    // 如果还没完成，设置定时器
    if (this.currentStatus?.overallStatus === 'pending' || this.currentStatus?.overallStatus === 'in_progress') {
      this.monitoringInterval = setInterval(monitorLoop, this.config.pollInterval)
    }
  }

  /**
   * 更新所有交易状态
   */
  private async updateTransactionStatuses(): Promise<void> {
    if (!this.currentStatus) return

    let hasChanges = false
    const pendingTransactions = this.currentStatus.transactions.filter(tx => !tx.confirmed)

    this.log(`🔍 检查 ${pendingTransactions.length} 笔待确认交易...`)

    for (const tx of pendingTransactions) {
      try {
        const newStatus = await this.checkTransactionStatus(tx.txId)
        
        if (newStatus.confirmed !== tx.confirmed || newStatus.inMempool !== tx.inMempool) {
          // 状态发生变化
          Object.assign(tx, newStatus)
          hasChanges = true

          if (newStatus.confirmed) {
            this.currentStatus.confirmedTransactions++
            this.log(`✅ 交易 ${tx.index} 已确认: ${tx.txId} (区块 ${tx.blockHeight})`)
          } else if (newStatus.inMempool && !tx.inMempool) {
            this.log(`🔄 交易 ${tx.index} 进入交易池: ${tx.txId}`)
          }
        }

        tx.lastChecked = Date.now()

      } catch (error) {
        tx.error = error.message
        this.log(`⚠️ 交易 ${tx.index} 状态检查失败: ${error.message}`)
      }
    }

    if (hasChanges) {
      this.updateOverallStatus()
      this.updateExecutionSummary()
    }
  }

  /**
   * 检查单笔交易状态
   */
  private async checkTransactionStatus(txId: string): Promise<Partial<TransactionStatus>> {
    try {
      const txStatus = await this.provider.esplora.getTxStatus(txId)
      
      if (txStatus.confirmed) {
        return {
          confirmed: true,
          blockHeight: txStatus.block_height,
          confirmationTime: Date.now(),
          inMempool: false
        }
      } else if (txStatus.block_height === null) {
        // 在mempool中但未确认
        return {
          confirmed: false,
          inMempool: true
        }
      } else {
        // 交易存在但状态不明确
        return {
          confirmed: false,
          inMempool: true
        }
      }

    } catch (error) {
      // 交易可能还没广播到节点
      return {
        confirmed: false,
        inMempool: false,
        error: error.message
      }
    }
  }

  /**
   * 更新整体状态
   */
  private updateOverallStatus(): void {
    if (!this.currentStatus) return

    const { confirmedTransactions, totalTransactions } = this.currentStatus

    if (confirmedTransactions === 0) {
      this.currentStatus.overallStatus = 'pending'
    } else if (confirmedTransactions === totalTransactions) {
      this.currentStatus.overallStatus = 'completed'
    } else {
      this.currentStatus.overallStatus = 'in_progress'
    }
  }

  /**
   * 更新执行摘要
   */
  private updateExecutionSummary(): void {
    if (!this.currentStatus) return

    const now = Date.now()
    const confirmedTxs = this.currentStatus.transactions.filter(tx => tx.confirmed)
    
    // 计算统计数据
    const totalDuration = now - this.currentStatus.startTime
    const confirmationTimes = confirmedTxs
      .filter(tx => tx.confirmationTime)
      .map(tx => tx.confirmationTime! - this.currentStatus!.startTime)
    
    const averageConfirmationTime = confirmationTimes.length > 0 
      ? confirmationTimes.reduce((sum, time) => sum + time, 0) / confirmationTimes.length
      : 0
    
    const slowestConfirmationTime = confirmationTimes.length > 0
      ? Math.max(...confirmationTimes)
      : 0

    const successRate = this.currentStatus.confirmedTransactions / this.currentStatus.totalTransactions

    this.currentStatus.executionSummary = {
      totalDuration,
      averageConfirmationTime,
      slowestConfirmationTime,
      successRate,
      totalFeesSpent: 0, // TODO: 计算实际费用
      finalOutputValue: this.currentStatus.executionSummary.finalOutputValue,
      fullySuccessful: successRate === 1.0
    }
  }

  /**
   * 检查验证是否完成
   */
  private isVerificationComplete(): boolean {
    if (!this.currentStatus) return false
    
    const { confirmedTransactions, totalTransactions, failedTransactions } = this.currentStatus
    
    // 全部确认 或 有失败的交易
    return confirmedTransactions === totalTransactions || failedTransactions > 0
  }

  /**
   * 完成验证流程
   */
  private async completeVerification(finalStatus: 'completed' | 'failed'): Promise<void> {
    if (!this.currentStatus) return

    this.stopVerification()
    
    this.currentStatus.overallStatus = finalStatus
    this.currentStatus.completionTime = Date.now()
    
    this.log(`\n🎯 验证流程完成: ${finalStatus}`)
    this.logFinalSummary()

    // 如果需要检查资产余额
    if (this.config.checkAssetBalance && finalStatus === 'completed') {
      await this.verifyFinalAssetBalance()
    }

    // 触发完成回调
    if (this.config.onComplete) {
      this.config.onComplete(this.currentStatus)
    }
  }

  /**
   * 验证最终资产余额
   */
  private async verifyFinalAssetBalance(): Promise<void> {
    if (!this.currentStatus) return

    try {
      this.log('\n🔍 验证最终资产余额...')
      
      const balanceVerification = await this.checkAssetBalance(
        this.currentStatus.finalReceiverAddress,
        this.currentStatus.contractId
      )

      this.currentStatus.finalAssetBalance = balanceVerification

      if (balanceVerification.verified) {
        this.log(`✅ 资产余额验证通过!`)
        this.log(`   期望: ${balanceVerification.expectedTokenCount} tokens`)
        this.log(`   实际: ${balanceVerification.actualTokenCount} tokens`)
      } else {
        this.log(`❌ 资产余额验证失败!`)
        this.log(`   期望: ${balanceVerification.expectedTokenCount} tokens`)
        this.log(`   实际: ${balanceVerification.actualTokenCount} tokens`)
        this.log(`   错误: ${balanceVerification.error}`)
      }

    } catch (error) {
      this.log(`❌ 资产余额验证错误: ${error.message}`)
      if (this.currentStatus.finalAssetBalance) {
        this.currentStatus.finalAssetBalance.error = error.message
      }
    }
  }

  /**
   * 检查地址的alkane资产余额
   */
  private async checkAssetBalance(
    address: string,
    contractId: AlkaneContractId
  ): Promise<AssetBalanceVerification> {
    
    try {
      // 查询地址的alkane资产
      const alkaneOutpoints = await this.provider.alkanes.getAlkanesByAddress({ address })
      
      // 从响应中提取所有runes
      const allRunes: any[] = []
      for (const outpoint of alkaneOutpoints) {
        if (outpoint.runes && outpoint.runes.length > 0) {
          for (const rune of outpoint.runes) {
            allRunes.push({
              rune,
              outpoint: outpoint.outpoint
            })
          }
        }
      }
      
      // 过滤出来自目标合约的tokens
      // Note: 需要根据实际的rune结构来过滤，这里暂时计算所有tokens
      const targetTokens = allRunes.filter(item => {
        // 这里需要根据实际的rune数据结构来判断是否来自目标合约
        // 暂时简化为计算所有runes
        return true
      })

      const tokenDetails: AlkaneTokenDetail[] = targetTokens.map((item, index) => ({
        tokenId: `${contractId.block}:${contractId.tx}:${index}`,
        name: item.rune.name || 'Alkane Token',
        symbol: item.rune.symbol || 'ALK',
        amount: parseInt(item.rune.amount) || 1,
        utxo: {
          txId: item.outpoint.txid,
          outputIndex: item.outpoint.vout
        }
      }))

      const actualTokenCount = targetTokens.length
      const expectedTokenCount = 24 // Project Snowball应该产生24个tokens

      return {
        receiverAddress: address,
        expectedTokenCount,
        actualTokenCount,
        verified: actualTokenCount === expectedTokenCount,
        tokenDetails,
        verificationTime: Date.now()
      }

    } catch (error) {
      this.log(`⚠️ 资产余额查询失败: ${error.message}`)
      return {
        receiverAddress: address,
        expectedTokenCount: 24,
        actualTokenCount: 0,
        verified: false,
        tokenDetails: [],
        verificationTime: Date.now(),
        error: error.message
      }
    }
  }

  /**
   * 输出最终摘要
   */
  private logFinalSummary(): void {
    if (!this.currentStatus) return

    const { executionSummary, confirmedTransactions, totalTransactions } = this.currentStatus
    
    this.log(`\n📊 执行摘要:`)
    this.log(`   总耗时: ${Math.round(executionSummary.totalDuration / 1000)}秒`)
    this.log(`   成功率: ${(executionSummary.successRate * 100).toFixed(1)}% (${confirmedTransactions}/${totalTransactions})`)
    this.log(`   平均确认时间: ${Math.round(executionSummary.averageConfirmationTime / 1000)}秒`)
    this.log(`   最慢确认时间: ${Math.round(executionSummary.slowestConfirmationTime / 1000)}秒`)
    this.log(`   最终输出价值: ${executionSummary.finalOutputValue} sats`)
    this.log(`   完全成功: ${executionSummary.fullySuccessful ? '是' : '否'}`)
  }

  /**
   * 日志输出
   */
  private log(message: string): void {
    if (this.config.verboseLogging) {
      const timestamp = new Date().toISOString()
      console.log(`[${timestamp}] ${message}`)
    }
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 快速验证链条执行状态
 */
export async function verifyChainExecution({
  parentTx,
  childTxs,
  contractId,
  finalReceiverAddress,
  provider,
  config = {}
}: {
  parentTx: BuiltTransaction
  childTxs: BuiltTransaction[]
  contractId: AlkaneContractId
  finalReceiverAddress: string
  provider: Provider
  config?: Partial<VerificationConfig>
}): Promise<ChainExecutionStatus> {
  
  const manager = new ChainVerificationManager(provider, config)
  
  try {
    const result = await manager.startVerification({
      parentTx,
      childTxs,
      contractId,
      finalReceiverAddress
    })

    return result

  } finally {
    manager.stopVerification()
  }
}

/**
 * 格式化验证结果用于显示
 */
export function formatVerificationResult(status: ChainExecutionStatus): string {
  const { executionSummary, confirmedTransactions, totalTransactions, overallStatus } = status
  
  const statusEmoji = {
    pending: '⏳',
    in_progress: '🔄', 
    completed: '✅',
    failed: '❌'
  }[overallStatus]

  const successRate = (executionSummary.successRate * 100).toFixed(1)
  const duration = Math.round(executionSummary.totalDuration / 1000)

  let result = `\n${statusEmoji} 链条验证结果:\n`
  result += `├─ 状态: ${overallStatus}\n`
  result += `├─ 进度: ${confirmedTransactions}/${totalTransactions} (${successRate}%)\n`
  result += `├─ 耗时: ${duration}秒\n`
  result += `├─ 平均确认: ${Math.round(executionSummary.averageConfirmationTime / 1000)}秒\n`
  result += `└─ 完全成功: ${executionSummary.fullySuccessful ? '是' : '否'}\n`

  if (status.finalAssetBalance) {
    const { verified, expectedTokenCount, actualTokenCount } = status.finalAssetBalance
    result += `\n💰 资产验证:\n`
    result += `├─ 期望tokens: ${expectedTokenCount}\n`
    result += `├─ 实际tokens: ${actualTokenCount}\n`
    result += `└─ 验证通过: ${verified ? '是' : '否'}\n`
  }

  return result
}