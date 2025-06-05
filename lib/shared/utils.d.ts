/// <reference types="node" />
/// <reference types="node" />
import * as bitcoin from 'bitcoinjs-lib';
import { AddressType, DecodedCBOR, IBlockchainInfoUTXO, Network, RuneUtxo, ToSignInput, TxInput, UnspentOutput } from './interface';
import { SandshrewBitcoinClient } from '../rpclient/sandshrew';
import { EsploraRpc } from '../rpclient/esplora';
import { Provider } from '../provider/provider';
import { AddressKey } from '@account/account';
import { FormattedUtxo } from '../utxo';
export interface IBISWalletIx {
    validity: any;
    isBrc: boolean;
    isSns: boolean;
    name: any;
    amount: any;
    isValidTransfer: any;
    operation: any;
    ticker: any;
    isJson: boolean;
    content?: string;
    inscription_name: any;
    inscription_id: string;
    inscription_number: number;
    metadata: any;
    owner_wallet_addr: string;
    mime_type: string;
    last_sale_price: any;
    slug: any;
    collection_name: any;
    content_url: string;
    bis_url: string;
    wallet?: string;
    media_length?: number;
    genesis_ts?: number;
    genesis_height?: number;
    genesis_fee?: number;
    output_value?: number;
    satpoint?: string;
    collection_slug?: string;
    confirmations?: number;
}
export declare const addressTypeMap: {
    0: string;
    1: string;
    2: string;
    3: string;
};
export declare const inscriptionSats = 330;
export declare const ECPair: import("ecpair").ECPairAPI;
export declare const assertHex: (pubKey: Buffer) => Buffer;
export declare function getNetwork(value: Network): bitcoin.Network;
export declare function getFee({ provider, psbt, feeRate, }: {
    provider: Provider;
    psbt: string;
    feeRate: number;
}): Promise<number>;
export declare function tweakSigner(signer: bitcoin.Signer, opts?: any): bitcoin.Signer;
export declare function satoshisToAmount(val: number): string;
export declare function delay(ms: number): Promise<unknown>;
export declare function amountToSatoshis(val: any): number;
export declare const validator: (pubkey: Buffer, msghash: Buffer, signature: Buffer) => boolean;
export declare function utxoToInput(utxo: UnspentOutput, publicKey: Buffer): TxInput;
export declare const getWitnessDataChunk: (content: string, encodeType?: BufferEncoding) => Buffer[];
export declare function calculateAmountGathered(utxoArray: IBlockchainInfoUTXO[]): number;
export declare function calculateAmountGatheredUtxo(utxoArray: FormattedUtxo[]): number;
export declare const formatInputsToSign: ({ _psbt, senderPublicKey, network, }: {
    _psbt: bitcoin.Psbt;
    senderPublicKey: string;
    network: bitcoin.Network;
}) => Promise<bitcoin.Psbt>;
export declare const timeout: (n: any) => Promise<unknown>;
export declare const signInputs: (psbt: bitcoin.Psbt, toSignInputs: ToSignInput[], taprootPubkey: string, segwitPubKey: string, segwitSigner: any, taprootSigner: any) => Promise<bitcoin.Psbt>;
export declare const createInscriptionScript: (pubKey: Buffer, content: string) => bitcoin.payments.Stack;
export declare function encodeToBase26(inputString: string): string;
export declare function runeFromStr(s: string): bigint;
export declare function hexToLittleEndian(hex: string): string;
export declare const createRuneSendScript: ({ runeId, amount, divisibility, sendOutputIndex, pointer, }: {
    runeId: string;
    amount: number;
    divisibility?: number;
    sendOutputIndex?: number;
    pointer: number;
}) => Buffer;
export declare const createRuneMintScript: ({ runeId, pointer, }: {
    runeId: string;
    pointer?: number;
}) => Buffer;
export declare const createRuneEtchScript: ({ pointer, runeName, symbol, divisibility, perMintAmount, premine, cap, turbo, }: {
    pointer?: number;
    runeName: string;
    symbol: string;
    divisibility?: number;
    perMintAmount: number;
    cap?: number;
    premine?: number;
    turbo?: boolean;
}) => Buffer;
export declare function getAddressType(address: string): AddressType | null;
export declare function getAddressKey(address: string): AddressKey;
export declare function waitForTransaction({ txId, sandshrewBtcClient, }: {
    txId: string;
    sandshrewBtcClient: SandshrewBitcoinClient;
}): Promise<void>;
export declare function getOutputValueByVOutIndex({ txId, vOut, esploraRpc, }: {
    txId: string;
    vOut: number;
    esploraRpc: EsploraRpc;
}): Promise<{
    value: number;
    script: string;
} | null>;
export declare function calculateTaprootTxSize(taprootInputCount: number, nonTaprootInputCount: number, outputCount: number): number;
export declare const filterTaprootUtxos: ({ taprootUtxos, }: {
    taprootUtxos: any[];
}) => Promise<any>;
export declare const filterUtxos: ({ utxos }: {
    utxos: any[];
}) => Promise<any>;
export declare const isValidJSON: (str: string) => boolean;
export declare const encodeVarint: (bigIntValue: any) => {
    varint: Buffer;
};
export declare function findRuneUtxosToSpend(utxos: RuneUtxo[], target: number): {
    selectedUtxos: RuneUtxo[];
    change: number;
    totalSatoshis: number;
};
export declare function findXAmountOfSats(utxos: FormattedUtxo[], target: number): {
    utxos: FormattedUtxo[];
    totalAmount: number;
};
export declare function decodeCBOR(hex: string): DecodedCBOR;
export declare const getVSize: (data: Buffer) => number;
export declare const packUTF8: (s: any) => string[];
