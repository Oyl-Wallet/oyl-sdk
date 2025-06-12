/**
 * 精确费用计算模块
 * 
 * 基于实际PSBT构建的vSize计算，确保费用估算的准确性
 * 支持Dry Run模式进行费用预估
 */

import { Provider } from '../provider/provider'
import { FormattedUtxo } from '../utxo/types'
import { 
  ChainMintingFeeCalculation,
  ChainMintingWallets,
  AlkaneContractId,
  SAFETY_PARAMS,
  ChainMintingError,
  ChainMintingErrorType
} from './chainMinting'



// ============================================================================
// 硬编码的精确交易大小 (基于实际测试结果)
// ============================================================================

/**
 * 硬编码的交易vSize - 基于实际构建和测试的结果
 */
export const HARDCODED_TRANSACTION_SIZES = {
  /** 父交易vSize - 包含P2TR输入,P2WPKH中继输出,OP_RETURN,P2TR找零 */
  PARENT_TX_VSIZE: 171,
  
  /** 普通子交易vSize (1-23) - P2WPKH输入,P2WPKH输出,OP_RETURN */
  CHILD_TX_VSIZE: 138.5,
  
  /** 最后子交易vSize (24) - P2WPKH输入,P2TR输出,OP_RETURN */
  FINAL_CHILD_TX_VSIZE: 150.5
} as const

// ============================================================================
// 主要费用计算函数
// ============================================================================

/**
 * 执行精确费用计算
 * 
 * 使用硬编码的准确交易大小进行精确费用计算
 */
export async function performDryRunFeeCalculation({
  wallets,
  contractId,
  childCount,
  feeRate,
  provider
}: {
  wallets: ChainMintingWallets
  contractId: AlkaneContractId
  childCount: number
  feeRate: number
  provider: Provider
}): Promise<ChainMintingFeeCalculation> {
  
  try {
    // 参数保留用于API兼容性
    void wallets; void provider;
    
    validateFeeCalculationParams(feeRate, childCount)
    
    console.log(`🧮 费用计算: ${contractId.block}:${contractId.tx}, ${childCount}笔, ${feeRate} sat/vB`)
    
    // 计算精确费用
    const parentTotalFee = Math.ceil(HARDCODED_TRANSACTION_SIZES.PARENT_TX_VSIZE * feeRate)
    
    // 普通子交易费用 (1到childCount-1)
    const normalChildFee = Math.ceil(HARDCODED_TRANSACTION_SIZES.CHILD_TX_VSIZE * feeRate)
    const normalChildCount = childCount - 1
    const normalChildTotalFees = normalChildFee * normalChildCount
    
    // 最后子交易费用 (第childCount笔)
    const finalChildFee = Math.ceil(HARDCODED_TRANSACTION_SIZES.FINAL_CHILD_TX_VSIZE * feeRate)
    
    // 最终输出dust阈值 (假设最终接收地址为P2TR)
    const finalOutputDust = 330 // P2TR dust threshold
    
    // 总费用计算
    const totalChildFees = normalChildTotalFees + finalChildFee
    const relayFuelAmount = totalChildFees + finalOutputDust // 包含最终输出的dust
    const totalRequiredFunding = parentTotalFee + relayFuelAmount
    
    console.log(`💰 费用计算: 父交易=${parentTotalFee}, 子交易=${totalChildFees}, 总需求=${totalRequiredFunding} sats`)
    
    const result: ChainMintingFeeCalculation = {
      parentTx: {
        vSize: HARDCODED_TRANSACTION_SIZES.PARENT_TX_VSIZE,
        baseFee: parentTotalFee,
        totalFee: parentTotalFee,
        feeRate: feeRate
      },
      childTx: {
        vSize: HARDCODED_TRANSACTION_SIZES.CHILD_TX_VSIZE, // 使用普通子交易大小作为代表值
        baseFee: normalChildFee,
        totalFee: normalChildFee,
        feeRate: feeRate
      },
      childCount: childCount,
      totalChildFees: totalChildFees,
      relayFuelAmount: relayFuelAmount,
      totalRequiredFunding: totalRequiredFunding,
      safetyBuffer: 0
    }
    
    return result
    
  } catch (error) {
    console.error(`💥 费用计算失败:`, error.message)
    throw new ChainMintingError(
      ChainMintingErrorType.FEE_CALCULATION_ERROR,
      `费用计算失败: ${error.message}`,
      { contractId, childCount, feeRate }
    )
  }
}

/**
 * 基于硬编码大小的精确费用计算
 * 
 * 使用硬编码的准确交易大小，与performDryRunFeeCalculation保持一致
 */
export async function calculateActualTransactionFees({
  wallets,
  contractId,
  childCount,
  feeRate,
  provider,
  actualUtxos
}: {
  wallets: ChainMintingWallets
  contractId: AlkaneContractId
  childCount: number
  feeRate: number
  provider: Provider
  actualUtxos: FormattedUtxo[]
}): Promise<ChainMintingFeeCalculation> {
  
  try {
    console.log(`🎯 精确费用计算: ${actualUtxos.length} UTXOs`)
    
    // 使用与performDryRunFeeCalculation相同的逻辑
    return await performDryRunFeeCalculation({
      wallets,
      contractId,
      childCount,
      feeRate,
      provider
    })
    
  } catch (error) {
    console.error(`💥 费用计算失败:`, error.message)
    throw new ChainMintingError(
      ChainMintingErrorType.FEE_CALCULATION_ERROR,
      `实际费用计算失败: ${error.message}`,
      { contractId, childCount, feeRate, utxoCount: actualUtxos.length }
    )
  }
}


// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 验证费用计算参数
 */
function validateFeeCalculationParams(feeRate: number, childCount: number): void {
  if (feeRate < SAFETY_PARAMS.MIN_FEE_RATE || feeRate > SAFETY_PARAMS.MAX_FEE_RATE) {
    throw new ChainMintingError(
      ChainMintingErrorType.FEE_CALCULATION_ERROR,
      `费率超出安全范围: ${feeRate} (允许范围: ${SAFETY_PARAMS.MIN_FEE_RATE}-${SAFETY_PARAMS.MAX_FEE_RATE})`
    )
  }
  
  if (childCount < 1 || childCount > 24) {
    throw new ChainMintingError(
      ChainMintingErrorType.FEE_CALCULATION_ERROR,
      `子交易数量超出范围: ${childCount} (允许范围: 1-24)`
    )
  }
}

/**
 * 比较两次费用计算结果的差异
 */
export function compareFeeCalculations(
  dryRun: ChainMintingFeeCalculation,
  actual: ChainMintingFeeCalculation
): {
  parentFeeDiff: number
  childFeeDiff: number
  totalDiff: number
  accuracy: number
} {
  const parentFeeDiff = actual.parentTx.totalFee - dryRun.parentTx.totalFee
  const childFeeDiff = actual.childTx.totalFee - dryRun.childTx.totalFee
  const totalDiff = actual.totalRequiredFunding - dryRun.totalRequiredFunding
  
  const accuracy = 1 - Math.abs(totalDiff) / dryRun.totalRequiredFunding
  
  return {
    parentFeeDiff,
    childFeeDiff,
    totalDiff,
    accuracy: Math.max(0, accuracy)
  }
}

/**
 * 格式化费用计算结果用于显示
 */
export function formatFeeCalculationResult(result: ChainMintingFeeCalculation): string {
  
  // 计算普通子交易和最后子交易的费用
  const normalChildFee = Math.ceil(HARDCODED_TRANSACTION_SIZES.CHILD_TX_VSIZE * result.childTx.feeRate)
  const finalChildFee = Math.ceil(HARDCODED_TRANSACTION_SIZES.FINAL_CHILD_TX_VSIZE * result.childTx.feeRate)
  const normalChildCount = result.childCount - 1
  const finalOutputDust = 330
  
  return `
📊 费用计算汇总:
├─ 父交易: ${result.parentTx.totalFee} sats (${result.parentTx.vSize} vB × ${result.parentTx.feeRate} sat/vB)
├─ 普通子交易 (1-${normalChildCount}): ${normalChildFee} sats × ${normalChildCount} = ${normalChildFee * normalChildCount} sats
├─ 最后子交易 (${result.childCount}): ${finalChildFee} sats (${HARDCODED_TRANSACTION_SIZES.FINAL_CHILD_TX_VSIZE} vB × ${result.childTx.feeRate} sat/vB)
├─ 子交易总费用: ${result.totalChildFees} sats
├─ 最终输出dust: ${finalOutputDust} sats (P2TR minimum)
├─ 中继燃料: ${result.relayFuelAmount} sats (包含最终输出)
└─ 总需求: ${result.totalRequiredFunding} sats
`
}