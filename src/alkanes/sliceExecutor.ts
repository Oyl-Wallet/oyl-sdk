/**
 * Project Supercluster - 分片执行器
 * 
 * 基于现有executeChildTransactionChainWithTracking的扩展，实现单个分片的完整执行
 * 100% 复用现有的子交易链构建和广播逻辑
 */

import { Provider } from '../provider/provider'
import { 
  ChainMintingWallets,
  AlkaneContractId,
  BuiltTransaction,
  ChainMintingError,
  ChainMintingErrorType
} from './chainMinting'
import { buildChildTransaction } from './transactionBuilder'
import { 
  broadcastSingleTransaction, 
  broadcastSingleTransactionWithRpc
} from './transactionBroadcaster'
import { MultiRelayWalletSystem, RelayWalletInfo } from './multiRelayWalletManager'
import { SliceFeeCalculation } from './parallelFeeCalculator'
import { CompositeParentVoutLayout } from './compositeParentBuilder'

// ============================================================================
// 分片执行相关类型
// ============================================================================

/**
 * 单个分片执行配置
 */
export interface SliceExecutionConfig {
  /** 分片索引 */
  sliceIndex: number
  /** 复合父交易ID */
  compositeParentTxId: string
  /** 该分片在父交易中的vout索引 */
  parentVoutIndex: number
  /** 该分片的中继钱包信息 */
  relayWallet: RelayWalletInfo
  /** 主钱包（用于构建钱包组合） */
  mainWallet: MultiRelayWalletSystem['mainWallet']
  /** 合约标识 */
  contractId: AlkaneContractId
  /** 分片费用计算 */
  feeCalculation: SliceFeeCalculation
  /** 最终接收地址 */
  finalReceiverAddress: string
  /** 网络提供者 */
  provider: Provider
  /** 广播配置 */
  broadcastConfig: any
}

/**
 * 分片执行结果
 */
export interface SliceExecutionResult {
  /** 分片索引 */
  sliceIndex: number
  /** 执行是否成功 */
  success: boolean
  /** 开始时间 */
  startTime: number
  /** 结束时间 */
  endTime: number
  /** 执行时长 (毫秒) */
  duration: number
  /** 完成的子交易列表 */
  childTransactions: BuiltTransaction[]
  /** 铸造的token数量 */
  mintedTokens: number
  /** 最终输出金额 */
  finalOutputAmount: number
  /** 错误信息 */
  error?: {
    phase: 'preparation' | 'execution' | 'completion'
    message: string
    details?: any
  }
}

/**
 * 分片进度回调函数
 */
export type SliceProgressCallback = (progress: {
  sliceIndex: number
  currentStep: number
  totalSteps: number
  currentTxId?: string
  message: string
}) => void

// ============================================================================
// 主要功能函数
// ============================================================================

/**
 * 执行单个分片的完整子交易链
 * 
 * 100% 复用executeChildTransactionChainWithTracking的核心逻辑
 * 扩展支持复合父交易的多输出结构
 */
export async function executeSlice(
  config: SliceExecutionConfig,
  onProgress?: SliceProgressCallback
): Promise<SliceExecutionResult> {
  
  const { 
    sliceIndex, 
    compositeParentTxId, 
    parentVoutIndex,
    relayWallet, 
    mainWallet,
    contractId, 
    feeCalculation, 
    finalReceiverAddress, 
    provider, 
    broadcastConfig 
  } = config
  
  const startTime = Date.now()
  
  try {
    console.log(`🔗 执行分片 ${sliceIndex}: ${feeCalculation.mintCount} tokens`)
    console.log(`   父交易: ${compositeParentTxId.substring(0,8)}...:${parentVoutIndex}`)
    console.log(`   中继地址: ${relayWallet.address}`)
    console.log(`   费率: ${feeCalculation.feeRate} sat/vB ${feeCalculation.isCpfpSlice ? '(CPFP加速)' : ''}`)
    
    // 1. 构建钱包组合 (复用现有ChainMintingWallets格式)
    const wallets: ChainMintingWallets = {
      mainWallet,
      relayWallet: relayWallet.wallet
    }
    
    // 2. 获取初始参数
    // 修复：使用feeDetails.childCount（实际子交易数量）而不是mintCount（tokens数量）
    const childCount = feeCalculation.feeDetails.childCount
    const childTxFee = feeCalculation.feeDetails.childTx.totalFee
    const initialRelayAmount = feeCalculation.feeDetails.relayFuelAmount
    
    onProgress?.({
      sliceIndex,
      currentStep: 0,
      totalSteps: childCount,
      message: `准备执行 ${childCount} 笔子交易`
    })
    
    // 3. 执行子交易链 (100%复用现有逻辑)
    const childTransactions = await executeChildTransactionChainWithTracking({
      parentTxId: compositeParentTxId,
      parentVoutIndex, // 新增: 指定父交易的vout索引
      initialRelayAmount,
      wallets,
      contractId,
      childCount,
      childTxFee,
      finalReceiverAddress,
      provider,
      broadcastConfig,
      sliceIndex, // 新增: 传入分片索引用于日志
      onProgress: (step: number, txId: string, message: string) => {
        onProgress?.({
          sliceIndex,
          currentStep: step,
          totalSteps: childCount,
          currentTxId: txId,
          message
        })
      }
    })
    
    const endTime = Date.now()
    const finalTransaction = childTransactions[childTransactions.length - 1]
    
    console.log(`✅ 分片 ${sliceIndex} 执行完成`)
    console.log(`   完成交易: ${childTransactions.length} 笔`)
    console.log(`   铸造tokens: ${feeCalculation.mintCount}`)
    console.log(`   最终输出: ${finalTransaction?.outputValue || 0} sats`)
    console.log(`   耗时: ${((endTime - startTime) / 1000).toFixed(1)} 秒`)
    
    return {
      sliceIndex,
      success: true,
      startTime,
      endTime,
      duration: endTime - startTime,
      childTransactions,
      mintedTokens: feeCalculation.mintCount,
      finalOutputAmount: finalTransaction?.outputValue || 0
    }
    
  } catch (error) {
    const endTime = Date.now()
    
    console.error(`💥 分片 ${sliceIndex} 执行失败: ${error.message}`)
    
    return {
      sliceIndex,
      success: false,
      startTime,
      endTime,
      duration: endTime - startTime,
      childTransactions: [],
      mintedTokens: 0,
      finalOutputAmount: 0,
      error: {
        phase: 'execution',
        message: error.message,
        details: error
      }
    }
  }
}

/**
 * 执行子交易链并实时更新进度 (100%复用现有逻辑)
 * 
 * 这是对原始executeChildTransactionChainWithTracking函数的轻微扩展
 * 增加了对复合父交易vout索引的支持
 */
async function executeChildTransactionChainWithTracking({
  parentTxId,
  parentVoutIndex = 0, // 新增: 父交易vout索引 (默认0保持向后兼容)
  initialRelayAmount,
  wallets,
  contractId,
  childCount,
  childTxFee,
  finalReceiverAddress,
  provider,
  broadcastConfig,
  sliceIndex,
  onProgress
}: {
  parentTxId: string
  parentVoutIndex?: number
  initialRelayAmount: number
  wallets: ChainMintingWallets
  contractId: AlkaneContractId
  childCount: number
  childTxFee: number
  finalReceiverAddress: string
  provider: Provider
  broadcastConfig: any
  sliceIndex?: number
  onProgress?: (step: number, txId: string, message: string) => void
}): Promise<BuiltTransaction[]> {
  
  const completedTxs: BuiltTransaction[] = []
  let currentTxId = parentTxId
  let currentOutputValue = initialRelayAmount
  // let currentVoutIndex = parentVoutIndex // 追踪当前使用的vout索引（暂时未使用）
  
  for (let i = 1; i <= childCount; i++) {
    const isLastTransaction = (i === childCount)
    
    const slicePrefix = sliceIndex !== undefined ? `分片${sliceIndex} ` : ''
    console.log(`📦 ${slicePrefix}构建子交易 ${i}/${childCount}${isLastTransaction ? ' (最后)' : ''}`)
    
    onProgress?.(i, currentTxId, `构建子交易 ${i}/${childCount}`)
    
    try {
      // 构建子交易 (100%复用现有逻辑)
      const childTx = await buildChildTransaction({
        parentTxId: currentTxId,
        parentVoutIndex: i === 1 ? parentVoutIndex : 0, // 第一笔使用指定vout，后续使用0
        parentOutputValue: currentOutputValue,
        transactionIndex: i,
        isLastTransaction,
        finalReceiverAddress,
        wallets,
        contractId,
        childTxFee,
        provider
      })
      
      // 广播子交易 (100%复用现有逻辑，支持自定义RPC)
      const useCustomRpc = process.env.RPC_PROVIDER && process.env.RPC_PROVIDER !== 'sandshrew'
      console.log(`📡 ${slicePrefix}广播子交易 ${i}: ${childTx.expectedTxId.substring(0,8)}... (${useCustomRpc ? process.env.RPC_PROVIDER : 'Provider'})`)
      
      let broadcastResult
      if (useCustomRpc) {
        broadcastResult = await broadcastSingleTransactionWithRpc(
          childTx.psbtHex,
          childTx.expectedTxId,
          undefined, // 使用默认的RPC客户端
          provider.networkType,
          broadcastConfig
        )
      } else {
        broadcastResult = await broadcastSingleTransaction(
          childTx.psbtHex,
          childTx.expectedTxId,
          provider,
          broadcastConfig
        )
      }
      
      if (!broadcastResult.success) {
        throw new ChainMintingError(
          ChainMintingErrorType.BROADCAST_ERROR,
          `${slicePrefix}子交易 ${i} 广播失败: ${broadcastResult.error}`,
          { sliceIndex, transactionIndex: i, txId: childTx.expectedTxId, error: broadcastResult.error }
        )
      }
      
      completedTxs.push({
        ...childTx,
        index: i,
        isLast: isLastTransaction
      } as BuiltTransaction)
      
      console.log(`✅ ${slicePrefix}子交易 ${i} 完成: ${childTx.expectedTxId}`)
      
      onProgress?.(i, childTx.expectedTxId, `子交易 ${i} 广播成功`)
      
      // 移除基于输出金额的提前结束逻辑，依赖childCount控制循环
      
      // 为下一笔交易准备
      currentTxId = childTx.expectedTxId
      currentOutputValue = childTx.outputValue
      // currentVoutIndex = 0 // 子交易总是使用vout=0作为输入（暂时未使用）
      
      // 短暂延迟避免网络拥堵 (复用现有逻辑)
      if (!isLastTransaction) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
    } catch (error) {
      console.error(`💥 ${slicePrefix}子交易 ${i} 失败: ${error.message}`)
      throw error instanceof ChainMintingError ? error : new ChainMintingError(
        ChainMintingErrorType.TRANSACTION_BUILD_ERROR,
        `${slicePrefix}子交易 ${i} 执行失败: ${error.message}`,
        { sliceIndex, transactionIndex: i, error: error.message }
      )
    }
  }
  
  return completedTxs
}

// ============================================================================
// 分片执行验证和分析
// ============================================================================

/**
 * 验证分片执行配置
 */
export function validateSliceExecutionConfig(config: SliceExecutionConfig): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []
  
  // 验证分片索引
  if (config.sliceIndex < 0) {
    errors.push(`分片索引无效: ${config.sliceIndex}`)
  }
  
  // 验证父交易ID
  if (!config.compositeParentTxId || config.compositeParentTxId.length !== 64) {
    errors.push(`复合父交易ID格式无效: ${config.compositeParentTxId}`)
  }
  
  // 验证vout索引
  if (config.parentVoutIndex < 0) {
    errors.push(`父交易vout索引无效: ${config.parentVoutIndex}`)
  }
  
  // 验证中继钱包
  if (!config.relayWallet.address) {
    errors.push('中继钱包地址未设置')
  }
  if (config.relayWallet.sliceIndex !== config.sliceIndex) {
    errors.push(`中继钱包分片索引不匹配: 期望${config.sliceIndex}, 实际${config.relayWallet.sliceIndex}`)
  }
  
  // 验证费用计算
  if (config.feeCalculation.mintCount <= 0 || config.feeCalculation.mintCount > 25) {
    errors.push(`分片铸造数量超出范围: ${config.feeCalculation.mintCount} (允许: 1-25)`)
  }
  if (config.feeCalculation.feeDetails.relayFuelAmount <= 0) {
    errors.push(`中继燃料金额无效: ${config.feeCalculation.feeDetails.relayFuelAmount}`)
  }
  
  // 验证合约ID
  if (!config.contractId.block || !config.contractId.tx) {
    errors.push('合约ID不完整')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * 分析分片执行结果
 */
export function analyzeSliceExecutionResult(result: SliceExecutionResult): {
  efficiency: {
    successRate: number
    timePerToken: number
    avgTransactionTime: number
  }
  performance: {
    totalDuration: number
    transactionCount: number
    effectiveTokens: number
    feeEfficiency: number
  }
  summary: string
} {
  
  const successRate = result.success ? 1.0 : 0.0
  const timePerToken = result.mintedTokens > 0 ? result.duration / result.mintedTokens : 0
  const avgTransactionTime = result.childTransactions.length > 0 ? 
    result.duration / result.childTransactions.length : 0
  
  const efficiency = {
    successRate,
    timePerToken: Math.round(timePerToken),
    avgTransactionTime: Math.round(avgTransactionTime)
  }
  
  const performance = {
    totalDuration: result.duration,
    transactionCount: result.childTransactions.length,
    effectiveTokens: result.mintedTokens,
    feeEfficiency: result.mintedTokens > 0 ? result.finalOutputAmount / result.mintedTokens : 0
  }
  
  const durationSeconds = (result.duration / 1000).toFixed(1)
  const summary = result.success ? 
    `分片${result.sliceIndex}: ✅ ${result.mintedTokens} tokens, ${result.childTransactions.length} txs, ${durationSeconds}s` :
    `分片${result.sliceIndex}: ❌ 失败 (${result.error?.message})`
  
  return {
    efficiency,
    performance,
    summary
  }
}

/**
 * 格式化分片执行结果
 */
export function formatSliceExecutionResult(result: SliceExecutionResult): string {
  const analysis = analyzeSliceExecutionResult(result)
  
  if (!result.success) {
    return `
❌ 分片 ${result.sliceIndex} 执行失败:
├─ 错误阶段: ${result.error?.phase}
├─ 错误信息: ${result.error?.message}
├─ 执行时长: ${(result.duration / 1000).toFixed(1)} 秒
└─ 完成交易: ${result.childTransactions.length} 笔
`
  }
  
  return `
✅ 分片 ${result.sliceIndex} 执行成功:
├─ 铸造tokens: ${result.mintedTokens}
├─ 完成交易: ${result.childTransactions.length} 笔
├─ 最终输出: ${result.finalOutputAmount} sats
├─ 执行时长: ${(result.duration / 1000).toFixed(1)} 秒
├─ 平均速度: ${analysis.efficiency.timePerToken}ms/token
└─ 交易速度: ${analysis.efficiency.avgTransactionTime}ms/tx
`
}

// ============================================================================
// 导出
// ============================================================================

