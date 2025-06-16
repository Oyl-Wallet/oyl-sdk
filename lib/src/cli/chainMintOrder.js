"use strict";
/**
 * Chain-Mint 订单管理 CLI 命令
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chainMintResume = exports.chainMintStatus = void 0;
const commander_1 = require("commander");
const chainMintOrder_1 = require("../alkanes/chainMintOrder");
const chainMinting_1 = require("../alkanes/chainMinting");
const wallet_1 = require("./wallet");
// ============================================================================
// 订单状态查看命令
// ============================================================================
exports.chainMintStatus = new commander_1.Command('chain-mint-status')
    .description('查看所有 Chain-Mint 订单状态')
    .option('--status <status>', '过滤特定状态的订单 (executing|interrupted|completed)')
    .action(async (options) => {
    try {
        const orderManager = new chainMintOrder_1.ChainMintOrderManager();
        const overview = await orderManager.getOrdersOverview();
        console.log(`\n📋 Chain-Mint 订单状态概览`);
        console.log(`=============================\n`);
        if (overview.total === 0) {
            console.log(`🔍 没有找到任何订单`);
            console.log(`   首次执行: oyl alkane chain-mint -c "block:tx" -r "address"`);
            return;
        }
        // 显示统计信息
        console.log(`📊 统计信息:`);
        console.log(`   📦 总计: ${overview.total}`);
        console.log(`   ⚡ 执行中: ${overview.executing} (Snowball)`);
        console.log(`   🔀 并行执行: ${overview.parallelExecuting} (Supercluster)`);
        console.log(`   ⏸️  中断: ${overview.interrupted}`);
        console.log(`   🔶 部分完成: ${overview.partialCompleted}`);
        console.log(`   ✅ 完成: ${overview.completed}`);
        console.log(`   💥 恢复失败: ${overview.recoveryFailed}`);
        console.log(``);
        // 过滤订单
        let ordersToShow = overview.orders;
        if (options.status) {
            const filterStatus = options.status.toLowerCase();
            ordersToShow = overview.orders.filter(order => order.status === filterStatus);
            if (ordersToShow.length === 0) {
                console.log(`🔍 没有找到状态为 "${filterStatus}" 的订单`);
                return;
            }
        }
        // 显示订单列表
        console.log(`📋 订单列表:`);
        console.log(``);
        ordersToShow.forEach((order, index) => {
            const statusEmoji = getStatusEmoji(order.status);
            const duration = Math.round((Date.now() - order.createdAt) / 1000);
            const executionModeText = order.executionMode === chainMintOrder_1.OrderExecutionMode.SUPERCLUSTER ?
                'Project Supercluster' : 'Project Snowball';
            console.log(`${index + 1}. ${order.id}`);
            console.log(`   ├─ 状态: ${statusEmoji} ${order.status}`);
            console.log(`   ├─ 模式: ${executionModeText}`);
            console.log(`   ├─ 合约: ${order.contractId.block}:${order.contractId.tx}`);
            console.log(`   ├─ 接收地址: ${order.finalReceiverAddress}`);
            console.log(`   ├─ 网络: ${order.network}`);
            // 显示不同模式的进度信息
            if (order.executionMode === chainMintOrder_1.OrderExecutionMode.SUPERCLUSTER) {
                console.log(`   ├─ 总铸造量: ${order.executionParams.totalMints || 'N/A'} tokens`);
                console.log(`   ├─ 分片进度: ${order.progress.completedSlices || 0}/${order.progress.totalSlices || 0}`);
                // 显示分片详情
                if (order.progress.slices && order.progress.slices.length > 0) {
                    const completedSlices = order.progress.slices.filter(s => s.status === chainMintOrder_1.SliceStatus.COMPLETED).length;
                    const failedSlices = order.progress.slices.filter(s => s.status === chainMintOrder_1.SliceStatus.FAILED).length;
                    const executingSlices = order.progress.slices.filter(s => s.status === chainMintOrder_1.SliceStatus.EXECUTING).length;
                    const pendingSlices = order.progress.slices.filter(s => s.status === chainMintOrder_1.SliceStatus.PENDING).length;
                    console.log(`   ├─ 分片状态: ✅${completedSlices} ❌${failedSlices} ⚡${executingSlices} ⏳${pendingSlices}`);
                }
            }
            else {
                console.log(`   ├─ 中继地址: ${order.relayAddress}`);
                console.log(`   ├─ 进度: ${order.progress.completedChildTxs}/${order.executionParams.childCount || 24}`);
            }
            console.log(`   ├─ 创建时间: ${new Date(order.createdAt).toLocaleString()}`);
            console.log(`   └─ 运行时间: ${duration} 秒`);
            if (order.interruptInfo) {
                console.log(`   🔍 中断原因: ${order.interruptInfo.reason}`);
                if (order.interruptInfo.failedSlices && order.interruptInfo.failedSlices.length > 0) {
                    console.log(`   💥 失败分片: ${order.interruptInfo.failedSlices.join(', ')}`);
                }
            }
            if (order.recoveryInfo && order.recoveryInfo.attempts > 0) {
                console.log(`   🔄 恢复尝试: ${order.recoveryInfo.attempts}/${order.recoveryInfo.maxRetries}`);
                if (order.recoveryInfo.lastFailureReason) {
                    console.log(`   💥 最后失败: ${order.recoveryInfo.lastFailureReason}`);
                }
            }
            console.log(``);
        });
        // 显示恢复提示
        if (overview.interrupted > 0 || overview.partialCompleted > 0) {
            console.log(`💡 恢复中断的订单:`);
            console.log(`   单个恢复: oyl alkane chain-mint-resume --order-id <ORDER_ID>`);
            console.log(`   批量恢复: oyl alkane chain-mint-resume --all`);
            if (overview.partialCompleted > 0) {
                console.log(`   重置失败分片: oyl alkane chain-mint-resume --order-id <ORDER_ID> --reset-failed`);
            }
        }
    }
    catch (error) {
        console.error('查看订单状态失败:', error.message);
        process.exit(1);
    }
});
// ============================================================================
// 订单恢复命令
// ============================================================================
exports.chainMintResume = new commander_1.Command('chain-mint-resume')
    .description('恢复中断的 Chain-Mint 订单 (支持Snowball和Supercluster模式)')
    .option('--order-id <id>', '要恢复的订单ID')
    .option('--all', '恢复所有中断的订单')
    .option('--force', '强制重试，即使已达到最大重试次数')
    .option('--reset-failed', '重置失败的分片状态为待执行 (仅Supercluster模式)')
    .option('--slice-indices <indices>', '指定要重置的分片索引，逗号分隔 (配合--reset-failed)')
    .option('--fee-rate <rate>', '费率 (sat/vB) - 仅用于没有保存执行参数的老订单')
    .option('--child-count <count>', '子交易数量 - 仅用于没有保存执行参数的老订单')
    .action(async (options) => {
    try {
        if (!options.orderId && !options.all) {
            console.error('❌ 请指定要恢复的订单ID (--order-id) 或使用 --all 恢复所有中断订单');
            process.exit(1);
        }
        const orderManager = new chainMintOrder_1.ChainMintOrderManager();
        const fallbackParams = {
            feeRate: options.feeRate ? parseFloat(options.feeRate) : undefined,
            childCount: options.childCount ? parseInt(options.childCount) : undefined
        };
        // 处理重置失败分片的特殊逻辑
        if (options.resetFailed) {
            if (!options.orderId) {
                console.error('❌ --reset-failed 需要配合 --order-id 使用');
                process.exit(1);
            }
            const sliceIndices = options.sliceIndices ?
                options.sliceIndices.split(',').map((i) => parseInt(i.trim())) :
                undefined;
            await resetFailedSlicesAndResume(orderManager, options.orderId, sliceIndices, options.force, fallbackParams);
            return;
        }
        if (options.all) {
            // 恢复所有中断的订单
            await resumeAllInterruptedOrders(orderManager, options.force, fallbackParams);
        }
        else {
            // 恢复特定订单
            await resumeSingleOrder(orderManager, options.orderId, options.force, fallbackParams);
        }
    }
    catch (error) {
        console.error('恢复订单失败:', error.message);
        process.exit(1);
    }
});
// ============================================================================
// 恢复逻辑实现
// ============================================================================
/**
 * 重置失败分片并恢复执行 (Project Supercluster)
 */
async function resetFailedSlicesAndResume(orderManager, orderId, sliceIndices, force = false, fallbackParams) {
    console.log(`\n🔄 重置失败分片并恢复: ${orderId}`);
    console.log(`========================\n`);
    // 1. 加载订单信息
    const order = await orderManager.loadOrder(orderId);
    if (!order) {
        console.error(`❌ 订单不存在: ${orderId}`);
        return;
    }
    if (order.executionMode !== chainMintOrder_1.OrderExecutionMode.SUPERCLUSTER) {
        console.error(`❌ 只有Project Supercluster订单才支持分片重置`);
        return;
    }
    if (!order.progress.slices) {
        console.error(`❌ 订单分片状态未初始化`);
        return;
    }
    // 2. 显示当前分片状态
    console.log(`📋 当前分片状态:`);
    order.progress.slices.forEach((slice, index) => {
        const statusEmoji = slice.status === chainMintOrder_1.SliceStatus.COMPLETED ? '✅' :
            slice.status === chainMintOrder_1.SliceStatus.FAILED ? '❌' :
                slice.status === chainMintOrder_1.SliceStatus.EXECUTING ? '⚡' : '⏳';
        console.log(`   分片${slice.sliceIndex}: ${statusEmoji} ${slice.status} (${slice.completedChildTxs}/${slice.mintCount} tokens)`);
        if (slice.error) {
            console.log(`     错误: ${slice.error.message}`);
        }
    });
    console.log(``);
    // 3. 重置失败的分片
    await orderManager.resetFailedSlices(orderId, sliceIndices);
    // 4. 恢复执行
    console.log(`🚀 开始恢复并行执行...`);
    await resumeSuperclusterOrder(orderManager, orderId, force, fallbackParams);
}
/**
 * 恢复Project Supercluster订单
 */
async function resumeSuperclusterOrder(orderManager, orderId, force = false, fallbackParams) {
    const order = await orderManager.loadOrder(orderId);
    if (!order) {
        throw new Error(`订单不存在: ${orderId}`);
    }
    console.log(`🔀 Project Supercluster 订单恢复 (暂未完全实现)`);
    console.log(`   总分片: ${order.progress.totalSlices}`);
    console.log(`   已完成: ${order.progress.completedSlices}`);
    // TODO: 这里需要调用Project Supercluster的恢复逻辑
    // 目前先显示提示信息
    console.log(`⚠️  Project Supercluster 恢复功能正在开发中`);
    console.log(`   建议手动检查分片状态并重新执行未完成的分片`);
    const recoverableSlices = await orderManager.getRecoverableSlices(orderId);
    if (recoverableSlices.length > 0) {
        console.log(`\n📋 可恢复的分片:`);
        recoverableSlices.forEach(slice => {
            console.log(`   分片${slice.sliceIndex}: ${slice.status} (${slice.relayAddress})`);
        });
    }
}
/**
 * 恢复单个订单 (支持两种模式)
 */
async function resumeSingleOrder(orderManager, orderId, force = false, fallbackParams) {
    console.log(`\n🔄 恢复订单: ${orderId}`);
    console.log(`========================\n`);
    // 1. 加载订单信息
    const order = await orderManager.loadOrder(orderId);
    if (!order) {
        console.error(`❌ 订单不存在: ${orderId}`);
        return;
    }
    // 2. 根据执行模式路由到不同的恢复逻辑
    if (order.executionMode === chainMintOrder_1.OrderExecutionMode.SUPERCLUSTER) {
        await resumeSuperclusterOrder(orderManager, orderId, force, fallbackParams);
        return;
    }
    // 3. Project Snowball 恢复逻辑 (原有逻辑)
    if (order.status === chainMintOrder_1.OrderStatus.COMPLETED) {
        console.log(`✅ 订单已完成，无需恢复`);
        return;
    }
    if (order.status === chainMintOrder_1.OrderStatus.EXECUTING) {
        console.log(`⚡ 订单正在执行中，请检查是否有其他进程在运行`);
        return;
    }
    // 2. 检查恢复重试次数
    if (order.status === chainMintOrder_1.OrderStatus.RECOVERY_FAILED && !force) {
        console.log(`💥 订单恢复已失败 ${order.recoveryInfo?.attempts || 0}/${order.recoveryInfo?.maxRetries || 3} 次`);
        console.log(`   最后失败原因: ${order.recoveryInfo?.lastFailureReason || '未知'}`);
        console.log(`   要强制重试，请使用: oyl alkane chain-mint-resume --order-id ${orderId} --force`);
        return;
    }
    // 3. 检查当前恢复次数
    if (!force && order.recoveryInfo && order.recoveryInfo.attempts >= order.recoveryInfo.maxRetries) {
        console.log(`⚠️  订单已达到最大恢复次数 (${order.recoveryInfo.attempts}/${order.recoveryInfo.maxRetries})`);
        console.log(`   要强制重试，请使用: oyl alkane chain-mint-resume --order-id ${orderId} --force`);
        return;
    }
    // 4. 强制重试时重置订单状态
    if (force && (order.status === chainMintOrder_1.OrderStatus.RECOVERY_FAILED ||
        (order.recoveryInfo && order.recoveryInfo.attempts >= order.recoveryInfo.maxRetries))) {
        console.log(`🔥 强制重试模式：重置订单状态`);
        await orderManager.resetOrderToInterrupted(orderId);
        // 重新加载订单
        const resetOrder = await orderManager.loadOrder(orderId);
        if (resetOrder) {
            Object.assign(order, resetOrder);
        }
    }
    console.log(`📋 订单信息:`);
    console.log(`   合约: ${order.contractId.block}:${order.contractId.tx}`);
    console.log(`   网络: ${order.network}`);
    console.log(`   中继地址: ${order.relayAddress}`);
    console.log(`   当前进度: ${order.progress.completedChildTxs}/24`);
    console.log(``);
    try {
        // 记录恢复尝试
        await orderManager.recordRecoveryAttempt(orderId);
        // 重新加载订单获取最新的恢复信息
        const latestOrder = await orderManager.loadOrder(orderId);
        const currentAttempt = latestOrder?.recoveryInfo?.attempts || 1;
        const maxRetries = latestOrder?.recoveryInfo?.maxRetries || 3;
        console.log(`🔄 恢复尝试 ${currentAttempt}/${maxRetries}`);
        console.log(``);
        // 重新生成钱包（确保一致性）
        console.log(`🔐 重新生成钱包系统...`);
        // 使用订单中保存的网络类型，不要做转换
        const wallet = new wallet_1.Wallet({ networkType: order.network });
        const provider = wallet.provider;
        // 确保网络配置存在
        if (!provider.network) {
            throw new Error(`Provider网络配置未设置，无法恢复订单。网络类型: ${order.network}`);
        }
        // 使用provider的网络配置，这样可以确保类型正确
        const wallets = await (0, chainMinting_1.generateChainMintingWalletsFromEnv)(provider.network, order.relayWalletIndex);
        // 验证中继地址一致性
        if (wallets.relayWallet.account.nativeSegwit.address !== order.relayAddress) {
            throw new Error(`中继地址不匹配! 期望: ${order.relayAddress}, 实际: ${wallets.relayWallet.account.nativeSegwit.address}`);
        }
        console.log(`✅ 钱包验证成功`);
        console.log(``);
        // 检查中继钱包余额
        const relayBalance = await provider.esplora.getAddressUtxo(order.relayAddress);
        const totalBalance = relayBalance.reduce((sum, utxo) => sum + utxo.value, 0);
        console.log(`💰 中继钱包余额: ${totalBalance} sats`);
        if (totalBalance === 0) {
            throw new Error('中继钱包余额为0，无法继续恢复。可能资金已经丢失或已完成转移。');
        }
        // 检查父交易状态和输出
        console.log(`🔍 检查父交易状态: ${order.progress.parentTxId}`);
        try {
            const parentTxDetails = await provider.esplora.getTxInfo(order.progress.parentTxId);
            console.log(`   父交易确认数: ${parentTxDetails.status.confirmed ? parentTxDetails.status.block_height : '未确认'}`);
            // 查找转移到中继地址的输出
            const relayOutput = parentTxDetails.vout.find((output) => output.scriptpubkey_address === order.relayAddress);
            if (relayOutput) {
                console.log(`   父交易向中继转移: ${relayOutput.value} sats`);
                if (relayOutput.value !== totalBalance) {
                    console.log(`   ⚠️  余额不匹配！父交易输出=${relayOutput.value}, 当前余额=${totalBalance}`);
                }
            }
            else {
                console.log(`   ⚠️  未找到向中继地址的输出！`);
            }
        }
        catch (error) {
            console.log(`   ⚠️  无法获取父交易详情: ${error.message}`);
        }
        // 验证订单状态
        if (!order.progress.parentTxId) {
            throw new Error('订单数据异常：父交易ID缺失。订单应该只在父交易成功后创建。');
        }
        // 注意：这里需要使用实际的childCount，而不是硬编码的24
        const targetChildCount = order.executionParams?.childCount || (fallbackParams?.childCount || 24);
        if (order.progress.completedChildTxs >= targetChildCount) {
            console.log(`✅ 所有子交易已完成 (${order.progress.completedChildTxs}/${targetChildCount})，标记订单完成`);
            await orderManager.markOrderAsCompleted(orderId);
            return;
        }
        // 检查执行参数
        let feeRate;
        let childCount;
        let broadcastConfig;
        let verificationConfig;
        if (order.executionParams && order.executionParams.broadcastConfig) {
            // 新订单：使用保存的完整执行参数
            feeRate = order.executionParams.feeRate;
            childCount = order.executionParams.childCount;
            broadcastConfig = order.executionParams.broadcastConfig;
            verificationConfig = order.executionParams.verificationConfig;
            console.log(`📋 使用保存的完整执行参数:`);
            console.log(`   费率: ${feeRate} sat/vB`);
            console.log(`   子交易数: ${childCount}`);
            console.log(`   重试次数: ${broadcastConfig.maxRetries}`);
            console.log(`   重试延迟: ${broadcastConfig.retryDelayMs}ms`);
            console.log(`   验证模式: ${verificationConfig ? '启用' : '禁用'}`);
        }
        else {
            // 老订单：需要用户提供参数或使用默认值
            if (!fallbackParams?.feeRate) {
                throw new Error('老版本订单缺少执行参数。请使用 --fee-rate <rate> 指定费率');
            }
            if (!fallbackParams?.childCount) {
                throw new Error('老版本订单缺少执行参数。请使用 --child-count <count> 指定子交易数量');
            }
            feeRate = fallbackParams.feeRate;
            childCount = fallbackParams.childCount;
            // 使用默认广播配置
            broadcastConfig = {
                maxRetries: 3,
                retryDelayMs: 5000,
                confirmationTimeoutMs: 0,
                waitForAcceptance: true
            };
            verificationConfig = undefined;
            console.log(`⚠️  老版本订单，使用用户指定参数和默认配置:`);
            console.log(`   费率: ${feeRate} sat/vB (用户指定)`);
            console.log(`   子交易数: ${childCount} (用户指定)`);
            console.log(`   重试次数: ${broadcastConfig.maxRetries} (默认)`);
            console.log(`   重试延迟: ${broadcastConfig.retryDelayMs}ms (默认)`);
        }
        // 根据进度决定恢复策略
        if (order.progress.completedChildTxs === 0) {
            // 父交易已完成，但还没开始子交易 - 从父交易开始执行子交易链
            console.log(`🔗 从父交易开始执行子交易链...`);
            const { performDryRunFeeCalculation } = await Promise.resolve().then(() => __importStar(require('../alkanes/chainMinting')));
            const feeCalculation = await performDryRunFeeCalculation({
                wallets,
                contractId: order.contractId,
                childCount: childCount,
                feeRate: feeRate,
                provider
            });
            await executeChildTransactionChainWithResume(orderManager, order, wallets, provider, order.progress.parentTxId, feeCalculation.relayFuelAmount, 1, // 从第1笔子交易开始
            broadcastConfig, childCount);
        }
        else {
            // 子交易链中断 - 从断点继续
            console.log(`🔗 从第 ${order.progress.completedChildTxs + 1} 笔子交易继续执行...`);
            await resumeFromChildTransactionChain(orderManager, order, wallets, provider, broadcastConfig, childCount);
        }
        console.log(`\n✅ 订单恢复成功: ${orderId}`);
    }
    catch (error) {
        console.error(`💥 恢复失败: ${error.message}`);
        // 检查是否已达到最大重试次数
        const updatedOrder = await orderManager.loadOrder(orderId);
        const maxRetries = updatedOrder?.recoveryInfo?.maxRetries || 3;
        const currentAttempts = updatedOrder?.recoveryInfo?.attempts || 0;
        if (currentAttempts >= maxRetries) {
            await orderManager.markOrderAsRecoveryFailed(orderId, error.message);
            console.error(`💀 订单恢复彻底失败，已达到最大重试次数 (${currentAttempts}/${maxRetries})`);
            console.error(`   中继钱包地址: ${order.relayAddress}`);
            console.error(`   如果中继钱包仍有资金，可使用 --force 标志强制重试`);
        }
        else {
            await orderManager.markOrderAsInterrupted(orderId, error.message);
            console.error(`   还可以重试 ${maxRetries - currentAttempts} 次`);
        }
        throw error;
    }
}
/**
 * 恢复所有中断的订单
 */
async function resumeAllInterruptedOrders(orderManager, force = false, fallbackParams) {
    console.log(`\n🔄 恢复所有中断的订单`);
    console.log(`========================\n`);
    const interruptedOrders = await orderManager.getInterruptedOrders();
    if (interruptedOrders.length === 0) {
        console.log(`✅ 没有中断的订单需要恢复`);
        return;
    }
    console.log(`📋 发现 ${interruptedOrders.length} 个中断的订单`);
    console.log(``);
    for (const order of interruptedOrders) {
        try {
            console.log(`🔄 恢复订单: ${order.id}`);
            await resumeSingleOrder(orderManager, order.id, force, fallbackParams);
            console.log(``);
        }
        catch (error) {
            console.error(`💥 订单 ${order.id} 恢复失败: ${error.message}`);
            console.log(``);
        }
    }
}
// ============================================================================
// 恢复实现函数
// ============================================================================
/**
 * 从子交易链中断点恢复
 */
async function resumeFromChildTransactionChain(orderManager, order, wallets, provider, broadcastConfig, childCount) {
    try {
        const startIndex = order.progress.completedChildTxs + 1;
        if (!order.progress.lastTxId || !order.progress.lastOutputAmount) {
            throw new Error('缺少子交易链恢复所需的信息：lastTxId 或 lastOutputAmount');
        }
        console.log(`🔗 从第 ${startIndex} 笔子交易恢复...`);
        console.log(`   上一笔交易ID: ${order.progress.lastTxId}`);
        console.log(`   上一笔输出: ${order.progress.lastOutputAmount} sats`);
        await executeChildTransactionChainWithResume(orderManager, order, wallets, provider, order.progress.lastTxId, order.progress.lastOutputAmount, startIndex, broadcastConfig, childCount);
    }
    catch (error) {
        console.error(`💥 子交易链恢复失败: ${error.message}`);
        throw error;
    }
}
/**
 * 执行子交易链（支持从任意点开始）
 */
async function executeChildTransactionChainWithResume(orderManager, order, wallets, provider, parentTxId, parentOutputValue, startIndex, broadcastConfig, childCount) {
    let currentTxId = parentTxId;
    let currentOutputValue = parentOutputValue;
    // 计算子交易费用（简化版，实际应该从订单配置获取）
    const childTxFee = 140; // 约等于 138.5 vB * 1 sat/vB
    for (let i = startIndex; i <= childCount; i++) {
        const isLastTransaction = (i === childCount);
        console.log(`📦 构建子交易 ${i}/${childCount}${isLastTransaction ? ' (最后)' : ''}`);
        try {
            // 构建子交易
            const { buildChildTransaction } = await Promise.resolve().then(() => __importStar(require('../alkanes/transactionBuilder')));
            const childTx = await buildChildTransaction({
                parentTxId: currentTxId,
                parentOutputValue: currentOutputValue,
                transactionIndex: i,
                isLastTransaction,
                finalReceiverAddress: order.finalReceiverAddress,
                wallets,
                contractId: order.contractId,
                childTxFee,
                provider
            });
            // 广播子交易
            const { broadcastSingleTransaction } = await Promise.resolve().then(() => __importStar(require('../alkanes/transactionBroadcaster')));
            const broadcastResult = await broadcastSingleTransaction(childTx.psbtHex, childTx.expectedTxId, provider, broadcastConfig);
            if (!broadcastResult.success) {
                throw new Error(`子交易 ${i} 广播失败: ${broadcastResult.error}`);
            }
            console.log(`✅ 子交易 ${i} 完成: ${childTx.expectedTxId}`);
            // 更新订单进度
            await orderManager.updateOrderProgress(order.id, {
                completedChildTxs: i,
                lastTxId: childTx.expectedTxId,
                lastOutputAmount: childTx.outputValue
            });
            // 检查是否为最后交易（通过输出金额判断）
            if (childTx.outputValue <= 330) {
                console.log(`🎉 检测到最后交易 (输出=${childTx.outputValue} sats)，提前结束`);
                await orderManager.markOrderAsCompleted(order.id);
                return;
            }
            // 为下一笔交易准备
            currentTxId = childTx.expectedTxId;
            currentOutputValue = childTx.outputValue;
            // 短暂延迟避免网络拥堵
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        catch (error) {
            console.error(`💥 子交易 ${i} 失败: ${error.message}`);
            throw error;
        }
    }
    // 如果循环正常结束，标记订单完成
    console.log(`🎉 所有子交易执行完成`);
    await orderManager.markOrderAsCompleted(order.id);
}
// ============================================================================
// 辅助函数
// ============================================================================
function getStatusEmoji(status) {
    switch (status) {
        case chainMintOrder_1.OrderStatus.EXECUTING:
            return '⚡';
        case chainMintOrder_1.OrderStatus.PARALLEL_EXECUTING:
            return '🔀';
        case chainMintOrder_1.OrderStatus.INTERRUPTED:
            return '⏸️';
        case chainMintOrder_1.OrderStatus.PARTIAL_COMPLETED:
            return '🔶';
        case chainMintOrder_1.OrderStatus.COMPLETED:
            return '✅';
        case chainMintOrder_1.OrderStatus.RECOVERY_FAILED:
            return '💥';
        default:
            return '❓';
    }
}
//# sourceMappingURL=chainMintOrder.js.map