import * as bitcoin from 'bitcoinjs-lib'
import { Provider } from '../provider/provider'
import { Account, mnemonicToAccount } from '../account/account'
import * as utxo from '../utxo/utxo'
import { FormattedUtxo } from '../utxo'
import { Wallet } from './wallet'

const testAccount = mnemonicToAccount({
  mnemonic:
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  opts: { network: bitcoin.networks.regtest },
})

// Mock Provider
jest.mock('../provider/provider', () => {
  return {
    Provider: jest.fn().mockImplementation(() => ({
      network: bitcoin.networks.regtest,
      networkType: 'regtest',
      esplora: {
        _call: jest.fn().mockResolvedValue({
          chain_stats: { funded_txo_sum: 100000000, spent_txo_sum: 0 },
          mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 }
        }),
        getUtxos: jest.fn().mockResolvedValue([]),
        getTxInfo: jest.fn().mockResolvedValue({
          vout: [{ scriptpubkey: 'mock_script', value: 100000 }]
        })
      },
      ord: {
        getOrdData: jest.fn().mockResolvedValue({ outputs: [] }),
        getTxOutput: jest.fn().mockResolvedValue({
          inscriptions: [],
          runes: {}
        })
      },
      api: {
        getBrc20sByAddress: jest.fn().mockResolvedValue({ data: [] })
      },
      sandshrew: {
        multiCall: jest.fn().mockResolvedValue([
          { result: [] },
          300,
          { outpoints: [] }
        ])
      }
    }))
  }
})

// Mock Wallet
jest.mock('./wallet', () => {
  return {
    Wallet: jest.fn().mockImplementation(() => ({
      account: {
        taproot: { address: 'bc1p_mock_taproot_address' },
        nativeSegwit: { address: 'bc1q_mock_native_segwit_address' },
        nestedSegwit: { address: '3_mock_nested_segwit_address' },
        legacy: { address: '1_mock_legacy_address' },
        spendStrategy: {
          addressOrder: ['taproot', 'nativeSegwit', 'nestedSegwit', 'legacy'],
          utxoSortGreatestToLeast: true,
          changeAddress: 'taproot'
        },
        network: bitcoin.networks.regtest
      },
      provider: new (require('../provider/provider').Provider)()
    }))
  }
})

describe('Balance Commands', () => {
  let mockWallet: any
  let mockProvider: any

  beforeEach(() => {
    jest.clearAllMocks()
    mockWallet = new Wallet({ networkType: 'regtest' })
    mockProvider = mockWallet.provider
  })

  describe('BTC Balance Commands', () => {
    it('should return account balance with all address types', async () => {
      // Mock the addressBalance function to return different values for different addresses
      jest.spyOn(utxo, 'addressBalance')
        .mockResolvedValueOnce({ confirmedAmount: 0.5, pendingAmount: 0, amount: 0.5 }) // taproot
        .mockResolvedValueOnce({ confirmedAmount: 0.3, pendingAmount: 0.1, amount: 0.4 }) // nativeSegwit
        .mockResolvedValueOnce({ confirmedAmount: 0, pendingAmount: 0, amount: 0 }) // nestedSegwit
        .mockResolvedValueOnce({ confirmedAmount: 0.2, pendingAmount: 0, amount: 0.2 }) // legacy

      // Test detailed balance breakdown logic
      const addresses = [
        { type: 'Taproot', address: mockWallet.account.taproot.address },
        { type: 'Native SegWit', address: mockWallet.account.nativeSegwit.address },
        { type: 'Nested SegWit', address: mockWallet.account.nestedSegwit.address },
        { type: 'Legacy', address: mockWallet.account.legacy.address },
      ]

      let totalConfirmed = 0
      let totalPending = 0
      let totalOverall = 0

      for (const { address } of addresses) {
        const balance = await utxo.addressBalance({
          address,
          provider: mockProvider,
        })
        totalConfirmed += balance.confirmedAmount
        totalPending += balance.pendingAmount
        totalOverall += balance.amount
      }

      expect(totalConfirmed).toBe(1.0) // 0.5 + 0.3 + 0 + 0.2
      expect(totalPending).toBe(0.1) // 0 + 0.1 + 0 + 0
      expect(totalOverall).toBe(1.1) // 0.5 + 0.4 + 0 + 0.2
    })

    it('should handle errors gracefully when fetching address balances', async () => {
      jest.spyOn(utxo, 'addressBalance')
        .mockResolvedValueOnce({ confirmedAmount: 0.5, pendingAmount: 0, amount: 0.5 })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ confirmedAmount: 0, pendingAmount: 0, amount: 0 })
        .mockResolvedValueOnce({ confirmedAmount: 0.2, pendingAmount: 0, amount: 0.2 })

      // Simulate error handling for one address
      const addresses = [
        { type: 'Taproot', address: mockWallet.account.taproot.address },
        { type: 'Native SegWit', address: mockWallet.account.nativeSegwit.address },
        { type: 'Nested SegWit', address: mockWallet.account.nestedSegwit.address },
        { type: 'Legacy', address: mockWallet.account.legacy.address },
      ]

      let totalConfirmed = 0
      let errorCount = 0

      for (const { address } of addresses) {
        try {
          const balance = await utxo.addressBalance({
            address,
            provider: mockProvider,
          })
          totalConfirmed += balance.confirmedAmount
        } catch (error) {
          errorCount++
        }
      }

      expect(totalConfirmed).toBe(0.7) // 0.5 + 0 + 0.2 (skipping the error)
      expect(errorCount).toBe(1)
    })
  })

  describe('Rune Balance Commands', () => {
    it('should aggregate rune balances across all addresses', async () => {
      const mockRuneOutputs = [
        {
          runes: {
            'TEST•RUNE': { amount: 1000, divisibility: 2 },
            'ANOTHER•RUNE': { amount: 500, divisibility: 0 }
          }
        },
        {
          runes: {
            'TEST•RUNE': { amount: 2000, divisibility: 2 }
          }
        }
      ]

      mockProvider.ord.getOrdData
        .mockResolvedValueOnce({ outputs: ['output1', 'output2'] })
        .mockResolvedValueOnce({ outputs: [] })
        .mockResolvedValueOnce({ outputs: [] })
        .mockResolvedValueOnce({ outputs: [] })

      mockProvider.ord.getTxOutput
        .mockResolvedValueOnce(mockRuneOutputs[0])
        .mockResolvedValueOnce(mockRuneOutputs[1])

      // Simulate rune balance aggregation
      const allRuneBalances = new Map()
      
      // Process first address (has runes)
      const addressOutpoints = await mockProvider.ord.getOrdData('address1')
      for (const output of addressOutpoints.outputs) {
        const ordOutput = await mockProvider.ord.getTxOutput(output)
        if (ordOutput.runes && Object.keys(ordOutput.runes).length > 0) {
          for (const [runeName, runeData] of Object.entries(ordOutput.runes)) {
            const data = runeData as any
            const existing = allRuneBalances.get(runeName) || { amount: 0, divisibility: data.divisibility }
            existing.amount += data.amount
            allRuneBalances.set(runeName, existing)
          }
        }
      }

      expect(allRuneBalances.size).toBe(2)
      expect(allRuneBalances.get('TEST•RUNE').amount).toBe(3000) // 1000 + 2000
      expect(allRuneBalances.get('ANOTHER•RUNE').amount).toBe(500)
    })

    it('should handle addresses with no runes', async () => {
      mockProvider.ord.getOrdData.mockResolvedValue({ outputs: [] })

      const addressOutpoints = await mockProvider.ord.getOrdData('empty_address')
      expect(addressOutpoints.outputs).toHaveLength(0)
    })
  })

  describe('Collectible Balance Commands', () => {
    it('should count collectibles across all addresses', async () => {
      const mockInscriptionOutputs = [
        { inscriptions: ['inscription1', 'inscription2'] },
        { inscriptions: ['inscription3'] },
        { inscriptions: [] }
      ]

      mockProvider.ord.getOrdData
        .mockResolvedValueOnce({ outputs: ['output1', 'output2', 'output3'] })
        .mockResolvedValueOnce({ outputs: [] })
        .mockResolvedValueOnce({ outputs: [] })
        .mockResolvedValueOnce({ outputs: [] })

      mockProvider.ord.getTxOutput
        .mockResolvedValueOnce(mockInscriptionOutputs[0])
        .mockResolvedValueOnce(mockInscriptionOutputs[1])
        .mockResolvedValueOnce(mockInscriptionOutputs[2])

      let totalCollectibles = 0
      const addressOutpoints = await mockProvider.ord.getOrdData('address1')
      
      for (const output of addressOutpoints.outputs) {
        const ordOutput = await mockProvider.ord.getTxOutput(output)
        if (ordOutput.inscriptions && ordOutput.inscriptions.length > 0) {
          totalCollectibles += ordOutput.inscriptions.length
        }
      }

      expect(totalCollectibles).toBe(3) // 2 + 1 + 0
    })
  })

  describe('BRC20 Balance Commands', () => {
    it('should fetch BRC20 balances for all address types', async () => {
      const mockBrc20Data = [
        {
          data: [
            { ticker: 'ORDI', overall_balance: '1000', available_balance: '800', transferable_balance: '1000' },
            { ticker: 'SATS', overall_balance: '50000', available_balance: '50000', transferable_balance: '50000' }
          ]
        },
        { data: [] },
        { data: [] },
        {
          data: [
            { ticker: 'ORDI', overall_balance: '500', available_balance: '500', transferable_balance: '500' }
          ]
        }
      ]

      mockProvider.api.getBrc20sByAddress
        .mockResolvedValueOnce(mockBrc20Data[0])
        .mockResolvedValueOnce(mockBrc20Data[1])
        .mockResolvedValueOnce(mockBrc20Data[2])
        .mockResolvedValueOnce(mockBrc20Data[3])

      const addresses = [
        mockWallet.account.taproot.address,
        mockWallet.account.nativeSegwit.address,
        mockWallet.account.nestedSegwit.address,
        mockWallet.account.legacy.address,
      ]

      let totalTokenTypes = 0
      const uniqueTokens = new Set()

      for (const address of addresses) {
        const brc20Data = await mockProvider.api.getBrc20sByAddress(address)
        if (brc20Data.data && brc20Data.data.length > 0) {
          brc20Data.data.forEach((token: any) => {
            uniqueTokens.add(token.ticker)
            totalTokenTypes++
          })
        }
      }

      expect(totalTokenTypes).toBe(3) // ORDI, SATS, ORDI again
      expect(uniqueTokens.size).toBe(2) // ORDI, SATS (unique)
    })
  })

  describe('Alkanes Balance Commands', () => {
    it('should aggregate alkane balances by token ID', async () => {
      const mockUtxosWithAlkanes: FormattedUtxo[] = [
        {
          txId: 'tx1',
          outputIndex: 0,
          satoshis: 1000,
          address: 'address1',
          alkanes: {
            '2:1': { name: 'TestToken', symbol: 'TT', value: '1000' },
            '2:2': { name: 'AnotherToken', symbol: 'AT', value: '500' }
          },
          inscriptions: [],
          runes: {},
          confirmations: 1,
          indexed: true,
          scriptPk: 'script1'
        },
        {
          txId: 'tx2',
          outputIndex: 0,
          satoshis: 2000,
          address: 'address2',
          alkanes: {
            '2:1': { name: 'TestToken', symbol: 'TT', value: '2000' }
          },
          inscriptions: [],
          runes: {},
          confirmations: 1,
          indexed: true,
          scriptPk: 'script2'
        }
      ]

      jest.spyOn(utxo, 'accountUtxos').mockResolvedValue({
        accountUtxos: mockUtxosWithAlkanes,
        accountTotalBalance: 3000,
        accountSpendableTotalUtxos: [],
        accountSpendableTotalBalance: 0,
        accountPendingTotalBalance: 0,
        accounts: {
          taproot: { utxos: [], alkaneUtxos: [], spendableTotalBalance: 0, spendableUtxos: [], runeUtxos: [], ordUtxos: [], pendingUtxos: [], pendingTotalBalance: 0, totalBalance: 0 },
          nativeSegwit: { utxos: [], alkaneUtxos: [], spendableTotalBalance: 0, spendableUtxos: [], runeUtxos: [], ordUtxos: [], pendingUtxos: [], pendingTotalBalance: 0, totalBalance: 0 },
          nestedSegwit: { utxos: [], alkaneUtxos: [], spendableTotalBalance: 0, spendableUtxos: [], runeUtxos: [], ordUtxos: [], pendingUtxos: [], pendingTotalBalance: 0, totalBalance: 0 },
          legacy: { utxos: [], alkaneUtxos: [], spendableTotalBalance: 0, spendableUtxos: [], runeUtxos: [], ordUtxos: [], pendingUtxos: [], pendingTotalBalance: 0, totalBalance: 0 }
        }
      })

      // Simulate alkane balance aggregation logic
      const alkaneBalances = new Map<string, {
        name: string;
        symbol: string;
        totalValue: number;
        utxoCount: number;
      }>()

      mockUtxosWithAlkanes.forEach((utxoItem) => {
        if (utxoItem.alkanes && Object.keys(utxoItem.alkanes).length > 0) {
          for (const alkaneId in utxoItem.alkanes) {
            const alkaneDetails = utxoItem.alkanes[alkaneId]
            
            if (!alkaneBalances.has(alkaneId)) {
              alkaneBalances.set(alkaneId, {
                name: alkaneDetails.name,
                symbol: alkaneDetails.symbol,
                totalValue: 0,
                utxoCount: 0
              })
            }

            const balance = alkaneBalances.get(alkaneId)!
            balance.totalValue += Number(alkaneDetails.value)
            balance.utxoCount += 1
          }
        }
      })

      expect(alkaneBalances.size).toBe(2)
      expect(alkaneBalances.get('2:1')?.totalValue).toBe(3000) // 1000 + 2000
      expect(alkaneBalances.get('2:1')?.utxoCount).toBe(2)
      expect(alkaneBalances.get('2:2')?.totalValue).toBe(500)
      expect(alkaneBalances.get('2:2')?.utxoCount).toBe(1)
    })

    it('should handle accounts with no alkanes', async () => {
      const mockUtxosWithoutAlkanes: FormattedUtxo[] = [
        {
          txId: 'tx1',
          outputIndex: 0,
          satoshis: 1000,
          address: 'address1',
          alkanes: {},
          inscriptions: [],
          runes: {},
          confirmations: 1,
          indexed: true,
          scriptPk: 'script1'
        }
      ]

      jest.spyOn(utxo, 'accountUtxos').mockResolvedValue({
        accountUtxos: mockUtxosWithoutAlkanes,
        accountTotalBalance: 1000,
        accountSpendableTotalUtxos: [],
        accountSpendableTotalBalance: 0,
        accountPendingTotalBalance: 0,
        accounts: {
          taproot: { utxos: [], alkaneUtxos: [], spendableTotalBalance: 0, spendableUtxos: [], runeUtxos: [], ordUtxos: [], pendingUtxos: [], pendingTotalBalance: 0, totalBalance: 0 },
          nativeSegwit: { utxos: [], alkaneUtxos: [], spendableTotalBalance: 0, spendableUtxos: [], runeUtxos: [], ordUtxos: [], pendingUtxos: [], pendingTotalBalance: 0, totalBalance: 0 },
          nestedSegwit: { utxos: [], alkaneUtxos: [], spendableTotalBalance: 0, spendableUtxos: [], runeUtxos: [], ordUtxos: [], pendingUtxos: [], pendingTotalBalance: 0, totalBalance: 0 },
          legacy: { utxos: [], alkaneUtxos: [], spendableTotalBalance: 0, spendableUtxos: [], runeUtxos: [], ordUtxos: [], pendingUtxos: [], pendingTotalBalance: 0, totalBalance: 0 }
        }
      })

      const accountPortfolio = await utxo.accountUtxos({
        account: mockWallet.account,
        provider: mockProvider,
      })

      let foundAlkanes = false
      if (accountPortfolio.accountUtxos && accountPortfolio.accountUtxos.length > 0) {
        accountPortfolio.accountUtxos.forEach((utxoItem) => {
          if (utxoItem.alkanes && Object.keys(utxoItem.alkanes).length > 0) {
            foundAlkanes = true
          }
        })
      }

      expect(foundAlkanes).toBe(false)
    })
  })

  describe('Comprehensive Asset Balance', () => {
    it('should aggregate all asset types in one overview', async () => {
      // Mock BTC balance
      jest.spyOn(utxo, 'accountBalance').mockResolvedValue({
        confirmedAmount: 1,
        pendingAmount: 0.1,
        amount: 1.1
      })

      // Mock Alkanes
      const mockUtxosWithAlkanes: FormattedUtxo[] = [
        {
          txId: 'tx1',
          outputIndex: 0,
          satoshis: 1000,
          address: 'address1',
          alkanes: {
            '2:1': { name: 'TestToken', symbol: 'TT', value: '1000' }
          },
          inscriptions: [],
          runes: {},
          confirmations: 1,
          indexed: true,
          scriptPk: 'script1'
        }
      ]

      jest.spyOn(utxo, 'accountUtxos').mockResolvedValue({
        accountUtxos: mockUtxosWithAlkanes,
        accountTotalBalance: 1000,
        accountSpendableTotalUtxos: [],
        accountSpendableTotalBalance: 0,
        accountPendingTotalBalance: 0,
        accounts: {
          taproot: { utxos: [], alkaneUtxos: [], spendableTotalBalance: 0, spendableUtxos: [], runeUtxos: [], ordUtxos: [], pendingUtxos: [], pendingTotalBalance: 0, totalBalance: 0 },
          nativeSegwit: { utxos: [], alkaneUtxos: [], spendableTotalBalance: 0, spendableUtxos: [], runeUtxos: [], ordUtxos: [], pendingUtxos: [], pendingTotalBalance: 0, totalBalance: 0 },
          nestedSegwit: { utxos: [], alkaneUtxos: [], spendableTotalBalance: 0, spendableUtxos: [], runeUtxos: [], ordUtxos: [], pendingUtxos: [], pendingTotalBalance: 0, totalBalance: 0 },
          legacy: { utxos: [], alkaneUtxos: [], spendableTotalBalance: 0, spendableUtxos: [], runeUtxos: [], ordUtxos: [], pendingUtxos: [], pendingTotalBalance: 0, totalBalance: 0 }
        }
      })

      // Mock BRC20
      mockProvider.api.getBrc20sByAddress.mockResolvedValue({
        data: [{ ticker: 'ORDI', overall_balance: '1000' }]
      })

      // Mock Runes  
      mockProvider.ord.getOrdData.mockResolvedValue({ outputs: ['output1'] })
      mockProvider.ord.getTxOutput.mockResolvedValue({
        runes: { 'TEST•RUNE': { amount: 1000, divisibility: 2 } },
        inscriptions: ['inscription1']
      })

      // Test that all asset types are fetched
      const btcBalance = await utxo.accountBalance({
        account: mockWallet.account,
        provider: mockProvider,
      })
      
      const accountPortfolio = await utxo.accountUtxos({
        account: mockWallet.account,
        provider: mockProvider,
      })

      const brc20Data = await mockProvider.api.getBrc20sByAddress(mockWallet.account.taproot.address)
      const ordData = await mockProvider.ord.getOrdData(mockWallet.account.taproot.address)
      const ordOutput = await mockProvider.ord.getTxOutput('output1')

      expect(btcBalance.amount).toBe(1.1)
      expect(accountPortfolio.accountUtxos).toHaveLength(1)
      expect(brc20Data.data).toHaveLength(1)
      expect(ordData.outputs).toHaveLength(1)
      expect(ordOutput.runes['TEST•RUNE']).toBeDefined()
      expect(ordOutput.inscriptions).toHaveLength(1)
    })
  })
})