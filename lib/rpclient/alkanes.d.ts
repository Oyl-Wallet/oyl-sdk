import { EsploraRpc } from './esplora';
import { RemoveLiquidityPreviewResult } from '../amm/utils';
import { AlkaneId, AlkaneSimulateRequest, AlkanesOutpoint, AlkanesResponse, AlkaneToken } from '@alkanes/types';
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
export declare class AlkanesRpc {
    alkanesUrl: string;
    esplora: EsploraRpc;
    constructor(url: string);
    _metashrewCall(method: string, params?: any[]): Promise<any>;
    _call(method: string, params?: any[]): Promise<any>;
    metashrewHeight(): Promise<AlkanesResponse>;
    getAlkanesByHeight({ height, protocolTag, }: {
        height: number;
        protocolTag: string;
    }): Promise<AlkanesResponse>;
    getAlkanesByAddress({ address, protocolTag, name, }: {
        address: string;
        protocolTag?: string;
        name?: string;
    }): Promise<AlkanesOutpoint[]>;
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
    getAlkaneByIdMeta({ block, tx, dataOnly, }: {
        block: string;
        tx: string;
        dataOnly?: boolean;
    }): Promise<{
        meta: any;
        simulationResults: {
            [key: string]: any;
        };
        data: {
            [key: string]: any;
        };
    } | {
        data: {
            [key: string]: any;
        };
    }>;
    /**
     * Get alkanes meta data
     * @param limit - The number of alkanes to get
     * @param offset - The offset to start from
     * @param dataOnly - FALSE returns the meta data and simulation results
     * @returns The meta data for the alkanes
     */
    getAlkanesMeta({ block, limit, offset, dataOnly, }: {
        block?: string;
        limit?: number;
        offset?: number;
        dataOnly?: boolean;
    }): Promise<{
        meta: any;
        simulationResults: {
            [key: string]: any;
        };
        data: any[];
    } | {
        data: any[];
    }>;
}
