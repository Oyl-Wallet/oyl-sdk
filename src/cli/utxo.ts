import { Command } from 'commander'
import * as utxo from '../utxo'
import { Wallet } from './wallet'

export const accountUtxosToSpend = new Command('accountUtxos')
  .description('Returns available utxos to spend')
  .requiredOption(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  /* @dev example call
    oyl utxo accountUtxos -p regtest
  */
  .action(async (options) => {
    const wallet: Wallet = new Wallet({ networkType: options.provider })

    console.log(
      await utxo.accountUtxos({
        account: wallet.account,
        provider: wallet.provider,
      })
    )
  })

export const accountAvailableBalance = new Command('balance')
  .description('Returns amount of sats available to spend')
  .requiredOption(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  .option(
    '-d, --detailed',
    'Show detailed balance breakdown by address type'
  )
  /* @dev example call
    oyl utxo balance -p regtest
    oyl utxo balance -p regtest --detailed
  */
  .action(async (options) => {
    const wallet: Wallet = new Wallet({ networkType: options.provider })
    
    if (options.detailed) {
      console.log('=== DETAILED BTC BALANCE BREAKDOWN ===')
      console.log(`Provider: ${options.provider}\n`)
      
      const addresses = [
        { type: 'Taproot', key: 'taproot' as const, address: wallet.account.taproot.address },
        { type: 'Native SegWit', key: 'nativeSegwit' as const, address: wallet.account.nativeSegwit.address },
        { type: 'Nested SegWit', key: 'nestedSegwit' as const, address: wallet.account.nestedSegwit.address },
        { type: 'Legacy', key: 'legacy' as const, address: wallet.account.legacy.address },
      ]
      
      let totalConfirmed = 0
      let totalPending = 0
      let totalOverall = 0
      
      for (const { type, address } of addresses) {
        try {
          const balance = await utxo.addressBalance({
            address,
            provider: wallet.provider,
          })
          
          if (balance.amount > 0 || balance.pendingAmount > 0) {
            console.log(`💰 ${type} (${address}):`)
            console.log(`   Confirmed: ${balance.confirmedAmount} BTC`)
            console.log(`   Pending: ${balance.pendingAmount} BTC`)
            console.log(`   Total: ${balance.amount} BTC`)
            console.log('')
          }
          
          totalConfirmed += balance.confirmedAmount
          totalPending += balance.pendingAmount
          totalOverall += balance.amount
        } catch (error) {
          console.log(`❌ ${type}: Error fetching balance`)
          console.log('')
        }
      }
      
      console.log('─────────────────────────────────────────')
      console.log('📊 ACCOUNT TOTAL:')
      console.log(`   Confirmed: ${totalConfirmed} BTC`)
      console.log(`   Pending: ${totalPending} BTC`)
      console.log(`   Total: ${totalOverall} BTC`)
    } else {
      // Original simple output
      const balance = await utxo.accountBalance({
        account: wallet.account,
        provider: wallet.provider,
      })
      console.log(balance)
    }
  })

export const addressBRC20Balance = new Command('addressBRC20Balance')
  .description('Returns all BRC20 balances')
  .requiredOption(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  .requiredOption(
    '-a, --address <address>',
    'address you want to get utxos for'
  )

  .action(async (options) => {
    const wallet: Wallet = new Wallet({ networkType: options.provider })
    console.log(
      (await wallet.provider.api.getBrc20sByAddress(options.address)).data
    )
  })

export const addressUtxosToSpend = new Command('addressUtxos')
  .description('Returns available utxos to spend')
  .requiredOption(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  .requiredOption(
    '-a, --address <address>',
    'address you want to get utxos for'
  )
  /* @dev example call
    oyl utxo addressUtxos -a bcrt1q54zh4xfz2jkqah8nqvp2ltl9mvrmf6s69h6au0 -p alkanes
  */
  .action(async (options) => {
    const wallet: Wallet = new Wallet({ networkType: options.provider })

    await utxo.addressUtxos({
      address: options.address,
      provider: wallet.provider,
    })
  })

export const accountBRC20Balance = new Command('accountBRC20Balance')
  .description('Returns all BRC20 balances for account addresses')
  .requiredOption(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )

  /* @dev example call
    oyl utxo accountBRC20Balance -p regtest
  */
  .action(async (options) => {
    const wallet: Wallet = new Wallet({ networkType: options.provider })
    const account = wallet.account
    
    const addresses = [
      { type: 'Native SegWit', address: account.nativeSegwit.address },
      { type: 'Nested SegWit', address: account.nestedSegwit.address },
      { type: 'Taproot', address: account.taproot.address },
      { type: 'Legacy', address: account.legacy.address },
    ]

    console.log('BRC20 balances for all account addresses:')
    let totalAssets = 0

    for (const { type, address } of addresses) {
      try {
        const brc20Data = await wallet.provider.api.getBrc20sByAddress(address)
        if (brc20Data.data && brc20Data.data.length > 0) {
          console.log(`\n  ${type} (${address}):`)
          brc20Data.data.forEach((token) => {
            console.log(`    ${token.ticker}: ${token.overall_balance}`)
            if (token.transferable_balance !== token.overall_balance) {
              console.log(`      Available: ${token.available_balance}`)
              console.log(`      Transferable: ${token.transferable_balance}`)
            }
          })
          console.log(`    Subtotal: ${brc20Data.data.length} token(s)`)
          totalAssets += brc20Data.data.length
        }
      } catch (error) {
        continue
      }
    }

    if (totalAssets === 0) {
      console.log('  No BRC20 tokens found across all addresses')
    } else {
      console.log(`\n  Total across all addresses: ${totalAssets} token type(s)`)
    }
  })

export const allAssetsBalance = new Command('allAssets')
  .description('Returns comprehensive balance overview of all asset types')
  .requiredOption(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )

  /* @dev example call
    oyl utxo allAssets -p regtest
  */
  .action(async (options) => {
    const wallet: Wallet = new Wallet({ networkType: options.provider })
    const account = wallet.account
    
    console.log('=== COMPREHENSIVE ASSET BALANCE OVERVIEW ===\n')

    // BTC Balance
    try {
      const btcBalance = await utxo.accountBalance({
        account: wallet.account,
        provider: wallet.provider,
      })
      console.log('💰 BTC Balance:')
      console.log(`  Confirmed: ${btcBalance.confirmedAmount} BTC`)
      console.log(`  Pending: ${btcBalance.pendingAmount} BTC`)
      console.log(`  Total: ${btcBalance.amount} BTC\n`)
    } catch (error) {
      console.log('💰 BTC Balance: Error fetching\n')
    }

    // Alkanes Balance
    try {
      const accountPortfolio = await utxo.accountUtxos({
        account: wallet.account,
        provider: wallet.provider,
      })

      console.log('⚗️ Alkanes:')
      let alkaneCount = 0
      const alkaneAssets = new Map()

      if (accountPortfolio.accountUtxos && accountPortfolio.accountUtxos.length > 0) {
        accountPortfolio.accountUtxos.forEach((utxoItem) => {
          if (utxoItem.alkanes && Object.keys(utxoItem.alkanes).length > 0) {
            for (const alkaneId in utxoItem.alkanes) {
              const alkaneDetails = utxoItem.alkanes[alkaneId]
              const existing = alkaneAssets.get(alkaneId) || { value: 0, name: alkaneDetails.name, symbol: alkaneDetails.symbol }
              existing.value += Number(alkaneDetails.value)
              alkaneAssets.set(alkaneId, existing)
              alkaneCount++
            }
          }
        })
      }

      if (alkaneAssets.size > 0) {
        alkaneAssets.forEach((details, alkaneId) => {
          console.log(`  ${alkaneId} (${details.name}/${details.symbol}): ${details.value}`)
        })
        console.log(`  Total: ${alkaneAssets.size} alkane type(s)\n`)
      } else {
        console.log('  No alkanes found\n')
      }
    } catch (error) {
      console.log('  Error fetching alkanes\n')
    }

    // BRC20 Balance
    try {
      const addresses = [
        account.nativeSegwit.address,
        account.nestedSegwit.address,
        account.taproot.address,
        account.legacy.address,
      ]

      console.log('🟡 BRC20 Tokens:')
      let totalBrc20 = 0
      let foundAnyBrc20 = false

      for (const address of addresses) {
        try {
          const brc20Data = await wallet.provider.api.getBrc20sByAddress(address)
          if (brc20Data.data && brc20Data.data.length > 0) {
            foundAnyBrc20 = true
            brc20Data.data.forEach((token) => {
              console.log(`  ${token.ticker}: ${token.overall_balance}`)
              totalBrc20++
            })
          }
        } catch (error) {
          continue
        }
      }

      if (!foundAnyBrc20) {
        console.log('  No BRC20 tokens found')
      } else {
        console.log(`  Total: ${totalBrc20} token type(s)`)
      }
      console.log('')
    } catch (error) {
      console.log('  Error fetching BRC20 tokens\n')
    }

    // Runes Balance
    try {
      const addresses = [
        account.nativeSegwit.address,
        account.nestedSegwit.address,
        account.taproot.address,
        account.legacy.address,
      ]

      console.log('🪙 Runes:')
      const allRuneBalances = new Map()
      let foundAnyRunes = false

      for (const address of addresses) {
        try {
          const addressOutpoints = await wallet.provider.ord.getOrdData(address)
          for (const output of addressOutpoints.outputs) {
            try {
              const ordOutput = await wallet.provider.ord.getTxOutput(output)
              if (ordOutput.runes && Object.keys(ordOutput.runes).length > 0) {
                foundAnyRunes = true
                for (const [runeName, runeData] of Object.entries(ordOutput.runes)) {
                  const existing = allRuneBalances.get(runeName) || { amount: 0, divisibility: runeData.divisibility }
                  existing.amount += runeData.amount
                  allRuneBalances.set(runeName, existing)
                }
              }
            } catch (error) {
              continue
            }
          }
        } catch (error) {
          continue
        }
      }

      if (!foundAnyRunes) {
        console.log('  No runes found')
      } else {
        allRuneBalances.forEach((balance, runeName) => {
          const adjustedAmount = balance.amount / Math.pow(10, balance.divisibility)
          console.log(`  ${runeName}: ${adjustedAmount}`)
        })
        console.log(`  Total: ${allRuneBalances.size} rune type(s)`)
      }
      console.log('')
    } catch (error) {
      console.log('  Error fetching runes\n')
    }

    // Collectibles/Inscriptions Balance
    try {
      const addresses = [
        account.nativeSegwit.address,
        account.nestedSegwit.address,
        account.taproot.address,
        account.legacy.address,
      ]

      console.log('🎨 Collectibles/Inscriptions:')
      let totalCollectibles = 0

      for (const address of addresses) {
        try {
          const addressOutpoints = await wallet.provider.ord.getOrdData(address)
          for (const output of addressOutpoints.outputs) {
            try {
              const ordOutput = await wallet.provider.ord.getTxOutput(output)
              if (ordOutput.inscriptions && ordOutput.inscriptions.length > 0) {
                totalCollectibles += ordOutput.inscriptions.length
              }
            } catch (error) {
              continue
            }
          }
        } catch (error) {
          continue
        }
      }

      if (totalCollectibles === 0) {
        console.log('  No collectibles found')
      } else {
        console.log(`  Total: ${totalCollectibles} collectible(s)`)
      }
      console.log('')
    } catch (error) {
      console.log('  Error fetching collectibles\n')
    }

    console.log('=== END BALANCE OVERVIEW ===')
  })
