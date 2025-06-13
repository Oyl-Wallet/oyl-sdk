import * as bitcoin from 'bitcoinjs-lib'
import ECPairFactory from 'ecpair'
import ecc from '@bitcoinerlab/secp256k1'
import {
  AddressType,
  DecodedCBOR,
  IBlockchainInfoUTXO,
  Network,
  RuneUtxo,
  ToSignInput,
  TxInput,
  UnspentOutput,
} from './interface'
import BigNumber from 'bignumber.js'
import { maximumScriptBytes } from './constants'
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371'
import { SandshrewBitcoinClient } from '../rpclient/sandshrew'
import { EsploraRpc } from '../rpclient/esplora'
import { Provider } from '../provider/provider'
import { addressFormats } from '@sadoprotocol/ordit-sdk'
import { encodeRunestone, RunestoneSpec } from '@magiceden-oss/runestone-lib'
import { AddressKey } from '@account/account'
import * as CBOR from 'cbor-x'
import { FormattedUtxo } from '../utxo'

bitcoin.initEccLib(ecc)

export interface IBISWalletIx {
  validity: any
  isBrc: boolean
  isSns: boolean
  name: any
  amount: any
  isValidTransfer: any
  operation: any
  ticker: any
  isJson: boolean
  content?: string
  inscription_name: any
  inscription_id: string
  inscription_number: number
  metadata: any
  owner_wallet_addr: string
  mime_type: string
  last_sale_price: any
  slug: any
  collection_name: any
  content_url: string
  bis_url: string

  wallet?: string
  media_length?: number
  genesis_ts?: number
  genesis_height?: number
  genesis_fee?: number
  output_value?: number
  satpoint?: string
  collection_slug?: string
  confirmations?: number
}

export const addressTypeMap = { 0: 'p2pkh', 1: 'p2tr', 2: 'p2sh', 3: 'p2wpkh' }
export const inscriptionSats = 330

export const ECPair = ECPairFactory(ecc)

export const assertHex = (pubKey: Buffer) =>
  pubKey.length === 32 ? pubKey : pubKey.slice(1, 33)

function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
  return bitcoin.crypto.taggedHash(
    'TapTweak',
    Buffer.concat(h ? [pubKey, h] : [pubKey])
  )
}

export function getNetwork(value: Network): bitcoin.Network {
  if (value === 'mainnet') {
    return bitcoin.networks['bitcoin']
  }

  if (value === 'signet') {
    return bitcoin.networks['testnet']
  }

  return bitcoin.networks[value]
}

export async function getFee({
  provider,
  psbt,
  feeRate,
}: {
  provider: Provider
  psbt: string
  feeRate: number
}) {
  let rawPsbt = bitcoin.Psbt.fromBase64(psbt, {
    network: provider.network,
  })

  const signedHexPsbt = rawPsbt.extractTransaction().toHex()
  const tx = await provider.sandshrew.bitcoindRpc.testMemPoolAccept([
    signedHexPsbt,
  ])
  const vsize = tx[0].vsize

  const accurateFee = vsize * feeRate
  return accurateFee
}

export function tweakSigner(
  signer: bitcoin.Signer,
  opts: any = {}
): bitcoin.Signer {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let privateKey: Uint8Array | undefined = signer.privateKey!
  if (!privateKey) {
    throw new Error('Private key required')
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey)
  }

  const tweakedPrivateKey = ecc.privateAdd(
    privateKey,
    tapTweakHash(assertHex(signer.publicKey), opts.tweakHash)
  )
  if (!tweakedPrivateKey) {
    throw new Error('Invalid tweaked private key!')
  }

  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  })
}

export function satoshisToAmount(val: number) {
  const num = new BigNumber(val)
  return num.dividedBy(100000000).toFixed(8)
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function amountToSatoshis(val: any) {
  const num = new BigNumber(val)
  return num.multipliedBy(100000000).toNumber()
}

export const validator = (
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer
): boolean => ECPair.fromPublicKey(pubkey).verify(msghash, signature)

export function utxoToInput(utxo: UnspentOutput, publicKey: Buffer): TxInput {
  let data
  switch (utxo.addressType) {
    case AddressType.P2TR:
      data = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        witnessUtxo: {
          value: utxo.satoshis,
          script: Buffer.from(utxo.scriptPk, 'hex'),
        },
        tapInternalKey: assertHex(publicKey),
      }
      return {
        data,
        utxo,
      }

    case AddressType.P2WPKH:
      data = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        witnessUtxo: {
          value: utxo.satoshis,
          script: Buffer.from(utxo.scriptPk, 'hex'),
        },
      }
      return {
        data,
        utxo,
      }

    case AddressType.P2PKH:
      data = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        witnessUtxo: {
          value: utxo.satoshis,
          script: Buffer.from(utxo.scriptPk, 'hex'),
        },
      }
      return {
        data,
        utxo,
      }

    case AddressType.P2SH_P2WPKH:
      const redeemData = bitcoin.payments.p2wpkh({ pubkey: publicKey })
      data = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        witnessUtxo: {
          value: utxo.satoshis,
          script: Buffer.from(utxo.scriptPk, 'hex'),
        },
        redeemScript: redeemData.output,
      }
      return {
        data,
        utxo,
      }

    default:
      data = {
        hash: '',
        index: 0,
        witnessUtxo: {
          value: 0,
          script: Buffer.from(utxo.scriptPk, 'hex'),
        },
      }
      return {
        data,
        utxo,
      }
  }
}

export const getWitnessDataChunk = function (
  content: string,
  encodeType: BufferEncoding = 'utf8'
) {
  const buffered = Buffer.from(content, encodeType)
  const contentChunks: Buffer[] = []
  let chunks = 0

  while (chunks < buffered.byteLength) {
    const split = buffered.subarray(chunks, chunks + maximumScriptBytes)
    chunks += split.byteLength
    contentChunks.push(split)
  }

  return contentChunks
}

export function calculateAmountGathered(utxoArray: IBlockchainInfoUTXO[]) {
  return utxoArray?.reduce((prev, currentValue) => prev + currentValue.value, 0)
}

export function calculateAmountGatheredUtxo(utxoArray: FormattedUtxo[]) {
  return utxoArray?.reduce(
    (prev, currentValue) => prev + currentValue.satoshis,
    0
  )
}

export const formatInputsToSign = async ({
  _psbt,
  senderPublicKey,
  network,
}: {
  _psbt: bitcoin.Psbt
  senderPublicKey: string
  network: bitcoin.Network
}) => {
  let index = 0
  for await (const v of _psbt.data.inputs) {
    const isSigned = v.finalScriptSig || v.finalScriptWitness
    const lostInternalPubkey = !v.tapInternalKey
    if (!isSigned || lostInternalPubkey) {
      const tapInternalKey = toXOnly(Buffer.from(senderPublicKey, 'hex'))
      const p2tr = bitcoin.payments.p2tr({
        internalPubkey: tapInternalKey,
        network: network,
      })
      if (
        v.witnessUtxo?.script.toString('hex') === p2tr.output?.toString('hex')
      ) {
        v.tapInternalKey = tapInternalKey
      }
    }
    index++
  }

  return _psbt
}

export const timeout = async (n) =>
  await new Promise((resolve) => setTimeout(resolve, n))

export const signInputs = async (
  psbt: bitcoin.Psbt,
  toSignInputs: ToSignInput[],
  taprootPubkey: string,
  segwitPubKey: string,
  segwitSigner: any,
  taprootSigner: any
) => {
  const taprootInputs: ToSignInput[] = []
  const segwitInputs: ToSignInput[] = []
  const inputs = psbt.data.inputs
  toSignInputs.forEach(({ publicKey }, i) => {
    const input = inputs[i]
    if (publicKey === taprootPubkey && !input.finalScriptWitness) {
      taprootInputs.push(toSignInputs[i])
    }
    if (segwitPubKey && segwitSigner) {
      if (publicKey === segwitPubKey) {
        segwitInputs.push(toSignInputs[i])
      }
    }
  })
  if (taprootInputs.length > 0) {
    await taprootSigner(psbt, taprootInputs)
  }
  if (segwitSigner && segwitInputs.length > 0) {
    await segwitSigner(psbt, segwitInputs)
  }
  return psbt
}

export const createInscriptionScript = (
  pubKey: Buffer,
  content: string
): bitcoin.Stack => {
  const mimeType = 'text/plain;charset=utf-8'
  const textEncoder = new TextEncoder()
  const mimeTypeBuff = Buffer.from(textEncoder.encode(mimeType))
  const contentBuff = Buffer.from(textEncoder.encode(content))
  const markerBuff = Buffer.from(textEncoder.encode('ord'))

  return [
    pubKey,
    bitcoin.opcodes.OP_CHECKSIG,
    bitcoin.opcodes.OP_0,
    bitcoin.opcodes.OP_IF,
    markerBuff,
    1,
    1,
    mimeTypeBuff,
    bitcoin.opcodes.OP_0,
    contentBuff,
    bitcoin.opcodes.OP_ENDIF,
  ]
}

export function encodeToBase26(inputString: string): string {
  const baseCharCode = 'a'.charCodeAt(0)
  return inputString
    .toLowerCase()
    .split('')
    .map((char) => {
      const charCode = char.charCodeAt(0)
      if (charCode >= baseCharCode && charCode < baseCharCode + 26) {
        return String.fromCharCode(charCode - baseCharCode + 97) // Convert to base26 (a-z)
      } else {
        return char
      }
    })
    .join('')
}

export function runeFromStr(s: string) {
  let x = 0n // Use BigInt for handling large numbers equivalent to u128 in Rust.
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (i > 0) {
      x += 1n
    }
    x *= 26n // Multiply by 26 at each step to shift left in base 26.

    // Convert character to a number (0-25) and add it to x.
    const charCode = c.charCodeAt(0)
    if (charCode >= 65 && charCode <= 90) {
      // 'A'.charCodeAt(0) is 65, 'Z'.charCodeAt(0) is 90
      x += BigInt(charCode - 65)
    } else {
      throw new Error(`Invalid character in rune name: ${c}`)
    }
  }
  return x
}

export function hexToLittleEndian(hex: string) {
  let littleEndianHex = ''
  for (let i = hex.length - 2; i >= 0; i -= 2) {
    littleEndianHex += hex.substr(i, 2)
  }
  return littleEndianHex
}

export const createRuneSendScript = ({
  runeId,
  amount,
  divisibility = 0,
  sendOutputIndex = 1,
  pointer = 0,
}: {
  runeId: string
  amount: number
  divisibility?: number
  sendOutputIndex?: number
  pointer: number
}) => {
  if (divisibility === 0) {
    amount = Math.floor(amount)
  }
  const pointerFlag = encodeVarint(BigInt(22)).varint
  const pointerVarint = encodeVarint(BigInt(pointer)).varint
  const bodyFlag = encodeVarint(BigInt(0)).varint
  const amountToSend = encodeVarint(BigInt(amount * 10 ** divisibility)).varint
  const encodedOutputIndex = encodeVarint(BigInt(sendOutputIndex)).varint
  const splitIdString = runeId.split(':')
  const block = Number(splitIdString[0])
  const blockTx = Number(splitIdString[1])

  const encodedBlock = encodeVarint(BigInt(block)).varint
  const encodedBlockTxNumber = encodeVarint(BigInt(blockTx)).varint

  const runeStone = Buffer.concat([
    pointerFlag,
    pointerVarint,
    bodyFlag,
    encodedBlock,
    encodedBlockTxNumber,
    amountToSend,
    encodedOutputIndex,
  ])

  let runeStoneLength: string = runeStone.byteLength.toString(16)

  if (runeStoneLength.length % 2 !== 0) {
    runeStoneLength = '0' + runeStone.byteLength.toString(16)
  }

  const script: Buffer = Buffer.concat([
    Buffer.from('6a', 'hex'),
    Buffer.from('5d', 'hex'),
    Buffer.from(runeStoneLength, 'hex'),
    runeStone,
  ])
  return script
}

export const createRuneMintScript = ({
  runeId,
  pointer = 1,
}: {
  runeId: string
  pointer?: number
}) => {
  const [blockStr, txStr] = runeId.split(':')
  const runestone: RunestoneSpec = {
    mint: {
      block: BigInt(blockStr),
      tx: parseInt(txStr, 10),
    },
    pointer,
  }
  return encodeRunestone(runestone).encodedRunestone
}

export const createRuneEtchScript = ({
  pointer = 0,
  runeName,
  symbol,
  divisibility,
  perMintAmount,
  premine = 0,
  cap,
  turbo,
}: {
  pointer?: number
  runeName: string
  symbol: string
  divisibility?: number
  perMintAmount: number
  cap?: number
  premine?: number
  turbo?: boolean
}) => {
  const runeEtch = encodeRunestone({
    etching: {
      divisibility,
      premine: BigInt(premine),
      runeName,
      symbol,
      terms: {
        cap: cap && BigInt(cap),
        amount: perMintAmount && BigInt(perMintAmount),
      },
      turbo,
    },
    pointer,
  }).encodedRunestone
  return runeEtch
}

export function getAddressType(address: string): AddressType | null {
  if (
    addressFormats.mainnet.p2pkh.test(address) ||
    addressFormats.testnet.p2pkh.test(address) ||
    addressFormats.regtest.p2pkh.test(address)
  ) {
    return AddressType.P2PKH
  } else if (
    addressFormats.mainnet.p2tr.test(address) ||
    addressFormats.testnet.p2tr.test(address) ||
    addressFormats.regtest.p2tr.test(address)
  ) {
    return AddressType.P2TR
  } else if (
    addressFormats.mainnet.p2sh.test(address) ||
    addressFormats.testnet.p2sh.test(address) ||
    addressFormats.regtest.p2sh.test(address)
  ) {
    return AddressType.P2SH_P2WPKH
  } else if (
    addressFormats.mainnet.p2wpkh.test(address) ||
    addressFormats.testnet.p2wpkh.test(address) ||
    addressFormats.regtest.p2wpkh.test(address)
  ) {
    return AddressType.P2WPKH
  } else {
    return null
  }
}

export function getAddressKey(address: string): AddressKey {
  const addressType = getAddressType(address)
  switch (addressType) {
    case AddressType.P2WPKH:
      return 'nativeSegwit'
    case AddressType.P2SH_P2WPKH:
      return 'nestedSegwit'
    case AddressType.P2TR:
      return 'taproot'
    case AddressType.P2PKH:
      return 'legacy'
    default:
      return null
  }
}

export async function waitForTransaction({
  txId,
  sandshrewBtcClient,
}: {
  txId: string
  sandshrewBtcClient: SandshrewBitcoinClient
}) {
  const timeout = 60000 // 1 minute in milliseconds
  const startTime = Date.now()

  while (true) {
    try {
      const result = await sandshrewBtcClient.bitcoindRpc.getMemPoolEntry(txId)

      if (result) {
        await delay(5000)
        break
      }

      // Check for timeout
      if (Date.now() - startTime > timeout) {
        throw new Error(
          `Timeout: Could not find transaction in mempool: ${txId}`
        )
      }

      // Wait for 5 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 5000))
    } catch (error) {
      // Check for timeout
      if (Date.now() - startTime > timeout) {
        throw new Error(
          `Timeout: Could not find transaction in mempool: ${txId}`
        )
      }

      // Wait for 5 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
}

export async function getOutputValueByVOutIndex({
  txId,
  vOut,
  esploraRpc,
}: {
  txId: string
  vOut: number
  esploraRpc: EsploraRpc
}): Promise<{ value: number; script: string } | null> {
  const timeout: number = 60000 // 1 minute in milliseconds
  const startTime: number = Date.now()

  while (true) {
    const txDetails = await esploraRpc.getTxInfo(txId)

    if (txDetails?.vout && txDetails.vout.length > 0) {
      return {
        value: txDetails.vout[vOut].value,
        script: txDetails.vout[vOut].scriptpubkey,
      }
    }

    // Check for timeout
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout reached, stopping search.')
    }

    // Wait for 5 seconds before retrying
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
}

export function calculateTaprootTxSize(
  taprootInputCount: number,
  nonTaprootInputCount: number,
  outputCount: number
): number {
  const baseTxSize = 10 // Base transaction size without inputs/outputs

  // Size contributions from inputs
  const taprootInputSize = 64 // Average size of a Taproot input (can vary)
  const nonTaprootInputSize = 42 // Average size of a non-Taproot input (can vary)

  const outputSize = 40

  const totalInputSize =
    taprootInputCount * taprootInputSize +
    nonTaprootInputCount * nonTaprootInputSize
  const totalOutputSize = outputCount * outputSize

  return baseTxSize + totalInputSize + totalOutputSize
}

export const filterTaprootUtxos = async ({
  taprootUtxos,
}: {
  taprootUtxos: any[]
}) => {
  if (!taprootUtxos || taprootUtxos.length === 0) {
    return null
  }
  const { nonMetaUtxos } = taprootUtxos.reduce(
    (acc, utxo) => {
      utxo.inscriptions.length > 0 || utxo.satoshis === inscriptionSats
        ? acc.metaUtxos.push(utxo)
        : acc.nonMetaUtxos.push(utxo)
      return acc
    },
    { metaUtxos: [], nonMetaUtxos: [] }
  )
  const sortedNonMetaUtxos = nonMetaUtxos.sort(
    (a, b) => b.satoshis - a.satoshis
  )

  return sortedNonMetaUtxos
}

export const filterUtxos = async ({ utxos }: { utxos: any[] }) => {
  const { nonMetaUtxos } = utxos.reduce(
    (acc, utxo) => {
      utxo.value === inscriptionSats && utxo.vout === 0
        ? acc.metaUtxos.push(utxo)
        : acc.nonMetaUtxos.push(utxo)
      return acc
    },
    { metaUtxos: [], nonMetaUtxos: [] }
  )
  return nonMetaUtxos
}

export const isValidJSON = (str: string) => {
  try {
    JSON.parse(str)
    return true
  } catch (e) {
    return false
  }
}

export const encodeVarint = (bigIntValue: any) => {
  const bufferArray = []
  let num = bigIntValue

  do {
    let byte = num & BigInt(0x7f) // Get the next 7 bits of the number.
    num >>= BigInt(7) // Remove the 7 bits we just processed.
    if (num !== BigInt(0)) {
      // If there are more bits to process,
      byte |= BigInt(0x80) // set the continuation bit.
    }
    bufferArray.push(Number(byte))
  } while (num !== BigInt(0))

  return { varint: Buffer.from(bufferArray) }
}

export function findRuneUtxosToSpend(utxos: RuneUtxo[], target: number) {
  if (!utxos || utxos.length === 0) {
    return undefined
  }
  let totalAmount = 0
  let totalSatoshis = 0
  const selectedUtxos: RuneUtxo[] = []

  for (const utxo of utxos) {
    if (totalAmount >= target) break

    selectedUtxos.push(utxo)
    totalSatoshis += utxo.satoshis
    totalAmount += utxo.amount
  }

  if (totalAmount >= target) {
    return {
      selectedUtxos,
      change: totalAmount - target,
      totalSatoshis: totalSatoshis,
    }
  } else {
    return undefined
  }
}

export function findXAmountOfSats(utxos: FormattedUtxo[], target: number) {
  let totalAmount = 0
  const selectedUtxos: FormattedUtxo[] = []

  for (const utxo of utxos) {
    if (totalAmount >= target) break

    selectedUtxos.push(utxo)
    totalAmount += utxo.satoshis
  }
  return {
    utxos: selectedUtxos,
    totalAmount,
  }
}

export function decodeCBOR(hex: string): DecodedCBOR {
  const buffer = Buffer.from(hex, 'hex')
  return CBOR.decode(buffer)
}

export const getVSize = (data: Buffer) => {
  let totalSize = data.length
  if (totalSize < 0xfd) {
    totalSize += 1
  } else if (totalSize <= 0xffff) {
    totalSize += 3
  } else if (totalSize <= 0xffffffff) {
    totalSize += 5
  }
  return Math.ceil(totalSize / 4)
}

export const packUTF8 = function (s) {
  const result = ['']
  let b = 0
  for (let i = 0; i < s.length; i++) {
    const length = Buffer.from(s[i]).length
    if (b + length > 15) {
      b = 0
      result.push('')
      i--
    } else {
      b += length
      result[result.length - 1] += s[i]
    }
  }
  return result.map(
    (v) =>
      (v &&
        Buffer.from(Array.from(Buffer.from(v)).reverse()).toString('hex')) ||
      ''
  )
}
