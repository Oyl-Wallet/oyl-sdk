"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEstimatedFee = exports.psbtBuilder = void 0;
const tslib_1 = require("tslib");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const psbtBuilder = async (psbtBuilder, params) => {
    const { psbt } = await psbtBuilder(params);
    const { fee: actualFee } = await (0, exports.getEstimatedFee)({
        feeRate: params.feeRate,
        psbt,
        provider: params.provider
    });
    const { psbt: finalPsbt } = await psbtBuilder({
        ...params,
        fee: actualFee
    });
    const { fee: finalFee, vsize } = await (0, exports.getEstimatedFee)({
        feeRate: params.feeRate,
        psbt: finalPsbt,
        provider: params.provider,
    });
    return { psbt: finalPsbt, fee: finalFee, vsize };
};
exports.psbtBuilder = psbtBuilder;
const detectInputType = (input) => {
    if (input.tapInternalKey || input.tapKeySig || input.tapLeafScript) {
        return "p2tr";
    }
    if (input.witnessUtxo?.script) {
        const scriptLen = input.witnessUtxo.script.length;
        if (scriptLen === 34)
            return "p2tr";
        if (scriptLen === 22)
            return "p2wpkh";
        if (scriptLen === 23)
            return "p2sh";
        if (scriptLen === 25)
            return "p2pkh";
    }
    if (input.redeemScript)
        return "p2sh";
    if (input.witnessScript)
        return "p2wpkh";
    return "p2tr";
};
const getTaprootWitnessSize = (input) => {
    // Base taproot witness size (signature)
    let witnessSize = 16.25; // 65 bytes / 4 (witness discount)
    // If there's a reveal script
    if (input.tapLeafScript && input.tapLeafScript.length > 0) {
        const leafScript = input.tapLeafScript[0];
        // Add control block size (33 bytes + path length) / 4
        witnessSize += (33 + (leafScript.controlBlock.length - 33)) / 4;
        // Add script size / 4
        witnessSize += leafScript.script.length / 4;
        // Add any witness stack items / 4
        if (input.witnessStack) {
            witnessSize += input.witnessStack.reduce((sum, item) => sum + item.length, 0) / 4;
        }
    }
    return witnessSize;
};
const SIZES = {
    p2tr: {
        input: {
            unsigned: 41,
            witness: 16.25,
            getWitnessSize: getTaprootWitnessSize
        },
        output: 43,
    },
    p2wpkh: {
        input: {
            unsigned: 41,
            witness: 26.5,
            getWitnessSize: (input) => 26.5 // Fixed witness size
        },
        output: 31,
    },
    p2sh: {
        input: {
            unsigned: 63,
            witness: 27.75,
            getWitnessSize: (input) => 27.75 // Fixed witness size
        },
        output: 32,
    },
    p2pkh: {
        input: {
            unsigned: 148,
            witness: 0,
            getWitnessSize: (input) => 0 // No witness data
        },
        output: 34,
    },
    // OP_RETURN
    nulldata: {
        output: 9, // Base size
    }
};
const getEstimatedFee = async ({ feeRate, psbt, provider, }) => {
    const psbtObj = bitcoin.Psbt.fromBase64(psbt, { network: provider.network });
    // Base overhead
    const BASE_OVERHEAD = 8; // Version (4) + Locktime (4)
    const SEGWIT_OVERHEAD = 1;
    // VarInt sizes depend on number of inputs/outputs
    const getVarIntSize = (n) => {
        if (n < 0xfd)
            return 1;
        if (n < 0xffff)
            return 3;
        if (n < 0xffffffff)
            return 5;
        return 9;
    };
    // Calculate input sizes
    const inputSizes = psbtObj.data.inputs.map((input) => {
        const type = detectInputType(input);
        const size = SIZES[type].input.unsigned + SIZES[type].input.getWitnessSize(input);
        return size;
    });
    // Calculate output sizes
    const outputSizes = psbtObj.txOutputs.map((output) => {
        // Check if OP_RETURN output
        if (output.script[0] === 0x6a) {
            return output.script.length + SIZES.nulldata.output;
        }
        const scriptType = output.script.length === 34
            ? "p2tr"
            : output.script.length === 22
                ? "p2wpkh"
                : output.script.length === 23
                    ? "p2sh"
                    : "p2pkh";
        return SIZES[scriptType].output;
    });
    const totalInputSize = inputSizes.reduce((sum, size) => sum + size, 0);
    const totalOutputSize = outputSizes.reduce((sum, size) => sum + size, 0);
    const inputVarIntSize = getVarIntSize(inputSizes.length);
    const outputVarIntSize = getVarIntSize(outputSizes.length);
    const vsize = Math.round(BASE_OVERHEAD +
        SEGWIT_OVERHEAD +
        inputVarIntSize +
        outputVarIntSize +
        totalInputSize +
        totalOutputSize);
    const fee = Math.ceil(vsize * feeRate);
    return {
        fee,
        vsize,
    };
};
exports.getEstimatedFee = getEstimatedFee;
//# sourceMappingURL=psbt.js.map