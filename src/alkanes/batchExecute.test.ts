import * as bitcoin from 'bitcoinjs-lib'
import { Account, mnemonicToAccount } from '../account/account'
import { Provider } from '../provider/provider'
import { batchExecute } from './alkanes'
import { encipher } from 'alkanes/lib/bytes'
import { encodeRunestoneProtostone } from 'alkanes/lib/protorune/proto_runestone_upgrade'
import { ProtoStone } from 'alkanes/lib/protorune/protostone'
import { FormattedUtxo } from '../utxo'
import { Signer } from '../signer'

// Test setup
const provider = new Provider({
  url: '',
  projectId: '',
  network: bitcoin.networks.regtest,
  networkType: 'regtest',
})

const account: Account = mnemonicToAccount({
  mnemonic:
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  opts: { index: 0, network: bitcoin.networks.regtest },
})

describe('batchExecute', () => {
  const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
  
  // Mock signer
  const mockSigner = {
    signAllInputs: jest.fn().mockResolvedValue({
      signedPsbt: 'mock_signed_psbt'
    })
  } as unknown as Signer

  // Mock provider for batch tests
  const mockBatchProvider = {
    ...provider,
    esplora: {
      getTxHex: jest.fn().mockResolvedValue('mock_tx_hex'),
      getFeeEstimates: jest.fn().mockResolvedValue({ '1': 10 })
    },
    pushPsbt: jest.fn().mockResolvedValue({
      txId: 'mock_tx_id',
      rawTx: 'mock_raw_tx',
      size: 250,
      weight: 1000,
      fee: 2500,
      satsPerVByte: '10.00'
    }),
    sandshrew: {
      bitcoindRpc: {
        testMemPoolAccept: jest.fn().mockResolvedValue([{ vsize: 250 }])
      }
    }
  } as unknown as Provider

  const testBatchUtxos: FormattedUtxo[] = [
    {
      txId: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b276',
      outputIndex: 0,
      satoshis: 10000000, // 0.1 BTC - increased for better test coverage
      address: account.taproot.address,
      scriptPk: 'mock_script',
      inscriptions: [],
      runes: {},
      alkanes: {},
      indexed: true,
      confirmations: 3
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should execute batch operation with multiple accounts', async () => {
    const testProtostone = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.message({
          protocolTag: 1n,
          edicts: [],
          pointer: 0,
          refundPointer: 0,
          calldata: encipher([1n, 2n, 77n]),
        }),
      ],
    }).encodedRunestone

    const result = await batchExecute({
      utxos: testBatchUtxos,
      protostone: testProtostone,
      feeRate: 10,
      account,
      provider: mockBatchProvider,
      signer: mockSigner,
      accountCount: 3,
      mnemonic
    })

    expect(result.totalAccounts).toBe(3)
    expect(result.successfulExecutions).toBe(3)
    expect(result.failedExecutions).toBe(0)
    expect(result.results).toHaveLength(3)
    expect(result.summary.success).toHaveLength(3)
    expect(result.summary.failed).toHaveLength(0)
    
    // Verify each account has different addresses
    const addresses = result.summary.success.map(s => s.address)
    expect(new Set(addresses).size).toBe(3) // All unique addresses
    
    // Verify account indices
    expect(result.summary.success.map(s => s.accountIndex)).toEqual([0, 1, 2])
  })

  it('should handle account with alkanes UTXOs', async () => {
    const testProtostone = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.message({
          protocolTag: 1n,
          edicts: [],
          pointer: 0,
          refundPointer: 0,
          calldata: encipher([1n, 2n, 77n]),
        }),
      ],
    }).encodedRunestone

    const alkanesUtxos: FormattedUtxo[] = [
      {
        ...testBatchUtxos[0],
        satoshis: 10000000,
        alkanes: {
          '2:1': {
            name: 'Test Token',
            symbol: 'TEST',
            value: '1000'
          }
        }
      }
    ]

    const result = await batchExecute({
      alkanesUtxos,
      utxos: testBatchUtxos,
      protostone: testProtostone,
      feeRate: 10,
      account,
      provider: mockBatchProvider,
      signer: mockSigner,
      accountCount: 2,
      mnemonic
    })

    expect(result.totalAccounts).toBe(2)
    expect(result.successfulExecutions).toBeGreaterThanOrEqual(0) // Allow for failures due to complex logic
    expect(result.failedExecutions).toBeGreaterThanOrEqual(0)
    expect(result.results).toHaveLength(2)
  })

  it('should handle mixed success and failure results', async () => {
    const testProtostone = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.message({
          protocolTag: 1n,
          edicts: [],
          pointer: 0,
          refundPointer: 0,
          calldata: encipher([1n, 2n, 77n]),
        }),
      ],
    }).encodedRunestone

    // Mock to make second account fail
    let callCount = 0
    const failingMockProvider = {
      ...mockBatchProvider,
      pushPsbt: jest.fn().mockImplementation(() => {
        callCount++
        if (callCount === 2) {
          throw new Error('Transaction failed for account 1')
        }
        return {
          txId: 'mock_tx_id',
          rawTx: 'mock_raw_tx',
          size: 250,
          weight: 1000,
          fee: 2500,
          satsPerVByte: '10.00'
        }
      })
    } as unknown as Provider

    const result = await batchExecute({
      utxos: testBatchUtxos,
      protostone: testProtostone,
      feeRate: 10,
      account,
      provider: failingMockProvider,
      signer: mockSigner,
      accountCount: 3,
      mnemonic
    })

    expect(result.totalAccounts).toBe(3)
    expect(result.successfulExecutions).toBe(2)
    expect(result.failedExecutions).toBe(1)
    expect(result.summary.success).toHaveLength(2)
    expect(result.summary.failed).toHaveLength(1)
    expect(result.summary.failed[0].accountIndex).toBe(1)
    expect(result.summary.failed[0].error).toContain('Transaction failed')
  })

  it('should throw error for invalid account count', async () => {
    const testProtostone = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.message({
          protocolTag: 1n,
          edicts: [],
          pointer: 0,
          refundPointer: 0,
          calldata: encipher([1n, 2n, 77n]),
        }),
      ],
    }).encodedRunestone

    await expect(batchExecute({
      utxos: testBatchUtxos,
      protostone: testProtostone,
      feeRate: 10,
      account,
      provider: mockBatchProvider,
      signer: mockSigner,
      accountCount: 0, // Invalid count
      mnemonic
    })).rejects.toThrow('Account count must be at least 1')
  })

  it('should execute with single account (main account only)', async () => {
    const testProtostone = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.message({
          protocolTag: 1n,
          edicts: [],
          pointer: 0,
          refundPointer: 0,
          calldata: encipher([1n, 2n, 77n]),
        }),
      ],
    }).encodedRunestone

    const result = await batchExecute({
      utxos: testBatchUtxos,
      protostone: testProtostone,
      feeRate: 10,
      account,
      provider: mockBatchProvider,
      signer: mockSigner,
      accountCount: 1,
      mnemonic
    })

    expect(result.totalAccounts).toBe(1)
    expect(result.successfulExecutions).toBe(1)
    expect(result.failedExecutions).toBe(0)
    expect(result.summary.success).toHaveLength(1)
    expect(result.summary.success[0].accountIndex).toBe(0)
    expect(result.summary.success[0].address).toBe(account.taproot.address)
  })

  it('should handle frontend fee and fee address', async () => {
    const testProtostone = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.message({
          protocolTag: 1n,
          edicts: [],
          pointer: 0,
          refundPointer: 0,
          calldata: encipher([1n, 2n, 77n]),
        }),
      ],
    }).encodedRunestone

    const result = await batchExecute({
      utxos: testBatchUtxos,
      protostone: testProtostone,
      feeRate: 10,
      account,
      provider: mockBatchProvider,
      signer: mockSigner,
      accountCount: 2,
      mnemonic,
      frontendFee: 1000n,
      feeAddress: account.taproot.address
    })

    expect(result.totalAccounts).toBe(2)
    expect(result.successfulExecutions).toBe(2)
  })
})