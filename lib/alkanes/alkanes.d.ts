/// <reference types="node" />
/// <reference types="node" />
import { Provider } from '../provider/provider';
import * as bitcoin from 'bitcoinjs-lib';
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
export declare const createExecutePsbt: ({ alkanesUtxos, frontendFee, feeAddress, utxos, account, protostone, provider, feeRate, fee, }: {
    alkanesUtxos?: FormattedUtxo[];
    frontendFee?: bigint;
    feeAddress?: string;
    utxos: FormattedUtxo[];
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
    fee?: number;
}) => Promise<{
    psbt: string;
    psbtHex: string;
}>;
export declare function addInputForUtxo(psbt: bitcoin.Psbt, utxo: FormattedUtxo, account: Account, provider: Provider): Promise<void>;
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
export declare const actualExecuteFee: ({ alkanesUtxos, utxos, account, protostone, provider, feeRate, frontendFee, feeAddress, }: {
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate: number;
    frontendFee?: bigint;
    feeAddress?: string;
}) => Promise<{
    fee: number;
    vsize: number;
}>;
export declare const executePsbt: ({ alkanesUtxos, utxos, account, protostone, provider, feeRate, frontendFee, feeAddress, }: {
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
    frontendFee?: bigint;
    feeAddress?: string;
}) => Promise<{
    psbt: string;
    fee: number;
}>;
export declare const execute: ({ alkanesUtxos, utxos, account, protostone, provider, feeRate, signer, frontendFee, feeAddress, }: {
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
    frontendFee?: bigint;
    feeAddress?: string;
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
