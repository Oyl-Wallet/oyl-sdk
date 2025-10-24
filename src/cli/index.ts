import { Command } from 'commander'
import { collectibleSend } from './collectible'
import { brc20ProgDeployContract } from './brc20-prog'

import {
  alkaneExecute,
  alkaneContractDeploy,
  alkaneSend,
  alkaneMultiSend,
  alkanesTrace,
  alkaneTokenDeploy,
  alkaneCreatePool,
  alkaneAddLiquidity,
  alkaneRemoveLiquidity,
  alkaneSwap,
  alkaneSimulate,
  alkaneGetAllPoolsDetails,
  alkanePreviewRemoveLiquidity,
  initMerkleRoot,
  merkleClaim,
  subfrostWrapAddress,
  alkaneSpendCommit,
  alkaneWrapBtc,
  alkaneUnwrapBtc
} from './alkane'
import { init, genBlocks, sendFromFaucet } from './regtest'
import { runeSend, runeMint, runeEtchCommit, runeEtchReveal } from './rune'
import { brc20Send } from './brc20'
import { btcSend } from './btc'
import {
  accountAvailableBalance,
  accountUtxosToSpend,
  addressBRC20Balance,
  addressUtxosToSpend,
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
  balancesSandshrewProviderCall,
  multiCallSandshrewProviderCall,
  ordProviderCall,
} from './provider'

const program = new Command()

program
  .name('default')
  .description('All functionality for oyl-sdk in a cli-wrapper')
  .version(require('../../package.json').version)

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
const btcCommand = new Command('btc')
  .description('Functions for sending bitcoin')
  .addCommand(btcSend)

const brc20Command = new Command('brc20')
  .description('Functions for brc20')
  .addCommand(brc20Send)
  .addCommand(addressBRC20Balance)

const collectibleCommand = new Command('collectible')
  .description('Functions for collectibles')
  .addCommand(collectibleSend)

const runeCommand = new Command('rune')
  .description('Functions for runes')
  .addCommand(runeSend)
  .addCommand(runeMint)
  .addCommand(runeEtchCommit)
  .addCommand(runeEtchReveal)
const alkaneCommand = new Command('alkane')
  .description('Functions for alkanes')
  .addCommand(alkaneContractDeploy)
  .addCommand(alkaneExecute)
  .addCommand(alkaneTokenDeploy)
  .addCommand(alkanesTrace)
  .addCommand(alkaneSend)
  .addCommand(alkaneMultiSend)
  .addCommand(alkaneCreatePool)
  .addCommand(alkaneSpendCommit)
  .addCommand(alkaneAddLiquidity)
  .addCommand(alkaneRemoveLiquidity)
  .addCommand(alkaneSwap)
  .addCommand(alkaneSimulate)
  .addCommand(alkaneGetAllPoolsDetails)
  .addCommand(alkanePreviewRemoveLiquidity)
  .addCommand(initMerkleRoot)
  .addCommand(merkleClaim)
  .addCommand(subfrostWrapAddress)
  .addCommand(alkaneWrapBtc)
  .addCommand(alkaneUnwrapBtc)


const providerCommand = new Command('provider')
  .description('Functions avaialble for all provider services')
  .addCommand(ordProviderCall)
  .addCommand(multiCallSandshrewProviderCall)
  .addCommand(alkanesProvider)
  .addCommand(balancesSandshrewProviderCall)

program.addCommand(regtestCommand)
program.addCommand(alkaneCommand)
program.addCommand(utxosCommand)
program.addCommand(accountCommand)
program.addCommand(btcCommand)
program.addCommand(brc20Command)
program.addCommand(collectibleCommand)
program.addCommand(runeCommand)
program.addCommand(providerCommand)

const brc20ProgCommand = new Command('brc20-prog')
  .description('Functions for brc20-prog')
  .addCommand(brc20ProgDeployContract)

program.addCommand(brc20ProgCommand)

program.parse(process.argv)
