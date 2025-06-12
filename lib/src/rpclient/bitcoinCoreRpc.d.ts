/**
 * Bitcoin Core RPC 客户端
 *
 * 实现与Bitcoin Core节点的直接RPC通信
 * 支持基础认证和完整的RPC方法集
 */
import { IRpcClient, BitcoinCoreRpcConfig } from './rpcConfig';
/**
 * Bitcoin Core RPC客户端实现
 */
export declare class BitcoinCoreRpcClient implements IRpcClient {
    private config;
    constructor(config: BitcoinCoreRpcConfig);
    /**
     * 调用Bitcoin Core RPC方法
     */
    call(method: string, params?: any[]): Promise<any>;
    /**
     * 广播原始交易
     */
    sendRawTransaction(rawTx: string): Promise<string>;
    /**
     * 测试交易是否可以进入交易池
     */
    testMemPoolAccept(rawTx: string): Promise<boolean>;
    /**
     * 获取交易池条目信息
     */
    getMemPoolEntry(txId: string): Promise<any>;
    /**
     * 获取区块链信息
     */
    getBlockchainInfo(): Promise<any>;
    /**
     * 获取网络信息
     */
    getNetworkInfo(): Promise<any>;
    /**
     * 获取交易池信息
     */
    getMemPoolInfo(): Promise<any>;
    /**
     * 估算智能费率
     */
    estimateSmartFee(confTarget: number): Promise<any>;
}
