import { OylTransactionError } from '../errors'
import { Provider } from '../provider/provider'
import * as bitcoin from 'bitcoinjs-lib'
import {
  calculateTaprootTxSize,
  findXAmountOfSats,
  formatInputsToSign,
} from '../shared/utils'
import { Account } from '../account/account'
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

  return { fee: finalFee, vsize: finalVsize }
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
