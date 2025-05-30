import 'dotenv/config'
import {
  mnemonicToAccount,
  getWalletPrivateKeys,
  Provider,
  Account,
  Signer,
  Network,
} from '..'
import { DEFAULT_PROVIDER, TEST_WALLET } from './constants'

export interface WalletOptions {
  mnemonic?: string
  networkType?: Network
  feeRate?: number
  provider?: Provider
}

export class Wallet {
  mnemonic: string
  networkType: Network
  provider: Provider
  account: Account
  signer: Signer
  feeRate: number

  constructor(options?: WalletOptions) {
    this.mnemonic =
      options?.mnemonic || process.env.MNEMONIC || TEST_WALLET.mnemonic
    this.networkType = options?.networkType || 'mainnet'
    if (options.provider && typeof options.provider == 'string')
      this.provider = DEFAULT_PROVIDER[options?.provider]
    else if (options.provider) this.provider = options.provider
    else this.provider = DEFAULT_PROVIDER[this.networkType]
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
