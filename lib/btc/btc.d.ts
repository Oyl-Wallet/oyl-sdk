import { Provider } from '../provider/provider';
import { Account } from '../account/account';
import { Signer } from '../signer';
import { FormattedUtxo } from '../utxo';
export declare const createPsbt: ({ utxos, toAddress, amount, feeRate, account, provider, fee, }: {
    utxos: FormattedUtxo[];
    toAddress: string;
    feeRate: number;
    amount: number;
    account: Account;
    provider: Provider;
    fee?: number;
}) => Promise<{
    psbt: string;
    fee: number;
}>;
export declare const send: ({ utxos, toAddress, amount, feeRate, account, provider, signer, fee, }: {
    utxos: FormattedUtxo[];
    toAddress: string;
    amount: number;
    feeRate: number;
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
export declare const actualFee: ({ utxos, toAddress, amount, feeRate, account, provider, signer, }: {
    utxos: FormattedUtxo[];
    toAddress: string;
    feeRate: number;
    amount: number;
    account: Account;
    provider: Provider;
    signer: Signer;
}) => Promise<{
    fee: number;
}>;
export declare const minimumFee: ({ taprootInputCount, nonTaprootInputCount, outputCount, }: {
    taprootInputCount: number;
    nonTaprootInputCount: number;
    outputCount: number;
}) => number;
interface SplitByAmountsAndAddresses {
    mode: 'amounts_and_addresses';
    amounts: number[];
    addresses: string[];
}
interface SplitByAccountCount {
    mode: 'auto_generate';
    amount: number;
    accountCount: number;
    mnemonic: string;
}
type SplitConfig = SplitByAmountsAndAddresses | SplitByAccountCount;
export declare const splitUtxos: ({ utxos, feeRate, account, provider, signer, splitConfig, fee, }: {
    utxos: FormattedUtxo[];
    feeRate: number;
    account: Account;
    provider: Provider;
    signer: Signer;
    splitConfig: SplitConfig;
    fee?: number;
}) => Promise<{
    outputs: {
        address: string;
        amount: number;
    }[];
    totalSplitAmount: number;
    fee: number;
    changeAmount: number;
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    satsPerVByte: string;
}>;
export {};
