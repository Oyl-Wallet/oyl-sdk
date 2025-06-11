/**
 * 交易构建模块
 *
 * 实现父交易和子交易的构建逻辑，严格遵循标准vout布局
 * 支持RBF、dust阈值验证和精确的费用控制
 */
import * as bitcoin from 'bitcoinjs-lib';
import { ChainMintingWallets, AlkaneContractId, ParentTransactionConfig, ChildTransactionConfig, BuiltTransaction, ChainMintingFeeCalculation } from './chainMinting';
import { Provider } from '../provider/provider';
import { FormattedUtxo } from '../utxo/types';
import { VerificationConfig, ChainExecutionStatus } from './chainVerification';
/**
 * 构建父交易 - 仅构建不广播（向后兼容）
 */
export declare function buildParentTransactionSimple({ wallets, contractId, feeCalculation, provider, utxos }: {
    wallets: ChainMintingWallets;
    contractId: AlkaneContractId;
    feeCalculation: ChainMintingFeeCalculation;
    provider: Provider;
    utxos: FormattedUtxo[];
}): Promise<BuiltTransaction>;
/**
 * 构建父交易 - 仅构建不广播（向后兼容）
 */
export declare function buildParentTransaction(config: ParentTransactionConfig & {
    utxos: FormattedUtxo[];
}): Promise<BuiltTransaction>;
/**
 * 构建、签名、广播父交易并等待进入交易池
 *
 * 严格按照标准vout布局：
 * - vout=0: 中继输出 (接力/燃料)
 * - vout=1: OP_RETURN (指令中心)
 * - vout=2: 找零输出 (最终找零)
 */
export declare function buildSignAndBroadcastParentTransaction(config: ParentTransactionConfig & {
    utxos: FormattedUtxo[];
    broadcastConfig: any;
}): Promise<BuiltTransaction>;
/**
 * 验证父交易输出布局
 */
export declare function validateParentTransactionOutputs(psbt: bitcoin.Psbt): {
    isValid: boolean;
    errors: string[];
};
/**
 * 验证父交易费用计算
 */
export declare function validateParentTransactionFees({ inputTotal, outputTotal, expectedFee, tolerance }: {
    inputTotal: number;
    outputTotal: number;
    expectedFee: number;
    tolerance?: number;
}): {
    isValid: boolean;
    actualFee: number;
    feeDeviation: number;
    errors: string[];
};
/**
 * 格式化父交易构建结果
 */
export declare function formatParentTransactionResult(result: BuiltTransaction): string;
/**
 * 计算父交易的实际费用
 */
export declare function calculateActualParentFee(inputUtxos: FormattedUtxo[], relayAmount: number, changeAmount: number): number;
/**
 * 验证父交易参数
 */
export declare function validateParentTransactionParams(config: ParentTransactionConfig & {
    utxos: FormattedUtxo[];
}): {
    isValid: boolean;
    errors: string[];
};
/**
 * 生成父交易摘要
 */
export declare function generateParentTransactionSummary(result: BuiltTransaction, wallets: ChainMintingWallets, contractId: AlkaneContractId): {
    transactionId: string;
    relayAddress: string;
    relayAmount: number;
    contractTarget: string;
    timestamp: number;
    voutLayout: {
        vout0: {
            type: 'relay';
            address: string;
            amount: number;
        };
        vout1: {
            type: 'opreturn';
            size: number;
        };
        vout2?: {
            type: 'change';
            address: string;
        };
    };
};
/**
 * 构建单个子交易
 *
 * 子交易遵循固定布局：
 * - vout=0: 中继输出 (继续链条或最终接收)
 * - vout=1: OP_RETURN (指令中心)
 *
 * 关键特性：
 * - 隐式资产传递：空edicts触发输入资产自动加载
 * - 动态地址切换：最后一笔交易发送到最终接收地址
 * - 费用递减：每笔交易的输出金额递减childTxFee
 */
export declare function buildChildTransaction(config: ChildTransactionConfig): Promise<BuiltTransaction>;
/**
 * 串行构建、签名、广播子交易链 (TX₁-TX₂₄)
 *
 * 每一笔交易：构建 → 签名 → 广播 → 等待进入交易池 → 构建下一笔
 */
export declare function buildAndBroadcastChildTransactionChain({ parentTxId, initialRelayAmount, wallets, contractId, childCount, childTxFee, finalReceiverAddress, provider, broadcastConfig }: {
    parentTxId: string;
    initialRelayAmount: number;
    wallets: ChainMintingWallets;
    contractId: AlkaneContractId;
    childCount?: number;
    childTxFee: number;
    finalReceiverAddress: string;
    provider: Provider;
    broadcastConfig: any;
}): Promise<BuiltTransaction[]>;
/**
 * 构建子交易链 - 仅构建不广播（向后兼容）
 */
export declare function buildChildTransactionChain({ parentTxId, initialRelayAmount, wallets, contractId, childCount, childTxFee, finalReceiverAddress, provider }: {
    parentTxId: string;
    initialRelayAmount: number;
    wallets: ChainMintingWallets;
    contractId: AlkaneContractId;
    childCount?: number;
    childTxFee: number;
    finalReceiverAddress: string;
    provider: Provider;
}): Promise<BuiltTransaction[]>;
/**
 * 验证子交易输出布局
 */
export declare function validateChildTransactionOutputs(psbt: bitcoin.Psbt, _isLastTransaction?: boolean): {
    isValid: boolean;
    errors: string[];
};
/**
 * 验证子交易链的完整性
 */
export declare function validateChildTransactionChain(transactions: BuiltTransaction[]): {
    isValid: boolean;
    errors: string[];
    brokenAtIndex?: number;
};
/**
 * 计算子交易链的总统计信息
 */
export declare function calculateChildChainStatistics(transactions: BuiltTransaction[], childTxFee: number): {
    totalTransactions: number;
    totalFeesPaid: number;
    initialAmount: number;
    finalAmount: number;
    totalReduction: number;
    averageTransactionSize: number;
};
/**
 * 格式化子交易链构建结果
 */
export declare function formatChildChainResult(transactions: BuiltTransaction[], childTxFee: number): string;
/**
 * 生成子交易链摘要
 */
export declare function generateChildChainSummary(transactions: BuiltTransaction[], contractId: AlkaneContractId, finalReceiverAddress: string): {
    chainLength: number;
    firstTxId: string;
    lastTxId: string;
    contractTarget: string;
    finalReceiver: string;
    timestamp: number;
    transactions: Array<{
        index: number;
        txId: string;
        outputValue: number;
        isLast: boolean;
    }>;
};
/**
 * 完整的Project Snowball执行：构建 → 广播 → 验证
 *
 * 这是最高级的API，提供端到端的链式铸造和验证
 */
export declare function executeCompleteChainMinting({ wallets, contractId, feeCalculation, provider, utxos, broadcastConfig, finalReceiverAddress, childCount, verificationConfig }: {
    wallets: ChainMintingWallets;
    contractId: AlkaneContractId;
    feeCalculation: ChainMintingFeeCalculation;
    provider: Provider;
    utxos: FormattedUtxo[];
    broadcastConfig: any;
    finalReceiverAddress: string;
    childCount?: number;
    verificationConfig?: Partial<VerificationConfig>;
}): Promise<{
    parentTx: BuiltTransaction;
    childTxs: BuiltTransaction[];
    verificationResult: ChainExecutionStatus;
}>;
/**
 * 仅验证已存在的链条（不执行构建和广播）
 *
 * 用于验证之前执行的链式铸造结果
 */
export declare function verifyExistingChain({ parentTxId, childTxIds, contractId, finalReceiverAddress, provider, verificationConfig }: {
    parentTxId: string;
    childTxIds: string[];
    contractId: AlkaneContractId;
    finalReceiverAddress: string;
    provider: Provider;
    verificationConfig?: Partial<VerificationConfig>;
}): Promise<ChainExecutionStatus>;
