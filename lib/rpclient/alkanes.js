"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlkanesRpc = exports.unmapFromPrimitives = exports.mapToPrimitives = exports.stripHexPrefix = exports.metashrew = exports.MetashrewOverride = void 0;
const tslib_1 = require("tslib");
const tiny_async_pool_1 = tslib_1.__importDefault(require("tiny-async-pool"));
const esplora_1 = require("./esplora");
const alkanes_rpc = tslib_1.__importStar(require("alkanes/lib/rpc"));
const utils_1 = require("../amm/utils");
const pool_1 = require("../amm/pool");
class MetashrewOverride {
    override;
    constructor() {
        this.override = null;
    }
    set(v) {
        this.override = v;
    }
    exists() {
        return this.override !== null;
    }
    get() {
        return this.override;
    }
}
exports.MetashrewOverride = MetashrewOverride;
exports.metashrew = new MetashrewOverride();
const stripHexPrefix = (s) => s.substr(0, 2) === '0x' ? s.substr(2) : s;
exports.stripHexPrefix = stripHexPrefix;
let id = 0;
// Helper function to convert BigInt values to hex strings for JSON serialization
function mapToPrimitives(v) {
    switch (typeof v) {
        case 'bigint':
            return '0x' + v.toString(16);
        case 'object':
            if (v === null)
                return null;
            if (Buffer.isBuffer(v))
                return '0x' + v.toString('hex');
            if (Array.isArray(v))
                return v.map((v) => mapToPrimitives(v));
            return Object.fromEntries(Object.entries(v).map(([key, value]) => [key, mapToPrimitives(value)]));
        default:
            return v;
    }
}
exports.mapToPrimitives = mapToPrimitives;
// Helper function to convert hex strings back to BigInt values
function unmapFromPrimitives(v) {
    switch (typeof v) {
        case 'string':
            if (v !== '0x' && !isNaN(v))
                return BigInt(v);
            if (v.substr(0, 2) === '0x' || /^[0-9a-f]+$/.test(v))
                return Buffer.from((0, exports.stripHexPrefix)(v), 'hex');
            return v;
        case 'object':
            if (v === null)
                return null;
            if (Array.isArray(v))
                return v.map((item) => unmapFromPrimitives(item));
            return Object.fromEntries(Object.entries(v).map(([key, value]) => [
                key,
                unmapFromPrimitives(value),
            ]));
        default:
            return v;
    }
}
exports.unmapFromPrimitives = unmapFromPrimitives;
const opcodes = ['99', '100', '101', '102', '103', '104', '1000'];
const opcodesHRV = [
    'name',
    'symbol',
    'totalSupply',
    'cap',
    'minted',
    'mintAmount',
    'data',
];
class AlkanesRpc {
    alkanesUrl;
    esplora;
    constructor(url) {
        this.alkanesUrl = url;
        this.esplora = new esplora_1.EsploraRpc(url);
    }
    async _metashrewCall(method, params = []) {
        const rpc = new alkanes_rpc.AlkanesRpc({ baseUrl: exports.metashrew.get() });
        return mapToPrimitives(await rpc[method.split('_')[1]](unmapFromPrimitives(params[0] || {})));
    }
    async _call(method, params = []) {
        if (exports.metashrew.get() !== null && method.match('alkanes_')) {
            return await this._metashrewCall(method, params);
        }
        const requestData = {
            jsonrpc: '2.0',
            method: method,
            params: params,
            id: id++,
        };
        const requestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
            cache: 'no-cache',
        };
        try {
            const response = await fetch(this.alkanesUrl, requestOptions);
            const responseData = await response.json();
            if (responseData.error)
                throw new Error(responseData.error.message);
            return responseData.result;
        }
        catch (error) {
            if (error.name === 'AbortError') {
                console.error('Request Timeout:', error);
                throw new Error('Request timed out');
            }
            throw error;
        }
    }
    async metashrewHeight() {
        return (await this._call('metashrew_height', []));
    }
    async getAlkanesByHeight({ height, protocolTag = '1', }) {
        return (await this._call('alkanes_protorunesbyheight', [
            {
                height,
                protocolTag,
            },
        ]));
    }
    async getAlkanesByAddress({ address, protocolTag = '1', name, }) {
        try {
            const ret = await this._call('alkanes_protorunesbyaddress', [
                {
                    address,
                    protocolTag,
                },
            ]);
            const alkanesList = ret.outpoints
                .filter((outpoint) => outpoint.runes.length > 0)
                .map((outpoint) => ({
                ...outpoint,
                outpoint: {
                    vout: outpoint.outpoint.vout,
                    txid: Buffer.from(outpoint.outpoint.txid, 'hex')
                        .reverse()
                        .toString('hex'),
                },
                runes: outpoint.runes.map((rune) => ({
                    ...rune,
                    balance: parseInt(rune.balance, 16).toString(),
                    rune: {
                        ...rune.rune,
                        id: {
                            block: parseInt(rune.rune.id.block, 16).toString(),
                            tx: parseInt(rune.rune.id.tx, 16).toString(),
                        },
                    },
                })),
            }));
            if (name) {
                return alkanesList.flatMap((outpoints) => outpoints.runes.filter((item) => item.rune.name === name));
            }
            return alkanesList;
        }
        catch (error) {
            console.error('Error in getAlkanesByAddress:', error);
            throw error;
        }
    }
    async trace(request) {
        request.txid = Buffer.from(request.txid, 'hex').reverse().toString('hex');
        const ret = await this._call('alkanes_trace', [request]);
        return await ret;
    }
    parsePoolInfo(hexData) {
        function parseLittleEndian(hexString) {
            // Remove the "0x" prefix if present
            if (hexString.startsWith('0x')) {
                hexString = hexString.slice(2);
            }
            // Ensure the input length is a multiple of 32 hex chars (128-bit each)
            if (hexString.length % 32 !== 0) {
                throw new Error('Invalid hex length. Expected multiples of 128-bit (32 hex chars).');
            }
            // Function to convert a single 128-bit segment
            const convertSegment = (segment) => {
                const littleEndianHex = segment.match(/.{2}/g)?.reverse()?.join('');
                if (!littleEndianHex) {
                    throw new Error('Failed to process hex segment.');
                }
                return BigInt('0x' + littleEndianHex);
            };
            // Split into 128-bit (32 hex character) chunks
            const chunks = hexString.match(/.{32}/g) || [];
            const parsedValues = chunks.map(convertSegment);
            return parsedValues.map((num) => num.toString());
        }
        // Parse the data
        const parsedData = parseLittleEndian(hexData);
        return {
            tokenA: {
                block: parsedData[0],
                tx: parsedData[1],
            },
            tokenB: {
                block: parsedData[2],
                tx: parsedData[3],
            },
            reserveA: parsedData[4],
            reserveB: parsedData[5],
        };
    }
    async simulate(request, decoder) {
        const ret = await this._call('alkanes_simulate', [
            {
                alkanes: [],
                transaction: '0x',
                block: '0x',
                height: '20000',
                txindex: 0,
                inputs: [],
                pointer: 0,
                refundPointer: 0,
                vout: 0,
                ...request,
            },
        ]);
        if (decoder) {
            const operationType = Number(request.inputs[0]);
            ret.parsed = decoder(ret, operationType);
        }
        else {
            ret.parsed = this.parseSimulateReturn(ret.execution.data);
        }
        return ret;
    }
    async simulatePoolInfo(request) {
        const ret = await this._call('alkanes_simulate', [request]);
        const parsedPool = this.parsePoolInfo(ret.execution.data);
        ret.parsed = parsedPool;
        return ret;
    }
    /**
     * Previews the tokens that would be received when removing liquidity from a pool
     * @param token The LP token ID
     * @param tokenAmount The amount of LP tokens to remove
     * @returns A promise that resolves to the preview result containing token amounts
     */
    async previewRemoveLiquidity({ token, tokenAmount, }) {
        const poolDetailsRequest = {
            target: token,
            inputs: [utils_1.PoolOpcodes.POOL_DETAILS.toString()],
        };
        const detailsResult = await this.simulate(poolDetailsRequest);
        const decoder = new pool_1.AlkanesAMMPoolDecoder();
        const poolDetails = decoder.decodePoolDetails(detailsResult.execution.data);
        if (!poolDetails) {
            throw new Error('Failed to get pool details');
        }
        return (0, utils_1.estimateRemoveLiquidityAmounts)(poolDetails, tokenAmount);
    }
    async getAlkanesByOutpoint({ txid, vout, protocolTag = '1', height = 'latest', }) {
        const alkaneList = await this._call('alkanes_protorunesbyoutpoint', [
            {
                txid: Buffer.from(txid, 'hex').reverse().toString('hex'),
                vout,
                protocolTag,
            },
            height,
        ]);
        return alkaneList.map((outpoint) => ({
            ...outpoint,
            token: {
                ...outpoint.token,
                id: {
                    block: parseInt(outpoint.token.id.block, 16).toString(),
                    tx: parseInt(outpoint.token.id.tx, 16).toString(),
                },
            },
            value: parseInt(outpoint.value, 16).toString(),
        }));
    }
    async getAlkaneById({ block, tx, }) {
        const alkaneData = {
            name: '',
            mintActive: false,
            percentageMinted: 0,
            symbol: '',
            totalSupply: 0,
            cap: 0,
            minted: 0,
            mintAmount: 0,
        };
        for (let j = 0; j < opcodes.length; j++) {
            try {
                const result = await this.simulate({
                    target: { block, tx },
                    alkanes: [],
                    transaction: '0x',
                    block: '0x',
                    height: '20000',
                    txindex: 0,
                    inputs: [opcodes[j]],
                    pointer: 0,
                    refundPointer: 0,
                    vout: 0,
                });
                if (result.status === 0) {
                    alkaneData[opcodesHRV[j]] = Number(result.parsed?.le || 0);
                    if (opcodesHRV[j] === 'name' ||
                        opcodesHRV[j] === 'symbol' ||
                        opcodesHRV[j] === 'data') {
                        alkaneData[opcodesHRV[j]] = result.parsed?.string || '';
                    }
                    alkaneData.mintActive =
                        Number(alkaneData.minted) < Number(alkaneData.cap);
                    alkaneData.percentageMinted = Math.floor((alkaneData.minted / alkaneData.cap) * 100);
                }
            }
            catch (error) {
                console.log(error);
            }
        }
        return alkaneData;
    }
    async getAlkanes({ limit, offset = 0, }) {
        if (limit > 1000) {
            throw new Error('Max limit reached. Request fewer than 1000 alkanes per call');
        }
        const indices = Array.from({ length: limit }, (_, i) => (i + Number(offset)).toString());
        const processAlkane = async (index) => {
            const alkaneData = {
                id: {
                    block: '2',
                    tx: index,
                },
            };
            let hasValidResult = false;
            const validOpcodes = opcodes.filter((opcode) => opcode !== undefined);
            try {
                const opcodeResults = await Promise.all(validOpcodes.map(async (opcode, opcodeIndex) => {
                    if (!opcode)
                        return null;
                    try {
                        const result = await this.simulate({
                            target: { block: '2', tx: index },
                            alkanes: [],
                            transaction: '0x',
                            block: '0x',
                            height: '20000',
                            txindex: 0,
                            inputs: [opcode],
                            pointer: 0,
                            refundPointer: 0,
                            vout: 0,
                        });
                        if (result?.status === 0) {
                            return {
                                opcode,
                                result,
                                opcodeIndex,
                                opcodeHRV: opcodesHRV[opcodeIndex],
                            };
                        }
                    }
                    catch (error) {
                        return null;
                    }
                }));
                const validResults = opcodeResults.filter((item) => {
                    return (item !== null &&
                        item !== undefined &&
                        item.opcodeHRV !== undefined);
                });
                validResults.forEach(({ result, opcodeHRV }) => {
                    if (!opcodeHRV)
                        return;
                    if (['name', 'symbol', 'data'].includes(opcodeHRV)) {
                        alkaneData[opcodeHRV] = result.parsed?.string || '';
                    }
                    else {
                        alkaneData[opcodeHRV] = Number(result.parsed?.le || 0);
                    }
                    hasValidResult = true;
                });
                if (hasValidResult) {
                    alkaneData.mintActive =
                        Number(alkaneData.minted || 0) < Number(alkaneData.cap || 0);
                    alkaneData.percentageMinted = Math.floor(((alkaneData.minted || 0) / (alkaneData.cap || 1)) * 100);
                    return alkaneData;
                }
            }
            catch (error) {
                console.log(`Error processing alkane at index ${index}:`, error);
                return null;
            }
            return null;
        };
        const results = [];
        for await (const result of (0, tiny_async_pool_1.default)(10, indices, processAlkane)) {
            if (result !== null) {
                results.push(result);
            }
        }
        return results;
    }
    async meta(request, decoder) {
        const ret = await this._call('alkanes_meta', [
            {
                alkanes: [],
                transaction: '0x',
                block: '0x',
                height: '0x',
                txindex: 0,
                inputs: [],
                pointer: 0,
                refundPointer: 0,
                vout: 0,
                ...request,
            },
        ]);
        return ret;
    }
    parseSimulateReturn(v) {
        if (v === '0x') {
            return undefined;
        }
        const stripHexPrefix = (v) => (v.startsWith('0x') ? v.slice(2) : v);
        const addHexPrefix = (v) => '0x' + stripHexPrefix(v);
        let decodedString;
        try {
            decodedString = Buffer.from(stripHexPrefix(v), 'hex').toString('utf8');
            if (/[\uFFFD]/.test(decodedString)) {
                throw new Error('Invalid UTF-8 string');
            }
        }
        catch (err) {
            decodedString = addHexPrefix(v);
        }
        return {
            string: decodedString,
            bytes: addHexPrefix(v),
            le: BigInt(addHexPrefix(Buffer.from(Array.from(Buffer.from(stripHexPrefix(v), 'hex')).reverse()).toString('hex'))).toString(),
            be: BigInt(addHexPrefix(v)).toString(),
        };
    }
    async getAlkaneByIdMeta({ block, tx, dataOnly = false, }) {
        // First get the meta information
        const metaResult = await this.meta({
            target: { block, tx },
            alkanes: [],
            transaction: '0x',
            block: '0x',
            height: '20000',
            txindex: 0,
            inputs: [],
            pointer: 0,
            refundPointer: 0,
            vout: 0,
        });
        if (!metaResult || !metaResult.methods) {
            return dataOnly ? { data: { id: { block, tx } } } : {
                meta: null,
                simulationResults: null,
                data: { id: { block, tx } }
            };
        }
        // Get all opcodes from the methods
        const opcodes = metaResult.methods.map(method => method.opcode);
        // Simulate each opcode
        const simulationResults = {};
        const parsedResults = {};
        // Process methods sequentially
        for (const method of metaResult.methods) {
            try {
                const result = await this.simulate({
                    target: { block, tx },
                    alkanes: [],
                    transaction: '0x',
                    block: '0x',
                    height: '20000',
                    txindex: 0,
                    inputs: [method.opcode.toString()],
                    pointer: 0,
                    refundPointer: 0,
                    vout: 0,
                });
                simulationResults[method.opcode] = result;
                // Parse the result based on the return type
                if (result.status === 0 && result.execution.error === null) {
                    switch (method.returns) {
                        case 'String':
                            parsedResults[method.name] = result.parsed?.string || '';
                            break;
                        case 'u128':
                            parsedResults[method.name] = (result.parsed?.le || 0).toString();
                            break;
                        case 'Vec<u8>':
                            if (method.name === 'pool_details') {
                                // Parse pool details into a structured format
                                const data = result.parsed?.bytes || '0x';
                                if (data !== '0x') {
                                    const decoder = new pool_1.AlkanesAMMPoolDecoder();
                                    parsedResults[method.name] = decoder.decodePoolDetails(data);
                                }
                                else {
                                    parsedResults[method.name] = null;
                                }
                            }
                            else {
                                parsedResults[method.name] = result.parsed?.bytes || '0x';
                            }
                            break;
                        case 'u128, u128':
                            // Parse tuple of two u128 values
                            const data = result.parsed?.bytes || '0x';
                            if (data !== '0x') {
                                const buffer = Buffer.from(data.slice(2), 'hex');
                                // Check if the data is 32 bytes (normal) or 64 bytes (shifted)
                                if (buffer.length === 32) {
                                    // Normal case: two 16-byte numbers
                                    const firstValue = BigInt('0x' + Buffer.from(buffer.subarray(0, 16)).reverse().toString('hex')).toString();
                                    const secondValue = BigInt('0x' + Buffer.from(buffer.subarray(16, 32)).reverse().toString('hex')).toString();
                                    parsedResults[method.name] = [firstValue, secondValue];
                                }
                                else if (buffer.length === 64) {
                                    // Shifted case: two 32-byte numbers
                                    const firstValue = BigInt('0x' + Buffer.from(buffer.subarray(0, 32)).reverse().toString('hex')).toString();
                                    const secondValue = BigInt('0x' + Buffer.from(buffer.subarray(32, 64)).reverse().toString('hex')).toString();
                                    parsedResults[method.name] = [firstValue, secondValue];
                                }
                                else {
                                    // Fallback to using the parsed le value if buffer length is unexpected
                                    const leValue = result.parsed?.le || '0';
                                    parsedResults[method.name] = [leValue, '0'];
                                }
                            }
                            else {
                                parsedResults[method.name] = [null, null];
                            }
                            break;
                        case 'void':
                            parsedResults[method.name] = null;
                            break;
                        default:
                            parsedResults[method.name] = result.parsed;
                    }
                }
                else {
                    parsedResults[method.name] = null;
                }
            }
            catch (error) {
                simulationResults[method.opcode] = null;
                parsedResults[method.name] = null;
            }
        }
        return dataOnly ? { data: { id: { block, tx }, ...parsedResults } } : {
            meta: metaResult,
            simulationResults,
            data: { id: { block, tx }, ...parsedResults }
        };
    }
    /**
     * Get alkanes meta data
     * @param limit - The number of alkanes to get
     * @param offset - The offset to start from
     * @param dataOnly - FALSE returns the meta data and simulation results
     * @returns The meta data for the alkanes
     */
    async getAlkanesMeta({ block = '2', limit = 10, offset = 0, dataOnly = true, }) {
        const MAX_LIMIT = 100;
        if (limit > MAX_LIMIT) {
            throw new Error(`Max limit of ${MAX_LIMIT} alkanes per call`);
        }
        const indices = Array.from({ length: limit }, (_, i) => (i + Number(offset)).toString());
        const results = [];
        for (const index of indices) {
            try {
                const result = await this.getAlkaneByIdMeta({
                    block,
                    tx: index,
                    dataOnly: true
                });
                if (!result?.data) {
                    results.push({ id: { block, tx: index } });
                    continue;
                }
                results.push({
                    id: { block, tx: index },
                    ...result.data
                });
            }
            catch (error) {
                results.push({ id: { block, tx: index } });
            }
        }
        results.sort((a, b) => {
            const blockA = parseInt(a.id.block);
            const blockB = parseInt(b.id.block);
            if (blockA !== blockB) {
                return blockA - blockB;
            }
            return parseInt(a.id.tx) - parseInt(b.id.tx);
        });
        return dataOnly ? { data: results } : {
            meta: null,
            simulationResults: null,
            data: results
        };
    }
}
exports.AlkanesRpc = AlkanesRpc;
//# sourceMappingURL=alkanes.js.map