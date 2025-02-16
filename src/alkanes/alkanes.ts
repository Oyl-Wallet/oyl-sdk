import { minimumFee } from '../btc'
import { Provider } from '../provider/provider'
import * as bitcoin from 'bitcoinjs-lib'
import { p2tr_ord_reveal } from 'alkanes/lib/index'
import { Account, Signer } from '..'
import {
  findXAmountOfSats,
  formatInputsToSign,
  getOutputValueByVOutIndex,
  getVSize,
  inscriptionSats,
  tweakSigner,
} from '../shared/utils'
import { OylTransactionError } from '../errors'
import { GatheredUtxos, AlkanesPayload } from '../shared/interface'
import { getAddressType } from '../shared/utils'
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371'
import { LEAF_VERSION_TAPSCRIPT } from 'bitcoinjs-lib/src/payments/bip341'
import { Outpoint } from 'rpclient/alkanes'
import { actualDeployCommitFee } from './contract'

export const createExecutePsbt = async ({
  gatheredUtxos,
  account,
  protostone,
  provider,
  feeRate,
  fee = 0,
}: {
  gatheredUtxos: GatheredUtxos
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate?: number
  fee?: number
}) => {
  try {
    const originalGatheredUtxos = gatheredUtxos

    const minTxSize = minimumFee({
      taprootInputCount: 2,
      nonTaprootInputCount: 0,
      outputCount: 2,
    })

    let calculatedFee = Math.max(minTxSize * feeRate, 250)
    let finalFee = fee === 0 ? calculatedFee : fee

    gatheredUtxos = findXAmountOfSats(
      originalGatheredUtxos.utxos,
      Number(finalFee)
    )

    let psbt = new bitcoin.Psbt({ network: provider.network })

    if (fee === 0 && gatheredUtxos.utxos.length > 1) {
      const txSize = minimumFee({
        taprootInputCount: gatheredUtxos.utxos.length,
        nonTaprootInputCount: 0,
        outputCount: 2,
      })
      finalFee = txSize * feeRate < 250 ? 250 : txSize * feeRate

      if (gatheredUtxos.totalAmount < finalFee) {
        throw new OylTransactionError(Error('Insufficient Balance'))
      }
    }

    if (gatheredUtxos.totalAmount < finalFee) {
      throw new OylTransactionError(Error('Insufficient Balance'))
    }
    for (let i = 0; i < gatheredUtxos.utxos.length; i++) {
      if (getAddressType(gatheredUtxos.utxos[i].address) === 0) {
        const previousTxHex: string = await provider.esplora.getTxHex(
          gatheredUtxos.utxos[i].txId
        )
        psbt.addInput({
          hash: gatheredUtxos.utxos[i].txId,
          index: gatheredUtxos.utxos[i].outputIndex,
          sequence: 0xfffffffd,
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
          sequence: 0xfffffffd, 
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
          sequence: 0xfffffffd, 
          witnessUtxo: {
            value: gatheredUtxos.utxos[i].satoshis,
            script: Buffer.from(gatheredUtxos.utxos[i].scriptPk, 'hex'),
          },
        })
      }
    }

    psbt.addOutput({
      address: account.taproot.address,
      value: 546,
    })

    const output = { script: protostone, value: 0 }
    psbt.addOutput(output)

    const changeAmount = gatheredUtxos.totalAmount - finalFee - 546

    psbt.addOutput({
      address: account[account.spendStrategy.changeAddress].address,
      value: changeAmount,
    })

    const formattedPsbtTx = await formatInputsToSign({
      _psbt: psbt,
      senderPublicKey: account.taproot.pubkey,
      network: provider.network,
    })

    return {
      psbt: formattedPsbtTx.toBase64(),
      psbtHex: formattedPsbtTx.toHex(),
    }
  } catch (error) {
    throw new OylTransactionError(error)
  }
}

export const createDeployCommit = async ({
  payload,
  gatheredUtxos,
  tweakedTaprootKeyPair,
  account,
  provider,
  feeRate,
  fee,
}: {
  payload: AlkanesPayload
  gatheredUtxos: GatheredUtxos
  tweakedTaprootKeyPair: bitcoin.Signer
  account: Account
  provider: Provider
  feeRate?: number
  fee?: number
}) => {
  try {
    const originalGatheredUtxos = gatheredUtxos

    const minFee = minimumFee({
      taprootInputCount: 2,
      nonTaprootInputCount: 0,
      outputCount: 2,
    })
    const calculatedFee = minFee * feeRate < 250 ? 250 : minFee * feeRate
    let finalFee = fee ? fee : calculatedFee

    let psbt = new bitcoin.Psbt({ network: provider.network })

    const script = Buffer.from(
      p2tr_ord_reveal(toXOnly(tweakedTaprootKeyPair.publicKey), [payload])
        .script
    )

    const inscriberInfo = bitcoin.payments.p2tr({
      internalPubkey: toXOnly(tweakedTaprootKeyPair.publicKey),
      scriptTree: {
        output: script,
      },
      network: provider.network,
    })

    const wasmDeploySize = getVSize(Buffer.from(payload.body)) * feeRate

    gatheredUtxos = findXAmountOfSats(
      originalGatheredUtxos.utxos,
      wasmDeploySize + Number(inscriptionSats) + finalFee * 2
    )

    if (!fee && gatheredUtxos.utxos.length > 1) {
      const txSize = minimumFee({
        taprootInputCount: gatheredUtxos.utxos.length,
        nonTaprootInputCount: 0,
        outputCount: 2,
      })
      finalFee = txSize * feeRate < 250 ? 250 : txSize * feeRate

      if (gatheredUtxos.totalAmount < finalFee) {
        gatheredUtxos = findXAmountOfSats(
          originalGatheredUtxos.utxos,
          wasmDeploySize + Number(inscriptionSats) + finalFee * 2
        )
      }
    }

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

    if (
      gatheredUtxos.totalAmount <
      finalFee * 2 + inscriptionSats + wasmDeploySize
    ) {
      throw new OylTransactionError(Error('Insufficient Balance'))
    }

    psbt.addOutput({
      value: finalFee + wasmDeploySize + 546,
      address: inscriberInfo.address,
    })

    const changeAmount =
      gatheredUtxos.totalAmount -
      (finalFee * 2 + wasmDeploySize + inscriptionSats)

    psbt.addOutput({
      address: account[account.spendStrategy.changeAddress].address,
      value: changeAmount,
    })

    const formattedPsbtTx = await formatInputsToSign({
      _psbt: psbt,
      senderPublicKey: account.taproot.pubkey,
      network: provider.network,
    })

    return { psbt: formattedPsbtTx.toBase64(), script }
  } catch (error) {
    throw new OylTransactionError(error)
  }
}

export const createDeployReveal = async ({
  protostone,
  receiverAddress,
  script,
  feeRate,
  tweakedTaprootKeyPair,
  provider,
  fee = 0,
  commitTxId,
}: {
  protostone: Buffer
  receiverAddress: string
  script: Buffer
  feeRate: number
  tweakedTaprootKeyPair: bitcoin.Signer
  provider: Provider
  fee?: number
  commitTxId: string
}) => {
  try {
    if (!feeRate) {
      feeRate = (await provider.esplora.getFeeEstimates())['1']
    }

    const psbt: bitcoin.Psbt = new bitcoin.Psbt({ network: provider.network })
    const minFee = minimumFee({
      taprootInputCount: 1,
      nonTaprootInputCount: 0,
      outputCount: 2,
    })

    const revealTxBaseFee = minFee * feeRate < 250 ? 250 : minFee * feeRate
    const revealTxChange = fee === 0 ? 0 : Number(revealTxBaseFee) - fee

    const commitTxOutput = await getOutputValueByVOutIndex({
      txId: commitTxId,
      vOut: 0,
      esploraRpc: provider.esplora,
    })

    if (!commitTxOutput) {
      throw new OylTransactionError(new Error('Error getting vin #0 value'))
    }

    const p2pk_redeem = { output: script }

    const { output, witness } = bitcoin.payments.p2tr({
      internalPubkey: toXOnly(tweakedTaprootKeyPair.publicKey),
      scriptTree: p2pk_redeem,
      redeem: p2pk_redeem,
      network: provider.network,
    })

    psbt.addInput({
      hash: commitTxId,
      index: 0,
      witnessUtxo: {
        value: commitTxOutput.value,
        script: output,
      },
      tapLeafScript: [
        {
          leafVersion: LEAF_VERSION_TAPSCRIPT,
          script: p2pk_redeem.output,
          controlBlock: witness![witness!.length - 1],
        },
      ],
    })

    psbt.addOutput({
      value: 546,
      address: receiverAddress,
    })

    psbt.addOutput({
      value: 0,
      script: protostone,
    })

    if (revealTxChange > 546) {
      psbt.addOutput({
        value: revealTxChange,
        address: receiverAddress,
      })
    }

    return {
      psbt: psbt.toBase64(),
      fee: revealTxChange,
    }
  } catch (error) {
    throw new OylTransactionError(error)
  }
}

export const findAlkaneUtxos = async ({
  address,
  greatestToLeast,
  provider,
  alkaneId,
  targetNumberOfAlkanes,
}: {
  address: string
  greatestToLeast: boolean
  provider: Provider
  alkaneId: { block: string; tx: string }
  targetNumberOfAlkanes: number
}) => {
  const res: Outpoint[] = await provider.alkanes.getAlkanesByAddress({
    address: address,
    protocolTag: '1',
  })

  const matchingRunesWithOutpoints = res.flatMap((outpoint) =>
    outpoint.runes
      .filter(
        (value) =>
          value.rune.id.block === alkaneId.block &&
          value.rune.id.tx === alkaneId.tx
      )
      .map((rune) => ({ rune, outpoint }))
  )

  const sortedRunesWithOutpoints = matchingRunesWithOutpoints.sort((a, b) =>
    greatestToLeast
      ? Number(b.rune.balance) - Number(a.rune.balance)
      : Number(a.rune.balance) - Number(b.rune.balance)
  )

  let totalSatoshis: number = 0
  let totalBalanceBeingSent: number = 0
  const alkaneUtxos = []

  for (const alkane of sortedRunesWithOutpoints) {
    if (
      totalBalanceBeingSent < targetNumberOfAlkanes &&
      Number(alkane.rune.balance) > 0
    ) {
      const satoshis = Number(alkane.outpoint.output.value)
      alkaneUtxos.push({
        txId: alkane.outpoint.outpoint.txid,
        txIndex: alkane.outpoint.outpoint.vout,
        script: alkane.outpoint.output.script,
        address,
        amountOfAlkanes: alkane.rune.balance,
        satoshis,
      })
      totalSatoshis += satoshis
      totalBalanceBeingSent +=
        Number(alkane.rune.balance) / 10 ** alkane.rune.rune.divisibility
    } else {
      break
    }
  }
  return { alkaneUtxos, totalSatoshis }
}

export const actualTransactRevealFee = async ({
  protostone,
  tweakedTaprootKeyPair,
  commitTxId,
  receiverAddress,
  script,
  provider,
  feeRate,
}: {
  protostone: Buffer
  tweakedTaprootKeyPair: bitcoin.Signer
  commitTxId: string
  receiverAddress: string
  script: Buffer
  provider: Provider
  feeRate?: number
}) => {
  if (!feeRate) {
    feeRate = (await provider.esplora.getFeeEstimates())['1']
  }

  const { psbt: initReveal } = await createTransactReveal({
    protostone,
    commitTxId,
    receiverAddress,
    script,
    tweakedTaprootKeyPair,
    provider,
    feeRate,
  })

  let rawPsbt = bitcoin.Psbt.fromBase64(initReveal, {
    network: provider.network,
  })
  rawPsbt.signInput(0, tweakedTaprootKeyPair)
  rawPsbt.finalizeInput(0)

  const rawSignedPsbt = rawPsbt.extractTransaction().toHex()

  const vsize = (
    await provider.sandshrew.bitcoindRpc.testMemPoolAccept([rawSignedPsbt])
  )[0].vsize

  const correctFee = vsize * feeRate

  const { psbt: finalReveal } = await createTransactReveal({
    protostone,
    commitTxId,
    receiverAddress,
    script,
    tweakedTaprootKeyPair,
    provider,
    feeRate,
    fee: correctFee,
  })

  let finalPsbt = bitcoin.Psbt.fromBase64(finalReveal, {
    network: provider.network,
  })
  finalPsbt.signInput(0, tweakedTaprootKeyPair)
  finalPsbt.finalizeInput(0)

  const finalSignedPsbt = rawPsbt.extractTransaction().toHex()

  const finalVsize = (
    await provider.sandshrew.bitcoindRpc.testMemPoolAccept([finalSignedPsbt])
  )[0].vsize

  const finalFee = finalVsize * feeRate

  return { fee: finalFee }
}

export const actualExecuteFee = async ({
  gatheredUtxos,
  account,
  protostone,
  provider,
  feeRate,
  signer,
}: {
  gatheredUtxos: GatheredUtxos
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate: number
  signer: Signer
}) => {
  if (!feeRate) {
    feeRate = (await provider.esplora.getFeeEstimates())['1']
  }

  const { psbt } = await createExecutePsbt({
    gatheredUtxos,
    account,
    protostone,
    provider,
    feeRate,
  })

  const { signedPsbt } = await signer.signAllInputs({
    rawPsbt: psbt,
    finalize: true,
  })

  let rawPsbt = bitcoin.Psbt.fromBase64(signedPsbt, {
    network: account.network,
  })
    .extractTransaction()
    .toHex()

  const vsize = (
    await provider.sandshrew.bitcoindRpc.testMemPoolAccept([rawPsbt])
  )[0].vsize

  const correctFee = vsize * feeRate

  const { psbt: finalPsbt } = await createExecutePsbt({
    gatheredUtxos,
    account,
    protostone,
    provider,
    feeRate,
    fee: correctFee,
  })

  const { signedPsbt: finalSignedPsbt } = await signer.signAllInputs({
    rawPsbt: finalPsbt,
    finalize: true,
  })

  let finalRawPsbt = bitcoin.Psbt.fromBase64(finalSignedPsbt, {
    network: account.network,
  })
    .extractTransaction()
    .toHex()

  const finalVsize = (
    await provider.sandshrew.bitcoindRpc.testMemPoolAccept([finalRawPsbt])
  )[0].vsize

  const finalFee = finalVsize * feeRate

  return { fee: finalFee }
}

export const executeReveal = async ({
  protostone,
  commitTxId,
  script,
  account,
  provider,
  feeRate,
  signer,
}: {
  protostone: Buffer
  commitTxId: string
  script: string
  account: Account
  provider: Provider
  feeRate?: number
  signer: Signer
}) => {
  const tweakedTaprootKeyPair: bitcoin.Signer = tweakSigner(
    signer.taprootKeyPair,
    {
      network: provider.network,
    }
  )

  const { fee } = await actualTransactRevealFee({
    protostone,
    tweakedTaprootKeyPair,
    receiverAddress: account.taproot.address,
    commitTxId,
    script: Buffer.from(script, 'hex'),
    provider,
    feeRate,
  })

  const { psbt: finalRevealPsbt } = await createTransactReveal({
    protostone,
    tweakedTaprootKeyPair,
    receiverAddress: account.taproot.address,
    commitTxId,
    script: Buffer.from(script, 'hex'),
    provider,
    feeRate,
    fee,
  })

  let finalReveal = bitcoin.Psbt.fromBase64(finalRevealPsbt, {
    network: provider.network,
  })

  finalReveal.signInput(0, tweakedTaprootKeyPair)
  finalReveal.finalizeInput(0)

  const finalSignedPsbt = finalReveal.toBase64()

  const revealResult = await provider.pushPsbt({
    psbtBase64: finalSignedPsbt,
  })

  return revealResult
}

export const execute = async ({
  gatheredUtxos,
  account,
  protostone,
  provider,
  feeRate,
  signer,
}: {
  gatheredUtxos: GatheredUtxos
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate?: number
  signer: Signer
}) => {
  const { fee } = await actualExecuteFee({
    gatheredUtxos,
    account,
    protostone,
    provider,
    feeRate,
    signer,
  })

  const { psbt: finalPsbt } = await createExecutePsbt({
    gatheredUtxos,
    account,
    protostone,
    provider,
    feeRate,
    fee,
  })

  const { signedPsbt } = await signer.signAllInputs({
    rawPsbt: finalPsbt,
    finalize: true,
  })

  const revealResult = await provider.pushPsbt({
    psbtBase64: signedPsbt,
  })

  return revealResult
}

export const createTransactReveal = async ({
  protostone,
  receiverAddress,
  script,
  feeRate,
  tweakedTaprootKeyPair,
  provider,
  fee = 0,
  commitTxId,
}: {
  protostone: Buffer
  receiverAddress: string
  script: Buffer
  feeRate: number
  tweakedTaprootKeyPair: bitcoin.Signer
  provider: Provider
  fee?: number
  commitTxId: string
}) => {
  try {
    if (!feeRate) {
      feeRate = (await provider.esplora.getFeeEstimates())['1']
    }

    const psbt: bitcoin.Psbt = new bitcoin.Psbt({ network: provider.network })
    const minFee = minimumFee({
      taprootInputCount: 1,
      nonTaprootInputCount: 0,
      outputCount: 2,
    })

    const revealTxBaseFee = minFee * feeRate < 250 ? 250 : minFee * feeRate
    const revealTxChange = fee === 0 ? 0 : Number(revealTxBaseFee) - fee

    const commitTxOutput = await getOutputValueByVOutIndex({
      txId: commitTxId,
      vOut: 0,
      esploraRpc: provider.esplora,
    })

    if (!commitTxOutput) {
      throw new OylTransactionError(new Error('Error getting vin #0 value'))
    }

    const p2pk_redeem = { output: script }

    const { output, witness } = bitcoin.payments.p2tr({
      internalPubkey: toXOnly(tweakedTaprootKeyPair.publicKey),
      scriptTree: p2pk_redeem,
      redeem: p2pk_redeem,
      network: provider.network,
    })

    psbt.addInput({
      hash: commitTxId,
      index: 0,
      witnessUtxo: {
        value: commitTxOutput.value,
        script: output,
      },
      tapLeafScript: [
        {
          leafVersion: LEAF_VERSION_TAPSCRIPT,
          script: p2pk_redeem.output,
          controlBlock: witness![witness!.length - 1],
        },
      ],
    })

    psbt.addOutput({
      value: 546,
      address: receiverAddress,
    })

    psbt.addOutput({
      value: 0,
      script: protostone,
    })

    if (revealTxChange > 546) {
      psbt.addOutput({
        value: revealTxChange,
        address: receiverAddress,
      })
    }

    return {
      psbt: psbt.toBase64(),
      fee: revealTxChange,
    }
  } catch (error) {
    throw new OylTransactionError(error)
  }
}

export const actualBumpFeeFee = async ({
  txid,
  account,
  provider,
  newFeeRate,
  signer,
}: {
  txid: string
  account: Account
  provider: Provider
  newFeeRate: number
  signer: Signer
}) => {
  if (!newFeeRate) {
    newFeeRate = (await provider.esplora.getFeeEstimates())['1']
  }

  const { psbt } = await createBumpFeePsbt({
    txid,
    account,
    provider,
    newFeeRate,
  })

  const { signedPsbt } = await signer.signAllInputs({
    rawPsbt: psbt,
    finalize: true,
  })

  let rawPsbt = bitcoin.Psbt.fromBase64(signedPsbt, {
    network: account.network,
  })
    .extractTransaction()
    .toHex()

  const vsize = (
    await provider.sandshrew.bitcoindRpc.testMemPoolAccept([rawPsbt])
  )[0].vsize

  const correctFee = vsize * newFeeRate

  return { fee: correctFee }
}

export const createBumpFeePsbt = async ({
  txid,
  account,
  provider,
  newFeeRate,
  fee = 0,
}: {
  txid: string
  account: Account
  provider: Provider
  newFeeRate: number
  fee?: number
}) => {
  try {

    const txInfo = await provider.esplora.getTxInfo(txid)
    const txHex = await provider.esplora.getTxHex(txid)
    const tx = bitcoin.Transaction.fromHex(txHex)
    
    let psbt = new bitcoin.Psbt({ network: provider.network })
    

    for (let i = 0; i < tx.ins.length; i++) {
      const input = tx.ins[i]
      const vin = txInfo.vin[i]
      
      psbt.addInput({
        hash: input.hash.reverse().toString('hex'),
        index: input.index,
        sequence: 0xfffffffd,
        witnessUtxo: {
          script: Buffer.from(vin.prevout.scriptpubkey, 'hex'),
          value: vin.prevout.value,
        }
      })
    }


    for (let i = 0; i < tx.outs.length - 1; i++) {
      psbt.addOutput({
        script: tx.outs[i].script,
        value: tx.outs[i].value
      })
    }


    const changeOutput = tx.outs[tx.outs.length - 1]
    const finalFee = fee === 0 ? newFeeRate * tx.virtualSize() : fee
    
    psbt.addOutput({
      script: changeOutput.script,
      value: changeOutput.value - (finalFee - txInfo.fee)
    })

    return { psbt: psbt.toBase64() }
  } catch (error) {
    throw new OylTransactionError(error)
  }
}

export const bumpFee = async ({
  txid,
  newFeeRate,
  account,
  provider,
  signer,
}: {
  txid: string
  newFeeRate: number
  account: Account
  provider: Provider
  signer: Signer
}) => {
  const { fee } = await actualBumpFeeFee({
    txid,
    account,
    provider,
    newFeeRate,
    signer,
  })

  const { psbt: finalPsbt } = await createBumpFeePsbt({
    txid,
    account,
    provider,
    newFeeRate,
    fee,
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

export const deployCommit = async ({
  payload,
  gatheredUtxos,
  account,
  provider,
  feeRate,
  signer,
}: {
  payload: AlkanesPayload
  gatheredUtxos: GatheredUtxos
  account: Account
  provider: Provider
  feeRate?: number
  signer: Signer
}) => {
  const tweakedTaprootKeyPair: bitcoin.Signer = tweakSigner(
    signer.taprootKeyPair,
    {
      network: provider.network,
    }
  )

  const { fee: commitFee } = await actualDeployCommitFee({
    payload,
    gatheredUtxos,
    tweakedTaprootKeyPair,
    account,
    provider,
    feeRate,
    signer,
  })

  const { psbt: finalPsbt, script } = await createDeployCommit({
    payload,
    gatheredUtxos,
    tweakedTaprootKeyPair,
    account,
    provider,
    feeRate,
    fee: commitFee,
  })

  const { signedPsbt } = await signer.signAllInputs({
    rawPsbt: finalPsbt,
    finalize: true,
  })

  const result = await provider.pushPsbt({
    psbtBase64: signedPsbt,
  })

  console.log('commit:', result)
  return { ...result, script: script.toString('hex') }
}
