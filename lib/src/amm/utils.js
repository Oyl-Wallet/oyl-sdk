"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.swapBuyAmount = exports.estimateRemoveLiquidityAmounts = exports.PoolOpcodes = void 0;
/**
 * Operation codes for pool interactions
 */
var PoolOpcodes;
(function (PoolOpcodes) {
    PoolOpcodes[PoolOpcodes["INIT_POOL"] = 0] = "INIT_POOL";
    PoolOpcodes[PoolOpcodes["ADD_LIQUIDITY"] = 1] = "ADD_LIQUIDITY";
    PoolOpcodes[PoolOpcodes["REMOVE_LIQUIDITY"] = 2] = "REMOVE_LIQUIDITY";
    PoolOpcodes[PoolOpcodes["SWAP"] = 3] = "SWAP";
    PoolOpcodes[PoolOpcodes["SIMULATE_SWAP"] = 4] = "SIMULATE_SWAP";
    PoolOpcodes[PoolOpcodes["NAME"] = 99] = "NAME";
    PoolOpcodes[PoolOpcodes["POOL_DETAILS"] = 999] = "POOL_DETAILS";
})(PoolOpcodes = exports.PoolOpcodes || (exports.PoolOpcodes = {}));
/**
 * Estimates the expected token amounts when removing liquidity based on pool details
 * @param poolDetails The pool details containing token information and amounts
 * @param tokenAmount The amount of LP tokens to remove
 * @returns The preview result containing expected token amounts
 */
function estimateRemoveLiquidityAmounts(poolDetails, tokenAmount) {
    // Calculate the proportion of the pool that the LP tokens represent
    const totalSupply = BigInt(poolDetails.tokenSupply);
    const proportion = (tokenAmount * 10000n) / totalSupply; // Using 10000 as a multiplier for precision
    // Calculate the expected token amounts based on the proportion
    const token0Amount = (BigInt(poolDetails.token0Amount) * proportion) / 10000n;
    const token1Amount = (BigInt(poolDetails.token1Amount) * proportion) / 10000n;
    return {
        token0: poolDetails.token0,
        token1: poolDetails.token1,
        token0Amount,
        token1Amount,
    };
}
exports.estimateRemoveLiquidityAmounts = estimateRemoveLiquidityAmounts;
/**
 * Calculates the expected amount of tokens received after a swap
 * @param sellAmount The amount of tokens being sold
 * @param sellTokenReserve The current balance of the token being sold
 * @param buyTokenReserve The current balance of the token being received
 * @param feeRate The fee percentage (0.5% default)
 */
function swapBuyAmount({ sellAmount, sellTokenReserve, buyTokenReserve, feeRate, }) {
    if (sellAmount <= 0)
        throw new Error('swapBuyAmount: Insufficient sell amount');
    if (sellTokenReserve <= 0 || buyTokenReserve <= 0)
        throw new Error('swapBuyAmount: Insufficient liquidity');
    const sellAmountWithFee = sellAmount * (1000n - feeRate);
    const numerator = sellAmountWithFee * buyTokenReserve;
    const denominator = sellTokenReserve * 1000n + sellAmountWithFee;
    const buyAmount = numerator / denominator;
    const sellTokenFeeAmount = (sellAmount * feeRate) / 1000n;
    return { buyAmount, sellTokenFeeAmount };
}
exports.swapBuyAmount = swapBuyAmount;
//# sourceMappingURL=utils.js.map