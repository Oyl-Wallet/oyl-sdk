import { AlkaneId } from '@alkanes/types';
/**
 * Operation codes for pool interactions
 */
export declare enum PoolOpcodes {
    INIT_POOL = 0,
    ADD_LIQUIDITY = 1,
    REMOVE_LIQUIDITY = 2,
    SWAP = 3,
    SIMULATE_SWAP = 4,
    NAME = 99,
    POOL_DETAILS = 999
}
/**
 * Result of a pool details query
 */
export interface PoolDetailsResult {
    token0: AlkaneId;
    token1: AlkaneId;
    token0Amount: string;
    token1Amount: string;
    tokenSupply: string;
    poolName: string;
}
/**
 * Result of a remove liquidity preview
 */
export interface RemoveLiquidityPreviewResult {
    token0: AlkaneId;
    token1: AlkaneId;
    token0Amount: bigint;
    token1Amount: bigint;
}
/**
 * Estimates the expected token amounts when removing liquidity based on pool details
 * @param poolDetails The pool details containing token information and amounts
 * @param tokenAmount The amount of LP tokens to remove
 * @returns The preview result containing expected token amounts
 */
export declare function estimateRemoveLiquidityAmounts(poolDetails: PoolDetailsResult, tokenAmount: bigint): RemoveLiquidityPreviewResult;
export interface SwapBuyAmountResult {
    buyAmount: bigint;
    sellTokenFeeAmount: bigint;
}
/**
 * Calculates the expected amount of tokens received after a swap
 * @param sellAmount The amount of tokens being sold
 * @param sellTokenReserve The current balance of the token being sold
 * @param buyTokenReserve The current balance of the token being received
 * @param feeRate The fee percentage (0.5% default)
 */
export declare function swapBuyAmount({ sellAmount, sellTokenReserve, buyTokenReserve, feeRate, }: {
    sellAmount: bigint;
    sellTokenReserve: bigint;
    buyTokenReserve: bigint;
    feeRate: bigint;
}): SwapBuyAmountResult;
