/**
 * Project Supercluster - 并行协调器
 * 
 * 核心协调器，集成所有Phase 1组件实现完整的并行链式铸造流程
 * CPFP第一批 + 等待确认 + 并行执行
 */

import * as bitcoin from 'bitcoinjs-lib'
import { Provider } from '../provider/provider'
import { FormattedUtxo } from '../utxo/types'
import { 
  AlkaneContractId,
  ChainMintingError,
  ChainMintingErrorType,
  BuiltTransaction
} from './chainMinting'
import { 
  MultiRelayWalletSystem,
  generateMultiRelayWallets,
  validateMultiRelayWalletSystem,
  displayWalletSystemInfo
} from './multiRelayWalletManager'
import { 
  ParallelFeeCalculation,
  ParallelFeeRateConfig,
  calculateParallelFees,
  generateDynamicParallelFeeRates,
  formatParallelFeeCalculation
} from './parallelFeeCalculator'
import { 
  buildSignAndBroadcastCompositeParentTransaction,
  CompositeParentVoutLayout,
  validateCompositeParentTransactionParams,
  formatCompositeParentTransactionResult
} from './compositeParentBuilder'
import { 
  executeSlice,
  SliceExecutionResult,
  SliceProgressCallback,
  validateSliceExecutionConfig,
  formatSliceExecutionResult
} from './sliceExecutor'
import { waitForTransactionAcceptance } from './transactionBroadcaster'

// ============================================================================
// 并行协调器类型定义
// ============================================================================

/**
 * 并行铸造执行配置
 */
export interface ParallelMintingConfig {
  /** 合约标识 */
  contractId: AlkaneContractId
  /** 总铸造数量 */
  totalMints: number
  /** 最终接收地址 */
  finalReceiverAddress: string
  /** 网络类型 */
  network: bitcoin.Network
  /** 费率配置 */
  feeRateConfig?: ParallelFeeRateConfig
  /** 费率紧急程度 (用于动态费率) */
  urgencyLevel?: 'low' | 'medium' | 'high'
  /** 主钱包UTXO */
  utxos: FormattedUtxo[]
  /** 网络提供者 */
  provider: Provider
  /** 广播配置 */
  broadcastConfig?: any
  /** 是否并行执行 (默认true) */
  enableParallelExecution?: boolean
  /** 最大并发分片数 (默认6) */
  maxConcurrentSlices?: number
  /** CPFP确认超时时间 (毫秒, 默认600000=10分钟) */
  cpfpConfirmationTimeout?: number
}

/**
 * 并行铸造执行结果
 */
export interface ParallelMintingResult {
  /** 执行是否成功 */
  success: boolean
  /** 开始时间 */
  startTime: number
  /** 结束时间 */
  endTime: number
  /** 总执行时长 */
  totalDuration: number
  
  /** 钱包系统 */
  walletSystem: MultiRelayWalletSystem
  /** 费用计算 */
  feeCalculation: ParallelFeeCalculation
  /** 复合父交易 */
  compositeParentTx: {
    transaction: BuiltTransaction
    voutLayout: CompositeParentVoutLayout
  }
  /** 分片执行结果 */
  sliceResults: SliceExecutionResult[]
  
  /** 执行统计 */
  statistics: {
    totalSlices: number
    successfulSlices: number
    failedSlices: number
    totalTransactions: number
    totalTokensMinted: number
    totalFeesPaid: number
    averageSliceTime: number
    parallelEfficiency: number
  }
  
  /** 错误信息 */
  error?: {
    phase: 'preparation' | 'parent_tx' | 'cpfp_wait' | 'parallel_execution' | 'completion'
    message: string
    details?: any
  }
}

/**
 * 并行进度回调
 */
export type ParallelProgressCallback = (progress: {
  phase: 'preparation' | 'parent_tx' | 'cpfp_wait' | 'parallel_execution' | 'completion'
  overallProgress: number // 0-100
  message: string
  sliceProgress?: {
    completedSlices: number
    totalSlices: number
    currentlyExecuting: number[]
  }
  sliceDetails?: {
    sliceIndex: number
    currentStep: number
    totalSteps: number
    message: string
  }
}) => void

// ============================================================================
// 主要功能函数
// ============================================================================

/**
 * 执行完整的Project Supercluster并行铸造流程
 * 
 * 完整流程：
 * 1. 生成多中继钱包系统
 * 2. 计算并行费用需求
 * 3. 构建并广播复合父交易
 * 4. 等待CPFP分片确认 (可选)
 * 5. 并行执行所有分片
 * 6. 汇总结果和统计
 */
export async function executeParallelChainMinting(
  config: ParallelMintingConfig,
  onProgress?: ParallelProgressCallback
): Promise<ParallelMintingResult> {
  
  const startTime = Date.now()
  
  try {
    console.log(`🚀 PROJECT SUPERCLUSTER 并行铸造启动`)
    console.log(`   目标合约: ${config.contractId.block}:${config.contractId.tx}`)
    console.log(`   总铸造量: ${config.totalMints} tokens`)
    console.log(`   接收地址: ${config.finalReceiverAddress}`)
    
    onProgress?.({
      phase: 'preparation',
      overallProgress: 0,
      message: 'PROJECT SUPERCLUSTER 初始化...'
    })
    
    // Phase 1: 生成钱包系统
    console.log(`\n📦 Phase 1: 生成多中继钱包系统`)
    const walletSystem = await generateMultiRelayWallets(
      config.network,
      config.totalMints
    )
    
    displayWalletSystemInfo(walletSystem)
    
    const walletValidation = validateMultiRelayWalletSystem(walletSystem)
    if (!walletValidation.isValid) {
      throw new ChainMintingError(
        ChainMintingErrorType.INVALID_ADDRESS_TYPE,
        `钱包系统验证失败: ${walletValidation.errors.join(', ')}`,
        walletValidation
      )
    }
    
    onProgress?.({
      phase: 'preparation',
      overallProgress: 10,
      message: `生成 ${walletSystem.totalSlices} 个中继钱包`
    })
    
    // Phase 2: 计算并行费用
    console.log(`\n📦 Phase 2: 计算并行费用需求`)
    
    let feeRateConfig = config.feeRateConfig
    if (!feeRateConfig) {
      feeRateConfig = await generateDynamicParallelFeeRates(
        config.provider,
        config.urgencyLevel || 'medium'
      )
      console.log(`   动态费率: 标准=${feeRateConfig.standardFeeRate}, CPFP=${feeRateConfig.cpfpFeeRate} sat/vB`)
    }
    
    const feeCalculation = await calculateParallelFees({
      walletSystem,
      contractId: config.contractId,
      totalMints: config.totalMints,
      feeRateConfig,
      provider: config.provider
    })
    
    console.log(formatParallelFeeCalculation(feeCalculation))
    
    onProgress?.({
      phase: 'preparation',
      overallProgress: 20,
      message: `并行费用计算完成: ${feeCalculation.summary.totalRequiredFunding} sats`
    })
    
    // Phase 3: 构建并广播复合父交易
    console.log(`\n📦 Phase 3: 构建并广播复合父交易`)
    
    const compositeParentConfig = {
      walletSystem,
      contractId: config.contractId,
      parallelFeeCalculation: feeCalculation,
      provider: config.provider,
      utxos: config.utxos,
      broadcastConfig: config.broadcastConfig || {}
    }
    
    const configValidation = validateCompositeParentTransactionParams(compositeParentConfig)
    if (!configValidation.isValid) {
      throw new ChainMintingError(
        ChainMintingErrorType.INVALID_ADDRESS_TYPE,
        `复合父交易配置无效: ${configValidation.errors.join(', ')}`,
        configValidation
      )
    }
    
    const compositeParentResult = await buildSignAndBroadcastCompositeParentTransaction(compositeParentConfig)
    
    console.log(formatCompositeParentTransactionResult(
      compositeParentResult.transaction,
      compositeParentResult.voutLayout
    ))
    
    onProgress?.({
      phase: 'parent_tx',
      overallProgress: 40,
      message: `复合父交易广播成功: ${compositeParentResult.transaction.expectedTxId.substring(0,8)}...`
    })
    
    // Phase 4: 等待CPFP分片确认 (可选)
    const cpfpSlice = feeCalculation.sliceCalculations.find(s => s.isCpfpSlice)
    if (cpfpSlice && config.cpfpConfirmationTimeout && config.cpfpConfirmationTimeout > 0) {
      console.log(`\n📦 Phase 4: 等待CPFP分片确认`)
      console.log(`   CPFP费率: ${cpfpSlice.feeRate} sat/vB`)
      console.log(`   确认超时: ${config.cpfpConfirmationTimeout / 1000} 秒`)
      
      onProgress?.({
        phase: 'cpfp_wait',
        overallProgress: 50,
        message: `等待CPFP加速确认 (${cpfpSlice.feeRate} sat/vB)`
      })
      
      try {
        await waitForTransactionAcceptance(
          compositeParentResult.transaction.expectedTxId,
          config.provider,
          config.cpfpConfirmationTimeout
        )
        console.log(`✅ CPFP分片确认成功`)
      } catch (error) {
        console.warn(`⚠️  CPFP分片确认超时，继续执行: ${error.message}`)
      }
    }
    
    // Phase 5: 并行执行所有分片
    console.log(`\n📦 Phase 5: 并行执行分片`)
    console.log(`   并行模式: ${config.enableParallelExecution !== false ? '启用' : '禁用'}`)
    console.log(`   最大并发: ${config.maxConcurrentSlices || 6} 个分片`)
    
    const sliceResults = await executeAllSlicesInParallel({
      walletSystem,
      feeCalculation,
      compositeParentTx: compositeParentResult.transaction,
      voutLayout: compositeParentResult.voutLayout,
      contractId: config.contractId,
      finalReceiverAddress: config.finalReceiverAddress,
      provider: config.provider,
      broadcastConfig: config.broadcastConfig || {},
      enableParallel: config.enableParallelExecution !== false,
      maxConcurrent: config.maxConcurrentSlices || 6,
      onProgress: (sliceIndex, progress) => {
        onProgress?.({
          phase: 'parallel_execution',
          overallProgress: 60 + (progress.currentStep / progress.totalSteps) * 30,
          message: `执行分片 ${sliceIndex}`,
          sliceDetails: {
            sliceIndex,
            currentStep: progress.currentStep,
            totalSteps: progress.totalSteps,
            message: progress.message
          }
        })
      }
    })
    
    // Phase 6: 汇总结果
    console.log(`\n📦 Phase 6: 汇总执行结果`)
    
    const endTime = Date.now()
    const statistics = calculateParallelStatistics(sliceResults, startTime, endTime)
    
    onProgress?.({
      phase: 'completion',
      overallProgress: 100,
      message: `并行铸造完成: ${statistics.totalTokensMinted} tokens`
    })
    
    const result: ParallelMintingResult = {
      success: true,
      startTime,
      endTime,
      totalDuration: endTime - startTime,
      walletSystem,
      feeCalculation,
      compositeParentTx: compositeParentResult,
      sliceResults,
      statistics
    }
    
    console.log(`\n🎉 PROJECT SUPERCLUSTER 完成！`)
    console.log(`   总耗时: ${(result.totalDuration / 1000).toFixed(1)} 秒`)
    console.log(`   成功分片: ${statistics.successfulSlices}/${statistics.totalSlices}`)
    console.log(`   铸造tokens: ${statistics.totalTokensMinted}`)
    console.log(`   并行效率: ${(statistics.parallelEfficiency * 100).toFixed(1)}%`)
    
    return result
    
  } catch (error) {
    const endTime = Date.now()
    
    console.error(`💥 PROJECT SUPERCLUSTER 失败: ${error.message}`)
    
    return {
      success: false,
      startTime,
      endTime,
      totalDuration: endTime - startTime,
      walletSystem: {} as MultiRelayWalletSystem,
      feeCalculation: {} as ParallelFeeCalculation,
      compositeParentTx: {
        transaction: {} as BuiltTransaction,
        voutLayout: {} as CompositeParentVoutLayout
      },
      sliceResults: [],
      statistics: {
        totalSlices: 0,
        successfulSlices: 0,
        failedSlices: 0,
        totalTransactions: 0,
        totalTokensMinted: 0,
        totalFeesPaid: 0,
        averageSliceTime: 0,
        parallelEfficiency: 0
      },
      error: {
        phase: 'preparation',
        message: error.message,
        details: error
      }
    }
  }
}

/**
 * 并行执行所有分片
 */
async function executeAllSlicesInParallel({
  walletSystem,
  feeCalculation,
  compositeParentTx,
  voutLayout,
  contractId,
  finalReceiverAddress,
  provider,
  broadcastConfig,
  enableParallel = true,
  maxConcurrent = 6,
  onProgress
}: {
  walletSystem: MultiRelayWalletSystem
  feeCalculation: ParallelFeeCalculation
  compositeParentTx: BuiltTransaction
  voutLayout: CompositeParentVoutLayout
  contractId: AlkaneContractId
  finalReceiverAddress: string
  provider: Provider
  broadcastConfig: any
  enableParallel?: boolean
  maxConcurrent?: number
  onProgress?: (sliceIndex: number, progress: { currentStep: number, totalSteps: number, message: string }) => void
}): Promise<SliceExecutionResult[]> {
  
  const sliceConfigs = feeCalculation.sliceCalculations.map((sliceCalc, index) => {
    const relayWallet = walletSystem.relayWallets[index]
    const sliceOutput = voutLayout.sliceOutputs[index]
    
    const config = {
      sliceIndex: sliceCalc.sliceIndex,
      compositeParentTxId: compositeParentTx.expectedTxId,
      parentVoutIndex: sliceOutput.voutIndex,
      relayWallet,
      mainWallet: walletSystem.mainWallet,
      contractId,
      feeCalculation: sliceCalc,
      finalReceiverAddress,
      provider,
      broadcastConfig
    }
    
    // 验证分片配置
    const validation = validateSliceExecutionConfig(config)
    if (!validation.isValid) {
      throw new ChainMintingError(
        ChainMintingErrorType.INVALID_ADDRESS_TYPE,
        `分片 ${sliceCalc.sliceIndex} 配置无效: ${validation.errors.join(', ')}`,
        validation
      )
    }
    
    return config
  })
  
  if (!enableParallel) {
    // 串行执行模式
    console.log(`   执行模式: 串行`)
    
    const results: SliceExecutionResult[] = []
    for (const config of sliceConfigs) {
      const result = await executeSlice(config, (progress) => {
        onProgress?.(config.sliceIndex, progress)
      })
      results.push(result)
      
      console.log(formatSliceExecutionResult(result))
    }
    
    return results
  } else {
    // 并行执行模式
    console.log(`   执行模式: 并行 (最大并发: ${maxConcurrent})`)
    
    const executeSliceWithProgress = async (config: any) => {
      return executeSlice(config, (progress) => {
        onProgress?.(config.sliceIndex, progress)
      })
    }
    
    // 控制并发执行
    const results: SliceExecutionResult[] = []
    const executing: Promise<SliceExecutionResult>[] = []
    
    for (let i = 0; i < sliceConfigs.length; i++) {
      const config = sliceConfigs[i]
      
      // 启动分片执行
      const slicePromise = executeSliceWithProgress(config)
      executing.push(slicePromise)
      
      // 控制并发数量
      if (executing.length >= maxConcurrent || i === sliceConfigs.length - 1) {
        const batchResults = await Promise.allSettled(executing)
        
        // 处理批次结果
        for (const batchResult of batchResults) {
          if (batchResult.status === 'fulfilled') {
            results.push(batchResult.value)
            console.log(formatSliceExecutionResult(batchResult.value))
          } else {
            console.error(`💥 分片执行失败: ${batchResult.reason}`)
            // 创建失败结果
            results.push({
              sliceIndex: -1,
              success: false,
              startTime: Date.now(),
              endTime: Date.now(),
              duration: 0,
              childTransactions: [],
              mintedTokens: 0,
              finalOutputAmount: 0,
              error: {
                phase: 'execution',
                message: batchResult.reason?.message || 'Unknown error'
              }
            })
          }
        }
        
        // 清空执行队列
        executing.length = 0
      }
    }
    
    return results
  }
}

/**
 * 计算并行执行统计
 */
function calculateParallelStatistics(
  sliceResults: SliceExecutionResult[],
  startTime: number,
  endTime: number
): ParallelMintingResult['statistics'] {
  
  const totalSlices = sliceResults.length
  const successfulSlices = sliceResults.filter(r => r.success).length
  const failedSlices = totalSlices - successfulSlices
  
  const totalTransactions = sliceResults.reduce((sum, r) => sum + r.childTransactions.length, 0)
  const totalTokensMinted = sliceResults.reduce((sum, r) => sum + r.mintedTokens, 0)
  
  // 估算总费用 (基于成功的分片)
  const successfulResults = sliceResults.filter(r => r.success)
  const totalFeesPaid = successfulResults.reduce((sum, r) => {
    // 估算: 每个交易平均费用 * 交易数量
    return sum + (r.childTransactions.length * 150) // 假设平均150 sats/tx
  }, 0)
  
  const averageSliceTime = successfulResults.length > 0 ? 
    successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length : 0
  
  // 计算并行效率: 如果串行执行需要的时间 vs 实际并行时间
  const totalExecutionTime = endTime - startTime
  const estimatedSerialTime = averageSliceTime * totalSlices
  const parallelEfficiency = estimatedSerialTime > 0 ? 
    Math.min(1.0, estimatedSerialTime / totalExecutionTime) : 0
  
  return {
    totalSlices,
    successfulSlices,
    failedSlices,
    totalTransactions,
    totalTokensMinted,
    totalFeesPaid,
    averageSliceTime: Math.round(averageSliceTime),
    parallelEfficiency
  }
}

// ============================================================================
// 辅助工具函数
// ============================================================================

/**
 * 格式化并行铸造结果
 */
export function formatParallelMintingResult(result: ParallelMintingResult): string {
  
  if (!result.success) {
    return `
❌ PROJECT SUPERCLUSTER 执行失败:
├─ 失败阶段: ${result.error?.phase}
├─ 错误信息: ${result.error?.message}
├─ 执行时长: ${(result.totalDuration / 1000).toFixed(1)} 秒
└─ 状态: 🔴 未完成
`
  }
  
  return `
🎉 PROJECT SUPERCLUSTER 执行成功:
=====================================

📊 执行统计:
├─ 总执行时长: ${(result.totalDuration / 1000).toFixed(1)} 秒
├─ 分片数量: ${result.statistics.totalSlices}
├─ 成功分片: ${result.statistics.successfulSlices}
├─ 失败分片: ${result.statistics.failedSlices}
├─ 总交易数: ${result.statistics.totalTransactions}
├─ 铸造tokens: ${result.statistics.totalTokensMinted}
├─ 总费用: ${result.statistics.totalFeesPaid} sats
├─ 平均分片时间: ${(result.statistics.averageSliceTime / 1000).toFixed(1)} 秒
└─ 并行效率: ${(result.statistics.parallelEfficiency * 100).toFixed(1)}%

🏗️  复合父交易:
├─ 交易ID: ${result.compositeParentTx.transaction.expectedTxId}
├─ 分片输出: ${result.compositeParentTx.voutLayout.sliceOutputs.length} 个
└─ 总输出金额: ${result.compositeParentTx.transaction.outputValue} sats

🔗 分片执行结果:
${result.sliceResults.map(slice => {
  const status = slice.success ? '✅' : '❌'
  const duration = (slice.duration / 1000).toFixed(1)
  return `├─ 分片${slice.sliceIndex}: ${status} ${slice.mintedTokens} tokens, ${slice.childTransactions.length} txs, ${duration}s`
}).join('\n')}

🎯 最终状态: 🟢 完成
`
}

/**
 * 验证并行铸造配置
 */
export function validateParallelMintingConfig(config: ParallelMintingConfig): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []
  
  // 验证基本参数
  if (config.totalMints < 1 || config.totalMints > 2500) {
    errors.push(`总铸造数量超出范围: ${config.totalMints} (允许: 1-2500)`)
  }
  
  if (!config.contractId.block || !config.contractId.tx) {
    errors.push('合约ID不完整')
  }
  
  if (!config.finalReceiverAddress) {
    errors.push('最终接收地址未设置')
  }
  
  if (!config.utxos || config.utxos.length === 0) {
    errors.push('没有可用的UTXO')
  }
  
  // 验证费率配置
  if (config.feeRateConfig) {
    if (config.feeRateConfig.standardFeeRate <= 0) {
      errors.push('标准费率必须大于0')
    }
    if (config.feeRateConfig.cpfpFeeRate < config.feeRateConfig.standardFeeRate) {
      errors.push('CPFP费率不能低于标准费率')
    }
  }
  
  // 验证并发参数
  if (config.maxConcurrentSlices && (config.maxConcurrentSlices < 1 || config.maxConcurrentSlices > 20)) {
    errors.push(`最大并发分片数超出范围: ${config.maxConcurrentSlices} (允许: 1-20)`)
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

// ============================================================================
// 导出
// ============================================================================

