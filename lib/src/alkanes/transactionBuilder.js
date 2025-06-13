"use strict";
/**
 * 交易构建模块
 *
 * 实现父交易和子交易的构建逻辑，严格遵循标准vout布局
 * 支持RBF、dust阈值验证和精确的费用控制
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyExistingChain = exports.executeCompleteChainMinting = exports.generateChildChainSummary = exports.formatChildChainResult = exports.calculateChildChainStatistics = exports.validateChildTransactionChain = exports.validateChildTransactionOutputs = exports.buildAndBroadcastChildTransactionChain = exports.buildChildTransaction = exports.generateParentTransactionSummary = exports.validateParentTransactionParams = exports.calculateActualParentFee = exports.formatParentTransactionResult = exports.validateParentTransactionFees = exports.validateParentTransactionOutputs = exports.buildSignAndBroadcastParentTransaction = void 0;
const tslib_1 = require("tslib");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const chainMinting_1 = require("./chainMinting");
const alkanes_1 = require("./alkanes");
const utils_1 = require("../shared/utils");
const transactionBroadcaster_1 = require("./transactionBroadcaster");
const chainVerification_1 = require("./chainVerification");
// ============================================================================
// 父交易(TX₀)构建器
// ============================================================================
/**
 * 构建、签名、广播父交易并等待进入交易池
 *
 * 严格按照标准vout布局：
 * - vout=0: 中继输出 (接力/燃料)
 * - vout=1: OP_RETURN (指令中心)
 * - vout=2: 找零输出 (最终找零)
 */
async function buildSignAndBroadcastParentTransaction(config) {
    const { wallets, contractId, feeCalculation, provider, utxos } = config;
    try {
        console.log(`🏗️  构建父交易: ${contractId.block}:${contractId.tx}, 中继燃料: ${feeCalculation.relayFuelAmount} sats`);
        // 1. 选择足够的UTXO
        const totalNeeded = feeCalculation.totalRequiredFunding;
        const selectedUtxos = (0, utils_1.findXAmountOfSats)(utxos, totalNeeded);
        if (selectedUtxos.totalAmount < totalNeeded) {
            throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.INSUFFICIENT_FUNDS, `资金不足: 需要 ${totalNeeded} sats, 可用 ${selectedUtxos.totalAmount} sats`, { required: totalNeeded, available: selectedUtxos.totalAmount });
        }
        console.log(`   输入: ${selectedUtxos.utxos.length} UTXOs (${selectedUtxos.totalAmount} sats)`);
        // 2. 创建PSBT
        const psbt = new bitcoin.Psbt({ network: provider.network });
        // 3. 添加输入 - 支持RBF
        for (const utxo of selectedUtxos.utxos) {
            await addRBFInput(psbt, utxo, wallets.mainWallet.account, provider);
        }
        // 4. 构建Protostone消息
        const calldata = [
            BigInt(contractId.block),
            BigInt(contractId.tx),
            BigInt(77) // mint操作码
        ];
        const protostone = (0, alkanes_1.encodeProtostone)({
            protocolTag: 1n,
            edicts: [],
            pointer: chainMinting_1.StandardVoutLayout.RELAY_OUTPUT,
            refundPointer: chainMinting_1.StandardVoutLayout.FINAL_CHANGE,
            calldata: calldata
        });
        console.log(`   Protostone: [${contractId.block}, ${contractId.tx}, 77] (${protostone.length} bytes)`);
        // 5. 严格按照标准vout布局添加输出
        // vout=0: 中继/燃料输出 - 发送到中继钱包
        const relayAddress = wallets.relayWallet.account.nativeSegwit.address;
        (0, chainMinting_1.validateDustThreshold)(feeCalculation.relayFuelAmount, chainMinting_1.AddressType.P2WPKH);
        psbt.addOutput({
            address: relayAddress,
            value: feeCalculation.relayFuelAmount
        });
        psbt.addOutput({
            script: protostone,
            value: 0
        });
        console.log(`   输出: vout0=${feeCalculation.relayFuelAmount}→中继, vout1=OP_RETURN`);
        // vout=2: 找零输出 - 返回主钱包
        const totalOutputs = feeCalculation.relayFuelAmount;
        const minerFee = feeCalculation.parentTx.totalFee;
        const changeAmount = selectedUtxos.totalAmount - totalOutputs - minerFee;
        if (changeAmount >= 546) { // Bitcoin dust threshold
            const mainAddress = wallets.mainWallet.account.taproot.address;
            (0, chainMinting_1.validateDustThreshold)(changeAmount, chainMinting_1.AddressType.P2TR);
            psbt.addOutput({
                address: mainAddress,
                value: changeAmount
            });
            console.log(`   找零: ${changeAmount} sats`);
        }
        // 6. 格式化PSBT用于签名
        const formatted = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: wallets.mainWallet.account.taproot.pubkey,
            network: provider.network,
        });
        console.log(`   费用: ${minerFee} sats (${feeCalculation.parentTx.feeRate} sat/vB, ${feeCalculation.parentTx.vSize} vB)`);
        // 7. 立即签名并获取真实交易ID
        const { signedPsbtHex, realTxId } = await signPsbtAndGetTxId(formatted.toHex(), wallets.mainWallet.signer, '父交易');
        console.log(`✅ 父交易签名完成: ${realTxId}`);
        // 8. 立即广播父交易 - 优先使用自定义RPC
        const useCustomRpc = process.env.RPC_PROVIDER && process.env.RPC_PROVIDER !== 'sandshrew';
        console.log(`📡 广播父交易: ${realTxId} (${useCustomRpc ? process.env.RPC_PROVIDER : 'Provider'})`);
        let broadcastResult;
        if (useCustomRpc) {
            broadcastResult = await (0, transactionBroadcaster_1.broadcastSingleTransactionWithRpc)(signedPsbtHex, realTxId, undefined, // 使用默认的RPC客户端
            provider.networkType, config.broadcastConfig);
        }
        else {
            broadcastResult = await (0, transactionBroadcaster_1.broadcastSingleTransaction)(signedPsbtHex, realTxId, provider, config.broadcastConfig);
        }
        if (!broadcastResult.success) {
            throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.BROADCAST_ERROR, `父交易广播失败: ${broadcastResult.error}`, { txId: realTxId, error: broadcastResult.error });
        }
        console.log(`✅ 父交易广播成功，等待1秒同步...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
            psbtHex: signedPsbtHex,
            expectedTxId: realTxId,
            outputValue: feeCalculation.relayFuelAmount,
            type: 'parent',
            index: 0
        };
    }
    catch (error) {
        console.error(`💥 父交易构建失败:`, error.message);
        throw error instanceof chainMinting_1.ChainMintingError ? error : new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.TRANSACTION_BUILD_ERROR, `父交易构建失败: ${error.message}`, { contractId, feeCalculation });
    }
}
exports.buildSignAndBroadcastParentTransaction = buildSignAndBroadcastParentTransaction;
// ============================================================================
// RBF支持的输入添加器
// ============================================================================
/**
 * 添加支持RBF的输入
 */
async function addRBFInput(psbt, utxo, account, provider) {
    const addressType = (0, utils_1.getAddressType)(utxo.address);
    switch (addressType) {
        case 0: // P2PKH (Legacy)
            const prevHex = await provider.esplora.getTxHex(utxo.txId);
            psbt.addInput({
                hash: utxo.txId,
                index: utxo.outputIndex,
                nonWitnessUtxo: Buffer.from(prevHex, 'hex'),
                sequence: chainMinting_1.RBF_CONFIG.ENABLED_SEQUENCE, // 启用RBF
            });
            break;
        case 1: // P2WPKH (Native SegWit)
            psbt.addInput({
                hash: utxo.txId,
                index: utxo.outputIndex,
                witnessUtxo: {
                    value: utxo.satoshis,
                    script: Buffer.from(utxo.scriptPk, 'hex')
                },
                sequence: chainMinting_1.RBF_CONFIG.ENABLED_SEQUENCE, // 启用RBF
            });
            break;
        case 2: // P2SH-P2WPKH (Nested SegWit)
            const redeemScript = bitcoin.script.compile([
                bitcoin.opcodes.OP_0,
                bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex'))
            ]);
            psbt.addInput({
                hash: utxo.txId,
                index: utxo.outputIndex,
                redeemScript: redeemScript,
                witnessUtxo: {
                    value: utxo.satoshis,
                    script: bitcoin.script.compile([
                        bitcoin.opcodes.OP_HASH160,
                        bitcoin.crypto.hash160(redeemScript),
                        bitcoin.opcodes.OP_EQUAL,
                    ])
                },
                sequence: chainMinting_1.RBF_CONFIG.ENABLED_SEQUENCE, // 启用RBF
            });
            break;
        case 3: // P2TR (Taproot)
        default:
            psbt.addInput({
                hash: utxo.txId,
                index: utxo.outputIndex,
                witnessUtxo: {
                    value: utxo.satoshis,
                    script: Buffer.from(utxo.scriptPk, 'hex')
                },
                sequence: chainMinting_1.RBF_CONFIG.ENABLED_SEQUENCE, // 启用RBF
            });
            break;
    }
}
// ============================================================================
// 父交易验证器
// ============================================================================
/**
 * 验证父交易输出布局
 */
function validateParentTransactionOutputs(psbt) {
    const errors = [];
    const outputs = psbt.txOutputs;
    // 检查输出数量 (2-3个输出)
    if (outputs.length < 2 || outputs.length > 3) {
        errors.push(`父交易输出数量异常: ${outputs.length} (期望: 2-3)`);
    }
    // 检查vout=0: 中继输出
    if (outputs.length > 0) {
        const relayOutput = outputs[0];
        if (relayOutput.value <= 0) {
            errors.push(`vout=0中继输出金额无效: ${relayOutput.value}`);
        }
        if (relayOutput.script.length !== 22) { // P2WPKH script length
            errors.push(`vout=0必须是P2WPKH输出`);
        }
    }
    // 检查vout=1: OP_RETURN
    if (outputs.length > 1) {
        const opReturnOutput = outputs[1];
        if (opReturnOutput.value !== 0) {
            errors.push(`vout=1 OP_RETURN输出必须为0 sats: ${opReturnOutput.value}`);
        }
        if (opReturnOutput.script.length === 0 || opReturnOutput.script[0] !== bitcoin.opcodes.OP_RETURN) {
            errors.push(`vout=1必须是OP_RETURN输出`);
        }
    }
    // 检查vout=2: 找零输出 (如果存在)
    if (outputs.length > 2) {
        const changeOutput = outputs[2];
        if (changeOutput.value < 546) {
            errors.push(`vout=2找零输出低于dust阈值: ${changeOutput.value}`);
        }
    }
    return {
        isValid: errors.length === 0,
        errors
    };
}
exports.validateParentTransactionOutputs = validateParentTransactionOutputs;
/**
 * 验证父交易费用计算
 */
function validateParentTransactionFees({ inputTotal, outputTotal, expectedFee, tolerance = 0.1 }) {
    const errors = [];
    const actualFee = inputTotal - outputTotal;
    const feeDeviation = Math.abs(actualFee - expectedFee) / expectedFee;
    if (actualFee < 0) {
        errors.push(`输入不足以支付输出: 输入${inputTotal}, 输出${outputTotal}`);
    }
    if (feeDeviation > tolerance) {
        errors.push(`费用偏差过大: 期望${expectedFee}, 实际${actualFee}, 偏差${(feeDeviation * 100).toFixed(1)}%`);
    }
    return {
        isValid: errors.length === 0,
        actualFee,
        feeDeviation,
        errors
    };
}
exports.validateParentTransactionFees = validateParentTransactionFees;
// ============================================================================
// 辅助工具函数
// ============================================================================
/**
 * 签名PSBT并获取真实交易ID
 */
async function signPsbtAndGetTxId(psbtHex, signer, txType) {
    try {
        // 简化签名日志
        // 签名PSBT
        const signedResult = await signer.signAllInputs({ rawPsbtHex: psbtHex });
        // 从签名的PSBT中提取真实交易ID
        const signedPsbt = bitcoin.Psbt.fromHex(signedResult.signedHexPsbt);
        const realTxId = signedPsbt.extractTransaction().getId();
        // 签名成功日志已在调用者处显示
        return {
            signedPsbtHex: signedResult.signedHexPsbt,
            realTxId
        };
    }
    catch (error) {
        console.error(`💥 ${txType}签名失败:`, error.message);
        throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.SIGNING_ERROR, `${txType}签名失败: ${error.message}`, { error: error.message, txType });
    }
}
/**
 * 格式化父交易构建结果
 */
function formatParentTransactionResult(result) {
    return `
🏗️  父交易构建结果:
├─ 交易ID: ${result.expectedTxId}
├─ 交易类型: ${result.type} (索引: ${result.index})
├─ PSBT大小: ${Math.ceil(result.psbtHex.length / 2)} bytes
├─ 中继输出: ${result.outputValue} sats
└─ 状态: ✅ 就绪待签名
`;
}
exports.formatParentTransactionResult = formatParentTransactionResult;
/**
 * 计算父交易的实际费用
 */
function calculateActualParentFee(inputUtxos, relayAmount, changeAmount) {
    const totalInput = inputUtxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
    const totalOutput = relayAmount + changeAmount;
    return totalInput - totalOutput;
}
exports.calculateActualParentFee = calculateActualParentFee;
/**
 * 验证父交易参数
 */
function validateParentTransactionParams(config) {
    const { wallets, contractId, feeCalculation, utxos } = config;
    const errors = [];
    // 验证钱包
    if (!wallets.mainWallet || !wallets.relayWallet) {
        errors.push('主钱包或中继钱包未设置');
    }
    // 验证合约ID
    if (!contractId.block || !contractId.tx) {
        errors.push('合约ID不完整');
    }
    // 验证费用计算
    if (feeCalculation.totalRequiredFunding <= 0) {
        errors.push('费用计算结果无效');
    }
    // 验证UTXO
    if (!utxos || utxos.length === 0) {
        errors.push('没有可用的UTXO');
    }
    const totalAvailable = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
    if (totalAvailable < feeCalculation.totalRequiredFunding) {
        errors.push(`UTXO总额不足: 需要 ${feeCalculation.totalRequiredFunding}, 可用 ${totalAvailable}`);
    }
    return {
        isValid: errors.length === 0,
        errors
    };
}
exports.validateParentTransactionParams = validateParentTransactionParams;
/**
 * 生成父交易摘要
 */
function generateParentTransactionSummary(result, wallets, contractId) {
    return {
        transactionId: result.expectedTxId,
        relayAddress: wallets.relayWallet.account.nativeSegwit.address,
        relayAmount: result.outputValue,
        contractTarget: `${contractId.block}:${contractId.tx}`,
        timestamp: Date.now(),
        voutLayout: {
            vout0: {
                type: 'relay',
                address: wallets.relayWallet.account.nativeSegwit.address,
                amount: result.outputValue
            },
            vout1: {
                type: 'opreturn',
                size: Math.ceil(result.psbtHex.length / 2)
            },
            vout2: {
                type: 'change',
                address: wallets.mainWallet.account.taproot.address
            }
        }
    };
}
exports.generateParentTransactionSummary = generateParentTransactionSummary;
// ============================================================================
// 子交易链(TX₁-TX₂₄)构建器
// ============================================================================
/**
 * 构建单个子交易
 *
 * 子交易遵循固定布局：
 * - vout=0: 中继输出 (继续链条或最终接收)
 * - vout=1: OP_RETURN (指令中心)
 *
 * 关键特性：
 * - 隐式资产传递：空edicts触发输入资产自动加载
 * - 动态地址切换：最后一笔交易发送到最终接收地址
 * - 费用递减：每笔交易的输出金额递减childTxFee
 */
async function buildChildTransaction(config) {
    const { parentTxId, parentOutputValue, transactionIndex, isLastTransaction, finalReceiverAddress, wallets, contractId, childTxFee, provider } = config;
    try {
        console.log(`🔗 构建子交易 ${transactionIndex}/24: ${parentOutputValue} sats${isLastTransaction ? ' (最后)' : ''}`);
        // 1. 创建PSBT
        const psbt = new bitcoin.Psbt({ network: provider.network });
        // 2. 添加输入 - 固定消费父交易的vout=0
        const relayScript = bitcoin.script.compile([
            bitcoin.opcodes.OP_0,
            bitcoin.crypto.hash160(Buffer.from(wallets.relayWallet.account.nativeSegwit.pubkey, 'hex'))
        ]);
        psbt.addInput({
            hash: parentTxId,
            index: 0,
            witnessUtxo: {
                value: parentOutputValue,
                script: relayScript
            },
            sequence: chainMinting_1.RBF_CONFIG.ENABLED_SEQUENCE, // 启用RBF
        });
        // 3. 构建Protostone消息 - 关键：利用隐式资产传递
        const calldata = [
            BigInt(contractId.block),
            BigInt(contractId.tx),
            BigInt(77) // mint操作码
        ];
        const protostone = (0, alkanes_1.encodeProtostone)({
            protocolTag: 1n,
            edicts: [],
            pointer: chainMinting_1.StandardVoutLayout.RELAY_OUTPUT,
            refundPointer: chainMinting_1.StandardVoutLayout.RELAY_OUTPUT,
            calldata: calldata
        });
        // Protostone: 类似父交易，略过详细日志
        // 4. 计算输出金额和目标地址
        let outputAmount;
        let actualChildTxFee;
        if (isLastTransaction) {
            outputAmount = 330;
            actualChildTxFee = parentOutputValue - outputAmount;
            console.log(`   最后交易: 输出=${outputAmount}, 费用=${actualChildTxFee} sats`);
        }
        else {
            actualChildTxFee = childTxFee;
            outputAmount = parentOutputValue - actualChildTxFee;
        }
        const targetAddress = isLastTransaction
            ? finalReceiverAddress
            : wallets.relayWallet.account.nativeSegwit.address;
        // 5. 验证输出金额满足dust阈值
        const targetAddressType = isLastTransaction ? chainMinting_1.AddressType.P2TR : chainMinting_1.AddressType.P2WPKH;
        (0, chainMinting_1.validateDustThreshold)(outputAmount, targetAddressType);
        // 6. 严格按照标准vout布局添加输出
        // vout=0: 中继输出或最终输出
        psbt.addOutput({
            address: targetAddress,
            value: outputAmount
        });
        psbt.addOutput({
            script: protostone,
            value: 0
        });
        console.log(`   输出: ${outputAmount} sats→${isLastTransaction ? '最终' : '中继'}, 费用=${actualChildTxFee} sats`);
        // 7. 格式化PSBT用于签名
        const formatted = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: wallets.relayWallet.account.nativeSegwit.pubkey,
            network: provider.network,
        });
        // 简化签名日志，金额信息已在上面显示
        // 8. 立即签名并获取真实交易ID
        const { signedPsbtHex, realTxId } = await signPsbtAndGetTxId(formatted.toHex(), wallets.relayWallet.signer, `子交易${transactionIndex}`);
        console.log(`✅ 子交易 ${transactionIndex} 签名完成: ${realTxId}`);
        return {
            psbtHex: signedPsbtHex,
            expectedTxId: realTxId,
            outputValue: outputAmount,
            type: 'child',
            index: transactionIndex
        };
    }
    catch (error) {
        console.error(`💥 子交易 ${transactionIndex} 构建失败:`, error.message);
        throw error instanceof chainMinting_1.ChainMintingError ? error : new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.TRANSACTION_BUILD_ERROR, `子交易 ${transactionIndex} 构建失败: ${error.message}`, { parentTxId, transactionIndex, isLastTransaction });
    }
}
exports.buildChildTransaction = buildChildTransaction;
/**
 * 串行构建、签名、广播子交易链 (TX₁-TX₂₄)
 *
 * 每一笔交易：构建 → 签名 → 广播 → 等待进入交易池 → 构建下一笔
 */
async function buildAndBroadcastChildTransactionChain({ parentTxId, initialRelayAmount, wallets, contractId, childCount = 24, childTxFee, finalReceiverAddress, provider, broadcastConfig }) {
    try {
        console.log(`🔗 串行执行子交易链: ${childCount}笔, ${initialRelayAmount} sats燃料`);
        // 验证链条完整性
        const totalFeesNeeded = childTxFee * childCount;
        if (initialRelayAmount < totalFeesNeeded) {
            throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.INSUFFICIENT_FUNDS, `中继资金不足: 需要 ${totalFeesNeeded} sats, 可用 ${initialRelayAmount} sats`, { required: totalFeesNeeded, available: initialRelayAmount });
        }
        const childTransactions = [];
        let currentParentTxId = parentTxId;
        let currentOutputValue = initialRelayAmount;
        // 串行执行：构建 → 签名 → 广播 → 等待 → 下一笔
        for (let i = 1; i <= childCount; i++) {
            const isLastTransaction = (i === childCount);
            console.log(`\n📦 Step ${i}: 子交易 ${i}/${childCount} (输入: ${currentOutputValue} sats)`);
            // 验证输入金额是否足够
            if (currentOutputValue < childTxFee) {
                throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.INSUFFICIENT_FUNDS, `子交易 ${i} 输入金额不足: 需要至少 ${childTxFee} sats, 实际 ${currentOutputValue} sats`, { transactionIndex: i, required: childTxFee, available: currentOutputValue });
            }
            // 1. 构建并签名当前子交易
            const childConfig = {
                parentTxId: currentParentTxId,
                parentOutputValue: currentOutputValue,
                transactionIndex: i,
                isLastTransaction,
                finalReceiverAddress,
                wallets,
                contractId,
                childTxFee,
                provider
            };
            const childTx = await buildChildTransaction(childConfig);
            // 2. 立即广播这笔交易 - 优先使用自定义RPC
            const useCustomRpc = process.env.RPC_PROVIDER && process.env.RPC_PROVIDER !== 'sandshrew';
            console.log(`📡 广播子交易 ${i}: ${childTx.expectedTxId.substring(0, 8)}... (${useCustomRpc ? process.env.RPC_PROVIDER : 'Provider'})`);
            let broadcastResult;
            if (useCustomRpc) {
                broadcastResult = await (0, transactionBroadcaster_1.broadcastSingleTransactionWithRpc)(childTx.psbtHex, childTx.expectedTxId, undefined, // 使用默认的RPC客户端
                provider.networkType, broadcastConfig);
            }
            else {
                broadcastResult = await (0, transactionBroadcaster_1.broadcastSingleTransaction)(childTx.psbtHex, childTx.expectedTxId, provider, broadcastConfig);
            }
            if (!broadcastResult.success) {
                throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.BROADCAST_ERROR, `子交易 ${i} 广播失败: ${broadcastResult.error}`, { transactionIndex: i, txId: childTx.expectedTxId, error: broadcastResult.error });
            }
            console.log(`✅ 子交易 ${i} 广播成功${isLastTransaction ? ' (最后)' : ''}`);
            if (!isLastTransaction) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            // 4. 记录交易并更新链条状态
            childTransactions.push(childTx);
            // 更新链条状态为下一笔交易做准备
            currentParentTxId = childTx.expectedTxId; // 真实交易ID
            currentOutputValue = childTx.outputValue;
            // 略过链条状态日志，信息重复
        }
        console.log(`\n🎉 子交易链完成: ${childTransactions.length}笔, 最终${childTransactions[childTransactions.length - 1].outputValue} sats`);
        return childTransactions;
    }
    catch (error) {
        console.error(`💥 子交易链失败:`, error.message);
        throw error instanceof chainMinting_1.ChainMintingError ? error : new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.TRANSACTION_BUILD_ERROR, `子交易链构建失败: ${error.message}`, { parentTxId, initialRelayAmount, childCount });
    }
}
exports.buildAndBroadcastChildTransactionChain = buildAndBroadcastChildTransactionChain;
// ============================================================================
// 子交易验证器
// ============================================================================
/**
 * 验证子交易输出布局
 */
function validateChildTransactionOutputs(psbt, _isLastTransaction) {
    const errors = [];
    const outputs = psbt.txOutputs;
    // 检查输出数量 (固定2个输出)
    if (outputs.length !== 2) {
        errors.push(`子交易输出数量异常: ${outputs.length} (期望: 2)`);
    }
    // 检查vout=0: 中继/最终输出
    if (outputs.length > 0) {
        const relayOutput = outputs[0];
        if (relayOutput.value <= 0) {
            errors.push(`vout=0输出金额无效: ${relayOutput.value}`);
        }
        // 验证地址类型 (应该是P2WPKH)
        if (relayOutput.script.length !== 22) {
            errors.push(`vout=0必须是P2WPKH输出`);
        }
    }
    // 检查vout=1: OP_RETURN
    if (outputs.length > 1) {
        const opReturnOutput = outputs[1];
        if (opReturnOutput.value !== 0) {
            errors.push(`vout=1 OP_RETURN输出必须为0 sats: ${opReturnOutput.value}`);
        }
        if (opReturnOutput.script.length === 0 || opReturnOutput.script[0] !== bitcoin.opcodes.OP_RETURN) {
            errors.push(`vout=1必须是OP_RETURN输出`);
        }
    }
    return {
        isValid: errors.length === 0,
        errors
    };
}
exports.validateChildTransactionOutputs = validateChildTransactionOutputs;
/**
 * 验证子交易链的完整性
 */
function validateChildTransactionChain(transactions) {
    const errors = [];
    let brokenAtIndex;
    // 检查交易索引连续性
    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        const expectedIndex = i + 1;
        if (tx.index !== expectedIndex) {
            errors.push(`交易索引不连续: 第${i}个交易索引为${tx.index}, 期望${expectedIndex}`);
            if (!brokenAtIndex)
                brokenAtIndex = i;
        }
        if (tx.type !== 'child') {
            errors.push(`交易类型错误: 第${i}个交易类型为${tx.type}, 期望child`);
            if (!brokenAtIndex)
                brokenAtIndex = i;
        }
    }
    // 检查金额递减逻辑
    for (let i = 1; i < transactions.length; i++) {
        const prevTx = transactions[i - 1];
        const currentTx = transactions[i];
        if (currentTx.outputValue >= prevTx.outputValue) {
            errors.push(`金额递减异常: 交易${i + 1}输出${currentTx.outputValue} >= 交易${i}输出${prevTx.outputValue}`);
            if (!brokenAtIndex)
                brokenAtIndex = i;
        }
    }
    return {
        isValid: errors.length === 0,
        errors,
        brokenAtIndex
    };
}
exports.validateChildTransactionChain = validateChildTransactionChain;
/**
 * 计算子交易链的总统计信息
 */
function calculateChildChainStatistics(transactions, childTxFee) {
    const totalTransactions = transactions.length;
    const totalFeesPaid = childTxFee * totalTransactions;
    const firstTx = transactions[0];
    const lastTx = transactions[transactions.length - 1];
    // 计算初始金额（第一笔交易的输出 + 手续费）
    const initialAmount = firstTx ? firstTx.outputValue + childTxFee : 0;
    const finalAmount = lastTx ? lastTx.outputValue : 0;
    const totalReduction = initialAmount - finalAmount;
    // 计算平均交易大小
    const totalBytes = transactions.reduce((sum, tx) => sum + Math.ceil(tx.psbtHex.length / 2), 0);
    const averageTransactionSize = totalBytes / totalTransactions;
    return {
        totalTransactions,
        totalFeesPaid,
        initialAmount,
        finalAmount,
        totalReduction,
        averageTransactionSize
    };
}
exports.calculateChildChainStatistics = calculateChildChainStatistics;
// ============================================================================
// 辅助工具函数
// ============================================================================
/**
 * 格式化子交易链构建结果
 */
function formatChildChainResult(transactions, childTxFee) {
    const stats = calculateChildChainStatistics(transactions, childTxFee);
    return `
🔗 子交易链构建结果:
├─ 交易数量: ${stats.totalTransactions} 笔
├─ 初始金额: ${stats.initialAmount} sats
├─ 最终金额: ${stats.finalAmount} sats  
├─ 总手续费: ${stats.totalFeesPaid} sats
├─ 平均大小: ${stats.averageTransactionSize.toFixed(1)} bytes
└─ 状态: ✅ 链条完整，就绪待广播
`;
}
exports.formatChildChainResult = formatChildChainResult;
/**
 * 生成子交易链摘要
 */
function generateChildChainSummary(transactions, contractId, finalReceiverAddress) {
    return {
        chainLength: transactions.length,
        firstTxId: transactions[0]?.expectedTxId || '',
        lastTxId: transactions[transactions.length - 1]?.expectedTxId || '',
        contractTarget: `${contractId.block}:${contractId.tx}`,
        finalReceiver: finalReceiverAddress,
        timestamp: Date.now(),
        transactions: transactions.map(tx => ({
            index: tx.index || 0,
            txId: tx.expectedTxId,
            outputValue: tx.outputValue,
            isLast: tx.index === transactions.length
        }))
    };
}
exports.generateChildChainSummary = generateChildChainSummary;
// ============================================================================
// 完整的构建+广播+验证流程
// ============================================================================
/**
 * 完整的Project Snowball执行：构建 → 广播 → 验证
 *
 * 这是最高级的API，提供端到端的链式铸造和验证
 */
async function executeCompleteChainMinting({ wallets, contractId, feeCalculation, provider, utxos, broadcastConfig, finalReceiverAddress, childCount = 24, verificationConfig = {} }) {
    try {
        console.log(`🚀 PROJECT SNOWBALL 执行: ${contractId.block}:${contractId.tx}, ${childCount}笔→${finalReceiverAddress}`);
        console.log(`\n📦 Step 1: 执行父交易`);
        const parentTx = await buildSignAndBroadcastParentTransaction({
            wallets,
            contractId,
            feeCalculation,
            provider,
            utxos,
            broadcastConfig
        });
        console.log(`✅ 父交易完成`);
        console.log(`\n📦 Step 2: 执行子交易链`);
        const childTxs = await buildAndBroadcastChildTransactionChain({
            parentTxId: parentTx.expectedTxId,
            initialRelayAmount: feeCalculation.relayFuelAmount,
            wallets,
            contractId,
            childCount,
            childTxFee: feeCalculation.childTx.totalFee,
            finalReceiverAddress,
            provider,
            broadcastConfig
        });
        console.log(`✅ 子交易链完成`);
        console.log(`\n📦 Step 3: 链上验证`);
        const verificationResult = await (0, chainVerification_1.verifyChainExecution)({
            parentTx,
            childTxs,
            contractId,
            finalReceiverAddress,
            provider,
            config: {
                ...verificationConfig,
                onProgress: (status) => {
                    // 显示验证进度
                    const confirmed = status.confirmedTransactions;
                    const total = status.totalTransactions;
                    const percentage = Math.round((confirmed / total) * 100);
                    console.log(`🔍 验证: ${confirmed}/${total} (${percentage}%) ${status.overallStatus}`);
                    // 调用用户提供的回调
                    if (verificationConfig.onProgress) {
                        verificationConfig.onProgress(status);
                    }
                }
            }
        });
        console.log(`\n🎉 PROJECT SNOWBALL 完成！`);
        return {
            parentTx,
            childTxs,
            verificationResult
        };
    }
    catch (error) {
        console.error(`💥 完整执行流程失败:`, error.message);
        throw error instanceof chainMinting_1.ChainMintingError ? error : new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.EXECUTION_ERROR, `完整执行流程失败: ${error.message}`, { contractId, finalReceiverAddress, childCount });
    }
}
exports.executeCompleteChainMinting = executeCompleteChainMinting;
/**
 * 仅验证已存在的链条（不执行构建和广播）
 *
 * 用于验证之前执行的链式铸造结果
 */
async function verifyExistingChain({ parentTxId, childTxIds, contractId, finalReceiverAddress, provider, verificationConfig = {} }) {
    try {
        console.log(`🔍 验证链条: ${parentTxId.substring(0, 8)}..., ${childTxIds.length}笔→${finalReceiverAddress}`);
        // 构造BuiltTransaction对象用于验证
        const parentTx = {
            psbtHex: '',
            expectedTxId: parentTxId,
            outputValue: 0,
            type: 'parent',
            index: 0
        };
        const childTxs = childTxIds.map((txId, index) => ({
            psbtHex: '',
            expectedTxId: txId,
            outputValue: 0,
            type: 'child',
            index: index + 1
        }));
        const verificationResult = await (0, chainVerification_1.verifyChainExecution)({
            parentTx,
            childTxs,
            contractId,
            finalReceiverAddress,
            provider,
            config: verificationConfig
        });
        return verificationResult;
    }
    catch (error) {
        console.error(`💥 链条验证失败:`, error.message);
        throw new chainMinting_1.ChainMintingError(chainMinting_1.ChainMintingErrorType.VERIFICATION_ERROR, `链条验证失败: ${error.message}`, { parentTxId, childTxIds, contractId, finalReceiverAddress });
    }
}
exports.verifyExistingChain = verifyExistingChain;
//# sourceMappingURL=transactionBuilder.js.map