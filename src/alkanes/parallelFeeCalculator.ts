/**
 * Project Supercluster - 并行费用计算器
 * 
 * 基于现有feeCalculation.ts的扩展，实现多分片并行费用计算
 * 100% 复用现有的HARDCODED_TRANSACTION_SIZES和performDryRunFeeCalculation逻辑
 */

import * as bitcoin from 'bitcoinjs-lib'
import { Provider } from '../provider/provider'
import { FormattedUtxo } from '../utxo/types'
import { 
  ChainMintingFeeCalculation,
  AlkaneContractId,
  SAFETY_PARAMS,
  ChainMintingError,
  ChainMintingErrorType,
  TransactionFeeAnalysis
} from './chainMinting'
import { 
  performDryRunFeeCalculation,
  HARDCODED_TRANSACTION_SIZES 
} from './feeCalculation'
import { MultiRelayWalletSystem } from './multiRelayWalletManager'

// ============================================================================
// 并行费用计算相关类型
// ============================================================================

/**
 * 单个分片的费用计算结果
 */
export interface SliceFeeCalculation {
  /** 分片索引 */
  sliceIndex: number
  /** 分片内的铸造数量 */
  mintCount: number
  /** 使用的费率 */
  feeRate: number
  /** 是否为CPFP加速分片 */
  isCpfpSlice: boolean
  /** 分片费用详情 (复用现有结构) */
  feeDetails: ChainMintingFeeCalculation
}

/**
 * 复合父交易费用分析
 */
export interface CompositeParentFeeAnalysis {
  /** 交易虚拟大小 */
  vSize: number
  /** 基础费用 */
  baseFee: number
  /** 总费用 */
  totalFee: number
  /** 费率 */
  feeRate: number
  /** 输出数量 (分片数量 + OP_RETURN + 找零) */
  outputCount: number
  /** 分片输出总金额 */
  totalSliceOutputValue: number
}

/**
 * 并行费用计算结果
 */
export interface ParallelFeeCalculation {
  /** 复合父交易费用分析 */
  compositeParentTx: CompositeParentFeeAnalysis
  /** 各分片费用计算列表 */
  sliceCalculations: SliceFeeCalculation[]
  /** 总分片数量 */
  totalSlices: number
  /** 总铸造数量 */
  totalMints: number
  /** 总体统计 */
  summary: {
    totalParentFee: number
    totalChildFees: number
    totalNetworkFees: number
    totalRequiredFunding: number
    estimatedTimeMinutes: number
    cpfpPremium: number
  }
}

/**
 * 并行费率配置
 */
export interface ParallelFeeRateConfig {
  /** 标准费率 (sat/vB) */
  standardFeeRate: number
  /** CPFP加速费率 (sat/vB) - 用于第一批 */
  cpfpFeeRate: number
  /** CPFP费率倍数 (默认3倍标准费率) */
  cpfpMultiplier?: number
}

// ============================================================================
// 主要功能函数
// ============================================================================

/**
 * 计算并行费用需求
 * 
 * 基于现有的performDryRunFeeCalculation，扩展支持多分片计算
 */
export async function calculateParallelFees({
  walletSystem,
  contractId,
  totalMints,
  feeRateConfig,
  provider
}: {
  walletSystem: MultiRelayWalletSystem
  contractId: AlkaneContractId
  totalMints: number
  feeRateConfig: ParallelFeeRateConfig
  provider: Provider
}): Promise<ParallelFeeCalculation> {
  
  try {
    console.log(`🧮 Project Supercluster 并行费用计算`)
    console.log(`   总铸造数量: ${totalMints}`)
    console.log(`   分片数量: ${walletSystem.totalSlices}`)
    console.log(`   标准费率: ${feeRateConfig.standardFeeRate} sat/vB`)
    console.log(`   CPFP费率: ${feeRateConfig.cpfpFeeRate} sat/vB`)
    
    validateParallelFeeParams(totalMints, feeRateConfig, walletSystem.totalSlices)
    
    // 1. 计算复合父交易费用
    const compositeParentFee = calculateCompositeParentFee(
      walletSystem.totalSlices, 
      feeRateConfig.standardFeeRate
    )
    
    // 2. 计算各分片费用 (复用现有的performDryRunFeeCalculation)
    const sliceCalculations: SliceFeeCalculation[] = []
    
    for (let sliceIndex = 0; sliceIndex < walletSystem.totalSlices; sliceIndex++) {
      // 计算该分片的铸造数量
      const mintCount = calculateSliceMintCount(totalMints, sliceIndex, walletSystem.totalSlices)
      
      // 确定费率 (第一片使用CPFP加速)
      const isCpfpSlice = sliceIndex === 0
      const feeRate = isCpfpSlice ? feeRateConfig.cpfpFeeRate : feeRateConfig.standardFeeRate
      
      console.log(`   🧮 分片 ${sliceIndex}: ${mintCount} tokens, ${feeRate} sat/vB`)
      
      // 使用现有的费用计算逻辑 (传入dummy钱包用于API兼容性)
      const dummyWallets = {
        mainWallet: walletSystem.mainWallet,
        relayWallet: walletSystem.relayWallets[sliceIndex].wallet
      }
      
      const sliceFeeDetails = await performDryRunFeeCalculation({
        wallets: dummyWallets,
        contractId,
        childCount: mintCount, // 每个分片最多25个mint
        feeRate,
        provider
      })
      
      sliceCalculations.push({
        sliceIndex,
        mintCount,
        feeRate,
        isCpfpSlice,
        feeDetails: sliceFeeDetails
      })
      
      console.log(`   ✅ 分片 ${sliceIndex}: ${sliceFeeDetails.totalRequiredFunding} sats`)
    }
    
    // 3. 计算总体统计
    const summary = calculateParallelSummary(compositeParentFee, sliceCalculations, feeRateConfig)
    
    const result: ParallelFeeCalculation = {
      compositeParentTx: compositeParentFee,
      sliceCalculations,
      totalSlices: walletSystem.totalSlices,
      totalMints,
      summary
    }
    
    console.log(`🧮 并行费用计算完成`)
    console.log(`   总父交易费用: ${summary.totalParentFee} sats`)
    console.log(`   总子交易费用: ${summary.totalChildFees} sats`)
    console.log(`   总网络费用: ${summary.totalNetworkFees} sats`)
    console.log(`   总资金需求: ${summary.totalRequiredFunding} sats`)
    console.log(`   预计耗时: ${summary.estimatedTimeMinutes} 分钟`)
    
    return result
    
  } catch (error) {
    console.error(`💥 并行费用计算失败:`, error.message)
    throw new ChainMintingError(
      ChainMintingErrorType.FEE_CALCULATION_ERROR,
      `并行费用计算失败: ${error.message}`,
      { contractId, totalMints, feeRateConfig }
    )
  }
}

/**
 * 计算复合父交易费用
 * 
 * 基于hardcoded的父交易基础大小，考虑多个分片输出
 */
function calculateCompositeParentFee(
  totalSlices: number, 
  feeRate: number
): CompositeParentFeeAnalysis {
  
  // 基础父交易大小 (1个输入 + 1个OP_RETURN + 1个找零)
  const baseTxSize = HARDCODED_TRANSACTION_SIZES.PARENT_TX_VSIZE
  
  // 每个额外的P2WPKH输出增加约31字节
  const additionalOutputSize = (totalSlices - 1) * 31 // 减1因为基础大小已包含1个输出
  
  const totalVSize = baseTxSize + additionalOutputSize
  const totalFee = Math.ceil(totalVSize * feeRate)
  
  return {
    vSize: totalVSize,
    baseFee: totalFee,
    totalFee: totalFee,
    feeRate: feeRate,
    outputCount: totalSlices + 2, // N个分片 + 1个OP_RETURN + 1个找零
    totalSliceOutputValue: 0 // 将在后续步骤中计算
  }
}

/**
 * 计算分片的铸造数量
 */
function calculateSliceMintCount(totalMints: number, sliceIndex: number, totalSlices: number): number {
  const baseMintsPerSlice = Math.floor(totalMints / totalSlices)
  const remainder = totalMints % totalSlices
  
  // 将余数分配给前面的分片
  if (sliceIndex < remainder) {
    return baseMintsPerSlice + 1
  } else {
    return baseMintsPerSlice
  }
}

/**
 * 计算并行执行的总体统计
 */
function calculateParallelSummary(
  compositeParentFee: CompositeParentFeeAnalysis,
  sliceCalculations: SliceFeeCalculation[],
  feeRateConfig: ParallelFeeRateConfig
): ParallelFeeCalculation['summary'] {
  
  const totalParentFee = compositeParentFee.totalFee
  
  const totalChildFees = sliceCalculations.reduce(
    (sum, slice) => sum + slice.feeDetails.totalChildFees, 
    0
  )
  
  const totalNetworkFees = totalParentFee + totalChildFees
  
  // 计算中继燃料总需求 (不包括父交易费用，因为那是从主钱包支付的)
  const totalRequiredFunding = sliceCalculations.reduce(
    (sum, slice) => sum + slice.feeDetails.relayFuelAmount,
    0
  ) + totalParentFee
  
  // 计算CPFP溢价
  const cpfpSlice = sliceCalculations.find(s => s.isCpfpSlice)
  const standardSlice = sliceCalculations.find(s => !s.isCpfpSlice)
  const cpfpPremium = cpfpSlice && standardSlice ? 
    cpfpSlice.feeDetails.totalChildFees - standardSlice.feeDetails.totalChildFees : 0
  
  // 预计执行时间 (CPFP加速 + 并行执行)
  // 假设CPFP确认需要1个区块(10分钟)，并行执行每批需要2分钟
  const estimatedTimeMinutes = 10 + (sliceCalculations.length - 1) * 2
  
  return {
    totalParentFee,
    totalChildFees,
    totalNetworkFees,
    totalRequiredFunding,
    estimatedTimeMinutes,
    cpfpPremium
  }
}

// ============================================================================
// 费率配置生成器
// ============================================================================

/**
 * 生成推荐的并行费率配置
 */
export function generateRecommendedParallelFeeRates(
  baseFeeRate: number,
  cpfpMultiplier: number = 3
): ParallelFeeRateConfig {
  
  const standardFeeRate = Math.max(baseFeeRate, SAFETY_PARAMS.MIN_FEE_RATE)
  const cpfpFeeRate = Math.min(
    standardFeeRate * cpfpMultiplier, 
    SAFETY_PARAMS.MAX_FEE_RATE
  )
  
  return {
    standardFeeRate,
    cpfpFeeRate,
    cpfpMultiplier
  }
}

/**
 * 基于网络状况的动态费率配置
 */
export async function generateDynamicParallelFeeRates(
  provider: Provider,
  urgencyLevel: 'low' | 'medium' | 'high' = 'medium'
): Promise<ParallelFeeRateConfig> {
  
  try {
    const feeEstimates = await provider.esplora.getFeeEstimates()
    
    let baseFeeRate: number
    switch (urgencyLevel) {
      case 'low':
        baseFeeRate = feeEstimates['6'] || feeEstimates['144'] || 1 // 6 blocks or 144 blocks
        break
      case 'high':
        baseFeeRate = feeEstimates['1'] || feeEstimates['3'] || 10 // next block or 3 blocks
        break
      case 'medium':
      default:
        baseFeeRate = feeEstimates['3'] || feeEstimates['6'] || 5 // 3 or 6 blocks
        break
    }
    
    return generateRecommendedParallelFeeRates(baseFeeRate)
    
  } catch (error) {
    console.warn(`⚠️ 无法获取网络费率估算，使用默认配置: ${error.message}`)
    return generateRecommendedParallelFeeRates(10) // 默认10 sat/vB
  }
}

// ============================================================================
// 验证和比较功能
// ============================================================================

/**
 * 验证并行费用计算参数
 */
function validateParallelFeeParams(
  totalMints: number, 
  feeRateConfig: ParallelFeeRateConfig,
  totalSlices: number
): void {
  
  if (totalMints < 1 || totalMints > 2500) {
    throw new ChainMintingError(
      ChainMintingErrorType.FEE_CALCULATION_ERROR,
      `总铸造数量超出范围: ${totalMints} (允许范围: 1-2500)`
    )
  }
  
  if (feeRateConfig.standardFeeRate < SAFETY_PARAMS.MIN_FEE_RATE || 
      feeRateConfig.standardFeeRate > SAFETY_PARAMS.MAX_FEE_RATE) {
    throw new ChainMintingError(
      ChainMintingErrorType.FEE_CALCULATION_ERROR,
      `标准费率超出安全范围: ${feeRateConfig.standardFeeRate}`
    )
  }
  
  if (feeRateConfig.cpfpFeeRate < feeRateConfig.standardFeeRate) {
    throw new ChainMintingError(
      ChainMintingErrorType.FEE_CALCULATION_ERROR,
      `CPFP费率不能低于标准费率: ${feeRateConfig.cpfpFeeRate} < ${feeRateConfig.standardFeeRate}`
    )
  }
  
  if (totalSlices < 1 || totalSlices > 100) {
    throw new ChainMintingError(
      ChainMintingErrorType.FEE_CALCULATION_ERROR,
      `分片数量超出范围: ${totalSlices} (允许范围: 1-100)`
    )
  }
}

/**
 * 比较并行费用与传统串行费用
 */
export function compareParallelVsSerialFees(
  parallelFees: ParallelFeeCalculation,
  serialFeeRate: number
): {
  serialEstimate: {
    totalFees: number
    totalExecutions: number
    estimatedTimeMinutes: number
  }
  parallelAdvantage: {
    feeSaving: number
    timeSaving: number
    feeEfficiency: number
    timeEfficiency: number
  }
} {
  
  // 计算串行执行的估算费用 (每次25个token，需要多次执行)
  const executionsNeeded = Math.ceil(parallelFees.totalMints / 25)
  const singleExecutionFee = 
    Math.ceil(HARDCODED_TRANSACTION_SIZES.PARENT_TX_VSIZE * serialFeeRate) + 
    (24 * Math.ceil(HARDCODED_TRANSACTION_SIZES.CHILD_TX_VSIZE * serialFeeRate)) +
    Math.ceil(HARDCODED_TRANSACTION_SIZES.FINAL_CHILD_TX_VSIZE * serialFeeRate)
  
  const serialTotalFees = singleExecutionFee * executionsNeeded
  const serialTimeMinutes = executionsNeeded * 30 // 假设每次执行需要30分钟
  
  const feeSaving = serialTotalFees - parallelFees.summary.totalNetworkFees
  const timeSaving = serialTimeMinutes - parallelFees.summary.estimatedTimeMinutes
  
  return {
    serialEstimate: {
      totalFees: serialTotalFees,
      totalExecutions: executionsNeeded,
      estimatedTimeMinutes: serialTimeMinutes
    },
    parallelAdvantage: {
      feeSaving,
      timeSaving,
      feeEfficiency: feeSaving / serialTotalFees,
      timeEfficiency: timeSaving / serialTimeMinutes
    }
  }
}

/**
 * 格式化并行费用计算结果
 */
export function formatParallelFeeCalculation(result: ParallelFeeCalculation): string {
  const cpfpSlices = result.sliceCalculations.filter(s => s.isCpfpSlice)
  const standardSlices = result.sliceCalculations.filter(s => !s.isCpfpSlice)
  
  return `
🧮 Project Supercluster 并行费用计算结果:
=====================================

📊 复合父交易:
├─ 交易大小: ${result.compositeParentTx.vSize} vB
├─ 输出数量: ${result.compositeParentTx.outputCount} (${result.totalSlices}个分片 + OP_RETURN + 找零)
├─ 费率: ${result.compositeParentTx.feeRate} sat/vB
└─ 总费用: ${result.compositeParentTx.totalFee} sats

🚀 CPFP加速分片 (${cpfpSlices.length}个):
${cpfpSlices.map(slice => 
  `├─ 分片 ${slice.sliceIndex}: ${slice.mintCount} tokens, ${slice.feeDetails.totalRequiredFunding} sats (${slice.feeRate} sat/vB)`
).join('\n')}

⚡ 标准分片 (${standardSlices.length}个):
${standardSlices.map(slice => 
  `├─ 分片 ${slice.sliceIndex}: ${slice.mintCount} tokens, ${slice.feeDetails.totalRequiredFunding} sats (${slice.feeRate} sat/vB)`
).join('\n')}

💰 费用汇总:
├─ 父交易费用: ${result.summary.totalParentFee} sats
├─ 子交易费用: ${result.summary.totalChildFees} sats
├─ 总网络费用: ${result.summary.totalNetworkFees} sats
├─ 总资金需求: ${result.summary.totalRequiredFunding} sats
├─ CPFP溢价: ${result.summary.cpfpPremium} sats
└─ 预计耗时: ${result.summary.estimatedTimeMinutes} 分钟

📈 性能提升:
├─ 总铸造量: ${result.totalMints} tokens
├─ 并行分片: ${result.totalSlices} 个
└─ 并行效率: ${((result.totalMints / result.totalSlices) / 25 * 100).toFixed(1)}% (相对于串行执行)
`
}

// ============================================================================
// 导出
// ============================================================================

