/**
 * RPC客户端工厂
 * 
 * 根据配置创建和管理不同类型的RPC客户端
 * 支持自动切换和故障转移
 */

import { IRpcClient, RpcConfig, loadRpcConfig } from './rpcConfig'
import { BitcoinCoreRpcClient } from './bitcoinCoreRpc'
import { EsploraRpcClient } from './esploraRpc'
import { SandshrewBitcoinClient } from './sandshrew'

/**
 * 自定义RPC客户端（用于用户自定义的HTTP API）
 */
class CustomRpcClient implements IRpcClient {
  private config: any
  
  constructor(config: any) {
    this.config = config
  }
  
  async sendRawTransaction(rawTx: string): Promise<string> {
    const fetch = require('node-fetch')
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`
    }
    
    if (this.config.headers) {
      Object.assign(headers, this.config.headers)
    }
    
    const response = await fetch(this.config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ rawTx }),
      timeout: this.config.timeout || 30000
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`自定义RPC广播失败 (${response.status}): ${errorText}`)
    }
    
    const result = await response.json()
    return result.txId || result.txid || result.result
  }
  
  async testMemPoolAccept(rawTx: string): Promise<boolean> {
    return true // 简化实现
  }
  
  async getMemPoolEntry(txId: string): Promise<any> {
    return {} // 简化实现
  }
}

/**
 * Sandshrew适配器（包装现有的SandshrewBitcoinClient）
 */
class SandshrewRpcAdapter implements IRpcClient {
  private client: SandshrewBitcoinClient
  
  constructor(apiUrl: string) {
    this.client = new SandshrewBitcoinClient(apiUrl)
  }
  
  async sendRawTransaction(rawTx: string): Promise<string> {
    return await this.client.bitcoindRpc.sendRawTransaction(rawTx)
  }
  
  async testMemPoolAccept(rawTx: string): Promise<boolean> {
    const result = await this.client.bitcoindRpc.testMemPoolAccept([rawTx])
    return result[0]?.allowed || false
  }
  
  async getMemPoolEntry(txId: string): Promise<any> {
    return await this.client.bitcoindRpc.getMemPoolEntry(txId)
  }
}

// ============================================================================
// RPC工厂类
// ============================================================================

/**
 * RPC客户端工厂
 */
export class RpcClientFactory {
  private static instance: RpcClientFactory
  private config: RpcConfig
  private cachedClients: Map<string, IRpcClient> = new Map()
  
  private constructor() {
    this.config = loadRpcConfig()
  }
  
  /**
   * 获取工厂单例
   */
  static getInstance(): RpcClientFactory {
    if (!RpcClientFactory.instance) {
      RpcClientFactory.instance = new RpcClientFactory()
    }
    return RpcClientFactory.instance
  }
  
  /**
   * 更新配置
   */
  updateConfig(config: RpcConfig): void {
    this.config = config
    this.cachedClients.clear() // 清除缓存的客户端
  }
  
  /**
   * 创建RPC客户端
   */
  createRpcClient(networkType?: string): IRpcClient {
    const cacheKey = `${this.config.provider}-${networkType || 'default'}`
    
    // 检查缓存
    if (this.cachedClients.has(cacheKey)) {
      return this.cachedClients.get(cacheKey)!
    }
    
    let client: IRpcClient
    
    switch (this.config.provider) {
      case 'bitcoin-core':
        if (!this.config.bitcoinCore) {
          throw new Error('Bitcoin Core配置未找到')
        }
        client = new BitcoinCoreRpcClient(this.config.bitcoinCore)
        break
        
      case 'esplora':
        if (!this.config.esplora) {
          throw new Error('Esplora配置未找到')
        }
        client = new EsploraRpcClient(this.config.esplora)
        break
        
      case 'custom':
        if (!this.config.custom) {
          throw new Error('自定义RPC配置未找到')
        }
        client = new CustomRpcClient(this.config.custom)
        break
        
      case 'sandshrew':
      default:
        // 回退到Sandshrew（需要从环境变量构建URL）
        const projectId = process.env.SANDSHREW_PROJECT_ID || ''
        const baseUrl = process.env.SANDSHREW_API_URL || 'https://sandshrew.io'
        const apiUrl = `${baseUrl}/v1/${projectId}`
        client = new SandshrewRpcAdapter(apiUrl)
        break
    }
    
    // 缓存客户端
    this.cachedClients.set(cacheKey, client)
    
    return client
  }
  
  /**
   * 获取当前配置
   */
  getConfig(): RpcConfig {
    return { ...this.config }
  }
  
  /**
   * 测试RPC连接
   */
  async testConnection(networkType?: string): Promise<{
    success: boolean
    provider: string
    error?: string
    info?: any
  }> {
    try {
      const client = this.createRpcClient(networkType)
      
      // 尝试调用一个简单的方法来测试连接
      if ('getBlockchainInfo' in client) {
        const info = await (client as any).getBlockchainInfo()
        return {
          success: true,
          provider: this.config.provider,
          info
        }
      } else {
        // 对于不支持getBlockchainInfo的客户端，尝试testMemPoolAccept
        await client.testMemPoolAccept?.('dummy')
        return {
          success: true,
          provider: this.config.provider
        }
      }
    } catch (error) {
      return {
        success: false,
        provider: this.config.provider,
        error: error.message
      }
    }
  }
  
  /**
   * 获取支持的RPC提供者列表
   */
  static getSupportedProviders(): string[] {
    return ['sandshrew', 'bitcoin-core', 'esplora', 'custom']
  }
  
  /**
   * 重置工厂（清除缓存和重新加载配置）
   */
  reset(): void {
    this.cachedClients.clear()
    this.config = loadRpcConfig()
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建RPC客户端（便捷函数）
 */
export function createRpcClient(networkType?: string): IRpcClient {
  return RpcClientFactory.getInstance().createRpcClient(networkType)
}

/**
 * 测试RPC连接（便捷函数）
 */
export async function testRpcConnection(networkType?: string): Promise<{
  success: boolean
  provider: string
  error?: string
  info?: any
}> {
  return RpcClientFactory.getInstance().testConnection(networkType)
}

/**
 * 获取当前RPC配置（便捷函数）
 */
export function getCurrentRpcConfig(): RpcConfig {
  return RpcClientFactory.getInstance().getConfig()
}

// ============================================================================
// 导出
// ============================================================================

export { IRpcClient } from './rpcConfig'
export { BitcoinCoreRpcClient } from './bitcoinCoreRpc'
export { EsploraRpcClient } from './esploraRpc'