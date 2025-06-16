/**
 * Project Supercluster - 复合父交易构建器
 *
 * 基于现有buildSignAndBroadcastParentTransaction的扩展，实现复合父交易(TX₀)构建
 * 100% 复用现有的PSBT构建逻辑，支持多中继输出和CPFP机制
 */
import * as bitcoin from 'bitcoinjs-lib';
import { Provider } from '../provider/provider';
import { FormattedUtxo } from '../utxo/types';
import { AlkaneContractId, BuiltTransaction } from './chainMinting';
import { MultiRelayWalletSystem } from './multiRelayWalletManager';
import { ParallelFeeCalculation } from './parallelFeeCalculator';
/**
 * 复合父交易构建配置
 */
export interface CompositeParentTransactionConfig {
    /** 钱包系统 */
    walletSystem: MultiRelayWalletSystem;
    /** 合约标识 */
    contractId: AlkaneContractId;
    /** 并行费用计算结果 */
    parallelFeeCalculation: ParallelFeeCalculation;
    /** 网络提供者 */
    provider: Provider;
    /** 主钱包UTXO */
    utxos: FormattedUtxo[];
    /** 广播配置 */
    broadcastConfig: any;
}
/**
 * 复合父交易输出布局
 */
export interface CompositeParentVoutLayout {
    /** 分片中继输出列表 (vout 0, 1, 2, ..., N-1) */
    sliceOutputs: Array<{
        voutIndex: number;
        sliceIndex: number;
        relayAddress: string;
        amount: number;
        description: string;
    }>;
    /** OP_RETURN指令 (vout N) */
    instructionHub: {
        voutIndex: number;
        protostoneSize: number;
    };
    /** 主钱包找零 (vout N+1, 可选) */
    mainWalletChange?: {
        voutIndex: number;
        changeAddress: string;
        amount: number;
    };
}
/**
 * 构建、签名、广播复合父交易
 *
 * 复合父交易vout布局：
 * - vout 0 到 vout N-1: 各分片中继输出 (P2WPKH)
 * - vout N: OP_RETURN (Protostone指令)
 * - vout N+1: 主钱包找零 (P2TR, 可选)
 *
 * 关键特性：
 * - 100%复用现有buildSignAndBroadcastParentTransaction的PSBT逻辑
 * - 多输出版本的标准vout布局
 * - 支持CPFP加速第一个分片
 * - 保持向后兼容的Protostone消息格式
 */
export declare function buildSignAndBroadcastCompositeParentTransaction(config: CompositeParentTransactionConfig): Promise<{
    transaction: BuiltTransaction;
    voutLayout: CompositeParentVoutLayout;
}>;
/**
 * 验证复合父交易输出布局
 */
export declare function validateCompositeParentTransactionOutputs(psbt: bitcoin.Psbt, expectedSliceCount: number): {
    isValid: boolean;
    errors: string[];
    actualSliceCount: number;
};
/**
 * 验证复合父交易配置参数
 */
export declare function validateCompositeParentTransactionParams(config: CompositeParentTransactionConfig): {
    isValid: boolean;
    errors: string[];
};
/**
 * 生成复合父交易摘要
 */
export declare function generateCompositeParentTransactionSummary(transaction: BuiltTransaction, voutLayout: CompositeParentVoutLayout, contractId: AlkaneContractId): {
    transactionId: string;
    contractTarget: string;
    timestamp: number;
    sliceCount: number;
    totalSliceOutputValue: number;
    voutLayout: CompositeParentVoutLayout;
    summary: {
        mainWallet: {
            address: string;
        };
        slices: Array<{
            sliceIndex: number;
            relayAddress: string;
            amount: number;
            voutIndex: number;
            description: string;
        }>;
        instruction: {
            voutIndex: number;
            protostoneSize: number;
        };
        change?: {
            voutIndex: number;
            address: string;
            amount: number;
        };
    };
};
/**
 * 格式化复合父交易构建结果
 */
export declare function formatCompositeParentTransactionResult(transaction: BuiltTransaction, voutLayout: CompositeParentVoutLayout): string;
