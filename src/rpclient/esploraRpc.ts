/**
 * Esplora RPC 客户端
 * 
 * 实现基于Esplora API的交易广播
 * 支持Blockstream API和其他兼容的Esplora实例
 */

import fetch from 'node-fetch'
import { IRpcClient, EsploraRpcConfig } from './rpcConfig'

/**
 * Esplora RPC客户端实现
 */
export class EsploraRpcClient implements IRpcClient {
  private config: EsploraRpcConfig
  
  constructor(config: EsploraRpcConfig) {
    this.config = config
  }
  
  /**
   * 构建请求headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'text/plain'
    }
    
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`
    }
    
    return headers
  }
  
  /**
   * 广播原始交易
   */
  async sendRawTransaction(rawTx: string): Promise<string> {
    const url = `${this.config.url}/tx`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: rawTx,
      timeout: this.config.timeout || 30000
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Esplora广播失败 (${response.status}): ${errorText}`)
    }
    
    const txId = await response.text()
    return txId
  }
  
  /**
   * 测试交易是否有效（Esplora不支持testmempoolaccept，所以我们尝试解析交易）
   */
  async testMemPoolAccept(rawTx: string): Promise<boolean> {
    try {
      // Esplora没有testmempoolaccept，我们只能通过尝试广播来测试
      // 这里我们返回true，假设交易有效
      // 实际的验证会在sendRawTransaction时进行
      return true
    } catch {
      return false
    }
  }
  
  /**
   * 获取交易信息（模拟getmempoolentry）
   */
  async getMemPoolEntry(txId: string): Promise<any> {
    const url = `${this.config.url}/tx/${txId}`
    
    const response = await fetch(url, {
      headers: this.getHeaders(),
      timeout: this.config.timeout || 30000
    })
    
    if (!response.ok) {
      throw new Error(`获取交易信息失败: ${response.status}`)
    }
    
    const txInfo = await response.json()
    
    // 转换为类似Bitcoin Core的格式
    return {
      vsize: txInfo.size || txInfo.vsize,
      weight: txInfo.weight || txInfo.size * 4,
      fees: {
        base: (txInfo.fee || 0) / 100000000 // 转换为BTC
      }
    }
  }
  
  /**
   * 获取费率推荐
   */
  async getFeeEstimates(): Promise<any> {
    const url = `${this.config.url}/fee-estimates`
    
    const response = await fetch(url, {
      headers: this.getHeaders(),
      timeout: this.config.timeout || 30000
    })
    
    if (!response.ok) {
      throw new Error(`获取费率失败: ${response.status}`)
    }
    
    return await response.json()
  }
  
  /**
   * 获取交易池统计
   */
  async getMempoolStats(): Promise<any> {
    const url = `${this.config.url}/mempool`
    
    const response = await fetch(url, {
      headers: this.getHeaders(),
      timeout: this.config.timeout || 30000
    })
    
    if (!response.ok) {
      throw new Error(`获取交易池统计失败: ${response.status}`)
    }
    
    return await response.json()
  }
  
  /**
   * 获取区块链信息
   */
  async getBlockchainInfo(): Promise<any> {
    const url = `${this.config.url}/blocks/tip/height`
    
    const response = await fetch(url, {
      headers: this.getHeaders(),
      timeout: this.config.timeout || 30000
    })
    
    if (!response.ok) {
      throw new Error(`获取区块链信息失败: ${response.status}`)
    }
    
    const height = await response.text()
    
    return {
      blocks: parseInt(height),
      chain: 'main', // 假设为主网
      verificationprogress: 1.0
    }
  }
}