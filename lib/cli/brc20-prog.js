"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.brc20ProgDeployContract = void 0;
const tslib_1 = require("tslib");
const commander_1 = require("commander");
const wallet_1 = require("./wallet");
const utxo = tslib_1.__importStar(require("../utxo"));
const token_1 = require("../brc20-prog/token");
const zstd_codec_1 = require("zstd-codec");
exports.brc20ProgDeployContract = new commander_1.Command('deploy-contract')
    .description('Deploy a BRC20-PROG contract')
    .requiredOption('--bytecode <bytecode>', 'EVM bytecode in hex format')
    .option('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    .option('-feeRate, --feeRate <feeRate>', 'fee rate')
    .action(async (options) => {
    const wallet = new wallet_1.Wallet(options);
    const { accountUtxos } = await utxo.accountUtxos({
        account: wallet.account,
        provider: wallet.provider,
    });
    let bytecode;
    if (options.bytecode.startsWith('0x')) {
        bytecode = Buffer.from(options.bytecode.substring(2), 'hex');
    }
    else {
        bytecode = Buffer.from(options.bytecode, 'hex');
    }
    zstd_codec_1.ZstdCodec.run(zstd => {
        const compressed = zstd.compress(bytecode);
        const prefixed = Buffer.concat([Buffer.from([0x02]), compressed]);
        const base64 = prefixed.toString('base64');
        const inscription = {
            p: 'brc20-prog',
            op: 'deploy',
            b: base64,
        };
        (0, token_1.inscribeJson)({
            json: inscription,
            utxos: accountUtxos,
            account: wallet.account,
            signer: wallet.signer,
            provider: wallet.provider,
            feeRate: wallet.feeRate,
        }).then(console.log);
    });
});
//# sourceMappingURL=brc20-prog.js.map