import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

async function testFeeRates() {
  console.log('🔍 Fee Rate Comparison Test')
  console.log('===========================')

  // Test mempool.space API
  console.log('\n📊 Mempool.space API:')
  try {
    const mempoolResponse = await fetch('https://mempool.space/api/v1/fees/mempool-blocks')
    
    if (mempoolResponse.ok) {
      const mempoolBlocks = await mempoolResponse.json()
      
      if (mempoolBlocks && mempoolBlocks.length > 0) {
        console.log(`✅ API Status: ${mempoolResponse.status} OK`)
        
        // Show first few blocks info
        for (let i = 0; i < Math.min(3, mempoolBlocks.length); i++) {
          const block = mempoolBlocks[i]
          console.log(`  Block ${i + 1}:`)
          console.log(`    Median Fee: ${block.medianFee?.toFixed(2) || 'N/A'} sat/vB`)
          console.log(`    Fee Range: ${block.feeRange?.[0] || 'N/A'} - ${block.feeRange?.[block.feeRange?.length - 1] || 'N/A'} sat/vB`)
          console.log(`    Total Fees: ${block.totalFees ? (block.totalFees / 100000000).toFixed(4) : 'N/A'} BTC`)
          console.log(`    Tx Count: ${block.nTx || 'N/A'}`)
        }
        
        // Recommend fee rate
        const nextBlockMedian = mempoolBlocks[0].medianFee || 10
        const initialFeeRate = Math.ceil(nextBlockMedian * 1.5)
        console.log(`\n💡 Recommended Rates:`)
        console.log(`  Current Median: ${nextBlockMedian.toFixed(2)} sat/vB`)
        console.log(`  Initial Rate (1.5x): ${initialFeeRate} sat/vB`)
        console.log(`  Accelerate Rate (1.2x): ${Math.ceil(nextBlockMedian * 1.2)} sat/vB`)
        
      } else {
        console.log('❌ No mempool blocks data available')
      }
    } else {
      console.log(`❌ API Error: ${mempoolResponse.status} ${mempoolResponse.statusText}`)
    }
  } catch (error) {
    console.log(`❌ Request failed: ${error.message}`)
  }

  // Test recommended fee rates API for comparison
  console.log('\n📈 Mempool.space Recommended Fees:')
  try {
    const feesResponse = await fetch('https://mempool.space/api/v1/fees/recommended')
    
    if (feesResponse.ok) {
      const fees = await feesResponse.json()
      console.log(`✅ Fast Priority: ${fees.fastestFee} sat/vB`)
      console.log(`✅ Half Hour: ${fees.halfHourFee} sat/vB`)
      console.log(`✅ One Hour: ${fees.hourFee} sat/vB`)
      console.log(`✅ Economy: ${fees.economyFee} sat/vB`)
      console.log(`✅ Minimum: ${fees.minimumFee} sat/vB`)
    } else {
      console.log(`❌ Recommended fees API error: ${feesResponse.status}`)
    }
  } catch (error) {
    console.log(`❌ Recommended fees request failed: ${error.message}`)
  }

  console.log('\n✨ Fee rate comparison completed!')
}

testFeeRates().catch(console.error)