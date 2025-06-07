export interface EsploraTx {
    txid: string;
    version: number;
    locktime: number;
    vin: Array<{
        txid: string;
        vout: number;
        prevout: {
            scriptpubkey: string;
            scriptpubkey_asm: string;
            scriptpubkey_type: string;
            scriptpubkey_address: string;
            value: number;
        };
        scriptsig: string;
        scriptsig_asm: string;
        witness: Array<string>;
        is_coinbase: boolean;
        sequence: number;
    }>;
    vout: Array<{
        scriptpubkey: string;
        scriptpubkey_asm: string;
        scriptpubkey_type: string;
        scriptpubkey_address: string;
        value: number;
    }>;
    size: number;
    weight: number;
    fee: number;
    status: {
        confirmed: boolean;
        block_height: number;
        block_hash: string;
        block_time: number;
    };
}
export interface EsploraUtxo {
    txid: string;
    vout: number;
    status: {
        confirmed: boolean;
        block_height?: number;
        block_hash?: string;
        block_time?: number;
    };
    value: number;
}
export declare class EsploraRpc {
    esploraUrl: string;
    constructor(url: string);
    _call(method: string, params?: any[]): Promise<any>;
    getTxInfo(txid: string): Promise<EsploraTx>;
    getTxStatus(txid: string): Promise<any>;
    getBlockTxids(hash: string): Promise<any>;
    getTxHex(txid: string): Promise<any>;
    getTxRaw(txid: string): Promise<any>;
    getTxOutspends(txid: string): Promise<{
        spent: boolean;
    }[]>;
    getAddressTx(address: string): Promise<any>;
    getAddressTxInMempool(address: string): Promise<EsploraTx[]>;
    getAddressUtxo(address: string): Promise<EsploraUtxo[]>;
    getFeeEstimates(): Promise<any>;
}
