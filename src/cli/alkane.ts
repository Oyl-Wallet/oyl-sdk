import { Command } from 'commander'
import fs from 'fs-extra'
import { gzip as _gzip } from 'node:zlib'
import { promisify } from 'util'
import path from 'path'
import * as alkanes from '../alkanes/alkanes'
import * as utxo from '../utxo'
import { Wallet } from './wallet'
import { contractDeployment } from '../alkanes/contract'
import { send, split, tokenDeployment } from '../alkanes/token'
import { AlkanesPayload } from 'shared/interface'
import { encodeRunestoneProtostone } from 'alkanes/lib/protorune/proto_runestone_upgrade'
import { ProtoStone } from 'alkanes/lib/protorune/protostone'
import { encipher } from 'alkanes/lib/bytes'
import { ProtoruneEdict } from 'alkanes/lib/protorune/protoruneedict'
import { ProtoruneRuneId } from 'alkanes/lib/protorune/protoruneruneid'
import { u128 } from '@magiceden-oss/runestone-lib/dist/src/integer'
import { createNewPool, splitAlkaneUtxos } from '../amm/factory'
import { removeLiquidity, addLiquidity, swap } from '../amm/pool'

/* @dev example call
  oyl alkane trace -params '{"txid":"0322c3a2ce665485c8125cd0334675f0ddbd7d5b278936144efb108ff59c49b5","vout":0}'

  Note the json format if you need to pass an object.
*/
export const alkanesTrace = new Command('trace')
  .description('Returns data based on txid and vout of deployed alkane')
  .option('-p, --provider <provider>', 'provider to use to access the network.')
  .option(
    '-params, --parameters <parameters>',
    'parameters for the ord method you are calling.'
  )
  .option(
    '--metashrew-rpc-url <url>',
    'Direct URL to metashrew RPC endpoint'
  )
  .action(async (options) => {
    const wallet: Wallet = new Wallet({
      provider: options.provider,
      metashrewRpcUrl: options.metashrewRpcUrl
    })
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
export const alkaneContractDeploy = new Command('new-contract')
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
  .option(
    '--metashrew-rpc-url <url>',
    'Direct URL to metashrew RPC endpoint'
  )
  .action(async (options) => {
    const wallet: Wallet = new Wallet({
      provider: options.provider,
      feeRate: options.feeRate,
      metashrewRpcUrl: options.metashrewRpcUrl
    })
    const { accountSpendableTotalUtxos, accountSpendableTotalBalance } =
      await utxo.accountUtxos({
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
        gatheredUtxos: {
          utxos: accountSpendableTotalUtxos,
          totalAmount: accountSpendableTotalBalance,
        },
        feeRate: wallet.feeRate,
        account: wallet.account,
        signer: wallet.signer,
        provider: wallet.provider,
      })
    )
  })

/* @dev example call 
  oyl alkane new-token -pre 5000 -amount 1000 -c 100000 -name "OYL" -symbol "OL" -resNumber 77 -i ./src/cli/contracts/image.png
  
  The resNumber must be a resNumber for a deployed contract. In this case 77 is the resNumber for 
  the free_mint.wasm contract and the options supplied are for the free_mint.wasm contract.

  The token will deploy to the next available [2, n] Alkane ID.

  To get information on the deployed token, you can use the oyl alkane trace command 
  using the returned txid and vout: 4

  Remember to genBlocks after transactions...
*/
export const alkaneTokenDeploy = new Command('new-token')
  .requiredOption(
    '-resNumber, --reserveNumber <reserveNumber>',
    'Number to reserve for factory id'
  )
  .requiredOption('-c, --cap <cap>', 'the token cap')
  .requiredOption('-name, --token-name <name>', 'the token name')
  .requiredOption('-symbol, --token-symbol <symbol>', 'the token symbol')
  .requiredOption(
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
  .option('-feeRate, --feeRate <feeRate>', 'fee rate')
  .option(
    '--metashrew-rpc-url <url>',
    'Direct URL to metashrew RPC endpoint'
  )
  .action(async (options) => {
    const wallet: Wallet = new Wallet({
      provider: options.provider,
      feeRate: options.feeRate,
      metashrewRpcUrl: options.metashrewRpcUrl
    })

    const { accountSpendableTotalUtxos, accountSpendableTotalBalance } =
      await utxo.accountUtxos({
        account: wallet.account,
        provider: wallet.provider,
      })

    const calldata = [
      BigInt(6),
      BigInt(options.reserveNumber),
      BigInt(0),
      BigInt(options.premine ?? 0),
      BigInt(options.amountPerMint),
      BigInt(options.cap),
      BigInt(
        '0x' +
          Buffer.from(options.tokenName.split('').reverse().join('')).toString(
            'hex'
          )
      ),
      BigInt(0),
      BigInt(
        '0x' +
          Buffer.from(
            options.tokenSymbol.split('').reverse().join('')
          ).toString('hex')
      ),
    ]

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
        await tokenDeployment({
          payload,
          protostone,
          gatheredUtxos: {
            utxos: accountSpendableTotalUtxos,
            totalAmount: accountSpendableTotalBalance,
          },
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
        gatheredUtxos: {
          utxos: accountSpendableTotalUtxos,
          totalAmount: accountSpendableTotalBalance,
        },
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
export const alkaneExecute = new Command('execute')
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
    '-m, --mnemonic <mnemonic>',
    '(optional) Mnemonic used for signing transactions (default = TEST_WALLET)'
  )
  .option(
    '-p, --provider <provider>',
    'Network provider type (regtest, bitcoin)'
  )
  .option('-feeRate, --feeRate <feeRate>', 'fee rate')
  .option(
    '--metashrew-rpc-url <url>',
    'Direct URL to metashrew RPC endpoint'
  )
  .action(async (options) => {
    const wallet: Wallet = new Wallet({
      provider: options.provider,
      mnemonic: options.mnemonic,
      feeRate: options.feeRate,
      metashrewRpcUrl: options.metashrewRpcUrl
    })

    const { accountSpendableTotalUtxos, accountSpendableTotalBalance } =
      await utxo.accountUtxos({
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
        gatheredUtxos: {
          utxos: accountSpendableTotalUtxos,
          totalAmount: accountSpendableTotalBalance,
        },
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
export const alkaneRemoveLiquidity = new Command('remove-liquidity')
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
  .option(
    '--metashrew-rpc-url <url>',
    'Direct URL to metashrew RPC endpoint'
  )
  .action(async (options) => {
    const wallet: Wallet = new Wallet({
      provider: options.provider,
      feeRate: options.feeRate,
      metashrewRpcUrl: options.metashrewRpcUrl
    })

    const { accountSpendableTotalUtxos, accountSpendableTotalBalance } =
      await utxo.accountUtxos({
        account: wallet.account,
        provider: wallet.provider,
      })

    const calldata: bigint[] = options.calldata.map((item) => BigInt(item))

    console.log(
      await removeLiquidity({
        calldata,
        token: { block: options.block, tx: options.txNum },
        tokenAmount: BigInt(options.amount),
        gatheredUtxos: {
          utxos: accountSpendableTotalUtxos,
          totalAmount: accountSpendableTotalBalance,
        },
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
export const alkaneSwap = new Command('swap')
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
  .option(
    '--metashrew-rpc-url <url>',
    'Direct URL to metashrew RPC endpoint'
  )
  .action(async (options) => {
    const wallet: Wallet = new Wallet({
      provider: options.provider,
      feeRate: options.feeRate,
      metashrewRpcUrl: options.metashrewRpcUrl
    })

    const { accountSpendableTotalUtxos, accountSpendableTotalBalance } =
      await utxo.accountUtxos({
        account: wallet.account,
        provider: wallet.provider,
      })

    const calldata: bigint[] = options.calldata.map((item) => BigInt(item))

    console.log(
      await swap({
        calldata,
        token: { block: options.block, tx: options.txNum },
        tokenAmount: BigInt(options.amount),
        gatheredUtxos: {
          utxos: accountSpendableTotalUtxos,
          totalAmount: accountSpendableTotalBalance,
        },
        feeRate: wallet.feeRate,
        account: wallet.account,
        signer: wallet.signer,
        provider: wallet.provider,
      })
    )
  })

/* @dev example call 
 oyl alkane split -tokens 2:8:20000,2:9:20000 -feeRate 5

Splits an alkane token amount(s) to a send the split amount to a new outpoint
*/
export const alkaneSplit = new Command('split')
  .requiredOption(
    '-tokens, --tokens <tokens>',
    'tokens to split and amounts',
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
  .option(
    '--metashrew-rpc-url <url>',
    'Direct URL to metashrew RPC endpoint'
  )
  .action(async (options) => {
    const wallet: Wallet = new Wallet({
      provider: options.provider,
      mnemonic: options.mnemonic,
      feeRate: options.feeRate,
      metashrewRpcUrl: options.metashrewRpcUrl
    })

    const { accountSpendableTotalUtxos, accountSpendableTotalBalance } =
      await utxo.accountUtxos({
        account: wallet.account,
        provider: wallet.provider,
      })

    const alkaneTokensToSplit = options.tokens.map((item) => {
      const [block, tx, amount] = item.split(':').map((part) => part.trim())
      return {
        alkaneId: { block: block, tx: tx },
        amount: BigInt(amount),
      }
    })

    const { alkaneUtxos, totalSatoshis, protostone } = await splitAlkaneUtxos(
      alkaneTokensToSplit,
      wallet.account,
      wallet.provider
    )
    console.log(
      await split({
        alkaneUtxos: {
          alkaneUtxos,
          totalSatoshis,
        },
        gatheredUtxos: {
          utxos: accountSpendableTotalUtxos,
          totalAmount: accountSpendableTotalBalance,
        },
        account: wallet.account,
        protostone,
        provider: wallet.provider,
        feeRate: wallet.feeRate,
        signer: wallet.signer,
      })
    )
  })

/* @dev example call 
  oyl alkane send -blk 2 -tx 1 -amt 200 -to bcrt1pkq6ayylfpe5hn05550ry25pkakuf72x9qkjc2sl06dfcet8sg25ql4dm73

  Sends an alkane token amount to a given address (example is sending token with Alkane ID [2, 1]) 
*/
export const alkaneSend = new Command('send')
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
  .option(
    '--metashrew-rpc-url <url>',
    'Direct URL to metashrew RPC endpoint'
  )
  .action(async (options) => {
    const wallet: Wallet = new Wallet({
      provider: options.provider,
      mnemonic: options.mnemonic,
      feeRate: options.feeRate,
      metashrewRpcUrl: options.metashrewRpcUrl
    })

    const { accountSpendableTotalUtxos, accountSpendableTotalBalance } =
      await utxo.accountUtxos({
        account: wallet.account,
        provider: wallet.provider,
      })

    console.log(
      await send({
        alkaneId: { block: options.block, tx: options.txNum },
        toAddress: options.to,
        amount: Number(options.amount),
        gatheredUtxos: {
          utxos: accountSpendableTotalUtxos,
          totalAmount: accountSpendableTotalBalance,
        },
        account: wallet.account,
        signer: wallet.signer,
        provider: wallet.provider,
        feeRate: wallet.feeRate,
      })
    )
  })

/* @dev example call 
 oyl alkane create-pool -data "2,1,1" -tokens "2:2:50000,2:3:50000" -feeRate 5 -p alkanes

Creates a new pool with the given tokens and amounts
*/
export const alkaneCreatePool = new Command('create-pool')
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
  .option(
    '--metashrew-rpc-url <url>',
    'Direct URL to metashrew RPC endpoint'
  )
  .action(async (options) => {
    const wallet: Wallet = new Wallet({
      provider: options.provider,
      mnemonic: options.mnemonic,
      feeRate: options.feeRate,
      metashrewRpcUrl: options.metashrewRpcUrl
    })

    const { accountSpendableTotalUtxos, accountSpendableTotalBalance } =
      await utxo.accountUtxos({
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
        gatheredUtxos: {
          utxos: accountSpendableTotalUtxos,
          totalAmount: accountSpendableTotalBalance,
        },
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
export const alkaneAddLiquidity = new Command('add-liquidity')
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
  .option(
    '--metashrew-rpc-url <url>',
    'Direct URL to metashrew RPC endpoint'
  )
  .action(async (options) => {
    const wallet: Wallet = new Wallet({
      provider: options.provider,
      mnemonic: options.mnemonic,
      feeRate: options.feeRate,
      metashrewRpcUrl: options.metashrewRpcUrl
    })

    const { accountSpendableTotalUtxos, accountSpendableTotalBalance } =
      await utxo.accountUtxos({
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
        gatheredUtxos: {
          utxos: accountSpendableTotalUtxos,
          totalAmount: accountSpendableTotalBalance,
        },
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
export const alkaneSimulate = new Command('simulate')
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
  .option(
    '--metashrew-rpc-url <url>',
    'Direct URL to metashrew RPC endpoint'
  )
  .action(async (options) => {
    const wallet: Wallet = new Wallet({
      provider: options.provider,
      metashrewRpcUrl: options.metashrewRpcUrl
    })

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
export const alkaneGetAllPoolsDetails = new Command('get-all-pools-details')
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
  .option(
    '--metashrew-rpc-url <url>',
    'Direct URL to metashrew RPC endpoint'
  )
  .action(async (options) => {
    const wallet: Wallet = new Wallet({
      provider: options.provider,
      metashrewRpcUrl: options.metashrewRpcUrl
    })

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
