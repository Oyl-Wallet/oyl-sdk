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
    commitTxId: string;
    revealTxId: string;
}>;
