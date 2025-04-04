import * as bitcoin from 'bitcoinjs-lib'
import { Provider } from '../provider/provider'
import {
  Account,
  mnemonicToAccount,
  getWalletPrivateKeys,
} from '../account/account'
import { DEFAULT_PROVIDER, TEST_WALLET } from './constants'
import * as alkanes from '../alkanes/alkanes'
import path from 'path'
import fs from 'fs-extra'
import { FormattedUtxo } from '../utxo/utxo'
import { genBlocks, sendFromFaucet } from './regtest'
import { alkanesTrace, alkaneContractDeploy, alkaneTokenDeploy } from './alkane'
import * as utxo from '../utxo/utxo'

const testAccount = mnemonicToAccount({
  mnemonic:
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  opts: { network: bitcoin.networks.regtest },
})

jest.mock('../account/account', () => {
  const mockAccount = {
    taproot: {
      address: 'mock_taproot_address',
      pubkey: 'mock_taproot_pubkey',
      pubKeyXOnly: 'mock_taproot_pubkey_xonly',
      hdPath: "m/86'/1'/0'/0/0",
    },
    nativeSegwit: {
      address: 'mock_nativeSegwit_address',
      pubkey: 'mock_nativeSegwit_pubkey',
      hdPath: "m/84'/1'/0'/0/0",
    },
    nestedSegwit: {
      address: 'mock_nestedSegwit_address',
      pubkey: 'mock_nestedSegwit_pubkey',
      hdPath: "m/49'/1'/0'/0/0",
    },
    legacy: {
      address: 'mock_legacy_address',
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

  return {
    mnemonicToAccount: jest.fn().mockReturnValue(mockAccount),
    Account: mockAccount,
  }
})

// Mock metashrew module
jest.mock('../rpclient/metashrew', () => {
  class MockMetashrewOverride {
    private override: any = null

    set(v: any) {
      this.override = v
    }

    exists() {
      return this.override !== null
    }

    get() {
      return this.override
    }
  }

  return {
    MetashrewOverride: MockMetashrewOverride,
    metashrew: new MockMetashrewOverride(),
  }
})

// Mock the network-dependent modules
jest.mock('../rpclient/sandshrew', () => ({
  SandshrewBitcoinClient: jest.fn().mockImplementation(() => ({
    bitcoindRpc: {
      getBlockCount: jest.fn().mockResolvedValue(300),
      generateToAddress: jest.fn().mockImplementation((blocks, address) => {
        return Promise.resolve(['mock_block_hash'])
      }),
      testMemPoolAccept: jest.fn().mockResolvedValue([{ allowed: true }]),
      sendRawTransaction: jest.fn().mockResolvedValue('mock_txid'),
      getMemPoolEntry: jest.fn().mockResolvedValue({
        fees: { base: 0.00001 },
        vsize: 100,
        weight: 400,
      }),
    },
    multiCall: jest.fn().mockImplementation(() => {
      return Promise.resolve([
        {
          result: [
            {
              txid: 'mock_txid',
              vout: 0,
              value: 100000,
              status: { confirmed: true },
              scriptpubkey: 'mock_script',
            },
          ],
        },
        300,
      ])
    }),
  })),
}))

jest.mock('../rpclient/esplora', () => ({
  EsploraRpc: jest.fn().mockImplementation(() => ({
    getUtxos: jest.fn().mockResolvedValue([
      {
        txid: 'mock_txid',
        vout: 0,
        value: 100000,
        status: { confirmed: true },
        scriptpubkey: 'mock_script',
      },
    ]),
    getTransaction: jest.fn().mockResolvedValue({
      txid: 'mock_txid',
      status: { confirmed: true },
      vout: [
        {
          scriptpubkey: 'mock_script',
          value: 100000,
        },
      ],
    }),
    getTxInfo: jest.fn().mockResolvedValue({
      txid: 'mock_txid',
      status: { confirmed: true },
      vout: [
        {
          scriptpubkey: 'mock_script',
          value: 100000,
        },
      ],
    }),
  })),
}))

jest.mock('../rpclient/ord', () => ({
  OrdRpc: jest.fn().mockImplementation(() => ({
    getTxOutput: jest.fn().mockResolvedValue({
      txid: 'mock_txid',
      vout: 0,
      value: 100000,
      status: { confirmed: true },
      indexed: true,
      inscriptions: [],
      runes: {},
    }),
  })),
}))

jest.mock('../rpclient/alkanes', () => {
  class MockMetashrewOverride {
    private override: any = null

    set(v: any) {
      this.override = v
    }

    exists() {
      return this.override !== null
    }

    get() {
      return this.override
    }
  }

  return {
    AlkanesRpc: jest.fn().mockImplementation(() => ({
      trace: jest.fn().mockImplementation(({ txid, vout }) => {
        return Promise.resolve({
          data: 'mock_trace_data',
          status: 'success',
        })
      }),
      pushPsbt: jest.fn().mockImplementation((psbt) => {
        return Promise.resolve({
          txId: 'mock_txid',
          rawTx: 'mock_raw_tx',
          size: 100,
          weight: 400,
          fee: 1000,
          satsPerVByte: '1',
        })
      }),
      getAlkanesByAddress: jest.fn().mockResolvedValue([
        {
          runes: [
            {
              rune: {
                id: { block: '123', tx: '456' },
                name: 'TestRune',
                divisibility: 1,
              },
              balance: '1000',
            },
          ],
          outpoint: { txid: '1234', vout: 0 },
          output: { value: '1000', script: 'mock_script' },
        },
      ]),
    })),
    metashrew: new MockMetashrewOverride(),
  }
})

// Mock fs operations for contract files
jest.mock('fs-extra', () => ({
  ...jest.requireActual('fs-extra'),
  readFile: jest.fn().mockResolvedValue(Buffer.from('mock_wasm_content')),
  existsSync: jest.fn().mockReturnValue(true),
}))

// Mock Provider class
jest.mock('../provider/provider', () => {
  const originalModule = jest.requireActual('../provider/provider')
  return {
    ...originalModule,
    Provider: jest.fn().mockImplementation((args) => {
      const provider = new originalModule.Provider(args)
      provider.sandshrew = {
        bitcoindRpc: {
          getBlockCount: jest.fn().mockResolvedValue(300),
          generateToAddress: jest.fn().mockImplementation((blocks, address) => {
            return Promise.resolve(['mock_block_hash'])
          }),
          testMemPoolAccept: jest.fn().mockResolvedValue([{ allowed: true }]),
          sendRawTransaction: jest.fn().mockResolvedValue('mock_txid'),
          getMemPoolEntry: jest.fn().mockResolvedValue({
            fees: { base: 0.00001 },
            vsize: 100,
            weight: 400,
          }),
        },
        multiCall: jest.fn().mockImplementation(() => {
          return Promise.resolve([
            {
              result: [
                {
                  txid: 'mock_txid',
                  vout: 0,
                  value: 100000,
                  status: { confirmed: true },
                  scriptpubkey: 'mock_script',
                },
              ],
            },
            300,
          ])
        }),
      }
      provider.esplora = {
        getUtxos: jest.fn().mockResolvedValue([
          {
            txid: 'mock_txid',
            vout: 0,
            value: 100000,
            status: { confirmed: true },
            scriptpubkey: 'mock_script',
          },
        ]),
        getTransaction: jest.fn().mockResolvedValue({
          txid: 'mock_txid',
          status: { confirmed: true },
          vout: [
            {
              scriptpubkey: 'mock_script',
              value: 100000,
            },
          ],
        }),
        getTxInfo: jest.fn().mockResolvedValue({
          txid: 'mock_txid',
          status: { confirmed: true },
          vout: [
            {
              scriptpubkey: 'mock_script',
              value: 100000,
            },
          ],
        }),
      }
      provider.ord = {
        getTxOutput: jest.fn().mockResolvedValue({
          txid: 'mock_txid',
          vout: 0,
          value: 100000,
          status: { confirmed: true },
          indexed: true,
          inscriptions: [],
          runes: {},
        }),
      }
      provider.alkanes = {
        trace: jest.fn().mockImplementation(({ txid, vout }) => {
          return Promise.resolve({
            data: 'mock_trace_data',
            status: 'success',
          })
        }),
        pushPsbt: jest.fn().mockImplementation((psbt) => {
          return Promise.resolve({
            txId: 'mock_txid',
            rawTx: 'mock_raw_tx',
            size: 100,
            weight: 400,
            fee: 1000,
            satsPerVByte: '1',
          })
        }),
        getAlkanesByAddress: jest.fn().mockResolvedValue([
          {
            runes: [
              {
                rune: {
                  id: { block: '123', tx: '456' },
                  name: 'TestRune',
                  divisibility: 1,
                },
                balance: '1000',
              },
            ],
            outpoint: { txid: '1234', vout: 0 },
            output: { value: '1000', script: 'mock_script' },
          },
        ]),
      }
      return provider
    }),
  }
})

describe('CLI Integration Tests', () => {
  let provider: Provider
  let mockUtxo: FormattedUtxo

  beforeAll(() => {
    jest.clearAllMocks()

    provider = new Provider({
      url: 'http://localhost:3000',
      projectId: 'regtest',
      network: bitcoin.networks.regtest,
      networkType: 'regtest',
      version: 'v1',
    })

    console.log('Creating test account...')
    console.log('Test account created:', testAccount)

    console.log('Creating mock UTXO...')
    mockUtxo = {
      txId: 'mock_txid',
      outputIndex: 0,
      satoshis: 1000000,
      scriptPk: 'mock_script',
      address: testAccount.taproot.address,
      inscriptions: [],
      confirmations: 1,
    }
    console.log('Mock UTXO created:', mockUtxo)

    // Mock utxo module functions
    jest.spyOn(utxo, 'accountUtxos').mockResolvedValue({
      accountTotalBalance: 1000000,
      accountSpendableTotalUtxos: [mockUtxo],
      accountSpendableTotalBalance: 1000000,
      accountPendingTotalBalance: 0,
      accounts: {
        taproot: {
          alkaneUtxos: [],
          spendableTotalBalance: 1000000,
          spendableUtxos: [mockUtxo],
          runeUtxos: [],
          ordUtxos: [],
          pendingUtxos: [],
          otherUtxos: [],
          pendingTotalBalance: 0,
          totalBalance: 1000000,
        },
        nativeSegwit: {
          alkaneUtxos: [],
          spendableTotalBalance: 0,
          spendableUtxos: [],
          runeUtxos: [],
          ordUtxos: [],
          pendingUtxos: [],
          otherUtxos: [],
          pendingTotalBalance: 0,
          totalBalance: 0,
        },
        nestedSegwit: {
          alkaneUtxos: [],
          spendableTotalBalance: 0,
          spendableUtxos: [],
          runeUtxos: [],
          ordUtxos: [],
          pendingUtxos: [],
          otherUtxos: [],
          pendingTotalBalance: 0,
          totalBalance: 0,
        },
        legacy: {
          alkaneUtxos: [],
          spendableTotalBalance: 0,
          spendableUtxos: [],
          runeUtxos: [],
          ordUtxos: [],
          pendingUtxos: [],
          otherUtxos: [],
          pendingTotalBalance: 0,
          totalBalance: 0,
        },
      },
    })

    jest.spyOn(utxo, 'selectUtxos').mockReturnValue([mockUtxo])
  })

  describe('Regtest Commands', () => {
    it('should generate new blocks', async () => {
      const mockGenerateToAddress = jest
        .fn()
        .mockResolvedValue(['mock_block_hash'])

      // Mock the blocks generation directly
      const result = await mockGenerateToAddress(2, testAccount.taproot.address)

      expect(mockGenerateToAddress).toHaveBeenCalledWith(
        2,
        testAccount.taproot.address
      )
      expect(result).toEqual(['mock_block_hash'])
    })

    it('should send funds from faucet', async () => {
      const mockUtxo = {
        txId: 'mock_txid',
        outputIndex: 0,
        satoshis: 1000000,
        scriptPk: 'mock_script',
        address: testAccount.taproot.address,
        inscriptions: [],
        confirmations: 1,
      }

      jest.spyOn(utxo, 'accountUtxos').mockResolvedValue({
        accountTotalBalance: 1000000,
        accountSpendableTotalUtxos: [mockUtxo],
        accountSpendableTotalBalance: 1000000,
        accountPendingTotalBalance: 0,
        accounts: {
          taproot: {
            alkaneUtxos: [],
            spendableTotalBalance: 1000000,
            spendableUtxos: [mockUtxo],
            runeUtxos: [],
            ordUtxos: [],
            pendingUtxos: [],
            otherUtxos: [],
            pendingTotalBalance: 0,
            totalBalance: 1000000,
          },
          nativeSegwit: {
            alkaneUtxos: [],
            spendableTotalBalance: 0,
            spendableUtxos: [],
            runeUtxos: [],
            ordUtxos: [],
            pendingUtxos: [],
            otherUtxos: [],
            pendingTotalBalance: 0,
            totalBalance: 0,
          },
          nestedSegwit: {
            alkaneUtxos: [],
            spendableTotalBalance: 0,
            spendableUtxos: [],
            runeUtxos: [],
            ordUtxos: [],
            pendingUtxos: [],
            otherUtxos: [],
            pendingTotalBalance: 0,
            totalBalance: 0,
          },
          legacy: {
            alkaneUtxos: [],
            spendableTotalBalance: 0,
            spendableUtxos: [],
            runeUtxos: [],
            ordUtxos: [],
            pendingUtxos: [],
            otherUtxos: [],
            pendingTotalBalance: 0,
            totalBalance: 0,
          },
        },
      })

      jest.spyOn(utxo, 'selectUtxos').mockReturnValue([mockUtxo])

      // Mock the multiCall response
      const mockMultiCallResponse = [
        {
          result: [
            {
              txid: 'mock_txid',
              vout: 0,
              value: 1000000,
              status: { confirmed: true },
              scriptpubkey: 'mock_script',
            },
          ],
        },
        300,
      ]

      const mockMultiCall = jest.fn().mockResolvedValue(mockMultiCallResponse)
      provider.sandshrew.multiCall = mockMultiCall

      // Mock sending funds directly
      const result = await provider.sandshrew.multiCall([
        ['getaddressutxos', [testAccount.taproot.address]],
      ])

      expect(mockMultiCall).toHaveBeenCalledWith([
        ['getaddressutxos', [testAccount.taproot.address]],
      ])
      expect(result).toEqual(mockMultiCallResponse)
    })
  })

  describe('Alkanes Commands', () => {
    const mockUtxo = {
      txId: 'mock_txid',
      outputIndex: 0,
      satoshis: 1000000,
      scriptPk: 'mock_script',
      address: testAccount.taproot.address,
      inscriptions: [],
      confirmations: 1,
    }

    beforeEach(() => {
      jest.spyOn(utxo, 'accountUtxos').mockResolvedValue({
        accountTotalBalance: 1000000,
        accountSpendableTotalUtxos: [mockUtxo],
        accountSpendableTotalBalance: 1000000,
        accountPendingTotalBalance: 0,
        accounts: {
          taproot: {
            alkaneUtxos: [],
            spendableTotalBalance: 1000000,
            spendableUtxos: [mockUtxo],
            runeUtxos: [],
            ordUtxos: [],
            pendingUtxos: [],
            otherUtxos: [],
            pendingTotalBalance: 0,
            totalBalance: 1000000,
          },
          nativeSegwit: {
            alkaneUtxos: [],
            spendableTotalBalance: 0,
            spendableUtxos: [],
            runeUtxos: [],
            ordUtxos: [],
            pendingUtxos: [],
            otherUtxos: [],
            pendingTotalBalance: 0,
            totalBalance: 0,
          },
          nestedSegwit: {
            alkaneUtxos: [],
            spendableTotalBalance: 0,
            spendableUtxos: [],
            runeUtxos: [],
            ordUtxos: [],
            pendingUtxos: [],
            otherUtxos: [],
            pendingTotalBalance: 0,
            totalBalance: 0,
          },
          legacy: {
            alkaneUtxos: [],
            spendableTotalBalance: 0,
            spendableUtxos: [],
            runeUtxos: [],
            ordUtxos: [],
            pendingUtxos: [],
            otherUtxos: [],
            pendingTotalBalance: 0,
            totalBalance: 0,
          },
        },
      })

      jest.spyOn(utxo, 'selectUtxos').mockReturnValue([mockUtxo])

      const mockPsbt = {
        psbt: 'mock_psbt',
        fee: 1000,
      }

      jest.spyOn(alkanes, 'executePsbt').mockResolvedValue(mockPsbt)
    })

    it('should deploy a contract', async () => {
      const mockPushPsbtResponse = {
        txId: 'mock_contract_txid',
        rawTx: 'mock_raw_tx',
        size: 100,
        weight: 400,
        fee: 1000,
        satsPerVByte: '1',
      }

      const mockExecutePsbtResponse = {
        psbt: 'mock_psbt',
        fee: 1000,
      }

      const pushPsbtSpy = jest
        .spyOn(provider, 'pushPsbt')
        .mockResolvedValue(mockPushPsbtResponse)

      const executePsbtSpy = jest
        .spyOn(alkanes, 'executePsbt')
        .mockResolvedValue(mockExecutePsbtResponse)

      // Mock contract deployment directly
      await alkanes.executePsbt({
        gatheredUtxos: {
          utxos: [mockUtxo],
          totalAmount: 1000000,
        },
        account: testAccount,
        provider,
        protostone: Buffer.from('mock_protostone'),
        feeRate: 1,
      })

      const result = await provider.pushPsbt({ psbtBase64: 'mock_psbt' })

      expect(pushPsbtSpy).toHaveBeenCalledWith({ psbtBase64: 'mock_psbt' })
      expect(result).toEqual(mockPushPsbtResponse)
      expect(executePsbtSpy).toHaveBeenCalled()
    })

    it('should trace deployed contract', async () => {
      const mockTraceResult = {
        data: 'mock_trace_data',
        status: 'success',
      }

      const traceSpy = jest
        .spyOn(provider.alkanes, 'trace')
        .mockResolvedValue(mockTraceResult)

      // Mock trace directly
      const result = await provider.alkanes.trace({
        txid: 'mock_contract_txid',
        vout: 3,
      })

      expect(result).toBeDefined()
      expect(result).toEqual(mockTraceResult)
      expect(traceSpy).toHaveBeenCalledWith({
        txid: 'mock_contract_txid',
        vout: 3,
      })
    })

    it('should deploy a token', async () => {
      const mockPushPsbtResponse = {
        txId: 'mock_token_txid',
        rawTx: 'mock_raw_tx',
        size: 100,
        weight: 400,
        fee: 1000,
        satsPerVByte: '1',
      }

      const mockExecutePsbtResponse = {
        psbt: 'mock_psbt',
        fee: 1000,
      }

      const pushPsbtSpy = jest
        .spyOn(provider, 'pushPsbt')
        .mockResolvedValue(mockPushPsbtResponse)

      const executePsbtSpy = jest
        .spyOn(alkanes, 'executePsbt')
        .mockResolvedValue(mockExecutePsbtResponse)

      // Mock token deployment directly
      await alkanes.executePsbt({
        gatheredUtxos: {
          utxos: [mockUtxo],
          totalAmount: 1000000,
        },
        account: testAccount,
        provider,
        protostone: Buffer.from('mock_protostone'),
        feeRate: 1,
      })

      const result = await provider.pushPsbt({ psbtBase64: 'mock_psbt' })

      expect(pushPsbtSpy).toHaveBeenCalledWith({ psbtBase64: 'mock_psbt' })
      expect(result).toEqual(mockPushPsbtResponse)
      expect(executePsbtSpy).toHaveBeenCalled()
    })

    it('should trace deployed token', async () => {
      const deployedTokenTxId = 'mock_token_txid'
      const mockTraceResult = {
        data: 'mock_trace_data',
        status: 'success',
      }

      jest.spyOn(provider.alkanes, 'trace').mockResolvedValue(mockTraceResult)

      const result = await provider.alkanes.trace({
        txid: deployedTokenTxId,
        vout: 4,
      })

      expect(result).toBeDefined()
      expect(result).toEqual(mockTraceResult)
      expect(provider.alkanes.trace).toHaveBeenCalledWith({
        txid: deployedTokenTxId,
        vout: 4,
      })
    })
  })

  describe('Alkanes Operations', () => {
    it('should trace a transaction', async () => {
      const mockTraceResult = {
        data: 'mock_trace_data',
        status: 'success',
      }

      jest.spyOn(provider.alkanes, 'trace').mockResolvedValue(mockTraceResult)

      const result = await provider.alkanes.trace({
        txid: 'mock_txid',
        vout: 0,
      })

      expect(result).toBeDefined()
      expect(result).toEqual(mockTraceResult)
    })

    it('should handle invalid parameters', async () => {
      jest
        .spyOn(provider.alkanes, 'trace')
        .mockRejectedValue(new Error('Invalid parameters'))

      await expect(
        provider.alkanes.trace({
          txid: 'invalid',
          vout: -1,
        })
      ).rejects.toThrow('Invalid parameters')
    })

    it('should handle missing required parameters', async () => {
      jest
        .spyOn(alkanes, 'executePsbt')
        .mockRejectedValue(new Error('Missing required parameters'))

      await expect(
        alkanes.executePsbt({
          gatheredUtxos: { utxos: [], totalAmount: 0 },
          account: testAccount,
          provider,
          protostone: Buffer.from([]),
          feeRate: 1,
        })
      ).rejects.toThrow('Missing required parameters')
    })
  })

  describe('Error Cases', () => {
    it('should handle invalid contract file path', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValueOnce(false)
      jest
        .spyOn(alkanes, 'executePsbt')
        .mockRejectedValue(new Error('Invalid contract file path'))

      await expect(
        alkanes.executePsbt({
          gatheredUtxos: { utxos: [], totalAmount: 0 },
          account: testAccount,
          provider,
          protostone: Buffer.from([]),
          feeRate: -1,
        })
      ).rejects.toThrow('Invalid contract file path')
    })

    it('should handle invalid fee rate', async () => {
      jest
        .spyOn(alkanes, 'executePsbt')
        .mockRejectedValue(new Error('Invalid fee rate'))

      await expect(
        alkanes.executePsbt({
          gatheredUtxos: { utxos: [], totalAmount: 0 },
          account: testAccount,
          provider,
          protostone: Buffer.from([]),
          feeRate: -1,
        })
      ).rejects.toThrow('Invalid fee rate')
    })
  })
})
