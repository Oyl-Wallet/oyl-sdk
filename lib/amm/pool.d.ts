import { Account, Provider, Signer } from '..';
import { AlkaneId, Utxo } from 'shared/interface';
import { PoolDetailsResult, RemoveLiquidityPreviewResult } from './utils';
export type SwapSimulationResult = {
    amountOut: bigint;
};
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
/**
 * Estimates the tokens that would be received when removing liquidity from a pool
 * @param token The LP token ID
 * @param tokenAmount The amount of LP tokens to remove
 * @param provider The provider instance
 * @returns A promise that resolves to the preview result containing token amounts
 */
export declare const previewRemoveLiquidity: ({ token, tokenAmount, provider, }: {
    token: AlkaneId;
    tokenAmount: bigint;
    provider: Provider;
}) => Promise<RemoveLiquidityPreviewResult>;
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
