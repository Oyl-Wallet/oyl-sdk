"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Wallet = void 0;
const __1 = require("..");
const constants_1 = require("./constants");
class Wallet {
    mnemonic;
    networkType;
    provider;
    account;
    signer;
    feeRate;
    constructor(options) {
        this.mnemonic = options?.mnemonic || constants_1.TEST_WALLET.mnemonic;
        this.networkType = options?.networkType || 'regtest';
        this.provider = constants_1.DEFAULT_PROVIDER[this.networkType];
        this.account = (0, __1.mnemonicToAccount)({
            mnemonic: this.mnemonic,
            opts: {
                network: this.provider.network
            }
        });
        const privateKeys = (0, __1.getWalletPrivateKeys)({
            mnemonic: this.mnemonic,
            opts: {
                network: this.account.network
            }
        });
        this.signer = new __1.Signer(this.account.network, {
            taprootPrivateKey: privateKeys.taproot.privateKey,
            segwitPrivateKey: privateKeys.nativeSegwit.privateKey,
            nestedSegwitPrivateKey: privateKeys.nestedSegwit.privateKey,
            legacyPrivateKey: privateKeys.legacy.privateKey
        });
        this.feeRate = options?.feeRate ? options?.feeRate : 2;
    }
}
exports.Wallet = Wallet;
//# sourceMappingURL=wallet.js.map