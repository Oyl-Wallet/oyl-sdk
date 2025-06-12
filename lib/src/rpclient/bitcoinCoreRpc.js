"use strict";
/**
 * Bitcoin Core RPC 客户端
 *
 * 实现与Bitcoin Core节点的直接RPC通信
 * 支持基础认证和完整的RPC方法集
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BitcoinCoreRpcClient = void 0;
const tslib_1 = require("tslib");
const node_fetch_1 = tslib_1.__importDefault(require("node-fetch"));
/**
 * Bitcoin Core RPC客户端实现
 */
class BitcoinCoreRpcClient {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * 调用Bitcoin Core RPC方法
     */
    async call(method, params = []) {
        const requestBody = {
            jsonrpc: '1.0',
            id: Date.now(),
            method,
            params
        };
        const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
        const response = await (0, node_fetch_1.default)(this.config.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`
            },
            body: JSON.stringify(requestBody),
            timeout: this.config.timeout || 30000
        });
        if (!response.ok) {
            throw new Error(`RPC请求失败: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        if (result.error) {
            throw new Error(`RPC错误: ${result.error.message}`);
        }
        return result.result;
    }
    /**
     * 广播原始交易
     */
    async sendRawTransaction(rawTx) {
        return await this.call('sendrawtransaction', [rawTx]);
    }
    /**
     * 测试交易是否可以进入交易池
     */
    async testMemPoolAccept(rawTx) {
        const result = await this.call('testmempoolaccept', [[rawTx]]);
        return result[0]?.allowed || false;
    }
    /**
     * 获取交易池条目信息
     */
    async getMemPoolEntry(txId) {
        return await this.call('getmempoolentry', [txId]);
    }
    /**
     * 获取区块链信息
     */
    async getBlockchainInfo() {
        return await this.call('getblockchaininfo');
    }
    /**
     * 获取网络信息
     */
    async getNetworkInfo() {
        return await this.call('getnetworkinfo');
    }
    /**
     * 获取交易池信息
     */
    async getMemPoolInfo() {
        return await this.call('getmempoolinfo');
    }
    /**
     * 估算智能费率
     */
    async estimateSmartFee(confTarget) {
        return await this.call('estimatesmartfee', [confTarget]);
    }
}
exports.BitcoinCoreRpcClient = BitcoinCoreRpcClient;
//# sourceMappingURL=bitcoinCoreRpc.js.map