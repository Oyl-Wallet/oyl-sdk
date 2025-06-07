import { Provider } from '../provider';
import { Account, SpendStrategy } from '../account';
import { AddressUtxoPortfolio, FormattedUtxo, AccountUtxoPortfolio, GatheredUtxos } from './types';
export declare const accountBalance: ({ account, provider, }: {
    account: Account;
    provider: Provider;
}) => Promise<{
    confirmedAmount: number;
    pendingAmount: number;
    amount: number;
}>;
export declare const addressBalance: ({ address, provider, }: {
    address: string;
    provider: Provider;
}) => Promise<{
    confirmedAmount: number;
    pendingAmount: number;
    amount: number;
}>;
export declare const addressUtxos: ({ address, provider, spendStrategy, }: {
    address: string;
    provider: Provider;
    spendStrategy?: SpendStrategy;
}) => Promise<AddressUtxoPortfolio>;
export declare const accountUtxos: ({ account, provider, }: {
    account: Account;
    provider: Provider;
}) => Promise<AccountUtxoPortfolio>;
export declare const selectUtxos: (utxos: FormattedUtxo[], spendStrategy: SpendStrategy) => FormattedUtxo[];
export declare const selectSpendableUtxos: (utxos: FormattedUtxo[], spendStrategy: SpendStrategy) => GatheredUtxos;
export declare const selectAlkanesUtxos: ({ utxos, greatestToLeast, alkaneId, targetNumberOfAlkanes, }: {
    utxos: FormattedUtxo[];
    greatestToLeast: boolean;
    alkaneId: {
        block: string;
        tx: string;
    };
    targetNumberOfAlkanes: number;
}) => {
    utxos: FormattedUtxo[];
    totalAmount: number;
    totalBalance: number;
};
