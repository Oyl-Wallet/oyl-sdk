"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectibleBalance = exports.collectibleSend = void 0;
const tslib_1 = require("tslib");
const commander_1 = require("commander");
const collectible = tslib_1.__importStar(require("../collectible"));
const utxo = tslib_1.__importStar(require("../utxo"));
const wallet_1 = require("./wallet");
exports.collectibleSend = new commander_1.Command('send')
    .requiredOption('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    .requiredOption('-t, --to <to>', 'address you want to send to')
    .requiredOption('-inscId, --inscriptionId <inscriptionId>', 'inscription to send')
    .requiredOption('-inscAdd, --inscriptionAddress <inscriptionAddress>', 'current holder of inscription to send')
    .option('-feeRate, --feeRate <feeRate>', 'fee rate')
    /* @dev example call
    oyl collectible send
    -p regtest
    -t bcrt1qzr9vhs60g6qlmk7x3dd7g3ja30wyts48sxuemv
    -inscId d0c21b35f27ba6361acd5172fcfafe8f4f96d424c80c00b5793290387bcbcf44i0
    -inscAdd bcrt1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqvg32hk
    -feeRate 2
  */
    .action(async (options) => {
    const wallet = new wallet_1.Wallet({ networkType: options.provider });
    const account = wallet.account;
    const provider = wallet.provider;
    const signer = wallet.signer;
    const gatheredUtxos = await utxo.accountUtxos({ account, provider });
    console.log(await collectible.send({
        gatheredUtxos: {
            utxos: gatheredUtxos.accounts['nativeSegwit'].spendableUtxos,
            totalAmount: gatheredUtxos.accounts['nativeSegwit'].spendableTotalBalance,
        },
        inscriptionId: options.inscriptionId,
        inscriptionAddress: options.inscriptionAddress,
        toAddress: options.to,
        feeRate: options.feeRate,
        account,
        signer,
        provider,
    }));
});
exports.collectibleBalance = new commander_1.Command('balance')
    .description('Returns collectibles/inscriptions for account addresses')
    .requiredOption('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    .option('-a, --address <address>', 'specific address to check (optional, defaults to all account addresses)')
    /* @dev example call
    oyl collectible balance -p regtest
    oyl collectible balance -p bitcoin -a bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqvg32hk
  */
    .action(async (options) => {
    const wallet = new wallet_1.Wallet({ networkType: options.provider });
    const account = wallet.account;
    const provider = wallet.provider;
    if (options.address) {
        try {
            const addressOutpoints = await provider.ord.getOrdData(options.address);
            const inscriptions = [];
            for (const output of addressOutpoints.outputs) {
                try {
                    const ordOutput = await provider.ord.getTxOutput(output);
                    if (ordOutput.inscriptions && ordOutput.inscriptions.length > 0) {
                        for (const inscriptionId of ordOutput.inscriptions) {
                            inscriptions.push({
                                id: inscriptionId,
                                output: output
                            });
                        }
                    }
                }
                catch (error) {
                    continue;
                }
            }
            console.log(`Collectibles for address ${options.address}:`);
            if (inscriptions.length === 0) {
                console.log('  No collectibles/inscriptions found');
            }
            else {
                inscriptions.forEach((inscription) => {
                    console.log(`  ID: ${inscription.id}`);
                    console.log(`    Output: ${inscription.output}`);
                    console.log('');
                });
                console.log(`  Total: ${inscriptions.length} collectible(s)`);
            }
        }
        catch (error) {
            console.error(`Error fetching collectibles: ${error.message}`);
        }
    }
    else {
        const addresses = [
            { type: 'Native SegWit', address: account.nativeSegwit.address },
            { type: 'Nested SegWit', address: account.nestedSegwit.address },
            { type: 'Taproot', address: account.taproot.address },
            { type: 'Legacy', address: account.legacy.address },
        ];
        console.log('Collectibles for all account addresses:');
        let totalFound = 0;
        for (const { type, address } of addresses) {
            try {
                const addressOutpoints = await provider.ord.getOrdData(address);
                const inscriptions = [];
                for (const output of addressOutpoints.outputs) {
                    try {
                        const ordOutput = await provider.ord.getTxOutput(output);
                        if (ordOutput.inscriptions && ordOutput.inscriptions.length > 0) {
                            for (const inscriptionId of ordOutput.inscriptions) {
                                inscriptions.push({
                                    id: inscriptionId,
                                    output: output
                                });
                            }
                        }
                    }
                    catch (error) {
                        continue;
                    }
                }
                if (inscriptions.length > 0) {
                    totalFound += inscriptions.length;
                    console.log(`\n  ${type} (${address}):`);
                    inscriptions.forEach((inscription) => {
                        console.log(`    ID: ${inscription.id}`);
                        console.log(`      Output: ${inscription.output}`);
                    });
                    console.log(`    Subtotal: ${inscriptions.length} collectible(s)`);
                }
            }
            catch (error) {
                continue;
            }
        }
        if (totalFound === 0) {
            console.log('  No collectibles/inscriptions found across all addresses');
        }
        else {
            console.log(`\n  Total across all addresses: ${totalFound} collectible(s)`);
        }
    }
});
//# sourceMappingURL=collectible.js.map