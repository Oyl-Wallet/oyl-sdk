"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.oylnet = exports.regtest = exports.testnet = exports.mainnet = void 0;
const tslib_1 = require("tslib");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
exports.mainnet = bitcoin.networks.bitcoin;
exports.testnet = bitcoin.networks.testnet;
exports.regtest = bitcoin.networks.regtest;
exports.oylnet = bitcoin.networks.regtest;
//# sourceMappingURL=network.js.map