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
import { ProtoruneRuneId } from 'alkanes/lib/protorune/protoruneruneid'
import { u128, u32 } from '@magiceden-oss/runestone-lib/dist/src/integer'
import { getWrapAddress } from '../amm/subfrost'
import { Account, AlkaneId, DIESEL_MINT_PROTOSTONE, Signer } from '..'
import {
  addInputUtxosToPsbt,
  findXAmountOfSats,
  formatInputsToSign,
  formatInputToSign,
  getOutputValueByVOutIndex,
  getVSize,
  inscriptionSats,
  tweakSigner,
  getUnfinalizedPsbtTxId,
} from '../shared/utils'
import { getEstimatedFee } from '../psbt'
import { OylTransactionError } from '../errors'
import { AlkanesPayload } from '../shared/interface'
import { getAddressType } from '../shared/utils'
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371'
import { LEAF_VERSION_TAPSCRIPT } from 'bitcoinjs-lib/src/payments/bip341'
import { selectSpendableUtxos, type FormattedUtxo } from '../utxo'
import { inscribePayload } from './token'

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

export const addFrBtcWrapOutToPsbt = ({
  frbtcWrapPsbt,
  account,
  psbt,
}: {
  frbtcWrapPsbt: bitcoin.Psbt
  account: Account
  psbt: bitcoin.Psbt
}) => {
  const frbtcWrapTxId = getUnfinalizedPsbtTxId(frbtcWrapPsbt)
  const output = frbtcWrapPsbt.txOutputs[0]
  if (account.taproot) {
    psbt.addInput({
      hash: frbtcWrapTxId,
      index: 0,
      witnessUtxo: {
        script: output.script,
        value: output.value,
      },
      tapInternalKey: toXOnly(Buffer.from(account.taproot.pubkey, 'hex')),
    })
  } else if (account.nativeSegwit) {
    psbt.addInput({
      hash: frbtcWrapTxId,
      index: 0,
      witnessUtxo: {
        script: output.script,
        value: output.value,
      },
    })
  }
}

export const createExecutePsbt = async ({
  alkanesUtxos,
  frontendFee,
  feeAddress,
  utxos,
  account,
  protostone,
  provider,
  feeRate,
  fee = 0,
  frbtcWrapPsbt,
}: {
  alkanesUtxos?: FormattedUtxo[]
  frontendFee?: bigint
  feeAddress?: string
  utxos: FormattedUtxo[]
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate?: number
  fee?: number
  frbtcWrapPsbt?: bitcoin.Psbt
}) => {
  try {
    const SAT_PER_VBYTE = feeRate ?? 1
    const MIN_RELAY = 546n

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

    if (frontendFee && !feeAddress) {
      throw new Error('feeAddress required when frontendFee is set')
    }

    const feeSatEffective: bigint =
      frontendFee && frontendFee >= MIN_RELAY ? frontendFee : 0n

    const spendTargets = 546 + Number(feeSatEffective)

    const minTxSize = minimumFee({
      taprootInputCount: 2,
      nonTaprootInputCount: 0,
      outputCount: 2 + (feeSatEffective > 0n ? 1 : 0),
    })

    const minFee = Math.max(Math.ceil(minTxSize * SAT_PER_VBYTE), 250)
    let minerFee = fee === 0 ? minFee : fee

    const totalSpendableUtxos = selectSpendableUtxos(utxos, account.spendStrategy)

    const satsNeeded = spendTargets + minerFee
    let gatheredUtxos = findXAmountOfSats(totalSpendableUtxos.utxos, satsNeeded)

    if (fee === 0 && gatheredUtxos.utxos.length > 1) {
      const newSize = minimumFee({
        taprootInputCount: gatheredUtxos.utxos.length,
        nonTaprootInputCount: 0,
        outputCount: 2 + (feeSatEffective > 0n ? 1 : 0),
      })
      minerFee = Math.max(Math.ceil(newSize * SAT_PER_VBYTE), 250)
      if (gatheredUtxos.totalAmount < minerFee) {
        throw new OylTransactionError(Error('Insufficient balance'))
      }
    }

    const psbt = new bitcoin.Psbt({ network: provider.network })

    if (frbtcWrapPsbt) {
      addFrBtcWrapOutToPsbt({ frbtcWrapPsbt, account, psbt });
    }
    if (alkanesUtxos) {
      for (const utxo of alkanesUtxos) {
        await addInputForUtxo(psbt, utxo, account, provider)
      }
    }
    for (const utxo of gatheredUtxos.utxos) {
      await addInputForUtxo(psbt, utxo, account, provider)
    }

    psbt.addOutput({ address: alkanesAddress, value: 546 })
    psbt.addOutput({ script: protostone, value: 0 })

    if (feeSatEffective > 0n) {
      psbt.addOutput({
        address: feeAddress!,
        value: Number(feeSatEffective),
      })
    }

    const totalAlkanesAmount = alkanesUtxos
      ? alkanesUtxos.reduce((acc, utxo) => acc + utxo.satoshis, 0)
      : 0

    const inputsTotal = gatheredUtxos.totalAmount + (totalAlkanesAmount ?? 0)
    const outputsTotal = psbt.txOutputs.reduce((sum, o) => sum + o.value, 0)

    let change = inputsTotal - outputsTotal - minerFee
    if (change < 0) throw new OylTransactionError(Error('Insufficient balance'))

    if (change >= Number(MIN_RELAY)) {
      psbt.addOutput({
        address: account[account.spendStrategy.changeAddress].address,
        value: change,
      })
    } else {
      minerFee += change
      change = 0
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

export const createWrapBtcPsbt = async ({
  alkanesUtxos,
  utxos,
  account,
  protostone,
  provider,
  feeRate,
  fee = 0,
  wrapAmount,
}: {
  alkanesUtxos?: FormattedUtxo[]
  utxos: FormattedUtxo[]
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate?: number
  fee?: number
  wrapAmount: number
}) => {
  try {
    const wrapAddress = await getWrapAddress(provider)
    const SAT_PER_VBYTE = feeRate ?? 1
    const MIN_RELAY = 546n

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

    const spendTargets = 546 + wrapAmount

    const minTxSize = minimumFee({
      taprootInputCount: 2,
      nonTaprootInputCount: 0,
      outputCount: 3,
    })

    const minFee = Math.max(Math.ceil(minTxSize * SAT_PER_VBYTE), 250)
    let minerFee = fee === 0 ? minFee : fee

    let gatheredUtxos = selectSpendableUtxos(utxos, account.spendStrategy)

    const satsNeeded = spendTargets + minerFee
    gatheredUtxos = findXAmountOfSats(gatheredUtxos.utxos, satsNeeded)

    if (fee === 0 && gatheredUtxos.utxos.length > 1) {
      const newSize = minimumFee({
        taprootInputCount: gatheredUtxos.utxos.length,
        nonTaprootInputCount: 0,
        outputCount: 3,
      })
      minerFee = Math.max(Math.ceil(newSize * SAT_PER_VBYTE), 250)
      if (gatheredUtxos.totalAmount < minerFee) {
        throw new OylTransactionError(Error('Insufficient balance'))
      }
    }

    const psbt = new bitcoin.Psbt({ network: provider.network })

    if (alkanesUtxos) {
      for (const utxo of alkanesUtxos) {
        await addInputForUtxo(psbt, utxo, account, provider)
      }
    }
    for (const utxo of gatheredUtxos.utxos) {
      await addInputForUtxo(psbt, utxo, account, provider)
    }

    psbt.addOutput({ address: alkanesAddress, value: 546 })
    psbt.addOutput({ script: protostone, value: 0 })
    psbt.addOutput({ address: wrapAddress, value: wrapAmount })

    const totalAlkanesAmount = alkanesUtxos
      ? alkanesUtxos.reduce((acc, utxo) => acc + utxo.satoshis, 0)
      : 0

    const inputsTotal = gatheredUtxos.totalAmount + (totalAlkanesAmount ?? 0)
    const outputsTotal = psbt.txOutputs.reduce((sum, o) => sum + o.value, 0)

    let change = inputsTotal - outputsTotal - minerFee
    if (change < 0) throw new OylTransactionError(Error('Insufficient balance'))

    if (change >= Number(MIN_RELAY)) {
      psbt.addOutput({
        address: account[account.spendStrategy.changeAddress].address,
        value: change,
      })
    } else {
      minerFee += change
      change = 0
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

export const createUnwrapBtcPsbt = async ({
  utxos,
  account,
  provider,
  feeRate,
  fee = 0,
  unwrapAmount,
  alkaneUtxos,
}: {
  utxos: FormattedUtxo[]
  account: Account
  provider: Provider
  feeRate?: number
  fee?: number
  unwrapAmount: bigint
  alkaneUtxos: FormattedUtxo[]
}) => {
  try {
    const SAT_PER_VBYTE = feeRate ?? 1
    const MIN_RELAY = 546n

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

    const btcTargetAddress = account.nativeSegwit
      ? account.nativeSegwit.address
      : account.taproot.address;

    const subfrostAddress = await getWrapAddress(provider);

    const psbt = new bitcoin.Psbt({ network: provider.network })
    psbt.addOutput({ address: alkanesAddress, value: 546 }) // alkanes refund goes to 0
    psbt.addOutput({ address: btcTargetAddress, value: 546 }) // frbtc burn pointer goes to 1
    psbt.addOutput({ address: subfrostAddress, value: 546 })
    const dustOutputIndex = psbt.txOutputs.length - 1

    for (const utxo of alkaneUtxos) {
      await addInputForUtxo(psbt, utxo, account, provider)
    }

    const spendTargets = 546
    const minTxSize = minimumFee({
      taprootInputCount: psbt.txInputs.length,
      nonTaprootInputCount: 0,
      outputCount: psbt.txOutputs.length + 2, // already includes the subfrost address, 1 more for potential change, 1 for opreturn
    })

    const minFee = Math.max(Math.ceil(minTxSize * SAT_PER_VBYTE), 250)
    let minerFee = fee === 0 ? minFee : fee

    let gatheredUtxos = selectSpendableUtxos(utxos, account.spendStrategy)
    const satsNeeded = spendTargets + minerFee
    gatheredUtxos = findXAmountOfSats(gatheredUtxos.utxos, satsNeeded)

    if (fee === 0 && gatheredUtxos.utxos.length > 1) {
      const newSize = minimumFee({
        taprootInputCount: psbt.txInputs.length + gatheredUtxos.utxos.length,
        nonTaprootInputCount: 0,
        outputCount: psbt.txOutputs.length + 1,
      })
      minerFee = Math.max(Math.ceil(newSize * SAT_PER_VBYTE), 250)
      if (gatheredUtxos.totalAmount < minerFee) {
        throw new OylTransactionError(Error('Insufficient balance'))
      }
    }

    for (const utxo of gatheredUtxos.utxos) {
      await addInputForUtxo(psbt, utxo, account, provider)
    }

    const inputsTotal = gatheredUtxos.totalAmount + alkaneUtxos.reduce((acc, u) => acc + u.satoshis, 0)
    const outputsTotal = psbt.txOutputs.reduce((sum, o) => sum + o.value, 0)

    let change = inputsTotal - outputsTotal - minerFee
    if (change < 0) throw new OylTransactionError(Error('Insufficient balance'))

    if (change >= Number(MIN_RELAY)) {
      psbt.addOutput({
        address: account[account.spendStrategy.changeAddress].address,
        value: change,
      })
    } else {
      minerFee += change
      change = 0
    }

    const calldata: bigint[] = [32n, 0n, 78n, BigInt(dustOutputIndex), unwrapAmount]
    const protostones: ProtoStone[] = []

    protostones.push(
      ProtoStone.message({
        protocolTag: 1n,
        edicts: [
          {
            id: new ProtoruneRuneId(u128(32n), u128(0n)),
            amount: u128(unwrapAmount),
            output: u32(psbt.txOutputs.length + 3), // 1 for op return, 1 for reserved, then 1 for edict
          },
        ],
        pointer: 0,
        refundPointer: 0,
        calldata: Buffer.from([]),
      })
    )

    protostones.push(
      ProtoStone.message({
        protocolTag: 1n,
        edicts: [],
        pointer: 1,
        refundPointer: 0,
        calldata: encipher(calldata),
      })
    )

    const protostone = encodeRunestoneProtostone({ protostones }).encodedRunestone

    psbt.addOutput({ script: protostone, value: 0 })

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

export const actualUnwrapBtcFee = async ({
  utxos,
  account,
  provider,
  feeRate,
  unwrapAmount,
  alkaneUtxos,
}: {
  utxos: FormattedUtxo[]
  account: Account
  provider: Provider
  feeRate?: number
  unwrapAmount: bigint
  alkaneUtxos: FormattedUtxo[]
}) => {
  const { psbt } = await createUnwrapBtcPsbt({
    utxos,
    account,
    provider,
    feeRate,
    unwrapAmount,
    alkaneUtxos,
  })

  const { fee: estimatedFee } = await getEstimatedFee({
    feeRate,
    psbt,
    provider,
  })

  const { psbt: finalPsbt } = await createUnwrapBtcPsbt({
    utxos,
    account,
    provider,
    feeRate,
    fee: estimatedFee,
    unwrapAmount,
    alkaneUtxos,
  })

  const { fee: finalFee, vsize } = await getEstimatedFee({
    feeRate,
    psbt: finalPsbt,
    provider,
  })

  return { fee: finalFee, vsize }
}



export const unwrapBtcNoSigning = async ({
  utxos,
  account,
  provider,
  feeRate,
  unwrapAmount,
  alkaneUtxos,
}: {
  utxos: FormattedUtxo[]
  account: Account
  provider: Provider
  feeRate?: number
  unwrapAmount: bigint
  alkaneUtxos: FormattedUtxo[]
}) => {
  const { fee } = await actualUnwrapBtcFee({
    utxos,
    account,
    provider,
    feeRate,
    unwrapAmount,
    alkaneUtxos,
  })

  return await createUnwrapBtcPsbt({
    utxos,
    account,
    provider,
    feeRate,
    fee,
    unwrapAmount,
    alkaneUtxos,
  })
}

export const unwrapBtc = async ({
  utxos,
  account,
  provider,
  feeRate,
  signer,
  unwrapAmount,
  alkaneUtxos,
}: {
  utxos: FormattedUtxo[]
  account: Account
  provider: Provider
  feeRate?: number
  signer: Signer
  unwrapAmount: bigint
  alkaneUtxos: FormattedUtxo[]
}) => {
  const totalAlkaneAmount = alkaneUtxos.reduce((acc, utxo) => {
    const alkane = utxo.alkanes['32:0']
    if (alkane) {
      return acc + BigInt(alkane.value)
    }
    return acc
  }, 0n)
  if (totalAlkaneAmount < unwrapAmount) {
    throw new OylTransactionError(Error('Insufficient frbtc balance'))
  }
  const { psbt: finalPsbt } = await unwrapBtcNoSigning({
    utxos,
    account,
    provider,
    feeRate,
    unwrapAmount,
    alkaneUtxos,
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

export async function addInputForUtxo(
  psbt: bitcoin.Psbt,
  utxo: FormattedUtxo,
  account: Account,
  provider: Provider
) {
  const type = getAddressType(utxo.address)
  switch (type) {
    case 0: {
      // legacy P2PKH
      const prevHex = await provider.esplora.getTxHex(utxo.txId)
      psbt.addInput({
        hash: utxo.txId,
        index: +utxo.outputIndex,
        nonWitnessUtxo: Buffer.from(prevHex, 'hex'),
      })
      break
    }
    case 2: {
      // nested SegWit
      const redeem = bitcoin.script.compile([
        bitcoin.opcodes.OP_0,
        bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
      ])
      psbt.addInput({
        hash: utxo.txId,
        index: +utxo.outputIndex,
        redeemScript: redeem,
        witnessUtxo: {
          value: utxo.satoshis,
          script: bitcoin.script.compile([
            bitcoin.opcodes.OP_HASH160,
            bitcoin.crypto.hash160(redeem),
            bitcoin.opcodes.OP_EQUAL,
          ]),
        },
      })
      break
    }
    case 1: // native P2WPKH
    case 3: // P2TR
    default: {
      psbt.addInput({
        hash: utxo.txId,
        index: +utxo.outputIndex,
        witnessUtxo: {
          value: utxo.satoshis,
          script: Buffer.from(utxo.scriptPk, 'hex'),
        },
      })
    }
  }
}


export const actualDeployCommitFee = async ({
  payload,
  tweakedPublicKey,
  utxos,
  account,
  provider,
  feeRate,
  protostone,
  frontendFee,
  feeAddress,
}: {
  payload: AlkanesPayload
  tweakedPublicKey: string
  utxos: FormattedUtxo[]
  account: Account
  provider: Provider
  feeRate?: number
  protostone: Buffer
  frontendFee?: bigint
  feeAddress?: string
}) => {
  if (!feeRate) {
    feeRate = (await provider.esplora.getFeeEstimates())['1']
  }

  const { psbt, script } = await createDeployCommitPsbt({
    payload,
    utxos,
    tweakedPublicKey,
    account,
    provider,
    feeRate,
    frontendFee,
    feeAddress,
  })

  const { fee: estimatedFee } = await getEstimatedFee({
    feeRate,
    psbt,
    provider,
  })

  const { psbt: finalPsbt } = await createDeployCommitPsbt({
    payload,
    utxos,
    tweakedPublicKey,
    account,
    provider,
    feeRate,
    fee: estimatedFee,
    frontendFee,
    feeAddress,
  })

  const { fee: finalFee, vsize } = await getEstimatedFee({
    feeRate,
    psbt: finalPsbt,
    provider,
  })

  const wasmDeploySize = Math.ceil(getVSize(Buffer.from(payload.body)) * feeRate);
  const deployRevealFee = finalFee + wasmDeploySize * 2 + 546; //very conservative value for deployRevealFee. the excess will be refunded

  return { fee: finalFee, deployRevealFee, vsize }
}


export const createDeployCommitPsbt = async ({
  payload,
  utxos,
  tweakedPublicKey,
  account,
  provider,
  feeRate,
  fee,
  deployRevealFee,
  frontendFee,
  feeAddress,
}: {
  payload: AlkanesPayload
  utxos: FormattedUtxo[]
  tweakedPublicKey: string
  account: Account
  provider: Provider
  feeRate?: number
  fee?: number
  deployRevealFee?: number
  frontendFee?: bigint
  feeAddress?: string
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

    if (frontendFee && !feeAddress) {
      throw new Error('feeAddress required when frontendFee is set')
    }
    const MIN_RELAY = 546n
    const feeSatEffective: bigint =
      frontendFee && frontendFee >= MIN_RELAY ? frontendFee : 0n

    const totalSpendableUtxos = selectSpendableUtxos(utxos, account.spendStrategy)

    const minFee = minimumFee({
      taprootInputCount: 2,
      nonTaprootInputCount: 0,
      outputCount: 2 + (feeSatEffective > 0n ? 1 : 0),
    })
    const calculatedFee = minFee * feeRate < 250 ? 250 : Math.ceil(minFee * feeRate)
    let commitFee = fee ? fee : calculatedFee

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

    const wasmDeploySize = Math.ceil(getVSize(Buffer.from(payload.body)) * feeRate)
    let revealTxFee = deployRevealFee ? deployRevealFee + inscriptionSats : commitFee + wasmDeploySize + inscriptionSats;
    let totalFee = revealTxFee + commitFee + Number(feeSatEffective);
    let gatheredUtxos = findXAmountOfSats(
      totalSpendableUtxos.utxos,
      totalFee
    )

    if (!fee && gatheredUtxos.utxos.length > 1) {
      const txSize = minimumFee({
        taprootInputCount: gatheredUtxos.utxos.length,
        nonTaprootInputCount: 0,
        outputCount: 2 + (feeSatEffective > 0n ? 1 : 0),
      })
      commitFee = txSize * feeRate < 250 ? 250 : Math.ceil(txSize * feeRate)
      revealTxFee = deployRevealFee ? deployRevealFee + inscriptionSats : commitFee + wasmDeploySize + inscriptionSats;
      totalFee = commitFee + revealTxFee + Number(feeSatEffective);

      if (gatheredUtxos.totalAmount < commitFee) {
        gatheredUtxos = findXAmountOfSats(
          totalSpendableUtxos.utxos,
          totalFee
        )
      }
    }

    if (
      gatheredUtxos.totalAmount <
      totalFee
    ) {
      throw new OylTransactionError(Error('Insufficient Balance'))
    }

    await addInputUtxosToPsbt(gatheredUtxos.utxos, psbt, account, provider);
    psbt.addOutput({
      value: revealTxFee,
      address: inscriberInfo.address,
    })

    if (feeSatEffective > 0n) {
      psbt.addOutput({
        address: feeAddress!,
        value: Number(feeSatEffective),
      })
    }

    const changeAmount =
      gatheredUtxos.totalAmount - totalFee

    if (changeAmount >= 546) {
      psbt.addOutput({
        address: account[account.spendStrategy.changeAddress].address,
        value: changeAmount,
      })
    }

    const formattedPsbtTx = await formatInputsToSign({
      _psbt: psbt,
      senderPublicKey: alkanesPubkey,
      network: provider.network,
    })

    return { psbt: formattedPsbtTx.toBase64(), script }
  } catch (error) {
    throw new OylTransactionError(error)
  }
}

export const deployCommit = async ({
  payload,
  utxos,
  account,
  provider,
  feeRate,
  signer,
  protostone,
  frontendFee,
  feeAddress,
}: {
  payload: AlkanesPayload
  utxos: FormattedUtxo[]
  account: Account
  provider: Provider
  feeRate?: number
  signer: Signer
  protostone: Buffer
  frontendFee?: bigint
  feeAddress?: string
}) => {
  const tweakedTaprootKeyPair: bitcoin.Signer = tweakSigner(
    signer.taprootKeyPair,
    {
      network: provider.network,
    }
  )

  const tweakedPublicKey = tweakedTaprootKeyPair.publicKey.toString('hex')

  const { fee: commitFee, deployRevealFee } = await actualDeployCommitFee({
    payload,
    utxos,
    tweakedPublicKey,
    account,
    provider,
    feeRate,
    protostone,
    frontendFee,
    feeAddress,
  });

  const { psbt: finalPsbt, script } = await createDeployCommitPsbt({
    payload,
    utxos,
    tweakedPublicKey,
    account,
    provider,
    feeRate,
    fee: commitFee,
    deployRevealFee,
    frontendFee,
    feeAddress,
  });

  const { signedPsbt } = await signer.signAllInputs({
    rawPsbt: finalPsbt,
    finalize: true,
  })

  const result = await provider.pushPsbt({
    psbtBase64: signedPsbt,
  })

  return { ...result, script: script.toString('hex'), commitPsbt: signedPsbt }
}

export const deployReveal = async ({
  payload,
  alkanesUtxos,
  utxos,
  protostone,
  commitTxId,
  script,
  account,
  provider,
  feeRate,
  signer,
  commitPsbt,
}: {
  payload: AlkanesPayload
  alkanesUtxos?: FormattedUtxo[]
  utxos: FormattedUtxo[]
  protostone: Buffer
  commitTxId: string
  script: string
  account: Account
  provider: Provider
  feeRate?: number
  signer: Signer
  commitPsbt?: bitcoin.Psbt
}) => {
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

  const tweakedTaprootKeyPair: bitcoin.Signer = tweakSigner(
    signer.taprootKeyPair,
    {
      network: provider.network,
    }
  )

  const tweakedPublicKey = tweakedTaprootKeyPair.publicKey.toString('hex')

  const { fee } = await actualTransactRevealFee({
    payload,
    alkanesUtxos,
    utxos,
    protostone,
    tweakedPublicKey,
    receiverAddress: alkanesAddress,
    commitTxId,
    commitPsbt,
    script: Buffer.from(script, 'hex'),
    provider,
    feeRate,
    account,
  })

  const { psbt: finalRevealPsbt } = await createTransactReveal({
    payload,
    alkanesUtxos,
    utxos,
    protostone,
    tweakedPublicKey,
    receiverAddress: alkanesAddress,
    commitTxId,
    commitPsbt,
    script: Buffer.from(script, 'hex'),
    provider,
    feeRate,
    fee,
    account,
  })

  let finalReveal = bitcoin.Psbt.fromBase64(finalRevealPsbt, {
    network: provider.network,
  });
  finalReveal.signInput(0, tweakedTaprootKeyPair);
  finalReveal.finalizeInput(0);
  let finalPsbtBase64;
  if (finalReveal.inputCount > 1) {
    const { signedPsbt } = await signer.signAllInputs({
      rawPsbt: finalReveal.toBase64(),
      finalize: true,
    })
    finalPsbtBase64 = signedPsbt;
  } else {
    finalPsbtBase64 = finalReveal.toBase64();
  }

  const revealResult = await provider.pushPsbt({
    psbtBase64: finalPsbtBase64,
  })

  return revealResult
}

export const actualTransactRevealFee = async ({
  payload,
  alkanesUtxos,
  utxos,
  protostone,
  tweakedPublicKey,
  commitTxId,
  commitPsbt,
  receiverAddress,
  script,
  provider,
  feeRate,
  account,
  frbtcWrapPsbt,
}: {
  payload: AlkanesPayload
  alkanesUtxos?: FormattedUtxo[]
  utxos: FormattedUtxo[]
  protostone: Buffer
  tweakedPublicKey: string
  commitTxId: string
  commitPsbt: bitcoin.Psbt
  receiverAddress: string
  script: Buffer
  provider: Provider
  feeRate?: number
  account: Account
  frbtcWrapPsbt?: bitcoin.Psbt
}) => {
  if (!feeRate) {
    feeRate = (await provider.esplora.getFeeEstimates())['1']
  }

  const { psbt } = await createTransactReveal({
    payload,
    alkanesUtxos,
    utxos,
    protostone,
    commitTxId,
    commitPsbt,
    receiverAddress,
    script,
    tweakedPublicKey,
    provider,
    feeRate,
    account,
    frbtcWrapPsbt,
  })

  const { fee: estimatedFee } = await getEstimatedFee({
    feeRate,
    psbt,
    provider,
  })

  const { psbt: finalPsbt } = await createTransactReveal({
    payload,
    alkanesUtxos,
    utxos,
    protostone,
    commitTxId,
    commitPsbt,
    receiverAddress,
    script,
    tweakedPublicKey,
    provider,
    feeRate,
    fee: estimatedFee,
    account,
    frbtcWrapPsbt,
  })

  const { fee: finalFee, vsize } = await getEstimatedFee({
    feeRate,
    psbt: finalPsbt,
    provider,
  })

  return { fee: finalFee, vsize }
}

export const actualExecuteFee = async ({
  alkanesUtxos,
  utxos,
  account,
  protostone,
  provider,
  feeRate,
  frontendFee,
  feeAddress,
  frbtcWrapPsbt,
}: {
  alkanesUtxos?: FormattedUtxo[]
  utxos: FormattedUtxo[]
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate: number
  frontendFee?: bigint
  feeAddress?: string
  frbtcWrapPsbt?: bitcoin.Psbt
}) => {
  const { psbt } = await createExecutePsbt({
    alkanesUtxos,
    frontendFee,
    feeAddress,
    utxos,
    account,
    protostone,
    provider,
    feeRate,
    frbtcWrapPsbt,
  })

  const { fee: estimatedFee } = await getEstimatedFee({
    feeRate,
    psbt,
    provider,
  })

  const { psbt: finalPsbt } = await createExecutePsbt({
    alkanesUtxos,
    frontendFee,
    feeAddress,
    utxos,
    account,
    protostone,
    provider,
    feeRate,
    fee: estimatedFee,
    frbtcWrapPsbt,
  })

  const { fee: finalFee, vsize } = await getEstimatedFee({
    feeRate,
    psbt: finalPsbt,
    provider,
  })

  return { fee: finalFee, vsize }
}

export const executePsbt = async ({
  alkanesUtxos,
  utxos,
  account,
  protostone,
  provider,
  feeRate,
  frontendFee,
  feeAddress,
  frbtcWrapPsbt,
}: {
  alkanesUtxos?: FormattedUtxo[]
  utxos: FormattedUtxo[]
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate?: number
  frontendFee?: bigint
  feeAddress?: string
  frbtcWrapPsbt?: bitcoin.Psbt
}) => {
  const { fee } = await actualExecuteFee({
    alkanesUtxos,
    frontendFee,
    feeAddress,
    utxos,
    account,
    protostone,
    provider,
    feeRate,
    frbtcWrapPsbt,
  })

  const { psbt: finalPsbt } = await createExecutePsbt({
    alkanesUtxos,
    frontendFee,
    feeAddress,
    utxos,
    account,
    protostone,
    provider,
    feeRate,
    fee,
    frbtcWrapPsbt,
  })

  return { psbt: finalPsbt, fee }
}

// NOTE: ASSUMES RUNES, ALKANES, ETC ARE ON OUTPUTS OF VALUE 546
// WILL POTENTIALLY BURN RUNES, ALKANES, ETC IF THEY ARE NOT ON VALUE 546
const getRemainingUtxosAfterPsbt = ({
  psbt,
  alkanesUtxos,
  utxos,
  account,
  network
}: {
  psbt?: bitcoin.Psbt,
  utxos: FormattedUtxo[],
  alkanesUtxos?: FormattedUtxo[],
  account: Account,
  network: bitcoin.networks.Network
}) => {
  if (!psbt) {
    return { remainingUtxos: utxos, remainingAlkanesUtxos: alkanesUtxos };
  }
  const spentUtxos = psbt.txInputs.map((input) => ({
    txId: toTxId(input.hash.toString('hex')),
    outputIndex: input.index,
  }))
  let remainingUtxos = utxos.filter(
    (utxo) =>
      !spentUtxos.some(
        (spent) =>
          spent.txId === utxo.txId &&
          spent.outputIndex === Number(utxo.outputIndex)
      )
  )
  let remainingAlkanesUtxos = alkanesUtxos;

  if (alkanesUtxos) {
    remainingAlkanesUtxos = alkanesUtxos.filter(
      utxo => !spentUtxos.some(spent => spent.txId === utxo.txId && spent.outputIndex === Number(utxo.outputIndex))
    );
  }

  const txId = getUnfinalizedPsbtTxId(psbt)
  const spendableAddresses = [
    account.nativeSegwit?.address,
    account.taproot?.address,
    account.nestedSegwit?.address,
    account.legacy?.address,
  ].filter(Boolean)

  psbt.txOutputs.forEach((output, index) => {
    try {
      const address = bitcoin.address.fromOutputScript(output.script, network)
      if (spendableAddresses.includes(address) && output.value != 546) {
        remainingUtxos.push({
          txId,
          outputIndex: index,
          satoshis: output.value,
          scriptPk: output.script.toString('hex'),
          address,
          inscriptions: [],
          runes: {},
          alkanes: {},
          confirmations: 0,
          indexed: true, // technically not indexed but it can be used in future txs
        })
      }
    } catch (e) {
      // Ignore outputs that don't have a valid address
    }
  })

  return { remainingUtxos, remainingAlkanesUtxos };
}

export const executeWithBtcWrapUnwrap = async ({
  alkanesUtxos,
  utxos,
  account,
  calldata,
  provider,
  feeRate,
  signer,
  frontendFee,
  feeAddress,
  frbtcWrapAmount,
  frbtcUnwrapAmount,
  addDieselMint,
}: {
  alkanesUtxos?: FormattedUtxo[]
  utxos: FormattedUtxo[]
  account: Account
  calldata: bigint[]
  provider: Provider
  feeRate?: number
  signer: Signer
  frontendFee?: bigint
  feeAddress?: string
  frbtcWrapAmount?: number
  frbtcUnwrapAmount?: number
  addDieselMint?: boolean
}) => {
  let frbtcWrapPsbt;

  if (frbtcWrapAmount) {
    const { psbt } = await wrapBtcNoSigning({
      utxos,
      account,
      provider,
      feeRate,
      wrapAmount: frbtcWrapAmount,
      addDieselMint,
    })
    frbtcWrapPsbt = bitcoin.Psbt.fromBase64(psbt, {
      network: provider.network,
    });
  }
  const { remainingUtxos, remainingAlkanesUtxos } = getRemainingUtxosAfterPsbt({
    psbt: frbtcWrapPsbt,
    utxos,
    alkanesUtxos,
    account,
    network: provider.network
  })

  let protostone = encodeRunestoneProtostone({
    protostones: [
      ProtoStone.message({
        protocolTag: 1n,
        edicts: [],
        pointer: 0,
        refundPointer: 0,
        calldata: encipher(calldata),
      }),
      ...(addDieselMint ? [DIESEL_MINT_PROTOSTONE] : [])
    ],
  }).encodedRunestone;
  return await execute({
    alkanesUtxos: remainingAlkanesUtxos,
    utxos: remainingUtxos,
    account,
    protostone,
    provider,
    feeRate,
    signer,
    frontendFee,
    feeAddress,
    frbtcWrapPsbt,
    frbtcUnwrapAmount,
  });
}

export const execute = async ({
  alkanesUtxos,
  utxos,
  account,
  protostone,
  provider,
  feeRate,
  signer,
  frontendFee,
  feeAddress,
  frbtcWrapPsbt,
  frbtcUnwrapAmount,
}: {
  alkanesUtxos?: FormattedUtxo[]
  utxos: FormattedUtxo[]
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate?: number
  signer: Signer
  frontendFee?: bigint
  feeAddress?: string
  frbtcWrapPsbt?: bitcoin.Psbt
  frbtcUnwrapAmount?: number
}) => {
  const { fee } = await actualExecuteFee({
    alkanesUtxos,
    frontendFee,
    feeAddress,
    utxos,
    account,
    protostone,
    provider,
    feeRate,
    frbtcWrapPsbt,
  })

  const { psbt: finalPsbt } = await createExecutePsbt({
    alkanesUtxos,
    frontendFee,
    feeAddress,
    utxos,
    account,
    protostone,
    provider,
    feeRate,
    fee,
    frbtcWrapPsbt,
  })

  let frbtcUnwrapPsbt;

  if (frbtcUnwrapAmount) {
    const executePsbt = bitcoin.Psbt.fromBase64(finalPsbt, {
      network: provider.network,
    });
    const { remainingUtxos } = getRemainingUtxosAfterPsbt({
      psbt: executePsbt,
      utxos,
      account,
      network: provider.network
    })

    const frbtcUtxo: FormattedUtxo[] = [{
      txId: getUnfinalizedPsbtTxId(executePsbt),
      outputIndex: 0,
      satoshis: 546,
      scriptPk: executePsbt.txOutputs[0].script.toString('hex'),
      address: bitcoin.address.fromOutputScript(executePsbt.txOutputs[0].script, provider.network),
      inscriptions: [],
      runes: {},
      alkanes: {}, // there is the frbtc alkane but this doesn't need to be specified since this is just added directly as an input
      confirmations: 0,
      indexed: true, // technically not indexed but it can be used in future txs
    }]

    const { psbt } = await unwrapBtcNoSigning({
      alkaneUtxos: frbtcUtxo,
      utxos: remainingUtxos,
      account,
      provider,
      feeRate,
      unwrapAmount: BigInt(frbtcUnwrapAmount),
    })
    frbtcUnwrapPsbt = bitcoin.Psbt.fromBase64(psbt, {
      network: provider.network,
    });
  }

  let rawPsbtsToSign = [finalPsbt];
  if (frbtcWrapPsbt) {
    rawPsbtsToSign.unshift(frbtcWrapPsbt.toBase64());
  }
  if (frbtcUnwrapPsbt) {
    rawPsbtsToSign.push(frbtcUnwrapPsbt.toBase64());
  }

  const signedPsbts = await signer.signAllInputsMultiplePsbts({
    rawPsbts: rawPsbtsToSign,
    finalize: true,
  })
  console.log("signedPsbts", signedPsbts)

  let frbtcWrapResult;
  let executeResult;
  let frbtcUnwrapResult;

  if (frbtcWrapPsbt) {
    frbtcWrapResult = await provider.pushPsbt({
      psbtBase64: signedPsbts[0].signedPsbt,
    })
    console.log("frbtcWrapResult", frbtcWrapResult);
    executeResult = await provider.pushPsbt({
      psbtBase64: signedPsbts[1].signedPsbt,
    })
    console.log("executeResult", executeResult);
  } else {
    executeResult = await provider.pushPsbt({
      psbtBase64: signedPsbts[0].signedPsbt,
    })
    console.log("executeResult", executeResult);
  }

  if (frbtcUnwrapPsbt) {
    frbtcUnwrapResult = await provider.pushPsbt({
      psbtBase64: signedPsbts.at(-1).signedPsbt,
    })
    console.log("unwrap result ", frbtcUnwrapResult);
  }

  return { frbtcWrapResult, executeResult, frbtcUnwrapResult };
}

export const actualWrapBtcFee = async ({
  alkanesUtxos,
  utxos,
  account,
  protostone,
  provider,
  feeRate,
  wrapAmount,
}: {
  alkanesUtxos?: FormattedUtxo[]
  utxos: FormattedUtxo[]
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate: number
  wrapAmount: number
}) => {
  const { psbt } = await createWrapBtcPsbt({
    alkanesUtxos,
    utxos,
    account,
    protostone,
    provider,
    feeRate,
    wrapAmount,
  })

  const { fee: estimatedFee } = await getEstimatedFee({
    feeRate,
    psbt,
    provider,
  })

  const { psbt: finalPsbt } = await createWrapBtcPsbt({
    alkanesUtxos,
    utxos,
    account,
    protostone,
    provider,
    feeRate,
    fee: estimatedFee,
    wrapAmount,
  })

  const { fee: finalFee, vsize } = await getEstimatedFee({
    feeRate,
    psbt: finalPsbt,
    provider,
  })

  return { fee: finalFee, vsize }
}

export const wrapBtcNoSigning = async ({
  alkanesUtxos,
  utxos,
  account,
  provider,
  feeRate,
  wrapAmount,
  addDieselMint,
}: {
  alkanesUtxos?: FormattedUtxo[]
  utxos: FormattedUtxo[]
  account: Account
  provider: Provider
  feeRate?: number
  wrapAmount: number
  addDieselMint?: boolean
}) => {
  const calldata: bigint[] = [32n, 0n, 77n]

  const protostone: Buffer = encodeRunestoneProtostone({
    protostones: [
      ProtoStone.message({
        protocolTag: 1n,
        edicts: [],
        pointer: 0,
        refundPointer: 0,
        calldata: encipher(calldata),
      }),
      ...(addDieselMint ? [DIESEL_MINT_PROTOSTONE] : [])
    ],
  }).encodedRunestone
  const { fee } = await actualWrapBtcFee({
    alkanesUtxos,
    utxos,
    account,
    protostone,
    provider,
    feeRate,
    wrapAmount,
  })

  return await createWrapBtcPsbt({
    alkanesUtxos,
    utxos,
    account,
    protostone,
    provider,
    feeRate,
    fee,
    wrapAmount,
  })
}

export const wrapBtc = async ({
  alkanesUtxos,
  utxos,
  account,
  provider,
  feeRate,
  signer,
  wrapAmount,
}: {
  alkanesUtxos?: FormattedUtxo[]
  utxos: FormattedUtxo[]
  account: Account
  provider: Provider
  feeRate?: number
  signer: Signer
  wrapAmount: number
}) => {
  const { psbt: finalPsbt } = await wrapBtcNoSigning({
    alkanesUtxos,
    utxos,
    account,
    provider,
    feeRate,
    wrapAmount,
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
  payload,
  alkanesUtxos,
  utxos,
  protostone,
  receiverAddress,
  script,
  feeRate,
  tweakedPublicKey,
  provider,
  fee = 0,
  commitTxId,
  commitPsbt,
  account,
  frbtcWrapPsbt,
}: {
  payload: AlkanesPayload
  alkanesUtxos?: FormattedUtxo[]
  utxos: FormattedUtxo[]
  protostone: Buffer
  receiverAddress: string
  script: Buffer
  feeRate: number
  tweakedPublicKey: string
  provider: Provider
  fee?: number
  commitTxId: string
  commitPsbt: bitcoin.Psbt
  account: Account
  frbtcWrapPsbt?: bitcoin.Psbt
}) => {
  try {
    if (!feeRate) {
      feeRate = (await provider.esplora.getFeeEstimates())['1']
    }

    const psbt: bitcoin.Psbt = new bitcoin.Psbt({ network: provider.network })

    const minFee = minimumFee({
      taprootInputCount: (frbtcWrapPsbt ? 2 : 1) + (alkanesUtxos ? alkanesUtxos.length : 0),
      nonTaprootInputCount: 0,
      outputCount: 2,
      payload
    })

    const revealTxBaseFee = minFee * feeRate < 250 ? 250 : Math.ceil(minFee * feeRate)
    let revealTxFee = fee === 0 ? revealTxBaseFee : fee
    const commitTxOutput = commitPsbt.txOutputs[0]

    if (!commitTxOutput) {
      throw new OylTransactionError(new Error('Error getting commit transaction output'))
    }

    const p2pk_redeem = { output: script }

    const { output, witness } = bitcoin.payments.p2tr({
      internalPubkey: toXOnly(Buffer.from(tweakedPublicKey, 'hex')),
      scriptTree: p2pk_redeem,
      redeem: p2pk_redeem,
      network: provider.network,
    })

    // this needs to be the first input
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

    if (frbtcWrapPsbt) {
      addFrBtcWrapOutToPsbt({ frbtcWrapPsbt, account, psbt });
    }

    let gatheredUtxos = {
      utxos: [],
      totalAmount: 0,
    }
    if (commitTxOutput.value < revealTxFee + 546) {
      gatheredUtxos = findXAmountOfSats(
        [...utxos],
        revealTxFee + 546 - commitTxOutput.value
      )
    }
    for (const utxo of gatheredUtxos.utxos) {
      await addInputForUtxo(psbt, utxo, account, provider)
    }
    if (alkanesUtxos) {
      for (const utxo of alkanesUtxos) {
        await addInputForUtxo(psbt, utxo, account, provider)
        await formatInputToSign({
          v: psbt.data.inputs[psbt.data.inputs.length - 1],
          senderPublicKey: account.taproot.pubkey,
          network: provider.network
        });
      }
    }

    psbt.addOutput({
      value: 546,
      address: receiverAddress,
    })

    psbt.addOutput({
      value: 0,
      script: protostone,
    })

    const totalAlkanesAmount = alkanesUtxos
      ? alkanesUtxos.reduce((acc, utxo) => acc + utxo.satoshis, 0)
      : 0;
    const change =
      commitTxOutput.value + totalAlkanesAmount + gatheredUtxos.totalAmount - revealTxFee - 550;
    if (change > 546) {
      psbt.addOutput({
        value: change,
        address: receiverAddress,
      })
    }

    return {
      psbt: psbt.toBase64(),
      fee: revealTxFee,
    }
  } catch (error) {
    throw new OylTransactionError(error)
  }
}

export const toTxId = (rawLeTxid: string) =>
  Buffer.from(rawLeTxid, 'hex').reverse().toString('hex')

export const toAlkaneId = (item: string) => {
  const [block, tx, amount] = item.split(':').map((part) => part.trim())
  if (!block || !tx || !amount) {
    throw new Error('Invalid format for --alkanes. Expected format is block:tx:amount.')
  }
  return {
    alkaneId: { block, tx },
    amount: Number(amount)
  }
}

export { p2tr_ord_reveal }

export const inscribePayloadBulk = async ({
  alkanesUtxos,
  payload,
  utxos,
  account,
  protostone,
  provider,
  feeRate,
  signer,
  frontendFee,
  feeAddress,
  frbtcWrapPsbt,
}: {
  alkanesUtxos?: FormattedUtxo[]
  payload: AlkanesPayload
  utxos: FormattedUtxo[]
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate?: number
  signer: Signer
  frontendFee?: bigint
  feeAddress?: string
  frbtcWrapPsbt?: bitcoin.Psbt
}) => {
  const tweakedTaprootKeyPair: bitcoin.Signer = tweakSigner(
    signer.taprootKeyPair,
    {
      network: provider.network,
    }
  )
  const tweakedPublicKey = tweakedTaprootKeyPair.publicKey.toString('hex')

  const { fee: commitFee, deployRevealFee } = await actualDeployCommitFee({
    payload,
    utxos,
    tweakedPublicKey,
    account,
    provider,
    feeRate,
    protostone,
    frontendFee,
    feeAddress,
  });

  const { psbt: commitPsbtBase64, script } = await createDeployCommitPsbt({
    payload,
    utxos,
    tweakedPublicKey,
    account,
    provider,
    feeRate,
    fee: commitFee,
    deployRevealFee,
    frontendFee,
    feeAddress,
  });

  const commitPsbt = bitcoin.Psbt.fromBase64(commitPsbtBase64, { network: provider.network });

  for (const input of commitPsbt.data.inputs) {
    if (input.nonWitnessUtxo) {
      throw new OylTransactionError(
        Error('inscribePayloadBulk does not support legacy inputs. Please use SegWit or Taproot inputs.')
      );
    }
  }

  const commitTxId = getUnfinalizedPsbtTxId(commitPsbt)

  let alkanesAddress: string;
  if (account.taproot) {
    alkanesAddress = account.taproot.address;
  } else if (account.nativeSegwit) {
    alkanesAddress = account.nativeSegwit.address;
  } else {
    throw new Error('No taproot or nativeSegwit address found')
  }

  const { fee: revealFee } = await actualTransactRevealFee({
    payload,
    alkanesUtxos,
    utxos,
    protostone,
    tweakedPublicKey,
    receiverAddress: alkanesAddress,
    commitTxId,
    commitPsbt,
    script: script,
    provider,
    feeRate,
    account,
    frbtcWrapPsbt,
  })

  const { psbt: finalRevealPsbt } = await createTransactReveal({
    payload,
    alkanesUtxos,
    utxos,
    protostone,
    tweakedPublicKey,
    receiverAddress: alkanesAddress,
    commitTxId,
    commitPsbt,
    script: script,
    provider,
    feeRate,
    fee: revealFee,
    account,
    frbtcWrapPsbt,
  })

  let finalReveal = bitcoin.Psbt.fromBase64(finalRevealPsbt, {
    network: provider.network,
  });
  finalReveal.signInput(0, tweakedTaprootKeyPair);
  finalReveal.finalizeInput(0);
  let rawPsbtsToSign = [commitPsbtBase64];
  if (frbtcWrapPsbt) {
    rawPsbtsToSign.unshift(frbtcWrapPsbt.toBase64());
  }
  if (finalReveal.inputCount > 1) {
    rawPsbtsToSign.push(finalReveal.toBase64());
  }


  const signedPsbts = await signer.signAllInputsMultiplePsbts({
    rawPsbts: rawPsbtsToSign,
    finalize: true,
  })

  const signedRevealTx = finalReveal.inputCount > 1 ? signedPsbts.at(-1).signedPsbt : finalReveal.toBase64();
  let commitResult, frbtcWrapResult, frbtcUnwrapResult;
  if (frbtcWrapPsbt) {
    frbtcWrapResult = await provider.pushPsbt({ psbtBase64: signedPsbts[0].signedPsbt })
    console.log("frbtcWrapResult", frbtcWrapResult);
    commitResult = await provider.pushPsbt({ psbtBase64: signedPsbts[1].signedPsbt })
  } else {
    commitResult = await provider.pushPsbt({ psbtBase64: signedPsbts[0].signedPsbt })
  }
  console.log("commitResult", commitResult);
  const executeResult = await provider.pushPsbt({ psbtBase64: signedRevealTx })
  console.log("executeResult", executeResult);
  if (commitResult.txId != commitTxId) {
    throw new OylTransactionError(
      Error('Pre-calculated txid does not match broadcasted txid')
    );
  }
  return { frbtcWrapResult, executeResult, commitResult, frbtcUnwrapResult }
}
