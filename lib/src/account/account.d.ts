import * as bitcoin from 'bitcoinjs-lib';
export type Account = {
    taproot: {
        pubkey: string;
        pubKeyXOnly: string;
        address: string;
        hdPath: string;
    };
    nativeSegwit: {
        pubkey: string;
        address: string;
        hdPath: string;
    };
    nestedSegwit: {
        pubkey: string;
        address: string;
        hdPath: string;
    };
    legacy: {
        pubkey: string;
        address: string;
        hdPath: string;
    };
    spendStrategy: SpendStrategy;
    network: bitcoin.Network;
};
export type AddressKey = 'nativeSegwit' | 'taproot' | 'nestedSegwit' | 'legacy';
export type WalletStandard = 'bip44_account_last' | 'bip44_standard' | 'bip32_simple';
export type HDPaths = {
    legacy?: string;
    nestedSegwit?: string;
    nativeSegwit?: string;
    taproot?: string;
};
export interface SpendStrategy {
    addressOrder: AddressKey[];
    utxoSortGreatestToLeast: boolean;
    changeAddress: AddressKey;
}
export interface MnemonicToAccountOptions {
    network?: bitcoin.networks.Network;
    index?: number;
    spendStrategy?: SpendStrategy;
    hdPaths?: HDPaths;
}
export declare const generateMnemonic: (bitsize?: 128 | 256) => string;
export declare const validateMnemonic: (mnemonic: string) => boolean;
export declare const mnemonicToAccount: ({ mnemonic, opts, }: {
    mnemonic?: string;
    opts?: MnemonicToAccountOptions;
}) => Account;
export declare const getHDPaths: (index?: number, network?: bitcoin.networks.Network, walletStandard?: WalletStandard) => HDPaths;
export declare const generateWallet: ({ mnemonic, opts, }: {
    mnemonic?: string;
    opts: MnemonicToAccountOptions;
}) => {
    taproot: {
        pubkey: string;
        pubKeyXOnly: string;
        address: string;
        hdPath: string;
    };
    nativeSegwit: {
        pubkey: string;
        address: string;
        hdPath: string;
    };
    nestedSegwit: {
        pubkey: string;
        address: string;
        hdPath: string;
    };
    legacy: {
        pubkey: string;
        address: string;
        hdPath: string;
    };
    spendStrategy: SpendStrategy;
    network: bitcoin.networks.Network;
};
export declare const getWalletPrivateKeys: ({ mnemonic, opts, }: {
    mnemonic: string;
    opts?: MnemonicToAccountOptions;
}) => {
    taproot: {
        privateKey: string;
    };
    nativeSegwit: {
        privateKey: string;
    };
    nestedSegwit: {
        privateKey: string;
    };
    legacy: {
        privateKey: string;
    };
};
