/**
 * RPC 配置管理模块
 * 
 * 支持从.env文件读取自定义RPC配置，实现灵活的交易广播方案
 * 支持Bitcoin Core RPC、Esplora API、自定义RPC等多种后端
 */

import * as dotenv from 'dotenv'
import * as bitcoin from 'bitcoinjs-lib'

// 加载环境变量
dotenv.config()

// ============================================================================
// RPC配置类型定义
// ============================================================================

/**
 * RPC提供者类型
 */
export type RpcProviderType = 'sandshrew' | 'bitcoin-core' | 'esplora' | 'custom'

/**
 * Bitcoin Core RPC配置
 */
export interface BitcoinCoreRpcConfig {
  url: string
  username: string
  password: string
  timeout?: number
}

/**
 * Esplora API配置
 */
export interface EsploraRpcConfig {
  url: string
  apiKey?: string
  timeout?: number
}

/**
 * 自定义RPC配置
 */
export interface CustomRpcConfig {
  url: string
  apiKey?: string
  headers?: Record<string, string>
  timeout?: number
}

/**
 * 完整的RPC配置
 */
export interface RpcConfig {
  provider: RpcProviderType
  bitcoinCore?: BitcoinCoreRpcConfig
  esplora?: EsploraRpcConfig
  custom?: CustomRpcConfig
  networkSpecific?: {
    mainnet?: string
    testnet?: string
    regtest?: string
    signet?: string
  }
}

/**
 * RPC客户端接口
 */
export interface IRpcClient {
  /**
   * 广播原始交易
   */
  sendRawTransaction(rawTx: string): Promise<string>
  
  /**
   * 测试交易是否可以进入交易池
   */
  testMemPoolAccept?(rawTx: string): Promise<boolean>
  
  /**
   * 获取交易池信息
   */
  getMemPoolEntry?(txId: string): Promise<any>
}

// ============================================================================
// 配置读取功能
// ============================================================================

/**
 * 从环境变量读取RPC配置
 */
export function loadRpcConfigFromEnv(): RpcConfig {
  const provider = (process.env.RPC_PROVIDER || 'sandshrew') as RpcProviderType
  
  const config: RpcConfig = { provider }
  
  // Bitcoin Core配置
  if (process.env.BITCOIN_RPC_URL) {
    config.bitcoinCore = {
      url: process.env.BITCOIN_RPC_URL,
      username: process.env.BITCOIN_RPC_USERNAME || 'bitcoin',
      password: process.env.BITCOIN_RPC_PASSWORD || '',
      timeout: parseInt(process.env.BITCOIN_RPC_TIMEOUT || '30000')
    }
  }
  
  // Esplora配置
  if (process.env.ESPLORA_API_URL) {
    config.esplora = {
      url: process.env.ESPLORA_API_URL,
      apiKey: process.env.ESPLORA_API_KEY,
      timeout: parseInt(process.env.ESPLORA_RPC_TIMEOUT || '30000')
    }
  }
  
  // 自定义RPC配置
  if (process.env.CUSTOM_RPC_URL) {
    config.custom = {
      url: process.env.CUSTOM_RPC_URL,
      apiKey: process.env.CUSTOM_RPC_API_KEY,
      timeout: parseInt(process.env.CUSTOM_RPC_TIMEOUT || '30000')
    }
  }
  
  // 网络特定配置
  config.networkSpecific = {
    mainnet: process.env.MAINNET_RPC_URL,
    testnet: process.env.TESTNET_RPC_URL,
    regtest: process.env.REGTEST_RPC_URL,
    signet: process.env.SIGNET_RPC_URL
  }
  
  return config
}

/**
 * 获取当前网络的RPC URL
 */
export function getRpcUrlForNetwork(
  config: RpcConfig,
  networkType: string
): string | undefined {
  const networkSpecific = config.networkSpecific?.[networkType]
  if (networkSpecific) {
    return networkSpecific
  }
  
  // 回退到主配置
  switch (config.provider) {
    case 'bitcoin-core':
      return config.bitcoinCore?.url
    case 'esplora':
      return config.esplora?.url
    case 'custom':
      return config.custom?.url
    default:
      return undefined
  }
}

// ============================================================================
// 验证功能
// ============================================================================

/**
 * 验证RPC配置的有效性
 */
export function validateRpcConfig(config: RpcConfig): {
  isValid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []
  
  // 检查基本配置
  if (!config.provider) {
    errors.push('RPC提供者类型未指定')
  }
  
  // 验证具体的提供者配置
  switch (config.provider) {
    case 'bitcoin-core':
      if (!config.bitcoinCore?.url) {
        errors.push('Bitcoin Core RPC URL未配置')
      }
      if (!config.bitcoinCore?.username) {
        warnings.push('Bitcoin Core RPC用户名未配置，将使用默认值')
      }
      if (!config.bitcoinCore?.password) {
        warnings.push('Bitcoin Core RPC密码未配置')
      }
      break
      
    case 'esplora':
      if (!config.esplora?.url) {
        errors.push('Esplora API URL未配置')
      }
      break
      
    case 'custom':
      if (!config.custom?.url) {
        errors.push('自定义RPC URL未配置')
      }
      break
      
    case 'sandshrew':
      // Sandshrew使用现有配置，无需额外验证
      break
      
    default:
      errors.push(`不支持的RPC提供者类型: ${config.provider}`)
  }
  
  // 验证URL格式
  const urlToCheck = getRpcUrlForNetwork(config, 'mainnet')
  if (urlToCheck && !isValidUrl(urlToCheck)) {
    errors.push(`无效的RPC URL格式: ${urlToCheck}`)
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * 验证URL格式
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

// ============================================================================
// 配置工厂
// ============================================================================

/**
 * 创建默认的RPC配置
 */
export function createDefaultRpcConfig(): RpcConfig {
  return {
    provider: 'sandshrew'
  }
}

/**
 * 合并RPC配置
 */
export function mergeRpcConfigs(
  base: RpcConfig,
  override: Partial<RpcConfig>
): RpcConfig {
  return {
    ...base,
    ...override,
    bitcoinCore: {
      ...base.bitcoinCore,
      ...override.bitcoinCore
    },
    esplora: {
      ...base.esplora,
      ...override.esplora
    },
    custom: {
      ...base.custom,
      ...override.custom
    },
    networkSpecific: {
      ...base.networkSpecific,
      ...override.networkSpecific
    }
  }
}

// ============================================================================
// 调试和工具函数
// ============================================================================

/**
 * 格式化RPC配置信息（隐藏敏感信息）
 */
export function formatRpcConfig(config: RpcConfig): string {
  const safeConfig = {
    provider: config.provider,
    bitcoinCore: config.bitcoinCore ? {
      url: config.bitcoinCore.url,
      username: config.bitcoinCore.username,
      password: config.bitcoinCore.password ? '***' : undefined,
      timeout: config.bitcoinCore.timeout
    } : undefined,
    esplora: config.esplora ? {
      url: config.esplora.url,
      apiKey: config.esplora.apiKey ? '***' : undefined,
      timeout: config.esplora.timeout
    } : undefined,
    custom: config.custom ? {
      url: config.custom.url,
      apiKey: config.custom.apiKey ? '***' : undefined,
      timeout: config.custom.timeout
    } : undefined,
    networkSpecific: config.networkSpecific
  }
  
  return JSON.stringify(safeConfig, null, 2)
}

/**
 * 打印RPC配置摘要
 */
export function printRpcConfigSummary(config: RpcConfig): void {
  console.log(`🔧 RPC配置摘要:`)
  console.log(`   提供者: ${config.provider}`)
  
  const validation = validateRpcConfig(config)
  if (validation.isValid) {
    console.log(`   ✅ 配置有效`)
  } else {
    console.log(`   ❌ 配置无效:`)
    validation.errors.forEach(error => console.log(`      - ${error}`))
  }
  
  if (validation.warnings.length > 0) {
    console.log(`   ⚠️  警告:`)
    validation.warnings.forEach(warning => console.log(`      - ${warning}`))
  }
}

// ============================================================================
// 导出主要功能
// ============================================================================

export {
  loadRpcConfigFromEnv as loadRpcConfig
}