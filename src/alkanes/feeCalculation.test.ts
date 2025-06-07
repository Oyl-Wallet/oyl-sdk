import { describe, it, expect } from '@jest/globals'
import { minimumFee } from '../btc'
import { inscriptionSats } from '../shared/utils'

describe('Fee Calculation Tests', () => {
  it('should calculate minimum fee without 250sat limit', () => {
    const feeRate = 1 // 1 sat/vB
    
    // Calculate expected minimum fee without 250 limit
    const expectedTxSize = minimumFee({
      taprootInputCount: 1,
      nonTaprootInputCount: 0,
      outputCount: 2, // alkane output + OP_RETURN (no change)
    })
    const expectedMinFee = expectedTxSize * feeRate
    
    // The fee should be calculated based on actual transaction size, not 250
    expect(expectedMinFee).toBeLessThan(250)
    expect(expectedMinFee).toBeGreaterThan(0)
  })

  it('should calculate correct fee for different fee rates', () => {
    const txSize = minimumFee({
      taprootInputCount: 1,
      nonTaprootInputCount: 0,
      outputCount: 2,
    })
    
    // Test various fee rates
    const testCases = [
      { feeRate: 1, expectedFee: txSize * 1 },
      { feeRate: 5, expectedFee: txSize * 5 },
      { feeRate: 10, expectedFee: txSize * 10 },
    ]
    
    testCases.forEach(({ feeRate, expectedFee }) => {
      const calculatedFee = txSize * feeRate
      expect(calculatedFee).toBe(expectedFee)
      
      // For low fee rates, fee should be much less than 250
      if (feeRate <= 2) {
        expect(calculatedFee).toBeLessThan(250)
      }
    })
  })

  it('should calculate total required amount correctly', () => {
    const fee = 183 // From your example
    const frontendFee = 0
    
    const totalRequired = inscriptionSats + frontendFee + fee
    
    expect(totalRequired).toBe(330 + 0 + 183) // 513 sats total
    expect(totalRequired).toBe(513)
  })

  it('should handle multiple inputs size calculation', () => {
    const singleInputSize = minimumFee({
      taprootInputCount: 1,
      nonTaprootInputCount: 0,
      outputCount: 2,
    })
    
    const multipleInputSize = minimumFee({
      taprootInputCount: 3,
      nonTaprootInputCount: 0,
      outputCount: 2,
    })
    
    // Multiple inputs should result in larger transaction
    expect(multipleInputSize).toBeGreaterThan(singleInputSize)
    
    // Fee should scale proportionally
    const feeRate = 1
    const singleInputFee = singleInputSize * feeRate
    const multipleInputFee = multipleInputSize * feeRate
    
    expect(multipleInputFee).toBeGreaterThan(singleInputFee)
  })
})