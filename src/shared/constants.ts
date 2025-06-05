import { MnemonicToAccountOptions } from '..'
import * as bitcoin from 'bitcoinjs-lib'
import * as dotenv from 'dotenv'
dotenv.config()

export const UTXO_DUST = 330

export const maximumScriptBytes = 520

export const MAXIMUM_FEE = 5000000


export const regtestOpts: MnemonicToAccountOptions = {
  network: bitcoin.networks.regtest,
  index: 0,
  spendStrategy: {
    changeAddress: 'nativeSegwit',
    addressOrder: ['nativeSegwit', 'nestedSegwit', 'taproot', 'legacy'],
    utxoSortGreatestToLeast: true,
  },
}

export const Opts: MnemonicToAccountOptions = {
  network: bitcoin.networks.bitcoin,
  index: 0,
  spendStrategy: {
    changeAddress: 'nativeSegwit',
    addressOrder: ['nativeSegwit', 'nestedSegwit', 'taproot', 'legacy'],
    utxoSortGreatestToLeast: true,
  },
}

export const regtestMnemonic: string = process.env.REGTEST1
export const mainnetMnemonic: string = process.env.MAINNET_MNEMONIC

export const getBrc20Data = ({
  amount,
  tick,
}: {
  amount: number | string
  tick: string
}) => ({
  mediaContent: `{"p":"brc-20","op":"transfer","tick":"${tick}","amt":"${amount}"}`,
  mediaType: 'text/plain',
})
