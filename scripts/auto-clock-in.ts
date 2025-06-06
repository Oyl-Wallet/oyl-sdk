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
  initialFeeMultiplier: number
  accelerateFeeMultiplier: number
  maxFeeIncrease: number
  maxFeeRate: number
  blockCheckInterval: number
  logLevel: string
  webhookUrl?: string
}

interface WalletInfo {
  account: Account
  signer: Signer
  provider: Provider
  address: string
  index: number
}

interface TransactionInfo {
  txId: string
  wallet: WalletInfo
  feeRate: number
  timestamp: number
  confirmed: boolean
  // RBF needed info
  originalUtxos: any[]
  protostone: Buffer
  accelerationAttempts: number
  lastAccelerationTime?: number
}

class AutoClockInService {
  private config: ClockInConfig
  private wallets: WalletInfo[] = []
  private currentTransactions: Map<string, TransactionInfo> = new Map()
  private isRunning = false
  private lastProcessedHeight = 0

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
      initialFeeMultiplier: parseFloat(process.env.INITIAL_FEE_MULTIPLIER || '1.5'),
      accelerateFeeMultiplier: parseFloat(process.env.ACCELERATE_FEE_MULTIPLIER || '1.2'),
      maxFeeIncrease: parseInt(process.env.MAX_FEE_INCREASE || '2'),
      maxFeeRate: parseInt(process.env.MAX_FEE_RATE || '100'),
      blockCheckInterval: parseInt(process.env.BLOCK_CHECK_INTERVAL || '10000'),
      logLevel: process.env.LOG_LEVEL || 'info',
      webhookUrl: process.env.WEBHOOK_URL
    }
  }

  private initializeWallets(): void {
    this.log('info', `Initializing ${this.config.walletCount} wallets...`)
    
    const networkType = process.env.NETWORK_TYPE as Network || 'mainnet'
    const providerKey = networkType === 'mainnet' ? 'bitcoin' : networkType
    const provider = DEFAULT_PROVIDER[providerKey]
    
    for (let i = 0; i < this.config.walletCount; i++) {
      const account = mnemonicToAccount({
        mnemonic: this.config.mnemonic,
        opts: {
          network: provider.network,
          index: i
        }
      })

      const privateKeys = getWalletPrivateKeys({
        mnemonic: this.config.mnemonic,
        opts: {
          network: account.network,
          index: i
        }
      })

      const signer = new Signer(account.network, {
        taprootPrivateKey: privateKeys.taproot.privateKey,
        segwitPrivateKey: privateKeys.nativeSegwit.privateKey,
        nestedSegwitPrivateKey: privateKeys.nestedSegwit.privateKey,
        legacyPrivateKey: privateKeys.legacy.privateKey,
      })

      this.wallets.push({
        account,
        signer,
        provider,
        address: account.taproot.address,
        index: i
      })
    }

    this.log('info', `Successfully initialized ${this.wallets.length} wallets`)
  }

  private calculateNextClockInHeight(currentHeight: number): number {
    const { startHeight, interval } = this.config
    
    if (currentHeight < startHeight) {
      return startHeight
    }

    const cyclesPassed = Math.floor((currentHeight - startHeight) / interval)
    return startHeight + (cyclesPassed + 1) * interval
  }

  private isClockInBlock(height: number): boolean {
    const { startHeight, interval } = this.config
    return height >= startHeight && (height - startHeight) % interval === 0
  }

  private async getCurrentBlockHeight(): Promise<number> {
    try {
      // Try multiple APIs for redundancy
      const apis = [
        'https://blockstream.info/api/blocks/tip/height',
        'https://mempool.space/api/blocks/tip/height'
      ]
      
      for (const api of apis) {
        try {
          const response = await fetch(api)
          if (response.ok) {
            const blockHeight = await response.json()
            this.log('debug', `Got block height ${blockHeight} from ${api}`)
            return blockHeight
          }
        } catch (apiError) {
          this.log('warn', `Failed to get block height from ${api}: ${apiError.message}`)
          continue
        }
      }
      
      // Fallback to provider sandshrew
      const provider = this.wallets[0].provider
      const response = await provider.sandshrew.multiCall([
        ['btc_getblockcount', []]
      ])
      const blockHeight = response[0] as number
      this.log('debug', `Got block height ${blockHeight} from provider sandshrew`)
      return blockHeight
    } catch (error) {
      this.log('error', `Failed to get block height from all sources: ${error.message}`)
      throw error
    }
  }

  private async getMedianFeeRate(): Promise<number> {
    try {
      // Use mempool.space API to get more accurate fee rates
      const response = await fetch('https://mempool.space/api/v1/fees/mempool-blocks')
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const mempoolBlocks = await response.json()
      
      if (mempoolBlocks && mempoolBlocks.length > 0) {
        // Get the median fee rate from the first mempool block (next block)
        const nextBlock = mempoolBlocks[0]
        const medianFeeRate = nextBlock.medianFee || 2
        
        // Log additional mempool information for monitoring
        this.log('debug', `Mempool block info - Median: ${medianFeeRate} sat/vB, Range: ${nextBlock.feeRange?.[0]}-${nextBlock.feeRange?.[nextBlock.feeRange?.length - 1]} sat/vB, Total fees: ${nextBlock.totalFees} sats`)
        
        return medianFeeRate
      } else {
        this.log('warn', 'No mempool blocks data available, using fallback')
        return 10
      }
    } catch (error) {
      this.log('error', `Failed to get mempool fee rates: ${error.message}`)
      
      // Fallback to provider fee estimates
      try {
        const provider = this.wallets[0].provider
        const feeEstimates = await provider.esplora.getFeeEstimates()
        const fallbackRate = feeEstimates['1'] || 10
        this.log('info', `Using fallback fee rate: ${fallbackRate} sat/vB`)
        return fallbackRate
      } catch (fallbackError) {
        this.log('error', `Fallback fee estimate also failed: ${fallbackError.message}`)
        return 10 // Final fallback
      }
    }
  }

  private async checkWalletBalances(): Promise<void> {
    this.log('info', 'Checking wallet balances...')
    
    for (const walletInfo of this.wallets) {
      try {
        const { accountUtxos } = await utxo.accountUtxos({
          account: walletInfo.account,
          provider: walletInfo.provider
        })

        const totalBalance = accountUtxos.reduce((sum, utxo) => sum + utxo.satoshis, 0)
        
        if (totalBalance < 10000) { // Minimum 10k sats
          this.log('warn', `Wallet ${walletInfo.index} (${walletInfo.address}) has low balance: ${totalBalance} sats`)
        } else {
          this.log('debug', `Wallet ${walletInfo.index} balance: ${totalBalance} sats`)
        }
      } catch (error) {
        this.log('error', `Failed to check balance for wallet ${walletInfo.index}: ${error.message}`)
      }
    }
  }

  private async executeClockIn(walletInfo: WalletInfo, feeRate: number): Promise<{txId: string, utxos: any[], protostone: Buffer} | null> {
    try {
      this.log('info', `Executing clock-in for wallet ${walletInfo.index} with fee rate ${feeRate}`)

      const { accountUtxos } = await utxo.accountUtxos({
        account: walletInfo.account,
        provider: walletInfo.provider
      })

      if (accountUtxos.length === 0) {
        this.log('warn', `Wallet ${walletInfo.index} has no UTXOs`)
        return null
      }

      const protostone = encodeProtostone({
        calldata: this.config.calldata
      })

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

      this.log('info', `Clock-in transaction sent for wallet ${walletInfo.index}: ${result.txId}`)
      return {
        txId: result.txId,
        utxos: accountUtxos,
        protostone
      }
    } catch (error) {
      this.log('error', `Failed to execute clock-in for wallet ${walletInfo.index}: ${error.message}`)
      return null
    }
  }

  private async sendClockInTransactions(targetHeight: number): Promise<void> {
    this.log('info', `Sending clock-in transactions for target height ${targetHeight}`)

    // Get current median fee rate
    const medianFeeRate = await this.getMedianFeeRate()
    const initialFeeRate = Math.ceil(medianFeeRate * this.config.initialFeeMultiplier)
    
    this.log('info', `Using initial fee rate: ${initialFeeRate} sat/vB (median: ${medianFeeRate})`)

    // Execute clock-in for all wallets concurrently
    const executePromises = this.wallets.map(async (walletInfo) => {
      const result = await this.executeClockIn(walletInfo, initialFeeRate)
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
      }
      return { wallet: walletInfo, txId: result?.txId }
    })

    const results = await Promise.allSettled(executePromises)
    
    let successCount = 0
    let failureCount = 0

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.txId) {
        successCount++
      } else {
        failureCount++
        this.log('error', `Failed to send transaction for wallet ${index}`)
      }
    })

    this.log('info', `Clock-in transactions summary: ${successCount} successful, ${failureCount} failed`)

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

    const checkInterval = 30000 // Check every 30 seconds
    const maxWaitTime = 600000 // Maximum 10 minutes

    const startTime = Date.now()

    const monitorLoop = async (): Promise<void> => {
      if (Date.now() - startTime > maxWaitTime) {
        this.log('warn', 'Maximum wait time exceeded, stopping transaction monitoring')
        return
      }

      try {
        // Check current block height
        const currentHeight = await this.getCurrentBlockHeight()
        
        if (currentHeight >= targetHeight) {
          this.log('info', `Target block ${targetHeight} reached (current: ${currentHeight})`)
          
          // Check if transactions are confirmed
          await this.checkTransactionConfirmations(targetHeight)
          return
        }

        // If target block is far away, check for confirmations anyway
        if (currentHeight > targetHeight) {
          this.log('warn', `Current height ${currentHeight} is beyond target ${targetHeight}, checking confirmations anyway`)
          await this.checkTransactionConfirmations(targetHeight)
          return
        }

        // Check if we need to accelerate transactions
        const medianFeeRate = await this.getMedianFeeRate()
        await this.accelerateTransactionsIfNeeded(medianFeeRate)

        // Continue monitoring
        setTimeout(monitorLoop, checkInterval)
      } catch (error) {
        this.log('error', `Error in monitoring loop: ${error.message}`)
        setTimeout(monitorLoop, checkInterval)
      }
    }

    await monitorLoop()
  }

  private async accelerateTransactionsIfNeeded(currentMedianFeeRate: number): Promise<void> {
    const pendingTransactions = Array.from(this.currentTransactions.values())
      .filter(tx => !tx.confirmed)

    if (pendingTransactions.length === 0) {
      return
    }

    this.log('debug', `Checking ${pendingTransactions.length} pending transactions for acceleration`)

    for (const tx of pendingTransactions) {
      const shouldAccelerate = currentMedianFeeRate > tx.feeRate

      if (shouldAccelerate) {
        const newFeeRate = Math.min(
          Math.ceil(currentMedianFeeRate * this.config.accelerateFeeMultiplier),
          tx.feeRate + this.config.maxFeeIncrease,
          this.config.maxFeeRate
        )

        if (newFeeRate > tx.feeRate && tx.accelerationAttempts < 3) {
          // Prevent too frequent acceleration attempts
          const timeSinceLastAcceleration = tx.lastAccelerationTime ? 
            Date.now() - tx.lastAccelerationTime : Number.MAX_SAFE_INTEGER
          
          if (timeSinceLastAcceleration < 300000) { // 5 minutes
            this.log('debug', `Skipping acceleration for ${tx.txId} - too recent`)
            continue
          }

          this.log('info', `🚀 Accelerating transaction ${tx.txId} from ${tx.feeRate} to ${newFeeRate} sat/vB (attempt ${tx.accelerationAttempts + 1})`)
          
          try {
            const newTxId = await this.executeRBFTransaction(tx, newFeeRate)
            
            if (newTxId) {
              // Remove old transaction and add new one
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
              this.log('warn', `❌ Failed to accelerate transaction ${tx.txId}`)
              tx.accelerationAttempts++
              tx.lastAccelerationTime = Date.now()
            }
          } catch (error) {
            this.log('error', `❌ Error accelerating transaction ${tx.txId}: ${error.message}`)
            tx.accelerationAttempts++
            tx.lastAccelerationTime = Date.now()
          }
        }
      }
    }
  }

  private async executeRBFTransaction(originalTx: TransactionInfo, newFeeRate: number): Promise<string | null> {
    try {
      this.log('debug', `Creating RBF transaction for ${originalTx.txId} with fee rate ${newFeeRate}`)
      
      // For true RBF, we need to:
      // 1. Use the same UTXOs (inputs)
      // 2. Set sequence < 0xfffffffe (RBF signal)
      // 3. Increase the fee by adjusting outputs
      
      // First, try to get fresh UTXOs to avoid conflicts
      // const { accountUtxos: freshUtxos } = await utxo.accountUtxos({
      //   account: originalTx.wallet.account,
      //   provider: originalTx.wallet.provider
      // })

      // // Filter out UTXOs that might still be locked by pending transactions
      // const availableUtxos = freshUtxos.filter(utxo => 
      //   !originalTx.originalUtxos.some(orig => 
      //     orig.txId === utxo.txId && orig.outputIndex === utxo.outputIndex
      //   )
      // )

      // if (availableUtxos.length === 0) {
      //   this.log('warn', `No available UTXOs for wallet ${originalTx.wallet.index} - using original UTXOs for RBF`)
      //   // If no fresh UTXOs, create a true RBF transaction using the same UTXOs
      //   return await this.createRBFWithSameInputs(originalTx, newFeeRate)
      // }

      // // If we have fresh UTXOs, create a new transaction with RBF enabled
      // const result = await alkanes.execute({
      //   utxos: availableUtxos,
      //   account: originalTx.wallet.account,
      //   protostone: originalTx.protostone,
      //   provider: originalTx.wallet.provider,
      //   feeRate: newFeeRate,
      //   signer: originalTx.wallet.signer,
      //   alkaneReceiverAddress: originalTx.wallet.address,
      //   enableRBF: true
      // })

      // return result.txId

      return await this.createRBFWithSameInputs(originalTx, newFeeRate)
      
    } catch (error) {
      this.log('error', `Failed to create RBF transaction: ${error.message}`)
      return null
    }
  }

  private async createRBFWithSameInputs(originalTx: TransactionInfo, newFeeRate: number): Promise<string | null> {
    try {
      this.log('debug', `Creating true RBF transaction using same inputs with fee rate ${newFeeRate}`)
      
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
      
      this.log('info', `✅ Created true RBF transaction: ${originalTx.txId} -> ${result.txId}`)
      return result.txId
    } catch (error) {
      this.log('error', `Failed to create true RBF transaction: ${error.message}`)
      return null
    }
  }

  private async checkTransactionConfirmations(targetHeight: number): Promise<void> {
    this.log('info', `Checking transaction confirmations for target height ${targetHeight}`)

    const pendingTransactions = Array.from(this.currentTransactions.values())
      .filter(tx => !tx.confirmed)

    if (pendingTransactions.length === 0) {
      this.log('info', 'No pending transactions to check')
      return
    }

    let targetBlockConfirmed = 0
    let otherBlockConfirmed = 0

    for (const tx of pendingTransactions) {
      try {
        const response = await fetch(`https://blockstream.info/api/tx/${tx.txId}`)
        
        if (response.ok) {
          const txInfo = await response.json()
          
          if (txInfo.status && txInfo.status.confirmed) {
            tx.confirmed = true
            const confirmedHeight = txInfo.status.block_height
            
            if (confirmedHeight === targetHeight) {
              targetBlockConfirmed++
              this.log('info', `✅ Transaction ${tx.txId} confirmed in TARGET block ${targetHeight}`)
            } else {
              otherBlockConfirmed++
              this.log('info', `✅ Transaction ${tx.txId} confirmed in block ${confirmedHeight} (target was ${targetHeight})`)
            }
          } else {
            this.log('debug', `Transaction ${tx.txId} still pending`)
          }
        }
      } catch (error) {
        this.log('debug', `Could not check transaction ${tx.txId}: ${error.message}`)
      }
    }

    const totalConfirmed = targetBlockConfirmed + otherBlockConfirmed
    const stillPending = this.wallets.length - totalConfirmed

    this.log('info', `📊 Clock-in round summary:`)
    this.log('info', `   Target block (${targetHeight}): ${targetBlockConfirmed} transactions`)
    this.log('info', `   Other blocks: ${otherBlockConfirmed} transactions`)
    this.log('info', `   Still pending: ${stillPending} transactions`)
    this.log('info', `   Total confirmed: ${totalConfirmed}/${this.wallets.length}`)

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

    // Clear processed transactions
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
    
    console.log(logMessage)
    
    // You could also add file logging here
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      this.log('warn', 'Service is already running')
      return
    }

    this.isRunning = true
    this.log('info', 'Starting Auto Clock-In Service')
    
    // Create a JSON-serializable version of config
    const configForLogging = {
      ...this.config,
      calldata: this.config.calldata.map(x => x.toString()) // Convert BigInt to string
    }
    this.log('info', `Configuration: ${JSON.stringify(configForLogging, null, 2)}`)

    // Initial wallet balance check
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
          this.log('info', `Next clock-in target: block ${nextClockInHeight} (current: ${currentHeight})`)
          
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
        this.log('error', `Error in main loop: ${error.message}`)
        // Wait a bit longer on error
        await new Promise(resolve => setTimeout(resolve, this.config.blockCheckInterval * 2))
      }
    }
  }

  public stop(): void {
    this.log('info', 'Stopping Auto Clock-In Service')
    this.isRunning = false
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