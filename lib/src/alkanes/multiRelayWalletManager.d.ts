/**
 * Project Supercluster - 多中继钱包管理器
 *
 * 基于现有 walletManager.ts 的扩展，实现多中继钱包生成和管理
 * 100% 复用现有的钱包生成逻辑和验证机制
 */
import * as bitcoin from 'bitcoinjs-lib';
import { ChainMintingWallets, AddressType } from './chainMinting';
/**
 * 单个中继钱包信息
 */
export interface RelayWalletInfo {
    sliceIndex: number;
    wallet: ChainMintingWallets['relayWallet'];
    address: string;
    derivationIndex: number;
}
/**
 * 多中继钱包系统
 */
export interface MultiRelayWalletSystem {
    /** 主资金钱包 (复用现有结构) */
    mainWallet: ChainMintingWallets['mainWallet'];
    /** 中继钱包数组 */
    relayWallets: RelayWalletInfo[];
    /** 总分片数量 */
    totalSlices: number;
    /** 网络类型 */
    network: bitcoin.Network;
    /** 基础派生索引 */
    baseDerivatonIndex: number;
}
/**
 * 钱包系统摘要信息
 */
export interface WalletSystemSummary {
    mainWalletAddress: string;
    mainWalletType: AddressType;
    totalRelayWallets: number;
    relayAddresses: string[];
    derivationIndexRange: {
        min: number;
        max: number;
    };
    estimatedMaxMints: number;
    networkType: string;
    addressUniquenessCheck: boolean;
}
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
export declare function generateMultiRelayWallets(network: bitcoin.Network, totalMints: number, baseDerivatonIndex?: number): Promise<MultiRelayWalletSystem>;
/**
 * 验证多中继钱包系统的完整性
 */
export declare function validateMultiRelayWalletSystem(walletSystem: MultiRelayWalletSystem): {
    isValid: boolean;
    errors: string[];
    mainWalletType: AddressType;
    derivationIndexRange: {
        min: number;
        max: number;
    };
};
/**
 * 检查钱包地址唯一性 (快速检查版本)
 */
export declare function validateWalletUniqueness(walletSystem: MultiRelayWalletSystem): boolean;
/**
 * 获取钱包系统摘要信息
 */
export declare function getWalletSystemSummary(walletSystem: MultiRelayWalletSystem): WalletSystemSummary;
/**
 * 根据总铸造数量获取推荐的中继钱包配置
 */
export declare function getRecommendedWalletConfig(totalMints: number): {
    sliceCount: number;
    estimatedMaxIndex: number;
    memoryEstimate: string;
    recommendedBatchSize: number;
};
/**
 * 显示钱包系统详细信息 (调试用)
 */
export declare function displayWalletSystemInfo(walletSystem: MultiRelayWalletSystem): void;
