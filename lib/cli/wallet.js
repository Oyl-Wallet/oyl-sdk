"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Wallet = void 0;
require("dotenv/config");
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
        this.mnemonic =
            options?.mnemonic || process.env.MNEMONIC || constants_1.TEST_WALLET.mnemonic;
        this.networkType = options?.networkType || 'regtest';
        if (options?.provider && typeof options.provider === 'string') {
            // If a provider name is specified, get the default provider
            const defaultProvider = constants_1.DEFAULT_PROVIDER[options.provider];
            if (options.metashrewRpcUrl) {
                // If metashrewRpcUrl is provided, create a new provider with it
                this.provider = new __1.Provider({
                    url: defaultProvider.url,
                    projectId: defaultProvider.projectId || '',
                    network: defaultProvider.network,
                    networkType: defaultProvider.networkType,
                    version: defaultProvider.version,
                    metashrewRpcUrl: options.metashrewRpcUrl
                });
            }
            else {
                this.provider = defaultProvider;
            }
        }
        else if (options?.provider) {
            // If a provider instance is provided, use it directly
            this.provider = options.provider;
        }
        else {
            // Use the default provider for the network type
            const defaultProvider = constants_1.DEFAULT_PROVIDER[this.networkType];
            if (options?.metashrewRpcUrl) {
                // If metashrewRpcUrl is provided, create a new provider with it
                this.provider = new __1.Provider({
                    url: defaultProvider.url,
                    projectId: defaultProvider.projectId || '',
                    network: defaultProvider.network,
                    networkType: defaultProvider.networkType,
                    version: defaultProvider.version,
                    metashrewRpcUrl: options.metashrewRpcUrl
                });
            }
            else {
                this.provider = defaultProvider;
            }
        }
        this.account = (0, __1.mnemonicToAccount)({
            mnemonic: this.mnemonic,
            opts: {
                network: this.provider.network,
            },
        });
        const privateKeys = (0, __1.getWalletPrivateKeys)({
            mnemonic: this.mnemonic,
            opts: {
                network: this.account.network,
            },
        });
        this.signer = new __1.Signer(this.account.network, {
            taprootPrivateKey: privateKeys.taproot.privateKey,
            segwitPrivateKey: privateKeys.nativeSegwit.privateKey,
            nestedSegwitPrivateKey: privateKeys.nestedSegwit.privateKey,
            legacyPrivateKey: privateKeys.legacy.privateKey,
        });
        this.feeRate = options?.feeRate ? options?.feeRate : 2;
    }
}
exports.Wallet = Wallet;
//# sourceMappingURL=wallet.js.map