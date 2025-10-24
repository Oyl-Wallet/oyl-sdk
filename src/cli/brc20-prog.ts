import { Command } from 'commander'
import { Wallet } from './wallet'
import * as utxo from '../utxo'
import { inscribeJson } from '../brc20-prog/token'
import { hex } from '@scure/base'
import { ZstdCodec } from 'zstd-codec'

export const brc20ProgDeployContract = new Command('deploy-contract')
  .description('Deploy a BRC20-PROG contract')
  .requiredOption('--bytecode <bytecode>', 'EVM bytecode in hex format')
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

    let bytecode: Buffer
    if (options.bytecode.startsWith('0x')) {
      bytecode = Buffer.from(options.bytecode.substring(2), 'hex')
    } else {
      bytecode = Buffer.from(options.bytecode, 'hex')
    }

    ZstdCodec.run(zstd => {
            const simple = new zstd.Simple();
      const compressed = simple.compress(bytecode);
      const prefixed = Buffer.concat([Buffer.from([0x02]), compressed]);
      const base64 = prefixed.toString('base64');

      const inscription = {
        p: 'brc20-prog',
        op: 'deploy',
        b: base64,
      }

      inscribeJson({
        json: inscription,
        utxos: accountUtxos,
        account: wallet.account,
        signer: wallet.signer,
        provider: wallet.provider,
        feeRate: wallet.feeRate,
      }).then(console.log)
    });
  })
