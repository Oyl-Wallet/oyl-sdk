import 'dotenv/config';
import { Provider, Account, Signer, Network } from '..';
export interface WalletOptions {
    mnemonic?: string;
    networkType?: Network;
    feeRate?: number;
    provider?: Provider;
}
export declare class Wallet {
    mnemonic: string;
    networkType: Network;
    provider: Provider;
    account: Account;
    signer: Signer;
    feeRate: number;
    constructor(options?: WalletOptions);
}
