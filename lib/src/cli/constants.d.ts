import { Provider } from '..';
export declare const DEFAULT_PROVIDER: {
    alkanes: Provider;
    bitcoin: Provider;
    regtest: Provider;
    oylnet: Provider;
    signet: Provider;
};
export declare const REGTEST_FAUCET: {
    mnemonic: string;
    nativeSegwit: {
        address: string;
        publicKey: string;
    };
    taproot: {
        address: string;
        publicKey: string;
    };
};
export declare const TEST_WALLET: {
    mnemonic: string;
    nativeSegwit: {
        address: string;
        publicKey: string;
    };
    taproot: {
        address: string;
        publicKey: string;
    };
};
