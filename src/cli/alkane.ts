import { Command } from 'commander'
import fs from 'fs-extra'
import { gzip as _gzip } from 'node:zlib'
import { promisify } from 'util'
import path from 'path'
import * as alkanes from '../alkanes/alkanes'
import * as utxo from '../utxo'
import { Wallet } from './wallet'
import { contractDeployment } from '../alkanes/contract'
import { send, split, inscribePayload } from '../alkanes/token'
import { AlkanesPayload } from 'shared/interface'
import { encodeRunestoneProtostone } from 'alkanes/lib/protorune/proto_runestone_upgrade'
import { ProtoStone } from 'alkanes/lib/protorune/protostone'
import { encipher } from 'alkanes/lib/bytes'
import { metashrew } from '../rpclient/alkanes'
import { ProtoruneEdict } from 'alkanes/lib/protorune/protoruneedict'
import { ProtoruneRuneId } from 'alkanes/lib/protorune/protoruneruneid'
import { u128 } from '@magiceden-oss/runestone-lib/dist/src/integer'
import { createNewPool } from '../amm/factory'
import { removeLiquidity, addLiquidity, swap } from '../amm/pool'
import { packUTF8 } from '../shared/utils';
import { sha256 } from '@noble/hashes/sha2';
import { parse } from 'csv-parse/sync';
import * as borsh from 'borsh';
/* @dev example call
  oyl alkane trace -params '{"txid":"e6561c7a8f80560c30a113c418bb56bde65694ac2b309a68549f35fdf2e785cb","vout":0}'

  Note the json format if you need to pass an object.
*/

export class AlkanesCommand extends Command {
  constructor(cmd) {
    super(cmd)
  }
  action(fn) {
    this.option('-s, --metashrew-rpc-url <url>', 'metashrew JSON-RPC override')
    return super.action(async (options) => {
      metashrew.set(options.metashrewRpcUrl || null)
      return await fn(options)
    })
  }
}
export const alkanesTrace = new AlkanesCommand('trace')
  .description('Returns data based on txid and vout of deployed alkane')
  .option('-p, --provider <provider>', 'provider to use to access the network.')
  .option(
    '-params, --parameters <parameters>',
    'parameters for the ord method you are calling.'
  )
  .action(async (options) => {
    const wallet: Wallet = new Wallet(options)
    const provider = wallet.provider
    let isJson: { vout: number; txid: string }
    isJson = JSON.parse(options.parameters)
    const { vout, txid } = isJson
    console.log(
      JSON.stringify(
        await provider.alkanes.trace({
          vout,
          txid,
        })
      )
    )
  })

/* @dev example call 
  oyl alkane new-contract -c ./src/cli/contracts/free_mint.wasm -data 3,77,100

  The free_mint.wasm contract is used as an example. This deploys to Reserve Number 77.

  To verify the factory contract was deployed, you can use the oyl alkane trace command 
  using the returned txid and vout: 3

  Remember to genBlocks after sending transactions to the regtest chain!
*/
export const alkaneContractDeploy = new AlkanesCommand('new-contract')
  .requiredOption(
    '-data, --calldata <calldata>',
    'op code + params to be used when deploying a contracts',
    (value, previous) => {
      const items = value.split(',')
      return previous ? previous.concat(items) : items
    },
    []
  )
  .requiredOption(
    '-c, --contract <contract>',
    'Relative path to contract wasm file to deploy (e.g., "../alkanes/free_mint.wasm")'
  )
  .option(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  .option('-feeRate, --feeRate <feeRate>', 'fee rate')

  .action(async (options) => {
    const wallet: Wallet = new Wallet(options)
    const { accountUtxos } = await utxo.accountUtxos({
      account: wallet.account,
      provider: wallet.provider,
    })

    const contract = new Uint8Array(
      Array.from(
        await fs.readFile(path.resolve(process.cwd(), options.contract))
      )
    )
    const gzip = promisify(_gzip)

    const payload: AlkanesPayload = {
      body: await gzip(contract, { level: 9 }),
      cursed: false,
      tags: { contentType: '' },
    }

    const callData: bigint[] = []
    for (let i = 0; i < options.calldata.length; i++) {
      callData.push(BigInt(options.calldata[i]))
    }

    const protostone = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.message({
          protocolTag: 1n,
          edicts: [],
          pointer: 0,
          refundPointer: 0,
          calldata: encipher(callData),
        }),
      ],
    }).encodedRunestone

    console.log(
      await contractDeployment({
        protostone,
        payload,
        utxos: accountUtxos,
        feeRate: wallet.feeRate,
        account: wallet.account,
        signer: wallet.signer,
        provider: wallet.provider,
      })
    )
  })

/* @dev example call 
  oyl alkane new-token -pre 5000 -amount 1000 -c 100000 -name "OYL" -symbol "OL" -resNumber 77 -i ./src/cli/contracts/image.png
  oyl alkane new-token -resNumber 12050 -i ./src/cli/contracts/image.png -args 0,10,100000000
  
  The resNumber must be a resNumber for a deployed contract. In this case 77 is the resNumber for 
  the free_mint.wasm contract and the options supplied are for the free_mint.wasm contract.

  The token will deploy to the next available [2, n] Alkane ID.

  To get information on the deployed token, you can use the oyl alkane trace command 
  using the returned txid and vout: 4

  Remember to genBlocks after transactions...
*/
export const alkaneTokenDeploy = new AlkanesCommand('new-token')
  .requiredOption(
    '-resNumber, --reserveNumber <reserveNumber>',
    'Number to reserve for factory id'
  )
  .option('-c, --cap <cap>', 'the token cap')
  .option('-name, --token-name <name>', 'the token name')
  .option('-symbol, --token-symbol <symbol>', 'the token symbol')
  .option(
    '-amount, --amount-per-mint <amount-per-mint>',
    'Amount of tokens minted each time mint is called'
  )
  .option('-pre, --premine <premine>', 'amount to premine')
  .option(
    '-i, --image <image>',
    'Relative path to image file to deploy (e.g., "../alkanes/free_mint.wasm")'
  )
  .option(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  .option(
    '-args, --arguments <arguments>',
    'opcode and params to be used when deploying a contract (e.g. -args "1,2,3"). Note: if using this arg, the values for premine, amount-per-mint, cap, token-name, and token-symbol will be ignored',
    (value, previous) => {
      const items = value.split(',')
      return previous ? previous.concat(items) : items
    },
    []
  )
  .option('-feeRate, --feeRate <feeRate>', 'fee rate')
  .action(async (options) => {
    const wallet: Wallet = new Wallet(options)

    const { accountUtxos } = await utxo.accountUtxos({
      account: wallet.account,
      provider: wallet.provider,
    })

    let calldata = [
      BigInt(6),
      BigInt(options.reserveNumber),
    ]
    if (options.arguments.length > 0) {
      calldata = calldata.concat(options.arguments.map(v => BigInt(v)))
    } else {
      if (!options.cap || !options.tokenName || !options.tokenSymbol || !options.amountPerMint) {
        throw new Error('Either --arguments or all of --cap, --token-name, --token-symbol, and --amount-per-mint must be provided.')
      }
      const tokenName = packUTF8(options.tokenName)
      const tokenSymbol = packUTF8(options.tokenSymbol)

      if (tokenName.length > 2) {
        throw new Error('Token name too long')
      }

      if (tokenSymbol.length > 1) {
        throw new Error('Token symbol too long')
      }
      calldata = calldata.concat([
        BigInt(0),
        BigInt(options.premine ?? 0),
        BigInt(options.amountPerMint),
        BigInt(options.cap),
        BigInt('0x' + tokenName[0]),
        BigInt(tokenName.length > 1 ? '0x' + tokenName[1] : 0),
        BigInt('0x' + tokenSymbol[0]),
      ])
    }

    const protostone = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.message({
          protocolTag: 1n,
          edicts: [],
          pointer: 0,
          refundPointer: 0,
          calldata: encipher(calldata),
        }),
      ],
    }).encodedRunestone

    if (options.image) {
      const image = new Uint8Array(
        Array.from(
          await fs.readFile(path.resolve(process.cwd(), options.image))
        )
      )
      const gzip = promisify(_gzip)

      const payload: AlkanesPayload = {
        body: await gzip(image, { level: 9 }),
        cursed: false,
        tags: { contentType: '' },
      }

      console.log(
        await inscribePayload({
          payload,
          protostone,
          utxos: accountUtxos,
          feeRate: wallet.feeRate,
          account: wallet.account,
          signer: wallet.signer,
          provider: wallet.provider,
        })
      )
      return
    }

    console.log(
      await alkanes.execute({
        protostone,
        utxos: accountUtxos,
        feeRate: wallet.feeRate,
        account: wallet.account,
        signer: wallet.signer,
        provider: wallet.provider,
      })
    )
  })

/* @dev example call 
  oyl alkane execute -data 2,1,77 -e 2:1:333:1

  In this example we call a mint (opcode 77) from the [2,1] token. The token
  will mint to the wallet calling execute.

  We also pass the edict 2:1:333:1. That is id [2,1], the amount is 333, and the output is vout 1. 

  Hint: you can grab the TEST_WALLET's alkanes balance with:
  oyl provider alkanes -method getAlkanesByAddress -params '{"address":"bcrt1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqvg32hk"}'
*/
export const alkaneExecute = new AlkanesCommand('execute')
  .requiredOption(
    '-data, --calldata <calldata>',
    'op code + params to be called on a contract',
    (value, previous) => {
      const items = value.split(',')
      return previous ? previous.concat(items) : items
    },
    []
  )
  .option(
    '-e, --edicts <edicts>',
    'edicts for protostone',
    (value, previous) => {
      const items = value.split(',')
      return previous ? previous.concat(items) : items
    },
    []
  )
  .option(
    '-a, --alkanes <alkanes>',
    'alkanes to spend for transaction',
    (value, previous) => {
      const items = value.split(',')
      return previous ? previous.concat(items) : items
    },
    []
  )
  .option(
    '-m, --mnemonic <mnemonic>',
    '(optional) Mnemonic used for signing transactions (default = TEST_WALLET)'
  )
  .option(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  .option('-feeRate, --feeRate <feeRate>', 'fee rate')
  .action(async (options) => {
    const wallet: Wallet = new Wallet(options)

    const { accountSpendableTotalUtxos, accounts } = await utxo.accountUtxos({
      account: wallet.account,
      provider: wallet.provider,
    })
    const calldata: bigint[] = options.calldata.map((item) => BigInt(item))

    const edicts: ProtoruneEdict[] = options.edicts.map((item) => {
      const [block, tx, amount, output] = item
        .split(':')
        .map((part) => part.trim())
      return {
        id: new ProtoruneRuneId(u128(block), u128(tx)),
        amount: amount ? BigInt(amount) : undefined,
        output: output ? Number(output) : undefined,
      }
    })

    const alkanesToSpend = options.alkanes.map(alkanes.toAlkaneId)

    let availableAlkaneUtxos: utxo.FormattedUtxo[] = [];
    for (const key in accounts) {
      availableAlkaneUtxos.push(...accounts[key].alkaneUtxos);
    }

    const alkaneUtxosToSpend: utxo.FormattedUtxo[] = [];
    const spentUtxoIds = new Set<string>();

    for (const alkaneToSpend of alkanesToSpend) {
      const { utxos: selectedUtxos } = utxo.selectAlkanesUtxos({
        utxos: availableAlkaneUtxos.filter(u => !spentUtxoIds.has(`${u.txId}:${u.outputIndex}`)),
        greatestToLeast: true,
        alkaneId: alkaneToSpend.alkaneId,
        targetNumberOfAlkanes: alkaneToSpend.amount
      });

      for (const u of selectedUtxos) {
        const utxoId = `${u.txId}:${u.outputIndex}`;
        if (!spentUtxoIds.has(utxoId)) {
          alkaneUtxosToSpend.push(u);
          spentUtxoIds.add(utxoId);
        }
      }
    }

    const protostone: Buffer = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.message({
          protocolTag: 1n,
          edicts,
          pointer: 0,
          refundPointer: 0,
          calldata: encipher(calldata),
        }),
      ],
    }).encodedRunestone

    console.log(
      await alkanes.execute({
        protostone,
        utxos: accountSpendableTotalUtxos,
        alkanesUtxos: alkaneUtxosToSpend,
        feeRate: wallet.feeRate,
        account: wallet.account,
        signer: wallet.signer,
        provider: wallet.provider,
      })
    )
  })

/* @dev example call 
  oyl alkane   -data "2,9,1" -p alkanes -feeRate 5 -blk 2 -tx 1 -amt 200

  Burns an alkane LP token amount
*/
export const alkaneRemoveLiquidity = new AlkanesCommand('remove-liquidity')
  .requiredOption(
    '-data, --calldata <calldata>',
    'op code + params to be called on a contract',
    (value, previous) => {
      const items = value.split(',')
      return previous ? previous.concat(items) : items
    },
    []
  )
  .requiredOption('-amt, --amount <amount>', 'amount to burn')
  .requiredOption('-blk, --block <block>', 'block number')
  .requiredOption('-tx, --txNum <txNum>', 'transaction number')
  .option(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  .option('-feeRate, --feeRate <feeRate>', 'fee rate')
  .action(async (options) => {
    const wallet: Wallet = new Wallet(options)

    const { accountUtxos } = await utxo.accountUtxos({
      account: wallet.account,
      provider: wallet.provider,
    })

    const calldata: bigint[] = options.calldata.map((item) => BigInt(item))

    console.log(
      await removeLiquidity({
        calldata,
        token: { block: options.block, tx: options.txNum },
        tokenAmount: BigInt(options.amount),
        utxos: accountUtxos,
        feeRate: wallet.feeRate,
        account: wallet.account,
        signer: wallet.signer,
        provider: wallet.provider,
      })
    )
  })

/* @dev example call 
  oyl alkane swap -data "2,7,3,160" -p alkanes -feeRate 5 -blk 2 -tx 1 -amt 200

  Swaps an alkane from a pool
*/
export const alkaneSwap = new AlkanesCommand('swap')
  .requiredOption(
    '-data, --calldata <calldata>',
    'op code + params to be called on a contract',
    (value, previous) => {
      const items = value.split(',')
      return previous ? previous.concat(items) : items
    },
    []
  )
  .requiredOption('-amt, --amount <amount>', 'amount to swap')
  .requiredOption('-blk, --block <block>', 'block number')
  .requiredOption('-tx, --txNum <txNum>', 'transaction number')
  .option(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  .option('-feeRate, --feeRate <feeRate>', 'fee rate')
  .action(async (options) => {
    const wallet: Wallet = new Wallet(options)

    const { accountUtxos } = await utxo.accountUtxos({
      account: wallet.account,
      provider: wallet.provider,
    })

    const calldata: bigint[] = options.calldata.map((item) => BigInt(item))

    console.log(
      await swap({
        calldata,
        token: { block: options.block, tx: options.txNum },
        tokenAmount: BigInt(options.amount),
        utxos: accountUtxos,
        feeRate: wallet.feeRate,
        account: wallet.account,
        signer: wallet.signer,
        provider: wallet.provider,
      })
    )
  })

/* @dev example call 
  oyl alkane send -blk 2 -tx 1 -amt 200 -to bcrt1pkq6ayylfpe5hn05550ry25pkakuf72x9qkjc2sl06dfcet8sg25ql4dm73

  Sends an alkane token amount to a given address (example is sending token with Alkane ID [2, 1]) 
*/
export const alkaneSend = new AlkanesCommand('send')
  .requiredOption('-to, --to <to>')
  .requiredOption('-amt, --amount <amount>')
  .requiredOption('-blk, --block <block>')
  .requiredOption('-tx, --txNum <txNum>')
  .option(
    '-m, --mnemonic <mnemonic>',
    '(optional) Mnemonic used for signing transactions (default = TEST_WALLET)'
  )
  .option(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  .option('-feeRate, --feeRate <feeRate>', 'fee rate')
  .action(async (options) => {
    const wallet: Wallet = new Wallet(options)

    const { accountUtxos } = await utxo.accountUtxos({
      account: wallet.account,
      provider: wallet.provider,
    })

    console.log(
      await send({
        utxos: accountUtxos,
        alkaneId: { block: options.block, tx: options.txNum },
        toAddress: options.to,
        amount: Number(options.amount),
        account: wallet.account,
        signer: wallet.signer,
        provider: wallet.provider,
        feeRate: wallet.feeRate,
      })
    )
  })

/* @dev example call 
 oyl alkane create-pool -data "2,1,1" -tokens "2:12:1500,2:29:1500" -feeRate 5 -p oylnet

Creates a new pool with the given tokens and amounts
*/
export const alkaneCreatePool = new AlkanesCommand('create-pool')
  .requiredOption(
    '-data, --calldata <calldata>',
    'op code + params to be called on a contract',
    (value, previous) => {
      const items = value.split(',')
      return previous ? previous.concat(items) : items
    },
    []
  )
  .requiredOption(
    '-tokens, --tokens <tokens>',
    'tokens and amounts to pair for pool',
    (value, previous) => {
      const items = value.split(',')
      return previous ? previous.concat(items) : items
    },
    []
  )
  .option(
    '-m, --mnemonic <mnemonic>',
    '(optional) Mnemonic used for signing transactions (default = TEST_WALLET)'
  )
  .option(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  .option('-feeRate, --feeRate <feeRate>', 'fee rate')
  .action(async (options) => {
    const wallet: Wallet = new Wallet(options)

    const { accountUtxos } = await utxo.accountUtxos({
      account: wallet.account,
      provider: wallet.provider,
    })

    const calldata: bigint[] = options.calldata.map((item) => BigInt(item))

    const alkaneTokensToPool = options.tokens.map((item) => {
      const [block, tx, amount] = item.split(':').map((part) => part.trim())
      return {
        alkaneId: { block: block, tx: tx },
        amount: BigInt(amount),
      }
    })

    console.log(
      await createNewPool({
        calldata,
        token0: alkaneTokensToPool[0].alkaneId,
        token0Amount: alkaneTokensToPool[0].amount,
        token1: alkaneTokensToPool[1].alkaneId,
        token1Amount: alkaneTokensToPool[1].amount,
        utxos: accountUtxos,
        feeRate: wallet.feeRate,
        account: wallet.account,
        signer: wallet.signer,
        provider: wallet.provider,
      })
    )
  })

/* @dev example call 
 oyl alkane add-liquidity -data "2,1,1" -tokens "2:2:50000,2:3:50000" -feeRate 5 -p alkanes

Mints new LP tokens and adds liquidity to the pool with the given tokens and amounts
*/
export const alkaneAddLiquidity = new AlkanesCommand('add-liquidity')
  .requiredOption(
    '-data, --calldata <calldata>',
    'op code + params to be called on a contract',
    (value, previous) => {
      const items = value.split(',')
      return previous ? previous.concat(items) : items
    },
    []
  )
  .requiredOption(
    '-tokens, --tokens <tokens>',
    'tokens and amounts to pair for pool',
    (value, previous) => {
      const items = value.split(',')
      return previous ? previous.concat(items) : items
    },
    []
  )
  .option(
    '-m, --mnemonic <mnemonic>',
    '(optional) Mnemonic used for signing transactions (default = TEST_WALLET)'
  )
  .option(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  .option('-feeRate, --feeRate <feeRate>', 'fee rate')
  .action(async (options) => {
    const wallet: Wallet = new Wallet(options)

    const { accountUtxos } = await utxo.accountUtxos({
      account: wallet.account,
      provider: wallet.provider,
    })

    const calldata: bigint[] = options.calldata.map((item) => BigInt(item))

    const alkaneTokensToMint = options.tokens.map((item) => {
      const [block, tx, amount] = item.split(':').map((part) => part.trim())
      return {
        alkaneId: { block: block, tx: tx },
        amount: BigInt(amount),
      }
    })

    console.log(
      await addLiquidity({
        calldata,
        token0: alkaneTokensToMint[0].alkaneId,
        token0Amount: alkaneTokensToMint[0].amount,
        token1: alkaneTokensToMint[1].alkaneId,
        token1Amount: alkaneTokensToMint[1].amount,
        utxos: accountUtxos,
        feeRate: wallet.feeRate,
        account: wallet.account,
        signer: wallet.signer,
        provider: wallet.provider,
      })
    )
  })

/* @dev example call
 AMM factory:
 oyl alkane simulate  -target "2:1" -inputs "1,2,6,2,7" -tokens "2:6:1000,2:7:2000" -decoder "factory"
 oyl alkane simulate  -target "2:1" -inputs "2,2,3,2,4" -decoder "factory"

  Simulates an operation using the pool decoder
  First input is the opcode
*/
export const alkaneSimulate = new AlkanesCommand('simulate')
  .requiredOption(
    '-target, --target <target>',
    'target block:tx for simulation',
    (value) => {
      const [block, tx] = value.split(':').map((part) => part.trim())
      return { block: block.toString(), tx: tx.toString() }
    }
  )
  .requiredOption(
    '-inputs, --inputs <inputs>',
    'inputs for simulation (comma-separated)',
    (value) => value.split(',').map((item) => item.trim())
  )
  .option(
    '-tokens, --tokens <tokens>',
    'tokens and amounts to pair for pool',
    (value) => {
      return value.split(',').map((item) => {
        const [block, tx, value] = item.split(':').map((part) => part.trim())
        return {
          id: { block, tx },
          value,
        }
      })
    },
    []
  )
  .option(
    '-decoder, --decoder <decoder>',
    'decoder to use for simulation results (e.g., "pool")'
  )
  .option(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  .action(async (options) => {
    const wallet: Wallet = new Wallet(options)

    const request = {
      alkanes: options.tokens,
      transaction: '0x',
      block: '0x',
      height: '20000',
      txindex: 0,
      target: options.target,
      inputs: options.inputs,
      pointer: 0,
      refundPointer: 0,
      vout: 0,
    }

    let decoder: any
    switch (options.decoder) {
      case 'pool':
        const { AlkanesAMMPoolDecoder } = await import('../amm/pool')
        decoder = (result: any) =>
          AlkanesAMMPoolDecoder.decodeSimulation(
            result,
            Number(options.inputs[0])
          )
        break
      case 'factory':
        const { AlkanesAMMPoolFactoryDecoder } = await import('../amm/factory')
        decoder = (result: any) =>
          AlkanesAMMPoolFactoryDecoder.decodeSimulation(
            result,
            Number(options.inputs[0])
          )
    }

    console.log(
      JSON.stringify(
        await wallet.provider.alkanes.simulate(request, decoder),
        null,
        2
      )
    )
  })

/* @dev example call
 oyl alkane get-all-pools-details -target "2:1"

 Gets details for all pools by:
 1. Getting all pool IDs from the factory contract
 2. For each pool ID, getting its details
 3. Returning a combined result with all pool details
*/
export const alkaneGetAllPoolsDetails = new AlkanesCommand(
  'get-all-pools-details'
)
  .requiredOption(
    '-target, --target <target>',
    'target block:tx for the factory contract',
    (value) => {
      const [block, tx] = value.split(':').map((part) => part.trim())
      return { block: block.toString(), tx: tx.toString() }
    }
  )
  .option(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  .action(async (options) => {
    const wallet: Wallet = new Wallet(options)

    const { AlkanesAMMPoolFactoryDecoder, PoolFactoryOpcodes } = await import(
      '../amm/factory'
    )

    const request = {
      alkanes: [],
      transaction: '0x',
      block: '0x',
      height: '20000',
      txindex: 0,
      target: options.target,
      inputs: [PoolFactoryOpcodes.GET_ALL_POOLS.toString()],
      pointer: 0,
      refundPointer: 0,
      vout: 0,
    }

    const factoryResult = await wallet.provider.alkanes.simulate(request)

    const factoryDecoder = new AlkanesAMMPoolFactoryDecoder()
    const allPoolsDetails = await factoryDecoder.decodeAllPoolsDetails(
      factoryResult.execution,
      wallet.provider
    )

    console.log(JSON.stringify(allPoolsDetails, null, 2))
  })

/* @dev example call
 oyl alkane preview-remove-liquidity -token "2:1" -amount 1000000

 Previews the tokens that would be received when removing liquidity from a pool
*/
export const alkanePreviewRemoveLiquidity = new AlkanesCommand(
  'preview-remove-liquidity'
)
  .requiredOption(
    '-token, --token <token>',
    'LP token ID in the format block:tx',
    (value) => {
      const [block, tx] = value.split(':').map((part) => part.trim())
      return { block: block.toString(), tx: tx.toString() }
    }
  )
  .requiredOption(
    '-amount, --amount <amount>',
    'Amount of LP tokens to remove',
    (value) => BigInt(value)
  )
  .option(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  .action(async (options) => {
    const wallet: Wallet = new Wallet(options)

    try {
      const previewResult =
        await wallet.provider.alkanes.previewRemoveLiquidity({
          token: options.token,
          tokenAmount: options.amount,
        })

      console.log(
        JSON.stringify(
          {
            token0: `${previewResult.token0.block}:${previewResult.token0.tx}`,
            token1: `${previewResult.token1.block}:${previewResult.token1.tx}`,
            token0Amount: previewResult.token0Amount.toString(),
            token1Amount: previewResult.token1Amount.toString(),
          },
          null,
          2
        )
      )
    } catch (error) {
      console.error('Error previewing liquidity removal:', error.message)
    }
  })

class SchemaMerkleLeaf {
  address: string;
  amount: bigint;

  constructor({ address, amount }: { address: string; amount: bigint }) {
    this.address = address;
    this.amount = amount;
  }
}

class SchemaMerkleProof {
  leaf: Uint8Array;
  proofs: Uint8Array[];

  constructor({ leaf, proofs }: { leaf: Uint8Array; proofs: Uint8Array[] }) {
    this.leaf = leaf;
    this.proofs = proofs;
  }
}

const leafSchema = {
  struct: {
    address: 'string',
    amount: 'u128'
  }
};

const proofSchema = {
  struct: {
    leaf: { array: { type: 'u8' } },
    proofs: { array: { type: { array: { type: 'u8' } } } }
  }
};

function calculateMerkleRoot(leafHashes: Uint8Array[]): Uint8Array {
  if (leafHashes.length === 0) {
    return new Uint8Array(32);
  }
  let nodes = [...leafHashes];
  while (nodes.length > 1) {
    if (nodes.length % 2 !== 0) {
      nodes.push(nodes[nodes.length - 1]);
    }
    const nextLevel: Uint8Array[] = [];
    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i];
      const right = nodes[i + 1];
      let sorted: Uint8Array[];
      if (Buffer.compare(left, right) <= 0) {
        sorted = [left, right];
      } else {
        sorted = [right, left];
      }
      const parent = sha256(Buffer.concat(sorted));
      nextLevel.push(parent);
    }
    nodes = nextLevel;
  }
  return nodes[0];
}

function generateProof(leafHashes: Uint8Array[], leafIndex: number): Uint8Array[] {
  if (leafHashes.length <= 1) {
    return [];
  }

  const proof: Uint8Array[] = [];
  let nodes = [...leafHashes];
  let currentIndex = leafIndex;

  while (nodes.length > 1) {
    if (nodes.length % 2 !== 0) {
      nodes.push(nodes[nodes.length - 1]);
    }

    const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
    proof.push(nodes[siblingIndex]);

    const nextLevel: Uint8Array[] = [];
    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i];
      const right = nodes[i + 1];
      let sorted: Uint8Array[];
      if (Buffer.compare(left, right) <= 0) {
        sorted = [left, right];
      } else {
        sorted = [right, left];
      }
      const parent = sha256(Buffer.concat(sorted));
      nextLevel.push(parent);
    }
    nodes = nextLevel;
    currentIndex = Math.floor(currentIndex / 2);
  }
  return proof;
}

export const initMerkleRoot = new AlkanesCommand('init-merkle-root')
  .description('Initializes a merkle distributor contract.')
  .requiredOption('-f, --file <file>', 'Path to the CSV file.')
  .requiredOption('-d, --deadline <deadline>', 'Latest block to claim rewards')
  .requiredOption('-t, --target <target>', 'The alkane id of the merkle distributor contract to initialize. Format in "block:tx".')
  .requiredOption('-a, --alkane <alkane>', 'The alkane id and amount of the reward token to use. Expected format is block:tx:amount')
  .option('-wp, --witness-proxy <witnessProxy>', 'The alkane id of the witness proxy contract if opreturn too large. Expected format is block:tx')
  .option('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
  .option('-feeRate, --feeRate <feeRate>', 'fee rate')
  .action(async (options) => {
    const wallet: Wallet = new Wallet(options);
    const { accountUtxos, accounts } = await utxo.accountUtxos({
      account: wallet.account,
      provider: wallet.provider,
    });

    let allAlkaneUtxos: utxo.FormattedUtxo[] = [];
    for (const address in accounts) {
      if (accounts[address].alkaneUtxos) {
        allAlkaneUtxos.push(...accounts[address].alkaneUtxos);
      }
    }

    let reward = alkanes.toAlkaneId(options.alkane);

    const { utxos: tokenUtxos } =
      utxo.selectAlkanesUtxos({
        utxos: allAlkaneUtxos,
        greatestToLeast: false,
        targetNumberOfAlkanes: reward.amount,
        alkaneId: reward.alkaneId,
      });

    const fileContent = await fs.readFile(options.file, 'utf-8');
    const records: { address: string, amount: string }[] = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
    });

    const leaves = records.map(record => new SchemaMerkleLeaf({
      address: record.address,
      amount: BigInt(record.amount),
    }));

    const leafHashes = leaves.map(leaf => {
      const serializedLeaf = borsh.serialize(leafSchema, leaf);
      return sha256(serializedLeaf);
    });

    const root = calculateMerkleRoot(leafHashes);
    const rootFirstHalf = BigInt('0x' + Buffer.from(root.slice(0, 16)).toString('hex'));
    const rootSecondHalf = BigInt('0x' + Buffer.from(root.slice(16, 32)).toString('hex'));

    const [block, tx] = options.target.split(':');


    const merkleCalldata = [
      BigInt(block),
      BigInt(tx),
      BigInt(0), // initialize opcode
      BigInt(reward.alkaneId.block),
      BigInt(reward.alkaneId.tx),
      BigInt(reward.amount),
      BigInt(0), // remove
      BigInt(options.deadline),
      rootFirstHalf,
      rootSecondHalf
    ];


    let calldata = options.witnessProxy ? [
      ...options.witnessProxy.split(':').map(s => BigInt(s)),
      BigInt(0)
    ] : merkleCalldata;

    const protostone = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.message({
          protocolTag: 1n,
          edicts: [],
          pointer: 0,
          refundPointer: 0,
          calldata: encipher(calldata),
        }),
      ],
    }).encodedRunestone;

    if (options.witnessProxy) {
      const payload: AlkanesPayload = {
        body: encipher(merkleCalldata),
        cursed: false,
        tags: { contentType: 'application/octet-stream' },
      };

      console.log(
        await inscribePayload({
          protostone,
          payload,
          alkanesUtxos: tokenUtxos,
          utxos: accountUtxos,
          feeRate: wallet.feeRate,
          account: wallet.account,
          signer: wallet.signer,
          provider: wallet.provider,
        })
      );
    } else {
      console.log(
        await alkanes.execute({
          protostone,
          utxos: accountUtxos,
          alkanesUtxos: tokenUtxos,
          feeRate: wallet.feeRate,
          account: wallet.account,
          signer: wallet.signer,
          provider: wallet.provider,
        })
      );
    }

  });

export const merkleClaim = new AlkanesCommand('merkle-claim')
  .description('Inscribes a merkle proof and claims tokens.')
  .requiredOption('-f, --file <file>', 'Path to the CSV file with all leaves.')
  .requiredOption('-c, --claim-address <claimAddress>', 'The address to claim for.')
  .requiredOption('-t, --target <target>', 'The alkane id of the merkle distributor contract.')
  .option('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
  .option('-feeRate, --feeRate <feeRate>', 'fee rate')
  .action(async (options) => {
    const wallet: Wallet = new Wallet(options);
    const { accountUtxos } = await utxo.accountUtxos({
      account: wallet.account,
      provider: wallet.provider,
    });

    const fileContent = await fs.readFile(options.file, 'utf-8');
    const records: { address: string, amount: string }[] = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
    });

    const leaves = records.map(record => new SchemaMerkleLeaf({
      address: record.address,
      amount: BigInt(record.amount),
    }));

    const leafIndex = leaves.findIndex(leaf => leaf.address === options.claimAddress);
    if (leafIndex === -1) {
      throw new Error(`Address ${options.claimAddress} not found in the CSV file.`);
    }

    const leafToClaim = leaves[leafIndex];
    const serializedLeaf = borsh.serialize(leafSchema, leafToClaim);

    const leafHashes = leaves.map(leaf => {
      const serialized = borsh.serialize(leafSchema, leaf);
      return sha256(serialized);
    });

    const proofHashes = generateProof(leafHashes, leafIndex);

    const merkleProof = new SchemaMerkleProof({
      leaf: serializedLeaf,
      proofs: proofHashes,
    });

    const witnessData = borsh.serialize(proofSchema, merkleProof);

    const [block, tx] = options.target.split(':');

    const calldata = [BigInt(1), BigInt(block), BigInt(tx)]; // Opcode 1 for claim

    const protostone = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.message({
          protocolTag: 1n,
          edicts: [],
          pointer: 0,
          refundPointer: 0,
          calldata: encipher(calldata),
        }),
      ],
    }).encodedRunestone;

    const payload: AlkanesPayload = {
      body: witnessData,
      cursed: false,
      tags: { contentType: 'application/octet-stream' },
    };

    console.log(
      await inscribePayload({
        protostone,
        payload,
        utxos: accountUtxos,
        feeRate: wallet.feeRate,
        account: wallet.account,
        signer: wallet.signer,
        provider: wallet.provider,
      })
    );
  });
