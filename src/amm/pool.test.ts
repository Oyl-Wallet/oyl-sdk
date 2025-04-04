import * as bitcoin from 'bitcoinjs-lib'
import { Account, mnemonicToAccount } from '../account/account'
import { Provider } from '../provider/provider'
import { swapPsbt, addLiquidityPsbt, removeLiquidityPsbt } from './pool'
import { AlkaneId } from '../shared/interface'
import { FormattedUtxo } from '../utxo/utxo'
import { findAlkaneUtxos } from '../alkanes'
import { AlkanesRpc } from '../rpclient/alkanes'
import { EsploraRpc } from '../rpclient/esplora'

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
const mockToken0: AlkaneId = {
  block: '123',
  tx: '456',
}

const mockToken1: AlkaneId = {
  block: '789',
  tx: '012',
}

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

// Mock the external modules
jest.mock('../alkanes', () => ({
  findAlkaneUtxos: jest
    .fn()
    .mockImplementation(
      async ({ targetNumberOfAlkanes, alkaneId, provider, address }) => {
        if (targetNumberOfAlkanes === 0) {
          throw new Error('Cannot process zero tokens')
        }

        const res = await provider.alkanes.getAlkanesByAddress({
          address,
          protocolTag: '1',
        })

        const matchingRunesWithOutpoints = res.flatMap((outpoint) =>
          outpoint.runes
            .filter(
              (value) =>
                Number(value.rune.id.block) === Number(alkaneId.block) &&
                Number(value.rune.id.tx) === Number(alkaneId.tx)
            )
            .map((rune) => ({ rune, outpoint }))
        )

        const alkaneUtxos = matchingRunesWithOutpoints.map((alkane) => ({
          txId: alkane.outpoint.outpoint.txid,
          txIndex: alkane.outpoint.outpoint.vout,
          script: alkane.outpoint.output.script,
          address,
          amountOfAlkanes: alkane.rune.balance,
          satoshis: Number(alkane.outpoint.output.value),
          ...alkane.rune.rune,
        }))

        return {
          alkaneUtxos,
          totalSatoshis: alkaneUtxos.reduce(
            (acc, utxo) => acc + utxo.satoshis,
            0
          ),
        }
      }
    ),
  executePsbt: jest.fn().mockImplementation(async (options) => {
    if (
      !options.alkaneUtxos?.alkaneUtxos?.length ||
      !options.gatheredUtxos?.utxos?.length
    ) {
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
jest.mock('../rpclient/alkanes')
jest.mock('../rpclient/esplora')

describe('AMM Pool PSBT Tests', () => {
  const mockProvider = {
    ...provider,
    alkanes: {
      ...provider.alkanes,
      getAlkanesByAddress: jest.fn().mockResolvedValue([
        {
          runes: [
            {
              rune: {
                id: {
                  block: '123',
                  tx: '456',
                },
                name: 'TestRune',
                spacedName: 'TestRune',
                divisibility: 1,
                spacers: 0,
                symbol: 'TR',
              },
              balance: '1000',
            },
          ],
          outpoint: {
            txid: '1234',
            vout: 0,
          },
          output: {
            value: '1000',
            script: 'mock_script',
          },
          height: 123,
          txindex: 456,
        },
        {
          runes: [
            {
              rune: {
                id: {
                  block: '789',
                  tx: '012',
                },
                name: 'TestRune2',
                spacedName: 'TestRune2',
                divisibility: 1,
                spacers: 0,
                symbol: 'TR2',
              },
              balance: '2000',
            },
          ],
          outpoint: {
            txid: '5678',
            vout: 1,
          },
          output: {
            value: '2000',
            script: 'mock_script_2',
          },
          height: 789,
          txindex: 12,
        },
      ]),
    },
    esplora: {
      ...provider.esplora,
      getTxHex: jest.fn().mockResolvedValue('mock_tx_hex'),
      getFeeEstimates: jest.fn().mockResolvedValue({ '1': 1 }),
    } as any,
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
  } as any

  // Setup mock data
  const mockAlkaneUtxos = {
    alkaneUtxos: [
      {
        txid: '1234',
        vout: 0,
        value: 1000,
        // ... other required UTXO fields
      },
    ],
    totalSatoshis: 1000,
  }

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks()

    // Mock findAlkaneUtxos to return test data
    ;(findAlkaneUtxos as jest.Mock).mockResolvedValue(mockAlkaneUtxos)
  })

  describe('swapPsbt', () => {
    it('should create a valid swap PSBT without frontend fee', async () => {
      const result = await swapPsbt({
        calldata: [1n],
        token: { block: '1', tx: '1' },
        tokenAmount: 1000n,
        gatheredUtxos: mockGatheredUtxos,
        feeRate: 1,
        account,
        provider: mockProvider,
      })

      expect(findAlkaneUtxos).toHaveBeenCalled()
      expect(result).toHaveProperty('psbt')
    })

    it('should create a valid swap PSBT with frontend fee', async () => {
      const result = await swapPsbt({
        calldata: [1n, 2n, 3n],
        token: mockToken0,
        tokenAmount: 1000n,
        gatheredUtxos: mockGatheredUtxos,
        feeRate: 10,
        account,
        provider,
        frontendFee: 1000,
        feeAddress:
          'bc1p0000000000000000000000000000000000000000000000000000000000000000',
      })

      expect(result.psbt).toBeDefined()
    })

    it('should handle zero token amount', async () => {
      await expect(
        swapPsbt({
          calldata: [1n, 2n, 3n],
          token: mockToken0,
          tokenAmount: 0n,
          gatheredUtxos: mockGatheredUtxos,
          feeRate: 10,
          account,
          provider,
        })
      ).rejects.toThrow('Cannot process zero tokens')
    })
  })

  describe('addLiquidityPsbt', () => {
    it('should create a valid add liquidity PSBT', async () => {
      const result = await addLiquidityPsbt({
        calldata: [1n, 2n, 3n],
        token0: mockToken0,
        token0Amount: 1000n,
        token1: mockToken1,
        token1Amount: 2000n,
        gatheredUtxos: mockGatheredUtxos,
        feeRate: 10,
        account,
        provider,
      })

      expect(result.psbt).toBeDefined()
      expect(result.fee).toBeDefined()
    })

    it('should handle zero amounts', async () => {
      await expect(
        addLiquidityPsbt({
          calldata: [1n, 2n, 3n],
          token0: mockToken0,
          token0Amount: 0n,
          token1: mockToken1,
          token1Amount: 0n,
          gatheredUtxos: mockGatheredUtxos,
          feeRate: 10,
          account,
          provider,
        })
      ).rejects.toThrow()
    })

    it('should handle insufficient UTXOs', async () => {
      const insufficientUtxos = {
        utxos: [] as FormattedUtxo[],
        totalAmount: 0,
      }

      await expect(
        addLiquidityPsbt({
          calldata: [1n, 2n, 3n],
          token0: mockToken0,
          token0Amount: 1000n,
          token1: mockToken1,
          token1Amount: 2000n,
          gatheredUtxos: insufficientUtxos,
          feeRate: 10,
          account,
          provider,
        })
      ).rejects.toThrow()
    })
  })

  describe('removeLiquidityPsbt', () => {
    it('should create a valid remove liquidity PSBT', async () => {
      const result = await removeLiquidityPsbt({
        calldata: [1n, 2n, 3n],
        token: mockToken0,
        tokenAmount: 1000n,
        gatheredUtxos: mockGatheredUtxos,
        feeRate: 10,
        account,
        provider,
      })

      expect(result.psbt).toBeDefined()
    })

    it('should handle zero token amount', async () => {
      await expect(
        removeLiquidityPsbt({
          calldata: [1n, 2n, 3n],
          token: mockToken0,
          tokenAmount: 0n,
          gatheredUtxos: mockGatheredUtxos,
          feeRate: 10,
          account,
          provider,
        })
      ).rejects.toThrow('Cannot process zero tokens')
    })

    it('should handle insufficient UTXOs', async () => {
      const insufficientUtxos = {
        utxos: [] as FormattedUtxo[],
        totalAmount: 0,
      }

      await expect(
        removeLiquidityPsbt({
          calldata: [1n, 2n, 3n],
          token: mockToken0,
          tokenAmount: 1000n,
          gatheredUtxos: insufficientUtxos,
          feeRate: 10,
          account,
          provider,
        })
      ).rejects.toThrow()
    })
  })

  describe('Edge Cases', () => {
    it('should handle very large token amounts', async () => {
      const result = await swapPsbt({
        calldata: [1n, 2n, 3n],
        token: mockToken0,
        tokenAmount: BigInt(Number.MAX_SAFE_INTEGER),
        gatheredUtxos: mockGatheredUtxos,
        feeRate: 10,
        account,
        provider,
      })

      expect(result.psbt).toBeDefined()
    })

    it('should handle high fee rates', async () => {
      const result = await swapPsbt({
        calldata: [1n, 2n, 3n],
        token: mockToken0,
        tokenAmount: 1000n,
        gatheredUtxos: mockGatheredUtxos,
        feeRate: 1000,
        account,
        provider,
      })

      expect(result.psbt).toBeDefined()
    })

    it('should handle empty calldata', async () => {
      const result = await swapPsbt({
        calldata: [],
        token: mockToken0,
        tokenAmount: 1000n,
        gatheredUtxos: mockGatheredUtxos,
        feeRate: 10,
        account,
        provider,
      })

      expect(result.psbt).toBeDefined()
    })
  })
})
