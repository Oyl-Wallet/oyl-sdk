import { Provider } from '../provider/provider'
import { Account } from '../account'
import * as bitcoin from 'bitcoinjs-lib'
import { formatInputsToSign } from '../shared/utils'
import { FormattedUtxo } from '../utxo/types'
import { addInputForUtxo } from '../alkanes/alkanes'

export async function createRBFPsbt(
  txid: string,
  new_fee_rate: number,
  account: Account,
  provider: Provider
) {
  // 1. Fetch raw tx hex
  const txHex = await provider.sandshrew.bitcoindRpc.getRawTransaction?.(
    txid,
    0
  )
  if (!txHex) throw new Error('Could not fetch raw transaction')
  // 2. Decode raw tx
  const tx = bitcoin.Transaction.fromHex(txHex)

  // 3. Gather all wallet addresses (taproot, segwit, etc)
  const walletAddresses: string[] = []
  if (account.taproot?.address) walletAddresses.push(account.taproot.address)
  if (account.nativeSegwit?.address)
    walletAddresses.push(account.nativeSegwit.address)
  if (account.nestedSegwit?.address)
    walletAddresses.push(account.nestedSegwit.address)
  if (account.legacy?.address) walletAddresses.push(account.legacy.address)

  // 4. Prepare new PSBT
  const psbt = new bitcoin.Psbt({ network: provider.network })
  const dummyPsbt = new bitcoin.Psbt({ network: provider.network })

  // 5. For each input, fetch prevout and add to PSBT if it belongs to us
  const inputValues: number[] = []
  for (let i = 0; i < tx.ins.length; i++) {
    const input = tx.ins[i]
    if (!input) continue
    const prevTxId = Buffer.from(input.hash).reverse().toString('hex')
    const prevTxInfo = await provider.esplora.getTxInfo(prevTxId)
    if (!prevTxInfo) throw new Error('Could not fetch prevout tx info')
    const prevout = prevTxInfo.vout[input.index]
    if (!prevout) throw new Error('Prevout not found')
    inputValues.push(prevout.value)
    const prevoutAddress = prevout.scriptpubkey_address
    if (walletAddresses.includes(prevoutAddress)) {
      // This input belongs to us, use the helper
      const data: FormattedUtxo = {
        txId: prevTxId,
        outputIndex: input.index,
        satoshis: prevout.value,
        scriptPk: prevout.scriptpubkey,
        address: prevoutAddress,
        inscriptions: [],
        runes: {},
        alkanes: {},
        confirmations: 0,
        indexed: true,
      }
      await addInputForUtxo(psbt, data, account, provider)
      await addInputForUtxo(dummyPsbt, data, account, provider)
    } else {
      // Not our input, add minimal info
      const prevTxHex =
        await provider.sandshrew.bitcoindRpc.getRawTransaction?.(prevTxId, 0)
      const i = {
        hash: prevTxId,
        index: input.index,
        nonWitnessUtxo: Buffer.from(prevTxHex, 'hex'),
      }
      psbt.addInput(i)
      dummyPsbt.addInput(i)
    }
  }

  // 6. Copy outputs, but adjust change output for new fee
  let totalOutput = 0
  tx.outs.forEach((out, i) => {
    dummyPsbt.addOutput({
      script: out.script,
      value: out.value,
    })
    totalOutput += out.value
  })
  // 7. Calculate new fee and adjust change output
  const vsize = tx.virtualSize ? tx.virtualSize() : tx.byteLength()
  const newFee = Math.ceil(new_fee_rate * vsize)
  const changeIdx = tx.outs.length - 1

  if (changeIdx >= 0 && tx.outs[changeIdx]) {
    // Compute the old fee as sum(inputs) - sum(outputs)
    const oldFee =
      inputValues.reduce((a, b) => a + b, 0) -
      tx.outs.reduce((a, b) => a + b.value, 0)
    const feeDiff = newFee - oldFee
    const newValue = tx.outs[changeIdx].value - feeDiff
    if (newValue < 0) throw new Error('Insufficient change for new fee')

    tx.outs.forEach((out, i) => {
      if (i !== changeIdx) {
        psbt.addOutput({
          script: out.script,
          value: out.value,
        })
      } else {
        psbt.addOutput({
          script: out.script,
          value: newValue,
        })
      }
    })
  } else {
    throw new Error('No change output found')
  }

  const formatted = await formatInputsToSign({
    _psbt: psbt,
    senderPublicKey: account.taproot.pubkey,
    network: provider.network,
  })

  return { psbt: formatted.toBase64(), newFee }
}
