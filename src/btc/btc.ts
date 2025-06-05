import { OylTransactionError } from '../errors'
import { Provider } from '../provider/provider'
import * as bitcoin from 'bitcoinjs-lib'
import {
  calculateTaprootTxSize,
  findXAmountOfSats,
  formatInputsToSign,
} from '../shared/utils'
import { Account, mnemonicToAccount } from '../account/account'
import { Signer } from '../signer'
import { getAddressType } from '../shared/utils'
import { FormattedUtxo } from '../utxo'

export const createPsbt = async ({
  utxos,
  toAddress,
  amount,
  feeRate,
  account,
  provider,
  fee,
}: {
  utxos: FormattedUtxo[]
  toAddress: string
  feeRate: number
  amount: number
  account: Account
  provider: Provider
  fee?: number
}) => {
  try {
    if (!utxos?.length) {
      throw new Error('No utxos provided')
    }
    if (!feeRate) {
      throw new Error('No feeRate provided')
    }

    const minTxSize = minimumFee({
      taprootInputCount: 1,
      nonTaprootInputCount: 0,
      outputCount: 2,
    })

    let calculatedFee = Math.max(minTxSize * feeRate, 250)
    let finalFee = fee ?? calculatedFee

    let gatheredUtxos = findXAmountOfSats(
      utxos,
      Number(finalFee) + Number(amount)
    )

    if (!fee && gatheredUtxos.utxos.length > 1) {
      const txSize = minimumFee({
        taprootInputCount: gatheredUtxos.utxos.length,
        nonTaprootInputCount: 0,
        outputCount: 2,
      })

      finalFee = Math.max(txSize * feeRate, 250)
      gatheredUtxos = findXAmountOfSats(
        utxos,
        Number(finalFee) + Number(amount)
      )
    }

    if (gatheredUtxos.totalAmount < Number(finalFee) + Number(amount)) {
      throw new Error('Insufficient Balance')
    }

    const psbt: bitcoin.Psbt = new bitcoin.Psbt({
      network: provider.network,
    })

    for (let i = 0; i < gatheredUtxos.utxos.length; i++) {
      if (getAddressType(gatheredUtxos.utxos[i].address) === 0) {
        const previousTxHex: string = await provider.esplora.getTxHex(
          gatheredUtxos.utxos[i].txId
        )
        psbt.addInput({
          hash: gatheredUtxos.utxos[i].txId,
          index: gatheredUtxos.utxos[i].outputIndex,
          nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
        })
      }
      if (getAddressType(gatheredUtxos.utxos[i].address) === 2) {
        const redeemScript = bitcoin.script.compile([
          bitcoin.opcodes.OP_0,
          bitcoin.crypto.hash160(
            Buffer.from(account.nestedSegwit.pubkey, 'hex')
          ),
        ])

        psbt.addInput({
          hash: gatheredUtxos.utxos[i].txId,
          index: gatheredUtxos.utxos[i].outputIndex,
          redeemScript: redeemScript,
          witnessUtxo: {
            value: gatheredUtxos.utxos[i].satoshis,
            script: bitcoin.script.compile([
              bitcoin.opcodes.OP_HASH160,
              bitcoin.crypto.hash160(redeemScript),
              bitcoin.opcodes.OP_EQUAL,
            ]),
          },
        })
      }
      if (
        getAddressType(gatheredUtxos.utxos[i].address) === 1 ||
        getAddressType(gatheredUtxos.utxos[i].address) === 3
      ) {
        psbt.addInput({
          hash: gatheredUtxos.utxos[i].txId,
          index: gatheredUtxos.utxos[i].outputIndex,
          witnessUtxo: {
            value: gatheredUtxos.utxos[i].satoshis,
            script: Buffer.from(gatheredUtxos.utxos[i].scriptPk, 'hex'),
          },
        })
      }
    }

    psbt.addOutput({
      address: toAddress,
      value: Number(amount),
    })

    const changeAmount = gatheredUtxos.totalAmount - (finalFee + Number(amount))

    if (changeAmount > 295) {
      psbt.addOutput({
        address: account[account.spendStrategy.changeAddress].address,
        value: changeAmount,
      })
    }

    const updatedPsbt = await formatInputsToSign({
      _psbt: psbt,
      senderPublicKey: account.taproot.pubkey,
      network: provider.network,
    })

    return { psbt: updatedPsbt.toBase64(), fee: finalFee }
  } catch (error) {
    throw new OylTransactionError(error)
  }
}

export const send = async ({
  utxos,
  toAddress,
  amount,
  feeRate,
  account,
  provider,
  signer,
  fee,
}: {
  utxos: FormattedUtxo[]
  toAddress: string
  amount: number
  feeRate: number
  account: Account
  provider: Provider
  signer: Signer
  fee?: number
}) => {
  if (!fee) {
    fee = (
      await actualFee({
        utxos,
        toAddress,
        amount,
        feeRate,
        account,
        provider,
        signer,
      })
    ).fee
  }

  const { psbt: finalPsbt } = await createPsbt({
    utxos,
    toAddress,
    amount,
    feeRate,
    fee,
    account,
    provider,
  })

  const { signedPsbt } = await signer.signAllInputs({
    rawPsbt: finalPsbt,
    finalize: true,
  })

  const result = await provider.pushPsbt({
    psbtBase64: signedPsbt,
  })

  return result
}

export const actualFee = async ({
  utxos,
  toAddress,
  amount,
  feeRate,
  account,
  provider,
  signer,
}: {
  utxos: FormattedUtxo[]
  toAddress: string
  feeRate: number
  amount: number
  account: Account
  provider: Provider
  signer: Signer
}) => {
  const { psbt } = await createPsbt({
    utxos,
    toAddress: toAddress,
    amount: amount,
    feeRate: feeRate,
    account: account,
    provider: provider,
  })

  const { signedPsbt } = await signer.signAllInputs({
    rawPsbt: psbt,
    finalize: true,
  })

  let rawPsbt = bitcoin.Psbt.fromBase64(signedPsbt, {
    network: account.network,
  })

  const signedHexPsbt = rawPsbt.extractTransaction().toHex()

  const vsize = (
    await provider.sandshrew.bitcoindRpc.testMemPoolAccept([signedHexPsbt])
  )[0].vsize

  const correctFee = vsize * feeRate

  const { psbt: finalPsbt } = await createPsbt({
    utxos,
    toAddress: toAddress,
    amount: amount,
    feeRate: feeRate,
    fee: correctFee,
    account: account,
    provider: provider,
  })

  const { signedPsbt: signedAll } = await signer.signAllInputs({
    rawPsbt: finalPsbt,
    finalize: true,
  })

  let finalRawPsbt = bitcoin.Psbt.fromBase64(signedAll, {
    network: account.network,
  })

  const finalSignedHexPsbt = finalRawPsbt.extractTransaction().toHex()

  const finalVsize = (
    await provider.sandshrew.bitcoindRpc.testMemPoolAccept([finalSignedHexPsbt])
  )[0].vsize

  const finalFee = finalVsize * feeRate

  return { fee: finalFee }
}

export const minimumFee = ({
  taprootInputCount,
  nonTaprootInputCount,
  outputCount,
}: {
  taprootInputCount: number
  nonTaprootInputCount: number
  outputCount: number
}) => {
  return calculateTaprootTxSize(
    taprootInputCount,
    nonTaprootInputCount,
    outputCount
  )
}

// Interface for split amounts and addresses mode
interface SplitByAmountsAndAddresses {
  mode: 'amounts_and_addresses'
  amounts: number[]
  addresses: string[]
}

// Interface for automatic split mode
interface SplitByAccountCount {
  mode: 'auto_generate'
  amount: number
  accountCount: number
  mnemonic: string
}

type SplitConfig = SplitByAmountsAndAddresses | SplitByAccountCount

export const splitUtxos = async ({
  utxos,
  feeRate,
  account,
  provider,
  signer,
  splitConfig,
  fee,
}: {
  utxos: FormattedUtxo[]
  feeRate: number
  account: Account
  provider: Provider
  signer: Signer
  splitConfig: SplitConfig
  fee?: number
}) => {
  try {
    if (!utxos?.length) {
      throw new Error('No utxos provided')
    }
    if (!feeRate) {
      throw new Error('No feeRate provided')
    }

    let outputs: { address: string; amount: number }[] = []

    if (splitConfig.mode === 'amounts_and_addresses') {
      // Mode 1: Split by specified amounts and addresses
      if (splitConfig.amounts.length !== splitConfig.addresses.length) {
        throw new Error('Amounts and addresses arrays must have the same length')
      }
      
      outputs = splitConfig.amounts.map((amount, index) => ({
        address: splitConfig.addresses[index],
        amount,
      }))
    } else if (splitConfig.mode === 'auto_generate') {
      // Mode 2: Auto-generate sub-wallets and split equally
      const { amount, accountCount, mnemonic } = splitConfig
      
      if (accountCount < 1) {
        throw new Error('Account count must be at least 1')
      }

      // Generate n-1 child wallets (account at index 0 is the main one)
      const childAccounts: Account[] = []
      for (let i = 1; i < accountCount; i++) {
        const childAccount = mnemonicToAccount({
          mnemonic,
          opts: {
            network: account.network,
            index: i,
            spendStrategy: account.spendStrategy,
          },
        })
        childAccounts.push(childAccount)
      }

      // Add main account (index 0) and child accounts
      outputs = [
        { address: account.taproot.address, amount },
        ...childAccounts.map(childAccount => ({
          address: childAccount.taproot.address,
          amount,
        })),
      ]
    } else {
      throw new Error('Invalid split mode')
    }

    // Calculate total amount needed
    const totalSplitAmount = outputs.reduce((sum, output) => sum + output.amount, 0)
    
    // Estimate fee
    const estimatedFee = fee || minimumFee({
      taprootInputCount: 1,
      nonTaprootInputCount: 0,
      outputCount: outputs.length,
    }) * feeRate

    const totalAmountNeeded = totalSplitAmount + estimatedFee

    // Select UTXOs
    const gatheredUtxos = findXAmountOfSats(utxos, totalAmountNeeded)
    
    if (gatheredUtxos.totalAmount < totalAmountNeeded) {
      throw new Error('Insufficient balance for split operation')
    }

    // Recalculate fee based on actual number of inputs
    const actualFee = fee || minimumFee({
      taprootInputCount: gatheredUtxos.utxos.length,
      nonTaprootInputCount: 0,
      outputCount: outputs.length + 1, // +1 for potential change output
    }) * feeRate

    const actualTotalNeeded = totalSplitAmount + actualFee
    
    if (gatheredUtxos.totalAmount < actualTotalNeeded) {
      // Try again with more UTXOs
      const newGatheredUtxos = findXAmountOfSats(utxos, actualTotalNeeded)
      if (newGatheredUtxos.totalAmount < actualTotalNeeded) {
        throw new Error('Insufficient balance for split operation including fees')
      }
      Object.assign(gatheredUtxos, newGatheredUtxos)
    }

    // Create PSBT
    const psbt = new bitcoin.Psbt({ network: provider.network })

    // Add inputs
    for (const utxo of gatheredUtxos.utxos) {
      if (getAddressType(utxo.address) === 0) {
        const previousTxHex = await provider.esplora.getTxHex(utxo.txId)
        psbt.addInput({
          hash: utxo.txId,
          index: utxo.outputIndex,
          nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
        })
      } else if (getAddressType(utxo.address) === 2) {
        const redeemScript = bitcoin.script.compile([
          bitcoin.opcodes.OP_0,
          bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
        ])
        psbt.addInput({
          hash: utxo.txId,
          index: utxo.outputIndex,
          redeemScript,
          witnessUtxo: {
            value: utxo.satoshis,
            script: bitcoin.script.compile([
              bitcoin.opcodes.OP_HASH160,
              bitcoin.crypto.hash160(redeemScript),
              bitcoin.opcodes.OP_EQUAL,
            ]),
          },
        })
      } else {
        psbt.addInput({
          hash: utxo.txId,
          index: utxo.outputIndex,
          witnessUtxo: {
            value: utxo.satoshis,
            script: Buffer.from(utxo.scriptPk, 'hex'),
          },
        })
      }
    }

    // Add split outputs
    for (const output of outputs) {
      psbt.addOutput({
        address: output.address,
        value: output.amount,
      })
    }

    // Add change output if needed
    const changeAmount = gatheredUtxos.totalAmount - totalSplitAmount - actualFee
    if (changeAmount > 295) { // Dust threshold
      psbt.addOutput({
        address: account[account.spendStrategy.changeAddress].address,
        value: changeAmount,
      })
    }

    // Format inputs for signing
    const updatedPsbt = await formatInputsToSign({
      _psbt: psbt,
      senderPublicKey: account.taproot.pubkey,
      network: provider.network,
    })

    // Sign and broadcast
    const { signedPsbt } = await signer.signAllInputs({
      rawPsbt: updatedPsbt.toBase64(),
      finalize: true,
    })

    const result = await provider.pushPsbt({
      psbtBase64: signedPsbt,
    })

    return {
      ...result,
      outputs,
      totalSplitAmount,
      fee: actualFee,
      changeAmount: changeAmount > 295 ? changeAmount : 0,
    }
  } catch (error) {
    throw new OylTransactionError(error)
  }
}
