"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendFromFaucet = exports.genBlocks = exports.init = void 0;
const tslib_1 = require("tslib");
const commander_1 = require("commander");
const utils_1 = require("../shared/utils");
const wallet_1 = require("./wallet");
const utxo = tslib_1.__importStar(require("../utxo"));
const btc = tslib_1.__importStar(require("../btc"));
const constants_1 = require("./constants");
const RANDOM_ADDRESS = 'bcrt1qz3y37epk6hqlul2pt09hrwgj0s09u5g6kzrkm2';
/* @dev usage
  oyl regtest init
*/
exports.init = new commander_1.Command('init')
    .description('Generate 260 blocks to initialize regtest chain (funds faucet address and an optional user address)')
    .option('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    .option('-m, --mnemonic <mnemonic>', '(optional) Mnemonic used for signing transactions (default = TEST_WALLET)')
    .option('-a, --address <address>', '(optional) Address that will receive initial funds (default = bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx)')
    .action(async (options) => {
    const totalBlockCount = 350;
    const faucetBlockCount = 100;
    const addressBlockCount = 5;
    const provider = constants_1.DEFAULT_PROVIDER[options.provider || 'regtest'];
    const address = options.address || constants_1.TEST_WALLET.nativeSegwit.address;
    const currentBlockCount = await provider.sandshrew.bitcoindRpc.getBlockCount();
    if (currentBlockCount > 250) {
        console.log('Blockchain already initialized');
        console.log('Block count: ', currentBlockCount);
        return;
    }
    console.log('Generating blocks...');
    // Generate the first block utxo payments to the faucet.
    await provider.sandshrew.bitcoindRpc.generateToAddress(faucetBlockCount, constants_1.REGTEST_FAUCET.nativeSegwit.address);
    await provider.sandshrew.bitcoindRpc.generateToAddress(addressBlockCount, address);
    // Generate the remaining (at least 100) blocks to a random address to avoid coinbase spend issues
    const transaction = await provider.sandshrew.bitcoindRpc.generateToAddress(totalBlockCount - faucetBlockCount - addressBlockCount, RANDOM_ADDRESS);
    await (0, utils_1.timeout)(8000);
    const newBlockCount = await provider.sandshrew.bitcoindRpc.getBlockCount();
    console.log(transaction);
    console.log('Blockchain initialized');
    console.log('Block count: ', newBlockCount);
    console.log('Faucet address: ', constants_1.REGTEST_FAUCET.nativeSegwit.address);
    console.log(`${address} has been funded with ${addressBlockCount} utxos`);
});
/* @dev example call
  oyl regtest genBlocks -c 2
*/
exports.genBlocks = new commander_1.Command('genBlocks')
    .description('Generate blocks with transactions from mempool')
    .option('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    .option('-a, --address <address>', '(optional) Address to recieve block reward')
    .option('-c, --count <count>', '(optional)Number of blocks (default = 1)', parseInt)
    .action(async (options) => {
    const count = options.count || 1;
    const address = options.address || RANDOM_ADDRESS;
    const provider = constants_1.DEFAULT_PROVIDER[options.provider || 'regtest'];
    const genBlock = await provider.sandshrew.bitcoindRpc.generateToAddress(count, address);
    console.log('Processed blocks: ', genBlock);
});
/* @dev example call
  oyl regtest sendFromFaucet --to "bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx" -s 1000000
*/
exports.sendFromFaucet = new commander_1.Command('sendFromFaucet')
    .description('Send funds from regtest faucet to an address')
    .option('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    .requiredOption('-t, --to <to>', '(optional) Address to recieve block reward.')
    .option('-s, --sats <sats>', '(optional) Number of sats to send (default = 1000000)', parseInt)
    .action(async (options) => {
    options.mnemonic = constants_1.REGTEST_FAUCET.mnemonic;
    const faucet = new wallet_1.Wallet(options);
    const { accountSpendableTotalUtxos } = await utxo.accountUtxos({
        account: faucet.account,
        provider: faucet.provider,
    });
    const utxos = utxo.selectUtxos(accountSpendableTotalUtxos, faucet.account.spendStrategy);
    console.log(await btc.send({
        utxos,
        toAddress: options.to,
        feeRate: faucet.feeRate,
        account: faucet.account,
        signer: faucet.signer,
        provider: faucet.provider,
        amount: options.sats || 1000000,
    }));
});
//# sourceMappingURL=regtest.js.map