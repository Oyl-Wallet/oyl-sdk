"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.swap = exports.swapPsbt = exports.removeLiquidity = exports.removeLiquidityPsbt = exports.previewRemoveLiquidity = exports.addLiquidity = exports.addLiquidityPsbt = exports.AlkanesAMMPoolDecoder = void 0;
const bytes_1 = require("alkanes/lib/bytes");
const proto_runestone_upgrade_1 = require("alkanes/lib/protorune/proto_runestone_upgrade");
const protostone_1 = require("alkanes/lib/protorune/protostone");
const __1 = require("..");
const alkanes_1 = require("../alkanes");
const integer_1 = require("@magiceden-oss/runestone-lib/dist/src/integer");
const protoruneruneid_1 = require("alkanes/lib/protorune/protoruneruneid");
const factory_1 = require("./factory");
const utils_1 = require("./utils");
class AlkanesAMMPoolDecoder {
    decodeSwap(data) {
        if (data === '0x')
            return undefined;
        // Convert hex to BigInt (little-endian)
        const bytes = Buffer.from(data.slice(2), 'hex');
        const reversed = Buffer.from([...bytes].reverse());
        return {
            amountOut: BigInt('0x' + reversed.toString('hex')),
        };
    }
    decodePoolDetails(data) {
        if (data === '0x')
            return undefined;
        const bytes = Buffer.from(data.slice(2), 'hex');
        const token0 = {
            block: bytes.readBigUInt64LE(0).toString(),
            tx: bytes.readBigUInt64LE(16).toString(),
        };
        const token1 = {
            block: bytes.readBigUInt64LE(32).toString(),
            tx: bytes.readBigUInt64LE(48).toString(),
        };
        const token0Amount = bytes.readBigUInt64LE(64).toString();
        const token1Amount = bytes.readBigUInt64LE(80).toString();
        const tokenSupply = bytes.readBigUInt64LE(96).toString();
        const poolName = Buffer.from(bytes.subarray(116)).toString('utf8');
        return { token0, token1, token0Amount, token1Amount, tokenSupply, poolName };
    }
    decodeName(data) {
        if (data === '0x')
            return undefined;
        const bytes = Buffer.from(data.slice(2), 'hex');
        return bytes.toString('utf8');
    }
    static decodeSimulation(result, opcode) {
        const decoder = new AlkanesAMMPoolDecoder();
        let decoded;
        switch (opcode) {
            case utils_1.PoolOpcodes.INIT_POOL:
            case utils_1.PoolOpcodes.ADD_LIQUIDITY:
            case utils_1.PoolOpcodes.REMOVE_LIQUIDITY:
                throw new Error('Opcode not supported in simulation mode; see previewRemoveLiquidity');
            case utils_1.PoolOpcodes.SIMULATE_SWAP:
                decoded = decoder.decodeSwap(result.execution.data);
                break;
            case utils_1.PoolOpcodes.NAME:
                decoded = decoder.decodeName(result.execution.data);
                break;
            case utils_1.PoolOpcodes.POOL_DETAILS:
                decoded = decoder.decodePoolDetails(result.execution.data);
                break;
            default:
                decoded = undefined;
        }
        if (result.status !== 0 || result.execution.error) {
            throw new Error(result.execution.error || 'Unknown error');
        }
        return decoded;
    }
}
exports.AlkanesAMMPoolDecoder = AlkanesAMMPoolDecoder;
const addLiquidityPsbt = async ({ calldata, token0, token0Amount, token1, token1Amount, gatheredUtxos, feeRate, account, provider, }) => {
    const tokens = [
        { alkaneId: token0, amount: token0Amount },
        { alkaneId: token1, amount: token1Amount },
    ];
    const { edicts, alkaneUtxos, totalSatoshis } = await (0, factory_1.splitAlkaneUtxos)(tokens, account, provider);
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
    const { psbt, fee } = await __1.alkanes.executePsbt({
        alkaneUtxos: { alkaneUtxos, totalSatoshis },
        protostone,
        gatheredUtxos,
        feeRate,
        account,
        provider,
    });
    return { psbt, fee };
};
exports.addLiquidityPsbt = addLiquidityPsbt;
const addLiquidity = async ({ calldata, token0, token0Amount, token1, token1Amount, gatheredUtxos, feeRate, account, signer, provider, }) => {
    const { psbt } = await (0, exports.addLiquidityPsbt)({
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
exports.addLiquidity = addLiquidity;
/**
 * Estimates the tokens that would be received when removing liquidity from a pool
 * @param token The LP token ID
 * @param tokenAmount The amount of LP tokens to remove
 * @param provider The provider instance
 * @returns A promise that resolves to the preview result containing token amounts
 */
const previewRemoveLiquidity = async ({ token, tokenAmount, provider, }) => {
    const poolDetailsRequest = {
        target: token,
        inputs: [utils_1.PoolOpcodes.POOL_DETAILS.toString()],
    };
    const detailsResult = await provider.alkanes.simulate(poolDetailsRequest);
    const decoder = new AlkanesAMMPoolDecoder();
    const poolDetails = decoder.decodePoolDetails(detailsResult.execution.data);
    if (!poolDetails) {
        throw new Error('Failed to get pool details');
    }
    return (0, utils_1.estimateRemoveLiquidityAmounts)(poolDetails, tokenAmount);
};
exports.previewRemoveLiquidity = previewRemoveLiquidity;
const removeLiquidityPsbt = async ({ calldata, token, tokenAmount, gatheredUtxos, feeRate, account, provider, }) => {
    let alkaneTokenUtxos;
    const tokenUtxos = await Promise.all([
        (0, alkanes_1.findAlkaneUtxos)({
            address: account.taproot.address,
            greatestToLeast: false,
            provider,
            targetNumberOfAlkanes: Number(tokenAmount),
            alkaneId: token,
        }),
    ]);
    alkaneTokenUtxos = {
        alkaneUtxos: tokenUtxos[0].alkaneUtxos,
        totalSatoshis: tokenUtxos[0].totalSatoshis,
    };
    const edicts = [
        {
            id: new protoruneruneid_1.ProtoruneRuneId((0, integer_1.u128)(BigInt(token.block)), (0, integer_1.u128)(BigInt(token.tx))),
            amount: (0, integer_1.u128)(tokenAmount),
            output: (0, integer_1.u32)(5),
        },
    ];
    const protostone = (0, proto_runestone_upgrade_1.encodeRunestoneProtostone)({
        protostones: [
            protostone_1.ProtoStone.message({
                protocolTag: 1n,
                edicts,
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
    const { psbt } = await __1.alkanes.executePsbt({
        alkaneUtxos: alkaneTokenUtxos,
        protostone,
        gatheredUtxos,
        feeRate,
        account,
        provider,
    });
    return { psbt };
};
exports.removeLiquidityPsbt = removeLiquidityPsbt;
const removeLiquidity = async ({ calldata, token, tokenAmount, gatheredUtxos, feeRate, account, signer, provider, }) => {
    const { psbt } = await (0, exports.removeLiquidityPsbt)({
        calldata,
        token,
        tokenAmount,
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
exports.removeLiquidity = removeLiquidity;
const swapPsbt = async ({ calldata, token, tokenAmount, gatheredUtxos, feeRate, account, provider, }) => {
    let alkaneTokenUtxos;
    const tokenUtxos = await Promise.all([
        (0, alkanes_1.findAlkaneUtxos)({
            address: account.taproot.address,
            greatestToLeast: false,
            provider,
            targetNumberOfAlkanes: Number(tokenAmount),
            alkaneId: token,
        }),
    ]);
    alkaneTokenUtxos = {
        alkaneUtxos: tokenUtxos[0].alkaneUtxos,
        totalSatoshis: tokenUtxos[0].totalSatoshis,
    };
    const edicts = [
        {
            id: new protoruneruneid_1.ProtoruneRuneId((0, integer_1.u128)(BigInt(token.block)), (0, integer_1.u128)(BigInt(token.tx))),
            amount: (0, integer_1.u128)(tokenAmount),
            output: (0, integer_1.u32)(5),
        },
    ];
    const protostone = (0, proto_runestone_upgrade_1.encodeRunestoneProtostone)({
        protostones: [
            protostone_1.ProtoStone.message({
                protocolTag: 1n,
                edicts,
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
    const { psbt } = await __1.alkanes.executePsbt({
        alkaneUtxos: alkaneTokenUtxos,
        protostone,
        gatheredUtxos,
        feeRate,
        account,
        provider,
    });
    return { psbt };
};
exports.swapPsbt = swapPsbt;
const swap = async ({ calldata, token, tokenAmount, gatheredUtxos, feeRate, account, signer, provider, }) => {
    const { psbt } = await (0, exports.swapPsbt)({
        calldata,
        token,
        tokenAmount,
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
exports.swap = swap;
//# sourceMappingURL=pool.js.map