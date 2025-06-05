"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.brc20Send = void 0;
const tslib_1 = require("tslib");
const commander_1 = require("commander");
const brc20 = tslib_1.__importStar(require("../brc20"));
const utxo = tslib_1.__importStar(require("../utxo"));
const wallet_1 = require("./wallet");
exports.brc20Send = new commander_1.Command('send')
    .requiredOption('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    .requiredOption('-amt, --amount <amount>', 'amount you want to send')
    .requiredOption('-t, --to <to>', 'address you want to send to')
    .requiredOption('-tick', '--ticker <ticker>', 'brc20 ticker to send')
    .option('-legacy, --legacy <legacy>', 'legacy private key')
    .option('-taproot, --taproot <taproot>', 'taproot private key')
    .option('-nested, --nested-segwit <nestedSegwit>', 'nested segwit private key')
    .option('-native, --native-segwit <nativeSegwit>', 'native segwit private key')
    .option('-feeRate, --feeRate <feeRate>', 'fee rate')
    /* @dev example call
    oyl brc20 send -p regtest -t bcrt1qzr9vhs60g6qlmk7x3dd7g3ja30wyts48sxuemv -tick toyl -amt 1000 -feeRate 2
  */
    .action(async (options) => {
    const wallet = new wallet_1.Wallet({ networkType: options.provider });
    const account = wallet.account;
    const provider = wallet.provider;
    const signer = wallet.signer;
    const { accountSpendableTotalUtxos, accountSpendableTotalBalance } = await utxo.accountUtxos({ account, provider });
    console.log(await brc20.send({
        gatheredUtxos: {
            utxos: accountSpendableTotalUtxos,
            totalAmount: accountSpendableTotalBalance,
        },
        ticker: options.ticker,
        toAddress: options.to,
        feeRate: options.feeRate,
        account,
        signer,
        provider,
        amount: options.amount,
    }));
});
//# sourceMappingURL=brc20.js.map