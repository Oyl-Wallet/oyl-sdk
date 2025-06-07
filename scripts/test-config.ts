import * as dotenv from 'dotenv'
import { mnemonicToAccount, getWalletPrivateKeys, Signer, Network } from '../src'
import { DEFAULT_PROVIDER } from '../src/cli/constants'

// Load environment variables
dotenv.config()

async function testConfiguration() {
  console.log('🧪 Testing Auto Clock-In Configuration')
  console.log('====================================')

  // Check environment variables
  const requiredVars = [
    'CLOCK_IN_MNEMONIC',
    'NETWORK_TYPE',
    'SANDSHREW_PROJECT_ID'
  ]

  console.log('\n📋 Environment Variables:')
  for (const varName of requiredVars) {
    const value = process.env[varName]
    if (value) {
      console.log(`✅ ${varName}: ${varName === 'CLOCK_IN_MNEMONIC' ? '***[HIDDEN]***' : value}`)
    } else {
      console.log(`❌ ${varName}: NOT SET`)
      return
    }
  }

  // Test wallet initialization
  console.log('\n👛 Testing Wallet Initialization:')
  try {
    const networkType = process.env.NETWORK_TYPE as Network || 'mainnet'
    const providerKey = networkType === 'mainnet' ? 'bitcoin' : networkType
    const provider = DEFAULT_PROVIDER[providerKey]
    
    const account = mnemonicToAccount({
      mnemonic: process.env.CLOCK_IN_MNEMONIC!,
      opts: {
        network: provider.network,
        index: 0
      }
    })

    console.log(`✅ Wallet 0 Address: ${account.taproot.address}`)
    console.log(`✅ Network: ${process.env.NETWORK_TYPE}`)

    // Test API connectivity
    console.log('\n🌐 Testing API Connectivity:')
    try {
      const response = await fetch('https://blockstream.info/api/blocks/tip/height')
      const blockHeight = await response.json()
      console.log(`✅ Current Block Height: ${blockHeight}`)
    } catch (error) {
      console.log(`❌ Failed to get block height: ${error.message}`)
    }

    try {
      // Test mempool.space API
      const mempoolResponse = await fetch('https://mempool.space/api/v1/fees/mempool-blocks')
      if (mempoolResponse.ok) {
        const mempoolBlocks = await mempoolResponse.json()
        const medianFee = mempoolBlocks[0]?.medianFee || 'N/A'
        console.log(`✅ Mempool Median Fee: ${medianFee} sat/vB`)
      } else {
        console.log(`⚠️  Mempool API response: ${mempoolResponse.status}`)
      }
      
      // Test provider fee estimates as fallback
      const feeEstimates = await provider.esplora.getFeeEstimates()
      console.log(`✅ Provider Fee Estimates: ${JSON.stringify(feeEstimates)}`)
    } catch (error) {
      console.log(`❌ Failed to get fee estimates: ${error.message}`)
    }

  } catch (error) {
    console.log(`❌ Wallet initialization failed: ${error.message}`)
    return
  }

  // Test configuration values
  console.log('\n⚙️ Service Configuration:')
  const config = {
    walletCount: parseInt(process.env.CLOCK_IN_WALLETS || '20'),
    calldata: (process.env.CLOCK_IN_CALLDATA || '2,21568,103').split(',').map(x => x.trim()),
    startHeight: parseInt(process.env.CLOCK_IN_START_HEIGHT || '899573'),
    interval: parseInt(process.env.CLOCK_IN_INTERVAL || '144'),
    initialFeeMultiplier: parseFloat(process.env.INITIAL_FEE_MULTIPLIER || '1.5'),
    blockCheckInterval: parseInt(process.env.BLOCK_CHECK_INTERVAL || '10000')
  }

  Object.entries(config).forEach(([key, value]) => {
    console.log(`  ${key}: ${Array.isArray(value) ? value.join(',') : value}`)
  })

  // Calculate next clock-in height
  console.log('\n🎯 Clock-In Schedule:')
  try {
    const response = await fetch('https://blockstream.info/api/blocks/tip/height')
    const currentHeight = await response.json()
    
    const calculateNextClockInHeight = (currentHeight: number) => {
      const { startHeight, interval } = config
      if (currentHeight < startHeight) {
        return startHeight
      }
      const cyclesPassed = Math.floor((currentHeight - startHeight) / interval)
      return startHeight + (cyclesPassed + 1) * interval
    }

    const nextClockIn = calculateNextClockInHeight(currentHeight)
    const blocksUntil = nextClockIn - currentHeight

    console.log(`  Current Height: ${currentHeight}`)
    console.log(`  Next Clock-In: ${nextClockIn}`)
    console.log(`  Blocks Until: ${blocksUntil}`)
    console.log(`  Time Until: ~${Math.round(blocksUntil * 10)} minutes`)

  } catch (error) {
    console.log(`❌ Failed to calculate schedule: ${error.message}`)
  }

  console.log('\n🎉 Configuration test completed!')
  console.log('\n🚀 To start the service, run: ./scripts/start-clock-in.sh')
}

testConfiguration().catch(console.error)