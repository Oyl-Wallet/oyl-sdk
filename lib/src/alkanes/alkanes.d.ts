/// <reference types="node" />
/// <reference types="node" />
import { Provider } from '../provider/provider';
import { ProtoruneEdict } from 'alkanes/lib/protorune/protoruneedict';
import { Account, Signer } from '..';
import { AlkanesPayload } from '../shared/interface';
import { type FormattedUtxo } from '../utxo';
export interface ProtostoneMessage {
    protocolTag?: bigint;
    edicts?: ProtoruneEdict[];
    pointer?: number;
    refundPointer?: number;
    calldata: bigint[];
}
export declare const encodeProtostone: ({ protocolTag, edicts, pointer, refundPointer, calldata, }: ProtostoneMessage) => Buffer;
export declare const createExecutePsbt: ({ alkanesUtxos, frontendFee, feeAddress, utxos, account, protostone, provider, feeRate, fee, alkaneReceiverAddress, enableRBF, }: {
    alkanesUtxos?: FormattedUtxo[];
    frontendFee?: bigint;
    feeAddress?: string;
    utxos: FormattedUtxo[];
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
    fee?: number;
    alkaneReceiverAddress?: string;
    enableRBF?: boolean;
}) => Promise<{
    psbt: string;
    psbtHex: string;
}>;
export declare const createDeployCommitPsbt: ({ payload, utxos, tweakedPublicKey, account, provider, feeRate, fee, }: {
    payload: AlkanesPayload;
    utxos: FormattedUtxo[];
    tweakedPublicKey: string;
    account: Account;
    provider: Provider;
    feeRate?: number;
    fee?: number;
}) => Promise<{
    psbt: string;
    script: Buffer;
}>;
export declare const deployCommit: ({ payload, utxos, account, provider, feeRate, signer, }: {
    payload: AlkanesPayload;
    utxos: FormattedUtxo[];
    account: Account;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
}) => Promise<{
    script: string;
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const createDeployRevealPsbt: ({ protostone, receiverAddress, script, feeRate, tweakedPublicKey, provider, fee, commitTxId, }: {
    protostone: Buffer;
    receiverAddress: string;
    script: Buffer;
    feeRate: number;
    tweakedPublicKey: string;
    provider: Provider;
    fee?: number;
    commitTxId: string;
}) => Promise<{
    psbt: string;
    fee: number;
}>;
export declare const deployReveal: ({ protostone, commitTxId, script, account, provider, feeRate, signer, }: {
    protostone: Buffer;
    commitTxId: string;
    script: string;
    account: Account;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
}) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const actualTransactRevealFee: ({ protostone, tweakedPublicKey, commitTxId, receiverAddress, script, provider, feeRate, }: {
    protostone: Buffer;
    tweakedPublicKey: string;
    commitTxId: string;
    receiverAddress: string;
    script: Buffer;
    provider: Provider;
    feeRate?: number;
}) => Promise<{
    fee: number;
    vsize: number;
}>;
export declare const actualExecuteFee: ({ alkanesUtxos, utxos, account, protostone, provider, feeRate, frontendFee, feeAddress, alkaneReceiverAddress, }: {
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate: number;
    frontendFee?: bigint;
    feeAddress?: string;
    alkaneReceiverAddress?: string;
}) => Promise<{
    fee: number;
    vsize: number;
}>;
export declare const executePsbt: ({ alkanesUtxos, utxos, account, protostone, provider, feeRate, frontendFee, feeAddress, alkaneReceiverAddress, }: {
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
    frontendFee?: bigint;
    feeAddress?: string;
    alkaneReceiverAddress?: string;
}) => Promise<{
    psbt: string;
    fee: number;
}>;
export declare const execute: ({ alkanesUtxos, utxos, account, protostone, provider, feeRate, signer, frontendFee, feeAddress, alkaneReceiverAddress, enableRBF, }: {
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
    frontendFee?: bigint;
    feeAddress?: string;
    alkaneReceiverAddress?: string;
    enableRBF?: boolean;
}) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const createTransactReveal: ({ protostone, receiverAddress, script, feeRate, tweakedPublicKey, provider, fee, commitTxId, }: {
    protostone: Buffer;
    receiverAddress: string;
    script: Buffer;
    feeRate: number;
    tweakedPublicKey: string;
    provider: Provider;
    fee?: number;
    commitTxId: string;
}) => Promise<{
    psbt: string;
    fee: number;
}>;
export declare const toTxId: (rawLeTxid: string) => string;
export declare const estimateExecuteFeeWithoutChange: ({ feeRate, frontendFee, inputCount, }: {
    feeRate: number;
    frontendFee?: bigint;
    inputCount?: number;
}) => Promise<{
    estimatedFee: number;
    totalRequired: number;
    breakdown: {
        alkaneOutput: number;
        frontendFee: number;
        transactionFee: number;
        inputCount: number;
        outputCount: number;
        estimatedTxSize: number;
    };
}>;
export declare const batchExecute: ({ alkanesUtxos, utxos, account, protostone, provider, feeRate, signer, frontendFee, feeAddress, accountCount, mnemonic, alkaneReceiverAddress, }: {
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
    frontendFee?: bigint;
    feeAddress?: string;
    accountCount: number;
    mnemonic: string;
    alkaneReceiverAddress?: string;
}) => Promise<{
    totalAccounts: number;
    successfulExecutions: number;
    failedExecutions: number;
    results: ({
        account: {
            index: number;
            address: string;
        };
        success: boolean;
        result: {
            txId: string;
            rawTx: string;
            size: any;
            weight: any;
            fee: number;
            satsPerVByte: string;
        };
        error?: undefined;
    } | {
        account: {
            index: number;
            address: string;
        };
        success: boolean;
        error: any;
        result?: undefined;
    })[];
    summary: {
        success: {
            accountIndex: number;
            address: string;
            txId: string;
        }[];
        failed: {
            accountIndex: number;
            address: string;
            error: any;
        }[];
    };
}>;
