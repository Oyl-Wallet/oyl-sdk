/**
 * RPC客户端工厂
 *
 * 根据配置创建和管理不同类型的RPC客户端
 * 支持自动切换和故障转移
 */
import { IRpcClient, RpcConfig } from './rpcConfig';
/**
 * RPC客户端工厂
 */
export declare class RpcClientFactory {
    private static instance;
    private config;
    private cachedClients;
    private constructor();
    /**
     * 获取工厂单例
     */
    static getInstance(): RpcClientFactory;
    /**
     * 更新配置
     */
    updateConfig(config: RpcConfig): void;
    /**
     * 创建RPC客户端
     */
    createRpcClient(networkType?: string): IRpcClient;
    /**
     * 获取当前配置
     */
    getConfig(): RpcConfig;
    /**
     * 测试RPC连接
     */
    testConnection(networkType?: string): Promise<{
        success: boolean;
        provider: string;
        error?: string;
        info?: any;
    }>;
    /**
     * 获取支持的RPC提供者列表
     */
    static getSupportedProviders(): string[];
    /**
     * 重置工厂（清除缓存和重新加载配置）
     */
    reset(): void;
}
/**
 * 创建RPC客户端（便捷函数）
 */
export declare function createRpcClient(networkType?: string): IRpcClient;
/**
 * 测试RPC连接（便捷函数）
 */
export declare function testRpcConnection(networkType?: string): Promise<{
    success: boolean;
    provider: string;
    error?: string;
    info?: any;
}>;
/**
 * 获取当前RPC配置（便捷函数）
 */
export declare function getCurrentRpcConfig(): RpcConfig;
export { IRpcClient } from './rpcConfig';
export { BitcoinCoreRpcClient } from './bitcoinCoreRpc';
export { EsploraRpcClient } from './esploraRpc';
