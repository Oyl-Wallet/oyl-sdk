"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectAlkanesUtxos = exports.selectSpendableUtxos = exports.selectUtxos = exports.accountUtxos = exports.addressUtxos = exports.mapSandshrewAlkanesById = exports.mapAlkanesById = exports.addressBalance = exports.accountBalance = void 0;
const tslib_1 = require("tslib");
const tiny_async_pool_1 = tslib_1.__importDefault(require("tiny-async-pool"));
const utils_1 = require("../shared/utils");
const alkanes_1 = require("../alkanes");
const errors_1 = require("../errors");
const accountBalance = async ({ account, provider, }) => {
    let confirmedAmount = 0;
    let pendingAmount = 0;
    let amount = 0;
    for (let i = 0; i < account.spendStrategy.addressOrder.length; i++) {
        const address = account[account.spendStrategy.addressOrder[i]].address;
        const { chain_stats, mempool_stats } = await provider.esplora._call('esplora_address', [address]);
        const btcBalance = chain_stats.funded_txo_sum - chain_stats.spent_txo_sum;
        const pendingBtcBalance = mempool_stats.funded_txo_sum - mempool_stats.spent_txo_sum;
        confirmedAmount += btcBalance;
        pendingAmount += pendingBtcBalance;
        amount += btcBalance + pendingAmount;
    }
    return {
        confirmedAmount: Math.floor(confirmedAmount / 10 ** 8),
        pendingAmount: Math.floor(pendingAmount / 10 ** 8),
        amount: Math.floor(amount / 10 ** 8),
    };
};
exports.accountBalance = accountBalance;
const addressBalance = async ({ address, provider, }) => {
    let confirmedAmount = 0;
    let pendingAmount = 0;
    let amount = 0;
    const { chain_stats, mempool_stats } = await provider.esplora._call('esplora_address', [address]);
    const btcBalance = chain_stats.funded_txo_sum - chain_stats.spent_txo_sum;
    const pendingBtcBalance = mempool_stats.funded_txo_sum - mempool_stats.spent_txo_sum;
    confirmedAmount += btcBalance;
    pendingAmount += pendingBtcBalance;
    amount += btcBalance + pendingAmount;
    return {
        confirmedAmount: confirmedAmount / 10 ** 8,
        pendingAmount: pendingAmount / 10 ** 8,
        amount: amount / 10 ** 8,
    };
};
exports.addressBalance = addressBalance;
const checkSpendableBalance = (utxo) => {
    return utxo.satoshis !== 546 && utxo.satoshis !== 330;
};
const mapAlkanesById = (outpoints) => {
    const toBigInt = (hex) => BigInt(hex);
    return outpoints
        .flatMap(({ runes }) => runes)
        .reduce((acc, { rune, balance }) => {
        const key = `${toBigInt(rune.id.block)}:${toBigInt(rune.id.tx)}`;
        const previous = acc[key]?.value ? BigInt(acc[key].value) : 0n;
        acc[key] = {
            value: (previous + toBigInt(balance)).toString(),
            name: rune.name,
            symbol: rune.symbol,
        };
        return acc;
    }, {});
};
exports.mapAlkanesById = mapAlkanesById;
const mapSandshrewAlkanesById = (outpoints) => {
    const toBigInt = (hex) => BigInt(hex);
    return outpoints
        .reduce((acc, { rune, balance }) => {
        const key = `${toBigInt(rune.id.block)}:${toBigInt(rune.id.tx)}`;
        const previous = acc[key]?.value ? BigInt(acc[key].value) : 0n;
        acc[key] = {
            value: (previous + toBigInt(balance)).toString(),
            name: rune.name,
            symbol: rune.symbol,
        };
        return acc;
    }, {});
};
exports.mapSandshrewAlkanesById = mapSandshrewAlkanesById;
const addressUtxos = async ({ address, provider, spendStrategy, }) => {
    let spendableTotalBalance = 0;
    let pendingTotalBalance = 0;
    let totalBalance = 0;
    const utxos = [];
    const spendableUtxos = [];
    const pendingUtxos = [];
    const ordUtxos = [];
    const runeUtxos = [];
    const alkaneUtxos = [];
    const multiCall = await provider.sandshrew.multiCall([
        ['esplora_address::utxo', [address]],
        ['btc_getblockcount', []],
        [
            'alkanes_protorunesbyaddress',
            [
                {
                    address,
                    protocolTag: '1',
                },
            ],
        ],
    ]);
    const esploraUtxos = multiCall[0].result;
    const blockCount = multiCall[1].result;
    const alkanesByAddress = multiCall[2].result;
    if (esploraUtxos.length === 0) {
        return {
            utxos,
            alkaneUtxos,
            spendableTotalBalance,
            spendableUtxos,
            runeUtxos,
            ordUtxos,
            pendingUtxos,
            pendingTotalBalance,
            totalBalance,
        };
    }
    alkanesByAddress.outpoints.forEach((alkane) => {
        alkane.outpoint.txid = (0, alkanes_1.toTxId)(alkane.outpoint.txid);
    });
    const concurrencyLimit = 50;
    const processedUtxos = [];
    const processUtxo = async (utxo) => {
        try {
            const txIdVout = `${utxo.txid}:${utxo.vout}`;
            const multiCall = await provider.sandshrew.multiCall([
                ['ord_output', [txIdVout]],
                ['esplora_tx', [utxo.txid]],
            ]);
            const txOutput = multiCall[0].result;
            const txDetails = multiCall[1].result;
            const alkanesOutpoints = alkanesByAddress.outpoints.filter(({ outpoint }) => outpoint.txid === utxo.txid && outpoint.vout === utxo.vout);
            return {
                utxo,
                txOutput,
                scriptPk: txDetails.vout[utxo.vout].scriptpubkey,
                alkanesOutpoints,
            };
        }
        catch (error) {
            console.error(`Error processing UTXO ${utxo.txid}:${utxo.vout}`, error);
            throw error;
        }
    };
    for await (const result of (0, tiny_async_pool_1.default)(concurrencyLimit, esploraUtxos, processUtxo)) {
        if (result !== null) {
            processedUtxos.push(result);
        }
    }
    const utxoSortGreatestToLeast = spendStrategy?.utxoSortGreatestToLeast ?? true;
    processedUtxos.sort((a, b) => utxoSortGreatestToLeast
        ? b.utxo.value - a.utxo.value
        : a.utxo.value - b.utxo.value);
    for (const { utxo, txOutput, scriptPk, alkanesOutpoints } of processedUtxos) {
        const hasInscriptions = txOutput.inscriptions.length > 0;
        const hasRunes = Object.keys(txOutput.runes).length > 0;
        const hasAlkanes = alkanesOutpoints.length > 0;
        const confirmations = blockCount - utxo.status.block_height;
        const indexed = txOutput.indexed;
        const inscriptions = txOutput.inscriptions;
        const runes = txOutput.runes;
        const alkanes = (0, exports.mapAlkanesById)(alkanesOutpoints);
        totalBalance += utxo.value;
        utxos.push({
            txId: utxo.txid,
            outputIndex: utxo.vout,
            satoshis: utxo.value,
            address,
            inscriptions,
            runes,
            alkanes,
            confirmations,
            indexed,
            scriptPk,
        });
        if (txOutput.indexed) {
            if (!utxo.status.confirmed) {
                pendingUtxos.push({
                    txId: utxo.txid,
                    outputIndex: utxo.vout,
                    satoshis: utxo.value,
                    address,
                    inscriptions,
                    runes,
                    alkanes,
                    confirmations,
                    indexed,
                    scriptPk,
                });
                pendingTotalBalance += utxo.value;
                continue;
            }
            if (hasAlkanes) {
                alkaneUtxos.push({
                    txId: utxo.txid,
                    outputIndex: utxo.vout,
                    satoshis: utxo.value,
                    address,
                    inscriptions,
                    runes,
                    alkanes,
                    confirmations,
                    indexed,
                    scriptPk,
                });
            }
            if (hasRunes) {
                runeUtxos.push({
                    txId: utxo.txid,
                    outputIndex: utxo.vout,
                    satoshis: utxo.value,
                    address,
                    inscriptions,
                    runes,
                    alkanes,
                    confirmations,
                    indexed,
                    scriptPk,
                });
            }
            if (hasInscriptions) {
                ordUtxos.push({
                    txId: utxo.txid,
                    outputIndex: utxo.vout,
                    satoshis: utxo.value,
                    address,
                    inscriptions,
                    runes,
                    alkanes,
                    confirmations,
                    indexed,
                    scriptPk,
                });
            }
            if (!hasInscriptions &&
                !hasRunes &&
                !hasAlkanes &&
                utxo.value !== 546 &&
                utxo.value !== 330) {
                spendableUtxos.push({
                    txId: utxo.txid,
                    outputIndex: utxo.vout,
                    satoshis: utxo.value,
                    address,
                    inscriptions,
                    runes,
                    alkanes,
                    confirmations,
                    indexed,
                    scriptPk,
                });
                spendableTotalBalance += utxo.value;
                continue;
            }
        }
    }
    return {
        utxos,
        alkaneUtxos,
        spendableTotalBalance,
        spendableUtxos,
        runeUtxos,
        ordUtxos,
        pendingUtxos,
        pendingTotalBalance,
        totalBalance,
    };
};
exports.addressUtxos = addressUtxos;
const processSandshrewUtxo = (utxo, address, scriptPk, blockCount, metashrewHeight) => {
    return {
        txId: utxo.outpoint.split(':')[0],
        outputIndex: parseInt(utxo.outpoint.split(':')[1]),
        satoshis: utxo.value,
        scriptPk,
        address,
        inscriptions: utxo?.inscriptions || [],
        runes: utxo?.ord_runes || {},
        alkanes: utxo?.runes?.length > 0 ? (0, exports.mapSandshrewAlkanesById)(utxo.runes) : {},
        confirmations: utxo?.height ? blockCount - utxo.height : 0,
        indexed: utxo?.height ? metashrewHeight >= utxo.height : false
    };
};
/*
export const addressUtxos = async ({
  address,
  provider,
  spendStrategy,
}: {
  address: string
  provider: Provider
  spendStrategy?: SpendStrategy
}): Promise<AddressUtxoPortfolio> => {
  let spendableTotalBalance: number = 0
  let pendingTotalBalance: number = 0
  let totalBalance: number = 0
  const multiCall = await provider.sandshrew.multiCall([
    ['btc_getblockcount', []]
  ])
  const blockCount = multiCall[0].result

  const sandshrewBalances: SandShrewBalancesAddressInfo = await provider.sandshrew.sandShrewBalances({ address })

  const scriptPk = addressToScriptPk(address, provider.network)

  const spendableUtxos = sandshrewBalances.spendable.map((utxo) => {
    return processSandshrewUtxo(
      utxo,
      address,
      scriptPk,
      blockCount,
      sandshrewBalances.metashrewHeight
    )
  }).filter((utxo) => checkSpendableBalance(utxo));

   const totalPendingUtxos = sandshrewBalances.pending.map((utxo) => {
    return processSandshrewUtxo(
      utxo,
      address,
      scriptPk,
      blockCount,
      sandshrewBalances.metashrewHeight
    )
  });

  const assetUtxos = sandshrewBalances.assets.map((utxo) => {
    return processSandshrewUtxo(
      utxo,
      address,
      scriptPk,
      blockCount,
      sandshrewBalances.metashrewHeight
    )
  });

  const ordUtxos = assetUtxos.filter((utxo) => utxo.inscriptions.length > 0 && utxo.indexed);

  const runeUtxos = assetUtxos.filter((utxo) => Object.keys(utxo.runes).length > 0 && utxo.indexed);

  const alkaneUtxos = assetUtxos.filter((utxo) => Object.keys(utxo.alkanes).length > 0 && utxo.indexed);

  const utxos = [...spendableUtxos, ...totalPendingUtxos, ...assetUtxos]

  const pendingUtxos = totalPendingUtxos.filter((utxo) => utxo.indexed);

  const utxoSortGreatestToLeast = spendStrategy?.utxoSortGreatestToLeast ?? true

  utxos.sort((a, b) =>
    utxoSortGreatestToLeast
      ? b.satoshis - a.satoshis
      : a.satoshis - b.satoshis
  )

  spendableUtxos.forEach((utxo) => {
    if (checkSpendableBalance(utxo)) spendableTotalBalance += utxo.satoshis
  });

  pendingUtxos.forEach((utxo) => {
    if (checkSpendableBalance(utxo)) pendingTotalBalance += utxo.satoshis
  })

  totalBalance = spendableTotalBalance + pendingTotalBalance;


  return {
    utxos,
    alkaneUtxos,
    spendableTotalBalance,
    spendableUtxos,
    runeUtxos,
    ordUtxos,
    pendingUtxos,
    pendingTotalBalance,
    totalBalance,
  }
}
*/
const accountUtxos = async ({ account, provider, }) => {
    const accountUtxos = [];
    const accountSpendableTotalUtxos = [];
    let accountSpendableTotalBalance = 0;
    let accountPendingTotalBalance = 0;
    let accountTotalBalance = 0;
    const accounts = {};
    const addresses = [
        { addressKey: 'nativeSegwit', address: account.nativeSegwit.address },
        { addressKey: 'nestedSegwit', address: account.nestedSegwit.address },
        { addressKey: 'taproot', address: account.taproot.address },
        { addressKey: 'legacy', address: account.legacy.address },
    ];
    for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i].address;
        const addressKey = addresses[i].addressKey;
        const { utxos, alkaneUtxos, spendableTotalBalance, spendableUtxos, runeUtxos, ordUtxos, pendingUtxos, pendingTotalBalance, totalBalance, } = await (0, exports.addressUtxos)({
            address,
            provider,
        });
        accountSpendableTotalBalance += spendableTotalBalance;
        accountSpendableTotalUtxos.push(...spendableUtxos);
        accountPendingTotalBalance += pendingTotalBalance;
        accountUtxos.push(...utxos);
        accountTotalBalance += totalBalance;
        accounts[addressKey] = {
            utxos,
            alkaneUtxos,
            spendableTotalBalance,
            spendableUtxos,
            runeUtxos,
            ordUtxos,
            pendingUtxos,
            pendingTotalBalance,
            totalBalance,
        };
    }
    return {
        accountUtxos,
        accountTotalBalance,
        accountSpendableTotalUtxos,
        accountSpendableTotalBalance,
        accountPendingTotalBalance,
        accounts,
    };
};
exports.accountUtxos = accountUtxos;
const selectUtxos = (utxos, spendStrategy) => {
    const addressMap = new Map();
    utxos.forEach((utxo) => {
        const addressKey = (0, utils_1.getAddressKey)(utxo.address);
        if (spendStrategy.addressOrder.includes(addressKey)) {
            if (!addressMap.has(addressKey)) {
                addressMap.set(addressKey, []);
            }
            addressMap.get(addressKey).push(utxo);
        }
    });
    return spendStrategy.addressOrder.flatMap((addressKey) => {
        const utxosForAddress = addressMap.get(addressKey) || [];
        return utxosForAddress.sort((a, b) => (spendStrategy.utxoSortGreatestToLeast ? b.satoshis : a.satoshis) -
            (spendStrategy.utxoSortGreatestToLeast ? a.satoshis : b.satoshis));
    });
};
exports.selectUtxos = selectUtxos;
const selectSpendableUtxos = (utxos, spendStrategy) => {
    const paymentUtxos = utxos.filter((u) => u.indexed &&
        u.inscriptions.length <= 0 &&
        Object.keys(u.runes).length <= 0 &&
        Object.keys(u.alkanes).length <= 0 &&
        u.satoshis !== 546 &&
        u.satoshis !== 330);
    const buckets = new Map();
    for (const u of paymentUtxos) {
        const key = (0, utils_1.getAddressKey)(u.address);
        if (!spendStrategy.addressOrder.includes(key))
            continue;
        (buckets.get(key) ?? buckets.set(key, []).get(key)).push(u);
    }
    const orderedUtxos = spendStrategy.addressOrder.flatMap((key) => {
        const list = buckets.get(key) ?? [];
        return list.sort((a, b) => spendStrategy.utxoSortGreatestToLeast
            ? b.satoshis - a.satoshis
            : a.satoshis - b.satoshis);
    });
    const totalAmount = orderedUtxos.reduce((sum, { satoshis }) => sum + satoshis, 0);
    return { utxos: orderedUtxos, totalAmount };
};
exports.selectSpendableUtxos = selectSpendableUtxos;
const selectAlkanesUtxos = ({ utxos, greatestToLeast, alkaneId, targetNumberOfAlkanes, }) => {
    const idKey = `${alkaneId.block}:${alkaneId.tx}`;
    const withBalance = utxos.map((u) => ({
        utxo: u,
        balance: Number(u.alkanes[idKey]?.value),
    }));
    withBalance.sort((a, b) => greatestToLeast ? b.balance - a.balance : a.balance - b.balance);
    let totalAmount = 0;
    let totalBalance = 0;
    const alkanesUtxos = [];
    for (const { utxo, balance } of withBalance) {
        if (totalBalance >= targetNumberOfAlkanes)
            break;
        if (balance > 0) {
            alkanesUtxos.push(utxo);
            totalAmount += utxo.satoshis;
            totalBalance += balance;
        }
    }
    if (totalBalance < targetNumberOfAlkanes) {
        throw new errors_1.OylTransactionError(new Error('Insufficient balance of alkanes.'));
    }
    return { utxos: alkanesUtxos, totalAmount, totalBalance };
};
exports.selectAlkanesUtxos = selectAlkanesUtxos;
//# sourceMappingURL=utxo.js.map