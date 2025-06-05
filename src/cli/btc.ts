import { Command } from 'commander'
import * as btc from '../btc'
import * as utxo from '../utxo'
import { Wallet } from './wallet'

export const btcSend = new Command('send')
  .requiredOption(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  .requiredOption('-amt, --amount <amount>', 'amount you want to send')
  .requiredOption('-t, --to <to>', 'address you want to send to')
  .option('-feeRate, --feeRate <feeRate>', 'fee rate')

  /* @dev example call 
  oyl btc send -p regtest -t bcrt1qzr9vhs60g6qlmk7x3dd7g3ja30wyts48sxuemv -amt 1000 -feeRate 2
*/

  .action(async (options) => {
    const wallet: Wallet = new Wallet({ networkType: options.provider })
    const account = wallet.account
    const provider = wallet.provider
    const signer = wallet.signer
    const { accountSpendableTotalUtxos } = await utxo.accountUtxos({
      account,
      provider,
    })

    console.log(
      await btc.send({
        utxos: accountSpendableTotalUtxos,
        toAddress: options.to,
        feeRate: options.feeRate,
        account,
        signer,
        provider,
        amount: options.amount,
      })
    )
  })

export const btcSplit = new Command('split')
  .requiredOption(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  .option('-feeRate, --feeRate <feeRate>', 'fee rate', '10')
  .option('-mode, --mode <mode>', 'split mode: amounts_and_addresses or auto_generate', 'auto_generate')
  
  // For amounts_and_addresses mode
  .option('-amounts, --amounts <amounts>', 'comma-separated amounts in sats')
  .option('-addresses, --addresses <addresses>', 'comma-separated addresses')
  
  // For auto_generate mode  
  .option('-amt, --amount <amount>', 'amount per address in sats')
  .option('-n, --accountCount <accountCount>', 'number of accounts to split to', '2')

  /* @dev example calls 
  // Auto generate mode:
  oyl btc split -p regtest -amt 100000 -n 3 -feeRate 10
  
  // Amounts and addresses mode:
  oyl btc split -p regtest -mode amounts_and_addresses -amounts "100000,200000,300000" -addresses "addr1,addr2,addr3" -feeRate 10
  */

  .action(async (options) => {
    const wallet: Wallet = new Wallet({ networkType: options.provider })
    const account = wallet.account
    const provider = wallet.provider
    const signer = wallet.signer
    const { accountSpendableTotalUtxos } = await utxo.accountUtxos({
      account,
      provider,
    })

    let splitConfig: any

    if (options.mode === 'amounts_and_addresses') {
      if (!options.amounts || !options.addresses) {
        throw new Error('amounts and addresses are required for amounts_and_addresses mode')
      }
      
      const amounts = options.amounts.split(',').map((amt: string) => parseInt(amt.trim()))
      const addresses = options.addresses.split(',').map((addr: string) => addr.trim())
      
      splitConfig = {
        mode: 'amounts_and_addresses',
        amounts,
        addresses,
      }
    } else if (options.mode === 'auto_generate') {
      if (!options.amount) {
        throw new Error('amount is required for auto_generate mode')
      }
      
      splitConfig = {
        mode: 'auto_generate',
        amount: parseInt(options.amount),
        accountCount: parseInt(options.accountCount),
        mnemonic: wallet.mnemonic,
      }
    } else {
      throw new Error('Invalid mode. Use amounts_and_addresses or auto_generate')
    }

    console.log(
      await btc.splitUtxos({
        utxos: accountSpendableTotalUtxos,
        feeRate: parseInt(options.feeRate),
        account,
        provider,
        signer,
        splitConfig,
      })
    )
  })
