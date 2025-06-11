/**
 * 交易广播模块
 * 
 * 实现带重试机制的顺序广播系统，确保链式交易按正确顺序提交
 * 支持父交易确认等待、子交易依次广播、完整的错误处理和状态跟踪
 */

import * as bitcoin from 'bitcoinjs-lib'
import { Provider } from '../provider/provider'
import { 
  BroadcastConfig,
  BroadcastResult,
  BatchBroadcastResult,
  BuiltTransaction,
  ChainMintingError,
  ChainMintingErrorType,
  DEFAULT_BROADCAST_CONFIG
} from './chainMinting'

// ============================================================================
// 核心广播功能
// ============================================================================

/**
 * 广播单个交易
 */
export async function broadcastSingleTransaction(
  psbtHex: string,
  expectedTxId: string,
  provider: Provider,
  config: BroadcastConfig = DEFAULT_BROADCAST_CONFIG
): Promise<BroadcastResult> {
  
  const startTime = Date.now()
  let retryCount = 0
  let lastError: string | undefined
  
  console.log(`📡 开始广播交易: ${expectedTxId}`)
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      console.log(`   第 ${attempt + 1} 次尝试...`)
      
      // 广播PSBT
      const broadcastResult = await provider.pushPsbt({ psbtHex })
      const actualTxId = broadcastResult.txId
      
      // 验证交易ID是否匹配
      if (actualTxId !== expectedTxId) {
        console.warn(`⚠️  交易ID不匹配: 期望 ${expectedTxId}, 实际 ${actualTxId}`)
      }
      
      console.log(`✅ 交易广播成功: ${actualTxId}`)
      
      return {
        txId: actualTxId,
        timestamp: Date.now(),
        retryCount: attempt,
        success: true
      }
      
    } catch (error) {
      retryCount = attempt
      lastError = error.message
      
      console.error(`❌ 第 ${attempt + 1} 次广播失败: ${error.message}`)
      
      // 检查是否为致命错误（无需重试）
      if (isFatalBroadcastError(error.message)) {
        console.error(`💀 致命错误，停止重试: ${error.message}`)
        break
      }
      
      // 如果不是最后一次尝试，等待后重试
      if (attempt < config.maxRetries) {
        const delay = calculateRetryDelay(attempt, config.retryDelayMs)
        console.log(`⏳ 等待 ${delay}ms 后重试...`)
        await sleep(delay)
      }
    }
  }
  
  // 所有重试都失败
  console.error(`💥 交易广播失败，已用尽 ${config.maxRetries + 1} 次机会`)
  
  return {
    txId: expectedTxId,
    timestamp: Date.now(),
    retryCount: retryCount,
    success: false,
    error: lastError
  }
}

/**
 * 等待交易确认或节点接受
 */
export async function waitForTransactionAcceptance(
  txId: string,
  provider: Provider,
  timeoutMs: number = 30000
): Promise<{ accepted: boolean, confirmed: boolean, error?: string }> {
  
  const startTime = Date.now()
  const pollInterval = 2000 // 每2秒检查一次
  const isInfiniteWait = timeoutMs === 0
  
  if (isInfiniteWait) {
    console.log(`⏰ 等待交易进入交易池: ${txId} (无超时限制)`)
  } else {
    console.log(`⏰ 等待交易确认: ${txId} (${timeoutMs}ms超时)`)
  }
  
  let attemptCount = 0
  while (isInfiniteWait || (Date.now() - startTime < timeoutMs)) {
    attemptCount++
    
    try {
      // 检查交易状态
      const txStatus = await provider.esplora.getTxStatus(txId)
      
      console.log(`🔍 交易状态检查: ${txId}`, { 
        confirmed: txStatus.confirmed, 
        block_height: txStatus.block_height 
      })
      
      if (txStatus.confirmed) {
        console.log(`✅ 交易已确认: ${txId}`)
        return { accepted: true, confirmed: true }
      } else if (txStatus.block_height === null) {
        // 交易在mempool中，被节点接受但未确认
        console.log(`🔄 交易已被节点接受: ${txId}`)
        return { accepted: true, confirmed: false }
      } else {
        // 如果交易存在但状态不明确，也认为已被接受
        console.log(`🔄 交易已存在于节点: ${txId}`)
        return { accepted: true, confirmed: false }
      }
      
    } catch (error) {
      // 交易可能还没有被广播到节点
      if (isInfiniteWait) {
        if (attemptCount % 10 === 0) { // 每20秒显示一次状态
          console.log(`⏳ 继续等待交易出现在节点中... (尝试第${attemptCount}次)`)
        }
      } else {
        console.log(`⏳ 等待交易出现在节点中...`)
      }
    }
    
    await sleep(pollInterval)
  }
  
  // 只有非无限等待模式才会到达这里
  console.error(`⏰ 等待交易确认超时: ${txId}`)
  return { 
    accepted: false, 
    confirmed: false, 
    error: `Timeout after ${timeoutMs}ms` 
  }
}

// ============================================================================
// 批量广播功能
// ============================================================================

/**
 * 并行广播完整的交易链（不等待确认）
 * 
 * 同时广播父交易和所有子交易，适用于链式铸造场景
 */
export async function broadcastTransactionChainParallel({
  parentTransaction,
  childTransactions,
  provider,
  config = DEFAULT_BROADCAST_CONFIG
}: {
  parentTransaction: BuiltTransaction
  childTransactions: BuiltTransaction[]
  provider: Provider
  config?: BroadcastConfig
}): Promise<BatchBroadcastResult> {
  
  try {
    console.log(`🚀 开始并行广播交易链...`)
    console.log(`   父交易: ${parentTransaction.expectedTxId}`)
    console.log(`   子交易数量: ${childTransactions.length}`)
    
    const startTime = Date.now()
    
    // 创建所有广播Promise
    const allTransactions = [parentTransaction, ...childTransactions]
    const broadcastPromises = allTransactions.map(async (tx, index) => {
      const txType = index === 0 ? '父交易' : `子交易${index}`
      console.log(`📡 开始广播 ${txType}: ${tx.expectedTxId}`)
      
      const result = await broadcastSingleTransaction(
        tx.psbtHex,
        tx.expectedTxId,
        provider,
        { ...config, waitForAcceptance: false } // 强制不等待确认
      )
      
      if (result.success) {
        console.log(`✅ ${txType} 广播成功: ${result.txId}`)
      } else {
        console.error(`❌ ${txType} 广播失败: ${result.error}`)
      }
      
      return { ...result, type: txType, index }
    })
    
    // 等待所有广播完成
    console.log(`⏳ 等待所有 ${allTransactions.length} 笔交易广播完成...`)
    const allResults = await Promise.allSettled(broadcastPromises)
    
    // 处理结果
    const parentResult = allResults[0]
    const childResults: BroadcastResult[] = []
    let successCount = 0
    let failureCount = 0
    
    // 处理父交易结果
    if (parentResult.status === 'fulfilled' && parentResult.value.success) {
      console.log(`✅ 父交易处理完成: ${parentResult.value.txId}`)
    } else {
      const error = parentResult.status === 'rejected' 
        ? parentResult.reason.message 
        : parentResult.value.error
      console.error(`❌ 父交易广播失败: ${error}`)
      throw new ChainMintingError(
        ChainMintingErrorType.BROADCAST_ERROR,
        `父交易广播失败: ${error}`,
        { parentTxId: parentTransaction.expectedTxId, error }
      )
    }
    
    // 处理子交易结果
    for (let i = 1; i < allResults.length; i++) {
      const result = allResults[i]
      if (result.status === 'fulfilled') {
        childResults.push(result.value)
        if (result.value.success) {
          successCount++
        } else {
          failureCount++
        }
      } else {
        failureCount++
        childResults.push({
          success: false,
          txId: childTransactions[i-1].expectedTxId,
          error: result.reason.message,
          retryCount: 0,
          timestamp: Date.now()
        })
      }
    }
    
    const allSuccessful = childResults.every(r => r.success)
    const totalDuration = Date.now() - startTime
    
    console.log(`🎯 并行广播完成:`)
    console.log(`   总交易数: ${allTransactions.length}`)
    console.log(`   成功: ${successCount + 1}/${allTransactions.length}`)
    console.log(`   失败: ${failureCount}`)
    console.log(`   总耗时: ${totalDuration}ms`)
    
    return {
      parentTx: {
        success: true,
        txId: (parentResult as any).value.txId,
        error: undefined,
        retryCount: (parentResult as any).value.retryCount,
        timestamp: (parentResult as any).value.timestamp || Date.now()
      },
      childTxs: childResults,
      successCount: successCount + 1, // +1 for parent
      failureCount: failureCount,
      allSuccessful
    }
    
  } catch (error) {
    console.error(`💥 并行广播失败:`, error.message)
    throw error instanceof ChainMintingError ? error : new ChainMintingError(
      ChainMintingErrorType.BROADCAST_ERROR,
      `并行广播失败: ${error.message}`,
      { error: error.message }
    )
  }
}

/**
 * 按顺序广播完整的交易链
 * 
 * 首先广播父交易并等待确认，然后依次广播所有子交易
 */
export async function broadcastTransactionChain({
  parentTransaction,
  childTransactions,
  provider,
  config = DEFAULT_BROADCAST_CONFIG
}: {
  parentTransaction: BuiltTransaction
  childTransactions: BuiltTransaction[]
  provider: Provider
  config?: BroadcastConfig
}): Promise<BatchBroadcastResult> {
  
  try {
    console.log(`🚀 开始广播交易链...`)
    console.log(`   父交易: ${parentTransaction.expectedTxId}`)
    console.log(`   子交易数量: ${childTransactions.length}`)
    console.log(`   广播配置: maxRetries=${config.maxRetries}, waitForAcceptance=${config.waitForAcceptance}`)
    
    const childResults: BroadcastResult[] = []
    let successCount = 0
    let failureCount = 0
    
    // 1. 广播父交易
    console.log(`\n📡 Step 1: 广播父交易 (TX₀)`)
    const parentResult = await broadcastSingleTransaction(
      parentTransaction.psbtHex,
      parentTransaction.expectedTxId,
      provider,
      config
    )
    
    if (!parentResult.success) {
      failureCount++
      console.error(`💥 父交易广播失败，中止整个链条`)
      
      return {
        parentTx: parentResult,
        childTxs: [],
        successCount: 0,
        failureCount: 1,
        allSuccessful: false
      }
    }
    
    successCount++
    
    // 2. 等待父交易被节点接受（如果配置启用）
    if (config.waitForAcceptance) {
      console.log(`\n⏰ Step 2: 等待父交易被节点接受`)
      const acceptanceResult = await waitForTransactionAcceptance(
        parentResult.txId,
        provider,
        config.confirmationTimeoutMs
      )
      
      if (!acceptanceResult.accepted) {
        throw new ChainMintingError(
          ChainMintingErrorType.BROADCAST_ERROR,
          `父交易未被节点接受: ${acceptanceResult.error}`,
          { parentTxId: parentResult.txId }
        )
      }
      
      console.log(`✅ 父交易已被节点接受，继续广播子交易`)
    }
    
    // 3. 依次广播子交易
    console.log(`\n🔗 Step 3: 开始广播子交易链`)
    
    for (let i = 0; i < childTransactions.length; i++) {
      const childTx = childTransactions[i]
      const txIndex = i + 1
      
      console.log(`\n📡 广播子交易 ${txIndex}/${childTransactions.length}: ${childTx.expectedTxId}`)
      
      const childResult = await broadcastSingleTransaction(
        childTx.psbtHex,
        childTx.expectedTxId,
        provider,
        config
      )
      
      childResults.push(childResult)
      
      if (childResult.success) {
        successCount++
        console.log(`✅ 子交易 ${txIndex} 广播成功`)
        
        // 如果配置要求等待确认且不是最后一笔交易，等待节点接受
        if (config.waitForAcceptance && i < childTransactions.length - 1) {
          console.log(`⏳ 等待子交易 ${txIndex} 被节点接受...`)
          
          const acceptanceResult = await waitForTransactionAcceptance(
            childResult.txId,
            provider,
            Math.min(config.confirmationTimeoutMs, 10000) // 子交易等待时间更短
          )
          
          if (acceptanceResult.accepted) {
            console.log(`✅ 子交易 ${txIndex} 已被节点接受`)
          } else {
            console.warn(`⚠️  子交易 ${txIndex} 未被节点接受，但继续处理下一笔`)
          }
        }
        
      } else {
        failureCount++
        console.error(`❌ 子交易 ${txIndex} 广播失败: ${childResult.error}`)
        
        // 根据策略决定是否继续
        if (shouldContinueAfterChildFailure(childResult, i, childTransactions.length)) {
          console.log(`⚠️  继续广播剩余子交易...`)
        } else {
          console.error(`💥 子交易失败，中止剩余广播`)
          break
        }
      }
      
      // 在子交易之间添加短暂延迟，避免网络拥塞
      if (i < childTransactions.length - 1) {
        await sleep(1000)
      }
    }
    
    const allSuccessful = parentResult.success && childResults.every(r => r.success)
    
    console.log(`\n🎉 交易链广播完成!`)
    console.log(`   成功: ${successCount}/${childTransactions.length + 1}`)
    console.log(`   失败: ${failureCount}/${childTransactions.length + 1}`)
    console.log(`   全部成功: ${allSuccessful ? '是' : '否'}`)
    
    return {
      parentTx: parentResult,
      childTxs: childResults,
      successCount,
      failureCount,
      allSuccessful
    }
    
  } catch (error) {
    console.error(`💥 交易链广播失败:`, error.message)
    throw error instanceof ChainMintingError ? error : new ChainMintingError(
      ChainMintingErrorType.BROADCAST_ERROR,
      `交易链广播失败: ${error.message}`,
      { parentTx: parentTransaction.expectedTxId, childCount: childTransactions.length }
    )
  }
}

// ============================================================================
// 高级广播策略
// ============================================================================

/**
 * 并行广播子交易（实验性功能）
 * 
 * 在父交易确认后，并行广播多个子交易以提高速度
 * 注意：这可能导致依赖关系问题，仅在特定场景下使用
 */
export async function broadcastChildTransactionsInParallel({
  childTransactions,
  provider,
  config = DEFAULT_BROADCAST_CONFIG,
  batchSize = 3 // 每批并行广播的数量
}: {
  childTransactions: BuiltTransaction[]
  provider: Provider
  config?: BroadcastConfig
  batchSize?: number
}): Promise<BroadcastResult[]> {
  
  console.log(`🔄 并行广播 ${childTransactions.length} 个子交易，批次大小: ${batchSize}`)
  
  const results: BroadcastResult[] = []
  
  // 分批并行处理
  for (let i = 0; i < childTransactions.length; i += batchSize) {
    const batch = childTransactions.slice(i, i + batchSize)
    console.log(`📦 处理批次 ${Math.floor(i / batchSize) + 1}: 交易 ${i + 1}-${Math.min(i + batchSize, childTransactions.length)}`)
    
    // 并行广播当前批次
    const batchPromises = batch.map(tx => 
      broadcastSingleTransaction(tx.psbtHex, tx.expectedTxId, provider, config)
    )
    
    const batchResults = await Promise.allSettled(batchPromises)
    
    // 处理批次结果
    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j]
      const txIndex = i + j + 1
      
      if (result.status === 'fulfilled') {
        results.push(result.value)
        if (result.value.success) {
          console.log(`✅ 批次交易 ${txIndex} 广播成功`)
        } else {
          console.error(`❌ 批次交易 ${txIndex} 广播失败: ${result.value.error}`)
        }
      } else {
        console.error(`💥 批次交易 ${txIndex} 处理异常: ${result.reason}`)
        results.push({
          txId: batch[j].expectedTxId,
          timestamp: Date.now(),
          retryCount: 0,
          success: false,
          error: result.reason?.toString()
        })
      }
    }
    
    // 批次间添加延迟
    if (i + batchSize < childTransactions.length) {
      await sleep(2000)
    }
  }
  
  return results
}

/**
 * 智能广播策略
 * 
 * 根据网络状况和交易依赖关系自动选择最佳广播策略
 */
export async function smartBroadcastTransactionChain({
  parentTransaction,
  childTransactions,
  provider,
  config = DEFAULT_BROADCAST_CONFIG
}: {
  parentTransaction: BuiltTransaction
  childTransactions: BuiltTransaction[]
  provider: Provider
  config?: BroadcastConfig
}): Promise<BatchBroadcastResult> {
  
  console.log(`🧠 智能广播策略分析...`)
  
  // 分析网络状况
  const networkAnalysis = await analyzeNetworkConditions(provider)
  console.log(`📊 网络分析结果: 拥塞程度=${networkAnalysis.congestionLevel}, 推荐费率=${networkAnalysis.recommendedFeeRate}`)
  
  // 根据网络状况选择策略
  if (networkAnalysis.congestionLevel === 'low' && childTransactions.length <= 10) {
    console.log(`🚀 选择顺序广播策略（网络状况良好）`)
    return broadcastTransactionChain({
      parentTransaction,
      childTransactions,
      provider,
      config
    })
  } else {
    console.log(`🐌 选择保守顺序广播策略（网络拥塞或交易量大）`)
    return broadcastTransactionChain({
      parentTransaction,
      childTransactions,
      provider,
      config: {
        ...config,
        retryDelayMs: config.retryDelayMs * 2, // 增加重试延迟
        confirmationTimeoutMs: config.confirmationTimeoutMs * 1.5 // 增加确认超时
      }
    })
  }
}

// ============================================================================
// 辅助工具函数
// ============================================================================


/**
 * 检查是否为致命广播错误（无需重试）
 */
function isFatalBroadcastError(errorMessage: string): boolean {
  const fatalErrors = [
    'bad-txns-inputs-missingorspent', // 输入已被花费
    'bad-txns-inputs-duplicate',      // 重复输入
    'bad-txns-oversize',             // 交易过大
    'bad-txns-vout-negative',        // 负输出值
    'bad-txns-vout-toolarge',        // 输出值过大
    'non-final',                     // 交易未final
    'dust',                          // 粉尘攻击
    'insufficient priority',         // 优先级不足（不太可能重试成功）
  ]
  
  return fatalErrors.some(error => errorMessage.toLowerCase().includes(error))
}

/**
 * 计算重试延迟（指数退避）
 */
function calculateRetryDelay(attempt: number, baseDelay: number): number {
  // 指数退避 + 随机抖动
  const exponentialDelay = baseDelay * Math.pow(2, attempt)
  const jitter = Math.random() * 1000 // 0-1秒的随机抖动
  return Math.min(exponentialDelay + jitter, 60000) // 最大60秒
}

/**
 * 判断子交易失败后是否继续广播剩余交易
 */
function shouldContinueAfterChildFailure(
  failedResult: BroadcastResult, 
  failedIndex: number, 
  totalCount: number
): boolean {
  // 如果是致命错误，停止广播
  if (failedResult.error && isFatalBroadcastError(failedResult.error)) {
    return false
  }
  
  // 如果失败的是最后几笔交易，继续尝试
  const remainingCount = totalCount - failedIndex - 1
  if (remainingCount <= 3) {
    return true
  }
  
  // 其他情况下，谨慎停止
  return false
}

/**
 * 分析网络状况（简化版本）
 */
async function analyzeNetworkConditions(_provider: Provider): Promise<{
  congestionLevel: 'low' | 'medium' | 'high'
  recommendedFeeRate: number
  mempoolSize: number
}> {
  
  try {
    // 简化的网络分析 - 使用费用估算API
    const feeEstimates = await _provider.esplora.getFeeEstimates()
    
    // 基于费用估算判断网络拥塞程度
    const fastFee = feeEstimates['1'] || 10
    let congestionLevel: 'low' | 'medium' | 'high' = 'low'
    
    if (fastFee > 50) {
      congestionLevel = 'high'
    } else if (fastFee > 20) {
      congestionLevel = 'medium'
    }
    
    return {
      congestionLevel,
      recommendedFeeRate: Math.max(1, Math.ceil(fastFee)),
      mempoolSize: 0 // 无法获取准确的mempool大小
    }
    
  } catch (error) {
    console.warn(`⚠️  网络分析失败，使用默认值: ${error.message}`)
    return {
      congestionLevel: 'medium',
      recommendedFeeRate: 10,
      mempoolSize: 0
    }
  }
}

/**
 * 睡眠函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// 广播状态监控
// ============================================================================

/**
 * 监控交易链的广播状态
 */
export async function monitorTransactionChainStatus({
  parentTxId,
  childTxIds,
  provider,
  pollIntervalMs = 10000, // 每10秒检查一次
  maxMonitoringTimeMs = 300000 // 最多监控5分钟
}: {
  parentTxId: string
  childTxIds: string[]
  provider: Provider
  pollIntervalMs?: number
  maxMonitoringTimeMs?: number
}): Promise<{
  parentStatus: { confirmed: boolean, blockHeight?: number }
  childStatuses: Array<{ txId: string, confirmed: boolean, blockHeight?: number }>
  allConfirmed: boolean
  monitoringTime: number
}> {
  
  const startTime = Date.now()
  console.log(`📊 开始监控交易链状态...`)
  console.log(`   父交易: ${parentTxId}`)
  console.log(`   子交易数量: ${childTxIds.length}`)
  
  while (Date.now() - startTime < maxMonitoringTimeMs) {
    try {
      // 检查父交易状态
      const parentStatus = await provider.esplora.getTxStatus(parentTxId)
      
      // 检查所有子交易状态
      const childStatuses = await Promise.all(
        childTxIds.map(async (txId) => {
          try {
            const status = await provider.esplora.getTxStatus(txId)
            return {
              txId,
              confirmed: status.confirmed,
              blockHeight: status.block_height
            }
          } catch {
            return {
              txId,
              confirmed: false,
              blockHeight: undefined
            }
          }
        })
      )
      
      // 检查是否全部确认
      const allConfirmed = parentStatus.confirmed && childStatuses.every(s => s.confirmed)
      
      const confirmedCount = childStatuses.filter(s => s.confirmed).length
      console.log(`📈 状态更新: 父交易=${parentStatus.confirmed ? '已确认' : '未确认'}, 子交易=${confirmedCount}/${childTxIds.length}确认`)
      
      if (allConfirmed) {
        console.log(`🎉 所有交易已确认!`)
        return {
          parentStatus: {
            confirmed: parentStatus.confirmed,
            blockHeight: parentStatus.block_height
          },
          childStatuses,
          allConfirmed: true,
          monitoringTime: Date.now() - startTime
        }
      }
      
    } catch (error) {
      console.warn(`⚠️  状态检查失败: ${error.message}`)
    }
    
    await sleep(pollIntervalMs)
  }
  
  console.log(`⏰ 监控超时，返回最后状态`)
  
  // 返回最后的状态检查结果
  try {
    const parentStatus = await provider.esplora.getTxStatus(parentTxId)
    const childStatuses = await Promise.all(
      childTxIds.map(async (txId) => ({
        txId,
        confirmed: false,
        blockHeight: undefined
      }))
    )
    
    return {
      parentStatus: {
        confirmed: parentStatus.confirmed,
        blockHeight: parentStatus.block_height
      },
      childStatuses,
      allConfirmed: false,
      monitoringTime: Date.now() - startTime
    }
  } catch {
    return {
      parentStatus: { confirmed: false },
      childStatuses: childTxIds.map(txId => ({ txId, confirmed: false })),
      allConfirmed: false,
      monitoringTime: Date.now() - startTime
    }
  }
}

// ============================================================================
// 格式化和报告功能
// ============================================================================

/**
 * 格式化批量广播结果
 */
export function formatBatchBroadcastResult(result: BatchBroadcastResult): string {
  const parentStatus = result.parentTx.success ? '✅ 成功' : '❌ 失败'
  const successRate = result.successCount / (result.successCount + result.failureCount)
  
  let output = `\n📡 交易链广播结果:\n`
  output += `├─ 父交易: ${parentStatus} (${result.parentTx.txId})\n`
  output += `├─ 子交易: ${result.successCount}/${result.childTxs.length} 成功\n`
  output += `├─ 成功率: ${(successRate * 100).toFixed(1)}%\n`
  output += `└─ 整体状态: ${result.allSuccessful ? '✅ 全部成功' : '⚠️  部分失败'}\n`
  
  // 详细的失败信息
  const failedTxs = result.childTxs.filter(tx => !tx.success)
  if (failedTxs.length > 0) {
    output += `\n❌ 失败的子交易:\n`
    failedTxs.forEach((tx, index) => {
      output += `   ${index + 1}. ${tx.txId}: ${tx.error}\n`
    })
  }
  
  return output
}

/**
 * 生成广播摘要报告
 */
export function generateBroadcastSummary(result: BatchBroadcastResult): {
  summary: {
    totalTransactions: number
    successfulTransactions: number
    failedTransactions: number
    successRate: number
    parentSuccess: boolean
    allChildrenSuccess: boolean
  }
  details: {
    parentTx: {
      txId: string
      success: boolean
      retryCount: number
      error?: string
    }
    childTxs: Array<{
      txId: string
      success: boolean
      retryCount: number
      error?: string
    }>
  }
  timestamp: number
} {
  return {
    summary: {
      totalTransactions: result.successCount + result.failureCount,
      successfulTransactions: result.successCount,
      failedTransactions: result.failureCount,
      successRate: result.successCount / (result.successCount + result.failureCount),
      parentSuccess: result.parentTx.success,
      allChildrenSuccess: result.childTxs.every(tx => tx.success)
    },
    details: {
      parentTx: {
        txId: result.parentTx.txId,
        success: result.parentTx.success,
        retryCount: result.parentTx.retryCount,
        error: result.parentTx.error
      },
      childTxs: result.childTxs.map(tx => ({
        txId: tx.txId,
        success: tx.success,
        retryCount: tx.retryCount,
        error: tx.error
      }))
    },
    timestamp: Date.now()
  }
}