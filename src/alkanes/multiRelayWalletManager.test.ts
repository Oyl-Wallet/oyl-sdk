import * as bitcoin from 'bitcoinjs-lib'
import { generateMultiRelayWallets } from './multiRelayWalletManager'

// Test setup
const mockNetwork = bitcoin.networks.regtest

// Mock the chainMinting module
jest.mock('./chainMinting', () => ({
  ChainMintingError: class extends Error {
    constructor(type: string, message: string, details?: any) {
      super(message)
      this.name = 'ChainMintingError'
    }
  },
  ChainMintingErrorType: {
    INVALID_ADDRESS_TYPE: 'INVALID_ADDRESS_TYPE',
    INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
    TRANSACTION_BUILD_FAILED: 'TRANSACTION_BUILD_FAILED'
  },
  AddressType: {
    P2PKH: 'P2PKH',
    P2SH: 'P2SH', 
    P2WPKH: 'P2WPKH',
    P2WSH: 'P2WSH',
    P2TR: 'P2TR'
  }
}))

// Mock the walletManager module
jest.mock('./walletManager', () => ({
  generateChainMintingWalletsFromEnv: jest.fn().mockImplementation(async (network, derivationIndex = 0) => {
    const uniqueSuffix = derivationIndex ? derivationIndex.toString(36).slice(-6) : 'main'
    return {
      mainWallet: {
        account: {
          taproot: {
            address: 'bcrt1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqvg32hk'
          },
          nativeSegwit: {
            address: 'bcrt1qmainwallet123',
            hdPath: "m/84'/0'/0'/0/0"
          }
        }
      },
      relayWallet: {
        account: {
          nativeSegwit: {
            address: `bcrt1qrelay${uniqueSuffix}`,
            hdPath: `m/84'/0'/${derivationIndex}'/0/0`
          }
        }
      },
      relayWalletIndex: derivationIndex
    }
  }),
  validateWalletConfiguration: jest.fn().mockReturnValue({
    mainWallet: {
      isValid: true,
      errors: [],
      addressType: 'P2TR'
    }
  }),
  getAddressTypeName: jest.fn().mockReturnValue('nativeSegwit')
}))

// Mock account generation
jest.mock('../account/account', () => ({
  mnemonicToAccount: jest.fn().mockImplementation(({ opts }) => ({
    nativeSegwit: {
      address: `bcrt1qmock${opts.index}${Math.random().toString(36).substring(2, 8)}`,
      hdPath: `m/84'/0'/${opts.index}'/0/0`
    }
  })),
  generateMnemonic: jest.fn().mockReturnValue('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
}))

describe('MultiRelayWalletManager Tests', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks()
    
    // Mock environment variable
    process.env.BATCH_MINT_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
  })

  afterEach(() => {
    delete process.env.BATCH_MINT_MNEMONIC
  })

  describe('generateMultiRelayWallets', () => {
    it('should generate correct number of relay wallets for 50 tokens', async () => {
      const result = await generateMultiRelayWallets(mockNetwork, 50)

      // 50 tokens = 2 slices (25 each)
      expect(result.relayWallets).toHaveLength(2)
      expect(result.totalSlices).toBe(2)
      expect(result.network).toBe(mockNetwork)
      
      // Verify relay wallet structure
      expect(result.relayWallets[0]).toEqual(
        expect.objectContaining({
          sliceIndex: 0,
          wallet: expect.any(Object),
          address: expect.any(String),
          derivationIndex: expect.any(Number)
        })
      )
      
      expect(result.relayWallets[1]).toEqual(
        expect.objectContaining({
          sliceIndex: 1,
          wallet: expect.any(Object),
          address: expect.any(String),
          derivationIndex: expect.any(Number)
        })
      )
    })

    it('should generate correct number of relay wallets for 100 tokens', async () => {
      const result = await generateMultiRelayWallets(mockNetwork, 100)

      // 100 tokens = 4 slices (25 each)
      expect(result.relayWallets).toHaveLength(4)
      expect(result.totalSlices).toBe(4)
      
      // Verify all slices are properly indexed
      result.relayWallets.forEach((wallet, index) => {
        expect(wallet.sliceIndex).toBe(index)
      })
    })

    it('should generate correct number of relay wallets for 500 tokens', async () => {
      const result = await generateMultiRelayWallets(mockNetwork, 500)

      // 500 tokens = 20 slices (25 each)
      expect(result.relayWallets).toHaveLength(20)
      expect(result.totalSlices).toBe(20)
    })

    it('should handle odd number of tokens correctly (77 tokens)', async () => {
      const result = await generateMultiRelayWallets(mockNetwork, 77)

      // 77 tokens = 4 slices (25, 25, 25, 2)
      expect(result.relayWallets).toHaveLength(4)
      expect(result.totalSlices).toBe(4)
      
      // All slices should be properly generated regardless of token distribution
      result.relayWallets.forEach((wallet, index) => {
        expect(wallet.sliceIndex).toBe(index)
        expect(wallet.address).toBeTruthy()
        expect(wallet.derivationIndex).toBeGreaterThan(0)
      })
    })

    it('should generate unique relay wallet addresses', async () => {
      const result = await generateMultiRelayWallets(mockNetwork, 100)

      const addresses = result.relayWallets.map(wallet => wallet.address)
      const uniqueAddresses = new Set(addresses)
      
      expect(uniqueAddresses.size).toBe(addresses.length)
    })

    it('should use proper derivation indices with safe spacing', async () => {
      const result = await generateMultiRelayWallets(mockNetwork, 50)

      // Should have proper spacing between derivation indices
      const derivationIndices = result.relayWallets.map(wallet => wallet.derivationIndex)
      
      // Check that indices are spaced safely apart (at least 1000 apart)
      for (let i = 1; i < derivationIndices.length; i++) {
        expect(derivationIndices[i] - derivationIndices[i-1]).toBeGreaterThanOrEqual(1000)
      }
    })

    it('should handle minimum case (26 tokens)', async () => {
      const result = await generateMultiRelayWallets(mockNetwork, 26)

      // 26 tokens = 2 slices (25, 1)
      expect(result.relayWallets).toHaveLength(2)
      expect(result.totalSlices).toBe(2)
    })

    it('should handle maximum case (2500 tokens)', async () => {
      const result = await generateMultiRelayWallets(mockNetwork, 2500)

      // 2500 tokens = 100 slices (25 each)
      expect(result.relayWallets).toHaveLength(100)
      expect(result.totalSlices).toBe(100)
    })

    it('should throw error for invalid input (≤25 tokens)', async () => {
      await expect(generateMultiRelayWallets(mockNetwork, 25))
        .rejects.toThrow('Multi-relay wallet generation requires more than 25 tokens')
      
      await expect(generateMultiRelayWallets(mockNetwork, 10))
        .rejects.toThrow('Multi-relay wallet generation requires more than 25 tokens')
    })

    it('should throw error for invalid input (>2500 tokens)', async () => {
      await expect(generateMultiRelayWallets(mockNetwork, 2501))
        .rejects.toThrow('分片数量过多')
    })

    it('should use custom base derivation index when provided', async () => {
      const customBaseIndex = 5000
      const result = await generateMultiRelayWallets(mockNetwork, 50, customBaseIndex)

      expect(result.baseDerivatonIndex).toBe(customBaseIndex)
      
      // First relay wallet should use customBaseIndex + 1000
      expect(result.relayWallets[0].derivationIndex).toBe(customBaseIndex + 1000)
      
      // Second relay wallet should use customBaseIndex + 2000
      expect(result.relayWallets[1].derivationIndex).toBe(customBaseIndex + 2000)
    })

    it('should handle wallet generation failure gracefully', async () => {
      // Mock generateChainMintingWalletsFromEnv to fail
      const { generateChainMintingWalletsFromEnv } = require('./walletManager')
      generateChainMintingWalletsFromEnv.mockRejectedValueOnce(new Error('Wallet generation failed'))

      await expect(generateMultiRelayWallets(mockNetwork, 50))
        .rejects.toThrow('Wallet generation failed')
    })

    it('should maintain proper network configuration', async () => {
      const bitcoinResult = await generateMultiRelayWallets(bitcoin.networks.bitcoin, 50)
      const regtestResult = await generateMultiRelayWallets(bitcoin.networks.regtest, 50)

      expect(bitcoinResult.network).toBe(bitcoin.networks.bitcoin)
      expect(regtestResult.network).toBe(bitcoin.networks.regtest)
      
      // Should use the same structure regardless of network
      expect(bitcoinResult.relayWallets).toHaveLength(2)
      expect(regtestResult.relayWallets).toHaveLength(2)
    })

    it('should include main wallet in the system', async () => {
      const result = await generateMultiRelayWallets(mockNetwork, 50)

      expect(result.mainWallet).toBeDefined()
      expect(result.mainWallet.account.taproot.address).toBeTruthy()
    })

    it('should validate required environment variables', async () => {
      // Remove the required environment variable
      delete process.env.BATCH_MINT_MNEMONIC
      
      // Mock generateChainMintingWalletsFromEnv to fail due to missing env
      const { generateChainMintingWalletsFromEnv } = require('./walletManager')
      generateChainMintingWalletsFromEnv.mockRejectedValueOnce(new Error('BATCH_MINT_MNEMONIC environment variable is required'))

      await expect(generateMultiRelayWallets(mockNetwork, 50))
        .rejects.toThrow('BATCH_MINT_MNEMONIC environment variable is required')
    })
  })
})