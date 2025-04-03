import { EsploraRpc } from './esplora';
import { AlkaneId } from 'shared/interface';
import { RemoveLiquidityPreviewResult } from '../amm/utils';
export declare class MetashrewOverride {
    override: any;
    constructor();
    set(v: any): void;
    exists(): boolean;
    get(): any;
}
export declare const metashrew: MetashrewOverride;
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
    constructor(url: string);
    _metashrewCall(method: string, params?: any[]): Promise<any>;
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
    /**
     * Previews the tokens that would be received when removing liquidity from a pool
     * @param token The LP token ID
     * @param tokenAmount The amount of LP tokens to remove
     * @returns A promise that resolves to the preview result containing token amounts
     */
    previewRemoveLiquidity({ token, tokenAmount, }: {
        token: AlkaneId;
        tokenAmount: bigint;
    }): Promise<RemoveLiquidityPreviewResult>;
    getAlkanesByOutpoint({ txid, vout, protocolTag, height, }: {
        txid: string;
        vout: number;
        protocolTag?: string;
        height?: string;
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
