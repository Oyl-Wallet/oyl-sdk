import 'dotenv/config';
import { Provider, Account, Signer } from '..';
export type NetworkType = 'mainnet' | 'regtest' | 'oylnet';
export interface WalletOptions {
    mnemonic?: string;
    networkType?: NetworkType;
    feeRate?: number;
    provider?: Provider | string;
    metashrewRpcUrl?: string;
}
export declare class Wallet {
    mnemonic: string;
    networkType: string;
    provider: Provider;
    account: Account;
    signer: Signer;
    feeRate: number;
    constructor(options?: WalletOptions);
}
