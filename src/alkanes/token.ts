import { minimumFee } from '../btc'
import { u128, u32 } from '@magiceden-oss/runestone-lib/dist/src/integer'
import { Account, Signer, Provider, AlkanesPayload } from '..'
import { ProtoStone, encipher, encodeRunestoneProtostone } from 'alkanes/lib/index.js'
import { ProtoruneRuneId } from 'alkanes/lib/protorune/protoruneruneid'
import { OylTransactionError } from '../errors'
import { AlkaneId } from '@alkanes/types'
import * as bitcoin from 'bitcoinjs-lib'
import {
  timeout,
  findXAmountOfSats,
  inscriptionSats,
  formatInputsToSign,
  getAddressType,
  addInputUtxosToPsbt,
} from '../shared/utils'
import { getEstimatedFee } from '../psbt'
import {
  deployCommit,
  deployReveal,
  encodeProtostone,
  addInputForUtxo,
} from './alkanes'
import { ProtoruneEdict } from 'alkanes/lib/protorune/protoruneedict'
import {
  FormattedUtxo,
  GatheredUtxos,
  selectAlkanesUtxos,
  selectSpendableUtxos,
} from '../utxo'

export const inscribePayload = async ({
  alkanesUtxos,
  payload,
  utxos,
  account,
  protostone,
  provider,
  feeRate,
  signer,
}: {
  alkanesUtxos?: FormattedUtxo[]
  payload: AlkanesPayload
  utxos: FormattedUtxo[]
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate?: number
  signer: Signer
}) => {
  const { script, txId, commitPsbt } = await deployCommit({
    payload,
    utxos,
    account,
    provider,
    feeRate,
    signer,
    protostone,
  })

  await timeout(3000)

  const reveal = await deployReveal({
    payload,
    alkanesUtxos,
    utxos,
    protostone,
    script,
    commitTxId: txId,
    commitPsbt: bitcoin.Psbt.fromBase64(commitPsbt, {
      network: provider.network,
    }),
    account,
    provider,
    feeRate,
    signer,
  })

  return { ...reveal, commitTx: txId }
}

export const createSendPsbt = async ({
  utxos,
  account,
  alkaneId,
  provider,
  toAddress,
  amount,
  feeRate,
  fee,
}: {
  utxos: FormattedUtxo[]
  account: Account
  alkaneId: { block: string; tx: string }
  provider: Provider
  toAddress: string
  amount: number
  feeRate?: number
  fee?: number
}) => {
  try {
    let alkanesAddress: string;
    let alkanesPubkey: string;

    if (account.taproot) {
      alkanesAddress = account.taproot.address;
      alkanesPubkey = account.taproot.pubkey;
    } else if (account.nativeSegwit) {
      alkanesAddress = account.nativeSegwit.address;
      alkanesPubkey = account.nativeSegwit.pubkey;
    } else {
      throw new Error('No taproot or nativeSegwit address found')
    }

    const totalSpendableUtxos = selectSpendableUtxos(utxos, account.spendStrategy)

    const minFee = minimumFee({
      taprootInputCount: 2,
      nonTaprootInputCount: 0,
      outputCount: 3,
    })
    const calculatedFee = minFee * feeRate < 250 ? 250 : minFee * feeRate
    let finalFee = fee ? fee : calculatedFee

    let gatheredUtxos = findXAmountOfSats(
      totalSpendableUtxos.utxos,
      Number(finalFee) + Number(inscriptionSats) * 2
    )

    if (gatheredUtxos.utxos.length > 1) {
      const txSize = minimumFee({
        taprootInputCount: gatheredUtxos.utxos.length,
        nonTaprootInputCount: 0,
        outputCount: 3,
      })

      finalFee = Math.max(txSize * feeRate, 250)
      gatheredUtxos = findXAmountOfSats(
        totalSpendableUtxos.utxos,
        Number(finalFee) + Number(inscriptionSats) * 2
      )
    }

    let psbt = new bitcoin.Psbt({ network: provider.network })

    const alkanesUtxos = await selectAlkanesUtxos({
      utxos,
      alkaneId,
      greatestToLeast: account.spendStrategy.utxoSortGreatestToLeast,
      targetNumberOfAlkanes: amount,
    })

    if (alkanesUtxos.utxos.length === 0) {
      throw new OylTransactionError(Error('No Alkane Utxos Found'))
    }

    await addInputUtxosToPsbt(alkanesUtxos.utxos, psbt, account, provider);

    if (gatheredUtxos.totalAmount < finalFee + inscriptionSats * 2) {
      throw new OylTransactionError(Error('Insufficient Balance'))
    }

    await addInputUtxosToPsbt(gatheredUtxos.utxos, psbt, account, provider);

    const protostone = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.message({
          protocolTag: 1n,
          edicts: [
            {
              id: new ProtoruneRuneId(
                u128(BigInt(alkaneId.block)),
                u128(BigInt(alkaneId.tx))
              ),
              amount: u128(BigInt(amount)),
              output: u32(BigInt(1)),
            },
          ],
          pointer: 0,
          refundPointer: 0,
          calldata: encipher([BigInt(2), BigInt(0), BigInt(77)]),
        }),
      ],
    }).encodedRunestone

    psbt.addOutput({
      value: inscriptionSats,
      address: alkanesAddress,
    })

    psbt.addOutput({
      value: inscriptionSats,
      address: toAddress,
    })

    const output = { script: protostone, value: 0 }

    psbt.addOutput(output)
    const changeAmount =
      gatheredUtxos.totalAmount +
      alkanesUtxos.totalAmount -
      (finalFee + inscriptionSats * 2)

    psbt.addOutput({
      address: account[account.spendStrategy.changeAddress].address,
      value: changeAmount,
    })

    const formattedPsbtTx = await formatInputsToSign({
      _psbt: psbt,
      senderPublicKey: alkanesPubkey,
      network: provider.network,
    })

    return { psbt: formattedPsbtTx.toBase64() }
  } catch (error) {
    throw new OylTransactionError(error)
  }
}

export const send = async ({
  utxos,
  toAddress,
  amount,
  alkaneId,
  feeRate,
  account,
  provider,
  signer,
}: {
  utxos: FormattedUtxo[]
  toAddress: string
  amount: number
  alkaneId: AlkaneId
  feeRate?: number
  account: Account
  provider: Provider
  signer: Signer
}) => {
  const { fee } = await actualSendFee({
    utxos,
    account,
    alkaneId,
    amount,
    provider,
    toAddress,
    feeRate,
  })

  const { psbt: finalPsbt } = await createSendPsbt({
    utxos,
    account,
    alkaneId,
    amount,
    provider,
    toAddress,
    feeRate,
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

export const actualSendFee = async ({
  utxos,
  account,
  alkaneId,
  provider,
  toAddress,
  amount,
  feeRate,
}: {
  utxos: FormattedUtxo[]
  account: Account
  alkaneId: { block: string; tx: string }
  provider: Provider
  toAddress: string
  amount: number
  feeRate: number
}) => {
  const { psbt } = await createSendPsbt({
    utxos,
    account,
    alkaneId,
    provider,
    toAddress,
    amount,
    feeRate,
  })

  const { fee: estimatedFee } = await getEstimatedFee({
    feeRate,
    psbt,
    provider,
  })

  const { psbt: finalPsbt } = await createSendPsbt({
    utxos,
    account,
    alkaneId,
    provider,
    toAddress,
    amount,
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

export const split = async ({
  alkaneUtxos,
  gatheredUtxos,
  account,
  protostone,
  provider,
  feeRate,
  signer,
}: {
  alkaneUtxos?: GatheredUtxos
  gatheredUtxos: GatheredUtxos
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate?: number
  signer: Signer
}) => {
  const { fee } = await actualSplitFee({
    alkaneUtxos,
    gatheredUtxos,
    account,
    protostone,
    provider,
    feeRate,
    signer,
  })

  const { psbt: finalPsbt } = await createSplitPsbt({
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

  const revealResult = await provider.pushPsbt({
    psbtBase64: signedPsbt,
  })

  return revealResult
}

export const createSplitPsbt = async ({
  alkaneUtxos,
  gatheredUtxos,
  account,
  protostone,
  provider,
  feeRate,
  fee = 0,
}: {
  alkaneUtxos?: GatheredUtxos
  gatheredUtxos: GatheredUtxos
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate?: number
  fee?: number
}) => {
  try {
    let alkanesAddress: string;
    let alkanesPubkey: string;

    if (account.taproot) {
      alkanesAddress = account.taproot.address;
      alkanesPubkey = account.taproot.pubkey;
    } else if (account.nativeSegwit) {
      alkanesAddress = account.nativeSegwit.address;
      alkanesPubkey = account.nativeSegwit.pubkey;
    } else {
      throw new Error('No taproot or nativeSegwit address found')
    }

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
      Number(finalFee) + 546 * alkaneUtxos.utxos.length * 2
    )

    let psbt = new bitcoin.Psbt({ network: provider.network })

    if (alkaneUtxos) {
      await addInputUtxosToPsbt(alkaneUtxos.utxos, psbt, account, provider)
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
    await addInputUtxosToPsbt(gatheredUtxos.utxos, psbt, account, provider);

    for (let i = 0; i < alkaneUtxos.utxos.length * 2; i++) {
      psbt.addOutput({
        address: alkanesAddress,
        value: 546,
      })
    }

    const output = { script: protostone, value: 0 }
    psbt.addOutput(output)

    const changeAmount =
      gatheredUtxos.totalAmount +
      (alkaneUtxos?.totalAmount || 0) -
      finalFee -
      546 * alkaneUtxos.utxos.length * 2

    psbt.addOutput({
      address: account[account.spendStrategy.changeAddress].address,
      value: changeAmount,
    })

    const formattedPsbtTx = await formatInputsToSign({
      _psbt: psbt,
      senderPublicKey: alkanesPubkey,
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

export const actualSplitFee = async ({
  gatheredUtxos,
  account,
  protostone,
  provider,
  feeRate,
  signer,
  alkaneUtxos,
}: {
  gatheredUtxos: GatheredUtxos
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate: number
  signer: Signer
  alkaneUtxos?: GatheredUtxos
}) => {
  if (!feeRate) {
    feeRate = (await provider.esplora.getFeeEstimates())['1']
  }

  const { psbt } = await createSplitPsbt({
    gatheredUtxos,
    account,
    protostone,
    provider,
    feeRate,
    alkaneUtxos,
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

  const { psbt: finalPsbt } = await createSplitPsbt({
    gatheredUtxos,
    account,
    protostone,
    provider,
    feeRate,
    alkaneUtxos,
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

export const createAlkaneMultiSendPsbt = async ({
  sends,
  alkaneId,
  utxos,
  account,
  provider,
  feeRate,
  fee = 0,
}: {
  sends: { address: string; amount: number }[]
  alkaneId: AlkaneId
  utxos: FormattedUtxo[]
  account: Account
  provider: Provider
  feeRate?: number
  fee?: number
}) => {
  try {
    const SAT_PER_VBYTE = feeRate ?? 1
    const MIN_RELAY = 546n

    let alkanesAddress: string
    let alkanesPubkey: string

    if (account.taproot) {
      alkanesAddress = account.taproot.address
      alkanesPubkey = account.taproot.pubkey
    } else if (account.nativeSegwit) {
      alkanesAddress = account.nativeSegwit.address
      alkanesPubkey = account.nativeSegwit.pubkey
    } else {
      throw new Error('No taproot or nativeSegwit address found')
    }

    // first output is refund, then all the send targets, then the op return
    const edicts = sends.map((send, index) => {
      return {
        id: new ProtoruneRuneId(
          u128(BigInt(alkaneId.block)),
          u128(BigInt(alkaneId.tx))
        ),
        amount: u128(BigInt(send.amount)),
        output: u32(BigInt(index + 1)),
      }
    })
    const totalAmount = sends.reduce(
      (sum, send) => sum + send.amount,
      0
    )

    const alkanesUtxos = await selectAlkanesUtxos({
      utxos,
      alkaneId,
      greatestToLeast: account.spendStrategy.utxoSortGreatestToLeast,
      targetNumberOfAlkanes: totalAmount,
    })

    if (alkanesUtxos.utxos.length === 0) {
      throw new OylTransactionError(Error('No Alkane Utxos Found'))
    }

    const protostone = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.message({
          protocolTag: 1n,
          edicts,
          pointer: 0,
          refundPointer: 0,
          calldata: Buffer.from([]),
        }),
      ],
    }).encodedRunestone

    const spendTargets = sends.length * 546

    const minTxSize = minimumFee({
      taprootInputCount: 1,
      nonTaprootInputCount: 0,
      outputCount: 3 + sends.length,
    })

    const minFee = Math.max(minTxSize * SAT_PER_VBYTE, 250)
    let minerFee = fee === 0 ? minFee : fee

    let spendableUtxos = selectSpendableUtxos(utxos, account.spendStrategy)

    let satsNeeded = spendTargets + minerFee
    let gatheredUtxos = findXAmountOfSats(spendableUtxos.utxos, satsNeeded)

    if (fee === 0 && gatheredUtxos.utxos.length > 1) {
      const newSize = minimumFee({
        taprootInputCount: gatheredUtxos.utxos.length,
        nonTaprootInputCount: 0,
        outputCount: 2 + sends.length,
      })
      minerFee = Math.max(newSize * SAT_PER_VBYTE, 250)
      satsNeeded = spendTargets + minerFee
      if (gatheredUtxos.totalAmount < satsNeeded) {
        throw new OylTransactionError(Error('Insufficient balance'))
      }
    }

    const psbt = new bitcoin.Psbt({ network: provider.network })

    await addInputUtxosToPsbt(alkanesUtxos.utxos, psbt, account, provider)

    if (gatheredUtxos.totalAmount < satsNeeded) {
      throw new OylTransactionError(Error('Insufficient Balance'))
    }
    await addInputUtxosToPsbt(gatheredUtxos.utxos, psbt, account, provider)

    psbt.addOutput({
      value: inscriptionSats,
      address: alkanesAddress,
    })

    for (const send of sends) {
      psbt.addOutput({ address: send.address, value: 546 })
    }

    psbt.addOutput({ script: protostone, value: 0 })

    const inputsTotal = gatheredUtxos.totalAmount + alkanesUtxos.totalAmount
    const outputsTotal = psbt.txOutputs.reduce((sum, o) => sum + o.value, 0)

    let change = inputsTotal - outputsTotal - minerFee
    if (change < 0) throw new OylTransactionError(Error('Insufficient balance'))

    if (change >= Number(MIN_RELAY)) {
      psbt.addOutput({
        address: account[account.spendStrategy.changeAddress].address,
        value: change,
      })
    }

    const formatted = await formatInputsToSign({
      _psbt: psbt,
      senderPublicKey: alkanesPubkey,
      network: provider.network,
    })

    return {
      psbt: formatted.toBase64(),
      psbtHex: formatted.toHex(),
    }
  } catch (err) {
    throw new OylTransactionError(err)
  }
}

export const actualAlkaneMultiSendFee = async ({
  sends,
  alkaneId,
  utxos,
  account,
  provider,
  feeRate,
}: {
  sends: { address: string; amount: number }[]
  alkaneId: AlkaneId
  utxos: FormattedUtxo[]
  account: Account
  provider: Provider
  feeRate: number
}) => {
  const { psbt } = await createAlkaneMultiSendPsbt({
    sends,
    alkaneId,
    utxos,
    account,
    provider,
    feeRate,
  })

  const { fee: estimatedFee } = await getEstimatedFee({
    feeRate,
    psbt,
    provider,
  })

  const { psbt: finalPsbt } = await createAlkaneMultiSendPsbt({
    sends,
    alkaneId,
    utxos,
    account,
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

export const alkaneMultiSend = async ({
  sends,
  alkaneId,
  utxos,
  account,
  provider,
  signer,
  feeRate,
}: {
  sends: { address: string; amount: number }[]
  alkaneId: AlkaneId
  utxos: FormattedUtxo[]
  account: Account
  provider: Provider
  signer: Signer
  feeRate?: number
}) => {
  const { fee } = await actualAlkaneMultiSendFee({
    sends,
    alkaneId,
    utxos,
    account,
    provider,
    feeRate,
  })

  const { psbt: finalPsbt } = await createAlkaneMultiSendPsbt({
    sends,
    alkaneId,
    utxos,
    account,
    provider,
    feeRate,
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

