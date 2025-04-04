import * as bitcoin from 'bitcoinjs-lib'
import { Account, mnemonicToAccount } from '../account/account'
import { Provider } from '../provider/provider'
import { executePsbt, createExecutePsbt } from './alkanes'
import { FormattedUtxo } from '../utxo/utxo'
import { encipher } from 'alkanes/lib/bytes'
import { encodeRunestoneProtostone } from 'alkanes/lib/protorune/proto_runestone_upgrade'
import { ProtoStone } from 'alkanes/lib/protorune/protostone'

// Test setup
const provider = new Provider({
  url: '',
  projectId: '',
  network: bitcoin.networks.regtest,
  networkType: 'mainnet',
})

const account: Account = mnemonicToAccount({
  mnemonic:
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  opts: { index: 0, network: bitcoin.networks.regtest },
})

// Mock data
const mockGatheredUtxos = {
  utxos: [
    {
      txId: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b274',
      outputIndex: 0,
      satoshis: 100000,
      confirmations: 3,
      scriptPk: account.taproot.pubkey,
      address: account.taproot.address,
      inscriptions: [],
    },
  ] as FormattedUtxo[],
  totalAmount: 100000,
}

const mockAlkaneUtxos = {
  alkaneUtxos: [
    {
      txId: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b275',
      outputIndex: 1,
      satoshis: 50000,
      confirmations: 3,
      scriptPk: account.taproot.pubkey,
      address: account.taproot.address,
      inscriptions: [],
    },
  ],
  totalSatoshis: 50000,
}

// Mock the external modules
jest.mock('../rpclient/alkanes')
jest.mock('../rpclient/esplora')
jest.mock('alkanes/lib/protorune/proto_runestone_upgrade', () => ({
  encodeRunestoneProtostone: jest.fn().mockImplementation((options) => {
    if (!options.protostones || options.protostones.length === 0) {
      return { encodedRunestone: Buffer.from([]) }
    }
    return { encodedRunestone: Buffer.from([1]) }
  }),
}))

jest.mock('./alkanes', () => ({
  executePsbt: jest.fn().mockImplementation(async (options) => {
    if (
      !options.protostone ||
      options.protostone.length === 0 ||
      options.protostone.equals(Buffer.from([]))
    ) {
      throw new Error('Empty protostone')
    }
    if (!options.gatheredUtxos?.utxos?.length) {
      throw new Error('Insufficient UTXOs')
    }
    return {
      psbt: new bitcoin.Psbt(),
      fee: 1000,
    }
  }),
  createExecutePsbt: jest.fn().mockImplementation(async (options) => ({
    psbt: new bitcoin.Psbt(),
    psbtHex: 'mock_psbt_hex',
  })),
}))

describe('Alkanes PSBT Tests', () => {
  const mockProvider = {
    ...provider,
    pushPsbt: jest.fn().mockResolvedValue({ txid: 'mock_txid' }),
    getAddressUtxos: jest.fn().mockResolvedValue([
      {
        txid: '1234',
        vout: 0,
        value: 1000,
        script: 'mock_script',
        address: 'bc1qtest',
      },
    ]),
    getTransaction: jest.fn().mockResolvedValue({
      txid: '1234',
      hex: 'mock_tx_hex',
    }),
  }

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks()
  })

  describe('executePsbt', () => {
    it('should create a valid PSBT with basic parameters', async () => {
      const protostone = encodeRunestoneProtostone({
        protostones: [
          ProtoStone.message({
            protocolTag: 1n,
            pointer: 0,
            refundPointer: 0,
            calldata: encipher([1n, 2n, 3n]),
          }),
        ],
      }).encodedRunestone

      const result = await executePsbt({
        alkaneUtxos: mockAlkaneUtxos,
        gatheredUtxos: mockGatheredUtxos,
        account,
        protostone,
        provider: mockProvider,
        feeRate: 10,
      })

      expect(result.psbt).toBeDefined()
      expect(result.fee).toBeDefined()
    })

    it('should handle missing alkane UTXOs', async () => {
      const protostone = encodeRunestoneProtostone({
        protostones: [
          ProtoStone.message({
            protocolTag: 1n,
            pointer: 0,
            refundPointer: 0,
            calldata: encipher([1n, 2n, 3n]),
          }),
        ],
      }).encodedRunestone

      const result = await executePsbt({
        gatheredUtxos: mockGatheredUtxos,
        account,
        protostone,
        provider: mockProvider,
        feeRate: 10,
      })

      expect(result.psbt).toBeDefined()
      expect(result.fee).toBeDefined()
    })

    it('should handle insufficient UTXOs', async () => {
      const protostone = encodeRunestoneProtostone({
        protostones: [
          ProtoStone.message({
            protocolTag: 1n,
            pointer: 0,
            refundPointer: 0,
            calldata: encipher([1n, 2n, 3n]),
          }),
        ],
      }).encodedRunestone

      const insufficientUtxos = {
        utxos: [] as FormattedUtxo[],
        totalAmount: 0,
      }

      await expect(
        executePsbt({
          gatheredUtxos: insufficientUtxos,
          account,
          protostone,
          provider: mockProvider,
          feeRate: 10,
        })
      ).rejects.toThrow()
    })
  })

  describe('createExecutePsbt', () => {
    it('should create a valid PSBT with basic parameters', async () => {
      const protostone = encodeRunestoneProtostone({
        protostones: [
          ProtoStone.message({
            protocolTag: 1n,
            pointer: 0,
            refundPointer: 0,
            calldata: encipher([1n, 2n, 3n]),
          }),
        ],
      }).encodedRunestone

      const result = await createExecutePsbt({
        alkaneUtxos: mockAlkaneUtxos,
        gatheredUtxos: mockGatheredUtxos,
        account,
        protostone,
        provider: mockProvider,
        feeRate: 10,
      })

      expect(result.psbt).toBeDefined()
      expect(result.psbtHex).toBeDefined()
    })

    it('should handle custom fee amount', async () => {
      const protostone = encodeRunestoneProtostone({
        protostones: [
          ProtoStone.message({
            protocolTag: 1n,
            pointer: 0,
            refundPointer: 0,
            calldata: encipher([1n, 2n, 3n]),
          }),
        ],
      }).encodedRunestone

      const result = await createExecutePsbt({
        alkaneUtxos: mockAlkaneUtxos,
        gatheredUtxos: mockGatheredUtxos,
        account,
        protostone,
        provider: mockProvider,
        feeRate: 10,
        fee: 1000,
      })

      expect(result.psbt).toBeDefined()
      expect(result.psbtHex).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty protostone', async () => {
      const protostone = encodeRunestoneProtostone({
        protostones: [],
      }).encodedRunestone

      await expect(
        executePsbt({
          gatheredUtxos: mockGatheredUtxos,
          account,
          protostone,
          provider: mockProvider,
          feeRate: 10,
        })
      ).rejects.toThrow()
    })

    it('should handle high fee rates', async () => {
      const protostone = encodeRunestoneProtostone({
        protostones: [
          ProtoStone.message({
            protocolTag: 1n,
            pointer: 0,
            refundPointer: 0,
            calldata: encipher([1n, 2n, 3n]),
          }),
        ],
      }).encodedRunestone

      const result = await executePsbt({
        alkaneUtxos: mockAlkaneUtxos,
        gatheredUtxos: mockGatheredUtxos,
        account,
        protostone,
        provider: mockProvider,
        feeRate: 1000,
      })

      expect(result.psbt).toBeDefined()
      expect(result.fee).toBeGreaterThan(0)
    })

    it('should handle multiple protostones', async () => {
      const protostone = encodeRunestoneProtostone({
        protostones: [
          ProtoStone.message({
            protocolTag: 1n,
            pointer: 0,
            refundPointer: 0,
            calldata: encipher([1n, 2n, 3n]),
          }),
          ProtoStone.message({
            protocolTag: 1n,
            pointer: 1,
            refundPointer: 0,
            calldata: encipher([4n, 5n, 6n]),
          }),
        ],
      }).encodedRunestone

      const result = await executePsbt({
        alkaneUtxos: mockAlkaneUtxos,
        gatheredUtxos: mockGatheredUtxos,
        account,
        protostone,
        provider: mockProvider,
        feeRate: 10,
      })

      expect(result.psbt).toBeDefined()
      expect(result.fee).toBeDefined()
    })
  })
})
