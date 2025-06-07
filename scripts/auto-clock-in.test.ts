import * as bitcoin from 'bitcoinjs-lib'
import { AutoClockInService } from './auto-clock-in'
import * as alkanes from '../src/alkanes/alkanes'
import * as utxo from '../src/utxo'
import { mnemonicToAccount, getWalletPrivateKeys, Signer } from '../src'
import { Provider } from '../src/provider/provider'
import { FormattedUtxo } from '../src/utxo'

// Mock external dependencies
jest.mock('../src/alkanes/alkanes', () => ({
  ...jest.requireActual('../src/alkanes/alkanes'),
  execute: jest.fn(),
  encodeProtostone: jest.fn().mockReturnValue(Buffer.from('mock_protostone_buffer'))
}))
jest.mock('../src/utxo')

// Mock the alkanes/lib modules
jest.mock('alkanes/lib/protorune/proto_runestone_upgrade', () => ({
  encodeRunestoneProtostone: jest.fn().mockReturnValue({
    encodedRunestone: Buffer.from('mock_protostone_buffer')
  })
}))

jest.mock('alkanes/lib/protorune/protostone', () => ({
  ProtoStone: {
    message: jest.fn().mockReturnValue('mock_protostone_message')
  }
}))

jest.mock('alkanes/lib/bytes', () => ({
  encipher: jest.fn().mockReturnValue('mock_enciphered_calldata')
}))

// Mock environment variables
const originalEnv = process.env

describe('AutoClockInService', () => {
  const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

  beforeEach(() => {
    jest.resetAllMocks()
    
    // Reset environment variables
    process.env = {
      ...originalEnv,
      CLOCK_IN_MNEMONIC: testMnemonic,
      CLOCK_IN_WALLETS: '3',
      CLOCK_IN_CALLDATA: '2,21568,103',
      CLOCK_IN_START_HEIGHT: '899573',
      CLOCK_IN_INTERVAL: '144',
      NETWORK_TYPE: 'regtest'
    }

    // Mock fetch for external APIs
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('blockstream.info/api/blocks/tip/height')) {
        return Promise.resolve({
          json: () => Promise.resolve(899572), // Block before clock-in
          ok: true
        } as Response)
      }
      if (url.includes('mempool.space/api/v1/fees/mempool-blocks')) {
        return Promise.resolve({
          json: () => Promise.resolve([
            { medianFee: 10, feeRange: [5, 15], totalFees: 50000 }
          ]),
          ok: true
        } as Response)
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    // Mock accountUtxos to return different UTXOs for each wallet
    jest.spyOn(utxo, 'accountUtxos').mockImplementation(async ({ account }) => {
      const walletIndex = account.taproot.address.slice(-1) // Get last char as identifier
      const uniqueTxId = walletIndex.padEnd(64, '0')
      
      const accountSpecificUtxos: FormattedUtxo[] = [
        {
          txId: uniqueTxId,
          outputIndex: 0,
          satoshis: 100000, // 0.001 BTC
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
        accountTotalBalance: 100000,
        accountSpendableTotalUtxos: accountSpecificUtxos,
        accountSpendableTotalBalance: 100000,
        accountPendingTotalBalance: 0,
        accounts: {
          taproot: {
            alkaneUtxos: [],
            spendableTotalBalance: 100000,
            spendableUtxos: accountSpecificUtxos,
            runeUtxos: [],
            ordUtxos: [],
            pendingUtxos: [],
            pendingTotalBalance: 0,
            totalBalance: 100000,
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

    // Mock alkanes.execute to return success
    jest.spyOn(alkanes, 'execute').mockResolvedValue({
      txId: 'mock_tx_id_12345',
      rawTx: 'mock_raw_tx',
      size: 250,
      weight: 1000,
      fee: 2500,
      satsPerVByte: '10.00'
    })
  })

  afterEach(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
  })

  describe('Wallet Initialization', () => {
    it('should create unique wallets with different signers and addresses', () => {
      const service = new AutoClockInService()
      
      // Access private wallets property for testing
      const wallets = (service as any).wallets
      
      expect(wallets).toHaveLength(3)
      
      // Verify each wallet has unique address
      const addresses = wallets.map((wallet: any) => wallet.address)
      expect(new Set(addresses).size).toBe(3) // All unique addresses
      
      // Verify each wallet has different index
      expect(wallets[0].index).toBe(0)
      expect(wallets[1].index).toBe(1)
      expect(wallets[2].index).toBe(2)
      
      // Verify each wallet has its own signer instance
      const signers = wallets.map((wallet: any) => wallet.signer)
      expect(signers[0]).not.toBe(signers[1])
      expect(signers[1]).not.toBe(signers[2])
    })

    it('should create signers with correct private keys for each wallet index', () => {
      const service = new AutoClockInService()
      const wallets = (service as any).wallets
      
      // Verify that each wallet's signer has different keys
      const taprootPublicKeys = wallets.map((wallet: any) => 
        wallet.signer.taprootKeyPair.publicKey.toString('hex')
      )
      
      expect(new Set(taprootPublicKeys).size).toBe(3) // All unique public keys
      
      // Verify the first wallet's keys match the expected derivation
      const expectedPrivateKeys0 = getWalletPrivateKeys({
        mnemonic: testMnemonic,
        opts: {
          network: bitcoin.networks.regtest,
          index: 0,
        },
      })
      
      // Create expected signer to compare public keys
      const expectedSigner = new Signer(bitcoin.networks.regtest, {
        taprootPrivateKey: expectedPrivateKeys0.taproot.privateKey,
        segwitPrivateKey: expectedPrivateKeys0.nativeSegwit.privateKey,
        nestedSegwitPrivateKey: expectedPrivateKeys0.nestedSegwit.privateKey,
        legacyPrivateKey: expectedPrivateKeys0.legacy.privateKey,
      })
      
      const firstWalletSigner = wallets[0].signer
      expect(firstWalletSigner.taprootKeyPair.publicKey.toString('hex'))
        .toBe(expectedSigner.taprootKeyPair.publicKey.toString('hex'))
    })
  })

  describe('Transaction Execution', () => {
    it('should call alkanes.execute with required alkaneReceiverAddress for each wallet', async () => {
      const service = new AutoClockInService()
      
      // Mock the private method to access it
      const executeClockIn = (service as any).executeClockIn.bind(service)
      const wallets = (service as any).wallets
      
      // Execute clock-in for the first wallet
      const result = await executeClockIn(wallets[0], 15)
      
      expect(result).toBe('mock_tx_id_12345')
      
      // Verify alkanes.execute was called with the correct parameters
      expect(alkanes.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          utxos: expect.any(Array),
          account: wallets[0].account,
          provider: wallets[0].provider,
          feeRate: 15,
          signer: wallets[0].signer,
          alkaneReceiverAddress: wallets[0].address
        })
      )
    })

    it('should use each wallet\'s own address as receiver', async () => {
      const service = new AutoClockInService()
      const executeClockIn = (service as any).executeClockIn.bind(service)
      const wallets = (service as any).wallets
      
      // Execute for multiple wallets
      await executeClockIn(wallets[0], 15)
      await executeClockIn(wallets[1], 15)
      await executeClockIn(wallets[2], 15)
      
      expect(alkanes.execute).toHaveBeenCalledTimes(3)
      
      // Verify each call used the correct wallet's address as receiver
      const calls = (alkanes.execute as jest.Mock).mock.calls
      expect(calls[0][0].alkaneReceiverAddress).toBe(wallets[0].address)
      expect(calls[1][0].alkaneReceiverAddress).toBe(wallets[1].address)
      expect(calls[2][0].alkaneReceiverAddress).toBe(wallets[2].address)
      
      // Verify addresses are different
      expect(calls[0][0].alkaneReceiverAddress).not.toBe(calls[1][0].alkaneReceiverAddress)
      expect(calls[1][0].alkaneReceiverAddress).not.toBe(calls[2][0].alkaneReceiverAddress)
    })

    it('should get unique UTXOs for each wallet', async () => {
      const service = new AutoClockInService()
      const executeClockIn = (service as any).executeClockIn.bind(service)
      const wallets = (service as any).wallets
      
      // Execute for all wallets
      await executeClockIn(wallets[0], 15)
      await executeClockIn(wallets[1], 15)
      await executeClockIn(wallets[2], 15)
      
      // Verify accountUtxos was called for each wallet
      expect(utxo.accountUtxos).toHaveBeenCalledTimes(3)
      
      // Verify each call was made with different accounts
      const utxoCalls = (utxo.accountUtxos as jest.Mock).mock.calls
      expect(utxoCalls[0][0].account).toBe(wallets[0].account)
      expect(utxoCalls[1][0].account).toBe(wallets[1].account)
      expect(utxoCalls[2][0].account).toBe(wallets[2].account)
      
      // Verify accounts have different addresses
      expect(utxoCalls[0][0].account.taproot.address).not.toBe(utxoCalls[1][0].account.taproot.address)
      expect(utxoCalls[1][0].account.taproot.address).not.toBe(utxoCalls[2][0].account.taproot.address)
    })

    it('should handle wallet with no UTXOs gracefully', async () => {
      // Mock accountUtxos to return empty for one wallet
      jest.spyOn(utxo, 'accountUtxos').mockImplementation(async ({ account }) => {
        if (account.taproot.address.includes('1')) { // Second wallet (index 1)
          return {
            accountUtxos: [], // No UTXOs
            accountTotalBalance: 0,
            accountSpendableTotalUtxos: [],
            accountSpendableTotalBalance: 0,
            accountPendingTotalBalance: 0,
            accounts: {} as any
          }
        }
        
        // Return normal UTXOs for other wallets
        const walletIndex = account.taproot.address.slice(-1)
        const uniqueTxId = walletIndex.padEnd(64, '0')
        
        const accountSpecificUtxos: FormattedUtxo[] = [
          {
            txId: uniqueTxId,
            outputIndex: 0,
            satoshis: 100000,
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
          accountTotalBalance: 100000,
          accountSpendableTotalUtxos: accountSpecificUtxos,
          accountSpendableTotalBalance: 100000,
          accountPendingTotalBalance: 0,
          accounts: {} as any
        }
      })
      
      const service = new AutoClockInService()
      const executeClockIn = (service as any).executeClockIn.bind(service)
      const wallets = (service as any).wallets
      
      // Execute for wallet with no UTXOs
      const result = await executeClockIn(wallets[1], 15)
      
      expect(result).toBe(null)
      expect(alkanes.execute).not.toHaveBeenCalled()
    })

    it('should handle transaction execution failure gracefully', async () => {
      // Mock alkanes.execute to throw error
      jest.spyOn(alkanes, 'execute').mockRejectedValue(new Error('Transaction failed'))
      
      const service = new AutoClockInService()
      const executeClockIn = (service as any).executeClockIn.bind(service)
      const wallets = (service as any).wallets
      
      // Execute clock-in for the first wallet
      const result = await executeClockIn(wallets[0], 15)
      
      expect(result).toBe(null)
      expect(alkanes.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          alkaneReceiverAddress: wallets[0].address
        })
      )
    })
  })

  describe('Concurrent Execution', () => {
    it('should execute clock-in for all wallets concurrently with different receivers', async () => {
      const service = new AutoClockInService()
      const sendClockInTransactions = (service as any).sendClockInTransactions.bind(service)
      
      // Execute the concurrent transaction sending
      await sendClockInTransactions(899573)
      
      // Verify all wallets executed
      expect(alkanes.execute).toHaveBeenCalledTimes(3)
      
      // Verify each wallet used its own address as receiver
      const calls = (alkanes.execute as jest.Mock).mock.calls
      const receivers = calls.map(call => call[0].alkaneReceiverAddress)
      
      expect(new Set(receivers).size).toBe(3) // All unique receivers
      
      // Verify receivers match wallet addresses
      const wallets = (service as any).wallets
      expect(receivers).toContain(wallets[0].address)
      expect(receivers).toContain(wallets[1].address)
      expect(receivers).toContain(wallets[2].address)
    })
  })

  describe('Configuration Validation', () => {
    it('should throw error when CLOCK_IN_MNEMONIC is not set', () => {
      delete process.env.CLOCK_IN_MNEMONIC
      
      expect(() => new AutoClockInService()).toThrow('CLOCK_IN_MNEMONIC not found in environment variables')
    })

    it('should use default values for optional configuration', () => {
      delete process.env.CLOCK_IN_WALLETS
      delete process.env.CLOCK_IN_CALLDATA
      delete process.env.CLOCK_IN_START_HEIGHT
      
      const service = new AutoClockInService()
      const config = (service as any).config
      
      expect(config.walletCount).toBe(20)
      expect(config.calldata).toEqual([2n, 21568n, 103n])
      expect(config.startHeight).toBe(899573)
    })
  })
})