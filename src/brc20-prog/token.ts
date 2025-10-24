import { deployCommit, deployReveal } from '../alkanes/alkanes'
import { Account, Signer, Provider, AlkanesPayload } from '..'
import * as bitcoin from 'bitcoinjs-lib'
import { timeout } from '../shared/utils'
import { FormattedUtxo } from '../utxo'

export const inscribeJson = async ({
  json,
  utxos,
  account,
  provider,
  feeRate,
  signer,
}: {
  json: any
  utxos: FormattedUtxo[]
  account: Account
  provider: Provider
  feeRate?: number
  signer: Signer
}) => {
  const payload: AlkanesPayload = {
    body: Buffer.from(JSON.stringify(json)),
    cursed: false,
    tags: { contentType: 'text/plain' },
  }

  const { script, txId, commitPsbt } = await deployCommit({
    payload,
    utxos,
    account,
    provider,
    feeRate,
    signer,
    protostone: Buffer.from([]), // No protostone for brc20-prog
  })

  await timeout(3000)

  const reveal = await deployReveal({
    payload,
    utxos,
    protostone: Buffer.from([]), // No protostone for brc20-prog
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
