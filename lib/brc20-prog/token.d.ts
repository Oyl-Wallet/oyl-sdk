import { Account, Signer, Provider } from '..';
import { FormattedUtxo } from '../utxo';
export declare const inscribeJson: ({ json, utxos, account, provider, feeRate, signer, }: {
    json: any;
    utxos: FormattedUtxo[];
    account: Account;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
}) => Promise<{
    commitTx: string;
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
