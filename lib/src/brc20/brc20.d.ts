/// <reference types="node" />
/// <reference types="node" />
import { Provider } from '../provider/provider';
import * as bitcoin from 'bitcoinjs-lib';
import { Account } from '../account/account';
import { Signer } from '../signer';
import { GatheredUtxos } from '../utxo';
export declare const transferEstimate: ({ gatheredUtxos, toAddress, feeRate, account, provider, fee, }: {
    gatheredUtxos: GatheredUtxos;
    toAddress: string;
    feeRate: number;
    account: Account;
    provider: Provider;
    fee?: number;
}) => Promise<{
    psbt: string;
    fee: number;
}>;
export declare const commit: ({ gatheredUtxos, ticker, amount, feeRate, account, tweakedTaprootPublicKey, provider, finalTransferFee, fee, }: {
    gatheredUtxos: GatheredUtxos;
    ticker: string;
    amount: number;
    feeRate: number;
    account: Account;
    tweakedTaprootPublicKey: Buffer;
    provider: Provider;
    fee?: number;
    finalTransferFee?: number;
}) => Promise<{
    psbt: string;
    fee: number;
    script: Buffer;
}>;
export declare const reveal: ({ receiverAddress, script, feeRate, tweakedTaprootKeyPair, provider, fee, commitTxId, }: {
    receiverAddress: string;
    script: Buffer;
    feeRate: number;
    tweakedTaprootKeyPair: bitcoin.Signer;
    provider: Provider;
    fee?: number;
    commitTxId: string;
}) => Promise<{
    psbt: string;
    psbtHex: string;
    fee: number;
}>;
export declare const transfer: ({ commitChangeUtxoId, revealTxId, toAddress, feeRate, account, provider, fee, }: {
    commitChangeUtxoId: string;
    revealTxId: string;
    toAddress: string;
    feeRate: number;
    account: Account;
    provider: Provider;
    fee?: number;
}) => Promise<{
    psbt: string;
}>;
export declare const send: ({ gatheredUtxos, toAddress, ticker, amount, account, provider, feeRate, signer, }: {
    gatheredUtxos: GatheredUtxos;
    toAddress: string;
    ticker: string;
    amount: number;
    feeRate: number;
    account: Account;
    provider: Provider;
    signer: Signer;
}) => Promise<{
    txId: string;
    rawTxn: string;
    sendBrc20Txids: string[];
}>;
