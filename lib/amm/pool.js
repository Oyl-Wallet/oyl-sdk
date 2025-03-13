"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.swap = exports.swapPsbt = exports.removeLiquidity = exports.removeLiquidityPsbt = exports.addLiquidity = exports.addLiquidityPsbt = exports.AlkanesAMMPoolDecoder = exports.PoolOpcodes = void 0;
const bytes_1 = require("alkanes/lib/bytes");
const proto_runestone_upgrade_1 = require("alkanes/lib/protorune/proto_runestone_upgrade");
const protostone_1 = require("alkanes/lib/protorune/protostone");
const __1 = require("..");
const alkanes_1 = require("../alkanes");
const integer_1 = require("@magiceden-oss/runestone-lib/dist/src/integer");
const protoruneruneid_1 = require("alkanes/lib/protorune/protoruneruneid");
const factory_1 = require("./factory");
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
            case PoolOpcodes.INIT_POOL:
            case PoolOpcodes.ADD_LIQUIDITY:
            case PoolOpcodes.REMOVE_LIQUIDITY:
                throw new Error('Opcode not supported in simulation mode');
            case PoolOpcodes.SIMULATE_SWAP:
                decoded = decoder.decodeSwap(result.execution.data);
                break;
            case PoolOpcodes.NAME:
                decoded = decoder.decodeName(result.execution.data);
                break;
            case PoolOpcodes.POOL_DETAILS:
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
            output: (0, integer_1.u32)(4),
        },
    ];
    const protostone = (0, proto_runestone_upgrade_1.encodeRunestoneProtostone)({
        protostones: [
            protostone_1.ProtoStone.message({
                protocolTag: 1n,
                edicts,
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
            output: (0, integer_1.u32)(4),
        },
    ];
    const protostone = (0, proto_runestone_upgrade_1.encodeRunestoneProtostone)({
        protostones: [
            protostone_1.ProtoStone.message({
                protocolTag: 1n,
                edicts,
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