"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addressUtxosToSpend = exports.addressBRC20Balance = exports.accountAvailableBalance = exports.accountUtxosToSpend = void 0;
const tslib_1 = require("tslib");
const commander_1 = require("commander");
const utxo = tslib_1.__importStar(require("../utxo"));
const wallet_1 = require("./wallet");
exports.accountUtxosToSpend = new commander_1.Command('accountUtxos')
    .description('Returns available utxos to spend')
    .requiredOption('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    /* @dev example call
      oyl utxo accountUtxos -p regtest
    */
    .action(async (options) => {
    const wallet = new wallet_1.Wallet({ networkType: options.provider });
    console.log(await utxo.accountUtxos({
        account: wallet.account,
        provider: wallet.provider,
    }));
});
exports.accountAvailableBalance = new commander_1.Command('balance')
    .description('Returns amount of sats available to spend')
    .requiredOption('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    /* @dev example call
      oyl utxo balance -p regtest
    */
    .action(async (options) => {
    const wallet = new wallet_1.Wallet({ networkType: options.provider });
    console.log(await utxo.accountBalance({
        account: wallet.account,
        provider: wallet.provider,
    }));
});
exports.addressBRC20Balance = new commander_1.Command('addressBRC20Balance')
    .description('Returns all BRC20 balances')
    .requiredOption('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    .requiredOption('-a, --address <address>', 'address you want to get utxos for')
    .action(async (options) => {
    const wallet = new wallet_1.Wallet({ networkType: options.provider });
    console.log((await wallet.provider.api.getBrc20sByAddress(options.address)).data);
});
exports.addressUtxosToSpend = new commander_1.Command('addressUtxos')
    .description('Returns available utxos to spend')
    .requiredOption('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    .requiredOption('-a, --address <address>', 'address you want to get utxos for')
    /* @dev example call
      oyl utxo addressUtxos -a bcrt1q54zh4xfz2jkqah8nqvp2ltl9mvrmf6s69h6au0 -p oylnet
    */
    .action(async (options) => {
    const wallet = new wallet_1.Wallet({ networkType: options.provider });
    console.log(JSON.stringify(await utxo.addressUtxos({
        address: options.address,
        provider: wallet.provider,
    }), null, 2));
});
//# sourceMappingURL=utxo.js.map