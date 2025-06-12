/**
 * Esplora RPC 客户端
 *
 * 实现基于Esplora API的交易广播
 * 支持Blockstream API和其他兼容的Esplora实例
 */
import { IRpcClient, EsploraRpcConfig } from './rpcConfig';
/**
 * Esplora RPC客户端实现
 */
export declare class EsploraRpcClient implements IRpcClient {
    private config;
    constructor(config: EsploraRpcConfig);
    /**
     * 构建请求headers
     */
    private getHeaders;
    /**
     * 广播原始交易
     */
    sendRawTransaction(rawTx: string): Promise<string>;
    /**
     * 测试交易是否有效（Esplora不支持testmempoolaccept，所以我们尝试解析交易）
     */
    testMemPoolAccept(rawTx: string): Promise<boolean>;
    /**
     * 获取交易信息（模拟getmempoolentry）
     */
    getMemPoolEntry(txId: string): Promise<any>;
    /**
     * 获取费率推荐
     */
    getFeeEstimates(): Promise<any>;
    /**
     * 获取交易池统计
     */
    getMempoolStats(): Promise<any>;
    /**
     * 获取区块链信息
     */
    getBlockchainInfo(): Promise<any>;
}
