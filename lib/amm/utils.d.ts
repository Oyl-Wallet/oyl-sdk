import { AlkaneId } from 'shared/interface';
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
