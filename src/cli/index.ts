import { Command } from 'commander'
import { collectibleSend, collectibleBalance } from './collectible'

import {
  alkaneExecute,
  alkaneContractDeploy,
  alkaneSend,
  alkanesTrace,
  alkaneTokenDeploy,
  alkaneCreatePool,
  alkaneAddLiquidity,
  alkaneRemoveLiquidity,
  alkaneSwap,
  alkaneSimulate,
  alkaneGetAllPoolsDetails,
  alkanePreviewRemoveLiquidity,
  alkaneList,
  alkaneBatchExecute,
  alkaneEstimateFee,
} from './alkane'
import { init, genBlocks, sendFromFaucet } from './regtest'
import { runeSend, runeMint, runeEtchCommit, runeEtchReveal, runeBalance } from './rune'
import { brc20Send } from './brc20'
import { btcSend, btcSplit } from './btc'
import {
  accountAvailableBalance,
  accountUtxosToSpend,
  addressBRC20Balance,
  addressUtxosToSpend,
  accountBRC20Balance,
  allAssetsBalance,
} from './utxo'
import {
  mnemonicToAccountCommand,
  privateKeysCommand,
  generateMnemonicCommand,
  signPsbt,
  generateAddressesCommand,
} from './account'
import {
  alkanesProvider,
  multiCallSandshrewProviderCall,
  ordProviderCall,
} from './provider'

const program = new Command()

program
  .name('default')
  .description('All functionality for oyl-sdk in a cli-wrapper')
  .version(require('../../../package.json').version)

const regtestCommand = new Command('regtest')
  .description('Regtest commands')
  .addCommand(init)
  .addCommand(genBlocks)
  .addCommand(sendFromFaucet)

const accountCommand = new Command('account')
  .description('Manage accounts')
  .addCommand(mnemonicToAccountCommand)
  .addCommand(signPsbt)
  .addCommand(privateKeysCommand)
  .addCommand(generateMnemonicCommand)
  .addCommand(generateAddressesCommand)

const utxosCommand = new Command('utxo')
  .description('Examine utxos')
  .addCommand(accountUtxosToSpend)
  .addCommand(addressUtxosToSpend)
  .addCommand(accountAvailableBalance)
  .addCommand(accountBRC20Balance)
  .addCommand(allAssetsBalance)
const btcCommand = new Command('btc')
  .description('Functions for sending bitcoin')
  .addCommand(btcSend)
  .addCommand(btcSplit)

const brc20Command = new Command('brc20')
  .description('Functions for brc20')
  .addCommand(brc20Send)
  .addCommand(addressBRC20Balance)

const collectibleCommand = new Command('collectible')
  .description('Functions for collectibles')
  .addCommand(collectibleSend)
  .addCommand(collectibleBalance)

const runeCommand = new Command('rune')
  .description('Functions for runes')
  .addCommand(runeSend)
  .addCommand(runeMint)
  .addCommand(runeEtchCommit)
  .addCommand(runeEtchReveal)
  .addCommand(runeBalance)
const alkaneCommand = new Command('alkane')
  .description('Functions for alkanes')
  .addCommand(alkaneContractDeploy)
  .addCommand(alkaneExecute)
  .addCommand(alkaneBatchExecute)
  .addCommand(alkaneTokenDeploy)
  .addCommand(alkanesTrace)
  .addCommand(alkaneSend)
  .addCommand(alkaneCreatePool)
  .addCommand(alkaneAddLiquidity)
  .addCommand(alkaneRemoveLiquidity)
  .addCommand(alkaneSwap)
  .addCommand(alkaneSimulate)
  .addCommand(alkaneGetAllPoolsDetails)
  .addCommand(alkanePreviewRemoveLiquidity)
  .addCommand(alkaneList)
  .addCommand(alkaneEstimateFee)
  
  
const providerCommand = new Command('provider')
  .description('Functions avaialble for all provider services')
  .addCommand(ordProviderCall)
  .addCommand(multiCallSandshrewProviderCall)
  .addCommand(alkanesProvider)

program.addCommand(regtestCommand)
program.addCommand(alkaneCommand)
program.addCommand(utxosCommand)
program.addCommand(accountCommand)
program.addCommand(btcCommand)
program.addCommand(brc20Command)
program.addCommand(collectibleCommand)
program.addCommand(runeCommand)
program.addCommand(providerCommand)

program.parse(process.argv)
