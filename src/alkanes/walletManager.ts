/**
 * 钱包生成和地址类型验证模块
 * 
 * 负责生成主钱包和中继钱包，验证地址类型，确保符合链式铸造的要求
 * 强制使用P2WPKH作为中继地址以获得最低交易费用
 */

import * as bitcoin from 'bitcoinjs-lib'
import * as dotenv from 'dotenv'
import { 
  Account, 
  mnemonicToAccount, 
  getWalletPrivateKeys,
  generateMnemonic 
} from '../account'
import { Signer } from '../signer'
import { 
  ChainMintingWallets,
  AddressType,
  DUST_LIMITS,
  ChainMintingError,
  ChainMintingErrorType
} from './chainMinting'

// 加载环境变量
dotenv.config()

// ============================================================================
// 地址验证工具
// ============================================================================

/**
 * 检测地址类型
 */
export function detectAddressType(address: string, _network?: bitcoin.Network): AddressType {
  try {
    // P2TR (Taproot) - bc1p... / tb1p... / bcrt1p...
    if (address.startsWith('bc1p') || address.startsWith('tb1p') || address.startsWith('bcrt1p')) {
      return AddressType.P2TR
    }
    
    // P2WPKH (Native SegWit) - bc1q... / tb1q... / bcrt1q...
    if (address.startsWith('bc1q') || address.startsWith('tb1q') || address.startsWith('bcrt1q')) {
      return AddressType.P2WPKH
    }
    
    // P2SH (可能是nested SegWit) - 3... / 2...
    if (address.startsWith('3') || address.startsWith('2')) {
      return AddressType.P2SH_P2WPKH
    }
    
    // P2PKH (Legacy) - 1... / m.../n...
    if (address.startsWith('1') || address.startsWith('m') || address.startsWith('n')) {
      return AddressType.P2PKH
    }
    
    throw new Error(`无法识别的地址格式: ${address}`)
    
  } catch (error) {
    throw new ChainMintingError(
      ChainMintingErrorType.INVALID_ADDRESS_TYPE,
      `地址类型检测失败: ${error.message}`,
      { address }
    )
  }
}

/**
 * 验证地址是否为指定类型
 */
export function validateAddressType(
  address: string, 
  expectedType: AddressType, 
  network: bitcoin.Network
): boolean {
  try {
    const actualType = detectAddressType(address, network)
    return actualType === expectedType
  } catch {
    return false
  }
}

/**
 * 验证地址是否符合最低dust阈值
 */
export function validateDustThreshold(amount: number, addressType: AddressType): void {
  const dustLimit = DUST_LIMITS[addressType]

  
  if (amount < dustLimit) {
    throw new ChainMintingError(
      ChainMintingErrorType.DUST_THRESHOLD_VIOLATION,
      `输出金额 ${amount} sats 低于 ${addressType} 的安全阈值 ${dustLimit} sats`,
      { amount, addressType, dustLimit }
    )
  }
}

/**
 * 获取地址类型的可读名称
 */
export function getAddressTypeName(addressType: AddressType): string {
  const names = {
    [AddressType.P2PKH]: 'Legacy (P2PKH)',
    [AddressType.P2WPKH]: 'Native SegWit (P2WPKH)',
    [AddressType.P2SH_P2WPKH]: 'Nested SegWit (P2SH-P2WPKH)',
    [AddressType.P2TR]: 'Taproot (P2TR)'
  }
  return names[addressType] || 'Unknown'
}

// ============================================================================
// 钱包生成器
// ============================================================================

/**
 * 钱包生成配置
 */
export interface WalletGenerationConfig {
  /** 批量铸造助记词（从环境变量BATCH_MINT_MNEMONIC获取） */
  batchMintMnemonic: string
  /** 网络类型 */
  network: bitcoin.Network
  /** 中继钱包索引（随机生成，避免地址冲突） */
  relayWalletIndex?: number
}

/**
 * 钱包验证结果
 */
export interface WalletValidationResult {
  /** 验证是否通过 */
  isValid: boolean
  /** 主钱包验证 */
  mainWallet: {
    address: string
    addressType: AddressType
    isValid: boolean
    errors: string[]
  }
  /** 中继钱包验证 */
  relayWallet: {
    address: string
    addressType: AddressType
    isValid: boolean
    errors: string[]
  }
  /** 总体错误列表 */
  errors: string[]
}

/**
 * 生成链式铸造钱包系统
 */
export async function generateChainMintingWallets(
  config: WalletGenerationConfig
): Promise<ChainMintingWallets & { relayWalletIndex: number }> {
  
  try {
    console.log(`🔐 生成链式铸造钱包系统...`)
    console.log(`   网络: ${config.network === bitcoin.networks.bitcoin ? 'mainnet' : 
                       config.network === bitcoin.networks.testnet ? 'testnet' : 'regtest'}`)
    
    // 生成随机中继钱包索引（如果未提供）
    const relayWalletIndex = config.relayWalletIndex || generateRandomWalletIndex()
    console.log(`   中继钱包索引: ${relayWalletIndex}`)
    
    // 1. 生成主钱包（index=0）
    const mainWallet = await generateMainWallet(config)
    console.log(`   主钱包地址: ${mainWallet.account.taproot.address}`)
    
    // 2. 生成中继钱包（随机index）
    const relayWallet = await generateRelayWallet(config, relayWalletIndex)
    console.log(`   中继钱包地址: ${relayWallet.account.nativeSegwit.address}`)
    
    // 3. 验证钱包配置
    const wallets: ChainMintingWallets = { mainWallet, relayWallet }
    const validation = validateWalletConfiguration(wallets, config.network)
    
    if (!validation.isValid) {
      throw new ChainMintingError(
        ChainMintingErrorType.INVALID_ADDRESS_TYPE,
        `钱包配置验证失败: ${validation.errors.join(', ')}`,
        validation
      )
    }
    
    console.log(`✅ 钱包系统生成成功`)
    console.log(`   主钱包类型: ${getAddressTypeName(validation.mainWallet.addressType)}`)
    console.log(`   中继钱包类型: ${getAddressTypeName(validation.relayWallet.addressType)}`)
    
    return { ...wallets, relayWalletIndex }
    
  } catch (error) {
    console.error(`💥 钱包生成失败:`, error.message)
    throw error instanceof ChainMintingError ? error : new ChainMintingError(
      ChainMintingErrorType.INVALID_ADDRESS_TYPE,
      `钱包生成失败: ${error.message}`,
      config
    )
  }
}

/**
 * 生成主钱包（index=0）
 */
async function generateMainWallet(config: WalletGenerationConfig): Promise<{
  account: Account
  signer: Signer
  role: 'funding' | 'receiver'
}> {
  
  try {
    // 创建主账户 - index=0，使用Taproot获得更好的隐私性
    const account = mnemonicToAccount({
      mnemonic: config.batchMintMnemonic,
      opts: {
        network: config.network,
        index: 0,  // 主钱包固定使用index=0
        spendStrategy: {
          addressOrder: ['taproot', 'nativeSegwit', 'nestedSegwit', 'legacy'],
          utxoSortGreatestToLeast: true,
          changeAddress: 'taproot'  // 主钱包使用P2TR
        }
      }
    })
    
    // 获取私钥
    const privateKeys = getWalletPrivateKeys({
      mnemonic: config.batchMintMnemonic,
      opts: {
        network: config.network,
        index: 0  // 主钱包固定使用index=0
      }
    })
    
    // 创建签名器
    const signer = new Signer(config.network, {
      taprootPrivateKey: privateKeys.taproot.privateKey,
      segwitPrivateKey: privateKeys.nativeSegwit.privateKey,
      nestedSegwitPrivateKey: privateKeys.nestedSegwit.privateKey,
      legacyPrivateKey: privateKeys.legacy.privateKey,
    })
    
    return {
      account,
      signer,
      role: 'funding'
    }
    
  } catch (error) {
    throw new ChainMintingError(
      ChainMintingErrorType.INVALID_ADDRESS_TYPE,
      `主钱包生成失败: ${error.message}`,
      { mnemonic: config.batchMintMnemonic ? '[PROVIDED]' : '[MISSING]', index: 0 }
    )
  }
}

/**
 * 生成中继钱包（随机index）
 */
async function generateRelayWallet(
  config: WalletGenerationConfig, 
  relayWalletIndex: number
): Promise<{
  account: Account
  signer: Signer
  role: 'relay'
}> {
  
  try {
    console.log(`   使用同一助记词，中继钱包index=${relayWalletIndex}`)
    
    // 创建中继账户 - 使用随机index，强制使用P2WPKH获得最低费用
    const account = mnemonicToAccount({
      mnemonic: config.batchMintMnemonic,  // 使用同一助记词
      opts: {
        network: config.network,
        index: relayWalletIndex,  // 使用随机索引
        spendStrategy: {
          addressOrder: ['nativeSegwit'],  // 优先使用P2WPKH
          utxoSortGreatestToLeast: true,
          changeAddress: 'nativeSegwit'    // 强制P2WPKH找零
        }
      }
    })
    
    // 获取私钥
    const privateKeys = getWalletPrivateKeys({
      mnemonic: config.batchMintMnemonic,  // 使用同一助记词
      opts: {
        network: config.network,
        index: relayWalletIndex  // 使用随机索引
      }
    })
    
    // 创建签名器
    const signer = new Signer(config.network, {
      taprootPrivateKey: privateKeys.taproot.privateKey,
      segwitPrivateKey: privateKeys.nativeSegwit.privateKey,
      nestedSegwitPrivateKey: privateKeys.nestedSegwit.privateKey,
      legacyPrivateKey: privateKeys.legacy.privateKey,
    })
    
    return {
      account,
      signer,
      role: 'relay'
    }
    
  } catch (error) {
    throw new ChainMintingError(
      ChainMintingErrorType.INVALID_ADDRESS_TYPE,
      `中继钱包生成失败: ${error.message}`,
      { 
        mnemonic: config.batchMintMnemonic ? '[PROVIDED]' : '[MISSING]',
        index: relayWalletIndex
      }
    )
  }
}

// ============================================================================
// 钱包索引生成器
// ============================================================================

/**
 * 生成随机钱包索引
 * 
 * 避免与主钱包(index=0)冲突，生成1-999999范围内的随机数
 */
function generateRandomWalletIndex(): number {
  // 生成1到999999之间的随机整数
  const min = 1
  const max = 999999
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * 从环境变量生成链式铸造钱包系统
 * 
 * 从.env文件中读取BATCH_MINT_MNEMONIC生成钱包
 */
export async function generateChainMintingWalletsFromEnv(
  network: bitcoin.Network,
  relayWalletIndex?: number
): Promise<ChainMintingWallets & { relayWalletIndex: number }> {
  
  const batchMintMnemonic = process.env.BATCH_MINT_MNEMONIC
  
  if (!batchMintMnemonic) {
    throw new ChainMintingError(
      ChainMintingErrorType.INVALID_ADDRESS_TYPE,
      '环境变量BATCH_MINT_MNEMONIC未设置',
      { envVar: 'BATCH_MINT_MNEMONIC' }
    )
  }
  
  // 验证助记词格式
  if (!validateMnemonic(batchMintMnemonic)) {
    throw new ChainMintingError(
      ChainMintingErrorType.INVALID_ADDRESS_TYPE,
      '环境变量BATCH_MINT_MNEMONIC格式无效',
      { mnemonic: maskMnemonic(batchMintMnemonic) }
    )
  }
  
  console.log(`🔐 从环境变量生成钱包系统`)
  console.log(`   助记词: ${maskMnemonic(batchMintMnemonic)}`)
  
  return generateChainMintingWallets({
    batchMintMnemonic,
    network,
    relayWalletIndex
  })
}

// ============================================================================
// 钱包验证系统
// ============================================================================

/**
 * 验证钱包配置
 */
export function validateWalletConfiguration(
  wallets: ChainMintingWallets,
  network: bitcoin.Network
): WalletValidationResult {
  
  const errors: string[] = []
  
  // 验证主钱包
  const mainWalletValidation = validateMainWallet(wallets.mainWallet, network)
  if (!mainWalletValidation.isValid) {
    errors.push(...mainWalletValidation.errors.map(e => `主钱包: ${e}`))
  }
  
  // 验证中继钱包
  const relayWalletValidation = validateRelayWallet(wallets.relayWallet, network)
  if (!relayWalletValidation.isValid) {
    errors.push(...relayWalletValidation.errors.map(e => `中继钱包: ${e}`))
  }
  
  // 验证钱包间的一致性
  const consistencyErrors = validateWalletConsistency(wallets, network)
  errors.push(...consistencyErrors)
  
  const isValid = errors.length === 0
  
  return {
    isValid,
    mainWallet: mainWalletValidation,
    relayWallet: relayWalletValidation,
    errors
  }
}

/**
 * 验证主钱包
 */
function validateMainWallet(
  mainWallet: ChainMintingWallets['mainWallet'],
  network: bitcoin.Network
): WalletValidationResult['mainWallet'] {
  
  const errors: string[] = []
  const address = mainWallet.account.taproot.address
  
  try {
    // 检查地址类型
    const addressType = detectAddressType(address, network)
    
    // 主钱包推荐使用P2TR，但不强制
    if (addressType !== AddressType.P2TR) {
      console.warn(`⚠️  主钱包建议使用Taproot地址，当前使用: ${getAddressTypeName(addressType)}`)
    }
    
    // 检查角色配置
    if (mainWallet.role !== 'funding' && mainWallet.role !== 'receiver') {
      errors.push(`主钱包角色无效: ${mainWallet.role}`)
    }
    
    return {
      address,
      addressType,
      isValid: errors.length === 0,
      errors
    }
    
  } catch (error) {
    errors.push(`地址验证失败: ${error.message}`)
    return {
      address,
      addressType: AddressType.P2PKH, // 默认值
      isValid: false,
      errors
    }
  }
}

/**
 * 验证中继钱包
 */
function validateRelayWallet(
  relayWallet: ChainMintingWallets['relayWallet'],
  network: bitcoin.Network
): WalletValidationResult['relayWallet'] {
  
  const errors: string[] = []
  const address = relayWallet.account.nativeSegwit.address
  
  try {
    // 检查地址类型
    const addressType = detectAddressType(address, network)
    
    // 中继钱包必须使用P2WPKH
    if (addressType !== AddressType.P2WPKH) {
      errors.push(
        `中继钱包必须使用P2WPKH地址以获得最低费用，当前: ${getAddressTypeName(addressType)}`
      )
    }
    
    // 检查角色配置
    if (relayWallet.role !== 'relay') {
      errors.push(`中继钱包角色无效: ${relayWallet.role}`)
    }
    
    return {
      address,
      addressType,
      isValid: errors.length === 0,
      errors
    }
    
  } catch (error) {
    errors.push(`地址验证失败: ${error.message}`)
    return {
      address,
      addressType: AddressType.P2PKH, // 默认值
      isValid: false,
      errors
    }
  }
}

/**
 * 验证钱包间的一致性
 */
function validateWalletConsistency(
  wallets: ChainMintingWallets,
  network: bitcoin.Network
): string[] {
  
  const errors: string[] = []
  
  // 检查地址是否重复
  const mainAddress = wallets.mainWallet.account.taproot.address
  const relayAddress = wallets.relayWallet.account.nativeSegwit.address
  
  if (mainAddress === relayAddress) {
    errors.push('主钱包和中继钱包不能使用相同的地址')
  }
  
  // 检查网络一致性
  const mainNetworkType = mainAddress.startsWith('bc1') ? 'mainnet' : 
                         mainAddress.startsWith('tb1') ? 'testnet' : 'regtest'
  const relayNetworkType = relayAddress.startsWith('bc1') ? 'mainnet' :
                          relayAddress.startsWith('tb1') ? 'testnet' : 'regtest'
  
  if (mainNetworkType !== relayNetworkType) {
    errors.push(`钱包网络类型不一致: 主钱包(${mainNetworkType}) vs 中继钱包(${relayNetworkType})`)
  }
  
  const expectedNetworkType = network === bitcoin.networks.bitcoin ? 'mainnet' :
                             network === bitcoin.networks.testnet ? 'testnet' : 'regtest'
  
  if (mainNetworkType !== expectedNetworkType) {
    errors.push(`钱包网络与配置不匹配: 期望(${expectedNetworkType}) vs 实际(${mainNetworkType})`)
  }
  
  return errors
}

// ============================================================================
// 钱包信息显示
// ============================================================================

/**
 * 格式化钱包信息显示
 */
export function formatWalletInfo(wallets: ChainMintingWallets): string {
  const mainWallet = wallets.mainWallet
  const relayWallet = wallets.relayWallet
  
  return `
🔐 链式铸造钱包配置:
├─ 主钱包 (资金提供 & 最终接收):
│  ├─ 地址: ${mainWallet.account.taproot.address}
│  ├─ 类型: ${getAddressTypeName(AddressType.P2TR)}
│  └─ 角色: ${mainWallet.role}
└─ 中继钱包 (交易中继):
   ├─ 地址: ${relayWallet.account.nativeSegwit.address}
   ├─ 类型: ${getAddressTypeName(AddressType.P2WPKH)}
   └─ 角色: ${relayWallet.role}
`
}

/**
 * 格式化验证结果显示
 */
export function formatValidationResult(result: WalletValidationResult): string {
  const status = result.isValid ? '✅ 通过' : '❌ 失败'
  
  let output = `🔍 钱包验证结果: ${status}\n`
  
  // 主钱包验证结果
  const mainStatus = result.mainWallet.isValid ? '✅' : '❌'
  output += `├─ 主钱包: ${mainStatus} ${result.mainWallet.address}\n`
  if (result.mainWallet.errors.length > 0) {
    result.mainWallet.errors.forEach(error => {
      output += `│  └─ ❌ ${error}\n`
    })
  }
  
  // 中继钱包验证结果
  const relayStatus = result.relayWallet.isValid ? '✅' : '❌'
  output += `└─ 中继钱包: ${relayStatus} ${result.relayWallet.address}\n`
  if (result.relayWallet.errors.length > 0) {
    result.relayWallet.errors.forEach(error => {
      output += `   └─ ❌ ${error}\n`
    })
  }
  
  // 总体错误
  if (result.errors.length > 0) {
    output += `\n❌ 总体错误:\n`
    result.errors.forEach(error => {
      output += `   - ${error}\n`
    })
  }
  
  return output
}

// ============================================================================
// 安全工具
// ============================================================================

/**
 * 安全地显示助记词（部分隐藏）
 */
export function maskMnemonic(mnemonic: string): string {
  const words = mnemonic.split(' ')
  if (words.length < 12) return '[INVALID_MNEMONIC]'
  
  // 显示前3个和后3个单词，中间用*替代
  const visible = [
    ...words.slice(0, 3),
    '*'.repeat(words.length - 6),
    ...words.slice(-3)
  ]
  
  return visible.join(' ')
}

/**
 * 验证助记词格式
 */
export function validateMnemonic(mnemonic: string): boolean {
  try {
    // 基本格式检查
    const words = mnemonic.trim().split(/\s+/)
    
    // 检查单词数量
    if (![12, 15, 18, 21, 24].includes(words.length)) {
      return false
    }
    
    // 检查是否包含非法字符
    const validWordPattern = /^[a-z]+$/
    return words.every(word => validWordPattern.test(word))
    
  } catch {
    return false
  }
}

/**
 * 生成钱包配置摘要（用于日志记录）
 */
export function generateWalletSummary(wallets: ChainMintingWallets): {
  mainWalletAddress: string
  relayWalletAddress: string
  addressTypes: {
    main: string
    relay: string
  }
  timestamp: number
} {
  return {
    mainWalletAddress: wallets.mainWallet.account.taproot.address,
    relayWalletAddress: wallets.relayWallet.account.nativeSegwit.address,
    addressTypes: {
      main: getAddressTypeName(AddressType.P2TR),
      relay: getAddressTypeName(AddressType.P2WPKH)
    },
    timestamp: Date.now()
  }
}