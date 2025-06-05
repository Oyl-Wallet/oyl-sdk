/// <reference types="node" />
/// <reference types="node" />
import { ProtoruneEdict } from 'alkanes/lib/protorune/protoruneedict';
import { Account, Provider, Signer } from '..';
import { PoolDetailsResult } from './utils';
import { FormattedUtxo } from '../utxo';
import { AlkaneId } from '@alkanes/types';
export type CreateNewPoolSimulationResult = {
    lpTokens: string;
    alkaneId: AlkaneId;
};
export type FindExistingPoolIdSimulationResult = {
    alkaneId: AlkaneId;
};
export type GetAllPoolsResult = {
    count: number;
    pools: AlkaneId[];
};
export type AllPoolsDetailsResult = {
    count: number;
    pools: (PoolDetailsResult & {
        poolId: AlkaneId;
    })[];
};
export declare enum PoolFactoryOpcodes {
    INIT_POOL = 0,
    CREATE_NEW_POOL = 1,
    FIND_EXISTING_POOL_ID = 2,
    GET_ALL_POOLS = 3
}
export declare const parseAlkaneIdFromHex: (hex: string) => AlkaneId;
export declare class AlkanesAMMPoolFactoryDecoder {
    decodeCreateNewPool(execution: any): CreateNewPoolSimulationResult | undefined;
    decodeFindExistingPoolId(execution: any): FindExistingPoolIdSimulationResult | undefined;
    decodeGetAllPools(execution: any): GetAllPoolsResult | undefined;
    decodeAllPoolsDetails(factoryExecution: any, provider: Provider): Promise<AllPoolsDetailsResult | undefined>;
    static decodeSimulation(result: any, opcode: number): any;
}
export declare const getPoolId: () => Promise<void>;
export declare const createNewPoolPsbt: ({ calldata, token0, token0Amount, token1, token1Amount, utxos, feeRate, account, provider, }: {
    calldata: bigint[];
    token0: AlkaneId;
    token0Amount: bigint;
    token1: AlkaneId;
    token1Amount: bigint;
    utxos: FormattedUtxo[];
    feeRate: number;
    account: Account;
    provider: Provider;
}) => Promise<{
    psbt: string;
    fee: number;
}>;
export declare const createNewPool: ({ calldata, token0, token0Amount, token1, token1Amount, utxos, feeRate, account, signer, provider, }: {
    calldata: bigint[];
    token0: AlkaneId;
    token0Amount: bigint;
    token1: AlkaneId;
    token1Amount: bigint;
    utxos: FormattedUtxo[];
    feeRate: number;
    account: Account;
    provider: Provider;
    signer: Signer;
}) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const splitAlkaneUtxos: (tokens: {
    alkaneId: AlkaneId;
    amount: bigint;
}[], utxos: FormattedUtxo[]) => {
    protostone: Buffer;
    edicts: ProtoruneEdict[];
    utxos: FormattedUtxo[];
    totalAmount: number;
};
export declare const poolPsbt: ({ alkanesUtxos, utxos, account, protostone, provider, feeRate, fee, }: {
    alkanesUtxos?: FormattedUtxo[];
    utxos: FormattedUtxo[];
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
    fee?: number;
}) => Promise<{
    psbt: string;
    psbtHex: string;
}>;
