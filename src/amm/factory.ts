import { u128 } from '@magiceden-oss/runestone-lib/dist/src/integer/u128'
import { u32 } from '@magiceden-oss/runestone-lib/dist/src/integer/u32'
import { encipher } from 'alkanes/lib/bytes'
import { encodeRunestoneProtostone } from 'alkanes/lib/protorune/proto_runestone_upgrade'
import { ProtoruneEdict } from 'alkanes/lib/protorune/protoruneedict'
import { ProtoruneRuneId } from 'alkanes/lib/protorune/protoruneruneid'
import { ProtoStone } from 'alkanes/lib/protorune/protostone'
import {
  Account,
  findXAmountOfSats,
  formatInputsToSign,
  getAddressType,
  inscriptionSats,
  OylTransactionError,
  Provider,
  Signer,
} from '..'
import * as bitcoin from 'bitcoinjs-lib'
import { getEstimatedFee } from '../psbt'
import { minimumFee } from '../btc'
import { AlkanesAMMPoolDecoder } from './pool'
import { PoolDetailsResult, PoolOpcodes } from './utils'
import {
  FormattedUtxo,
  selectAlkanesUtxos,
  selectSpendableUtxos,
} from '../utxo'
import { AlkaneId } from '@alkanes/types'

export type CreateNewPoolSimulationResult = {
  lpTokens: string
  alkaneId: AlkaneId
}

export type FindExistingPoolIdSimulationResult = {
  alkaneId: AlkaneId
}

export type GetAllPoolsResult = {
  count: number
  pools: AlkaneId[]
}

export type AllPoolsDetailsResult = {
  count: number
  pools: (PoolDetailsResult & { poolId: AlkaneId })[]
}

export enum PoolFactoryOpcodes {
  INIT_POOL = 0,
  CREATE_NEW_POOL = 1,
  FIND_EXISTING_POOL_ID = 2,
  GET_ALL_POOLS = 3,
}

export const parseAlkaneIdFromHex = (hex: string): AlkaneId => {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex

  const blockHex = cleanHex.slice(0, 32)
  const txHex = cleanHex.slice(32)

  const reversedBlockHex = Buffer.from(blockHex, 'hex')
    .reverse()
    .toString('hex')
  const reversedTxHex = Buffer.from(txHex, 'hex').reverse().toString('hex')

  const block = parseInt(reversedBlockHex, 16).toString()
  const tx = parseInt(reversedTxHex, 16).toString()

  return { block, tx }
}

export class AlkanesAMMPoolFactoryDecoder {
  decodeCreateNewPool(
    execution: any
  ): CreateNewPoolSimulationResult | undefined {
    if (
      !execution?.alkanes?.[0]?.u?.[1]?.[0] ||
      !execution?.alkanes?.[0]?.u?.[0]
    ) {
      return undefined
    }

    return {
      lpTokens: execution.alkanes[0].u[1][0].toString(),
      alkaneId: {
        block: execution.alkanes[0].u[0][0][0],
        tx: execution.alkanes[0].u[0][1][0],
      },
    }
  }

  decodeFindExistingPoolId(
    execution: any
  ): FindExistingPoolIdSimulationResult | undefined {
    if (!execution?.data || execution.data === '0x') {
      return undefined
    }
    const bytes = parseAlkaneIdFromHex(execution.data)
    return {
      alkaneId: {
        block: bytes.block.toString(),
        tx: bytes.tx.toString(),
      },
    }
  }

  decodeGetAllPools(execution: any): GetAllPoolsResult | undefined {
    if (!execution?.data || execution.data === '0x') {
      return undefined
    }

    const data = execution.data.startsWith('0x')
      ? execution.data.slice(2)
      : execution.data

    const countBytes = Buffer.from(data.slice(0, 32), 'hex')
    const count = parseInt(countBytes.reverse().toString('hex'), 16)

    const pools: AlkaneId[] = []
    for (let i = 0; i < count; i++) {
      const offset = 32 + i * 64

      const blockBytes = Buffer.from(data.slice(offset, offset + 32), 'hex')
      const block = parseInt(
        blockBytes.reverse().toString('hex'),
        16
      ).toString()

      const txBytes = Buffer.from(data.slice(offset + 32, offset + 64), 'hex')
      const tx = parseInt(txBytes.reverse().toString('hex'), 16).toString()

      pools.push({ block, tx })
    }

    return { count, pools }
  }

  async decodeAllPoolsDetails(
    factoryExecution: any,
    provider: Provider
  ): Promise<AllPoolsDetailsResult | undefined> {
    // Get all pool IDs
    const allPools = this.decodeGetAllPools(factoryExecution)
    if (!allPools) return undefined

    const poolDecoder = new AlkanesAMMPoolDecoder()
    const poolsWithDetails: (PoolDetailsResult & { poolId: AlkaneId })[] = []

    // For each pool ID, simulate a call to get its details
    for (const poolId of allPools.pools) {
      const request = {
        alkanes: [],
        transaction: '0x',
        block: '0x',
        height: '20000',
        txindex: 0,
        target: poolId,
        inputs: [PoolOpcodes.POOL_DETAILS.toString()],
        pointer: 0,
        refundPointer: 0,
        vout: 0,
      }

      try {
        const result = await provider.alkanes.simulate(request)
        const poolDetails = poolDecoder.decodePoolDetails(result.execution.data)
        if (poolDetails) {
          poolsWithDetails.push({
            ...poolDetails,
            poolId,
          })
        }
      } catch (error) {
        console.error(
          `Error getting details for pool ${poolId.block}:${poolId.tx}:`,
          error
        )
      }
    }

    return {
      count: poolsWithDetails.length,
      pools: poolsWithDetails,
    }
  }

  static decodeSimulation(result: any, opcode: number) {
    if (!result || typeof result.status === 'undefined') {
      return {
        success: false,
        error: 'Invalid simulation result',
        gasUsed: 0,
      }
    }

    const decoder = new AlkanesAMMPoolFactoryDecoder()
    let decoded

    switch (opcode) {
      case PoolFactoryOpcodes.INIT_POOL:
        // Not implemented
        break
      case PoolFactoryOpcodes.CREATE_NEW_POOL:
        decoded = decoder.decodeCreateNewPool(result.execution)
        break
      case PoolFactoryOpcodes.FIND_EXISTING_POOL_ID:
        decoded = decoder.decodeFindExistingPoolId(result.execution)
        break
      case PoolFactoryOpcodes.GET_ALL_POOLS:
        decoded = decoder.decodeGetAllPools(result.execution)
        break
      default:
        decoded = undefined
    }

    return decoded
  }
}

export const getPoolId = async () => {}

export const createNewPoolPsbt = async ({
  calldata,
  token0,
  token0Amount,
  token1,
  token1Amount,
  utxos,
  feeRate,
  account,
  provider,
}: {
  calldata: bigint[]
  token0: AlkaneId
  token0Amount: bigint
  token1: AlkaneId
  token1Amount: bigint
  utxos: FormattedUtxo[]
  feeRate: number
  account: Account
  provider: Provider
}) => {
  const tokens = [
    { alkaneId: token0, amount: token0Amount },
    { alkaneId: token1, amount: token1Amount },
  ]
  const { utxos: alkanesUtxos, edicts } = await splitAlkaneUtxos(tokens, utxos)

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

  const { psbt } = await poolPsbt({
    alkanesUtxos,
    protostone,
    utxos,
    feeRate,
    account,
    provider,
  })

  const { fee } = await getEstimatedFee({
    psbt,
    provider,
    feeRate,
  })

  const { psbt: finalPsbt } = await poolPsbt({
    alkanesUtxos,
    fee,
    utxos,
    account,
    protostone,
    provider,
    feeRate,
  })

  return { psbt: finalPsbt, fee }
}

export const createNewPool = async ({
  calldata,
  token0,
  token0Amount,
  token1,
  token1Amount,
  utxos,
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
  utxos: FormattedUtxo[]
  feeRate: number
  account: Account
  provider: Provider
  signer: Signer
}) => {
  const { psbt } = await createNewPoolPsbt({
    calldata,
    token0,
    token0Amount,
    token1,
    token1Amount,
    utxos,
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

//@dev we use output 5 for because that is the virtual output for the 2nd protostone. The index count starts after the total number of outputs in the txn.

export const splitAlkaneUtxos = (
  tokens: { alkaneId: AlkaneId; amount: bigint }[],
  utxos: FormattedUtxo[]
) => {
  const allTokenUtxos = tokens.map((token) => {
    const selected = selectAlkanesUtxos({
      utxos,
      greatestToLeast: false,
      targetNumberOfAlkanes: Number(token.amount),
      alkaneId: token.alkaneId,
    })

    return selected
  })

  const gatheredUtxos = {
    utxos: allTokenUtxos
      .flatMap((t) => t.utxos)
      .filter(
        (utxo, index, self) =>
          index === self.findIndex((u) => u.txId === utxo.txId)
      ),
    totalAmount: allTokenUtxos.reduce((acc, t) => acc + t.totalAmount, 0),
  }

  const edicts: ProtoruneEdict[] = tokens.flatMap((token) => {
    return [
      {
        id: new ProtoruneRuneId(
          u128(BigInt(token.alkaneId.block)),
          u128(BigInt(token.alkaneId.tx))
        ),
        amount: u128(token.amount),
        output: u32(5),
      },
    ]
  })

  const protostone: Buffer = encodeRunestoneProtostone({
    protostones: [
      ProtoStone.edicts({
        protocolTag: 1n,
        edicts,
      }),
    ],
  }).encodedRunestone

  return {
    ...gatheredUtxos,
    protostone,
    edicts,
  }
}

export const poolPsbt = async ({
  alkanesUtxos,
  utxos,
  account,
  protostone,
  provider,
  feeRate,
  fee = 0,
}: {
  alkanesUtxos?: FormattedUtxo[]
  utxos: FormattedUtxo[]
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate?: number
  fee?: number
}) => {
  try {
    let gatheredUtxos = selectSpendableUtxos(utxos, account.spendStrategy)

    const minTxSize = minimumFee({
      taprootInputCount: 2,
      nonTaprootInputCount: 0,
      outputCount: 2,
    })

    let calculatedFee = Math.max(minTxSize * feeRate, 250)
    let finalFee = fee === 0 ? calculatedFee : fee

    gatheredUtxos = findXAmountOfSats([...utxos], Number(finalFee) + inscriptionSats)

    let psbt = new bitcoin.Psbt({ network: provider.network })

    if (alkanesUtxos) {
      for await (const utxo of alkanesUtxos) {
        if (getAddressType(utxo.address) === 0) {
          const previousTxHex: string = await provider.esplora.getTxHex(
            utxo.txId
          )
          psbt.addInput({
            hash: utxo.txId,
            index: utxo.outputIndex,
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
            index: utxo.outputIndex,
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
            index: utxo.outputIndex,
            witnessUtxo: {
              value: utxo.satoshis,
              script: Buffer.from(utxo.scriptPk, 'hex'),
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
      value: inscriptionSats,
    })

    const output = { script: protostone, value: 0 }
    psbt.addOutput(output)

    const alkanesTotalAmount = alkanesUtxos.reduce(
      (acc, utxo) => acc + utxo.satoshis,
      0
    )

    const changeAmount =
      gatheredUtxos.totalAmount + alkanesTotalAmount - finalFee - inscriptionSats

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
