#!/usr/bin/env npx ts-node

/**
 * PoW Alkane Demo Script
 * 
 * This script demonstrates the PoW mining and alkane contract execution flow
 * using mock data for testing purposes.
 */

import * as CryptoJS from 'crypto-js'

// ============================================================================
// Mock Implementation for Demo
// ============================================================================

class PowAlkaneDemo {
  
  static demonstrateWorkflow(): void {
    console.log('🚀 PoW Alkane Miner Demo')
    console.log('='.repeat(30))
    console.log('')
    console.log('This demo shows the complete workflow without requiring a real wallet.')
    console.log('')
    
    this.step1_WalletSetup()
    this.step2_UtxoSelection()
    this.step3_PowMining()
    this.step4_ContractExecution()
    this.step5_Summary()
  }
  
  static step1_WalletSetup(): void {
    console.log('📋 Step 1: Wallet Setup')
    console.log('-'.repeat(25))
    console.log('🔐 Initializing wallet...')
    console.log('   Network: regtest')
    console.log('   Address: bc1p...demo (mock)')
    console.log('   ✅ Wallet initialized successfully')
    console.log('')
  }
  
  static step2_UtxoSelection(): void {
    console.log('📋 Step 2: UTXO Selection')
    console.log('-'.repeat(25))
    console.log('🔍 Querying UTXOs from wallet...')
    
    // Mock UTXO data
    const mockUtxos = [
      { txId: 'abc123...001', vout: 0, satoshis: 10000 },
      { txId: 'def456...002', vout: 1, satoshis: 25000 },
      { txId: 'ghi789...003', vout: 0, satoshis: 50000 },
      { txId: 'jkl012...004', vout: 2, satoshis: 100000 }
    ]
    
    console.log('   Found UTXOs:')
    mockUtxos.forEach((utxo, index) => {
      console.log(`     ${index + 1}. ${utxo.txId}:${utxo.vout} - ${utxo.satoshis.toLocaleString()} sats`)
    })
    
    const selectedUtxo = mockUtxos[mockUtxos.length - 1] // Select largest
    console.log('')
    console.log('   ✅ Auto-selected largest UTXO:')
    console.log(`      ${selectedUtxo.txId}:${selectedUtxo.vout} - ${selectedUtxo.satoshis.toLocaleString()} sats`)
    console.log('')
  }
  
  static step3_PowMining(): void {
    console.log('📋 Step 3: PoW Mining')
    console.log('-'.repeat(25))
    console.log('⚡ Starting PoW mining...')
    console.log('   Symbol: TESTTOKEN')
    console.log('   Difficulty: 4 (Target: 0000...)')
    console.log('   UTXO: jkl012...004:2')
    console.log('')
    
    // Simulate mining process
    const mockMiningSteps = [
      { attempts: 10000, hashrate: '15.2 kH/s', time: '0.7s' },
      { attempts: 25000, hashrate: '18.1 kH/s', time: '1.4s' },
      { attempts: 50000, hashrate: '19.8 kH/s', time: '2.5s' },
      { attempts: 87543, hashrate: '20.3 kH/s', found: true, time: '4.3s' }
    ]
    
    mockMiningSteps.forEach((step, index) => {
      if (step.found) {
        console.log(`   🎉 Valid hash found!`)
        console.log(`      Hash: 0000a1b2c3d4e5f67890123456789abcdef...`)
        console.log(`      Nonce: 87543`)
        console.log(`      Attempts: ${step.attempts.toLocaleString()}`)
        console.log(`      Time: ${step.time}`)
        console.log(`      Hashrate: ${step.hashrate}`)
      } else {
        console.log(`   [PROGRESS] Attempts: ${step.attempts.toLocaleString()}, Hashrate: ${step.hashrate}`)
      }
    })
    console.log('')
  }
  
  static step4_ContractExecution(): void {
    console.log('📋 Step 4: Contract Execution')
    console.log('-'.repeat(25))
    console.log('🔗 Executing alkane contract...')
    
    const nonce = 87543
    const calldata = [2, 26127, 77, nonce]
    
    console.log(`   Calldata: [${calldata.join(', ')}]`)
    console.log('   Protocol Tag: 1')
    console.log('   Edicts: []')
    console.log('   Pointer: 0')
    console.log('   Refund Pointer: 0')
    console.log('')
    console.log('   📡 Broadcasting transaction...')
    console.log('   ✅ Contract executed successfully!')
    console.log('   Transaction ID: xyz789abc123def456...')
    console.log('   Receiver: bc1p...demo')
    console.log('')
  }
  
  static step5_Summary(): void {
    console.log('📋 Summary')
    console.log('-'.repeat(25))
    console.log('🎉 PoW Alkane mining completed successfully!')
    console.log('')
    console.log('✅ Process completed:')
    console.log('   1. Wallet initialized')
    console.log('   2. Best UTXO selected (100,000 sats)')
    console.log('   3. Valid nonce found (87543)')
    console.log('   4. Contract executed with calldata [2, 26127, 77, 87543]')
    console.log('')
    console.log('💡 To run with real wallet:')
    console.log('   1. Copy scripts/.env.pow-alkane.example to .env')
    console.log('   2. Set POW_MINER_MNEMONIC in .env')
    console.log('   3. Run: npm run pow-alkane')
    console.log('')
  }
  
  static demonstrateHashCalculation(): void {
    console.log('🔧 Hash Calculation Demonstration')
    console.log('='.repeat(40))
    console.log('')
    
    const symbol = 'DEMO'
    const txid = 'abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234'
    const vout = 0
    const nonce = 12345n
    
    console.log('📋 Input Data:')
    console.log(`   Symbol: "${symbol}"`)
    console.log(`   UTXO: ${txid}:${vout}`)
    console.log(`   Nonce: ${nonce}`)
    console.log('')
    
    // Demonstrate data preparation
    console.log('🔧 Data Preparation:')
    
    // 1. Symbol to bytes
    const symbolBytes = new TextEncoder().encode(symbol)
    console.log(`   1. Symbol bytes: ${Array.from(symbolBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`)
    
    // 2. Txid bytes (simplified for demo)
    const txidBytes = this.hexToBytes(txid).reverse()
    console.log(`   2. Txid bytes (LE): ${Array.from(txidBytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')}...`)
    
    // 3. Vout bytes
    const voutBuffer = new ArrayBuffer(4)
    new DataView(voutBuffer).setUint32(0, vout, true)
    const voutBytes = new Uint8Array(voutBuffer)
    console.log(`   3. Vout bytes (LE): ${Array.from(voutBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`)
    
    // 4. Nonce bytes
    const nonceBuffer = new ArrayBuffer(16)
    const nonceView = new DataView(nonceBuffer)
    nonceView.setBigUint64(0, nonce & 0xFFFFFFFFFFFFFFFFn, true)
    nonceView.setBigUint64(8, nonce >> 64n, true)
    const nonceBytes = new Uint8Array(nonceBuffer)
    console.log(`   4. Nonce bytes (LE): ${Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`)
    console.log('')
    
    // 5. Combined data
    const fixedData = new Uint8Array(symbolBytes.length + txidBytes.length + voutBytes.length)
    fixedData.set(symbolBytes, 0)
    fixedData.set(txidBytes, symbolBytes.length)
    fixedData.set(voutBytes, symbolBytes.length + txidBytes.length)
    
    const combinedData = new Uint8Array(fixedData.length + nonceBytes.length)
    combinedData.set(fixedData, 0)
    combinedData.set(nonceBytes, fixedData.length)
    
    console.log('🧮 Hash Calculation:')
    console.log(`   Combined data length: ${combinedData.length} bytes`)
    
    // Calculate hash (simplified demonstration)
    const combinedHex = Array.from(combinedData).map(b => b.toString(16).padStart(2, '0')).join('')
    const dataToHash = CryptoJS.enc.Hex.parse(combinedHex)
    const hash1 = CryptoJS.SHA256(dataToHash)
    const hash2 = CryptoJS.SHA256(hash1)
    const finalHash = hash2.toString(CryptoJS.enc.Hex)
    
    console.log(`   Double SHA-256: ${finalHash}`)
    
    // Check difficulty
    const difficulty = 3
    const targetPrefix = '0'.repeat(difficulty)
    const isValid = finalHash.startsWith(targetPrefix)
    
    console.log('')
    console.log('✅ Validation:')
    console.log(`   Target prefix: "${targetPrefix}"`)
    console.log(`   Hash starts with: "${finalHash.substring(0, difficulty)}"`)
    console.log(`   Valid for difficulty ${difficulty}: ${isValid ? '✅ YES' : '❌ NO'}`)
    console.log('')
  }
  
  // Helper method
  static hexToBytes(hex: string): Uint8Array {
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
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args[0] || 'workflow'
  
  switch (command) {
    case 'workflow':
      PowAlkaneDemo.demonstrateWorkflow()
      break
      
    case 'hash':
      PowAlkaneDemo.demonstrateHashCalculation()
      break
      
    default:
      console.log('Available commands:')
      console.log('  npm run demo-pow-alkane           - Show complete workflow')
      console.log('  npm run demo-pow-alkane workflow  - Show complete workflow')
      console.log('  npm run demo-pow-alkane hash      - Show hash calculation')
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Demo failed:', error)
    process.exit(1)
  })
}

export { PowAlkaneDemo }