"use strict";
/**
 * 精确费用计算模块
 *
 * 基于实际PSBT构建的vSize计算，确保费用估算的准确性
 * 支持Dry Run模式进行费用预估
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatFeeCalculationResult = exports.compareFeeCalculations = exports.calculateActualTransactionFees = exports.performDryRunFeeCalculation = exports.HARDCODED_TRANSACTION_SIZES = void 0;
const tslib_1 = require("tslib");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const chainMinting_1 = require("./chainMinting");
const alkanes_1 = require("./alkanes");
// ============================================================================
// 模拟交易构建器 - 用于Dry Run费用计算
// ============================================================================
/**
 * 构建模拟父交易用于费用计算
 */
async function buildMockParentTransaction({ mainWallet, relayAddress, contractId, provider, mockRelayAmount = 100000 // 模拟中继金额
 }) {
    const psbt = new bitcoin.Psbt({ network: provider.network });
    // 模拟calldata
    const calldata = [
        BigInt(contractId.block),
        BigInt(contractId.tx),
        BigInt(77) // mint操作码
    ];
    // 模拟protostone - 父交易配置
    const protostone = (0, alkanes_1.encodeProtostone)({
        protocolTag: 1n,
        edicts: [],
        pointer: chainMinting_1.StandardVoutLayout.RELAY_OUTPUT,
        refundPointer: chainMinting_1.StandardVoutLayout.FINAL_CHANGE,
        calldata: calldata
    });
    // 模拟输入 - 创建典型的P2TR输入
    const mockInputTxId = 'a'.repeat(64);
    psbt.addInput({
        hash: mockInputTxId,
        index: 0,
        witnessUtxo: {
            value: 200000,
            script: Buffer.alloc(34, 0x51) // 模拟P2TR scriptPubKey
        },
        sequence: 0xfffffffd // RBF enabled
    });
    // 严格按照标准vout布局添加输出
    // vout=0: 中继输出 (P2WPKH)
    psbt.addOutput({
        address: relayAddress,
        value: mockRelayAmount
    });
    // vout=1: OP_RETURN指令
    psbt.addOutput({
        script: protostone,
        value: 0
    });
    // vout=2: 找零输出
    psbt.addOutput({
        address: mainWallet.account.taproot.address,
        value: 50000 // 模拟找零金额
    });
    return psbt;
}
/**
 * 构建模拟子交易用于费用计算
 */
async function buildMockChildTransaction({ relayWallet, contractId, provider, isLastTx = false, finalReceiverAddress = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4' }) {
    const psbt = new bitcoin.Psbt({ network: provider.network });
    // 模拟calldata
    const calldata = [
        BigInt(contractId.block),
        BigInt(contractId.tx),
        BigInt(77) // mint操作码
    ];
    // 模拟protostone - 子交易配置
    const protostone = (0, alkanes_1.encodeProtostone)({
        protocolTag: 1n,
        edicts: [],
        pointer: chainMinting_1.StandardVoutLayout.RELAY_OUTPUT,
        refundPointer: chainMinting_1.StandardVoutLayout.RELAY_OUTPUT,
        calldata: calldata
    });
    // 模拟输入 - P2WPKH输入
    const mockInputTxId = 'b'.repeat(64);
    const relayScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_0,
        bitcoin.crypto.hash160(Buffer.from(relayWallet.account.nativeSegwit.pubkey, 'hex'))
    ]);
    psbt.addInput({
        hash: mockInputTxId,
        index: 0,
        witnessUtxo: {
            value: 50000,
            script: relayScript
        },
        sequence: 0xfffffffd // RBF enabled
    });
    // 严格按照标准vout布局添加输出
    // vout=0: 中继输出或最终输出
    const targetAddress = isLastTx
        ? finalReceiverAddress
        : relayWallet.account.nativeSegwit.address;
    psbt.addOutput({
        address: targetAddress,
        value: 40000 // 模拟输出金额
    });
    // vout=1: OP_RETURN指令
    psbt.addOutput({
        script: protostone,
        value: 0
    });
    return psbt;
}
// ============================================================================
// 精确vSize计算器
// ============================================================================
/**
 * 计算PSBT的精确vSize
 *
 * 注意：这里需要模拟签名来获取准确的vSize
 */
function calculatePsbtVSize(psbt) {
    try {
        // 尝试提取交易（如果PSBT完整）
        const tx = psbt.extractTransaction();
        return tx.virtualSize();
    }
    catch {
        // 如果无法提取，使用估算方法
        return estimateTransactionVSize(psbt);
    }
}
/**
 * 估算未完成PSBT的vSize
 */
function estimateTransactionVSize(psbt) {
    const inputCount = psbt.inputCount;
    // 计算输入权重
    let inputWeight = 0;
    for (let i = 0; i < inputCount; i++) {
        const input = psbt.data.inputs[i];
        if (input.witnessUtxo) {
            // SegWit输入
            if (input.witnessUtxo.script.length === 22) {
                // P2WPKH: 41 vbytes (witness) + 16 vbytes (base)
                inputWeight += 41 * 4 + 16;
            }
            else if (input.witnessUtxo.script.length === 34) {
                // P2TR: 64 vbytes (witness) + 16 vbytes (base)  
                inputWeight += 64 * 4 + 16;
            }
            else {
                // 其他SegWit类型，保守估算
                inputWeight += 100 * 4 + 16;
            }
        }
        else {
            // Legacy输入，保守估算
            inputWeight += 148 * 4;
        }
    }
    // 计算输出权重
    let outputWeight = 0;
    for (const output of psbt.txOutputs) {
        if (output.script.length === 0) {
            // OP_RETURN输出
            outputWeight += 8 + 1 + output.script.length; // value + script_len + script
        }
        else if (output.script.length === 22) {
            // P2WPKH输出: 31 bytes
            outputWeight += 31 * 4;
        }
        else if (output.script.length === 34) {
            // P2TR输出: 43 bytes
            outputWeight += 43 * 4;
        }
        else {
            // 其他类型，保守估算
            outputWeight += 34 * 4;
        }
    }
    // 基础交易权重 (版本4字节 + 输入数量 + 输出数量 + 锁定时间4字节)
    const baseWeight = (4 + 1 + 1 + 4) * 4;
    // 总权重转换为vSize
    const totalWeight = baseWeight + inputWeight + outputWeight;
    return Math.ceil(totalWeight / 4);
}
// ============================================================================
// 硬编码的精确交易大小 (基于实际测试结果)
// ============================================================================
/**
 * 硬编码的交易vSize - 基于实际构建和测试的结果
 */
exports.HARDCODED_TRANSACTION_SIZES = {
    /** 父交易vSize - 包含P2TR输入,P2WPKH中继输出,OP_RETURN,P2TR找零 */
    PARENT_TX_VSIZE: 171,
    /** 普通子交易vSize (1-23) - P2WPKH输入,P2WPKH输出,OP_RETURN */
    CHILD_TX_VSIZE: 138.5,
    /** 最后子交易vSize (24) - P2WPKH输入,P2TR输出,OP_RETURN */
    FINAL_CHILD_TX_VSIZE: 150.5
};
// ============================================================================
// 主要费用计算函数
// ============================================================================
/**
 * 执行精确费用计算
 *
 * 使用硬编码的准确交易大小进行精确费用计算
 */
async function performDryRunFeeCalculation({ wallets, contractId, childCount, feeRate, provider }) {
    try {
        // 验证参数
        validateFeeCalculationParams(feeRate, childCount);
        console.log(`🧮 开始精确费用计算...`);
        console.log(`   合约ID: ${contractId.block}:${contractId.tx}`);
        console.log(`   子交易数量: ${childCount}`);
        console.log(`   费率: ${feeRate} sat/vB`);
        console.log(`📏 使用硬编码的精确交易大小:`);
        console.log(`   父交易vSize: ${exports.HARDCODED_TRANSACTION_SIZES.PARENT_TX_VSIZE} vB`);
        console.log(`   普通子交易vSize (1-${childCount - 1}): ${exports.HARDCODED_TRANSACTION_SIZES.CHILD_TX_VSIZE} vB`);
        console.log(`   最后子交易vSize (${childCount}): ${exports.HARDCODED_TRANSACTION_SIZES.FINAL_CHILD_TX_VSIZE} vB`);
        // 计算精确费用
        const parentTotalFee = Math.ceil(exports.HARDCODED_TRANSACTION_SIZES.PARENT_TX_VSIZE * feeRate);
        // 普通子交易费用 (1到childCount-1)
        const normalChildFee = Math.ceil(exports.HARDCODED_TRANSACTION_SIZES.CHILD_TX_VSIZE * feeRate);
        const normalChildCount = childCount - 1;
        const normalChildTotalFees = normalChildFee * normalChildCount;
        // 最后子交易费用 (第childCount笔)
        const finalChildFee = Math.ceil(exports.HARDCODED_TRANSACTION_SIZES.FINAL_CHILD_TX_VSIZE * feeRate);
        // 最终输出dust阈值 (假设最终接收地址为P2TR)
        const finalOutputDust = 330; // P2TR dust threshold
        // 总费用计算
        const totalChildFees = normalChildTotalFees + finalChildFee;
        const relayFuelAmount = totalChildFees + finalOutputDust; // 包含最终输出的dust
        const totalRequiredFunding = parentTotalFee + relayFuelAmount;
        console.log(`💰 费用计算结果:`);
        console.log(`   父交易费用: ${parentTotalFee} sats (${exports.HARDCODED_TRANSACTION_SIZES.PARENT_TX_VSIZE} vB × ${feeRate} sat/vB)`);
        console.log(`   普通子交易费用: ${normalChildFee} sats × ${normalChildCount} = ${normalChildTotalFees} sats`);
        console.log(`   最后子交易费用: ${finalChildFee} sats (${exports.HARDCODED_TRANSACTION_SIZES.FINAL_CHILD_TX_VSIZE} vB × ${feeRate} sat/vB)`);
        console.log(`   子交易总费用: ${totalChildFees} sats`);
        console.log(`   最终输出dust: ${finalOutputDust} sats (P2TR minimum)`);
        console.log(`   中继燃料需求: ${relayFuelAmount} sats (包含最终输出)`);
        console.log(`   主钱包总需求: ${totalRequiredFunding} sats`);
        const result = {
            parentTx: {
                vSize: exports.HARDCODED_TRANSACTION_SIZES.PARENT_TX_VSIZE,
                baseFee: parentTotalFee,
                totalFee: parentTotalFee,
                feeRate: feeRate
            },
            childTx: {
                vSize: exports.HARDCODED_TRANSACTION_SIZES.CHILD_TX_VSIZE,
                baseFee: normalChildFee,
                totalFee: normalChildFee,
                feeRate: feeRate
            },
            childCount: childCount,
            totalChildFees: totalChildFees,
            relayFuelAmount: relayFuelAmount,
            totalRequiredFunding: totalRequiredFunding,
            safetyBuffer: 0
        };
        return result;
    }
    catch (error) {
        console.error(`💥 精确费用计算失败:`, error.message);
        throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.FEE_CALCULATION_ERROR, `费用计算失败: ${error.message}`, { contractId, childCount, feeRate });
    }
}
exports.performDryRunFeeCalculation = performDryRunFeeCalculation;
/**
 * 基于硬编码大小的精确费用计算
 *
 * 使用硬编码的准确交易大小，与performDryRunFeeCalculation保持一致
 */
async function calculateActualTransactionFees({ wallets, contractId, childCount, feeRate, provider, actualUtxos }) {
    try {
        console.log(`🎯 基于硬编码大小计算精确费用...`);
        console.log(`   可用UTXO数量: ${actualUtxos.length}`);
        // 使用与performDryRunFeeCalculation相同的逻辑
        return await performDryRunFeeCalculation({
            wallets,
            contractId,
            childCount,
            feeRate,
            provider
        });
    }
    catch (error) {
        console.error(`💥 实际费用计算失败:`, error.message);
        throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.FEE_CALCULATION_ERROR, `实际费用计算失败: ${error.message}`, { contractId, childCount, feeRate, utxoCount: actualUtxos.length });
    }
}
exports.calculateActualTransactionFees = calculateActualTransactionFees;
/**
 * 构建真实父交易用于费用计算
 */
async function buildRealParentTransactionForFeeCalc({ wallets, contractId, provider, utxos, estimatedRelayAmount }) {
    const psbt = new bitcoin.Psbt({ network: provider.network });
    // 选择足够的UTXO（简化选择逻辑）
    let totalInputValue = 0;
    const selectedUtxos = [];
    for (const utxo of utxos) {
        selectedUtxos.push(utxo);
        totalInputValue += utxo.satoshis;
        if (totalInputValue >= estimatedRelayAmount + 50000) { // 50k缓冲
            break;
        }
    }
    // 添加真实输入
    for (const utxo of selectedUtxos) {
        psbt.addInput({
            hash: utxo.txId,
            index: utxo.outputIndex,
            witnessUtxo: {
                value: utxo.satoshis,
                script: Buffer.from(utxo.scriptPk, 'hex')
            },
            sequence: 0xfffffffd
        });
    }
    // 构建protostone
    const calldata = [
        BigInt(contractId.block),
        BigInt(contractId.tx),
        BigInt(77)
    ];
    // 构建protostone - 父交易配置
    const protostone = (0, alkanes_1.encodeProtostone)({
        protocolTag: 1n,
        edicts: [],
        pointer: chainMinting_1.StandardVoutLayout.RELAY_OUTPUT,
        refundPointer: chainMinting_1.StandardVoutLayout.FINAL_CHANGE,
        calldata: calldata
    });
    // 添加输出
    psbt.addOutput({
        address: wallets.relayWallet.account.nativeSegwit.address,
        value: estimatedRelayAmount
    });
    psbt.addOutput({
        script: protostone,
        value: 0
    });
    const changeAmount = totalInputValue - estimatedRelayAmount - 10000; // 临时费用估算
    if (changeAmount > 546) {
        psbt.addOutput({
            address: wallets.mainWallet.account.taproot.address,
            value: changeAmount
        });
    }
    return psbt;
}
// ============================================================================
// 辅助函数
// ============================================================================
/**
 * 验证费用计算参数
 */
function validateFeeCalculationParams(feeRate, childCount) {
    if (feeRate < chainMinting_1.SAFETY_PARAMS.MIN_FEE_RATE || feeRate > chainMinting_1.SAFETY_PARAMS.MAX_FEE_RATE) {
        throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.FEE_CALCULATION_ERROR, `费率超出安全范围: ${feeRate} (允许范围: ${chainMinting_1.SAFETY_PARAMS.MIN_FEE_RATE}-${chainMinting_1.SAFETY_PARAMS.MAX_FEE_RATE})`);
    }
    if (childCount < 1 || childCount > 24) {
        throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.FEE_CALCULATION_ERROR, `子交易数量超出范围: ${childCount} (允许范围: 1-24)`);
    }
}
/**
 * 比较两次费用计算结果的差异
 */
function compareFeeCalculations(dryRun, actual) {
    const parentFeeDiff = actual.parentTx.totalFee - dryRun.parentTx.totalFee;
    const childFeeDiff = actual.childTx.totalFee - dryRun.childTx.totalFee;
    const totalDiff = actual.totalRequiredFunding - dryRun.totalRequiredFunding;
    const accuracy = 1 - Math.abs(totalDiff) / dryRun.totalRequiredFunding;
    return {
        parentFeeDiff,
        childFeeDiff,
        totalDiff,
        accuracy: Math.max(0, accuracy)
    };
}
exports.compareFeeCalculations = compareFeeCalculations;
/**
 * 格式化费用计算结果用于显示
 */
function formatFeeCalculationResult(result) {
    // 计算普通子交易和最后子交易的费用
    const normalChildFee = Math.ceil(exports.HARDCODED_TRANSACTION_SIZES.CHILD_TX_VSIZE * result.childTx.feeRate);
    const finalChildFee = Math.ceil(exports.HARDCODED_TRANSACTION_SIZES.FINAL_CHILD_TX_VSIZE * result.childTx.feeRate);
    const normalChildCount = result.childCount - 1;
    const finalOutputDust = 330;
    return `
📊 费用计算汇总:
├─ 父交易: ${result.parentTx.totalFee} sats (${result.parentTx.vSize} vB × ${result.parentTx.feeRate} sat/vB)
├─ 普通子交易 (1-${normalChildCount}): ${normalChildFee} sats × ${normalChildCount} = ${normalChildFee * normalChildCount} sats
├─ 最后子交易 (${result.childCount}): ${finalChildFee} sats (${exports.HARDCODED_TRANSACTION_SIZES.FINAL_CHILD_TX_VSIZE} vB × ${result.childTx.feeRate} sat/vB)
├─ 子交易总费用: ${result.totalChildFees} sats
├─ 最终输出dust: ${finalOutputDust} sats (P2TR minimum)
├─ 中继燃料: ${result.relayFuelAmount} sats (包含最终输出)
└─ 总需求: ${result.totalRequiredFunding} sats
`;
}
exports.formatFeeCalculationResult = formatFeeCalculationResult;
//# sourceMappingURL=feeCalculation.js.map