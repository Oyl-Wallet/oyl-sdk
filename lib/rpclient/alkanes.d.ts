import { EsploraRpc } from './esplora';
export declare const stripHexPrefix: (s: string) => string;
export declare function mapToPrimitives(v: any): any;
export declare function unmapFromPrimitives(v: any): any;
export interface Rune {
    rune: {
        id: {
            block: string;
            tx: string;
        };
        name: string;
        spacedName: string;
        divisibility: number;
        spacers: number;
        symbol: string;
    };
    balance: string;
}
export interface Outpoint {
    runes: Rune[];
    outpoint: {
        txid: string;
        vout: number;
    };
    output: {
        value: string;
        script: string;
    };
    txindex: number;
    height: number;
}
export interface AlkanesResponse {
    outpoints: Outpoint[];
    balanceSheet: [];
}
interface AlkaneSimulateRequest {
    alkanes: any[];
    transaction: string;
    block: string;
    height: string;
    txindex: number;
    target: {
        block: string;
        tx: string;
    };
    inputs: string[];
    pointer: number;
    refundPointer: number;
    vout: number;
}
interface AlkaneToken {
    name: string;
    symbol: string;
    totalSupply: number;
    cap: number;
    minted: number;
    mintActive: boolean;
    percentageMinted: number;
    mintAmount: number;
}
export declare class AlkanesRpc {
    alkanesUrl: string;
    esplora: EsploraRpc;
    private metashrewUrl;
    constructor(url: string, metashrewUrl?: string);
    _call(method: string, params?: any[]): Promise<any>;
    getAlkanesByHeight({ height, protocolTag, }: {
        height: number;
        protocolTag: string;
    }): Promise<AlkanesResponse>;
    getAlkanesByAddress({ address, protocolTag, name, }: {
        address: string;
        protocolTag?: string;
        name?: string;
    }): Promise<Outpoint[]>;
    trace(request: {
        vout: number;
        txid: string;
    }): Promise<any>;
    parsePoolInfo(hexData: string): {
        tokenA: {
            block: string;
            tx: string;
        };
        tokenB: {
            block: string;
            tx: string;
        };
        reserveA: string;
        reserveB: string;
    };
    simulate(request: Partial<AlkaneSimulateRequest>, decoder?: any): Promise<any>;
    simulatePoolInfo(request: AlkaneSimulateRequest): Promise<any>;
    getAlkanesByOutpoint({ txid, vout, protocolTag, }: {
        txid: string;
        vout: number;
        protocolTag?: string;
    }): Promise<any>;
    getAlkaneById({ block, tx, }: {
        block: string;
        tx: string;
    }): Promise<AlkaneToken>;
    getAlkanes({ limit, offset, }: {
        limit: number;
        offset?: number;
    }): Promise<AlkaneToken[]>;
    meta(request: Partial<AlkaneSimulateRequest>, decoder?: any): Promise<any>;
    parseSimulateReturn(v: any): {
        string: string;
        bytes: string;
        le: string;
        be: string;
    };
}
export {};
