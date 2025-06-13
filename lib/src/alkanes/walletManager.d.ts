/**
 * 钱包生成和地址类型验证模块
 *
 * 负责生成主钱包和中继钱包，验证地址类型，确保符合链式铸造的要求
 * 强制使用P2WPKH作为中继地址以获得最低交易费用
 */
import * as bitcoin from 'bitcoinjs-lib';
import { ChainMintingWallets, AddressType } from './chainMinting';
/**
 * 检测地址类型
 */
export declare function detectAddressType(address: string, _network?: bitcoin.Network): AddressType;
/**
 * 验证地址是否为指定类型
 */
export declare function validateAddressType(address: string, expectedType: AddressType, network: bitcoin.Network): boolean;
/**
 * 验证地址是否符合最低dust阈值
 */
export declare function validateDustThreshold(amount: number, addressType: AddressType): void;
/**
 * 获取地址类型的可读名称
 */
export declare function getAddressTypeName(addressType: AddressType): string;
/**
 * 钱包生成配置
 */
export interface WalletGenerationConfig {
    /** 批量铸造助记词（从环境变量BATCH_MINT_MNEMONIC获取） */
    batchMintMnemonic: string;
    /** 网络类型 */
    network: bitcoin.Network;
    /** 中继钱包索引（随机生成，避免地址冲突） */
    relayWalletIndex?: number;
}
/**
 * 钱包验证结果
 */
export interface WalletValidationResult {
    /** 验证是否通过 */
    isValid: boolean;
    /** 主钱包验证 */
    mainWallet: {
        address: string;
        addressType: AddressType;
        isValid: boolean;
        errors: string[];
    };
    /** 中继钱包验证 */
    relayWallet: {
        address: string;
        addressType: AddressType;
        isValid: boolean;
        errors: string[];
    };
    /** 总体错误列表 */
    errors: string[];
}
/**
 * 生成链式铸造钱包系统
 */
export declare function generateChainMintingWallets(config: WalletGenerationConfig): Promise<ChainMintingWallets & {
    relayWalletIndex: number;
}>;
/**
 * 从环境变量生成链式铸造钱包系统
 *
 * 从.env文件中读取BATCH_MINT_MNEMONIC生成钱包
 */
export declare function generateChainMintingWalletsFromEnv(network: bitcoin.Network, relayWalletIndex?: number): Promise<ChainMintingWallets & {
    relayWalletIndex: number;
}>;
/**
 * 验证钱包配置
 */
export declare function validateWalletConfiguration(wallets: ChainMintingWallets, network: bitcoin.Network): WalletValidationResult;
/**
 * 安全地显示助记词（部分隐藏）
 */
export declare function maskMnemonic(mnemonic: string): string;
/**
 * 验证助记词格式
 */
export declare function validateMnemonic(mnemonic: string): boolean;
