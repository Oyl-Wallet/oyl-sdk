/**
 * Project Supercluster - 多中继钱包管理器
 * 
 * 基于现有 walletManager.ts 的扩展，实现多中继钱包生成和管理
 * 100% 复用现有的钱包生成逻辑和验证机制
 */

import * as bitcoin from 'bitcoinjs-lib'
import { 
  generateChainMintingWalletsFromEnv,
  validateWalletConfiguration,
  getAddressTypeName,
  type WalletValidationResult
} from './walletManager'
import { 
  ChainMintingWallets,
  AddressType,
  ChainMintingError,
  ChainMintingErrorType
} from './chainMinting'

// ============================================================================
// 核心数据结构
// ============================================================================

/**
 * 单个中继钱包信息
 */
export interface RelayWalletInfo {
  sliceIndex: number                 // 分片索引 (0, 1, 2, ...)
  wallet: ChainMintingWallets['relayWallet']  // 中继钱包对象
  address: string                    // P2WPKH 地址
  derivationIndex: number            // HD 派生索引
}

/**
 * 多中继钱包系统
 */
export interface MultiRelayWalletSystem {
  /** 主资金钱包 (复用现有结构) */
  mainWallet: ChainMintingWallets['mainWallet']
  /** 中继钱包数组 */
  relayWallets: RelayWalletInfo[]
  /** 总分片数量 */
  totalSlices: number
  /** 网络类型 */
  network: bitcoin.Network
  /** 基础派生索引 */
  baseDerivatonIndex: number
}

/**
 * 钱包系统摘要信息
 */
export interface WalletSystemSummary {
  mainWalletAddress: string
  mainWalletType: AddressType
  totalRelayWallets: number
  relayAddresses: string[]
  derivationIndexRange: {
    min: number
    max: number
  }
  estimatedMaxMints: number
  networkType: string
  addressUniquenessCheck: boolean
}

// ============================================================================
// 主要功能函数
// ============================================================================

/**
 * 生成多中继钱包池
 * 
 * 基于现有的 generateChainMintingWalletsFromEnv，为每个分片生成独立的中继钱包
 * 
 * @param network - 网络类型
 * @param totalMints - 总铸造数量 (用于计算分片数)
 * @param baseDerivatonIndex - 基础派生索引 (可选，默认随机生成)
 * @returns 完整的多中继钱包系统
 */
export async function generateMultiRelayWallets(
  network: bitcoin.Network, 
  totalMints: number,
  baseDerivatonIndex?: number
): Promise<MultiRelayWalletSystem> {
  
  console.log(`🔐 Project Supercluster 钱包系统生成`)
  console.log(`   总铸造数量: ${totalMints}`)
  
  // 0. 验证最小铸造数量 (必须大于25才需要并行)
  if (totalMints <= 25) {
    throw new ChainMintingError(
      ChainMintingErrorType.INVALID_ADDRESS_TYPE,
      `Multi-relay wallet generation requires more than 25 tokens. For ${totalMints} tokens, use the standard Project Snowball chain minting.`,
      { totalMints, requiredMinimum: 26 }
    )
  }
  
  // 1. 计算分片数量 (每个分片最多25个tokens)
  const totalSlices = Math.ceil(totalMints / 25)
  console.log(`   分片数量: ${totalSlices}`)
  
  if (totalSlices > 100) {
    throw new ChainMintingError(
      ChainMintingErrorType.INVALID_ADDRESS_TYPE,
      `分片数量过多 (${totalSlices})，最大支持100个分片 (2500 tokens)`,
      { totalMints, totalSlices }
    )
  }
  
  // 2. 生成主钱包 (复用现有逻辑)
  console.log(`   🔑 生成主钱包...`)
  const mainWalletSystem = await generateChainMintingWalletsFromEnv(network)
  const mainWallet = mainWalletSystem.mainWallet
  
  console.log(`   ✅ 主钱包: ${mainWallet.account.taproot.address}`)
  
  // 3. 为每个分片生成独立的中继钱包
  console.log(`   🔗 生成 ${totalSlices} 个中继钱包...`)
  
  const relayWallets: RelayWalletInfo[] = []
  const baseIndex = baseDerivatonIndex || generateSafeBaseIndex(mainWalletSystem.relayWalletIndex)
  
  for (let sliceIndex = 0; sliceIndex < totalSlices; sliceIndex++) {
    // 为每个分片计算唯一的派生索引
    // 使用较大的间隔确保不会冲突
    const derivationIndex = baseIndex + (sliceIndex * 1000) + 1000
    
    try {
      // 生成该分片的中继钱包
      const sliceWalletSystem = await generateChainMintingWalletsFromEnv(
        network, 
        derivationIndex
      )
      
      const relayWalletInfo: RelayWalletInfo = {
        sliceIndex,
        wallet: sliceWalletSystem.relayWallet,
        address: sliceWalletSystem.relayWallet.account.nativeSegwit.address,
        derivationIndex
      }
      
      relayWallets.push(relayWalletInfo)
      
      console.log(`   ✅ 中继钱包 ${sliceIndex}: ${relayWalletInfo.address} (索引: ${derivationIndex})`)
      
    } catch (error) {
      throw new ChainMintingError(
        ChainMintingErrorType.INVALID_ADDRESS_TYPE,
        `生成分片 ${sliceIndex} 的中继钱包失败: ${error.message}`,
        { sliceIndex, derivationIndex, error: error.message }
      )
    }
  }
  
  // 4. 构建完整的钱包系统
  const walletSystem: MultiRelayWalletSystem = {
    mainWallet,
    relayWallets,
    totalSlices,
    network,
    baseDerivatonIndex: baseIndex
  }
  
  // 5. 验证钱包系统
  const validation = validateMultiRelayWalletSystem(walletSystem)
  if (!validation.isValid) {
    throw new ChainMintingError(
      ChainMintingErrorType.INVALID_ADDRESS_TYPE,
      `多中继钱包系统验证失败: ${validation.errors.join(', ')}`,
      validation
    )
  }
  
  console.log(`🔐 钱包系统生成完成`)
  console.log(`   主钱包: ${getAddressTypeName(validation.mainWalletType)}`)
  console.log(`   中继钱包: ${totalSlices} 个 P2WPKH 地址`)
  console.log(`   派生索引范围: ${validation.derivationIndexRange.min} - ${validation.derivationIndexRange.max}`)
  
  return walletSystem
}

// ============================================================================
// 验证和检查功能
// ============================================================================

/**
 * 验证多中继钱包系统的完整性
 */
export function validateMultiRelayWalletSystem(
  walletSystem: MultiRelayWalletSystem
): {
  isValid: boolean
  errors: string[]
  mainWalletType: AddressType
  derivationIndexRange: { min: number, max: number }
} {
  
  const errors: string[] = []
  
  try {
    // 1. 验证主钱包 (复用现有验证逻辑)
    const dummyChainWallets: ChainMintingWallets = {
      mainWallet: walletSystem.mainWallet,
      relayWallet: walletSystem.relayWallets[0]?.wallet // 使用第一个中继钱包进行格式验证
    }
    
    const baseValidation = validateWalletConfiguration(dummyChainWallets, walletSystem.network)
    if (!baseValidation.mainWallet.isValid) {
      errors.push(...baseValidation.mainWallet.errors.map(e => `主钱包: ${e}`))
    }
    
    // 2. 验证中继钱包数量
    if (walletSystem.relayWallets.length === 0) {
      errors.push('中继钱包数量不能为0')
    } else if (walletSystem.relayWallets.length > 100) {
      errors.push(`中继钱包数量过多: ${walletSystem.relayWallets.length} (最大100)`)
    }
    
    // 3. 验证中继钱包地址唯一性
    const addressSet = new Set<string>()
    const indexSet = new Set<number>()
    
    // 添加主钱包地址到检查集合
    addressSet.add(walletSystem.mainWallet.account.taproot.address)
    addressSet.add(walletSystem.mainWallet.account.nativeSegwit.address)
    
    let minIndex = Infinity
    let maxIndex = -Infinity
    
    for (const relayInfo of walletSystem.relayWallets) {
      // 检查地址唯一性
      if (addressSet.has(relayInfo.address)) {
        errors.push(`发现重复地址: ${relayInfo.address} (分片 ${relayInfo.sliceIndex})`)
      } else {
        addressSet.add(relayInfo.address)
      }
      
      // 检查派生索引唯一性
      if (indexSet.has(relayInfo.derivationIndex)) {
        errors.push(`发现重复派生索引: ${relayInfo.derivationIndex} (分片 ${relayInfo.sliceIndex})`)
      } else {
        indexSet.add(relayInfo.derivationIndex)
      }
      
      // 更新索引范围
      minIndex = Math.min(minIndex, relayInfo.derivationIndex)
      maxIndex = Math.max(maxIndex, relayInfo.derivationIndex)
      
      // 验证分片索引连续性
      if (relayInfo.sliceIndex < 0 || relayInfo.sliceIndex >= walletSystem.totalSlices) {
        errors.push(`分片索引 ${relayInfo.sliceIndex} 超出范围 [0, ${walletSystem.totalSlices - 1}]`)
      }
      
      // 验证中继钱包地址类型
      if (!relayInfo.address.startsWith('bc1q') && 
          !relayInfo.address.startsWith('tb1q') && 
          !relayInfo.address.startsWith('bcrt1q')) {
        errors.push(`分片 ${relayInfo.sliceIndex} 中继地址不是P2WPKH: ${relayInfo.address}`)
      }
    }
    
    // 4. 验证分片索引完整性
    const expectedSliceIndices = new Set(Array.from({ length: walletSystem.totalSlices }, (_, i) => i))
    const actualSliceIndices = new Set(walletSystem.relayWallets.map(r => r.sliceIndex))
    
    if (expectedSliceIndices.size !== actualSliceIndices.size || 
        ![...expectedSliceIndices].every(i => actualSliceIndices.has(i))) {
      errors.push(`分片索引不完整: 期望 [0-${walletSystem.totalSlices - 1}], 实际 [${[...actualSliceIndices].sort().join(', ')}]`)
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      mainWalletType: baseValidation.mainWallet.addressType,
      derivationIndexRange: {
        min: minIndex === Infinity ? 0 : minIndex,
        max: maxIndex === -Infinity ? 0 : maxIndex
      }
    }
    
  } catch (error) {
    errors.push(`验证过程发生错误: ${error.message}`)
    return {
      isValid: false,
      errors,
      mainWalletType: AddressType.P2PKH, // 默认值
      derivationIndexRange: { min: 0, max: 0 }
    }
  }
}

/**
 * 检查钱包地址唯一性 (快速检查版本)
 */
export function validateWalletUniqueness(walletSystem: MultiRelayWalletSystem): boolean {
  const allAddresses = [
    walletSystem.mainWallet.account.taproot.address,
    walletSystem.mainWallet.account.nativeSegwit.address,
    ...walletSystem.relayWallets.map(r => r.address)
  ]
  
  const uniqueAddresses = new Set(allAddresses)
  const isUnique = uniqueAddresses.size === allAddresses.length
  
  if (!isUnique) {
    console.error(`❌ 检测到重复地址！`)
    console.error(`   总地址数: ${allAddresses.length}`)
    console.error(`   唯一地址数: ${uniqueAddresses.size}`)
    
    // 找出重复的地址
    const addressCounts = new Map<string, number>()
    allAddresses.forEach(addr => {
      addressCounts.set(addr, (addressCounts.get(addr) || 0) + 1)
    })
    
    const duplicates = [...addressCounts.entries()].filter(([_, count]) => count > 1)
    duplicates.forEach(([addr, count]) => {
      console.error(`   重复地址: ${addr} (出现 ${count} 次)`)
    })
    
    return false
  }
  
  console.log(`✅ 钱包地址唯一性验证通过 (${allAddresses.length} 个唯一地址)`)
  return true
}

/**
 * 获取钱包系统摘要信息
 */
export function getWalletSystemSummary(walletSystem: MultiRelayWalletSystem): WalletSystemSummary {
  const validation = validateMultiRelayWalletSystem(walletSystem)
  
  const networkName = walletSystem.network === bitcoin.networks.bitcoin ? 'mainnet' : 
                     walletSystem.network === bitcoin.networks.testnet ? 'testnet' : 'regtest'
  
  return {
    mainWalletAddress: walletSystem.mainWallet.account.taproot.address,
    mainWalletType: validation.mainWalletType,
    totalRelayWallets: walletSystem.relayWallets.length,
    relayAddresses: walletSystem.relayWallets.map(r => r.address),
    derivationIndexRange: validation.derivationIndexRange,
    estimatedMaxMints: walletSystem.totalSlices * 25,
    networkType: networkName,
    addressUniquenessCheck: validation.isValid
  }
}

// ============================================================================
// 辅助工具函数
// ============================================================================

/**
 * 生成安全的基础派生索引
 * 
 * 避免与现有索引冲突，生成一个较大的基础值
 */
function generateSafeBaseIndex(existingIndex: number): number {
  // 基础索引从100000开始，避免与常用索引冲突
  // 每次递增10000确保有足够的间隔空间
  const safeBase = Math.max(100000, existingIndex + 10000)
  
  // 添加一些随机性避免可预测性
  const randomOffset = Math.floor(Math.random() * 1000)
  
  return safeBase + randomOffset
}

/**
 * 根据总铸造数量获取推荐的中继钱包配置
 */
export function getRecommendedWalletConfig(totalMints: number): {
  sliceCount: number
  estimatedMaxIndex: number
  memoryEstimate: string
  recommendedBatchSize: number
} {
  const sliceCount = Math.ceil(totalMints / 25)
  const estimatedMaxIndex = 100000 + (sliceCount * 1000) + 1000
  const memoryEstimate = `${Math.round(sliceCount * 0.5)} MB` // 每个钱包约0.5MB
  const recommendedBatchSize = Math.min(6, sliceCount) // 推荐并发数
  
  return {
    sliceCount,
    estimatedMaxIndex,
    memoryEstimate,
    recommendedBatchSize
  }
}

/**
 * 显示钱包系统详细信息 (调试用)
 */
export function displayWalletSystemInfo(walletSystem: MultiRelayWalletSystem): void {
  const summary = getWalletSystemSummary(walletSystem)
  
  console.log(`\n🔐 钱包系统详细信息`)
  console.log(`================`)
  console.log(`网络: ${summary.networkType}`)
  console.log(`主钱包: ${summary.mainWalletAddress} (${getAddressTypeName(summary.mainWalletType)})`)
  console.log(`中继钱包数: ${summary.totalRelayWallets}`)
  console.log(`派生索引范围: ${summary.derivationIndexRange.min} - ${summary.derivationIndexRange.max}`)
  console.log(`最大铸造量: ${summary.estimatedMaxMints} tokens`)
  console.log(`地址唯一性: ${summary.addressUniquenessCheck ? '✅ 通过' : '❌ 失败'}`)
  
  if (walletSystem.relayWallets.length <= 10) {
    console.log(`\n中继地址列表:`)
    walletSystem.relayWallets.forEach((relay, index) => {
      console.log(`  ${index}: ${relay.address} (索引: ${relay.derivationIndex})`)
    })
  } else {
    console.log(`\n中继地址样例:`)
    console.log(`  0: ${walletSystem.relayWallets[0].address}`)
    console.log(`  1: ${walletSystem.relayWallets[1].address}`)
    console.log(`  ...`)
    console.log(`  ${walletSystem.relayWallets.length - 1}: ${walletSystem.relayWallets[walletSystem.relayWallets.length - 1].address}`)
  }
}

