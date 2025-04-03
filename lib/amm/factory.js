"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.poolPsbt = exports.splitAlkaneUtxos = exports.createNewPool = exports.createNewPoolPsbt = exports.getPoolId = exports.AlkanesAMMPoolFactoryDecoder = exports.parseAlkaneIdFromHex = exports.PoolFactoryOpcodes = void 0;
const tslib_1 = require("tslib");
const alkanes_1 = require("../alkanes/alkanes");
const u128_1 = require("@magiceden-oss/runestone-lib/dist/src/integer/u128");
const u32_1 = require("@magiceden-oss/runestone-lib/dist/src/integer/u32");
const bytes_1 = require("alkanes/lib/bytes");
const proto_runestone_upgrade_1 = require("alkanes/lib/protorune/proto_runestone_upgrade");
const protoruneruneid_1 = require("alkanes/lib/protorune/protoruneruneid");
const protostone_1 = require("alkanes/lib/protorune/protostone");
const __1 = require("..");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const psbt_1 = require("../psbt");
const btc_1 = require("../btc");
const pool_1 = require("./pool");
const utils_1 = require("./utils");
var PoolFactoryOpcodes;
(function (PoolFactoryOpcodes) {
    PoolFactoryOpcodes[PoolFactoryOpcodes["INIT_POOL"] = 0] = "INIT_POOL";
    PoolFactoryOpcodes[PoolFactoryOpcodes["CREATE_NEW_POOL"] = 1] = "CREATE_NEW_POOL";
    PoolFactoryOpcodes[PoolFactoryOpcodes["FIND_EXISTING_POOL_ID"] = 2] = "FIND_EXISTING_POOL_ID";
    PoolFactoryOpcodes[PoolFactoryOpcodes["GET_ALL_POOLS"] = 3] = "GET_ALL_POOLS";
})(PoolFactoryOpcodes = exports.PoolFactoryOpcodes || (exports.PoolFactoryOpcodes = {}));
const parseAlkaneIdFromHex = (hex) => {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const blockHex = cleanHex.slice(0, 32);
    const txHex = cleanHex.slice(32);
    const reversedBlockHex = Buffer.from(blockHex, 'hex')
        .reverse()
        .toString('hex');
    const reversedTxHex = Buffer.from(txHex, 'hex').reverse().toString('hex');
    const block = parseInt(reversedBlockHex, 16).toString();
    const tx = parseInt(reversedTxHex, 16).toString();
    return { block, tx };
};
exports.parseAlkaneIdFromHex = parseAlkaneIdFromHex;
class AlkanesAMMPoolFactoryDecoder {
    decodeCreateNewPool(execution) {
        if (!execution?.alkanes?.[0]?.u?.[1]?.[0] ||
            !execution?.alkanes?.[0]?.u?.[0]) {
            return undefined;
        }
        return {
            lpTokens: execution.alkanes[0].u[1][0].toString(),
            alkaneId: {
                block: execution.alkanes[0].u[0][0][0],
                tx: execution.alkanes[0].u[0][1][0],
            },
        };
    }
    decodeFindExistingPoolId(execution) {
        if (!execution?.data || execution.data === '0x') {
            return undefined;
        }
        const bytes = (0, exports.parseAlkaneIdFromHex)(execution.data);
        return {
            alkaneId: {
                block: bytes.block.toString(),
                tx: bytes.tx.toString(),
            },
        };
    }
    decodeGetAllPools(execution) {
        if (!execution?.data || execution.data === '0x') {
            return undefined;
        }
        const data = execution.data.startsWith('0x')
            ? execution.data.slice(2)
            : execution.data;
        const countBytes = Buffer.from(data.slice(0, 32), 'hex');
        const count = parseInt(countBytes.reverse().toString('hex'), 16);
        const pools = [];
        for (let i = 0; i < count; i++) {
            const offset = 32 + i * 64;
            const blockBytes = Buffer.from(data.slice(offset, offset + 32), 'hex');
            const block = parseInt(blockBytes.reverse().toString('hex'), 16).toString();
            const txBytes = Buffer.from(data.slice(offset + 32, offset + 64), 'hex');
            const tx = parseInt(txBytes.reverse().toString('hex'), 16).toString();
            pools.push({ block, tx });
        }
        return { count, pools };
    }
    async decodeAllPoolsDetails(factoryExecution, provider) {
        // Get all pool IDs
        const allPools = this.decodeGetAllPools(factoryExecution);
        if (!allPools)
            return undefined;
        const poolDecoder = new pool_1.AlkanesAMMPoolDecoder();
        const poolsWithDetails = [];
        // For each pool ID, simulate a call to get its details
        for (const poolId of allPools.pools) {
            const request = {
                alkanes: [],
                transaction: '0x',
                block: '0x',
                height: '20000',
                txindex: 0,
                target: poolId,
                inputs: [utils_1.PoolOpcodes.POOL_DETAILS.toString()],
                pointer: 0,
                refundPointer: 0,
                vout: 0,
            };
            try {
                const result = await provider.alkanes.simulate(request);
                const poolDetails = poolDecoder.decodePoolDetails(result.execution.data);
                if (poolDetails) {
                    poolsWithDetails.push({
                        ...poolDetails,
                        poolId,
                    });
                }
            }
            catch (error) {
                console.error(`Error getting details for pool ${poolId.block}:${poolId.tx}:`, error);
            }
        }
        return {
            count: poolsWithDetails.length,
            pools: poolsWithDetails,
        };
    }
    static decodeSimulation(result, opcode) {
        if (!result || typeof result.status === 'undefined') {
            return {
                success: false,
                error: 'Invalid simulation result',
                gasUsed: 0,
            };
        }
        const decoder = new AlkanesAMMPoolFactoryDecoder();
        let decoded;
        switch (opcode) {
            case PoolFactoryOpcodes.INIT_POOL:
                // Not implemented
                break;
            case PoolFactoryOpcodes.CREATE_NEW_POOL:
                decoded = decoder.decodeCreateNewPool(result.execution);
                break;
            case PoolFactoryOpcodes.FIND_EXISTING_POOL_ID:
                decoded = decoder.decodeFindExistingPoolId(result.execution);
                break;
            case PoolFactoryOpcodes.GET_ALL_POOLS:
                decoded = decoder.decodeGetAllPools(result.execution);
                break;
            default:
                decoded = undefined;
        }
        return decoded;
    }
}
exports.AlkanesAMMPoolFactoryDecoder = AlkanesAMMPoolFactoryDecoder;
const getPoolId = async () => { };
exports.getPoolId = getPoolId;
const createNewPoolPsbt = async ({ calldata, token0, token0Amount, token1, token1Amount, gatheredUtxos, feeRate, account, provider, }) => {
    const tokens = [
        { alkaneId: token0, amount: token0Amount },
        { alkaneId: token1, amount: token1Amount },
    ];
    const { alkaneUtxos, edicts, totalSatoshis } = await (0, exports.splitAlkaneUtxos)(tokens, account, provider);
    const protostone = (0, proto_runestone_upgrade_1.encodeRunestoneProtostone)({
        protostones: [
            protostone_1.ProtoStone.message({
                edicts,
                protocolTag: 1n,
                pointer: 0,
                refundPointer: 0,
                calldata: (0, bytes_1.encipher)([]),
            }),
            protostone_1.ProtoStone.message({
                protocolTag: 1n,
                pointer: 0,
                refundPointer: 0,
                calldata: (0, bytes_1.encipher)(calldata),
            }),
        ],
    }).encodedRunestone;
    const { psbt } = await (0, exports.poolPsbt)({
        alkaneUtxos: {
            alkaneUtxos: alkaneUtxos,
            totalSatoshis: totalSatoshis,
        },
        protostone,
        gatheredUtxos,
        feeRate,
        account,
        provider,
    });
    const { fee } = await (0, psbt_1.getEstimatedFee)({
        psbt,
        provider,
        feeRate,
    });
    const { psbt: finalPsbt } = await (0, exports.poolPsbt)({
        alkaneUtxos: {
            alkaneUtxos: alkaneUtxos,
            totalSatoshis: totalSatoshis,
        },
        fee,
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
    });
    return { psbt: finalPsbt, fee };
};
exports.createNewPoolPsbt = createNewPoolPsbt;
const createNewPool = async ({ calldata, token0, token0Amount, token1, token1Amount, gatheredUtxos, feeRate, account, signer, provider, }) => {
    const { psbt } = await (0, exports.createNewPoolPsbt)({
        calldata,
        token0,
        token0Amount,
        token1,
        token1Amount,
        gatheredUtxos,
        feeRate,
        account,
        provider,
    });
    const { signedPsbt } = await signer.signAllInputs({
        rawPsbt: psbt,
        finalize: true,
    });
    const pushResult = await provider.pushPsbt({
        psbtBase64: signedPsbt,
    });
    return pushResult;
};
exports.createNewPool = createNewPool;
//@dev we use output 5 for because that is the virtual output for the 2nd protostone. The index count starts after the total number of outputs in the txn.
const splitAlkaneUtxos = async (tokens, account, provider) => {
    let tokenUtxos;
    const allTokenUtxos = await Promise.all(tokens.map(async (token) => {
        return (0, alkanes_1.findAlkaneUtxos)({
            address: account.taproot.address,
            greatestToLeast: false,
            provider,
            targetNumberOfAlkanes: Number(token.amount),
            alkaneId: token.alkaneId,
        });
    }));
    tokenUtxos = {
        alkaneUtxos: allTokenUtxos
            .flatMap((t) => t.alkaneUtxos)
            .filter((utxo, index, self) => index === self.findIndex((u) => u.txId === utxo.txId)),
        totalSatoshis: allTokenUtxos.reduce((acc, t) => acc + t.totalSatoshis, 0),
    };
    const edicts = tokens.flatMap((token) => {
        return [
            {
                id: new protoruneruneid_1.ProtoruneRuneId((0, u128_1.u128)(BigInt(token.alkaneId.block)), (0, u128_1.u128)(BigInt(token.alkaneId.tx))),
                amount: (0, u128_1.u128)(token.amount),
                output: (0, u32_1.u32)(5),
            },
        ];
    });
    const protostone = (0, proto_runestone_upgrade_1.encodeRunestoneProtostone)({
        protostones: [
            protostone_1.ProtoStone.edicts({
                protocolTag: 1n,
                edicts,
            }),
        ],
    }).encodedRunestone;
    return {
        alkaneUtxos: tokenUtxos.alkaneUtxos,
        totalSatoshis: tokenUtxos.totalSatoshis,
        protostone,
        edicts,
    };
};
exports.splitAlkaneUtxos = splitAlkaneUtxos;
const poolPsbt = async ({ alkaneUtxos, gatheredUtxos, account, protostone, provider, feeRate, fee = 0, }) => {
    try {
        const originalGatheredUtxos = gatheredUtxos;
        const minTxSize = (0, btc_1.minimumFee)({
            taprootInputCount: 2,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        let calculatedFee = Math.max(minTxSize * feeRate, 250);
        let finalFee = fee === 0 ? calculatedFee : fee;
        gatheredUtxos = (0, __1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee) + 546);
        let psbt = new bitcoin.Psbt({ network: provider.network });
        if (alkaneUtxos) {
            for await (const utxo of alkaneUtxos.alkaneUtxos) {
                if ((0, __1.getAddressType)(utxo.address) === 0) {
                    const previousTxHex = await provider.esplora.getTxHex(utxo.txId);
                    psbt.addInput({
                        hash: utxo.txId,
                        index: parseInt(utxo.txIndex),
                        nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                    });
                }
                if ((0, __1.getAddressType)(utxo.address) === 2) {
                    const redeemScript = bitcoin.script.compile([
                        bitcoin.opcodes.OP_0,
                        bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
                    ]);
                    psbt.addInput({
                        hash: utxo.txId,
                        index: parseInt(utxo.txIndex),
                        redeemScript: redeemScript,
                        witnessUtxo: {
                            value: utxo.satoshis,
                            script: bitcoin.script.compile([
                                bitcoin.opcodes.OP_HASH160,
                                bitcoin.crypto.hash160(redeemScript),
                                bitcoin.opcodes.OP_EQUAL,
                            ]),
                        },
                    });
                }
                if ((0, __1.getAddressType)(utxo.address) === 1 ||
                    (0, __1.getAddressType)(utxo.address) === 3) {
                    psbt.addInput({
                        hash: utxo.txId,
                        index: parseInt(utxo.txIndex),
                        witnessUtxo: {
                            value: utxo.satoshis,
                            script: Buffer.from(utxo.script, 'hex'),
                        },
                    });
                }
            }
        }
        if (fee === 0 && gatheredUtxos.utxos.length > 1) {
            const txSize = (0, btc_1.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 2,
            });
            finalFee = txSize * feeRate < 250 ? 250 : txSize * feeRate;
            if (gatheredUtxos.totalAmount < finalFee) {
                throw new __1.OylTransactionError(Error('Insufficient Balance'));
            }
        }
        if (gatheredUtxos.totalAmount < finalFee) {
            throw new __1.OylTransactionError(Error('Insufficient Balance'));
        }
        for (let i = 0; i < gatheredUtxos.utxos.length; i++) {
            if ((0, __1.getAddressType)(gatheredUtxos.utxos[i].address) === 0) {
                const previousTxHex = await provider.esplora.getTxHex(gatheredUtxos.utxos[i].txId);
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                });
            }
            if ((0, __1.getAddressType)(gatheredUtxos.utxos[i].address) === 2) {
                const redeemScript = bitcoin.script.compile([
                    bitcoin.opcodes.OP_0,
                    bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
                ]);
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    redeemScript: redeemScript,
                    witnessUtxo: {
                        value: gatheredUtxos.utxos[i].satoshis,
                        script: bitcoin.script.compile([
                            bitcoin.opcodes.OP_HASH160,
                            bitcoin.crypto.hash160(redeemScript),
                            bitcoin.opcodes.OP_EQUAL,
                        ]),
                    },
                });
            }
            if ((0, __1.getAddressType)(gatheredUtxos.utxos[i].address) === 1 ||
                (0, __1.getAddressType)(gatheredUtxos.utxos[i].address) === 3) {
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    witnessUtxo: {
                        value: gatheredUtxos.utxos[i].satoshis,
                        script: Buffer.from(gatheredUtxos.utxos[i].scriptPk, 'hex'),
                    },
                });
            }
        }
        psbt.addOutput({
            address: account.taproot.address,
            value: 546,
        });
        const output = { script: protostone, value: 0 };
        psbt.addOutput(output);
        const changeAmount = gatheredUtxos.totalAmount +
            (alkaneUtxos?.totalSatoshis || 0) -
            finalFee -
            546;
        psbt.addOutput({
            address: account[account.spendStrategy.changeAddress].address,
            value: changeAmount,
        });
        const formattedPsbtTx = await (0, __1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: account.taproot.pubkey,
            network: provider.network,
        });
        return {
            psbt: formattedPsbtTx.toBase64(),
            psbtHex: formattedPsbtTx.toHex(),
        };
    }
    catch (error) {
        throw new __1.OylTransactionError(error);
    }
};
exports.poolPsbt = poolPsbt;
//# sourceMappingURL=factory.js.map