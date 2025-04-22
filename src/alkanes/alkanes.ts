import { minimumFee } from '../btc'
import { Provider } from '../provider/provider'
import * as bitcoin from 'bitcoinjs-lib'
import {
  encipher,
  encodeRunestoneProtostone,
  p2tr_ord_reveal,
  ProtoStone,
} from 'alkanes/lib/index'
import { ProtoruneEdict } from 'alkanes/lib/protorune/protoruneedict'
import { Account, Signer } from '..'
import {
  findXAmountOfSats,
  formatInputsToSign,
  getOutputValueByVOutIndex,
  getVSize,
  inscriptionSats,
  tweakSigner,
} from '../shared/utils'
import { getEstimatedFee } from '../psbt'
import { OylTransactionError } from '../errors'
import { GatheredUtxos, AlkanesPayload } from '../shared/interface'
import { getAddressType } from '../shared/utils'
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371'
import { LEAF_VERSION_TAPSCRIPT } from 'bitcoinjs-lib/src/payments/bip341'
import { Outpoint } from 'rpclient/alkanes'
import { actualDeployCommitFee } from './contract'

export interface ProtostoneMessage {
  protocolTag?: bigint
  edicts?: ProtoruneEdict[]
  pointer?: number
  refundPointer?: number
  calldata: bigint[]
}

export const encodeProtostone = ({
  protocolTag = 1n,
  edicts = [],
  pointer = 0,
  refundPointer = 0,
  calldata,
}: ProtostoneMessage) => {
  return encodeRunestoneProtostone({
    protostones: [
      ProtoStone.message({
        protocolTag,
        edicts,
        pointer,
        refundPointer,
        calldata: encipher(calldata),
      }),
    ],
  }).encodedRunestone
}

export const createExecutePsbt = async ({
  frontendFee,
  feeAddress,
  alkaneUtxos,
  gatheredUtxos,
  account,
  protostone,
  provider,
  feeRate,
  fee = 0,
}: {
  frontendFee?: number
  feeAddress?: string
  alkaneUtxos?: {
    alkaneUtxos: any[]
    totalSatoshis: number
  }
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
      Number(finalFee) + 546 + (frontendFee || 0)
    )

    let psbt = new bitcoin.Psbt({ network: provider.network })

    if (alkaneUtxos) {
      for await (const utxo of alkaneUtxos.alkaneUtxos) {
        if (getAddressType(utxo.address) === 0) {
          const previousTxHex: string = await provider.esplora.getTxHex(
            utxo.txId
          )
          psbt.addInput({
            hash: utxo.txId,
            index: parseInt(utxo.txIndex),
            nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
          })
        }
        if (getAddressType(utxo.address) === 2) {
          const redeemScript = bitcoin.script.compile([
            bitcoin.opcodes.OP_0,
            bitcoin.crypto.hash160(
              Buffer.from(account.nestedSegwit.pubkey, 'hex')
            ),
          ])

          psbt.addInput({
            hash: utxo.txId,
            index: parseInt(utxo.txIndex),
            redeemScript: redeemScript,
            witnessUtxo: {
              value: utxo.satoshis,
              script: bitcoin.script.compile([
                bitcoin.opcodes.OP_HASH160,
                bitcoin.crypto.hash160(redeemScript),
                bitcoin.opcodes.OP_EQUAL,
              ]),
            },
          })
        }
        if (
          getAddressType(utxo.address) === 1 ||
          getAddressType(utxo.address) === 3
        ) {
          psbt.addInput({
            hash: utxo.txId,
            index: parseInt(utxo.txIndex),
            witnessUtxo: {
              value: utxo.satoshis,
              script: Buffer.from(utxo.script, 'hex'),
            },
          })
        }
      }
    }

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
      address: account.taproot.address,
      value: 546,
    })

    const output = { script: protostone, value: 0 }
    psbt.addOutput(output)

    const changeAmount =
      gatheredUtxos.totalAmount +
      (alkaneUtxos?.totalSatoshis || 0) -
      finalFee -
      546 -
      (frontendFee || 0)

    console.log(changeAmount, 'changeAmount')

    psbt.addOutput({
      address: account[account.spendStrategy.changeAddress].address,
      value: changeAmount,
    })

    if (frontendFee && feeAddress) {
      psbt.addOutput({
        address: feeAddress,
        value: frontendFee,
      })
    }

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

export const createDeployCommitPsbt = async ({
  payload,
  gatheredUtxos,
  tweakedPublicKey,
  account,
  provider,
  feeRate,
  fee,
}: {
  payload: AlkanesPayload
  gatheredUtxos: GatheredUtxos
  tweakedPublicKey: string
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
      p2tr_ord_reveal(toXOnly(Buffer.from(tweakedPublicKey, 'hex')), [payload])
        .script
    )

    const inscriberInfo = bitcoin.payments.p2tr({
      internalPubkey: toXOnly(Buffer.from(tweakedPublicKey, 'hex')),
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

  const tweakedPublicKey = tweakedTaprootKeyPair.publicKey.toString('hex')

  const { fee: commitFee } = await actualDeployCommitFee({
    payload,
    gatheredUtxos,
    tweakedPublicKey,
    account,
    provider,
    feeRate,
  })

  const { psbt: finalPsbt, script } = await createDeployCommitPsbt({
    payload,
    gatheredUtxos,
    tweakedPublicKey,
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

  return { ...result, script: script.toString('hex') }
}

export const createDeployRevealPsbt = async ({
  protostone,
  receiverAddress,
  script,
  feeRate,
  tweakedPublicKey,
  provider,
  fee = 0,
  commitTxId,
}: {
  protostone: Buffer
  receiverAddress: string
  script: Buffer
  feeRate: number
  tweakedPublicKey: string
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
      internalPubkey: toXOnly(Buffer.from(tweakedPublicKey, 'hex')),
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

export const deployReveal = async ({
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

  const tweakedPublicKey = tweakedTaprootKeyPair.publicKey.toString('hex')

  const { fee } = await actualTransactRevealFee({
    protostone,
    tweakedPublicKey,
    receiverAddress: account.taproot.address,
    commitTxId,
    script: Buffer.from(script, 'hex'),
    provider,
    feeRate,
  })

  const { psbt: finalRevealPsbt } = await createTransactReveal({
    protostone,
    tweakedPublicKey,
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
          Number(value.rune.id.block) === Number(alkaneId.block) &&
          Number(value.rune.id.tx) === Number(alkaneId.tx)
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
  const alkaneUtxos: {
    txId: string
    txIndex: number
    script: string
    address: string
    amountOfAlkanes: string
    satoshis: number
  }[] = []

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
        ...alkane.rune.rune,
      })
      totalSatoshis += satoshis
      totalBalanceBeingSent +=
        Number(alkane.rune.balance) /
        (alkane.rune.rune.divisibility == 1
          ? 1
          : 10 ** alkane.rune.rune.divisibility)
    }
  }
  if (totalBalanceBeingSent < targetNumberOfAlkanes) {
    throw new OylTransactionError(Error('Insuffiecient balance of alkanes.'))
  }
  return { alkaneUtxos, totalSatoshis, totalBalanceBeingSent }
}

export const actualTransactRevealFee = async ({
  protostone,
  tweakedPublicKey,
  commitTxId,
  receiverAddress,
  script,
  provider,
  feeRate,
}: {
  protostone: Buffer
  tweakedPublicKey: string
  commitTxId: string
  receiverAddress: string
  script: Buffer
  provider: Provider
  feeRate?: number
}) => {
  if (!feeRate) {
    feeRate = (await provider.esplora.getFeeEstimates())['1']
  }

  const { psbt } = await createTransactReveal({
    protostone,
    commitTxId,
    receiverAddress,
    script,
    tweakedPublicKey,
    provider,
    feeRate,
  })

  const { fee: estimatedFee } = await getEstimatedFee({
    feeRate,
    psbt,
    provider,
  })

  const { psbt: finalPsbt } = await createTransactReveal({
    protostone,
    commitTxId,
    receiverAddress,
    script,
    tweakedPublicKey,
    provider,
    feeRate,
    fee: estimatedFee,
  })

  const { fee: finalFee, vsize } = await getEstimatedFee({
    feeRate,
    psbt: finalPsbt,
    provider,
  })

  return { fee: finalFee, vsize }
}

export const actualExecuteFee = async ({
  gatheredUtxos,
  account,
  protostone,
  provider,
  feeRate,
  alkaneUtxos,
  frontendFee,
  feeAddress,
}: {
  gatheredUtxos: GatheredUtxos
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate: number
  alkaneUtxos?: {
    alkaneUtxos: any[]
    totalSatoshis: number
  }
  frontendFee?: number
  feeAddress?: string
}) => {
  if (!feeRate) {
    feeRate = (await provider.esplora.getFeeEstimates())['1']
  }

  const { psbt } = await createExecutePsbt({
    frontendFee,
    feeAddress,
    gatheredUtxos,
    account,
    protostone,
    provider,
    feeRate,
    alkaneUtxos,
  })

  const { fee: estimatedFee } = await getEstimatedFee({
    feeRate,
    psbt,
    provider,
  })

  const { psbt: finalPsbt } = await createExecutePsbt({
    frontendFee,
    feeAddress,
    gatheredUtxos,
    account,
    protostone,
    provider,
    feeRate,
    alkaneUtxos,
    fee: estimatedFee,
  })

  const { fee: finalFee, vsize } = await getEstimatedFee({
    feeRate,
    psbt: finalPsbt,
    provider,
  })

  return { fee: finalFee, vsize }
}

export const executePsbt = async ({
  alkaneUtxos,
  gatheredUtxos,
  account,
  protostone,
  provider,
  feeRate,
  frontendFee,
  feeAddress,
}: {
  alkaneUtxos?: {
    alkaneUtxos: any[]
    totalSatoshis: number
  }
  gatheredUtxos: GatheredUtxos
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate?: number
  frontendFee?: number
  feeAddress?: string
}) => {
  const { fee } = await actualExecuteFee({
    frontendFee,
    feeAddress,
    alkaneUtxos,
    gatheredUtxos,
    account,
    protostone,
    provider,
    feeRate,
  })

  const { psbt: finalPsbt } = await createExecutePsbt({
    frontendFee,
    feeAddress,
    alkaneUtxos,
    gatheredUtxos,
    account,
    protostone,
    provider,
    feeRate,
    fee,
  })

  return { psbt: finalPsbt, fee }
}

export const execute = async ({
  alkaneUtxos,
  gatheredUtxos,
  account,
  protostone,
  provider,
  feeRate,
  signer,
  frontendFee,
  feeAddress,
}: {
  alkaneUtxos?: {
    alkaneUtxos: any[]
    totalSatoshis: number
  }
  gatheredUtxos: GatheredUtxos
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate?: number
  signer: Signer
  frontendFee?: number
  feeAddress?: string
}) => {
  const { fee } = await actualExecuteFee({
    frontendFee,
    feeAddress,
    alkaneUtxos,
    gatheredUtxos,
    account,
    protostone,
    provider,
    feeRate,
  })

  const { psbt: finalPsbt } = await createExecutePsbt({
    frontendFee,
    feeAddress,
    alkaneUtxos,
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

  const pushResult = await provider.pushPsbt({
    psbtBase64: signedPsbt,
  })

  return pushResult
}

export const createTransactReveal = async ({
  protostone,
  receiverAddress,
  script,
  feeRate,
  tweakedPublicKey,
  provider,
  fee = 0,
  commitTxId,
}: {
  protostone: Buffer
  receiverAddress: string
  script: Buffer
  feeRate: number
  tweakedPublicKey: string
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
      internalPubkey: toXOnly(Buffer.from(tweakedPublicKey, 'hex')),
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
