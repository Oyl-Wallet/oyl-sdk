/// <reference types="node" />
/// <reference types="node" />
import { Provider } from '../provider/provider';
import * as bitcoin from 'bitcoinjs-lib';
import { Account, Signer } from '..';
import { GatheredUtxos, AlkanesPayload } from '../shared/interface';
export declare const createExecutePsbt: ({ gatheredUtxos, account, protostone, provider, feeRate, fee, }: {
    gatheredUtxos: GatheredUtxos;
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
    fee?: number;
}) => Promise<{
    psbt: string;
    psbtHex: string;
}>;
export declare const createDeployCommit: ({ payload, gatheredUtxos, tweakedTaprootKeyPair, account, provider, feeRate, fee, }: {
    payload: AlkanesPayload;
    gatheredUtxos: GatheredUtxos;
    tweakedTaprootKeyPair: bitcoin.Signer;
    account: Account;
    provider: Provider;
    feeRate?: number;
    fee?: number;
}) => Promise<{
    psbt: string;
    script: Buffer;
}>;
export declare const createDeployReveal: ({ protostone, receiverAddress, script, feeRate, tweakedTaprootKeyPair, provider, fee, commitTxId, }: {
    protostone: Buffer;
    receiverAddress: string;
    script: Buffer;
    feeRate: number;
    tweakedTaprootKeyPair: bitcoin.Signer;
    provider: Provider;
    fee?: number;
    commitTxId: string;
}) => Promise<{
    psbt: string;
    fee: number;
}>;
export declare const findAlkaneUtxos: ({ address, greatestToLeast, provider, alkaneId, targetNumberOfAlkanes, }: {
    address: string;
    greatestToLeast: boolean;
    provider: Provider;
    alkaneId: {
        block: string;
        tx: string;
    };
    targetNumberOfAlkanes: number;
}) => Promise<{
    alkaneUtxos: any[];
    totalSatoshis: number;
}>;
export declare const actualTransactRevealFee: ({ protostone, tweakedTaprootKeyPair, commitTxId, receiverAddress, script, provider, feeRate, }: {
    protostone: Buffer;
    tweakedTaprootKeyPair: bitcoin.Signer;
    commitTxId: string;
    receiverAddress: string;
    script: Buffer;
    provider: Provider;
    feeRate?: number;
}) => Promise<{
    fee: number;
}>;
export declare const actualExecuteFee: ({ gatheredUtxos, account, protostone, provider, feeRate, signer, }: {
    gatheredUtxos: GatheredUtxos;
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate: number;
    signer: Signer;
}) => Promise<{
    fee: number;
}>;
export declare const executeReveal: ({ protostone, commitTxId, script, account, provider, feeRate, signer, }: {
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
export declare const execute: ({ gatheredUtxos, account, protostone, provider, feeRate, signer, }: {
    gatheredUtxos: GatheredUtxos;
    account: Account;
    protostone: Buffer;
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
export declare const createTransactReveal: ({ protostone, receiverAddress, script, feeRate, tweakedTaprootKeyPair, provider, fee, commitTxId, }: {
    protostone: Buffer;
    receiverAddress: string;
    script: Buffer;
    feeRate: number;
    tweakedTaprootKeyPair: bitcoin.Signer;
    provider: Provider;
    fee?: number;
    commitTxId: string;
}) => Promise<{
    psbt: string;
    fee: number;
}>;
export declare const actualBumpFeeFee: ({ txid, account, provider, newFeeRate, signer, }: {
    txid: string;
    account: Account;
    provider: Provider;
    newFeeRate: number;
    signer: Signer;
}) => Promise<{
    fee: number;
}>;
export declare const createBumpFeePsbt: ({ txid, account, provider, newFeeRate, fee, }: {
    txid: string;
    account: Account;
    provider: Provider;
    newFeeRate: number;
    fee?: number;
}) => Promise<{
    psbt: string;
}>;
export declare const bumpFee: ({ txid, newFeeRate, account, provider, signer, }: {
    txid: string;
    newFeeRate: number;
    account: Account;
    provider: Provider;
    signer: Signer;
}) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const deployCommit: ({ payload, gatheredUtxos, account, provider, feeRate, signer, }: {
    payload: AlkanesPayload;
    gatheredUtxos: GatheredUtxos;
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
