import * as dotenv from 'dotenv'
import * as alkanes from '../src/alkanes/alkanes'
import * as utxo from '../src/utxo'
import { mnemonicToAccount, Account, Signer, getWalletPrivateKeys, Provider, Network } from '../src'
import { encodeProtostone } from '../src/alkanes/alkanes'
import { DEFAULT_PROVIDER } from '../src/cli/constants'

// Load environment variables
dotenv.config()

interface ClockInConfig {
  mnemonic: string
  walletCount: number
  calldata: bigint[]
  startHeight: number
  interval: number
  maxFeeRate: number
  blockCheckInterval: number
  logLevel: string
  webhookUrl?: string
  concurrency: number
}

interface WalletInfo {
  account: Account
  signer: Signer
  provider: Provider
  address: string
  index: number
  timestamp: number
}

interface FeeRateInfo {
  medianFee: number
  feeRange: number[]
  timestamp: number
}

interface TransactionInfo {
  txId: string
  wallet: WalletInfo
  feeRate: number
  timestamp: number
  confirmed: boolean
  originalUtxos: any[]
  protostone: Buffer
  accelerationAttempts: number
  lastAccelerationTime?: number
}

class AutoClockInService {
  // --- Constants ---
  private static readonly MIN_BALANCE_SATS = 10000
  private static readonly BLOCK_API_URLS = [
    'https://blockstream.info/api/blocks/tip/height',
    'https://mempool.space/api/blocks/tip/height'
  ]
  private static readonly MEMPOOL_API_URL = 'https://mempool.space/api/v1/fees/mempool-blocks'
  private static readonly TX_STATUS_API_URL = 'https://blockstream.info/api/tx/'
  private static readonly MONITOR_INTERVAL_MS = 30000 // 30 seconds
  private static readonly FALLBACK_BROADCAST_URLS = [
    'https://mempool.space/api/tx',
    'https://blockstream.info/api/tx'
  ]

  private config: ClockInConfig
  private wallets: WalletInfo[] = []
  private currentTransactions: Map<string, TransactionInfo> = new Map()
  private isRunning = false
  private lastProcessedHeight = 0
  private loggedNextTargetHeight = 0

  constructor() {
    this.config = this.loadConfig()
    this.initializeWallets()
  }

  private loadConfig(): ClockInConfig {
    const mnemonic = process.env.CLOCK_IN_MNEMONIC
    if (!mnemonic) {
      throw new Error('CLOCK_IN_MNEMONIC not found in environment variables')
    }

    return {
      mnemonic,
      walletCount: parseInt(process.env.CLOCK_IN_WALLETS || '20'),
      calldata: (process.env.CLOCK_IN_CALLDATA || '2,21568,103')
        .split(',')
        .map(x => BigInt(x.trim())),
      startHeight: parseInt(process.env.CLOCK_IN_START_HEIGHT || '899573'),
      interval: parseInt(process.env.CLOCK_IN_INTERVAL || '144'),
      maxFeeRate: parseInt(process.env.MAX_FEE_RATE || '100'),
      blockCheckInterval: parseInt(process.env.BLOCK_CHECK_INTERVAL || '10000'),
      logLevel: process.env.LOG_LEVEL || 'info',
      webhookUrl: process.env.WEBHOOK_URL,
      concurrency: parseInt(process.env.CONCURRENCY_LIMIT || '5')
    }
  }

  private initializeWallets(): void {
    this.log('info', `Initializing ${this.config.walletCount} wallets...`)
    
    const networkType = (process.env.NETWORK_TYPE as Network) || 'mainnet'
    const providerKey = networkType === 'mainnet' ? 'bitcoin' : networkType
    const provider = DEFAULT_PROVIDER[providerKey]

    if (!provider) {
      throw new Error(`Could not create provider for network: ${networkType}`)
    }
    
    for (let i = 0; i < this.config.walletCount; i++) {
      const account = mnemonicToAccount({
        mnemonic: this.config.mnemonic,
        opts: { network: provider.network, index: i }
      })

      const privateKeys = getWalletPrivateKeys({
        mnemonic: this.config.mnemonic,
        opts: { network: account.network, index: i }
      })

      const signer = new Signer(account.network, {
        taprootPrivateKey: privateKeys.taproot.privateKey,
        segwitPrivateKey: privateKeys.nativeSegwit.privateKey,
        nestedSegwitPrivateKey: privateKeys.nestedSegwit.privateKey,
        legacyPrivateKey: privateKeys.legacy.privateKey
      })

      this.wallets.push({
        account,
        signer,
        provider,
        address: account.taproot.address,
        index: i,
        timestamp: Date.now()
      })
    }

    this.log('info', `Successfully initialized ${this.wallets.length} wallets.`)
  }

  private calculateNextClockInHeight(currentHeight: number): number {
    const { startHeight, interval } = this.config
    
    if (currentHeight < startHeight) {
      return startHeight
    }

    const cyclesPassed = Math.floor((currentHeight - startHeight) / interval)
    return startHeight + (cyclesPassed + 1) * interval
  }

  private async getCurrentBlockHeight(): Promise<number> {
    for (const url of AutoClockInService.BLOCK_API_URLS) {
      try {
        const response = await fetch(url)
        if (response.ok) {
          const blockHeight = await response.json()
          this.log('debug', `Got block height ${blockHeight} from ${url}`)
          return blockHeight
        }
      } catch (apiError) {
        this.log('warn', `Failed to get block height from ${url}: ${apiError.message}`)
      }
    }

    // Fallback to provider
    try {
      const provider = this.wallets[0].provider
      const response = await provider.sandshrew.multiCall([['btc_getblockcount', []]])
      const blockHeight = response[0] as number
      this.log('debug', `Got block height ${blockHeight} from provider fallback.`)
      return blockHeight
    } catch (error) {
      this.log('error', `Failed to get block height from all sources: ${error.message}`)
      throw error
    }
  }

  private async getFeeRateInfo(): Promise<FeeRateInfo> {
    try {
      const response = await fetch(AutoClockInService.MEMPOOL_API_URL)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const mempoolBlocks = await response.json()
      if (mempoolBlocks && mempoolBlocks.length > 0) {
        const nextBlock = mempoolBlocks[0]
        const medianFee = nextBlock.medianFee || 2
        const feeRange = nextBlock.feeRange || [1, 2, 5, 10, 20]

        this.log('debug', `Mempool median fee: ${medianFee} sat/vB, Range: [${feeRange.join(', ')}]`)
        return { medianFee, feeRange, timestamp: Date.now() }
      } else {
        this.log('warn', 'No mempool blocks data available, using fallback.')
        // Fallthrough to fallback logic
      }
    } catch (error) {
      this.log('error', `Failed to get mempool fee rates, using fallback: ${error.message}`)
    }

    // Fallback logic
    try {
      const provider = this.wallets[0].provider
      const feeEstimates = await provider.esplora.getFeeEstimates()
      const fallbackRate = feeEstimates['1'] || 10
      this.log('info', `Using fallback fee rate: ${fallbackRate} sat/vB`)
      return {
        medianFee: fallbackRate,
        feeRange: [1, Math.max(1, fallbackRate - 2), fallbackRate, fallbackRate + 5, fallbackRate + 10],
        timestamp: Date.now()
      }
    } catch (fallbackError) {
      this.log('error', `Fallback fee estimate also failed: ${fallbackError.message}`)
      return {
        medianFee: 10,
        feeRange: [1, 5, 10, 15, 25],
        timestamp: Date.now()
      }
    }
  }

  private async checkWalletBalances(): Promise<void> {
    this.log('info', 'Checking wallet balances...')
    for (const walletInfo of this.wallets) {
      try {
        const utxoResult = await utxo.accountUtxos({
          account: walletInfo.account,
          provider: walletInfo.provider
        })

        const totalBalance = utxoResult?.accountUtxos?.reduce((sum, u) => sum + u.satoshis, 0) || 0

        if (totalBalance < AutoClockInService.MIN_BALANCE_SATS) {
          this.log('warn', `Wallet ${walletInfo.index} (${walletInfo.address}) has low balance: ${totalBalance} sats`)
        } else {
          this.log('debug', `Wallet ${walletInfo.index} balance: ${totalBalance} sats`)
        }
      } catch (error) {
        this.log('error', `Failed to check balance for wallet ${walletInfo.index}: ${error.message}`)
      }
    }
  }

  private async executeClockIn(walletInfo: WalletInfo, feeRate: number): Promise<{ txId: string; utxos: any[]; protostone: Buffer } | null> {
    try {
      this.log('debug', `Executing clock-in for wallet ${walletInfo.index} with fee rate ${feeRate}`)

      const utxoResult = await utxo.accountUtxos({
        account: walletInfo.account,
        provider: walletInfo.provider
      })
      
      const accountUtxos = utxoResult?.accountUtxos
      if (!accountUtxos || accountUtxos.length === 0) {
        this.log('warn', `Wallet ${walletInfo.index} has no UTXOs.`)
        return null
      }

      const protostone = encodeProtostone({ calldata: this.config.calldata })

      const result = await alkanes.execute({
        utxos: accountUtxos,
        account: walletInfo.account,
        protostone,
        provider: walletInfo.provider,
        feeRate,
        signer: walletInfo.signer,
        alkaneReceiverAddress: walletInfo.address,
        enableRBF: true
      })

      this.log('debug', `Clock-in TX sent for wallet ${walletInfo.index}: ${result.txId}`)
      return { txId: result.txId, utxos: accountUtxos, protostone }
    } catch (error) {
      this.log('error', `Failed to execute clock-in for wallet ${walletInfo.index}: ${error.message}`)
      return null
    }
  }

  /**
   * Wraps the clock-in execution with a retry mechanism to handle transient network errors.
   * @param walletInfo The wallet to perform clock-in for.
   * @param feeRate The fee rate to use for the transaction.
   * @param maxRetries The maximum number of attempts.
   * @returns The transaction result if successful, otherwise null.
   */
  private async executeClockInWithRetry(
    walletInfo: WalletInfo,
    feeRate: number,
    maxRetries = 3
  ): Promise<{ txId: string; utxos: any[]; protostone: Buffer } | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.executeClockIn(walletInfo, feeRate)
      if (result) {
        if (attempt > 1) {
          this.log('info', `✅ Clock-in for wallet ${walletInfo.index} succeeded on attempt ${attempt}.`)
        }
        return result
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000 // 1s, 2s
        this.log('warn', `Clock-in attempt ${attempt}/${maxRetries} for wallet ${walletInfo.index} failed. Retrying in ${delay / 1000}s...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    this.log('error', `All ${maxRetries} clock-in attempts failed for wallet ${walletInfo.index}.`)
    return null
  }

  /**
   * Broadcasts a raw transaction using the primary provider, with fallbacks to public APIs.
   * This increases the chance of a successful broadcast even if the primary node is down.
   */
  private async broadcastTransaction(rawTx: string, walletIndex: number): Promise<string> {
    // Step 1: Try broadcasting with the primary provider first.
    try {
      const provider = this.wallets[walletIndex].provider
      const txId = await provider.sandshrew.multiCall([['sendrawtransaction', [rawTx]]])
      this.log('debug', `Successfully broadcasted TX via primary provider for wallet ${walletIndex}.`)
      return txId[0] as string
    } catch (error) {
      this.log('warn', `Primary provider failed to broadcast TX for wallet ${walletIndex}: ${error.message}. Trying fallbacks...`)
    }

    // Step 2: If primary fails, try public fallback APIs.
    for (const url of AutoClockInService.FALLBACK_BROADCAST_URLS) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: rawTx
        })

        if (response.ok) {
          const txId = await response.text()
          this.log('info', `Successfully broadcasted TX via fallback API ${url} for wallet ${walletIndex}.`)
          return txId
        } else {
          const errorText = await response.text()
          this.log('warn', `Fallback API ${url} failed: ${response.status} - ${errorText}`)
        }
      } catch (error) {
        this.log('warn', `Error connecting to fallback API ${url}: ${error.message}`)
      }
    }

    // Step 3: If all methods fail, throw an error.
    throw new Error(`All broadcast methods failed for wallet ${walletIndex}.`)
  }

  private async sendClockInTransactions(targetHeight: number): Promise<void> {
    this.log('info', `Sending clock-in transactions for target height ${targetHeight}`)

    const feeInfo = await this.getFeeRateInfo()
    const initialFeeRate = Math.ceil(feeInfo.medianFee)
    this.log('info', `Using initial fee rate: ${initialFeeRate} sat/vB (median: ${feeInfo.medianFee})`)
    
    let successCount = 0
    let failureCount = 0

    const walletChunks = this.chunkArray(this.wallets, this.config.concurrency)

    for (const chunk of walletChunks) {
      const promises = chunk.map(async walletInfo => {
        const result = await this.executeClockInWithRetry(walletInfo, initialFeeRate)
        if (result) {
          this.currentTransactions.set(result.txId, {
            txId: result.txId,
            wallet: walletInfo,
            feeRate: initialFeeRate,
            timestamp: Date.now(),
            confirmed: false,
            originalUtxos: result.utxos,
            protostone: result.protostone,
            accelerationAttempts: 0
          })
          successCount++
        } else {
          failureCount++
        }
      })
      await Promise.allSettled(promises)
    }

    this.log('info', `Clock-in transactions summary: ${successCount} successful, ${failureCount} failed.`)

    if (this.config.webhookUrl) {
      await this.sendWebhookNotification({
        type: 'clock_in_sent',
        targetHeight,
        successCount,
        failureCount,
        feeRate: initialFeeRate
      })
    }
  }

  private async monitorAndAccelerateTransactions(targetHeight: number): Promise<void> {
    this.log('info', `Monitoring transactions for target height ${targetHeight}`)

    const monitorLoop = async (): Promise<void> => {
      try {
        const currentHeight = await this.getCurrentBlockHeight()
        if (currentHeight >= targetHeight) {
          this.log('info', `Target block ${targetHeight} reached. Finalizing confirmation checks.`)
          await this.checkTransactionConfirmations(targetHeight)
          return // End monitoring for this round
        }

        await this.accelerateTransactionsIfNeeded()

        // Continue monitoring
        setTimeout(monitorLoop, AutoClockInService.MONITOR_INTERVAL_MS)
      } catch (error) {
        this.log('error', `Error in monitoring loop: ${error.message}`)
        setTimeout(monitorLoop, AutoClockInService.MONITOR_INTERVAL_MS)
      }
    }

    await monitorLoop()
  }

  private async accelerateTransactionsIfNeeded(): Promise<void> {
    const pendingTxs = Array.from(this.currentTransactions.values()).filter(tx => !tx.confirmed)
    if (pendingTxs.length === 0) return

    this.log('debug', `Checking ${pendingTxs.length} pending transactions for acceleration.`)
    
    const currentFeeInfo = await this.getFeeRateInfo()
    const accelerationThreshold = currentFeeInfo.feeRange[1] || currentFeeInfo.medianFee
    const targetFeeRate = Math.ceil(currentFeeInfo.medianFee)

    for (const tx of pendingTxs) {
      if (tx.feeRate < accelerationThreshold) {
        const newFeeRate = Math.min(targetFeeRate, this.config.maxFeeRate)

        if (newFeeRate > tx.feeRate) {
          this.log('info', `🚀 Accelerating TX ${tx.txId} from ${tx.feeRate} to ${newFeeRate} sat/vB`)
          
          try {
            const newTxId = await this.executeRBFTransaction(tx, newFeeRate)
            if (newTxId) {
              this.currentTransactions.delete(tx.txId)
              this.currentTransactions.set(newTxId, {
                ...tx,
                txId: newTxId,
                feeRate: newFeeRate,
                accelerationAttempts: tx.accelerationAttempts + 1,
                lastAccelerationTime: Date.now()
              })
              this.log('info', `✅ Successfully accelerated transaction ${tx.txId} -> ${newTxId}`)
            } else {
              this.log('warn', `❌ Failed to accelerate transaction ${tx.txId}, will retry later.`)
              tx.lastAccelerationTime = Date.now() // Prevent immediate re-acceleration
            }
          } catch (error) {
            this.log('error', `❌ Error accelerating transaction ${tx.txId}: ${error.message}`)
            tx.lastAccelerationTime = Date.now() // Prevent immediate re-acceleration
          }
        }
      }
    }
  }

  private async executeRBFTransaction(originalTx: TransactionInfo, newFeeRate: number): Promise<string | null> {
    this.log('debug', `Creating RBF transaction for ${originalTx.txId} with fee rate ${newFeeRate}`)
    try {
      // Use the original UTXOs for true RBF replacement
      const result = await alkanes.execute({
        utxos: originalTx.originalUtxos,
        account: originalTx.wallet.account,
        protostone: originalTx.protostone,
        provider: originalTx.wallet.provider,
        feeRate: newFeeRate,
        signer: originalTx.wallet.signer,
        alkaneReceiverAddress: originalTx.wallet.address,
        enableRBF: true
      })
      this.log('debug', `Created true RBF transaction: ${originalTx.txId} -> ${result.txId}`)
      return result.txId
    } catch (error) {
      this.log('error', `Failed to create RBF transaction for ${originalTx.txId}: ${error.message}`)
      return null
    }
  }

  private async checkTransactionConfirmations(targetHeight: number): Promise<void> {
    this.log('info', `Checking transaction confirmations for target height ${targetHeight}...`)

    const pendingTxs = Array.from(this.currentTransactions.values()).filter(tx => !tx.confirmed)
    if (pendingTxs.length === 0) {
      this.log('info', 'All transactions from this round are already confirmed.')
      return
    }

    let targetBlockConfirmed = 0
    let otherBlockConfirmed = 0

    for (const tx of pendingTxs) {
      try {
        const response = await fetch(`${AutoClockInService.TX_STATUS_API_URL}${tx.txId}`)
        if (response.ok) {
          const txInfo = await response.json()
          if (txInfo.status?.confirmed) {
            tx.confirmed = true
            const confirmedHeight = txInfo.status.block_height
            if (confirmedHeight === targetHeight) {
              targetBlockConfirmed++
              this.log('debug', `TX ${tx.txId} confirmed in TARGET block ${targetHeight}.`)
            } else {
              otherBlockConfirmed++
              this.log('debug', `TX ${tx.txId} confirmed in block ${confirmedHeight}.`)
            }
          }
        }
      } catch (error) {
        this.log('debug', `Could not check TX status for ${tx.txId}: ${error.message}`)
      }
    }

    const totalConfirmed = targetBlockConfirmed + otherBlockConfirmed
    const stillPending = this.wallets.length - totalConfirmed

    this.log('info', `📊 Clock-in round summary: ${totalConfirmed}/${this.wallets.length} confirmed. (Target: ${targetBlockConfirmed}, Other: ${otherBlockConfirmed}, Pending: ${stillPending})`)

    if (this.config.webhookUrl) {
      await this.sendWebhookNotification({
        type: 'clock_in_completed',
        targetHeight,
        targetBlockConfirmed,
        otherBlockConfirmed,
        totalConfirmed,
        totalWallets: this.wallets.length
      })
    }

    // Clear processed transactions for the next round
    this.currentTransactions.clear()
  }

  private async sendWebhookNotification(data: any): Promise<void> {
    if (!this.config.webhookUrl) return

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'auto-clock-in',
          ...data
        })
      })

      if (!response.ok) {
        this.log('warn', `Webhook notification failed: ${response.status}`)
      }
    } catch (error) {
      this.log('error', `Failed to send webhook notification: ${error.message}`)
    }
  }

  private log(level: string, message: string): void {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`
    
    if (this.config.logLevel === 'debug' || (this.config.logLevel === 'info' && (level === 'info' || level === 'warn' || level === 'error'))) {
      console.log(logMessage)
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      this.log('warn', 'Service is already running')
      return
    }

    this.isRunning = true
    this.log('info', '🚀 Starting Auto Clock-In Service...')
    
    const { mnemonic, ...configForLogging } = {
      ...this.config,
      calldata: this.config.calldata.map(x => x.toString())
    }
    this.log('info', `Configuration loaded: ${JSON.stringify(configForLogging, null, 2)}`)

    await this.checkWalletBalances()
    await this.mainLoop()
  }

  private async mainLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const currentHeight = await this.getCurrentBlockHeight()
        this.log('debug', `Current block height: ${currentHeight}`)

        // Calculate next clock-in height
        const nextClockInHeight = this.calculateNextClockInHeight(currentHeight)
        
        if (nextClockInHeight > this.lastProcessedHeight) {
          // Only log the next target if it's a new target for this cycle.
          if (this.loggedNextTargetHeight !== nextClockInHeight) {
            this.log('info', `Next clock-in target: block ${nextClockInHeight} (current: ${currentHeight})`)
            this.loggedNextTargetHeight = nextClockInHeight
          }
          
          // If we're at the block before the clock-in block, prepare
          if (currentHeight === nextClockInHeight - 1) {
            this.log('info', `Preparing for clock-in at block ${nextClockInHeight}`)
            
            // Send clock-in transactions
            await this.sendClockInTransactions(nextClockInHeight)
            
            // Monitor and accelerate if needed
            await this.monitorAndAccelerateTransactions(nextClockInHeight)
            
            this.lastProcessedHeight = nextClockInHeight
          }
        }

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, this.config.blockCheckInterval))
      } catch (error) {
        this.log('error', `FATAL: Error in main loop: ${error.message}. Restarting loop after delay...`)
        // Wait a bit longer on error
        await new Promise(resolve => setTimeout(resolve, this.config.blockCheckInterval * 2))
      }
    }
  }

  public stop(): void {
    this.log('info', 'Stopping Auto Clock-In Service...')
    this.isRunning = false
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}

// Export for use as module
export { AutoClockInService }

// Run directly if this file is executed
if (require.main === module) {
  const service = new AutoClockInService()
  
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
  service.start().catch(error => {
    console.error('Failed to start Auto Clock-In Service:', error)
    process.exit(1)
  })
}