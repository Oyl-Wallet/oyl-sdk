"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEST_WALLET = exports.REGTEST_FAUCET = exports.DEFAULT_PROVIDER = void 0;
const tslib_1 = require("tslib");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const __1 = require("..");
exports.DEFAULT_PROVIDER = {
    alkanes: new __1.Provider({
        url: 'http://localhost:18888',
        projectId: '',
        version: '',
        network: bitcoin.networks.regtest,
        networkType: 'regtest',
    }),
    bitcoin: new __1.Provider({
        url: 'https://mainnet.sandshrew.io',
        version: 'v2',
        projectId: process.env.SANDSHREW_PROJECT_ID,
        network: bitcoin.networks.bitcoin,
        networkType: 'mainnet',
    }),
    regtest: new __1.Provider({
        url: 'http://localhost:18888',
        projectId: 'regtest',
        network: bitcoin.networks.regtest,
        networkType: 'regtest',
    }),
    oylnet: new __1.Provider({
        url: 'https://oylnet.oyl.gg',
        projectId: 'regtest',
        version: 'v2',
        network: bitcoin.networks.regtest,
        networkType: 'regtest',
    }),
    signet: new __1.Provider({
        url: 'https://signet.sandshrew.io',
        projectId: 'lasereyes',
        version: 'v2',
        network: bitcoin.networks.testnet,
        networkType: 'testnet',
    }),
};
exports.REGTEST_FAUCET = {
    mnemonic: 'hub dinosaur mammal approve riot rebel library legal sick discover loop alter',
    nativeSegwit: {
        address: 'bcrt1qzr9vhs60g6qlmk7x3dd7g3ja30wyts48sxuemv',
        publicKey: '03d3af89f242cc0df1d7142e9a354a59b1cd119c12c31ff226b32fb77fa12acce2',
    },
    taproot: {
        address: 'bcrt1p45un5d47hvfhx6mfezr6x0htpanw23tgll7ppn6hj6gfzu3x3dnsaegh8d',
        publicKey: '022ffc336daa8196f1aa796135a568b1125ba08c2879c22468effea8e4a0c4c8b9',
    },
};
exports.TEST_WALLET = {
    mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    nativeSegwit: {
        address: 'bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx',
        publicKey: '',
    },
    taproot: {
        address: 'bcrt1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqvg32hk',
        publicKey: '',
    },
};
//# sourceMappingURL=constants.js.map