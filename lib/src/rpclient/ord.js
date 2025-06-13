"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdRpc = void 0;
const utils_1 = require("../shared/utils");
class OrdRpc {
    ordUrl;
    constructor(url) {
        this.ordUrl = url;
    }
    async _call(method, params = []) {
        const requestData = {
            jsonrpc: '2.0',
            method: method,
            params: params,
            id: 2,
        };
        const requestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
        };
        try {
            const response = await fetch(this.ordUrl, requestOptions);
            const responseData = await response.json();
            if (responseData.error) {
                console.error('Ord JSON-RPC Error:', responseData.error);
                throw new Error(responseData.error);
            }
            return responseData.result;
        }
        catch (error) {
            if (error.name === 'AbortError') {
                console.error('Request Timeout:', error);
                throw new Error('Request timed out');
            }
            else {
                console.error('Request Error:', error);
                throw error;
            }
        }
    }
    async getInscriptionById(inscriptionId) {
        return await this._call('ord_inscription', [inscriptionId]);
    }
    async getInscriptionContent(inscriptionId) {
        return await this._call('ord_content', [inscriptionId]);
    }
    async getInscriptionByNumber(number) {
        return await this._call('ord_inscription', [number]);
    }
    async getInscriptions(startingNumber) {
        return await this._call('ord_inscriptions', [
            startingNumber ? startingNumber : '',
        ]);
    }
    async getInscriptionsByBlockHash(blockHash) {
        return await this._call('ord_block', [blockHash]);
    }
    async getInscriptionsByBlockHeight(blockHash) {
        return await this._call('ord_block', [blockHash]);
    }
    async getInscriptionBySat(satNumber) {
        return await this._call('ord_r:sat', [satNumber]);
    }
    async getInscriptionBySatWithIndex(satNumber, index) {
        return await this._call('ord_r:sat::at', [satNumber, index]);
    }
    async getInscriptionChildren(inscriptionId, page) {
        return await this._call('ord_r:children', [inscriptionId, page]);
    }
    async getInscriptionMetaData(inscriptionId) {
        const hex = await this._call('ord_r:metadata', [inscriptionId]);
        if (hex.includes('not found')) {
            throw new Error('Inscription metadata not found'); // TODO: Move this to the _call method
        }
        return (0, utils_1.decodeCBOR)(hex);
    }
    async getTxOutput(txIdVout) {
        return await this._call('ord_output', [txIdVout]);
    }
    async getSatByNumber(number) {
        return await this._call('ord_sat', [number]);
    }
    async getSatByDecimal(decimal) {
        return await this._call('ord_sat', [decimal]);
    }
    async getSatByDegree(degree) {
        return await this._call('ord_sat', [degree]);
    }
    async getSatByBase26(base26) {
        return await this._call('ord_sat', [base26]);
    }
    async getSatByPercentage(percentage) {
        return await this._call('ord_sat', [percentage]);
    }
    async getRuneByName(runeName) {
        return await this._call('ord_rune', [runeName]);
    }
    async getRuneById(runeId) {
        return await this._call('ord_rune', [runeId]);
    }
    async getRunes() {
        return await this._call('ord_runes', []);
    }
    async getOrdData(address) {
        return await this._call('ord_address', [address]);
    }
}
exports.OrdRpc = OrdRpc;
//# sourceMappingURL=ord.js.map