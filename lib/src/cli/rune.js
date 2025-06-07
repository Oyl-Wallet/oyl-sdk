"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runeBalance = exports.runeEtchReveal = exports.runeEtchCommit = exports.runeMint = exports.runeSend = void 0;
const tslib_1 = require("tslib");
const commander_1 = require("commander");
const runes = tslib_1.__importStar(require("../rune"));
const utxo = tslib_1.__importStar(require("../utxo"));
const wallet_1 = require("./wallet");
exports.runeSend = new commander_1.Command('send')
    .requiredOption('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    .requiredOption('-t, --to <to>', 'address you want to send to')
    .requiredOption('-runeId, --runeId <runeId>', 'runeId to send')
    .requiredOption('-inscAdd, --inscriptionAddress <inscriptionAddress>', 'current holder of inscription to send')
    .requiredOption('-amt, --amount <amount>', 'amount of runes you want to send')
    .option('-feeRate, --feeRate <feeRate>', 'fee rate')
    /* @dev example call
    oyl rune send
    -p regtest
    -t bcrt1qzr9vhs60g6qlmk7x3dd7g3ja30wyts48sxuemv
    -amt 100
    -runeId 279:1
    -inscAdd bcrt1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqvg32hk
    -feeRate 2
  */
    .action(async (options) => {
    const wallet = new wallet_1.Wallet({ networkType: options.provider });
    const account = wallet.account;
    const provider = wallet.provider;
    const signer = wallet.signer;
    const { accountSpendableTotalUtxos, accountSpendableTotalBalance } = await utxo.accountUtxos({
        account,
        provider,
    });
    console.log(await runes.send({
        gatheredUtxos: {
            utxos: accountSpendableTotalUtxos,
            totalAmount: accountSpendableTotalBalance,
        },
        runeId: options.runeId,
        amount: options.amount,
        inscriptionAddress: options.inscriptionAddress,
        toAddress: options.to,
        feeRate: options.feeRate,
        account,
        signer,
        provider,
    }));
});
exports.runeMint = new commander_1.Command('mint')
    .requiredOption('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    .requiredOption('-runeId, --runeId <runeId>', 'runeId to send')
    .option('-feeRate, --feeRate <feeRate>', 'fee rate')
    /* @dev example call
    oyl rune mint -p regtest -runeId 279:1 -feeRate 2
  */
    .action(async (options) => {
    const wallet = new wallet_1.Wallet({ networkType: options.provider });
    const account = wallet.account;
    const provider = wallet.provider;
    const signer = wallet.signer;
    const { accountSpendableTotalUtxos, accountSpendableTotalBalance } = await utxo.accountUtxos({
        account,
        provider,
    });
    console.log(await runes.mint({
        gatheredUtxos: {
            utxos: accountSpendableTotalUtxos,
            totalAmount: accountSpendableTotalBalance,
        },
        runeId: options.runeId,
        feeRate: options.feeRate,
        account,
        signer,
        provider,
    }));
});
exports.runeEtchCommit = new commander_1.Command('etchCommit')
    .requiredOption('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    .requiredOption('-rune-name, --rune-name <runeName>', 'name of rune to etch')
    .option('-feeRate, --feeRate <feeRate>', 'fee rate')
    /* @dev example call
  oyl rune etchCommit -p regtest -feeRate 2 -divisibility 3 -cap 100000 -pre 1000 -symbol Z -rune-name OYLTESTER -per-mint-amount 500
  */
    .action(async (options) => {
    const wallet = new wallet_1.Wallet({ networkType: options.provider });
    const account = wallet.account;
    const provider = wallet.provider;
    const signer = wallet.signer;
    const { accountSpendableTotalUtxos, accountSpendableTotalBalance } = await utxo.accountUtxos({ account, provider });
    console.log(await runes.etchCommit({
        gatheredUtxos: {
            utxos: accountSpendableTotalUtxos,
            totalAmount: accountSpendableTotalBalance,
        },
        runeName: options.runeName,
        feeRate: options.feeRate,
        account,
        signer,
        provider,
    }));
});
exports.runeEtchReveal = new commander_1.Command('etchReveal')
    .requiredOption('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    .requiredOption('-commitId, --commitId <commitId>', 'commitId')
    .requiredOption('-scrp, --script <script>', 'commit script to spend')
    .requiredOption('-symbol, --symbol <symbol>', 'symbol for rune to etch')
    .requiredOption('-rune-name, --rune-name <runeName>', 'name of rune to etch')
    .requiredOption('-per-mint-amount, --per-mint-amount <perMintAmount>', 'the amount of runes each mint')
    .option('-feeRate, --feeRate <feeRate>', 'fee rate')
    .option('-turbo, --turbo <turbo>', 'use turbo')
    .option('-divisibility, --divisibility <divisibility>', 'divisibility of rune')
    .option('-cap, --cap <cap>', 'cap / total number of rune')
    .option('-pre, --premine <premine>', 'premined amount of rune')
    /* @dev example call
  oyl rune etchReveal -p regtest -feeRate 2 -divisibility 3 -cap 100000 -pre 1000 -symbol Z -rune-name OYLTESTER -per-mint-amount 500
  */
    .action(async (options) => {
    const wallet = new wallet_1.Wallet({ networkType: options.provider });
    const account = wallet.account;
    const provider = wallet.provider;
    const signer = wallet.signer;
    console.log(await runes.etchReveal({
        commitTxId: options.commitId,
        script: options.script,
        symbol: options.symbol,
        premine: options.premine,
        perMintAmount: options.perMintAmount,
        turbo: Boolean(Number(options.turbo)),
        divisibility: Number(options.divisibility),
        runeName: options.runeName,
        feeRate: options.feeRate,
        account,
        signer,
        provider,
    }));
});
exports.runeBalance = new commander_1.Command('balance')
    .description('Returns rune balances for account addresses')
    .requiredOption('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    .option('-a, --address <address>', 'specific address to check (optional, defaults to all account addresses)')
    /* @dev example call
    oyl rune balance -p regtest
    oyl rune balance -p bitcoin -a bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqvg32hk
  */
    .action(async (options) => {
    const wallet = new wallet_1.Wallet({ networkType: options.provider });
    const account = wallet.account;
    const provider = wallet.provider;
    if (options.address) {
        try {
            const addressOutpoints = await provider.ord.getOrdData(options.address);
            const runeBalances = new Map();
            for (const output of addressOutpoints.outputs) {
                try {
                    const ordOutput = await provider.ord.getTxOutput(output);
                    if (ordOutput.runes && Object.keys(ordOutput.runes).length > 0) {
                        for (const [runeName, runeData] of Object.entries(ordOutput.runes)) {
                            const existing = runeBalances.get(runeName) || { amount: 0, divisibility: runeData.divisibility };
                            existing.amount += runeData.amount;
                            runeBalances.set(runeName, existing);
                        }
                    }
                }
                catch (error) {
                    continue;
                }
            }
            console.log(`Rune balances for address ${options.address}:`);
            if (runeBalances.size === 0) {
                console.log('  No runes found');
            }
            else {
                runeBalances.forEach((balance, runeName) => {
                    const adjustedAmount = balance.amount / Math.pow(10, balance.divisibility);
                    console.log(`  ${runeName}: ${adjustedAmount}`);
                });
            }
        }
        catch (error) {
            console.error(`Error fetching rune balance: ${error.message}`);
        }
    }
    else {
        const addresses = [
            { type: 'Native SegWit', address: account.nativeSegwit.address },
            { type: 'Nested SegWit', address: account.nestedSegwit.address },
            { type: 'Taproot', address: account.taproot.address },
            { type: 'Legacy', address: account.legacy.address },
        ];
        console.log('Rune balances for all account addresses:');
        let totalFound = false;
        for (const { type, address } of addresses) {
            try {
                const addressOutpoints = await provider.ord.getOrdData(address);
                const runeBalances = new Map();
                for (const output of addressOutpoints.outputs) {
                    try {
                        const ordOutput = await provider.ord.getTxOutput(output);
                        if (ordOutput.runes && Object.keys(ordOutput.runes).length > 0) {
                            for (const [runeName, runeData] of Object.entries(ordOutput.runes)) {
                                const existing = runeBalances.get(runeName) || { amount: 0, divisibility: runeData.divisibility };
                                existing.amount += runeData.amount;
                                runeBalances.set(runeName, existing);
                            }
                        }
                    }
                    catch (error) {
                        continue;
                    }
                }
                if (runeBalances.size > 0) {
                    totalFound = true;
                    console.log(`\n  ${type} (${address}):`);
                    runeBalances.forEach((balance, runeName) => {
                        const adjustedAmount = balance.amount / Math.pow(10, balance.divisibility);
                        console.log(`    ${runeName}: ${adjustedAmount}`);
                    });
                }
            }
            catch (error) {
                continue;
            }
        }
        if (!totalFound) {
            console.log('  No runes found across all addresses');
        }
    }
});
//# sourceMappingURL=rune.js.map