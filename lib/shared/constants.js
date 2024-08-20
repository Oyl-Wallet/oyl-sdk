"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBrc20Data = exports.mainnetMnemonic = exports.regtestMnemonic = exports.Opts = exports.regtestOpts = exports.regtestProviderConstructorArgs = exports.MAXIMUM_FEE = exports.maximumScriptBytes = exports.UTXO_DUST = void 0;
const tslib_1 = require("tslib");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const dotenv = tslib_1.__importStar(require("dotenv"));
dotenv.config();
exports.UTXO_DUST = 546;
exports.maximumScriptBytes = 520;
exports.MAXIMUM_FEE = 5000000;
exports.regtestProviderConstructorArgs = {
    url: 'http://localhost:3000',
    projectId: 'regtest',
    network: bitcoin.networks.regtest,
    networkType: 'mainnet',
    apiUrl: 'https://mainnet-api.oyl.gg',
};
exports.regtestOpts = {
    network: bitcoin.networks.regtest,
    index: 0,
};
exports.Opts = {
    network: bitcoin.networks.bitcoin,
    index: 0,
    spendStrategy: {
        changeAddress: 'nativeSegwit',
        addressOrder: ['nativeSegwit', 'nestedSegwit', 'taproot', 'legacy'],
        utxoSortGreatestToLeast: true,
    },
};
exports.regtestMnemonic = process.env.REGTEST1;
exports.mainnetMnemonic = process.env.MAINNET_MNEMONIC;
const getBrc20Data = ({ amount, tick, }) => ({
    mediaContent: `{"p":"brc-20","op":"transfer","tick":"${tick}","amt":"${amount}"}`,
    mediaType: 'text/plain',
});
exports.getBrc20Data = getBrc20Data;
//# sourceMappingURL=constants.js.map