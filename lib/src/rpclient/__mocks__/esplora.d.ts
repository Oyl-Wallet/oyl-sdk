export declare class EsploraRpc {
    getAddressUtxo(): Promise<{
        txid: string;
        vout: number;
        value: number;
    }[]>;
}
