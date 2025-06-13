"use strict";
/**
 * 交易广播模块
 *
 * 实现带重试机制的顺序广播系统，确保链式交易按正确顺序提交
 * 支持父交易确认等待、子交易依次广播、完整的错误处理和状态跟踪
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastTransactionChainWithRpc = exports.broadcastTransactionChain = exports.broadcastTransactionChainParallel = exports.waitForTransactionAcceptance = exports.broadcastSingleTransaction = exports.broadcastSingleTransactionWithRpc = void 0;
const tslib_1 = require("tslib");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const chainMinting_1 = require("./chainMinting");
const rpcFactory_1 = require("../rpclient/rpcFactory");
// ============================================================================
// 核心广播功能
// ============================================================================
/**
 * 使用自定义RPC广播单个交易
 */
async function broadcastSingleTransactionWithRpc(psbtHex, expectedTxId, rpcClient, networkType, config = chainMinting_1.DEFAULT_BROADCAST_CONFIG) {
    const startTime = Date.now();
    let retryCount = 0;
    let lastError;
    // 如果没有提供RPC客户端，创建一个
    const client = rpcClient || (0, rpcFactory_1.createRpcClient)(networkType);
    console.log(`📡 开始广播交易 (自定义RPC): ${expectedTxId}`);
    // 检查是否为无限重试模式 (maxRetries = 0)
    const infiniteRetry = config.maxRetries === 0;
    let attempt = 0;
    while (infiniteRetry ? true : attempt <= config.maxRetries) {
        try {
            console.log(`   第 ${attempt + 1} 次尝试...`);
            // 提取原始交易
            const psbt = bitcoin.Psbt.fromHex(psbtHex);
            const rawTx = psbt.extractTransaction().toHex();
            // 直接广播交易
            const actualTxId = await client.sendRawTransaction(rawTx);
            // 验证交易ID是否匹配
            if (actualTxId !== expectedTxId) {
                console.warn(`⚠️  交易ID不匹配: 期望 ${expectedTxId}, 实际 ${actualTxId}`);
            }
            console.log(`✅ 交易广播成功 (自定义RPC): ${actualTxId}`);
            return {
                txId: actualTxId,
                timestamp: Date.now(),
                retryCount: attempt,
                success: true
            };
        }
        catch (error) {
            retryCount = attempt;
            lastError = error.message;
            console.error(`❌ 第 ${attempt + 1} 次广播失败 (自定义RPC): ${error.message}`);
            console.error(`   详细错误信息:`, error);
            // 检查是否为致命错误（无需重试）
            if (isFatalBroadcastError(error.message)) {
                console.error(`💀 致命错误，停止重试: ${error.message}`);
                break;
            }
            // 无限重试或常规重试的延迟处理
            if (infiniteRetry) {
                // 无限重试模式：使用固定2秒间隔
                console.log(`⏳ 等待 2000ms 后重试...`);
                await sleep(2000);
            }
            else if (attempt < config.maxRetries) {
                // 有限重试模式：使用指数退避
                const delay = calculateRetryDelay(attempt, config.retryDelayMs);
                console.log(`⏳ 等待 ${delay}ms 后重试...`);
                await sleep(delay);
            }
        }
        // 手动递增 attempt
        attempt++;
    }
    // 所有重试都失败
    console.error(`💥 交易广播失败 (自定义RPC)，已用尽 ${config.maxRetries + 1} 次机会`);
    return {
        txId: expectedTxId,
        timestamp: Date.now(),
        retryCount: retryCount,
        success: false,
        error: lastError
    };
}
exports.broadcastSingleTransactionWithRpc = broadcastSingleTransactionWithRpc;
/**
 * 广播单个交易（原函数，保持向后兼容）
 */
async function broadcastSingleTransaction(psbtHex, expectedTxId, provider, config = chainMinting_1.DEFAULT_BROADCAST_CONFIG) {
    const startTime = Date.now();
    let retryCount = 0;
    let lastError;
    console.log(`📡 开始广播交易: ${expectedTxId}`);
    // 检查是否为无限重试模式 (maxRetries = 0)
    const infiniteRetry = config.maxRetries === 0;
    let attempt = 0;
    while (infiniteRetry ? true : attempt <= config.maxRetries) {
        try {
            console.log(`   第 ${attempt + 1} 次尝试...`);
            // 广播PSBT
            const broadcastResult = await provider.pushPsbt({ psbtHex });
            const actualTxId = broadcastResult.txId;
            // 验证交易ID是否匹配
            if (actualTxId !== expectedTxId) {
                console.warn(`⚠️  交易ID不匹配: 期望 ${expectedTxId}, 实际 ${actualTxId}`);
            }
            console.log(`✅ 交易广播成功: ${actualTxId}`);
            return {
                txId: actualTxId,
                timestamp: Date.now(),
                retryCount: attempt,
                success: true
            };
        }
        catch (error) {
            retryCount = attempt;
            lastError = error.message;
            console.error(`❌ 第 ${attempt + 1} 次广播失败: ${error.message}`);
            console.error(`   详细错误信息:`, error);
            // 检查是否为致命错误（无需重试）
            if (isFatalBroadcastError(error.message)) {
                console.error(`💀 致命错误，停止重试: ${error.message}`);
                break;
            }
            // 无限重试或常规重试的延迟处理
            if (infiniteRetry) {
                // 无限重试模式：使用固定2秒间隔
                console.log(`⏳ 等待 2000ms 后重试...`);
                await sleep(2000);
            }
            else if (attempt < config.maxRetries) {
                // 有限重试模式：使用指数退避
                const delay = calculateRetryDelay(attempt, config.retryDelayMs);
                console.log(`⏳ 等待 ${delay}ms 后重试...`);
                await sleep(delay);
            }
        }
        // 手动递增 attempt
        attempt++;
    }
    // 所有重试都失败
    console.error(`💥 交易广播失败，已用尽 ${config.maxRetries + 1} 次机会`);
    return {
        txId: expectedTxId,
        timestamp: Date.now(),
        retryCount: retryCount,
        success: false,
        error: lastError
    };
}
exports.broadcastSingleTransaction = broadcastSingleTransaction;
/**
 * 等待交易确认或节点接受
 */
async function waitForTransactionAcceptance(txId, provider, timeoutMs = 30000) {
    const startTime = Date.now();
    const pollInterval = 2000; // 每2秒检查一次
    const isInfiniteWait = timeoutMs === 0;
    if (isInfiniteWait) {
        console.log(`⏰ 等待交易进入交易池: ${txId} (无超时限制)`);
    }
    else {
        console.log(`⏰ 等待交易确认: ${txId} (${timeoutMs}ms超时)`);
    }
    let attemptCount = 0;
    while (isInfiniteWait || (Date.now() - startTime < timeoutMs)) {
        attemptCount++;
        try {
            // 检查交易状态
            const txStatus = await provider.esplora.getTxStatus(txId);
            console.log(`🔍 交易状态检查: ${txId}`, {
                confirmed: txStatus.confirmed,
                block_height: txStatus.block_height
            });
            if (txStatus.confirmed) {
                console.log(`✅ 交易已确认: ${txId}`);
                return { accepted: true, confirmed: true };
            }
            else if (txStatus.block_height === null) {
                // 交易在mempool中，被节点接受但未确认
                console.log(`🔄 交易已被节点接受: ${txId}`);
                return { accepted: true, confirmed: false };
            }
            else {
                // 如果交易存在但状态不明确，也认为已被接受
                console.log(`🔄 交易已存在于节点: ${txId}`);
                return { accepted: true, confirmed: false };
            }
        }
        catch (error) {
            // 交易可能还没有被广播到节点
            if (isInfiniteWait) {
                if (attemptCount % 10 === 0) { // 每20秒显示一次状态
                    console.log(`⏳ 继续等待交易出现在节点中... (尝试第${attemptCount}次)`);
                }
            }
            else {
                console.log(`⏳ 等待交易出现在节点中...`);
            }
        }
        await sleep(pollInterval);
    }
    // 只有非无限等待模式才会到达这里
    console.error(`⏰ 等待交易确认超时: ${txId}`);
    return {
        accepted: false,
        confirmed: false,
        error: `Timeout after ${timeoutMs}ms`
    };
}
exports.waitForTransactionAcceptance = waitForTransactionAcceptance;
// ============================================================================
// 批量广播功能
// ============================================================================
/**
 * 并行广播完整的交易链（不等待确认）
 *
 * 同时广播父交易和所有子交易，适用于链式铸造场景
 */
async function broadcastTransactionChainParallel({ parentTransaction, childTransactions, provider, config = chainMinting_1.DEFAULT_BROADCAST_CONFIG }) {
    try {
        console.log(`🚀 开始并行广播交易链...`);
        console.log(`   父交易: ${parentTransaction.expectedTxId}`);
        console.log(`   子交易数量: ${childTransactions.length}`);
        const startTime = Date.now();
        // 创建所有广播Promise
        const allTransactions = [parentTransaction, ...childTransactions];
        const broadcastPromises = allTransactions.map(async (tx, index) => {
            const txType = index === 0 ? '父交易' : `子交易${index}`;
            console.log(`📡 开始广播 ${txType}: ${tx.expectedTxId}`);
            const result = await broadcastSingleTransaction(tx.psbtHex, tx.expectedTxId, provider, { ...config, waitForAcceptance: false } // 强制不等待确认
            );
            if (result.success) {
                console.log(`✅ ${txType} 广播成功: ${result.txId}`);
            }
            else {
                console.error(`❌ ${txType} 广播失败: ${result.error}`);
            }
            return { ...result, type: txType, index };
        });
        // 等待所有广播完成
        console.log(`⏳ 等待所有 ${allTransactions.length} 笔交易广播完成...`);
        const allResults = await Promise.allSettled(broadcastPromises);
        // 处理结果
        const parentResult = allResults[0];
        const childResults = [];
        let successCount = 0;
        let failureCount = 0;
        // 处理父交易结果
        if (parentResult.status === 'fulfilled' && parentResult.value.success) {
            console.log(`✅ 父交易处理完成: ${parentResult.value.txId}`);
        }
        else {
            const error = parentResult.status === 'rejected'
                ? parentResult.reason.message
                : parentResult.value.error;
            console.error(`❌ 父交易广播失败: ${error}`);
            throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.BROADCAST_ERROR, `父交易广播失败: ${error}`, { parentTxId: parentTransaction.expectedTxId, error });
        }
        // 处理子交易结果
        for (let i = 1; i < allResults.length; i++) {
            const result = allResults[i];
            if (result.status === 'fulfilled') {
                childResults.push(result.value);
                if (result.value.success) {
                    successCount++;
                }
                else {
                    failureCount++;
                }
            }
            else {
                failureCount++;
                childResults.push({
                    success: false,
                    txId: childTransactions[i - 1].expectedTxId,
                    error: result.reason.message,
                    retryCount: 0,
                    timestamp: Date.now()
                });
            }
        }
        const allSuccessful = childResults.every(r => r.success);
        const totalDuration = Date.now() - startTime;
        console.log(`🎯 并行广播完成:`);
        console.log(`   总交易数: ${allTransactions.length}`);
        console.log(`   成功: ${successCount + 1}/${allTransactions.length}`);
        console.log(`   失败: ${failureCount}`);
        console.log(`   总耗时: ${totalDuration}ms`);
        return {
            parentTx: {
                success: true,
                txId: parentResult.value.txId,
                error: undefined,
                retryCount: parentResult.value.retryCount,
                timestamp: parentResult.value.timestamp || Date.now()
            },
            childTxs: childResults,
            successCount: successCount + 1,
            failureCount: failureCount,
            allSuccessful
        };
    }
    catch (error) {
        console.error(`💥 并行广播失败:`, error.message);
        throw error instanceof chainMinting_1.ChainMintingError ? error : new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.BROADCAST_ERROR, `并行广播失败: ${error.message}`, { error: error.message });
    }
}
exports.broadcastTransactionChainParallel = broadcastTransactionChainParallel;
/**
 * 按顺序广播完整的交易链
 *
 * 首先广播父交易并等待确认，然后依次广播所有子交易
 */
async function broadcastTransactionChain({ parentTransaction, childTransactions, provider, config = chainMinting_1.DEFAULT_BROADCAST_CONFIG }) {
    try {
        console.log(`🚀 开始广播交易链...`);
        console.log(`   父交易: ${parentTransaction.expectedTxId}`);
        console.log(`   子交易数量: ${childTransactions.length}`);
        console.log(`   广播配置: maxRetries=${config.maxRetries}, waitForAcceptance=${config.waitForAcceptance}`);
        const childResults = [];
        let successCount = 0;
        let failureCount = 0;
        // 1. 广播父交易
        console.log(`\n📡 Step 1: 广播父交易 (TX₀)`);
        const parentResult = await broadcastSingleTransaction(parentTransaction.psbtHex, parentTransaction.expectedTxId, provider, config);
        if (!parentResult.success) {
            failureCount++;
            console.error(`💥 父交易广播失败，中止整个链条`);
            return {
                parentTx: parentResult,
                childTxs: [],
                successCount: 0,
                failureCount: 1,
                allSuccessful: false
            };
        }
        successCount++;
        // 2. 等待父交易被节点接受（如果配置启用）
        if (config.waitForAcceptance) {
            console.log(`\n⏰ Step 2: 等待父交易被节点接受`);
            const acceptanceResult = await waitForTransactionAcceptance(parentResult.txId, provider, config.confirmationTimeoutMs);
            if (!acceptanceResult.accepted) {
                throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.BROADCAST_ERROR, `父交易未被节点接受: ${acceptanceResult.error}`, { parentTxId: parentResult.txId });
            }
            console.log(`✅ 父交易已被节点接受，继续广播子交易`);
        }
        // 3. 依次广播子交易
        console.log(`\n🔗 Step 3: 开始广播子交易链`);
        for (let i = 0; i < childTransactions.length; i++) {
            const childTx = childTransactions[i];
            const txIndex = i + 1;
            console.log(`\n📡 广播子交易 ${txIndex}/${childTransactions.length}: ${childTx.expectedTxId}`);
            const childResult = await broadcastSingleTransaction(childTx.psbtHex, childTx.expectedTxId, provider, config);
            childResults.push(childResult);
            if (childResult.success) {
                successCount++;
                console.log(`✅ 子交易 ${txIndex} 广播成功`);
                // 如果配置要求等待确认且不是最后一笔交易，等待节点接受
                if (config.waitForAcceptance && i < childTransactions.length - 1) {
                    console.log(`⏳ 等待子交易 ${txIndex} 被节点接受...`);
                    const acceptanceResult = await waitForTransactionAcceptance(childResult.txId, provider, Math.min(config.confirmationTimeoutMs, 10000) // 子交易等待时间更短
                    );
                    if (acceptanceResult.accepted) {
                        console.log(`✅ 子交易 ${txIndex} 已被节点接受`);
                    }
                    else {
                        console.warn(`⚠️  子交易 ${txIndex} 未被节点接受，但继续处理下一笔`);
                    }
                }
            }
            else {
                failureCount++;
                console.error(`❌ 子交易 ${txIndex} 广播失败: ${childResult.error}`);
                // 根据策略决定是否继续
                if (shouldContinueAfterChildFailure(childResult, i, childTransactions.length)) {
                    console.log(`⚠️  继续广播剩余子交易...`);
                }
                else {
                    console.error(`💥 子交易失败，中止剩余广播`);
                    break;
                }
            }
            // 在子交易之间添加短暂延迟，避免网络拥塞
            if (i < childTransactions.length - 1) {
                await sleep(1000);
            }
        }
        const allSuccessful = parentResult.success && childResults.every(r => r.success);
        console.log(`\n🎉 交易链广播完成!`);
        console.log(`   成功: ${successCount}/${childTransactions.length + 1}`);
        console.log(`   失败: ${failureCount}/${childTransactions.length + 1}`);
        console.log(`   全部成功: ${allSuccessful ? '是' : '否'}`);
        return {
            parentTx: parentResult,
            childTxs: childResults,
            successCount,
            failureCount,
            allSuccessful
        };
    }
    catch (error) {
        console.error(`💥 交易链广播失败:`, error.message);
        throw error instanceof chainMinting_1.ChainMintingError ? error : new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.BROADCAST_ERROR, `交易链广播失败: ${error.message}`, { parentTx: parentTransaction.expectedTxId, childCount: childTransactions.length });
    }
}
exports.broadcastTransactionChain = broadcastTransactionChain;
// ============================================================================
// 辅助工具函数
// ============================================================================
/**
 * 检查是否为致命广播错误（无需重试）
 */
function isFatalBroadcastError(errorMessage) {
    const fatalErrors = [
        'bad-txns-inputs-missingorspent',
        'bad-txns-inputs-duplicate',
        'bad-txns-oversize',
        'bad-txns-vout-negative',
        'bad-txns-vout-toolarge',
        'non-final',
        'dust',
        'insufficient priority', // 优先级不足（不太可能重试成功）
    ];
    return fatalErrors.some(error => errorMessage.toLowerCase().includes(error));
}
/**
 * 计算重试延迟（指数退避）
 */
function calculateRetryDelay(attempt, baseDelay) {
    // 指数退避 + 随机抖动
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 1000; // 0-1秒的随机抖动
    return Math.min(exponentialDelay + jitter, 60000); // 最大60秒
}
/**
 * 判断子交易失败后是否继续广播剩余交易
 */
function shouldContinueAfterChildFailure(failedResult, failedIndex, totalCount) {
    // 如果是致命错误，停止广播
    if (failedResult.error && isFatalBroadcastError(failedResult.error)) {
        return false;
    }
    // 如果失败的是最后几笔交易，继续尝试
    const remainingCount = totalCount - failedIndex - 1;
    if (remainingCount <= 3) {
        return true;
    }
    // 其他情况下，谨慎停止
    return false;
}
/**
 * 睡眠函数
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// ============================================================================
// 自定义RPC广播功能
// ============================================================================
/**
 * 使用自定义RPC广播交易链
 */
async function broadcastTransactionChainWithRpc({ parentTransaction, childTransactions, rpcClient, networkType, config = chainMinting_1.DEFAULT_BROADCAST_CONFIG }) {
    try {
        const client = rpcClient || (0, rpcFactory_1.createRpcClient)(networkType);
        console.log(`🚀 开始广播交易链 (自定义RPC)...`);
        console.log(`   父交易: ${parentTransaction.expectedTxId}`);
        console.log(`   子交易数量: ${childTransactions.length}`);
        console.log(`   RPC提供者: 自定义`);
        const childResults = [];
        let successCount = 0;
        let failureCount = 0;
        // 1. 广播父交易
        console.log(`\n📡 Step 1: 广播父交易 (TX₀) - 自定义RPC`);
        const parentResult = await broadcastSingleTransactionWithRpc(parentTransaction.psbtHex, parentTransaction.expectedTxId, client, networkType, config);
        if (!parentResult.success) {
            failureCount++;
            console.error(`💥 父交易广播失败，中止整个链条`);
            return {
                parentTx: parentResult,
                childTxs: [],
                successCount: 0,
                failureCount: 1,
                allSuccessful: false
            };
        }
        successCount++;
        // 2. 等待父交易被节点接受（简化版）
        if (config.waitForAcceptance) {
            console.log(`\n⏰ Step 2: 等待父交易被节点接受 (1秒延迟)`);
            await sleep(1000); // 简化的等待逻辑
        }
        // 3. 逐个广播子交易
        console.log(`\n📡 Step 3: 顺序广播子交易 (TX₁ ~ TX₂₄) - 自定义RPC`);
        for (let i = 0; i < childTransactions.length; i++) {
            const childTx = childTransactions[i];
            console.log(`\n   子交易 ${i + 1}/${childTransactions.length}: ${childTx.expectedTxId}`);
            const childResult = await broadcastSingleTransactionWithRpc(childTx.psbtHex, childTx.expectedTxId, client, networkType, config);
            childResults.push(childResult);
            if (childResult.success) {
                successCount++;
            }
            else {
                failureCount++;
                console.error(`💥 子交易 ${i + 1} 广播失败: ${childResult.error}`);
                // 可选：是否在子交易失败时中止后续交易
                // break; // 取消注释以启用失败中止
            }
            // 短暂延迟确保交易顺序
            if (i < childTransactions.length - 1) {
                await sleep(500);
            }
        }
        const allSuccessful = failureCount === 0;
        console.log(`\n🎯 交易链广播完成 (自定义RPC):`);
        console.log(`   ✅ 成功: ${successCount}`);
        console.log(`   ❌ 失败: ${failureCount}`);
        console.log(`   📊 成功率: ${((successCount / (successCount + failureCount)) * 100).toFixed(1)}%`);
        return {
            parentTx: parentResult,
            childTxs: childResults,
            successCount: successCount,
            failureCount: failureCount,
            allSuccessful: allSuccessful
        };
    }
    catch (error) {
        console.error(`💥 交易链广播失败 (自定义RPC):`, error.message);
        throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.BROADCAST_ERROR, `自定义RPC广播失败: ${error.message}`, { error: error.message });
    }
}
exports.broadcastTransactionChainWithRpc = broadcastTransactionChainWithRpc;
// ============================================================================
// 工具函数已在上方定义
// ============================================================================
//# sourceMappingURL=transactionBroadcaster.js.map