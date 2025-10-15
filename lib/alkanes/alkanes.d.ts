/// <reference types="node" />
/// <reference types="node" />
import { Provider } from '../provider/provider';
import * as bitcoin from 'bitcoinjs-lib';
import { p2tr_ord_reveal } from 'alkanes/lib/index';
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
export declare const addFrBtcWrapOutToPsbt: ({ frbtcWrapPsbt, account, psbt, }: {
    frbtcWrapPsbt: bitcoin.Psbt;
    account: Account;
    psbt: bitcoin.Psbt;
}) => void;
export declare const createExecutePsbt: ({ alkanesUtxos, frontendFee, feeAddress, utxos, account, protostone, provider, feeRate, fee, frbtcWrapPsbt, }: {
    alkanesUtxos?: FormattedUtxo[];
    frontendFee?: bigint;
    feeAddress?: string;
    utxos: FormattedUtxo[];
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
    fee?: number;
    frbtcWrapPsbt?: bitcoin.Psbt;
}) => Promise<{
    psbt: string;
    psbtHex: string;
}>;
export declare const createWrapBtcPsbt: ({ alkanesUtxos, utxos, account, protostone, provider, feeRate, fee, wrapAmount, }: {
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
    fee?: number;
    wrapAmount: number;
}) => Promise<{
    psbt: string;
    psbtHex: string;
}>;
export declare const createUnwrapBtcPsbt: ({ utxos, account, provider, feeRate, fee, unwrapAmount, alkaneUtxos, }: {
    utxos: FormattedUtxo[];
    account: Account;
    provider: Provider;
    feeRate?: number;
    fee?: number;
    unwrapAmount: bigint;
    alkaneUtxos: FormattedUtxo[];
}) => Promise<{
    psbt: string;
    psbtHex: string;
}>;
export declare const actualUnwrapBtcFee: ({ utxos, account, provider, feeRate, unwrapAmount, alkaneUtxos, }: {
    utxos: FormattedUtxo[];
    account: Account;
    provider: Provider;
    feeRate?: number;
    unwrapAmount: bigint;
    alkaneUtxos: FormattedUtxo[];
}) => Promise<{
    fee: number;
    vsize: number;
}>;
export declare const unwrapBtcNoSigning: ({ utxos, account, provider, feeRate, unwrapAmount, alkaneUtxos, }: {
    utxos: FormattedUtxo[];
    account: Account;
    provider: Provider;
    feeRate?: number;
    unwrapAmount: bigint;
    alkaneUtxos: FormattedUtxo[];
}) => Promise<{
    psbt: string;
    psbtHex: string;
}>;
export declare const unwrapBtc: ({ utxos, account, provider, feeRate, signer, unwrapAmount, alkaneUtxos, }: {
    utxos: FormattedUtxo[];
    account: Account;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
    unwrapAmount: bigint;
    alkaneUtxos: FormattedUtxo[];
}) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare function addInputForUtxo(psbt: bitcoin.Psbt, utxo: FormattedUtxo, account: Account, provider: Provider): Promise<void>;
export declare const actualDeployCommitFee: ({ payload, tweakedPublicKey, utxos, account, provider, feeRate, protostone, frontendFee, feeAddress, }: {
    payload: AlkanesPayload;
    tweakedPublicKey: string;
    utxos: FormattedUtxo[];
    account: Account;
    provider: Provider;
    feeRate?: number;
    protostone: Buffer;
    frontendFee?: bigint;
    feeAddress?: string;
}) => Promise<{
    fee: number;
    deployRevealFee: number;
    vsize: number;
}>;
export declare const createDeployCommitPsbt: ({ payload, utxos, tweakedPublicKey, account, provider, feeRate, fee, deployRevealFee, frontendFee, feeAddress, }: {
    payload: AlkanesPayload;
    utxos: FormattedUtxo[];
    tweakedPublicKey: string;
    account: Account;
    provider: Provider;
    feeRate?: number;
    fee?: number;
    deployRevealFee?: number;
    frontendFee?: bigint;
    feeAddress?: string;
}) => Promise<{
    psbt: string;
    script: Buffer;
}>;
export declare const deployCommit: ({ payload, utxos, account, provider, feeRate, signer, protostone, frontendFee, feeAddress, }: {
    payload: AlkanesPayload;
    utxos: FormattedUtxo[];
    account: Account;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
    protostone: Buffer;
    frontendFee?: bigint;
    feeAddress?: string;
}) => Promise<{
    script: string;
    commitPsbt: string;
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const deployReveal: ({ payload, alkanesUtxos, utxos, protostone, commitTxId, script, account, provider, feeRate, signer, commitPsbt, }: {
    payload: AlkanesPayload;
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    protostone: Buffer;
    commitTxId: string;
    script: string;
    account: Account;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
    commitPsbt?: bitcoin.Psbt;
}) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const actualTransactRevealFee: ({ payload, alkanesUtxos, utxos, protostone, tweakedPublicKey, commitTxId, commitPsbt, receiverAddress, script, provider, feeRate, account, frbtcWrapPsbt, }: {
    payload: AlkanesPayload;
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    protostone: Buffer;
    tweakedPublicKey: string;
    commitTxId: string;
    commitPsbt: bitcoin.Psbt;
    receiverAddress: string;
    script: Buffer;
    provider: Provider;
    feeRate?: number;
    account: Account;
    frbtcWrapPsbt?: bitcoin.Psbt;
}) => Promise<{
    fee: number;
    vsize: number;
}>;
export declare const actualExecuteFee: ({ alkanesUtxos, utxos, account, protostone, provider, feeRate, frontendFee, feeAddress, frbtcWrapPsbt, }: {
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate: number;
    frontendFee?: bigint;
    feeAddress?: string;
    frbtcWrapPsbt?: bitcoin.Psbt;
}) => Promise<{
    fee: number;
    vsize: number;
}>;
export declare const executePsbt: ({ alkanesUtxos, utxos, account, protostone, provider, feeRate, frontendFee, feeAddress, frbtcWrapPsbt, }: {
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
    frontendFee?: bigint;
    feeAddress?: string;
    frbtcWrapPsbt?: bitcoin.Psbt;
}) => Promise<{
    psbt: string;
    fee: number;
}>;
export declare const executeWithBtcWrapUnwrap: ({ alkanesUtxos, utxos, account, calldata, provider, feeRate, signer, frontendFee, feeAddress, frbtcWrapAmount, frbtcUnwrapAmount, addDieselMint, }: {
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    account: Account;
    calldata: bigint[];
    provider: Provider;
    feeRate?: number;
    signer: Signer;
    frontendFee?: bigint;
    feeAddress?: string;
    frbtcWrapAmount?: number;
    frbtcUnwrapAmount?: number;
    addDieselMint?: boolean;
}) => Promise<{
    frbtcWrapResult: any;
    executeResult: any;
    frbtcUnwrapResult: any;
}>;
export declare const execute: ({ alkanesUtxos, utxos, account, protostone, provider, feeRate, signer, frontendFee, feeAddress, frbtcWrapPsbt, frbtcUnwrapAmount, }: {
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
    frontendFee?: bigint;
    feeAddress?: string;
    frbtcWrapPsbt?: bitcoin.Psbt;
    frbtcUnwrapAmount?: number;
}) => Promise<{
    frbtcWrapResult: any;
    executeResult: any;
    frbtcUnwrapResult: any;
}>;
export declare const actualWrapBtcFee: ({ alkanesUtxos, utxos, account, protostone, provider, feeRate, wrapAmount, }: {
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate: number;
    wrapAmount: number;
}) => Promise<{
    fee: number;
    vsize: number;
}>;
export declare const wrapBtcNoSigning: ({ alkanesUtxos, utxos, account, provider, feeRate, wrapAmount, addDieselMint, }: {
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    account: Account;
    provider: Provider;
    feeRate?: number;
    wrapAmount: number;
    addDieselMint?: boolean;
}) => Promise<{
    psbt: string;
    psbtHex: string;
}>;
export declare const wrapBtc: ({ alkanesUtxos, utxos, account, provider, feeRate, signer, wrapAmount, }: {
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    account: Account;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
    wrapAmount: number;
}) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const createTransactReveal: ({ payload, alkanesUtxos, utxos, protostone, receiverAddress, script, feeRate, tweakedPublicKey, provider, fee, commitTxId, commitPsbt, account, frbtcWrapPsbt, }: {
    payload: AlkanesPayload;
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    protostone: Buffer;
    receiverAddress: string;
    script: Buffer;
    feeRate: number;
    tweakedPublicKey: string;
    provider: Provider;
    fee?: number;
    commitTxId: string;
    commitPsbt: bitcoin.Psbt;
    account: Account;
    frbtcWrapPsbt?: bitcoin.Psbt;
}) => Promise<{
    psbt: string;
    fee: number;
}>;
export declare const toTxId: (rawLeTxid: string) => string;
export declare const toAlkaneId: (item: string) => {
    alkaneId: {
        block: string;
        tx: string;
    };
    amount: number;
};
export { p2tr_ord_reveal };
export declare const inscribePayloadBulk: ({ alkanesUtxos, payload, utxos, account, protostone, provider, feeRate, signer, frontendFee, feeAddress, frbtcWrapPsbt, }: {
    alkanesUtxos?: FormattedUtxo[];
    payload: AlkanesPayload;
    utxos: FormattedUtxo[];
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
    frontendFee?: bigint;
    feeAddress?: string;
    frbtcWrapPsbt?: bitcoin.Psbt;
}) => Promise<{
    frbtcWrapResult: any;
    executeResult: {
        txId: string;
        rawTx: string;
        size: any;
        weight: any;
        fee: number;
        satsPerVByte: string;
    };
    commitResult: any;
    frbtcUnwrapResult: any;
}>;
