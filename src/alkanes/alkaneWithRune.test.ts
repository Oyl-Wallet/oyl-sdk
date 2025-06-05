import * as bitcoin from 'bitcoinjs-lib'
import { Account, mnemonicToAccount } from '../account/account'
import { Provider } from '../provider/provider'
import { createExecutePsbt, execute } from './alkanes'
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

describe('Alkane + Rune Integration', () => {
  // Mock signer
  const mockSigner = {
    signAllInputs: jest.fn().mockResolvedValue({
      signedPsbt: 'mock_signed_psbt'
    })
  } as unknown as Signer

  // Mock provider methods
  const mockProvider = {
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

  const testUtxos: FormattedUtxo[] = [
    {
      txId: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b276',
      outputIndex: 0,
      satoshis: 10000000, // 0.1 BTC
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

  describe('createExecutePsbt with rune mint', () => {
    it('should create PSBT with both alkane protostone and rune mint script', async () => {
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

      const runeMint = {
        runeId: '840000:1',
        pointer: 1
      }

      const result = await createExecutePsbt({
        utxos: testUtxos,
        account,
        protostone: testProtostone,
        provider: mockProvider,
        feeRate: 10,
        runeMint
      })

      expect(result.psbt).toBeDefined()
      expect(result.psbtHex).toBeDefined()
      
      // Verify PSBT contains both outputs
      const psbt = bitcoin.Psbt.fromBase64(result.psbt, { network: bitcoin.networks.regtest })
      const outputs = psbt.txOutputs
      
      // Should have: alkane output (330 sats) + alkane protostone (0 value) + rune mint script (0 value) + rune output (330 sats) + change
      expect(outputs.length).toBeGreaterThanOrEqual(4)
      
      // Check for OP_RETURN outputs (value = 0)
      const opReturnOutputs = outputs.filter(output => output.value === 0)
      expect(opReturnOutputs.length).toBe(2) // One for alkane protostone, one for rune mint script
    })

    it('should create PSBT without rune mint when not specified', async () => {
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

      const result = await createExecutePsbt({
        utxos: testUtxos,
        account,
        protostone: testProtostone,
        provider: mockProvider,
        feeRate: 10
        // No runeMint parameter
      })

      expect(result.psbt).toBeDefined()
      
      const psbt = bitcoin.Psbt.fromBase64(result.psbt, { network: bitcoin.networks.regtest })
      const outputs = psbt.txOutputs
      
      // Should have: alkane output (330 sats) + alkane protostone (0 value) + change
      expect(outputs.length).toBeGreaterThanOrEqual(2)
      
      // Check for OP_RETURN outputs (value = 0)
      const opReturnOutputs = outputs.filter(output => output.value === 0)
      expect(opReturnOutputs.length).toBe(1) // Only alkane protostone
    })

    it('should handle custom rune pointer', async () => {
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

      const runeMint = {
        runeId: '840000:1',
        pointer: 2 // Custom pointer
      }

      const result = await createExecutePsbt({
        utxos: testUtxos,
        account,
        protostone: testProtostone,
        provider: mockProvider,
        feeRate: 10,
        runeMint
      })

      expect(result.psbt).toBeDefined()
      expect(result.psbtHex).toBeDefined()
    })

    it('should handle frontend fee with rune mint', async () => {
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

      const runeMint = {
        runeId: '840000:1',
        pointer: 1
      }

      const result = await createExecutePsbt({
        utxos: testUtxos,
        account,
        protostone: testProtostone,
        provider: mockProvider,
        feeRate: 10,
        runeMint,
        frontendFee: 1000n,
        feeAddress: account.taproot.address
      })

      expect(result.psbt).toBeDefined()
      
      const psbt = bitcoin.Psbt.fromBase64(result.psbt, { network: bitcoin.networks.regtest })
      const outputs = psbt.txOutputs
      
      // Should include frontend fee output
      const feeOutput = outputs.find(output => output.value === 1000)
      expect(feeOutput).toBeDefined()
    })
  })

  describe('execute with rune mint', () => {
    it('should execute alkane operation with rune mint', async () => {
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

      const runeMint = {
        runeId: '840000:1',
        pointer: 1
      }

      const result = await execute({
        utxos: testUtxos,
        account,
        protostone: testProtostone,
        provider: mockProvider,
        feeRate: 10,
        signer: mockSigner,
        runeMint
      })

      expect(result.txId).toBe('mock_tx_id')
      expect(mockSigner.signAllInputs).toHaveBeenCalled()
      expect(mockProvider.pushPsbt).toHaveBeenCalled()
    })

    it('should work without rune mint (backward compatibility)', async () => {
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

      const result = await execute({
        utxos: testUtxos,
        account,
        protostone: testProtostone,
        provider: mockProvider,
        feeRate: 10,
        signer: mockSigner
        // No runeMint parameter
      })

      expect(result.txId).toBe('mock_tx_id')
      expect(mockSigner.signAllInputs).toHaveBeenCalled()
      expect(mockProvider.pushPsbt).toHaveBeenCalled()
    })

    it('should handle invalid rune ID format gracefully', async () => {
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

      const runeMint = {
        runeId: 'invalid-format', // Invalid format
        pointer: 1
      }

      await expect(execute({
        utxos: testUtxos,
        account,
        protostone: testProtostone,
        provider: mockProvider,
        feeRate: 10,
        signer: mockSigner,
        runeMint
      })).rejects.toThrow()
    })
  })

  describe('edge cases', () => {
    it('should handle insufficient balance for both operations', async () => {
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

      const runeMint = {
        runeId: '840000:1',
        pointer: 1
      }

      const insufficientUtxos: FormattedUtxo[] = [
        {
          ...testUtxos[0],
          satoshis: 100 // Very small amount
        }
      ]

      await expect(createExecutePsbt({
        utxos: insufficientUtxos,
        account,
        protostone: testProtostone,
        provider: mockProvider,
        feeRate: 10,
        runeMint
      })).rejects.toThrow('Insufficient balance')
    })

    it('should use default pointer when not specified', async () => {
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

      const runeMint = {
        runeId: '840000:1'
        // No pointer specified, should default to 1
      }

      const result = await createExecutePsbt({
        utxos: testUtxos,
        account,
        protostone: testProtostone,
        provider: mockProvider,
        feeRate: 10,
        runeMint
      })

      expect(result.psbt).toBeDefined()
    })
  })
})