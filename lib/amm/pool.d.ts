import { Account, Provider, Signer } from '..';
import { AlkaneId, Utxo } from 'shared/interface';
export type SwapSimulationResult = {
    amountOut: bigint;
};
export type PoolDetailsResult = {
    token0: AlkaneId;
    token1: AlkaneId;
    token0Amount: string;
    token1Amount: string;
    tokenSupply: string;
    poolName: string;
};
export declare enum PoolOpcodes {
    INIT_POOL = 0,
    ADD_LIQUIDITY = 1,
    REMOVE_LIQUIDITY = 2,
    SWAP = 3,
    SIMULATE_SWAP = 4,
    NAME = 99,
    POOL_DETAILS = 999
}
export declare class AlkanesAMMPoolDecoder {
    decodeSwap(data: string): SwapSimulationResult | undefined;
    decodePoolDetails(data: string): PoolDetailsResult | undefined;
    decodeName(data: string): string | undefined;
    static decodeSimulation(result: any, opcode: number): any;
}
export declare const addLiquidityPsbt: ({ calldata, token0, token0Amount, token1, token1Amount, gatheredUtxos, feeRate, account, provider, }: {
    calldata: bigint[];
    token0: AlkaneId;
    token0Amount: bigint;
    token1: AlkaneId;
    token1Amount: bigint;
    gatheredUtxos: {
        utxos: Utxo[];
        totalAmount: number;
    };
    feeRate: number;
    account: Account;
    provider: Provider;
}) => Promise<{
    psbt: string;
    fee: number;
}>;
export declare const addLiquidity: ({ calldata, token0, token0Amount, token1, token1Amount, gatheredUtxos, feeRate, account, signer, provider, }: {
    calldata: bigint[];
    token0: AlkaneId;
    token0Amount: bigint;
    token1: AlkaneId;
    token1Amount: bigint;
    gatheredUtxos: {
        utxos: Utxo[];
        totalAmount: number;
    };
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
export declare const removeLiquidityPsbt: ({ calldata, token, tokenAmount, gatheredUtxos, feeRate, account, provider, }: {
    calldata: bigint[];
    token: AlkaneId;
    tokenAmount: bigint;
    gatheredUtxos: {
        utxos: Utxo[];
        totalAmount: number;
    };
    feeRate: number;
    account: Account;
    provider: Provider;
}) => Promise<{
    psbt: string;
}>;
export declare const removeLiquidity: ({ calldata, token, tokenAmount, gatheredUtxos, feeRate, account, signer, provider, }: {
    calldata: bigint[];
    token: AlkaneId;
    tokenAmount: bigint;
    gatheredUtxos: {
        utxos: Utxo[];
        totalAmount: number;
    };
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
export declare const swapPsbt: ({ calldata, token, tokenAmount, gatheredUtxos, feeRate, account, provider, }: {
    calldata: bigint[];
    token: AlkaneId;
    tokenAmount: bigint;
    gatheredUtxos: {
        utxos: Utxo[];
        totalAmount: number;
    };
    feeRate: number;
    account: Account;
    provider: Provider;
}) => Promise<{
    psbt: string;
}>;
export declare const swap: ({ calldata, token, tokenAmount, gatheredUtxos, feeRate, account, signer, provider, }: {
    calldata: bigint[];
    token: AlkaneId;
    tokenAmount: bigint;
    gatheredUtxos: {
        utxos: Utxo[];
        totalAmount: number;
    };
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
