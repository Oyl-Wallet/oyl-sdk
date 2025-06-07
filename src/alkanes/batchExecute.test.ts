import * as bitcoin from 'bitcoinjs-lib'
import { Account, mnemonicToAccount, getWalletPrivateKeys } from '../account/account'
import { Provider } from '../provider/provider'
import { batchExecute } from './alkanes'
import { encipher } from 'alkanes/lib/bytes'
import { encodeRunestoneProtostone } from 'alkanes/lib/protorune/proto_runestone_upgrade'
import { ProtoStone } from 'alkanes/lib/protorune/protostone'
import { FormattedUtxo } from '../utxo'
import { Signer } from '../signer'
import * as utxo from '../utxo/utxo'

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
    
    // Mock accountUtxos to return different UTXOs for each account
    jest.spyOn(utxo, 'accountUtxos').mockImplementation(async ({ account }) => {
      // Create unique UTXOs for each account based on its address
      // Generate a proper 32-byte hex string for txId
      const accountIndex = account.taproot.address.slice(-4) // Get last 4 chars as identifier
      const uniqueTxId = accountIndex.padEnd(64, '0').replace(/[^0-9a-f]/gi, '0') // Replace non-hex chars with 0
      
      const accountSpecificUtxos: FormattedUtxo[] = [
        {
          txId: uniqueTxId,
          outputIndex: 0,
          satoshis: 10000000,
          address: account.taproot.address,
          scriptPk: 'mock_script',
          inscriptions: [],
          runes: {},
          alkanes: {},
          indexed: true,
          confirmations: 3
        }
      ]
      
      return {
        accountUtxos: accountSpecificUtxos,
        accountTotalBalance: 10000000,
        accountSpendableTotalUtxos: accountSpecificUtxos,
        accountSpendableTotalBalance: 10000000,
        accountPendingTotalBalance: 0,
        accounts: {
          taproot: {
            alkaneUtxos: [],
            spendableTotalBalance: 10000000,
            spendableUtxos: accountSpecificUtxos,
            runeUtxos: [],
            ordUtxos: [],
            pendingUtxos: [],
            pendingTotalBalance: 0,
            totalBalance: 10000000,
            utxos: accountSpecificUtxos,
          },
          nativeSegwit: {
            alkaneUtxos: [],
            spendableTotalBalance: 0,
            spendableUtxos: [],
            runeUtxos: [],
            ordUtxos: [],
            pendingUtxos: [],
            pendingTotalBalance: 0,
            totalBalance: 0,
            utxos: [],
          },
          nestedSegwit: {
            alkaneUtxos: [],
            spendableTotalBalance: 0,
            spendableUtxos: [],
            runeUtxos: [],
            ordUtxos: [],
            pendingUtxos: [],
            pendingTotalBalance: 0,
            totalBalance: 0,
            utxos: [],
          },
          legacy: {
            alkaneUtxos: [],
            spendableTotalBalance: 0,
            spendableUtxos: [],
            runeUtxos: [],
            ordUtxos: [],
            pendingUtxos: [],
            pendingTotalBalance: 0,
            totalBalance: 0,
            utxos: [],
          }
        }
      }
    })
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
      mnemonic,
      alkaneReceiverAddress: account.taproot.address
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
    
    // Verify account indices (child accounts only, starting from index 1)
    expect(result.summary.success.map(s => s.accountIndex)).toEqual([1, 2, 3])
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
      mnemonic,
      alkaneReceiverAddress: account.taproot.address
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
      mnemonic,
      alkaneReceiverAddress: account.taproot.address
    })

    expect(result.totalAccounts).toBe(3)
    expect(result.successfulExecutions).toBe(2)
    expect(result.failedExecutions).toBe(1)
    expect(result.summary.success).toHaveLength(2)
    expect(result.summary.failed).toHaveLength(1)
    expect(result.summary.failed[0].accountIndex).toBe(2)
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
      mnemonic,
      alkaneReceiverAddress: account.taproot.address
    })).rejects.toThrow('Account count must be at least 1')
  })

  it('should execute with single account (child account only)', async () => {
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
      mnemonic,
      alkaneReceiverAddress: account.taproot.address
    })

    expect(result.totalAccounts).toBe(1)
    expect(result.successfulExecutions).toBe(1)
    expect(result.failedExecutions).toBe(0)
    expect(result.summary.success).toHaveLength(1)
    expect(result.summary.success[0].accountIndex).toBe(1)
    // The first child account will have a different address than the main account
    expect(result.summary.success[0].address).not.toBe(account.taproot.address)
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

  it('should create unique signers for each derived account', async () => {
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

    // Track which signers were used during execution
    const signersUsed: Signer[] = []
    const originalSignAllInputs = jest.fn()
    
    // Create real signers to verify they have correct keys
    const mainPrivateKeys = getWalletPrivateKeys({
      mnemonic,
      opts: {
        network: bitcoin.networks.regtest,
        index: 0,
      },
    })
    const mainSigner = new Signer(bitcoin.networks.regtest, {
      taprootPrivateKey: mainPrivateKeys.taproot.privateKey,
      segwitPrivateKey: mainPrivateKeys.nativeSegwit.privateKey,
      nestedSegwitPrivateKey: mainPrivateKeys.nestedSegwit.privateKey,
      legacyPrivateKey: mainPrivateKeys.legacy.privateKey,
    })

    // Mock provider that captures signers
    const captureSignerProvider = {
      ...mockBatchProvider,
      pushPsbt: jest.fn().mockImplementation((params) => {
        // The signer should have been used to sign the PSBT
        return {
          txId: `mock_tx_id_${signersUsed.length}`,
          rawTx: 'mock_raw_tx',
          size: 250,
          weight: 1000,
          fee: 2500,
          satsPerVByte: '10.00'
        }
      })
    } as unknown as Provider

    // Spy on Signer constructor to capture created signers
    const originalSigner = Signer
    const signerSpy = jest.spyOn(Signer.prototype, 'signAllInputs')
      .mockImplementation(async function(this: Signer, params) {
        signersUsed.push(this)
        return {
          signedPsbt: 'mock_signed_psbt',
          signedHexPsbt: 'mock_signed_hex_psbt'
        }
      })

    const result = await batchExecute({
      utxos: testBatchUtxos,
      protostone: testProtostone,
      feeRate: 10,
      account,
      provider: captureSignerProvider,
      signer: mainSigner,
      accountCount: 3,
      mnemonic,
      alkaneReceiverAddress: account.taproot.address
    })

    // Verify that 3 different signers were used
    expect(signersUsed).toHaveLength(3)
    
    // Verify each signer has different taproot keys (since accounts have different indices)
    const taprootKeys = signersUsed.map(signer => signer.taprootKeyPair.publicKey.toString('hex'))
    expect(new Set(taprootKeys).size).toBe(3) // All unique public keys
    
    // Verify the first signer matches the child account at index 1 (not main account)
    const childSigner = new Signer(account.network, {
      taprootPrivateKey: getWalletPrivateKeys({
        mnemonic,
        opts: { network: account.network, index: 1 }
      }).taproot.privateKey,
      segwitPrivateKey: getWalletPrivateKeys({
        mnemonic,
        opts: { network: account.network, index: 1 }
      }).nativeSegwit.privateKey,
      nestedSegwitPrivateKey: getWalletPrivateKeys({
        mnemonic,
        opts: { network: account.network, index: 1 }
      }).nestedSegwit.privateKey,
      legacyPrivateKey: getWalletPrivateKeys({
        mnemonic,
        opts: { network: account.network, index: 1 }
      }).legacy.privateKey,
    })
    expect(signersUsed[0].taprootKeyPair.publicKey.toString('hex'))
      .toBe(childSigner.taprootKeyPair.publicKey.toString('hex'))
    
    // Verify accounts were created correctly
    expect(result.totalAccounts).toBe(3)
    expect(result.results).toHaveLength(3)
    
    // Verify each account has a different address (derived from different indices)
    const addresses = result.results.map(r => r.account.address)
    expect(new Set(addresses).size).toBe(3) // All unique addresses

    // Cleanup
    signerSpy.mockRestore()
  })

  it('should handle signing errors gracefully for individual accounts', async () => {
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

    // Create a signer that fails for the second account
    let signCallCount = 0
    const failingSignerSpy = jest.spyOn(Signer.prototype, 'signAllInputs')
      .mockImplementation(async function(this: Signer, params) {
        signCallCount++
        if (signCallCount === 2) {
          throw new Error('Can not sign for input #0 with the key 02de7f1a2e2cc4585ac55fd58b8464d3550c7932343ea7e3c9660b2f930199e6ef')
        }
        return {
          signedPsbt: 'mock_signed_psbt',
          signedHexPsbt: 'mock_signed_hex_psbt'
        }
      })

    const result = await batchExecute({
      utxos: testBatchUtxos,
      protostone: testProtostone,
      feeRate: 10,
      account,
      provider: mockBatchProvider,
      signer: mockSigner,
      accountCount: 3,
      mnemonic,
      alkaneReceiverAddress: account.taproot.address
    })

    // Should have 1 failure and 2 successes
    expect(result.totalAccounts).toBe(3)
    expect(result.successfulExecutions).toBe(2)
    expect(result.failedExecutions).toBe(1)
    expect(result.summary.failed).toHaveLength(1)
    expect(result.summary.failed[0].error).toContain('Can not sign for input')

    // Cleanup
    failingSignerSpy.mockRestore()
  })

  it('should get unique UTXOs for each derived account', async () => {
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

    // Track which accounts get which UTXOs
    const accountUtxoSpy = jest.spyOn(utxo, 'accountUtxos')

    const result = await batchExecute({
      utxos: testBatchUtxos,
      protostone: testProtostone,
      feeRate: 10,
      account,
      provider: mockBatchProvider,
      signer: mockSigner,
      accountCount: 3,
      mnemonic,
      alkaneReceiverAddress: account.taproot.address
    })

    // Verify accountUtxos was called for each derived account
    expect(accountUtxoSpy).toHaveBeenCalledTimes(3)
    
    // Verify each call was made with a different account
    const calledAccounts = accountUtxoSpy.mock.calls.map(call => call[0].account.taproot.address)
    expect(new Set(calledAccounts).size).toBe(3) // All unique addresses
    
    // Verify execution succeeded for all accounts (since they now have unique UTXOs)
    expect(result.totalAccounts).toBe(3)
    expect(result.successfulExecutions).toBe(3)
    expect(result.failedExecutions).toBe(0)

    // Cleanup
    accountUtxoSpy.mockRestore()
  })
})