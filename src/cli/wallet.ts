import 'dotenv/config'
import {
  mnemonicToAccount,
  getWalletPrivateKeys,
  Provider,
  Account,
  Signer,
} from '..'
import { DEFAULT_PROVIDER, TEST_WALLET } from './constants'

export type NetworkType = 'mainnet' | 'regtest' | 'oylnet'

export interface WalletOptions {
  mnemonic?: string
  networkType?: NetworkType
  feeRate?: number
  provider?: Provider | string
  metashrewRpcUrl?: string  // Add this parameter
}

export class Wallet {
  mnemonic: string
  networkType: string
  provider: Provider
  account: Account
  signer: Signer
  feeRate: number

  constructor(options?: WalletOptions) {
    this.mnemonic =
      options?.mnemonic || process.env.MNEMONIC || TEST_WALLET.mnemonic
    this.networkType = options?.networkType || 'regtest'
    
    if (options?.provider && typeof options.provider === 'string') {
      // If a provider name is specified, get the default provider
      const defaultProvider = DEFAULT_PROVIDER[options.provider]
      
      if (options.metashrewRpcUrl) {
        // If metashrewRpcUrl is provided, create a new provider with it
        this.provider = new Provider({
          url: defaultProvider.url,
          projectId: defaultProvider.projectId || '',
          network: defaultProvider.network,
          networkType: defaultProvider.networkType,
          version: defaultProvider.version,
          metashrewRpcUrl: options.metashrewRpcUrl
        })
      } else {
        this.provider = defaultProvider
      }
    } else if (options?.provider) {
      // If a provider instance is provided, use it directly
      this.provider = options.provider as Provider
    } else {
      // Use the default provider for the network type
      const defaultProvider = DEFAULT_PROVIDER[this.networkType]
      
      if (options?.metashrewRpcUrl) {
        // If metashrewRpcUrl is provided, create a new provider with it
        this.provider = new Provider({
          url: defaultProvider.url,
          projectId: defaultProvider.projectId || '',
          network: defaultProvider.network,
          networkType: defaultProvider.networkType,
          version: defaultProvider.version,
          metashrewRpcUrl: options.metashrewRpcUrl
        })
      } else {
        this.provider = defaultProvider
      }
    }
    
    this.account = mnemonicToAccount({
      mnemonic: this.mnemonic,
      opts: {
        network: this.provider.network,
      },
    })

    const privateKeys = getWalletPrivateKeys({
      mnemonic: this.mnemonic,
      opts: {
        network: this.account.network,
      },
    })

    this.signer = new Signer(this.account.network, {
      taprootPrivateKey: privateKeys.taproot.privateKey,
      segwitPrivateKey: privateKeys.nativeSegwit.privateKey,
      nestedSegwitPrivateKey: privateKeys.nestedSegwit.privateKey,
      legacyPrivateKey: privateKeys.legacy.privateKey,
    })

    this.feeRate = options?.feeRate ? options?.feeRate : 2
  }
}
