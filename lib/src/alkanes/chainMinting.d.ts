/**
 * Project Snowball - Alkane Chain Minting System
 *
 * 基于固定vout布局和隐式传递的链式铸造系统
 * 实现一次性铸造25枚Alkane代币并自动聚合到指定地址
 */
import { Account } from '../account';
import { Signer } from '../signer';
import { Provider } from '../provider/provider';
/**
 * 合约标识符
 */
export interface AlkaneContractId {
    block: string;
    tx: string;
}
/**
 * 钱包角色定义
 */
export interface ChainMintingWallets {
    /** 主资金钱包 - 提供初始资金，接收最终资产 */
    mainWallet: {
        account: Account;
        signer: Signer;
        role: 'funding' | 'receiver';
    };
    /** 中继钱包 - 中间交易签名和临时资产托管 */
    relayWallet: {
        account: Account;
        signer: Signer;
        role: 'relay';
    };
}
/**
 * 地址类型枚举
 */
export declare enum AddressType {
    P2PKH = "legacy",
    P2WPKH = "nativeSegwit",
    P2SH_P2WPKH = "nestedSegwit",
    P2TR = "taproot"
}
/**
 * Dust阈值常量
 */
export declare const DUST_LIMITS: {
    readonly nativeSegwit: 294;
    readonly taproot: 330;
    readonly nestedSegwit: 540;
    readonly legacy: 546;
};
/**
 * RBF配置常量
 */
export declare const RBF_CONFIG: {
    readonly ENABLED_SEQUENCE: 4294967293;
    readonly DISABLED_SEQUENCE: 4294967295;
};
/**
 * 单笔交易费用分析结果
 */
export interface TransactionFeeAnalysis {
    /** 交易虚拟大小 (vBytes) */
    vSize: number;
    /** 基础交易费用 (sats) */
    baseFee: number;
    /** 包含缓冲的总费用 (sats) */
    totalFee: number;
    /** 费率 (sat/vB) */
    feeRate: number;
}
/**
 * 完整的费用计算结果
 */
export interface ChainMintingFeeCalculation {
    /** 父交易费用分析 */
    parentTx: TransactionFeeAnalysis;
    /** 子交易费用分析 */
    childTx: TransactionFeeAnalysis;
    /** 子交易总数 */
    childCount: number;
    /** 所有子交易总费用 */
    totalChildFees: number;
    /** 中继UTXO需要的总金额 */
    relayFuelAmount: number;
    /** 主钱包需要的总金额 */
    totalRequiredFunding: number;
    /** 安全缓冲金额 */
    safetyBuffer: number;
}
/**
 * 标准vout布局定义
 */
export declare enum StandardVoutLayout {
    /** 接力/燃料输出 - 承载资产和剩余sats */
    RELAY_OUTPUT = 0,
    /** 指令中心 - OP_RETURN包含Protostone */
    INSTRUCTION_HUB = 1,
    /** 最终找零 - 仅父交易使用 */
    FINAL_CHANGE = 2
}
/**
 * Protostone消息配置
 */
export interface ProtostoneConfig {
    /** 协议标签 */
    protocolTag: bigint;
    /** 调用数据 - mint指令 */
    calldata: bigint[];
    /** 资产分配指针 */
    pointer: number;
    /** BTC找零指针 */
    refundPointer: number;
    /** 转移指令 - 链式铸造中应为空 */
    edicts: any[];
}
/**
 * 父交易构建参数
 */
export interface ParentTransactionConfig {
    /** 钱包配置 */
    wallets: ChainMintingWallets;
    /** 合约标识 */
    contractId: AlkaneContractId;
    /** 费用计算结果 */
    feeCalculation: ChainMintingFeeCalculation;
    /** 网络提供者 */
    provider: Provider;
}
/**
 * 子交易构建参数
 */
export interface ChildTransactionConfig {
    /** 父交易ID */
    parentTxId: string;
    /** 父交易vout=0的金额 */
    parentOutputValue: number;
    /** 交易索引 (1-24) */
    transactionIndex: number;
    /** 是否为最后一笔交易 */
    isLastTransaction: boolean;
    /** 最终接收地址 */
    finalReceiverAddress: string;
    /** 钱包配置 */
    wallets: ChainMintingWallets;
    /** 合约标识 */
    contractId: AlkaneContractId;
    /** 子交易费用 */
    childTxFee: number;
    /** 网络提供者 */
    provider: Provider;
}
/**
 * 构建的交易信息
 */
export interface BuiltTransaction {
    /** PSBT十六进制字符串 */
    psbtHex: string;
    /** 预期的交易ID */
    expectedTxId: string;
    /** vout=0的输出金额 */
    outputValue: number;
    /** 交易类型 */
    type: 'parent' | 'child';
    /** 交易索引 */
    index?: number;
}
/**
 * 广播配置
 */
export interface BroadcastConfig {
    /** 最大重试次数 */
    maxRetries: number;
    /** 重试间隔 (毫秒) */
    retryDelayMs: number;
    /** 确认超时时间 (毫秒) */
    confirmationTimeoutMs: number;
    /** 是否等待节点确认后再广播下一笔 */
    waitForAcceptance: boolean;
}
/**
 * 广播结果
 */
export interface BroadcastResult {
    /** 交易ID */
    txId: string;
    /** 广播时间戳 */
    timestamp: number;
    /** 重试次数 */
    retryCount: number;
    /** 是否成功 */
    success: boolean;
    /** 错误信息 */
    error?: string;
}
/**
 * 批量广播结果
 */
export interface BatchBroadcastResult {
    /** 父交易广播结果 */
    parentTx: BroadcastResult;
    /** 子交易广播结果列表 */
    childTxs: BroadcastResult[];
    /** 总成功数量 */
    successCount: number;
    /** 总失败数量 */
    failureCount: number;
    /** 是否全部成功 */
    allSuccessful: boolean;
}
/**
 * 交易链验证结果
 */
export interface ChainValidationResult {
    /** 验证是否通过 */
    isValid: boolean;
    /** 链条完整性检查 */
    chainIntegrity: {
        isValid: boolean;
        brokenAtIndex?: number;
        details: string;
    };
    /** 资产余额验证 */
    assetBalance: {
        expected: number;
        actual: number;
        isCorrect: boolean;
        finalBalance: string;
    };
    /** 最终接收地址验证 */
    finalReceiver: {
        expected: string;
        actual: string;
        isCorrect: boolean;
    };
    /** 错误列表 */
    errors: string[];
    /** 警告列表 */
    warnings: string[];
}
/**
 * 单个交易验证信息
 */
export interface TransactionValidation {
    /** 交易ID */
    txId: string;
    /** 交易类型 */
    type: 'parent' | 'child';
    /** 交易索引 */
    index: number;
    /** 是否确认 */
    confirmed: boolean;
    /** 输入验证 */
    inputValidation: {
        expectedParent?: string;
        actualParent?: string;
        isCorrect: boolean;
    };
    /** 输出验证 */
    outputValidation: {
        voutCount: number;
        relayOutputCorrect: boolean;
        opReturnPresent: boolean;
    };
}
/**
 * 链式铸造执行参数
 */
export interface ChainMintingExecutionParams {
    /** 目标合约标识 */
    contractId: AlkaneContractId;
    /** 最终接收地址 */
    finalReceiverAddress: string;
    /** 费率 (sat/vB) */
    feeRate?: number;
    /** 子交易数量 (默认24) */
    childCount?: number;
    /** 主钱包助记词 */
    mainWalletMnemonic: string;
    /** 网络类型 */
    network: 'bitcoin' | 'testnet' | 'regtest';
    /** 广播配置 */
    broadcastConfig?: Partial<BroadcastConfig>;
    /** 是否执行验证 */
    enableValidation?: boolean;
}
/**
 * 链式铸造执行结果
 */
export interface ChainMintingExecutionResult {
    /** 执行是否成功 */
    success: boolean;
    /** 执行开始时间 */
    startTime: number;
    /** 执行结束时间 */
    endTime: number;
    /** 总耗时 (毫秒) */
    duration: number;
    /** 费用计算结果 */
    feeCalculation: ChainMintingFeeCalculation;
    /** 使用的钱包信息 */
    wallets: {
        mainAddress: string;
        relayAddress: string;
    };
    /** 广播结果 */
    broadcastResult: BatchBroadcastResult;
    /** 验证结果 */
    validationResult?: ChainValidationResult;
    /** 最终统计 */
    summary: {
        totalTransactions: number;
        totalTokensMinted: number;
        totalFeePaid: number;
        finalReceiverAddress: string;
        finalTokenBalance: string;
    };
    /** 错误信息 */
    error?: {
        code: string;
        message: string;
        phase: 'preparation' | 'building' | 'signing' | 'broadcasting' | 'validation';
        details?: any;
    };
}
/**
 * 链式铸造错误类型
 */
export declare enum ChainMintingErrorType {
    INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
    INVALID_ADDRESS_TYPE = "INVALID_ADDRESS_TYPE",
    DUST_THRESHOLD_VIOLATION = "DUST_THRESHOLD_VIOLATION",
    FEE_CALCULATION_ERROR = "FEE_CALCULATION_ERROR",
    TRANSACTION_BUILD_ERROR = "TRANSACTION_BUILD_ERROR",
    SIGNING_ERROR = "SIGNING_ERROR",
    BROADCAST_ERROR = "BROADCAST_ERROR",
    VALIDATION_ERROR = "VALIDATION_ERROR",
    CHAIN_INTEGRITY_ERROR = "CHAIN_INTEGRITY_ERROR",
    ASSET_BALANCE_ERROR = "ASSET_BALANCE_ERROR",
    NETWORK_ERROR = "NETWORK_ERROR",
    TIMEOUT_ERROR = "TIMEOUT_ERROR",
    EXECUTION_ERROR = "EXECUTION_ERROR",
    VERIFICATION_ERROR = "VERIFICATION_ERROR"
}
/**
 * 链式铸造错误类
 */
export declare class ChainMintingError extends Error {
    type: ChainMintingErrorType;
    details?: any;
    constructor(type: ChainMintingErrorType, message: string, details?: any);
}
/**
 * 默认广播配置
 */
export declare const DEFAULT_BROADCAST_CONFIG: BroadcastConfig;
/**
 * 默认执行参数
 */
export declare const DEFAULT_EXECUTION_PARAMS: {
    feeRate: number;
    childCount: number;
    network: "regtest";
    enableValidation: boolean;
    broadcastConfig: BroadcastConfig;
};
/**
 * 安全参数
 */
export declare const SAFETY_PARAMS: {
    /** 费用计算安全缓冲 (sats) */
    FEE_BUFFER: number;
    /** 最小交易确认等待时间 (毫秒) */
    MIN_CONFIRMATION_WAIT: number;
    /** 最大交易链长度 */
    MAX_CHAIN_LENGTH: number;
    /** 最小费率 (sat/vB) */
    MIN_FEE_RATE: number;
    /** 最大费率 (sat/vB) */
    MAX_FEE_RATE: number;
};
export { performDryRunFeeCalculation, calculateActualTransactionFees, compareFeeCalculations, formatFeeCalculationResult, HARDCODED_TRANSACTION_SIZES } from './feeCalculation';
export { generateChainMintingWallets, generateChainMintingWalletsFromEnv, validateWalletConfiguration, detectAddressType, validateAddressType, validateDustThreshold, getAddressTypeName, maskMnemonic, validateMnemonic, type WalletGenerationConfig, type WalletValidationResult } from './walletManager';
export { validateParentTransactionOutputs, validateParentTransactionFees, formatParentTransactionResult, calculateActualParentFee, validateParentTransactionParams, generateParentTransactionSummary, buildChildTransaction, validateChildTransactionOutputs, validateChildTransactionChain, calculateChildChainStatistics, formatChildChainResult, generateChildChainSummary } from './transactionBuilder';
export { broadcastSingleTransaction, waitForTransactionAcceptance, broadcastTransactionChain } from './transactionBroadcaster';
/**
 * 链式铸造系统主要接口
 */
export interface IChainMintingSystem {
    /**
     * 执行完整的链式铸造流程
     */
    execute(params: ChainMintingExecutionParams): Promise<ChainMintingExecutionResult>;
    /**
     * 计算费用需求
     */
    calculateFees(contractId: AlkaneContractId, feeRate: number, childCount: number, provider: Provider): Promise<ChainMintingFeeCalculation>;
    /**
     * 验证链式交易结果
     */
    validateChain(parentTxId: string, childTxIds: string[], contractId: AlkaneContractId, finalReceiverAddress: string, expectedTokenCount: number, provider: Provider): Promise<ChainValidationResult>;
}
