/// <reference types="node" />
/// <reference types="node" />
import { payments, Psbt } from 'bitcoinjs-lib';
import * as bitcoin from 'bitcoinjs-lib';
import { Provider } from '../provider';
import { Signer } from '@signer/signer';
import { Account } from '@account/account';
export interface InscriptionResponse {
    address: string;
    inscriptions?: string;
    scriptPubkey: string;
    transaction: string;
    value: string;
}
export type Network = 'mainnet' | 'testnet' | 'regtest' | 'signet' | 'oylnet';
export type WitnessScriptOptions = {
    pubKeyHex: string;
    mediaContent: string;
    mediaType: string;
    meta: any;
    recover?: boolean;
};
export declare enum RarityEnum {
    COMMON = "common",
    UNCOMMON = "uncommon",
    RARE = "rare",
    EPIC = "epic",
    LEGENDARY = "legendary",
    MYTHIC = "mythic"
}
export type Rarity = `${RarityEnum}`;
export interface Ordinal {
    number: number;
    decimal: string;
    degree: string;
    name: string;
    height: number;
    cycle: number;
    epoch: number;
    period: number;
    offset: number;
    rarity: Rarity;
    output: string;
    start: number;
    size: number;
}
export interface Inscription {
    id: string;
    outpoint: string;
    owner: string;
    genesis: string;
    fee: number;
    height: number;
    number: number;
    sat: number;
    timestamp: number;
    mediaType: string;
    mediaSize: number;
    mediaContent: string;
    meta?: Record<string, any>;
}
export interface UnspentOutput {
    txId: string;
    outputIndex: number;
    satoshis: number;
    scriptPk: string;
    addressType: AddressType;
    address: string;
    ords: {
        id: string;
        offset: number;
    }[];
}
export interface TxInput {
    data: {
        hash: string;
        index: number;
        witnessUtxo: {
            value: number;
            script: Buffer;
        };
        tapInternalKey?: Buffer;
        segwitInternalKey?: Buffer;
    };
    utxo: UnspentOutput;
}
export interface TxOutput {
    address: string;
    value: number;
}
export interface ToSignInput {
    index: number;
    publicKey: string;
    sighashTypes?: number[];
}
export interface PrevOut {
    hash: string;
    index: number;
}
export interface Input {
    prevout: PrevOut;
    coin: {
        value: number;
    };
}
export interface Output {
    value: number;
    script: string;
    address: string;
}
export interface Transaction {
    inputs: Input[];
    outputs: Output[];
}
export declare enum AddressType {
    P2PKH = 0,
    P2TR = 1,
    P2SH_P2WPKH = 2,
    P2WPKH = 3
}
export interface MarketplaceOffer {
    ticker: string;
    offerId: any;
    amount?: string;
    address?: string;
    marketplace: string;
    price?: number;
    unitPrice?: number;
    totalPrice?: number;
    psbt?: string;
    inscriptionId?: string;
}
export declare enum AssetType {
    BRC20 = 0,
    COLLECTIBLE = 1,
    RUNES = 2,
    ALKANES = 3
}
export type OrdCollectibleData = {
    address: string;
    children: any[];
    content_length: number;
    content_type: string;
    genesis_fee: number;
    genesis_height: number;
    inscription_id: string;
    inscription_number: number;
    next: string;
    output_value: number;
    parent: any;
    previous: string;
    rune: any;
    sat: number;
    satpoint: string;
    timestamp: number;
};
export interface SwapPayload {
    address: string;
    auctionId: string;
    bidPrice: number;
    pubKey: string;
    receiveAddress: string;
    feerate: number;
}
export interface OkxBid {
    ticker?: string;
    amount?: number;
    price?: number;
    fromAddress: string;
    toAddress: string;
    inscriptionId: string;
    buyerPsbt: string;
    orderId: number;
    brc20: boolean;
}
export interface MarketplaceAccount {
    provider?: Provider;
    spendAddress?: string;
    spendPubKey?: string;
    altSpendAddress?: string;
    altSpendPubKey?: string;
    account?: Account;
    signer: Signer;
    assetType: AssetType;
    receiveAddress: string;
    feeRate: number;
}
export interface GetOffersParams {
    ticker: string;
    sort_by?: 'unitPrice' | 'totalPrice';
    order?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
}
export interface GetCollectionOffersParams {
    collectionId: string;
    sort_by?: 'unitPrice' | 'totalPrice';
    order?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
}
export interface MarketplaceOffers {
    offerId: string;
    marketplace: string;
    ticker: string;
}
export interface RecoverAccountOptions {
    mnemonic?: string;
    activeIndexes?: number[];
    customPath?: 'xverse' | 'leather' | 'unisat' | 'testnet';
    network: bitcoin.Network;
}
export interface oylAccounts {
    taproot: {
        taprootKeyring: any;
        taprootAddresses: string[];
        taprootPubKey: string;
    };
    segwit: {
        segwitKeyring: any;
        segwitAddresses: string[];
        segwitPubKey: string;
    };
    initializedFrom: string;
    mnemonic: string;
}
export interface FeeEstimatorOptions {
    feeRate: number;
    network: Network;
    psbt?: Psbt;
    witness?: Buffer[];
}
export interface MarketplaceBuy {
    address: string;
    pubKey: string;
    psbtBase64: string;
    price: number;
    provider?: Provider;
    receiveAddress: string;
    feeRate: number;
    dryRun?: boolean;
}
export interface IBlockchainInfoUTXO {
    tx_hash_big_endian: string;
    tx_hash?: string;
    tx_output_n: number;
    script: string;
    value: number;
    value_hex?: string;
    confirmations: number;
    tx_index: number;
}
export interface txOutputs {
    scriptpubkey: string;
    scriptpubkey_asm: string;
    scriptpubkey_type: string;
    scriptpubkey_address: string;
    value: number;
}
export interface InscribeTransfer {
    fromAddress: string;
    taprootPublicKey: string;
    destinationAddress: string;
    segwitPubKey?: string;
    segwitAddress?: string;
    payFeesWithSegwit?: boolean;
    feeRate?: number;
    token?: string;
    mnemonic: string;
    amount?: number;
    postage?: number;
    segwitHdPath: string;
    isDry?: boolean;
    inscriptionId?: string;
}
export interface SwapBrcBid {
    address: string;
    auctionId: string | string[];
    bidPrice: number | number[];
    feerate: number;
    pubKey: string;
    receiveAddress: string;
    signature?: string;
}
export interface SignedBid {
    psbtBid: string;
    auctionId?: string;
    bidId: string;
}
export declare const addressTypeToName: {
    readonly p2pkh: "legacy";
    readonly p2tr: "taproot";
    readonly p2sh: "nested-segwit";
    readonly p2wpkh: "segwit";
};
export declare const internalAddressTypeToName: {
    readonly 0: "legacy";
    readonly 1: "taproot";
    readonly 2: "nested-segwit";
    readonly 3: "segwit";
};
export declare const addressNameToType: {
    readonly legacy: "p2pkh";
    readonly taproot: "p2tr";
    readonly 'nested-segwit': "p2sh-p2wpkh";
    readonly segwit: "p2wpkh";
};
export type RuneUtxo = {
    outpointId: string;
    amount: number;
    scriptPk: string;
    satoshis: number;
};
export type RuneUTXO = {
    txId: string;
    outputIndex: string;
    amountOfRunes: number;
    address: string;
    scriptPk: string;
    satoshis: number;
};
export type AddressTypes = keyof typeof addressTypeToName;
export type AddressFormats = (typeof addressTypeToName)[AddressTypes];
export interface BitcoinPaymentType {
    type: AddressTypes;
    payload: false | payments.Payment;
}
export interface SwapBrc {
    address: String;
    auctionId: String;
    bidPrice: Number;
    pubKey: String;
    mnemonic: String;
    hdPath: String;
    type: String;
}
export interface TickerDetails {
    ticker: string;
    overall_balance: string;
    available_balance: string;
    transferrable_balance: string;
    image_url: string | null;
}
export interface ApiResponse {
    statusCode: number;
    data: TickerDetails[];
}
export interface IRpcMethods {
    abandonTransaction?(arg: string): Promise<any>;
    abortRescan?(): Promise<any>;
    addMultiSigAddress?(): Promise<any>;
    addNode?(): Promise<any>;
    analyzePSBT?(arg: string): Promise<any>;
    backupWallet?(): Promise<any>;
    bumpFee?(arg: string): Promise<any>;
    clearBanned?(): Promise<any>;
    combinePSBT?(arg: object): Promise<any>;
    combineRawTransaction?(arg: object): Promise<any>;
    convertToPSBT?(arg: string): Promise<any>;
    createMultiSig?(): Promise<any>;
    createPSBT?(arg: object): Promise<any>;
    createRawTransaction?(arg1: object, arg2: object): Promise<any>;
    createWallet?(arg: string): Promise<any>;
    decodePSBT?(arg: string): Promise<any>;
    decodeScript?(arg: string): Promise<any>;
    decodeRawTransaction?(arg: string): Promise<any>;
    deriveAddresses?(arg: string): Promise<any>;
    disconnectNode?(): Promise<any>;
    dumpPrivKey?(): Promise<any>;
    dumpWallet?(arg: string): Promise<any>;
    encryptWallet?(): Promise<any>;
    enumerateSigners?(): Promise<any>;
    estimateSmartFee?(arg1: number, arg2: string): Promise<any>;
    generateBlock?(arg1: string, arg2: object): Promise<any>;
    generateToAddress?(arg1: number, arg2: string): Promise<any>;
    generateToDescriptor?(arg1: number, arg2: string): Promise<any>;
    getAddedNodeInfo?(): Promise<any>;
    getAddressesByLabel?(arg: string): Promise<any>;
    getAddressInfo?(arg: string): Promise<any>;
    getBalance?(arg1: string, arg2: number): Promise<any>;
    getBalances?(): Promise<any>;
    getBestBlockHash?(): Promise<any>;
    getBlock?(arg1: string, arg2?: number): Promise<any>;
    getBlockchainInfo?(): Promise<any>;
    getBlockCount?(): Promise<any>;
    getBlockHash?(arg1: number): Promise<any>;
    getBlockFilter?(arg: string): Promise<any>;
    getBlockHeader?(arg: string): Promise<any>;
    getBlockStats?(arg: string): Promise<any>;
    getBlockTemplate?(): Promise<any>;
    getConnectionCount?(): Promise<any>;
    getChainTips?(): Promise<any>;
    getChainTxStats?(): Promise<any>;
    getDescriptorInfo?(arg: string): Promise<any>;
    getDifficulty?(): Promise<any>;
    getIndexInfo?(): Promise<any>;
    getMemoryInfo?(): Promise<any>;
    getMemPoolAncestors?(arg: string): Promise<any>;
    getMemPoolDescendants?(arg: string): Promise<any>;
    getMemPoolEntry?(arg: string): Promise<any>;
    getMemPoolInfo?(): Promise<any>;
    getMiningInfo?(): Promise<any>;
    getNetTotals?(): Promise<any>;
    getNetworkHashPS?(): Promise<any>;
    getNetworkInfo?(): Promise<any>;
    getNewAddress?(arg1: string, arg2: string): Promise<any>;
    getNodeAddresses?(): Promise<any>;
    getPeerInfo?(): Promise<any>;
    getRawChangeAddress?(): Promise<any>;
    getRawMemPool?(arg: boolean): Promise<any>;
    getRawTransaction?(arg1: string, arg2: number): Promise<any>;
    getReceivedByAddress?(arg1: string, arg2: number): Promise<any>;
    getReceivedByLabel?(arg: string): Promise<any>;
    getRpcInfo?(): Promise<any>;
    getSpentInfo?(arg: object): Promise<any>;
    getTransaction?(): Promise<any>;
    getTxOut?(arg1: string, arg2: number, arg3: boolean): Promise<any>;
    getTxOutProof?(): Promise<any>;
    getTxOutSetInfo?(): Promise<any>;
    getUnconfirmedBalance?(): Promise<any>;
    getWalletInfo?(): Promise<any>;
    getWork?(): Promise<any>;
    getZmqNotifications?(): Promise<any>;
    finalizePSBT?(arg: string): Promise<any>;
    fundRawTransaction?(arg: string): Promise<any>;
    help?(): Promise<any>;
    importAddress?(arg1: string, arg2: string, arg3: boolean): Promise<any>;
    importDescriptors?(arg: string): Promise<any>;
    importMulti?(arg1: object, arg2: object): Promise<any>;
    importPrivKey?(arg1: string, arg2: string, arg3: boolean): Promise<any>;
    importPrunedFunds?(arg1: string, arg2: string): Promise<any>;
    importPubKey?(arg: string): Promise<any>;
    importWallet?(arg: string): Promise<any>;
    invalidateBlock?(arg: string): Promise<any>;
    joinPSBTs?(arg: object): Promise<any>;
    keyPoolRefill?(): Promise<any>;
    listAccounts?(arg: number): Promise<any>;
    listAddressGroupings?(): Promise<any>;
    listBanned?(): Promise<any>;
    listDescriptors?(): Promise<any>;
    listLabels?(): Promise<any>;
    listLockUnspent?(arg: boolean): Promise<any>;
    listReceivedByAccount?(arg1: number, arg2: boolean): Promise<any>;
    listReceivedByAddress?(arg1: number, arg2: boolean): Promise<any>;
    listReceivedByLabel?(): Promise<any>;
    listSinceBlock?(arg1: string, arg2: number): Promise<any>;
    listTransactions?(arg1: string, arg2: number, arg3: number): Promise<any>;
    listUnspent?(arg1: number | undefined, arg2: number | undefined, arg3: string[]): Promise<any>;
    listWalletDir?(): Promise<any>;
    listWallets?(): Promise<any>;
    loadWallet?(arg: string): Promise<any>;
    lockUnspent?(): Promise<any>;
    logging?(): Promise<any>;
    move?(arg1: string, arg2: string, arg3: number, arg4: number, arg5: string): Promise<any>;
    ping?(): Promise<any>;
    preciousBlock?(arg: string): Promise<any>;
    prioritiseTransaction?(arg1: string, arg2: number, arg3: number): Promise<any>;
    pruneBlockChain?(arg: number): Promise<any>;
    psbtBumpFee?(arg: string): Promise<any>;
    removePrunedFunds?(arg: string): Promise<any>;
    reScanBlockChain?(): Promise<any>;
    saveMemPool?(): Promise<any>;
    send?(arg: object): Promise<any>;
    setHDSeed?(): Promise<any>;
    setLabel?(arg1: string, arg2: string): Promise<any>;
    setWalletFlag?(arg: string): Promise<any>;
    scanTxOutSet?(arg: string): Promise<any>;
    sendFrom?(arg1: string, arg2: string, arg3: number, arg4: number, arg5: string, arg6: string): Promise<any>;
    sendRawTransaction?(arg: string): Promise<any>;
    sendToAddress?(arg1: string, arg2: number, arg3: string, arg4: string): Promise<any>;
    setAccount?(): Promise<any>;
    setBan?(arg1: string, arg2: string): Promise<any>;
    setNetworkActive?(arg: boolean): Promise<any>;
    setGenerate?(arg1: boolean, arg2: number): Promise<any>;
    setTxFee?(arg: number): Promise<any>;
    signMessage?(): Promise<any>;
    signMessageWithPrivKey?(arg1: string, arg2: string): Promise<any>;
    signRawTransaction?(): Promise<any>;
    signRawTransactionWithKey?(arg1: string, arg2: object): Promise<any>;
    signRawTransactionWithWallet?(arg: string): Promise<any>;
    stop?(): Promise<any>;
    submitBlock?(arg: string): Promise<any>;
    submitHeader?(arg: string): Promise<any>;
    testMemPoolAccept?(arg: object): Promise<any>;
    unloadWallet?(): Promise<any>;
    upgradeWallet?(): Promise<any>;
    uptime?(): Promise<any>;
    utxoUpdatePSBT?(arg: string): Promise<any>;
    validateAddress?(): Promise<any>;
    verifyChain?(): Promise<any>;
    verifyMessage?(): Promise<any>;
    verifyTxOutProof?(): Promise<any>;
    walletCreateFundedPSBT?(): Promise<any>;
    walletDisplayAddress?(arg: string): Promise<any>;
    walletLock?(): Promise<any>;
    walletPassphraseChange?(): Promise<any>;
    walletProcessPSBT?(arg: string): Promise<any>;
}
export type TxType = 'sent' | 'received' | 'swap' | 'unknown';
export type InscriptionType = 'brc-20' | 'collectible';
export type HistoryTxBrc20Inscription = {
    ticker: string;
    amount: number;
};
export type HistoryTxCollectibleInscription = {
    contentType: string;
    imageUrl: string;
    inscriptionId: string;
    inscriptionNumber: number;
};
export type HistoryBaseTx = {
    txId: string;
    confirmations: number;
    blockTime: number;
    blockHeight: number;
    fee: number;
    type: TxType;
    feeRate: number;
    vinSum: number;
    to?: string;
    from?: string;
    voutSum: number;
    amount: number;
};
export type HistoryBtcTx = HistoryBaseTx & {
    inscriptionDetails: null;
    inscriptionType: null;
};
export type HistoryCollectibleTx = HistoryBaseTx & {
    inscriptionDetails: HistoryTxCollectibleInscription[];
    inscriptionType: 'collectible';
};
export type HistoryBrc20Tx = HistoryBaseTx & {
    inscriptionDetails: HistoryTxBrc20Inscription[];
    inscriptionType: 'brc-20';
};
export type HistoryTxInscriptionDetails = HistoryTxBrc20Inscription[] | HistoryTxCollectibleInscription[];
export type HistoryTx = HistoryBrc20Tx | HistoryCollectibleTx;
export type DecodedCBORValue = string | number | boolean | null | undefined | DecodedCBOR | DecodedCBORValue[];
export interface DecodedCBOR {
    [key: string]: DecodedCBORValue;
}
export interface AlkanesPayload {
    body: Uint8Array;
    cursed: boolean;
    tags: {
        contentType: string;
    };
}
