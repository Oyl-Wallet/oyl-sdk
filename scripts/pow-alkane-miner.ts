import * as dotenv from 'dotenv'
import * as CryptoJS from 'crypto-js'
import * as alkanes from '../src/alkanes/alkanes'
import * as utxo from '../src/utxo'
import { mnemonicToAccount, Account, Signer, getWalletPrivateKeys, Provider, Network } from '../src'
import { encodeRunestoneProtostone } from 'alkanes/lib/protorune/proto_runestone_upgrade'
import { ProtoStone } from 'alkanes/lib/protorune/protostone'
import { encipher } from 'alkanes/lib/bytes'
import { DEFAULT_PROVIDER } from '../src/cli/constants'

// Load environment variables
dotenv.config()

// ============================================================================
// Configuration
// ============================================================================

interface MinerConfig {
  mnemonic: string
  symbol: string
  difficulty: number
  maxAttempts: bigint
  nonceStart: bigint
  networkType: Network
  logLevel: string
  feeRate: number
  alkaneReceiverAddress?: string
}

interface WalletInfo {
  account: Account
  signer: Signer
  provider: Provider
  address: string
}

interface MiningResult {
  hash: string
  nonce: bigint
  attempts: number
  hashrate: number
  utxo: {
    txid: string
    vout: number
  }
}

// ============================================================================
// PoW Alkane Miner Class
// ============================================================================

class PowAlkaneMiner {
  private config: MinerConfig
  private wallet: WalletInfo | null = null
  private isRunning = false

  constructor() {
    this.config = this.loadConfig()
  }

  private loadConfig(): MinerConfig {
    const mnemonic = process.env.POW_MINER_MNEMONIC
    if (!mnemonic) {
      throw new Error('POW_MINER_MNEMONIC not found in environment variables')
    }

    return {
      mnemonic,
      symbol: process.env.POW_SYMBOL || 'TESTTOKEN',
      difficulty: parseInt(process.env.POW_DIFFICULTY || '4'),
      maxAttempts: BigInt(process.env.POW_MAX_ATTEMPTS || '10000000'),
      nonceStart: BigInt(process.env.POW_NONCE_START || '0'),
      networkType: (process.env.NETWORK_TYPE as Network) || 'regtest',
      logLevel: process.env.LOG_LEVEL || 'info',
      feeRate: parseFloat(process.env.POW_FEE_RATE || '10'),
      alkaneReceiverAddress: process.env.POW_ALKANE_RECEIVER
    }
  }

  private async initializeWallet(): Promise<void> {
    this.log('info', '🔐 Initializing wallet...')
    
    const providerKey = this.config.networkType === 'mainnet' ? 'bitcoin' : this.config.networkType
    const provider = DEFAULT_PROVIDER[providerKey]

    if (!provider) {
      throw new Error(`Could not create provider for network: ${this.config.networkType}`)
    }
    
    const account = mnemonicToAccount({
      mnemonic: this.config.mnemonic,
      opts: { network: provider.network, index: 0 }
    })

    const privateKeys = getWalletPrivateKeys({
      mnemonic: this.config.mnemonic,
      opts: { network: account.network, index: 0 }
    })

    const signer = new Signer(account.network, {
      taprootPrivateKey: privateKeys.taproot.privateKey,
      segwitPrivateKey: privateKeys.nativeSegwit.privateKey,
      nestedSegwitPrivateKey: privateKeys.nestedSegwit.privateKey,
      legacyPrivateKey: privateKeys.legacy.privateKey
    })

    this.wallet = {
      account,
      signer,
      provider,
      address: account.taproot.address
    }

    this.log('info', `✅ Wallet: ${this.wallet.address}`)
  }

  private async selectBestUtxo(): Promise<{ txid: string; vout: number }> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized')
    }

    this.log('info', '🔍 Querying UTXOs...')
    
    const utxoResult = await utxo.accountUtxos({
      account: this.wallet.account,
      provider: this.wallet.provider
    })

    const accountUtxos = utxoResult?.accountUtxos || []
    
    if (accountUtxos.length === 0) {
      throw new Error('No UTXOs found in wallet')
    }

    // Select the largest UTXO for mining
    const selectedUtxo = accountUtxos.reduce((largest, current) => 
      current.satoshis > largest.satoshis ? current : largest
    )

    this.log('info', `✅ Selected UTXO: ${selectedUtxo.txId}:${selectedUtxo.outputIndex} (${selectedUtxo.satoshis.toLocaleString()} sats)`)
    
    return {
      txid: selectedUtxo.txId,
      vout: selectedUtxo.outputIndex
    }
  }

  // ============================================================================
  // PoW Mining Implementation
  // ============================================================================

  private static hexToBytes(hex: string): Uint8Array {
    hex = hex.replace(/^0x/, "")
    if (hex.length % 2 !== 0) {
      hex = "0" + hex
    }
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
    }
    return bytes
  }

  private static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
  }

  private static prepareFixedData(symbol: string, utxo: { txid: string; vout: number }): { fixedDataHex: string } {
    // 1. Symbol to UTF-8 bytes
    const symbolBytes = new TextEncoder().encode(symbol)
    
    // 2. Txid to bytes and reverse (big endian -> little endian)
    const txidBytes = this.hexToBytes(utxo.txid).reverse()

    // 3. Vout to 4-byte little endian integer
    const voutBuffer = new ArrayBuffer(4)
    new DataView(voutBuffer).setUint32(0, utxo.vout, true)
    const voutBytes = new Uint8Array(voutBuffer)

    // 4. Concatenate all fixed parts
    const fixedData = new Uint8Array(symbolBytes.length + txidBytes.length + voutBytes.length)
    fixedData.set(symbolBytes, 0)
    fixedData.set(txidBytes, symbolBytes.length)
    fixedData.set(voutBytes, symbolBytes.length + txidBytes.length)
    
    return {
      fixedDataHex: this.bytesToHex(fixedData)
    }
  }

  private static computeHash(fixedDataHex: string, nonce: bigint): string {
    // 1. Nonce to 16-byte little endian integer
    const nonceBuffer = new ArrayBuffer(16)
    const nonceView = new DataView(nonceBuffer)
    nonceView.setBigUint64(0, nonce & 0xFFFFFFFFFFFFFFFFn, true)
    nonceView.setBigUint64(8, nonce >> 64n, true)
    const nonceHex = this.bytesToHex(new Uint8Array(nonceBuffer))

    // 2. Combine fixed data and nonce
    const combinedHex = fixedDataHex + nonceHex
    const dataToHash = CryptoJS.enc.Hex.parse(combinedHex)
    
    // 3. Double SHA-256 hash
    const hash1 = CryptoJS.SHA256(dataToHash)
    const hash2 = CryptoJS.SHA256(hash1)
    const finalHashLittleEndian = hash2.toString(CryptoJS.enc.Hex)
    
    // 4. Result bytes reverse (little endian -> big endian)
    const finalHashBytes = this.hexToBytes(finalHashLittleEndian).reverse()
    
    return this.bytesToHex(finalHashBytes)
  }

  private async mineNonce(targetUtxo: { txid: string; vout: number }): Promise<MiningResult | null> {
    const { fixedDataHex } = PowAlkaneMiner.prepareFixedData(this.config.symbol, targetUtxo)
    const targetZeros = '0'.repeat(this.config.difficulty)

    let currentNonce = this.config.nonceStart
    let attempts = 0
    const startTime = Date.now()

    this.log('info', `🚀 Starting PoW mining for symbol: ${this.config.symbol}`)
    this.log('info', `   Difficulty: ${this.config.difficulty} (Target: ${targetZeros}...)`)
    this.log('info', `   UTXO: ${targetUtxo.txid}:${targetUtxo.vout}`)

    while (this.isRunning) {
      if (currentNonce >= this.config.nonceStart + this.config.maxAttempts) {
        this.log('warn', '❌ Maximum attempts reached')
        return null
      }
      
      const finalHash = PowAlkaneMiner.computeHash(fixedDataHex, currentNonce)

      if (finalHash.startsWith(targetZeros)) {
        const endTime = Date.now()
        const durationSeconds = (endTime - startTime) / 1000
        const hashrate = durationSeconds > 0 ? (attempts + 1) / durationSeconds : 0
        
        this.log('info', `🎉 Valid hash found!`)
        this.log('info', `   Hash: ${finalHash}`)
        this.log('info', `   Nonce: ${currentNonce}`)
        this.log('info', `   Attempts: ${attempts + 1}`)
        this.log('info', `   Time: ${durationSeconds.toFixed(2)}s`)
        this.log('info', `   Hashrate: ${(hashrate / 1000).toFixed(2)} kH/s`)
        
        return {
          hash: finalHash,
          nonce: currentNonce,
          attempts: attempts + 1,
          hashrate,
          utxo: targetUtxo
        }
      }

      currentNonce++
      attempts++

      // Progress update every 50000 attempts
      if (attempts % 50000 === 0) {
        const now = Date.now()
        const durationSeconds = (now - startTime) / 1000
        const currentHashrate = durationSeconds > 0 ? attempts / durationSeconds : 0
        this.log('debug', `[PROGRESS] Attempts: ${attempts}, Hashrate: ${(currentHashrate / 1000).toFixed(2)} kH/s`)
        
        // Non-blocking yield
        await new Promise(resolve => setImmediate(resolve))
      }
    }

    return null
  }

  private async executeAlkaneContract(nonce: bigint): Promise<void> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized')
    }

    this.log('info', '🔗 Executing alkane contract...')

    // Get fresh UTXOs for contract execution
    const utxoResult = await utxo.accountUtxos({
      account: this.wallet.account,
      provider: this.wallet.provider
    })

    const accountUtxos = utxoResult?.accountUtxos || []
    if (accountUtxos.length === 0) {
      throw new Error('No UTXOs available for contract execution')
    }

    // Prepare calldata: [2, 26127, 77, nonce]
    const calldata: bigint[] = [
      BigInt(2),
      BigInt(26127),
      BigInt(77),
      nonce
    ]

    this.log('info', `   Calldata: [${calldata.map(c => c.toString()).join(', ')}]`)

    // Create protostone
    const protostone: Buffer = encodeRunestoneProtostone({
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

    // Execute alkane contract
    const alkaneReceiver = this.config.alkaneReceiverAddress || this.wallet.address

    const result = await alkanes.execute({
      protostone,
      utxos: accountUtxos,
      feeRate: this.config.feeRate,
      account: this.wallet.account,
      signer: this.wallet.signer,
      provider: this.wallet.provider,
      alkaneReceiverAddress: alkaneReceiver,
      enableRBF: false
    })

    this.log('info', `✅ Contract executed successfully!`)
    this.log('info', `   Transaction ID: ${result.txId}`)
    this.log('info', `   Receiver: ${alkaneReceiver}`)
  }

  // ============================================================================
  // Main Mining Flow
  // ============================================================================

  public async start(): Promise<void> {
    if (this.isRunning) {
      this.log('warn', 'Mining service is already running')
      return
    }

    this.isRunning = true
    this.log('info', '🚀 Starting PoW Alkane Miner...')

    try {
      // Step 1: Initialize wallet
      await this.initializeWallet()

      // Step 2: Select best UTXO for mining
      const targetUtxo = await this.selectBestUtxo()

      // Step 3: Mine for valid nonce
      const miningResult = await this.mineNonce(targetUtxo)

      if (!miningResult) {
        this.log('error', '❌ Mining failed - no valid nonce found')
        return
      }

      // Step 4: Execute alkane contract with found nonce
      await this.executeAlkaneContract(miningResult.nonce)

      this.log('info', '🎉 PoW Alkane mining completed successfully!')

    } catch (error) {
      this.log('error', `💥 Mining failed: ${error.message}`)
      throw error
    } finally {
      this.isRunning = false
    }
  }

  public stop(): void {
    this.log('info', '⏹️  Stopping PoW Alkane Miner...')
    this.isRunning = false
  }

  private log(level: string, message: string): void {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`
    
    if (this.config.logLevel === 'debug' || 
        (this.config.logLevel === 'info' && ['info', 'warn', 'error'].includes(level))) {
      console.log(logMessage)
    }
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main(): Promise<void> {
  const service = new PowAlkaneMiner()
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, shutting down gracefully...')
    service.stop()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...')
    service.stop()
    process.exit(0)
  })

  // Start the service
  await service.start()
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Failed to start PoW Alkane Miner:', error)
    process.exit(1)
  })
}

export { PowAlkaneMiner }