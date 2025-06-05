import * as bitcoin from 'bitcoinjs-lib'
import { createPsbt, splitUtxos } from './btc'
import { Account, mnemonicToAccount } from '../account/account'
import { Provider } from '../provider/provider'
import { FormattedUtxo } from '../utxo'
import { Signer } from '../signer'

const provider = new Provider({
  url: '',
  projectId: '',
  network: bitcoin.networks.regtest,
  networkType: 'mainnet',
})

const account: Account = mnemonicToAccount({
  mnemonic:
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  opts: { index: 0, network: bitcoin.networks.regtest },
})

const { address } = bitcoin.payments.p2wpkh({
  pubkey: Buffer.from(account.nativeSegwit.pubkey, 'hex'),
  network: bitcoin.networks.regtest,
})
const { output } = bitcoin.payments.p2wpkh({
  address,
  network: bitcoin.networks.regtest,
})
const scriptPk = output!.toString('hex')

const testFormattedUtxos: FormattedUtxo[] = [
  {
    txId: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b274',
    outputIndex: 0,
    satoshis: 100000,
    confirmations: 3,
    scriptPk,
    address: account.nativeSegwit.address,
    inscriptions: [],
    runes: {},
    alkanes: {},
    indexed: true,
  },
  {
    txId: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b275',
    outputIndex: 0,
    satoshis: 100000,
    confirmations: 3,
    scriptPk,
    address: account.nativeSegwit.address,
    inscriptions: [],
    runes: {},
    alkanes: {},
    indexed: true,
  },
]

describe('btc sendTx', () => {
  it('construct psbt', async () => {
    const result = await createPsbt({
      utxos: testFormattedUtxos,
      toAddress: address!,
      amount: 3000,
      feeRate: 10,
      account: account,
      provider: provider,
    })

    expect(result.psbt).toBeDefined()
  })
})

describe('splitUtxos', () => {
  const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
  
  // Mock signer
  const mockSigner = {
    signAllInputs: jest.fn().mockResolvedValue({
      signedPsbt: 'mock_signed_psbt'
    })
  } as unknown as Signer

  // Mock provider methods
  const mockProvider = {
    ...provider,
    esplora: {
      ...provider.esplora,
      getTxHex: jest.fn().mockResolvedValue('mock_tx_hex')
    },
    pushPsbt: jest.fn().mockResolvedValue({
      txId: 'mock_tx_id',
      rawTx: 'mock_raw_tx',
      size: 250,
      weight: 1000,
      fee: 2500,
      satsPerVByte: '10.00'
    })
  } as unknown as Provider

  const testUtxos: FormattedUtxo[] = [
    {
      txId: '72e22e25fa587c01cbd0a86a5727090c9cdf12e47126c99e35b24185c395b276',
      outputIndex: 0,
      satoshis: 1000000, // 0.01 BTC
      address: account.taproot.address,
      scriptPk: 'mock_script',
      inscriptions: [],
      runes: {},
      alkanes: {},
      indexed: true,
      confirmations: 3
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should split UTXOs by amounts and addresses', async () => {
    const splitConfig = {
      mode: 'amounts_and_addresses' as const,
      amounts: [100000, 200000, 300000],
      addresses: [
        account.taproot.address,
        account.nativeSegwit.address,
        account.nestedSegwit.address
      ]
    }

    const result = await splitUtxos({
      utxos: testUtxos,
      feeRate: 10,
      account,
      provider: mockProvider,
      signer: mockSigner,
      splitConfig
    })

    expect(result.txId).toBe('mock_tx_id')
    expect(result.outputs).toHaveLength(3)
    expect(result.outputs[0].amount).toBe(100000)
    expect(result.outputs[1].amount).toBe(200000)
    expect(result.outputs[2].amount).toBe(300000)
    expect(result.totalSplitAmount).toBe(600000)
    expect(mockSigner.signAllInputs).toHaveBeenCalled()
    expect(mockProvider.pushPsbt).toHaveBeenCalled()
  })

  it('should split UTXOs with auto-generated child accounts', async () => {
    const splitConfig = {
      mode: 'auto_generate' as const,
      amount: 100000,
      accountCount: 3,
      mnemonic
    }

    const result = await splitUtxos({
      utxos: testUtxos,
      feeRate: 10,
      account,
      provider: mockProvider,
      signer: mockSigner,
      splitConfig
    })

    expect(result.txId).toBe('mock_tx_id')
    expect(result.outputs).toHaveLength(3) // Main account + 2 child accounts
    expect(result.outputs[0].amount).toBe(100000)
    expect(result.outputs[1].amount).toBe(100000)
    expect(result.outputs[2].amount).toBe(100000)
    expect(result.totalSplitAmount).toBe(300000)
    expect(mockSigner.signAllInputs).toHaveBeenCalled()
    expect(mockProvider.pushPsbt).toHaveBeenCalled()
  })

  it('should throw error for mismatched amounts and addresses arrays', async () => {
    const splitConfig = {
      mode: 'amounts_and_addresses' as const,
      amounts: [100000, 200000],
      addresses: [account.taproot.address] // Only one address for two amounts
    }

    await expect(splitUtxos({
      utxos: testUtxos,
      feeRate: 10,
      account,
      provider: mockProvider,
      signer: mockSigner,
      splitConfig
    })).rejects.toThrow('Amounts and addresses arrays must have the same length')
  })

  it('should throw error for insufficient balance', async () => {
    const splitConfig = {
      mode: 'auto_generate' as const,
      amount: 2000000, // More than available
      accountCount: 2,
      mnemonic
    }

    await expect(splitUtxos({
      utxos: testUtxos,
      feeRate: 10,
      account,
      provider: mockProvider,
      signer: mockSigner,
      splitConfig
    })).rejects.toThrow('Insufficient balance')
  })

  it('should throw error for invalid account count', async () => {
    const splitConfig = {
      mode: 'auto_generate' as const,
      amount: 100000,
      accountCount: 0, // Invalid count
      mnemonic
    }

    await expect(splitUtxos({
      utxos: testUtxos,
      feeRate: 10,
      account,
      provider: mockProvider,
      signer: mockSigner,
      splitConfig
    })).rejects.toThrow('Account count must be at least 1')
  })
})
