import * as bitcoin from 'bitcoinjs-lib';
import { ECPairInterface } from 'ecpair';
export type walletInit = {
    segwitPrivateKey?: string;
    taprootPrivateKey?: string;
    legacyPrivateKey?: string;
    nestedSegwitPrivateKey?: string;
};
export declare enum SighashType {
    ALL,
    NONE,
    SINGLE,
    ANYONECANPAY,
    ALL_ANYONECANPAY,
    NONE_ANYONECANPAY,
    SINGLE_ANYONECANPAY
}
export declare class Signer {
    network: bitcoin.Network;
    segwitKeyPair: ECPairInterface;
    taprootKeyPair: ECPairInterface;
    legacyKeyPair: ECPairInterface;
    nestedSegwitKeyPair: ECPairInterface;
    addresses: walletInit;
    constructor(network: bitcoin.Network, keys: walletInit);
    signSegwitInput({ rawPsbt, inputNumber, finalize, }: {
        rawPsbt: string;
        inputNumber: number;
        finalize: boolean;
    }): Promise<{
        signedPsbt: string;
    }>;
    signTaprootInput({ rawPsbt, inputNumber, finalize, }: {
        rawPsbt: string;
        inputNumber: number;
        finalize: boolean;
    }): Promise<{
        signedPsbt: string;
    }>;
    signAllTaprootInputs({ rawPsbt, finalize, }: {
        rawPsbt: string;
        finalize: boolean;
    }): Promise<{
        signedPsbt: string;
        raw: bitcoin.Psbt;
        signedHexPsbt: string;
    }>;
    signAllInputs({ rawPsbt, rawPsbtHex, finalize, }: {
        rawPsbt?: string;
        rawPsbtHex?: string;
        finalize?: boolean;
    }): Promise<{
        signedPsbt: string;
        signedHexPsbt: string;
    }>;
    signAllSegwitInputs({ rawPsbt, finalize, }: {
        rawPsbt: string;
        finalize: boolean;
    }): Promise<{
        signedPsbt: string;
        signedHexPsbt: string;
    }>;
    signMessage({ message, address, keypair, protocol, }: {
        message: string;
        address?: string;
        keypair: ECPairInterface;
        protocol: 'ecdsa' | 'bip322';
    }): Promise<string>;
}
