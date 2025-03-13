/// <reference types="node" />
/// <reference types="node" />
import { Provider } from '../provider/provider';
import { Account, Signer } from '..';
import { GatheredUtxos, AlkanesPayload } from '../shared/interface';
export declare const createExecutePsbt: ({ alkaneUtxos, gatheredUtxos, account, protostone, provider, feeRate, fee, }: {
    alkaneUtxos?: {
        alkaneUtxos: any[];
        totalSatoshis: number;
    };
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
export declare const createDeployCommitPsbt: ({ payload, gatheredUtxos, tweakedPublicKey, account, provider, feeRate, fee, }: {
    payload: AlkanesPayload;
    gatheredUtxos: GatheredUtxos;
    tweakedPublicKey: string;
    account: Account;
    provider: Provider;
    feeRate?: number;
    fee?: number;
}) => Promise<{
    psbt: string;
    script: Buffer;
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
    alkaneUtxos: {
        txId: string;
        txIndex: number;
        script: string;
        address: string;
        amountOfAlkanes: string;
        satoshis: number;
    }[];
    totalSatoshis: number;
    totalBalanceBeingSent: number;
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
export declare const actualExecuteFee: ({ gatheredUtxos, account, protostone, provider, feeRate, alkaneUtxos, }: {
    gatheredUtxos: GatheredUtxos;
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate: number;
    alkaneUtxos?: {
        alkaneUtxos: any[];
        totalSatoshis: number;
    };
}) => Promise<{
    fee: number;
    vsize: number;
}>;
export declare const executePsbt: ({ alkaneUtxos, gatheredUtxos, account, protostone, provider, feeRate, }: {
    alkaneUtxos?: {
        alkaneUtxos: any[];
        totalSatoshis: number;
    };
    gatheredUtxos: GatheredUtxos;
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
}) => Promise<{
    psbt: string;
    fee: number;
}>;
export declare const execute: ({ alkaneUtxos, gatheredUtxos, account, protostone, provider, feeRate, signer, }: {
    alkaneUtxos?: {
        alkaneUtxos: any[];
        totalSatoshis: number;
    };
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
