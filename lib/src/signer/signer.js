"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Signer = exports.SighashType = void 0;
const tslib_1 = require("tslib");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const utils_1 = require("../shared/utils");
const bip322_js_1 = require("bip322-js");
const crypto_1 = tslib_1.__importDefault(require("crypto"));
var SighashType;
(function (SighashType) {
    SighashType[SighashType["ALL"] = bitcoin.Transaction.SIGHASH_ALL] = "ALL";
    SighashType[SighashType["NONE"] = bitcoin.Transaction.SIGHASH_NONE] = "NONE";
    SighashType[SighashType["SINGLE"] = bitcoin.Transaction.SIGHASH_SINGLE] = "SINGLE";
    SighashType[SighashType["ANYONECANPAY"] = bitcoin.Transaction.SIGHASH_ANYONECANPAY] = "ANYONECANPAY";
    SighashType[SighashType["ALL_ANYONECANPAY"] = SighashType.ALL | SighashType.ANYONECANPAY] = "ALL_ANYONECANPAY";
    SighashType[SighashType["NONE_ANYONECANPAY"] = SighashType.NONE | SighashType.ANYONECANPAY] = "NONE_ANYONECANPAY";
    SighashType[SighashType["SINGLE_ANYONECANPAY"] = SighashType.SINGLE | SighashType.ANYONECANPAY] = "SINGLE_ANYONECANPAY";
})(SighashType = exports.SighashType || (exports.SighashType = {}));
class Signer {
    network;
    segwitKeyPair;
    taprootKeyPair;
    legacyKeyPair;
    nestedSegwitKeyPair;
    addresses;
    constructor(network, keys) {
        if (keys.segwitPrivateKey) {
            this.segwitKeyPair = utils_1.ECPair.fromPrivateKey(Buffer.from(keys.segwitPrivateKey, 'hex'));
        }
        if (keys.taprootPrivateKey) {
            this.taprootKeyPair = utils_1.ECPair.fromPrivateKey(Buffer.from(keys.taprootPrivateKey, 'hex'));
        }
        if (keys.legacyPrivateKey) {
            this.legacyKeyPair = utils_1.ECPair.fromPrivateKey(Buffer.from(keys.legacyPrivateKey, 'hex'));
        }
        if (keys.nestedSegwitPrivateKey) {
            this.nestedSegwitKeyPair = utils_1.ECPair.fromPrivateKey(Buffer.from(keys.nestedSegwitPrivateKey, 'hex'));
        }
        this.network = network;
    }
    async signSegwitInput({ rawPsbt, inputNumber, finalize, }) {
        if (!this.segwitKeyPair) {
            throw new Error('Segwit signer was not initialized');
        }
        let unSignedPsbt = bitcoin.Psbt.fromBase64(rawPsbt);
        const matchingPubKey = unSignedPsbt.inputHasPubkey(inputNumber, this.segwitKeyPair.publicKey);
        if (matchingPubKey) {
            unSignedPsbt.signInput(inputNumber, this.segwitKeyPair);
            if (finalize) {
                unSignedPsbt.finalizeInput(inputNumber);
            }
        }
        const signedPsbt = unSignedPsbt.toBase64();
        return { signedPsbt: signedPsbt };
    }
    async signTaprootInput({ rawPsbt, inputNumber, finalize, }) {
        if (!this.taprootKeyPair) {
            throw new Error('Taproot signer was not initialized');
        }
        let unSignedPsbt = bitcoin.Psbt.fromBase64(rawPsbt, {
            network: this.network,
        });
        const tweakedSigner = (0, utils_1.tweakSigner)(this.taprootKeyPair);
        const matchingPubKey = unSignedPsbt.inputHasPubkey(inputNumber, tweakedSigner.publicKey);
        if (!matchingPubKey) {
            throw new Error('Input does not match signer type');
        }
        unSignedPsbt.signTaprootInput(inputNumber, tweakedSigner);
        if (finalize) {
            unSignedPsbt.finalizeInput(inputNumber);
        }
        const signedPsbt = unSignedPsbt.toBase64();
        return { signedPsbt: signedPsbt };
    }
    async signAllTaprootInputs({ rawPsbt, finalize, }) {
        if (!this.taprootKeyPair) {
            throw new Error('Taproot signer was not initialized');
        }
        let unSignedPsbt = bitcoin.Psbt.fromBase64(rawPsbt, {
            network: this.network,
        });
        let tweakedSigner = (0, utils_1.tweakSigner)(this.taprootKeyPair);
        for (let i = 0; i < unSignedPsbt.inputCount; i++) {
            const matchingPubKey = unSignedPsbt.inputHasPubkey(i, tweakedSigner.publicKey);
            if (matchingPubKey) {
                unSignedPsbt.signTaprootInput(i, tweakedSigner);
                if (finalize) {
                    unSignedPsbt.finalizeInput(i);
                }
            }
        }
        const signedPsbt = unSignedPsbt.toBase64();
        const signedHexPsbt = unSignedPsbt.toHex();
        return {
            signedPsbt: signedPsbt,
            raw: unSignedPsbt,
            signedHexPsbt: signedHexPsbt,
        };
    }
    async signAllInputs({ rawPsbt, rawPsbtHex, finalize = true, }) {
        let unSignedPsbt;
        if (rawPsbt) {
            unSignedPsbt = bitcoin.Psbt.fromBase64(rawPsbt, {
                network: this.network,
            });
        }
        if (rawPsbtHex) {
            unSignedPsbt = bitcoin.Psbt.fromHex(rawPsbtHex, {
                network: this.network,
            });
        }
        for (let i = 0; i < unSignedPsbt.inputCount; i++) {
            let tweakedSigner;
            let matchingLegacy;
            let matchingNative;
            let matchingTaprootPubKey;
            let matchingNestedSegwit;
            if (this.taprootKeyPair) {
                tweakedSigner = (0, utils_1.tweakSigner)(this.taprootKeyPair, {
                    network: this.network,
                });
                matchingTaprootPubKey = unSignedPsbt.inputHasPubkey(i, tweakedSigner.publicKey);
            }
            if (this.legacyKeyPair) {
                matchingLegacy = unSignedPsbt.inputHasPubkey(i, this.legacyKeyPair.publicKey);
            }
            if (this.segwitKeyPair) {
                matchingNative = unSignedPsbt.inputHasPubkey(i, this.segwitKeyPair.publicKey);
            }
            if (this.nestedSegwitKeyPair) {
                try {
                    matchingNestedSegwit = unSignedPsbt.inputHasPubkey(i, this.nestedSegwitKeyPair.publicKey);
                }
                catch (e) {
                    console.log(e);
                }
            }
            let allowedSighashTypes = unSignedPsbt.data.inputs[i].sighashType
                ? [unSignedPsbt.data.inputs[i].sighashType]
                : undefined;
            switch (true) {
                case matchingTaprootPubKey:
                    unSignedPsbt.signInput(i, tweakedSigner, allowedSighashTypes);
                    if (finalize) {
                        unSignedPsbt.finalizeInput(i);
                    }
                    break;
                case matchingLegacy:
                    unSignedPsbt.signInput(i, this.legacyKeyPair, allowedSighashTypes);
                    if (finalize) {
                        unSignedPsbt.finalizeInput(i);
                    }
                    break;
                case matchingNative:
                    unSignedPsbt.signInput(i, this.segwitKeyPair, allowedSighashTypes);
                    if (finalize) {
                        unSignedPsbt.finalizeInput(i);
                    }
                    break;
                case matchingNestedSegwit:
                    unSignedPsbt.signInput(i, this.nestedSegwitKeyPair, allowedSighashTypes);
                    if (finalize) {
                        unSignedPsbt.finalizeInput(i);
                    }
                    break;
                default:
            }
        }
        const signedPsbt = unSignedPsbt.toBase64();
        const signedHexPsbt = unSignedPsbt.toHex();
        return { signedPsbt, signedHexPsbt };
    }
    async signAllSegwitInputs({ rawPsbt, finalize, }) {
        if (!this.segwitKeyPair) {
            throw new Error('Segwit signer was not initialized');
        }
        let unSignedPsbt = bitcoin.Psbt.fromBase64(rawPsbt, {
            network: this.network,
        });
        for (let i = 0; i < unSignedPsbt.inputCount; i++) {
            const matchingPubKey = unSignedPsbt.inputHasPubkey(i, this.segwitKeyPair.publicKey);
            if (matchingPubKey) {
                unSignedPsbt.signInput(i, this.segwitKeyPair);
                if (finalize) {
                    unSignedPsbt.finalizeInput(i);
                }
            }
        }
        const signedPsbt = unSignedPsbt.toBase64();
        const signedHexPsbt = unSignedPsbt.toHex();
        return { signedPsbt: signedPsbt, signedHexPsbt: signedHexPsbt };
    }
    async signMessage({ message, address, keypair, protocol, }) {
        if (!keypair) {
            throw new Error('Keypair required to sign');
        }
        if (protocol === 'bip322') {
            return bip322_js_1.Signer
                .sign(keypair.toWIF(), address, message)
                .toString('base64');
        }
        if (protocol === 'ecdsa') {
            const hashedMessage = crypto_1.default
                .createHash('sha256')
                .update(message)
                .digest()
                .toString('base64');
            const signature = keypair.sign(Buffer.from(hashedMessage, 'base64'));
            return signature.toString('base64');
        }
    }
}
exports.Signer = Signer;
//# sourceMappingURL=signer.js.map