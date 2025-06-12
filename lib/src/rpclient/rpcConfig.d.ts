/**
 * RPC 配置管理模块
 *
 * 支持从.env文件读取自定义RPC配置，实现灵活的交易广播方案
 * 支持Bitcoin Core RPC、Esplora API、自定义RPC等多种后端
 */
/**
 * RPC提供者类型
 */
export type RpcProviderType = 'sandshrew' | 'bitcoin-core' | 'esplora' | 'custom';
/**
 * Bitcoin Core RPC配置
 */
export interface BitcoinCoreRpcConfig {
    url: string;
    username: string;
    password: string;
    timeout?: number;
}
/**
 * Esplora API配置
 */
export interface EsploraRpcConfig {
    url: string;
    apiKey?: string;
    timeout?: number;
}
/**
 * 自定义RPC配置
 */
export interface CustomRpcConfig {
    url: string;
    apiKey?: string;
    headers?: Record<string, string>;
    timeout?: number;
}
/**
 * 完整的RPC配置
 */
export interface RpcConfig {
    provider: RpcProviderType;
    bitcoinCore?: BitcoinCoreRpcConfig;
    esplora?: EsploraRpcConfig;
    custom?: CustomRpcConfig;
    networkSpecific?: {
        mainnet?: string;
        testnet?: string;
        regtest?: string;
        signet?: string;
    };
}
/**
 * RPC客户端接口
 */
export interface IRpcClient {
    /**
     * 广播原始交易
     */
    sendRawTransaction(rawTx: string): Promise<string>;
    /**
     * 测试交易是否可以进入交易池
     */
    testMemPoolAccept?(rawTx: string): Promise<boolean>;
    /**
     * 获取交易池信息
     */
    getMemPoolEntry?(txId: string): Promise<any>;
}
/**
 * 从环境变量读取RPC配置
 */
export declare function loadRpcConfigFromEnv(): RpcConfig;
/**
 * 获取当前网络的RPC URL
 */
export declare function getRpcUrlForNetwork(config: RpcConfig, networkType: string): string | undefined;
/**
 * 验证RPC配置的有效性
 */
export declare function validateRpcConfig(config: RpcConfig): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
};
/**
 * 创建默认的RPC配置
 */
export declare function createDefaultRpcConfig(): RpcConfig;
/**
 * 合并RPC配置
 */
export declare function mergeRpcConfigs(base: RpcConfig, override: Partial<RpcConfig>): RpcConfig;
/**
 * 格式化RPC配置信息（隐藏敏感信息）
 */
export declare function formatRpcConfig(config: RpcConfig): string;
/**
 * 打印RPC配置摘要
 */
export declare function printRpcConfigSummary(config: RpcConfig): void;
export { loadRpcConfigFromEnv as loadRpcConfig };
