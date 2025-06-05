import { Provider } from '../provider';
import { Account } from '../account/account';
import { Signer } from '../signer';
import { GatheredUtxos } from '../utxo';
export declare const createPsbt: ({ gatheredUtxos, account, inscriptionId, provider, inscriptionAddress, toAddress, feeRate, fee, }: {
    gatheredUtxos: GatheredUtxos;
    account: Account;
    inscriptionId: string;
    provider: Provider;
    inscriptionAddress: string;
    toAddress: string;
    feeRate?: number;
    fee?: number;
}) => Promise<{
    psbt: string;
}>;
export declare const findCollectible: ({ address, provider, inscriptionId, }: {
    address: string;
    provider: Provider;
    inscriptionId: string;
}) => Promise<{
    txId: string;
    voutIndex: string;
    data: any;
}>;
export declare const send: ({ gatheredUtxos, toAddress, inscriptionId, inscriptionAddress, feeRate, account, provider, signer, fee, }: {
    gatheredUtxos: GatheredUtxos;
    toAddress: string;
    inscriptionId: string;
    inscriptionAddress?: string;
    feeRate?: number;
    account: Account;
    provider: Provider;
    signer: Signer;
    fee?: number;
}) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const actualFee: ({ gatheredUtxos, account, inscriptionId, provider, inscriptionAddress, toAddress, feeRate, signer, }: {
    gatheredUtxos: GatheredUtxos;
    account: Account;
    inscriptionId: string;
    provider: Provider;
    inscriptionAddress?: string;
    toAddress: string;
    feeRate?: number;
    signer: Signer;
}) => Promise<{
    fee: number;
}>;
