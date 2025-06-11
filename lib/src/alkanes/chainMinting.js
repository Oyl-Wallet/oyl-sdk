"use strict";
/**
 * Project Snowball - Alkane Chain Minting System
 *
 * 基于固定vout布局和隐式传递的链式铸造系统
 * 实现一次性铸造25枚Alkane代币并自动聚合到指定地址
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBroadcastSummary = exports.formatBatchBroadcastResult = exports.monitorTransactionChainStatus = exports.smartBroadcastTransactionChain = exports.broadcastChildTransactionsInParallel = exports.broadcastTransactionChain = exports.waitForTransactionAcceptance = exports.broadcastSingleTransaction = exports.generateChildChainSummary = exports.formatChildChainResult = exports.calculateChildChainStatistics = exports.validateChildTransactionChain = exports.validateChildTransactionOutputs = exports.buildChildTransactionChain = exports.buildChildTransaction = exports.generateParentTransactionSummary = exports.validateParentTransactionParams = exports.calculateActualParentFee = exports.formatParentTransactionResult = exports.validateParentTransactionFees = exports.validateParentTransactionOutputs = exports.buildParentTransactionSimple = exports.buildParentTransaction = exports.generateWalletSummary = exports.validateMnemonic = exports.maskMnemonic = exports.formatValidationResult = exports.formatWalletInfo = exports.getAddressTypeName = exports.validateDustThreshold = exports.validateAddressType = exports.detectAddressType = exports.validateWalletConfiguration = exports.generateChainMintingWalletsFromEnv = exports.generateChainMintingWallets = exports.HARDCODED_TRANSACTION_SIZES = exports.formatFeeCalculationResult = exports.compareFeeCalculations = exports.calculateActualTransactionFees = exports.performDryRunFeeCalculation = exports.SAFETY_PARAMS = exports.DEFAULT_EXECUTION_PARAMS = exports.DEFAULT_BROADCAST_CONFIG = exports.ChainMintingError = exports.ChainMintingErrorType = exports.StandardVoutLayout = exports.RBF_CONFIG = exports.DUST_LIMITS = exports.AddressType = void 0;
/**
 * 地址类型枚举
 */
var AddressType;
(function (AddressType) {
    AddressType["P2PKH"] = "legacy";
    AddressType["P2WPKH"] = "nativeSegwit";
    AddressType["P2SH_P2WPKH"] = "nestedSegwit";
    AddressType["P2TR"] = "taproot";
})(AddressType = exports.AddressType || (exports.AddressType = {}));
/**
 * Dust阈值常量
 */
exports.DUST_LIMITS = {
    [AddressType.P2WPKH]: 294,
    [AddressType.P2TR]: 330,
    [AddressType.P2SH_P2WPKH]: 540,
    [AddressType.P2PKH]: 546 // Legacy最低阈值
};
/**
 * RBF配置常量
 */
exports.RBF_CONFIG = {
    ENABLED_SEQUENCE: 0xfffffffd,
    DISABLED_SEQUENCE: 0xffffffff, // 禁用RBF的nSequence值
};
// ============================================================================
// 交易构建相关类型
// ============================================================================
/**
 * 标准vout布局定义
 */
var StandardVoutLayout;
(function (StandardVoutLayout) {
    /** 接力/燃料输出 - 承载资产和剩余sats */
    StandardVoutLayout[StandardVoutLayout["RELAY_OUTPUT"] = 0] = "RELAY_OUTPUT";
    /** 指令中心 - OP_RETURN包含Protostone */
    StandardVoutLayout[StandardVoutLayout["INSTRUCTION_HUB"] = 1] = "INSTRUCTION_HUB";
    /** 最终找零 - 仅父交易使用 */
    StandardVoutLayout[StandardVoutLayout["FINAL_CHANGE"] = 2] = "FINAL_CHANGE";
})(StandardVoutLayout = exports.StandardVoutLayout || (exports.StandardVoutLayout = {}));
// ============================================================================
// 错误类型定义
// ============================================================================
/**
 * 链式铸造错误类型
 */
var ChainMintingErrorType;
(function (ChainMintingErrorType) {
    ChainMintingErrorType["INSUFFICIENT_FUNDS"] = "INSUFFICIENT_FUNDS";
    ChainMintingErrorType["INVALID_ADDRESS_TYPE"] = "INVALID_ADDRESS_TYPE";
    ChainMintingErrorType["DUST_THRESHOLD_VIOLATION"] = "DUST_THRESHOLD_VIOLATION";
    ChainMintingErrorType["FEE_CALCULATION_ERROR"] = "FEE_CALCULATION_ERROR";
    ChainMintingErrorType["TRANSACTION_BUILD_ERROR"] = "TRANSACTION_BUILD_ERROR";
    ChainMintingErrorType["SIGNING_ERROR"] = "SIGNING_ERROR";
    ChainMintingErrorType["BROADCAST_ERROR"] = "BROADCAST_ERROR";
    ChainMintingErrorType["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ChainMintingErrorType["CHAIN_INTEGRITY_ERROR"] = "CHAIN_INTEGRITY_ERROR";
    ChainMintingErrorType["ASSET_BALANCE_ERROR"] = "ASSET_BALANCE_ERROR";
    ChainMintingErrorType["NETWORK_ERROR"] = "NETWORK_ERROR";
    ChainMintingErrorType["TIMEOUT_ERROR"] = "TIMEOUT_ERROR";
    ChainMintingErrorType["EXECUTION_ERROR"] = "EXECUTION_ERROR";
    ChainMintingErrorType["VERIFICATION_ERROR"] = "VERIFICATION_ERROR";
})(ChainMintingErrorType = exports.ChainMintingErrorType || (exports.ChainMintingErrorType = {}));
/**
 * 链式铸造错误类
 */
class ChainMintingError extends Error {
    type;
    details;
    constructor(type, message, details) {
        super(message);
        this.type = type;
        this.details = details;
        this.name = 'ChainMintingError';
    }
}
exports.ChainMintingError = ChainMintingError;
// ============================================================================
// 默认配置常量
// ============================================================================
/**
 * 默认广播配置
 */
exports.DEFAULT_BROADCAST_CONFIG = {
    maxRetries: 3,
    retryDelayMs: 5000,
    confirmationTimeoutMs: 30000,
    waitForAcceptance: true
};
/**
 * 默认执行参数
 */
exports.DEFAULT_EXECUTION_PARAMS = {
    feeRate: 10,
    childCount: 24,
    network: 'regtest',
    enableValidation: true,
    broadcastConfig: exports.DEFAULT_BROADCAST_CONFIG
};
/**
 * 安全参数
 */
exports.SAFETY_PARAMS = {
    /** 费用计算安全缓冲 (sats) */
    FEE_BUFFER: 1000,
    /** 最小交易确认等待时间 (毫秒) */
    MIN_CONFIRMATION_WAIT: 1000,
    /** 最大交易链长度 */
    MAX_CHAIN_LENGTH: 25,
    /** 最小费率 (sat/vB) */
    MIN_FEE_RATE: 0.1,
    /** 最大费率 (sat/vB) */
    MAX_FEE_RATE: 1000
};
// ============================================================================
// 费用计算功能导出
// ============================================================================
var feeCalculation_1 = require("./feeCalculation");
Object.defineProperty(exports, "performDryRunFeeCalculation", { enumerable: true, get: function () { return feeCalculation_1.performDryRunFeeCalculation; } });
Object.defineProperty(exports, "calculateActualTransactionFees", { enumerable: true, get: function () { return feeCalculation_1.calculateActualTransactionFees; } });
Object.defineProperty(exports, "compareFeeCalculations", { enumerable: true, get: function () { return feeCalculation_1.compareFeeCalculations; } });
Object.defineProperty(exports, "formatFeeCalculationResult", { enumerable: true, get: function () { return feeCalculation_1.formatFeeCalculationResult; } });
Object.defineProperty(exports, "HARDCODED_TRANSACTION_SIZES", { enumerable: true, get: function () { return feeCalculation_1.HARDCODED_TRANSACTION_SIZES; } });
// ============================================================================
// 钱包管理功能导出
// ============================================================================
var walletManager_1 = require("./walletManager");
Object.defineProperty(exports, "generateChainMintingWallets", { enumerable: true, get: function () { return walletManager_1.generateChainMintingWallets; } });
Object.defineProperty(exports, "generateChainMintingWalletsFromEnv", { enumerable: true, get: function () { return walletManager_1.generateChainMintingWalletsFromEnv; } });
Object.defineProperty(exports, "validateWalletConfiguration", { enumerable: true, get: function () { return walletManager_1.validateWalletConfiguration; } });
Object.defineProperty(exports, "detectAddressType", { enumerable: true, get: function () { return walletManager_1.detectAddressType; } });
Object.defineProperty(exports, "validateAddressType", { enumerable: true, get: function () { return walletManager_1.validateAddressType; } });
Object.defineProperty(exports, "validateDustThreshold", { enumerable: true, get: function () { return walletManager_1.validateDustThreshold; } });
Object.defineProperty(exports, "getAddressTypeName", { enumerable: true, get: function () { return walletManager_1.getAddressTypeName; } });
Object.defineProperty(exports, "formatWalletInfo", { enumerable: true, get: function () { return walletManager_1.formatWalletInfo; } });
Object.defineProperty(exports, "formatValidationResult", { enumerable: true, get: function () { return walletManager_1.formatValidationResult; } });
Object.defineProperty(exports, "maskMnemonic", { enumerable: true, get: function () { return walletManager_1.maskMnemonic; } });
Object.defineProperty(exports, "validateMnemonic", { enumerable: true, get: function () { return walletManager_1.validateMnemonic; } });
Object.defineProperty(exports, "generateWalletSummary", { enumerable: true, get: function () { return walletManager_1.generateWalletSummary; } });
// ============================================================================
// 交易构建功能导出
// ============================================================================
var transactionBuilder_1 = require("./transactionBuilder");
Object.defineProperty(exports, "buildParentTransaction", { enumerable: true, get: function () { return transactionBuilder_1.buildParentTransaction; } });
Object.defineProperty(exports, "buildParentTransactionSimple", { enumerable: true, get: function () { return transactionBuilder_1.buildParentTransactionSimple; } });
Object.defineProperty(exports, "validateParentTransactionOutputs", { enumerable: true, get: function () { return transactionBuilder_1.validateParentTransactionOutputs; } });
Object.defineProperty(exports, "validateParentTransactionFees", { enumerable: true, get: function () { return transactionBuilder_1.validateParentTransactionFees; } });
Object.defineProperty(exports, "formatParentTransactionResult", { enumerable: true, get: function () { return transactionBuilder_1.formatParentTransactionResult; } });
Object.defineProperty(exports, "calculateActualParentFee", { enumerable: true, get: function () { return transactionBuilder_1.calculateActualParentFee; } });
Object.defineProperty(exports, "validateParentTransactionParams", { enumerable: true, get: function () { return transactionBuilder_1.validateParentTransactionParams; } });
Object.defineProperty(exports, "generateParentTransactionSummary", { enumerable: true, get: function () { return transactionBuilder_1.generateParentTransactionSummary; } });
Object.defineProperty(exports, "buildChildTransaction", { enumerable: true, get: function () { return transactionBuilder_1.buildChildTransaction; } });
Object.defineProperty(exports, "buildChildTransactionChain", { enumerable: true, get: function () { return transactionBuilder_1.buildChildTransactionChain; } });
Object.defineProperty(exports, "validateChildTransactionOutputs", { enumerable: true, get: function () { return transactionBuilder_1.validateChildTransactionOutputs; } });
Object.defineProperty(exports, "validateChildTransactionChain", { enumerable: true, get: function () { return transactionBuilder_1.validateChildTransactionChain; } });
Object.defineProperty(exports, "calculateChildChainStatistics", { enumerable: true, get: function () { return transactionBuilder_1.calculateChildChainStatistics; } });
Object.defineProperty(exports, "formatChildChainResult", { enumerable: true, get: function () { return transactionBuilder_1.formatChildChainResult; } });
Object.defineProperty(exports, "generateChildChainSummary", { enumerable: true, get: function () { return transactionBuilder_1.generateChildChainSummary; } });
// ============================================================================
// 交易广播功能导出
// ============================================================================
var transactionBroadcaster_1 = require("./transactionBroadcaster");
Object.defineProperty(exports, "broadcastSingleTransaction", { enumerable: true, get: function () { return transactionBroadcaster_1.broadcastSingleTransaction; } });
Object.defineProperty(exports, "waitForTransactionAcceptance", { enumerable: true, get: function () { return transactionBroadcaster_1.waitForTransactionAcceptance; } });
Object.defineProperty(exports, "broadcastTransactionChain", { enumerable: true, get: function () { return transactionBroadcaster_1.broadcastTransactionChain; } });
Object.defineProperty(exports, "broadcastChildTransactionsInParallel", { enumerable: true, get: function () { return transactionBroadcaster_1.broadcastChildTransactionsInParallel; } });
Object.defineProperty(exports, "smartBroadcastTransactionChain", { enumerable: true, get: function () { return transactionBroadcaster_1.smartBroadcastTransactionChain; } });
Object.defineProperty(exports, "monitorTransactionChainStatus", { enumerable: true, get: function () { return transactionBroadcaster_1.monitorTransactionChainStatus; } });
Object.defineProperty(exports, "formatBatchBroadcastResult", { enumerable: true, get: function () { return transactionBroadcaster_1.formatBatchBroadcastResult; } });
Object.defineProperty(exports, "generateBroadcastSummary", { enumerable: true, get: function () { return transactionBroadcaster_1.generateBroadcastSummary; } });
//# sourceMappingURL=chainMinting.js.map