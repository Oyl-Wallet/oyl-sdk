import { encipher } from 'alkanes/lib/bytes'
import { encodeRunestoneProtostone } from 'alkanes/lib/protorune/proto_runestone_upgrade'
import { ProtoStone } from 'alkanes/lib/protorune/protostone'
import { Account, alkanes, Provider, Signer, utxo } from '..'
import { findAlkaneUtxos } from '../alkanes'
import { AlkaneId, Utxo } from 'shared/interface'
import { u128, u32 } from '@magiceden-oss/runestone-lib/dist/src/integer'
import { ProtoruneEdict } from 'alkanes/lib/protorune/protoruneedict'
import { ProtoruneRuneId } from 'alkanes/lib/protorune/protoruneruneid'
import { splitAlkaneUtxos } from './factory'
import {
  PoolDetailsResult,
  RemoveLiquidityPreviewResult,
  PoolOpcodes,
  estimateRemoveLiquidityAmounts,
} from './utils'

export type SwapSimulationResult = {
  amountOut: bigint
}

export class AlkanesAMMPoolDecoder {
  decodeSwap(data: string): SwapSimulationResult | undefined {
    if (data === '0x') return undefined
    // Convert hex to BigInt (little-endian)
    const bytes = Buffer.from(data.slice(2), 'hex')
    const reversed = Buffer.from([...bytes].reverse())
    return {
      amountOut: BigInt('0x' + reversed.toString('hex')),
    }
  }

  decodePoolDetails(data: string): PoolDetailsResult | undefined {
    if (data === '0x') return undefined
    const bytes = Buffer.from(data.slice(2), 'hex')

    const token0: AlkaneId = {
      block: bytes.readBigUInt64LE(0).toString(),
      tx: bytes.readBigUInt64LE(16).toString(),
    }
    const token1: AlkaneId = {
      block: bytes.readBigUInt64LE(32).toString(),
      tx: bytes.readBigUInt64LE(48).toString(),
    }

    const token0Amount = bytes.readBigUInt64LE(64).toString()
    const token1Amount = bytes.readBigUInt64LE(80).toString()
    const tokenSupply = bytes.readBigUInt64LE(96).toString()
    const poolName = Buffer.from(bytes.subarray(116)).toString('utf8')

    return { token0, token1, token0Amount, token1Amount, tokenSupply, poolName }
  }

  decodeName(data: string): string | undefined {
    if (data === '0x') return undefined
    const bytes = Buffer.from(data.slice(2), 'hex')
    return bytes.toString('utf8')
  }

  static decodeSimulation(result: any, opcode: number) {
    const decoder = new AlkanesAMMPoolDecoder()
    let decoded: any
    switch (opcode) {
      case PoolOpcodes.INIT_POOL:
      case PoolOpcodes.ADD_LIQUIDITY:
      case PoolOpcodes.REMOVE_LIQUIDITY:
        throw new Error(
          'Opcode not supported in simulation mode; see previewRemoveLiquidity'
        )
      case PoolOpcodes.SIMULATE_SWAP:
        decoded = decoder.decodeSwap(result.execution.data)
        break
      case PoolOpcodes.NAME:
        decoded = decoder.decodeName(result.execution.data)
        break
      case PoolOpcodes.POOL_DETAILS:
        decoded = decoder.decodePoolDetails(result.execution.data)
        break
      default:
        decoded = undefined
    }

    if (result.status !== 0 || result.execution.error) {
      throw new Error(result.execution.error || 'Unknown error')
    }

    return decoded
  }
}

export const addLiquidityPsbt = async ({
  calldata,
  token0,
  token0Amount,
  token1,
  token1Amount,
  gatheredUtxos,
  feeRate,
  account,
  provider,
}: {
  calldata: bigint[]
  token0: AlkaneId
  token0Amount: bigint
  token1: AlkaneId
  token1Amount: bigint
  gatheredUtxos: { utxos: Utxo[]; totalAmount: number }
  feeRate: number
  account: Account
  provider: Provider
}) => {
  const tokens = [
    { alkaneId: token0, amount: token0Amount },
    { alkaneId: token1, amount: token1Amount },
  ]
  const { edicts, alkaneUtxos, totalSatoshis } = await splitAlkaneUtxos(
    tokens,
    account,
    provider
  )

  const protostone: Buffer = encodeRunestoneProtostone({
    protostones: [
      ProtoStone.message({
        edicts,
        protocolTag: 1n,
        pointer: 0,
        refundPointer: 0,
        calldata: encipher([]),
      }),
      ProtoStone.message({
        protocolTag: 1n,
        pointer: 0,
        refundPointer: 0,
        calldata: encipher(calldata),
      }),
    ],
  }).encodedRunestone

  const { psbt, fee } = await alkanes.executePsbt({
    alkaneUtxos: { alkaneUtxos, totalSatoshis },
    protostone,
    gatheredUtxos,
    feeRate,
    account,
    provider,
  })

  return { psbt, fee }
}

export const addLiquidity = async ({
  calldata,
  token0,
  token0Amount,
  token1,
  token1Amount,
  gatheredUtxos,
  feeRate,
  account,
  signer,
  provider,
}: {
  calldata: bigint[]
  token0: AlkaneId
  token0Amount: bigint
  token1: AlkaneId
  token1Amount: bigint
  gatheredUtxos: { utxos: Utxo[]; totalAmount: number }
  feeRate: number
  account: Account
  provider: Provider
  signer: Signer
}) => {
  const { psbt } = await addLiquidityPsbt({
    calldata,
    token0,
    token0Amount,
    token1,
    token1Amount,
    gatheredUtxos,
    feeRate,
    account,
    provider,
  })

  const { signedPsbt } = await signer.signAllInputs({
    rawPsbt: psbt,
    finalize: true,
  })

  const pushResult = await provider.pushPsbt({
    psbtBase64: signedPsbt,
  })

  return pushResult
}

/**
 * Estimates the tokens that would be received when removing liquidity from a pool
 * @param token The LP token ID
 * @param tokenAmount The amount of LP tokens to remove
 * @param provider The provider instance
 * @returns A promise that resolves to the preview result containing token amounts
 */
export const previewRemoveLiquidity = async ({
  token,
  tokenAmount,
  provider,
}: {
  token: AlkaneId
  tokenAmount: bigint
  provider: Provider
}): Promise<RemoveLiquidityPreviewResult> => {
  const poolDetailsRequest = {
    target: token,
    inputs: [PoolOpcodes.POOL_DETAILS.toString()],
  }

  const detailsResult = await provider.alkanes.simulate(poolDetailsRequest)
  const decoder = new AlkanesAMMPoolDecoder()
  const poolDetails = decoder.decodePoolDetails(detailsResult.execution.data)

  if (!poolDetails) {
    throw new Error('Failed to get pool details')
  }

  return estimateRemoveLiquidityAmounts(poolDetails, tokenAmount)
}

export const removeLiquidityPsbt = async ({
  calldata,
  token,
  tokenAmount,
  gatheredUtxos,
  feeRate,
  account,
  provider,
}: {
  calldata: bigint[]
  token: AlkaneId
  tokenAmount: bigint
  gatheredUtxos: { utxos: Utxo[]; totalAmount: number }
  feeRate: number
  account: Account
  provider: Provider
}) => {
  let alkaneTokenUtxos: {
    alkaneUtxos: any[]
    totalSatoshis: number
  }

  const tokenUtxos = await Promise.all([
    findAlkaneUtxos({
      address: account.taproot.address,
      greatestToLeast: false,
      provider,
      targetNumberOfAlkanes: Number(tokenAmount),
      alkaneId: token,
    }),
  ])

  alkaneTokenUtxos = {
    alkaneUtxos: tokenUtxos[0].alkaneUtxos,
    totalSatoshis: tokenUtxos[0].totalSatoshis,
  }
  const edicts: ProtoruneEdict[] = [
    {
      id: new ProtoruneRuneId(
        u128(BigInt(token.block)),
        u128(BigInt(token.tx))
      ),
      amount: u128(tokenAmount),
      output: u32(5),
    },
  ]

  const protostone: Buffer = encodeRunestoneProtostone({
    protostones: [
      ProtoStone.message({
        protocolTag: 1n,
        edicts,
        pointer: 0,
        refundPointer: 0,
        calldata: encipher([]),
      }),
      ProtoStone.message({
        protocolTag: 1n,
        pointer: 0,
        refundPointer: 0,
        calldata: encipher(calldata),
      }),
    ],
  }).encodedRunestone

  const { psbt } = await alkanes.executePsbt({
    alkaneUtxos: alkaneTokenUtxos,
    protostone,
    gatheredUtxos,
    feeRate,
    account,
    provider,
  })

  return { psbt }
}

export const removeLiquidity = async ({
  calldata,
  token,
  tokenAmount,
  gatheredUtxos,
  feeRate,
  account,
  signer,
  provider,
}: {
  calldata: bigint[]
  token: AlkaneId
  tokenAmount: bigint
  gatheredUtxos: { utxos: Utxo[]; totalAmount: number }
  feeRate: number
  account: Account
  provider: Provider
  signer: Signer
}) => {
  const { psbt } = await removeLiquidityPsbt({
    calldata,
    token,
    tokenAmount,
    gatheredUtxos,
    feeRate,
    account,
    provider,
  })

  const { signedPsbt } = await signer.signAllInputs({
    rawPsbt: psbt,
    finalize: true,
  })

  const pushResult = await provider.pushPsbt({
    psbtBase64: signedPsbt,
  })

  return pushResult
}

export const swapPsbt = async ({
  calldata,
  token,
  tokenAmount,
  gatheredUtxos,
  feeRate,
  account,
  provider,
}: {
  calldata: bigint[]
  token: AlkaneId
  tokenAmount: bigint
  gatheredUtxos: { utxos: Utxo[]; totalAmount: number }
  feeRate: number
  account: Account
  provider: Provider
}) => {
  let alkaneTokenUtxos: {
    alkaneUtxos: any[]
    totalSatoshis: number
  }

  const tokenUtxos = await Promise.all([
    findAlkaneUtxos({
      address: account.taproot.address,
      greatestToLeast: false,
      provider,
      targetNumberOfAlkanes: Number(tokenAmount),
      alkaneId: token,
    }),
  ])

  alkaneTokenUtxos = {
    alkaneUtxos: tokenUtxos[0].alkaneUtxos,
    totalSatoshis: tokenUtxos[0].totalSatoshis,
  }
  const edicts: ProtoruneEdict[] = [
    {
      id: new ProtoruneRuneId(
        u128(BigInt(token.block)),
        u128(BigInt(token.tx))
      ),
      amount: u128(tokenAmount),
      output: u32(5),
    },
  ]

  const protostone: Buffer = encodeRunestoneProtostone({
    protostones: [
      ProtoStone.message({
        protocolTag: 1n,
        edicts,
        pointer: 0,
        refundPointer: 0,
        calldata: encipher([]),
      }),
      ProtoStone.message({
        protocolTag: 1n,
        pointer: 0,
        refundPointer: 0,
        calldata: encipher(calldata),
      }),
    ],
  }).encodedRunestone

  const { psbt } = await alkanes.executePsbt({
    alkaneUtxos: alkaneTokenUtxos,
    protostone,
    gatheredUtxos,
    feeRate,
    account,
    provider,
  })

  return { psbt }
}

export const swap = async ({
  calldata,
  token,
  tokenAmount,
  gatheredUtxos,
  feeRate,
  account,
  signer,
  provider,
}: {
  calldata: bigint[]
  token: AlkaneId
  tokenAmount: bigint
  gatheredUtxos: { utxos: Utxo[]; totalAmount: number }
  feeRate: number
  account: Account
  provider: Provider
  signer: Signer
}) => {
  const { psbt } = await swapPsbt({
    calldata,
    token,
    tokenAmount,
    gatheredUtxos,
    feeRate,
    account,
    provider,
  })

  const { signedPsbt } = await signer.signAllInputs({
    rawPsbt: psbt,
    finalize: true,
  })

  const pushResult = await provider.pushPsbt({
    psbtBase64: signedPsbt,
  })

  return pushResult
}
