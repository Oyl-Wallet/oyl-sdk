import { Provider } from '../provider/provider'
import * as dotenv from 'dotenv'
import * as bitcoin from 'bitcoinjs-lib'
import { addressUtxos, selectUtxos, accountUtxos } from './utxo'
import { accountUtxos as accountUtxosFixture } from '../__fixtures__/utxos'
import { Account } from '../account/account'
import { toTxId } from '../alkanes'
import { EsploraUtxo, FormattedUtxo } from './types'

dotenv.config()

const provider = new Provider({
  url: 'https://mainnet.sandshrew.io',
  projectId: process.env.SANDSHREW_PROJECT_ID!,
  network: bitcoin.networks.bitcoin,
  networkType: 'mainnet',
})

const testFormattedUtxos: FormattedUtxo[] = [
  {
    txId: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b274',
    outputIndex: 2,
    satoshis: 100000,
    confirmations: 3,
    scriptPk:
      'b7fbbedbe61b51bf4e41e3517b8232f31c64f3b67ffd2d8eecff12fc7db4cae5',
    address: 'bc1pklamaklxrdgm7njpudghhq3j7vwxfuak0l7jmrhvluf0cld5etjsga00nj',
    inscriptions: [],
    runes: {},
    alkanes: {},
    indexed: true,
  },
  {
    txId: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b275',
    outputIndex: 0,
    satoshis: 50000,
    confirmations: 3,
    scriptPk:
      'b7fbbedbe61b51bf4e41e3517b8232f31c64f3b67ffd2d8eecff12fc7db4cae5',
    address: 'bc1pklamaklxrdgm7njpudghhq3j7vwxfuak0l7jmrhvluf0cld5etjsga00nj',
    inscriptions: [],
    runes: {},
    alkanes: {},
    indexed: true,
  },
]

const testEsploraUtxos: EsploraUtxo[] = [
  // [0] Confirmed/indexed tx without inscriptions or runes
  {
    txid: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b274',
    vout: 2,
    status: {
      confirmed: true,
      block_height: 280,
      block_hash:
        '519a8fa6b439da658a83b231486958a26c76ca92811d1e5cc7bcb94bd574c20f',
      block_time: 1719240702,
    },
    value: 100000,
  },
  // [1] Confirmed/indexed tx without inscriptions or runes
  {
    txid: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b275',
    vout: 0,
    status: {
      confirmed: true,
      block_height: 280,
      block_hash:
        '519a8fa6b439da658a83b231486958a26c76ca92811d1e5cc7bcb94bd574c20f',
      block_time: 1719240701,
    },
    value: 50000,
  },
  // [2] Confirmed tx that has not been indexed by ord
  {
    txid: '43c1fb9af87e2ef21d216da3e35727ee1dad32afd6fd73510fc6f42a48229a7f',
    vout: 0,
    status: {
      confirmed: true,
      block_height: 280,
      block_hash:
        '519a8fa6b439da658a83b231486958a26c76ca92811d1e5cc7bcb94bd574c20f',
      block_time: 1719240701,
    },
    value: 546,
  },
  // [3] Unconfirmed tx
  {
    txid: 'ad90d820fc7f25e32c775ccf9f90d3669864fef436abcd44776f03d4a11540c4',
    vout: 0,
    status: {
      confirmed: false,
    },
    value: 50000,
  },
  // [4] Confirmed/indexed tx with inscriptions
  {
    txid: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b276',
    vout: 1,
    status: {
      confirmed: true,
      block_height: 280,
      block_hash:
        '519a8fa6b439da658a83b231486958a26c76ca92811d1e5cc7bcb94bd574c20f',
      block_time: 1719240703,
    },
    value: 546,
  },
  // [5] Confirmed/indexed tx with runes
  {
    txid: 'a24dd4edc2fdfa769ba45cb480d392b806ad12533b097c84285d808d65b9f923',
    vout: 1,
    status: {
      confirmed: true,
      block_height: 280,
      block_hash:
        '519a8fa6b439da658a83b231486958a26c76ca92811d1e5cc7bcb94bd574c20f',
      block_time: 1719240704,
    },
    value: 546,
  },
]

const testOrdTxOutputs = [
  // [0] Confirmed/indexed tx without inscriptions or runes
  {
    address: 'bc1pklamaklxrdgm7njpudghhq3j7vwxfuak0l7jmrhvluf0cld5etjsga00nj',
    indexed: true,
    inscriptions: [],
    runes: {},
    sat_ranges: [[1956902243257152, 1956902243257698]],
    script_pubkey:
      'OP_PUSHNUM_1 OP_PUSHBYTES_32 b7fbbedbe61b51bf4e41e3517b8232f31c64f3b67ffd2d8eecff12fc7db4cae5',
    spent: false,
    transaction:
      '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b274',
    value: 100000,
  },
  // [1] Confirmed/indexed tx without inscriptions or runes
  {
    address: 'bc1pklamaklxrdgm7njpudghhq3j7vwxfuak0l7jmrhvluf0cld5etjsga00nj',
    indexed: true,
    inscriptions: [],
    runes: {},
    sat_ranges: [[1956902243257152, 1956902243257698]],
    script_pubkey:
      'OP_PUSHNUM_1 OP_PUSHBYTES_32 b7fbbedbe61b51bf4e41e3517b8232f31c64f3b67ffd2d8eecff12fc7db4cae5',
    spent: false,
    transaction:
      '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b275',
    value: 50000,
  },
  // [2] Confirmed tx that has not been indexed by ord
  {
    address: 'bc1pklamaklxrdgm7njpudghhq3j7vwxfuak0l7jmrhvluf0cld5etjsga00nj',
    indexed: false,
    inscriptions: [],
    runes: {},
    sat_ranges: [],
    script_pubkey:
      'OP_PUSHNUM_1 OP_PUSHBYTES_32 b7fbbedbe61b51bf4e41e3517b8232f31c64f3b67ffd2d8eecff12fc7db4cae5',
    spent: false,
    transaction:
      '43c1fb9af87e2ef21d216da3e35727ee1dad32afd6fd73510fc6f42a48229a7f',
    value: 546,
  },
  // [3] Unconfirmed tx
  {
    address: 'bc1pklamaklxrdgm7njpudghhq3j7vwxfuak0l7jmrhvluf0cld5etjsga00nj',
    indexed: false,
    inscriptions: [],
    runes: {},
    sat_ranges: [],
    script_pubkey:
      'OP_PUSHNUM_1 OP_PUSHBYTES_32 b7fbbedbe61b51bf4e41e3517b8232f31c64f3b67ffd2d8eecff12fc7db4cae5',
    spent: false,
    transaction:
      'ad90d820fc7f25e32c775ccf9f90d3669864fef436abcd44776f03d4a11540c4',
    value: 546,
  },
  // [4] Confirmed/indexed tx with inscriptions
  {
    address: 'bc1pklamaklxrdgm7njpudghhq3j7vwxfuak0l7jmrhvluf0cld5etjsga00nj',
    indexed: true,
    inscriptions: [
      'e605df4731c8773902dd6f56bfbec815db26d530da00dbdc697e35a992269987i0',
    ],
    runes: {},
    sat_ranges: [[1956902243257152, 1956902243257698]],
    script_pubkey:
      'OP_PUSHNUM_1 OP_PUSHBYTES_32 b7fbbedbe61b51bf4e41e3517b8232f31c64f3b67ffd2d8eecff12fc7db4cae5',
    spent: false,
    transaction:
      '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b277',
    value: 25000,
  },
  // [5] Confirmed/indexed tx with runes
  {
    address: 'bc1pklamaklxrdgm7njpudghhq3j7vwxfuak0l7jmrhvluf0cld5etjsga00nj',
    indexed: true,
    inscriptions: [],
    runes: {
      RUNE: {},
    },
    sat_ranges: [[1956902243257152, 1956902243257698]],
    script_pubkey:
      'OP_PUSHNUM_1 OP_PUSHBYTES_32 b7fbbedbe61b51bf4e41e3517b8232f31c64f3b67ffd2d8eecff12fc7db4cae5',
    spent: false,
    transaction:
      'a24dd4edc2fdfa769ba45cb480d392b806ad12533b097c84285d808d65b9f923',
    value: 546,
  },
]

const testEsploraTxInfo = [
  // [0] Confirmed/indexed tx without inscriptions or runes
  {
    txid: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b274',
    version: 2,
    locktime: 0,
    vin: [],
    vout: [
      {},
      {},
      {
        scriptpubkey:
          'b7fbbedbe61b51bf4e41e3517b8232f31c64f3b67ffd2d8eecff12fc7db4cae5',
        scriptpubkey_asm:
          'OP_0 OP_PUSHBYTES_20 c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2',
        scriptpubkey_type: 'v0_p2wpkh',
        scriptpubkey_address: 'bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx',
        value: 200000,
      },
    ],
    size: 261,
    weight: 714,
    fee: 302,
    status: {
      confirmed: true,
      block_height: 280,
      block_hash:
        '519a8fa6b439da658a83b231486958a26c76ca92811d1e5cc7bcb94bd574c20f',
      block_time: 1719240702,
    },
  },
  // [1] Confirmed/indexed tx without inscriptions or runes
  {
    txid: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b275',
    version: 2,
    locktime: 0,
    vin: [],
    vout: [
      {
        scriptpubkey:
          'b7fbbedbe61b51bf4e41e3517b8232f31c64f3b67ffd2d8eecff12fc7db4cae5',
        scriptpubkey_asm:
          'OP_PUSHNUM_1 OP_PUSHBYTES_32 b7fbbedbe61b51bf4e41e3517b8232f31c64f3b67ffd2d8eecff12fc7db4cae5',
        scriptpubkey_type: 'v1_p2tr',
        scriptpubkey_address:
          'bc1pklamaklxrdgm7njpudghhq3j7vwxfuak0l7jmrhvluf0cld5etjsga00nj',
        value: 50000,
      },
    ],
    size: 261,
    weight: 714,
    fee: 302,
    status: {
      confirmed: true,
      block_height: 280,
      block_hash:
        '519a8fa6b439da658a83b231486958a26c76ca92811d1e5cc7bcb94bd574c20f',
      block_time: 1719240702,
    },
  },
  // [2] Confirmed tx that has not been indexed by ord
  {
    txid: '43c1fb9af87e2ef21d216da3e35727ee1dad32afd6fd73510fc6f42a48229a7f',
    version: 2,
    locktime: 0,
    vin: [],
    vout: [
      {
        scriptpubkey:
          'b7fbbedbe61b51bf4e41e3517b8232f31c64f3b67ffd2d8eecff12fc7db4cae5',
        scriptpubkey_asm:
          'OP_PUSHNUM_1 OP_PUSHBYTES_32 b7fbbedbe61b51bf4e41e3517b8232f31c64f3b67ffd2d8eecff12fc7db4cae5',
        scriptpubkey_type: 'v1_p2tr',
        scriptpubkey_address:
          'bc1pklamaklxrdgm7njpudghhq3j7vwxfuak0l7jmrhvluf0cld5etjsga00nj',
        value: 546,
      },
    ],
    size: 261,
    weight: 714,
    fee: 302,
    status: {
      confirmed: true,
      block_height: 280,
      block_hash:
        '519a8fa6b439da658a83b231486958a26c76ca92811d1e5cc7bcb94bd574c20f',
      block_time: 1719240702,
    },
  },
  // [3] Unconfirmed tx
  {
    txid: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b274',
    version: 2,
    locktime: 0,
    vin: [],
    vout: [
      {
        scriptpubkey:
          'b7fbbedbe61b51bf4e41e3517b8232f31c64f3b67ffd2d8eecff12fc7db4cae5',
        scriptpubkey_asm:
          'OP_0 OP_PUSHBYTES_20 c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2',
        scriptpubkey_type: 'v0_p2wpkh',
        scriptpubkey_address: 'bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx',
        value: 546,
      },
    ],
    size: 261,
    weight: 714,
    fee: 302,
    status: {
      confirmed: false,
    },
  },
  // [4] Confirmed/indexed tx with inscriptions
  {
    txid: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b276',
    version: 2,
    locktime: 0,
    vin: [],
    vout: [
      {
        scriptpubkey:
          'b7fbbedbe61b51bf4e41e3517b8232f31c64f3b67ffd2d8eecff12fc7db4cae1',
        scriptpubkey_asm:
          'OP_PUSHNUM_1 OP_PUSHBYTES_32 b7fbbedbe61b51bf4e41e3517b8232f31c64f3b67ffd2d8eecff12fc7db4cae5',
        scriptpubkey_type: 'v1_p2tr',
        scriptpubkey_address:
          'bc1pklamaklxrdgm7njpudghhq3j7vwxfuak0l7jmrhvluf0cld5etjsga00nj',
        value: 25000,
      },
      {
        scriptpubkey: '0014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2',
        scriptpubkey_asm:
          'OP_0 OP_PUSHBYTES_20 c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2',
        scriptpubkey_type: 'v0_p2wpkh',
        scriptpubkey_address: 'bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx',
        value: 546,
      },
    ],
    size: 261,
    weight: 714,
    fee: 302,
    status: {
      confirmed: true,
      block_height: 280,
      block_hash:
        '519a8fa6b439da658a83b231486958a26c76ca92811d1e5cc7bcb94bd574c20f',
      block_time: 1719240702,
    },
  },
  // [5] Confirmed/indexed tx with runes
  {
    txid: 'a24dd4edc2fdfa769ba45cb480d392b806ad12533b097c84285d808d65b9f923',
    version: 2,
    locktime: 0,
    vin: [],
    vout: [
      {},
      {
        scriptpubkey: '0014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2',
        scriptpubkey_asm:
          'OP_0 OP_PUSHBYTES_20 c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2',
        scriptpubkey_type: 'v0_p2wpkh',
        scriptpubkey_address: 'bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx',
        value: 546,
      },
    ],
    size: 261,
    weight: 714,
    fee: 302,
    status: {
      confirmed: true,
      block_height: 280,
      block_hash:
        '519a8fa6b439da658a83b231486958a26c76ca92811d1e5cc7bcb94bd574c20f',
      block_time: 1719240702,
    },
  },
]

// Add test alkane data for the updated implementation
const testAlkanes = [
  // No alkanes for the first two UTXOs (null values)
  null,
  null,
  // Alkane for third UTXO
  {
    outpoint: {
      txid: '3a7f22842a6ffc0135d76ffd2ad3add1ee72753ead36d21f22e7ef89afb1fc43',
      vout: 0,
    },
    output: {
      value: 546,
      script:
        'b7fbbedbe61b51bf4e41e3517b8232f31c64f3b67ffd2d8eecff12fc7db4cae5',
    },
  },
  // No alkane for unconfirmed tx
  null,
  // No alkane for inscription
  null,
  // No alkane for rune
  null,
]

// Mock the multicall results for the new implementation
const mockMultiCallResponses = [
  // First UTXO
  [
    { result: testOrdTxOutputs[0] }, // ord_output
    { result: testEsploraTxInfo[0] }, // esplora_tx
  ],
  // Second UTXO
  [{ result: testOrdTxOutputs[1] }, { result: testEsploraTxInfo[1] }],
  // Third UTXO (with alkane)
  [
    { result: testOrdTxOutputs[2] },
    { result: testEsploraTxInfo[2] },
    { result: [testAlkanes[2]] },
  ],
  // Fourth UTXO (unconfirmed)
  [{ result: testOrdTxOutputs[3] }, { result: testEsploraTxInfo[3] }],
  // Fifth UTXO (with inscription)
  [{ result: testOrdTxOutputs[4] }, { result: testEsploraTxInfo[4] }],
  // Sixth UTXO (with rune)
  [{ result: testOrdTxOutputs[5] }, { result: testEsploraTxInfo[5] }],
]

const mockSandshrewMultiCall = jest.fn().mockImplementation((calls) => {
  // First call is for retrieving UTXOs and block count
  if (calls[0][0] === 'esplora_address::utxo') {
    return Promise.resolve([
      { result: testEsploraUtxos },
      { result: 283 },
      {
        result: {
          outpoints: [],
        },
      },
    ])
  }
  // For UTXO processing, return mocked responses based on the txid:vout
  const txIdVout = calls[0][1][0]
  const index = testEsploraUtxos.findIndex(
    (utxo) => `${utxo.txid}:${utxo.vout}` === txIdVout
  )

  if (index >= 0 && index < mockMultiCallResponses.length) {
    return Promise.resolve(mockMultiCallResponses[index])
  }

  return Promise.resolve([])
})

const mockAlkanesByAddress = jest.fn().mockResolvedValue([])

jest.mock('../provider/provider', () => {
  return {
    Provider: jest.fn().mockImplementation(() => ({
      network: bitcoin.networks.bitcoin,
      sandshrew: {
        multiCall: (calls) => mockSandshrewMultiCall(calls),
      },
      esplora: {
        getTxInfo: () => Promise.resolve({}),
      },
      ord: {
        getTxOutput: () => Promise.resolve({}),
      },
      alkanes: {
        getAlkanesByAddress: () => mockAlkanesByAddress(),
      },
    })),
  }
})

// Add testAccount definition at the top with other test data
const testAccount = {
  taproot: {
    address: 'bc1pklamaklxrdgm7njpudghhq3j7vwxfuak0l7jmrhvluf0cld5etjsga00nj',
    pubkey: 'mock_taproot_pubkey',
    pubKeyXOnly: 'mock_taproot_pubkey_xonly',
    hdPath: "m/86'/1'/0'/0/0",
  },
  nativeSegwit: {
    address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx',
    pubkey: 'mock_nativeSegwit_pubkey',
    hdPath: "m/84'/1'/0'/0/0",
  },
  nestedSegwit: {
    address: '2N1LGaGg836mqSQqiuUBLfcyGBhyZbremDX',
    pubkey: 'mock_nestedSegwit_pubkey',
    hdPath: "m/49'/1'/0'/0/0",
  },
  legacy: {
    address: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
    pubkey: 'mock_legacy_pubkey',
    hdPath: "m/44'/1'/0'/0/0",
  },
  spendStrategy: {
    addressOrder: ['taproot', 'nativeSegwit', 'nestedSegwit', 'legacy'],
    utxoSortGreatestToLeast: true,
    changeAddress: 'taproot',
  },
  network: bitcoin.networks.regtest,
} as Account

describe('utxo', () => {
  it('addressUtxos', async () => {
    const result = await addressUtxos({
      address: 'bc1pklamaklxrdgm7njpudghhq3j7vwxfuak0l7jmrhvluf0cld5etjsga00nj',
      provider: provider,
    })

    expect(result.spendableUtxos).toEqual(testFormattedUtxos)
    expect(result.spendableTotalBalance).toEqual(150000)
    expect(mockSandshrewMultiCall).toHaveBeenCalled()
  })

  describe('selectUtxos', () => {
    it('returns the right utxos for smart spend with nativeSegwit first', async () => {
      const result = selectUtxos(accountUtxosFixture, {
        addressOrder: ['nativeSegwit', 'nestedSegwit', 'taproot', 'legacy'],
        utxoSortGreatestToLeast: true,
        changeAddress: 'nativeSegwit',
      })

      // Native SegWit
      expect(result[0].address).toMatch(/bcrt1q/)
      expect(result[1].address).toMatch(/bcrt1q/)
      expect(result[0].satoshis).toBeGreaterThan(result[1].satoshis)

      // Nested Segwit
      expect(result[2].address).toMatch(/2N/)
      expect(result[3].address).toMatch(/2N/)
      expect(result[2].satoshis).toBeGreaterThan(result[3].satoshis)

      // Taproot
      expect(result[4].address).toMatch(/bcrt1p/)
      expect(result[5].address).toMatch(/bcrt1p/)
      expect(result[4].satoshis).toBeGreaterThan(result[5].satoshis)

      // Legacy
      expect(result[6].address).toMatch(/m/)
      expect(result[7].address).toMatch(/m/)
      expect(result[6].satoshis).toBeGreaterThan(result[7].satoshis)
    })

    it('returns the right utxos when sorting from least to greatest', async () => {
      const result = selectUtxos(accountUtxosFixture, {
        addressOrder: ['nativeSegwit', 'nestedSegwit', 'taproot', 'legacy'],
        utxoSortGreatestToLeast: false,
        changeAddress: 'nativeSegwit',
      })

      // Native SegWit
      expect(result[0].address).toMatch(/bcrt1q/)
      expect(result[1].address).toMatch(/bcrt1q/)
      expect(result[0].satoshis).toBeLessThan(result[1].satoshis)

      // Nested Segwit
      expect(result[2].address).toMatch(/2N/)
      expect(result[3].address).toMatch(/2N/)
      expect(result[2].satoshis).toBeLessThan(result[3].satoshis)

      // Taproot
      expect(result[4].address).toMatch(/bcrt1p/)
      expect(result[5].address).toMatch(/bcrt1p/)
      expect(result[4].satoshis).toBeLessThan(result[5].satoshis)

      // Legacy
      expect(result[6].address).toMatch(/m/)
      expect(result[7].address).toMatch(/m/)
      expect(result[6].satoshis).toBeLessThan(result[7].satoshis)
    })

    it('returns the right utxos for smart spend (new default taproot first)', async () => {
      const result = selectUtxos(accountUtxosFixture, {
        addressOrder: ['taproot', 'nativeSegwit', 'nestedSegwit', 'legacy'],
        utxoSortGreatestToLeast: true,
        changeAddress: 'taproot',
      })

      // Taproot (should be first now)
      expect(result[0].address).toMatch(/bcrt1p/)
      expect(result[1].address).toMatch(/bcrt1p/)
      expect(result[0].satoshis).toBeGreaterThan(result[1].satoshis)

      // Native SegWit
      expect(result[2].address).toMatch(/bcrt1q/)
      expect(result[3].address).toMatch(/bcrt1q/)
      expect(result[2].satoshis).toBeGreaterThan(result[3].satoshis)

      // Nested Segwit
      expect(result[4].address).toMatch(/2N/)
      expect(result[5].address).toMatch(/2N/)
      expect(result[4].satoshis).toBeGreaterThan(result[5].satoshis)

      // Legacy
      expect(result[6].address).toMatch(/m/)
      expect(result[7].address).toMatch(/m/)
      expect(result[6].satoshis).toBeGreaterThan(result[7].satoshis)
    })

    it('returns the right utxos for single address', async () => {
      const result = selectUtxos(accountUtxosFixture, {
        addressOrder: ['taproot'],
        utxoSortGreatestToLeast: true,
        changeAddress: 'nativeSegwit',
      })

      // Taproot
      expect(result[0].address).toMatch(/bcrt1p/)
      expect(result[1].address).toMatch(/bcrt1p/)
      expect(result[0].satoshis).toBeGreaterThan(result[1].satoshis)
    })

    it('handles utxoSortGreatestToLeast correctly for mixed address types', async () => {
      // Create a test fixture with mixed address types and varying UTXO values
      const mixedUtxosFixture: FormattedUtxo[] = [
        {
          txId: 'tx1',
          outputIndex: 0,
          satoshis: 50000,
          address: testAccount.nativeSegwit.address,
          inscriptions: [],
          runes: {},
          alkanes: {},
          confirmations: 1,
          scriptPk: 'mock_script1',
          indexed: true,
        },
        {
          txId: 'tx2',
          outputIndex: 0,
          satoshis: 100000,
          address: testAccount.taproot.address,
          inscriptions: [],
          runes: {},
          alkanes: {},
          confirmations: 1,
          scriptPk: 'mock_script2',
          indexed: true,
        },
        {
          txId: 'tx3',
          outputIndex: 0,
          satoshis: 75000,
          address: testAccount.nativeSegwit.address,
          inscriptions: [],
          runes: {},
          alkanes: {},
          confirmations: 1,
          scriptPk: 'mock_script3',
          indexed: true,
        },
        {
          txId: 'tx4',
          outputIndex: 0,
          satoshis: 25000,
          address: testAccount.taproot.address,
          inscriptions: [],
          runes: {},
          alkanes: {},
          confirmations: 1,
          scriptPk: 'mock_script4',
          indexed: true,
        },
      ]

      // Test greatest to least sorting
      const greatestToLeast = selectUtxos(mixedUtxosFixture, {
        addressOrder: ['nativeSegwit', 'taproot'],
        utxoSortGreatestToLeast: true,
        changeAddress: 'nativeSegwit',
      })

      // Verify nativeSegwit UTXOs are sorted greatest to least
      expect(greatestToLeast[0].satoshis).toBe(75000)
      expect(greatestToLeast[1].satoshis).toBe(50000)

      // Verify taproot UTXOs are sorted greatest to least
      expect(greatestToLeast[2].satoshis).toBe(100000)
      expect(greatestToLeast[3].satoshis).toBe(25000)

      // Test least to greatest sorting
      const leastToGreatest = selectUtxos(mixedUtxosFixture, {
        addressOrder: ['nativeSegwit', 'taproot'],
        utxoSortGreatestToLeast: false,
        changeAddress: 'nativeSegwit',
      })

      // Verify nativeSegwit UTXOs are sorted least to greatest
      expect(leastToGreatest[0].satoshis).toBe(50000)
      expect(leastToGreatest[1].satoshis).toBe(75000)

      // Verify taproot UTXOs are sorted least to greatest
      expect(leastToGreatest[2].satoshis).toBe(25000)
      expect(leastToGreatest[3].satoshis).toBe(100000)
    })

    it('handles account.spendStrategy.addressOrder correctly', async () => {
      // Create a test fixture with UTXOs across all address types
      const addressOrderUtxosFixture: FormattedUtxo[] = [
        // Native SegWit UTXOs (should be spent first)
        {
          txId: 'native_tx1',
          outputIndex: 0,
          satoshis: 50000,
          address: testAccount.nativeSegwit.address,
          inscriptions: [],
          runes: {},
          alkanes: {},
          confirmations: 1,
          scriptPk: 'mock_script1',
          indexed: true,
        },
        {
          txId: 'native_tx2',
          outputIndex: 0,
          satoshis: 75000,
          address: testAccount.nativeSegwit.address,
          inscriptions: [],
          runes: {},
          alkanes: {},
          confirmations: 1,
          scriptPk: 'mock_script2',
          indexed: true,
        },
        // Nested SegWit UTXOs (should be spent second)
        {
          txId: 'nested_tx1',
          outputIndex: 0,
          satoshis: 100000,
          address: testAccount.nestedSegwit.address,
          inscriptions: [],
          runes: {},
          alkanes: {},
          confirmations: 1,
          scriptPk: 'mock_script3',
          indexed: true,
        },
        {
          txId: 'nested_tx2',
          outputIndex: 0,
          satoshis: 25000,
          address: testAccount.nestedSegwit.address,
          inscriptions: [],
          runes: {},
          alkanes: {},
          confirmations: 1,
          scriptPk: 'mock_script4',
          indexed: true,
        },
        // Taproot UTXOs (should be spent third)
        {
          txId: 'taproot_tx1',
          outputIndex: 0,
          satoshis: 150000,
          address: testAccount.taproot.address,
          inscriptions: [],
          runes: {},
          alkanes: {},
          confirmations: 1,
          scriptPk: 'mock_script5',
          indexed: true,
        },
        {
          txId: 'taproot_tx2',
          outputIndex: 0,
          satoshis: 50000,
          address: testAccount.taproot.address,
          inscriptions: [],
          runes: {},
          alkanes: {},
          confirmations: 1,
          scriptPk: 'mock_script6',
          indexed: true,
        },
        // Legacy UTXOs (should be spent last)
        {
          txId: 'legacy_tx1',
          outputIndex: 0,
          satoshis: 200000,
          address: testAccount.legacy.address,
          inscriptions: [],
          runes: {},
          alkanes: {},
          confirmations: 1,
          scriptPk: 'mock_script7',
          indexed: true,
        },
        {
          txId: 'legacy_tx2',
          outputIndex: 0,
          satoshis: 100000,
          address: testAccount.legacy.address,
          inscriptions: [],
          runes: {},
          alkanes: {},
          confirmations: 1,
          scriptPk: 'mock_script8',
          indexed: true,
        },
      ]

      // Test 1: Verify address order and exclusion of non-strategy addresses
      const result1 = selectUtxos(addressOrderUtxosFixture, {
        addressOrder: ['nativeSegwit', 'nestedSegwit', 'taproot', 'legacy'],
        utxoSortGreatestToLeast: true,
        changeAddress: 'nativeSegwit',
      })

      // Verify address order is maintained
      expect(result1[0].address).toMatch(/bc1q/) // nativeSegwit
      expect(result1[1].address).toMatch(/bc1q/) // nativeSegwit
      expect(result1[2].address).toMatch(/2N/) // nestedSegwit
      expect(result1[3].address).toMatch(/2N/) // nestedSegwit
      expect(result1[4].address).toMatch(/bc1p/) // taproot
      expect(result1[5].address).toMatch(/bc1p/) // taproot
      expect(result1[6].address).toMatch(/m/) // legacy
      expect(result1[7].address).toMatch(/m/) // legacy

      // Test 2: Verify UTXOs are sorted within each address type
      // Native SegWit
      expect(result1[0].satoshis).toBe(75000)
      expect(result1[1].satoshis).toBe(50000)
      // Nested SegWit
      expect(result1[2].satoshis).toBe(100000)
      expect(result1[3].satoshis).toBe(25000)
      // Taproot
      expect(result1[4].satoshis).toBe(150000)
      expect(result1[5].satoshis).toBe(50000)
      // Legacy
      expect(result1[6].satoshis).toBe(200000)
      expect(result1[7].satoshis).toBe(100000)

      // Test 3: Verify partial address order (exclude some addresses)
      const result2 = selectUtxos(addressOrderUtxosFixture, {
        addressOrder: ['nativeSegwit', 'taproot'], // Exclude nestedSegwit and legacy
        utxoSortGreatestToLeast: true,
        changeAddress: 'nativeSegwit',
      })

      // Should only include nativeSegwit and taproot UTXOs
      expect(result2).toHaveLength(4)
      expect(result2[0].address).toMatch(/bc1q/) // nativeSegwit
      expect(result2[1].address).toMatch(/bc1q/) // nativeSegwit
      expect(result2[2].address).toMatch(/bc1p/) // taproot
      expect(result2[3].address).toMatch(/bc1p/) // taproot

      // Test 4: Verify sorting is maintained within each address type
      // Native SegWit
      expect(result2[0].satoshis).toBe(75000)
      expect(result2[1].satoshis).toBe(50000)
      // Taproot
      expect(result2[2].satoshis).toBe(150000)
      expect(result2[3].satoshis).toBe(50000)

      // Test 5: Verify least to greatest sorting within address order
      const result3 = selectUtxos(addressOrderUtxosFixture, {
        addressOrder: ['nativeSegwit', 'nestedSegwit', 'taproot', 'legacy'],
        utxoSortGreatestToLeast: false,
        changeAddress: 'nativeSegwit',
      })

      // Verify address order is maintained but UTXOs are sorted least to greatest
      expect(result3[0].address).toMatch(/bc1q/) // nativeSegwit
      expect(result3[1].address).toMatch(/bc1q/) // nativeSegwit
      expect(result3[0].satoshis).toBe(50000)
      expect(result3[1].satoshis).toBe(75000)

      expect(result3[2].address).toMatch(/2N/) // nestedSegwit
      expect(result3[3].address).toMatch(/2N/) // nestedSegwit
      expect(result3[2].satoshis).toBe(25000)
      expect(result3[3].satoshis).toBe(100000)
    })
  })

  describe('addressUtxos', () => {
    it('should filter out 330 satoshi UTXOs from spendable UTXOs', async () => {
      // Add test UTXOs with special values
      const specialValueUtxos: EsploraUtxo[] = [
        {
          txid: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b276',
          vout: 0,
          status: {
            confirmed: true,
            block_height: 280,
            block_hash:
              '519a8fa6b439da658a83b231486958a26c76ca92811d1e5cc7bcb94bd574c20f',
            block_time: 1719240702,
          },
          value: 546, // Dust UTXO that might contain inscriptions
        },
        {
          txid: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b277',
          vout: 0,
          status: {
            confirmed: true,
            block_height: 280,
            block_hash:
              '519a8fa6b439da658a83b231486958a26c76ca92811d1e5cc7bcb94bd574c20f',
            block_time: 1719240702,
          },
          value: 330, // Another special value UTXO
        },
        {
          txid: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b278',
          vout: 0,
          status: {
            confirmed: true,
            block_height: 280,
            block_hash:
              '519a8fa6b439da658a83b231486958a26c76ca92811d1e5cc7bcb94bd574c20f',
            block_time: 1719240702,
          },
          value: 1000, // Regular spendable UTXO
        },
      ]

      // Mock the multiCall to return our special value UTXOs
      mockSandshrewMultiCall.mockImplementationOnce(() =>
        Promise.resolve([
          { result: specialValueUtxos },
          { result: 283 },
          {
            result: {
              outpoints: [],
            },
          },
        ])
      )

      // Mock the subsequent multiCalls for each UTXO
      mockSandshrewMultiCall.mockImplementation((calls) => {
        const txIdVout = calls[0][1][0]
        const index = specialValueUtxos.findIndex(
          (utxo) => `${utxo.txid}:${utxo.vout}` === txIdVout
        )

        if (index >= 0) {
          return Promise.resolve([
            { result: { indexed: true, inscriptions: [], runes: {} } }, // ord_output
            { result: { vout: [{ scriptpubkey: 'mock_script' }] } }, // esplora_tx
          ])
        }

        return Promise.resolve([])
      })

      const result = await addressUtxos({
        address:
          'bc1pklamaklxrdgm7njpudghhq3j7vwxfuak0l7jmrhvluf0cld5etjsga00nj',
        provider: provider,
      })

      // Verify that only 330 satoshi UTXOs are filtered out (not 546 anymore)
      expect(result.spendableUtxos).toHaveLength(2)
      expect(result.spendableUtxos.map((utxo) => utxo.satoshis)).toEqual(
        expect.arrayContaining([1000, 546])
      )
      expect(result.spendableUtxos.map((utxo) => utxo.satoshis)).toEqual(
        expect.not.arrayContaining([330])
      )

      // Verify total balances
      expect(result.spendableTotalBalance).toBe(1546) // 546 + 1000
      expect(result.totalBalance).toBe(1876) // 546 + 330 + 1000
    })

    it('should filter out alkanes and runes from spendable utxos', async () => {
      const specialValueUtxos: EsploraUtxo[] = [
        {
          txid: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b277',
          vout: 0,
          status: {
            confirmed: true,
            block_height: 280,
            block_hash:
              '519a8fa6b439da658a83b231486958a26c76ca92811d1e5cc7bcb94bd574c20f',
            block_time: 1719240702,
          },
          value: 1234,
        },
        {
          txid: '72e22e25fa587c01cbd0a86a5927090c9cdf12e47126c99e35b24185c395b257',
          vout: 0,
          status: {
            confirmed: true,
            block_height: 280,
            block_hash:
              '519a8fa6b439da658a83b231486958a26c76ca92811d1e5cc7bcb94bd574c20f',
            block_time: 1719240702,
          },
          value: 5000,
        },
        {
          txid: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b278',
          vout: 0,
          status: {
            confirmed: true,
            block_height: 280,
            block_hash:
              '519a8fa6b439da658a83b231486958a26c76ca92811d1e5cc7bcb94bd574c20f',
            block_time: 1719240702,
          },
          value: 1000,
        },
      ]

      mockSandshrewMultiCall.mockImplementationOnce(() =>
        Promise.resolve([
          { result: specialValueUtxos },
          { result: 283 },
          {
            result: {
              outpoints: [
                {
                  outpoint: {
                    txid: toTxId(
                      '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b278'
                    ),
                    vout: 0,
                  },
                  runes: {
                    rune: {
                      id: {
                        block: '2',
                        tx: '0',
                      },
                    },
                    balance: '2000',
                  },
                },
              ],
            },
          },
        ])
      )

      mockSandshrewMultiCall.mockImplementation((calls) => {
        const txIdVout = calls[0][1][0]
        const index = specialValueUtxos.findIndex(
          (utxo) => `${utxo.txid}:${utxo.vout}` === txIdVout
        )

        // Spendable UTXO
        if (index === 0) {
          return Promise.resolve([
            {
              result: {
                indexed: true,
                inscriptions: [],
                runes: {},
              },
            }, // ord_output
            { result: { vout: [{ scriptpubkey: 'mock_script' }] } }, // esplora_tx
          ])
        }

        // UTXO with Runes
        if (index === 1) {
          return Promise.resolve([
            {
              result: {
                indexed: true,
                inscriptions: [],
                runes: {
                  DIESEL: {
                    amount: 1000000,
                    divisibilty: 5,
                  },
                },
              },
            }, // ord_output
            { result: { vout: [{ scriptpubkey: 'mock_script' }] } }, // esplora_tx
          ])
        }

        // UTXO with Alkanes
        if (index === 2) {
          return Promise.resolve([
            {
              result: {
                indexed: true,
                inscriptions: [],
                runes: {},
              },
            }, // ord_output
            { result: { vout: [{ scriptpubkey: 'mock_script' }] } }, // esplora_tx
          ])
        }

        return Promise.resolve([])
      })

      const result = await addressUtxos({
        address:
          'bc1pklamaklxrdgm7njpudghhq3j7vwxfuak0l7jmrhvluf0cld5etjsga00nj',
        provider: provider,
      })

      expect(result.spendableUtxos).toHaveLength(1)
      expect(result.spendableUtxos.map((utxo) => utxo.satoshis)).toEqual(
        expect.arrayContaining([1234])
      )

      expect(result.spendableTotalBalance).toBe(1234)
      expect(result.totalBalance).toBe(7234)
    })
  })

  describe('accountUtxos', () => {
    it('should handle multiple address types and calculate correct balances', async () => {
      // Mock UTXOs for different address types
      const mockUtxos: Record<string, EsploraUtxo[]> = {
        taproot: [
          {
            txid: 'taproot_tx1',
            vout: 0,
            value: 100000,
            status: { confirmed: true, block_height: 280 },
          },
        ],
        nativeSegwit: [
          {
            txid: 'native_tx1',
            vout: 0,
            value: 50000,
            status: { confirmed: true, block_height: 280 },
          },
        ],
        nestedSegwit: [
          {
            txid: 'nested_tx1',
            vout: 0,
            value: 25000,
            status: { confirmed: true, block_height: 280 },
          },
        ],
        legacy: [
          {
            txid: 'legacy_tx1',
            vout: 0,
            value: 10000,
            status: { confirmed: true, block_height: 280 },
          },
        ],
      }

      // Mock multiCall to return different UTXOs based on address
      mockSandshrewMultiCall.mockImplementation((calls) => {
        // First call is for getting UTXOs and block count
        if (calls[0][0] === 'esplora_address::utxo') {
          const address = calls[0][1][0]
          let utxos: EsploraUtxo[] = []

          if (address.includes('bc1p')) utxos = mockUtxos.taproot
          else if (address.includes('bc1q')) utxos = mockUtxos.nativeSegwit
          else if (address.includes('2')) utxos = mockUtxos.nestedSegwit
          else utxos = mockUtxos.legacy

          return Promise.resolve([
            { result: utxos },
            { result: 283 },
            {
              result: {
                outpoints: [],
              },
            },
          ])
        }

        // Subsequent calls are for processing individual UTXOs
        return Promise.resolve([
          { result: { indexed: true, inscriptions: [], runes: {} } }, // ord_output
          { result: { vout: [{ scriptpubkey: 'mock_script' }] } }, // esplora_tx
        ])
      })

      const result = await accountUtxos({
        account: testAccount,
        provider: provider,
      })

      // Verify total balances
      expect(result.accountTotalBalance).toBe(185000) // 100000 + 50000 + 25000 + 10000
      expect(result.accountSpendableTotalBalance).toBe(185000)
      expect(result.accountPendingTotalBalance).toBe(0)

      // Verify UTXOs per address type
      expect(result.accounts.taproot.spendableUtxos).toHaveLength(1)
      expect(result.accounts.taproot.spendableUtxos[0].satoshis).toBe(100000)

      expect(result.accounts.nativeSegwit.spendableUtxos).toHaveLength(1)
      expect(result.accounts.nativeSegwit.spendableUtxos[0].satoshis).toBe(
        50000
      )

      expect(result.accounts.nestedSegwit.spendableUtxos).toHaveLength(1)
      expect(result.accounts.nestedSegwit.spendableUtxos[0].satoshis).toBe(
        25000
      )

      expect(result.accounts.legacy.spendableUtxos).toHaveLength(1)
      expect(result.accounts.legacy.spendableUtxos[0].satoshis).toBe(10000)
    })

    it('should handle pending UTXOs correctly', async () => {
      // Mock UTXOs with some pending transactions
      const mockUtxos: EsploraUtxo[] = [
        {
          txid: 'confirmed_tx1',
          vout: 0,
          value: 100000,
          status: { confirmed: true, block_height: 280 },
        },
        {
          txid: 'pending_tx1',
          vout: 0,
          value: 50000,
          status: { confirmed: false },
        },
      ]

      // Mock multiCall to handle both initial UTXO fetch and subsequent processing
      mockSandshrewMultiCall.mockImplementation((calls) => {
        // First call is for getting UTXOs and block count
        if (calls[0][0] === 'esplora_address::utxo') {
          // Only return UTXOs for the first address to avoid duplicate counting
          const address = calls[0][1][0]
          if (address === testAccount.taproot.address) {
            return Promise.resolve([
              { result: mockUtxos },
              { result: 283 },
              {
                result: {
                  outpoints: [],
                },
              },
            ])
          }
          return Promise.resolve([
            { result: [] },
            { result: 283 },
            {
              result: {
                outpoints: [],
              },
            },
          ])
        }

        // Subsequent calls are for processing individual UTXOs
        return Promise.resolve([
          { result: { indexed: true, inscriptions: [], runes: {} } }, // ord_output
          { result: { vout: [{ scriptpubkey: 'mock_script' }] } }, // esplora_tx
        ])
      })

      const result = await accountUtxos({
        account: testAccount,
        provider: provider,
      })

      // Verify balances
      expect(result.accountTotalBalance).toBe(150000) // 100000 (confirmed) + 50000 (pending)
      expect(result.accountSpendableTotalBalance).toBe(100000) // Only confirmed UTXOs
      expect(result.accountPendingTotalBalance).toBe(50000) // Only pending UTXOs

      // Verify UTXO categorization
      expect(result.accountSpendableTotalUtxos).toHaveLength(1)
      expect(result.accountSpendableTotalUtxos[0].satoshis).toBe(100000)

      // Verify address-specific balances
      expect(result.accounts.taproot.totalBalance).toBe(150000)
      expect(result.accounts.taproot.spendableTotalBalance).toBe(100000)
      expect(result.accounts.taproot.pendingTotalBalance).toBe(50000)

      // Other addresses should have zero balance
      expect(result.accounts.nativeSegwit.totalBalance).toBe(0)
      expect(result.accounts.nestedSegwit.totalBalance).toBe(0)
      expect(result.accounts.legacy.totalBalance).toBe(0)
    })
  })
})
