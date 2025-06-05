import { estimateExecuteFeeWithoutChange } from './alkanes'

describe('Alkane Fee Estimation', () => {
  describe('estimateExecuteFeeWithoutChange', () => {
    it('should estimate fee for single input transaction', async () => {
      const result = await estimateExecuteFeeWithoutChange({
        feeRate: 10,
        inputCount: 1,
      })

      expect(result.estimatedFee).toBeGreaterThan(0)
      expect(result.totalRequired).toBeGreaterThan(result.estimatedFee)
      expect(result.breakdown.alkaneOutput).toBe(330) // inscriptionSats
      expect(result.breakdown.frontendFee).toBe(0)
      expect(result.breakdown.inputCount).toBe(1)
      expect(result.breakdown.outputCount).toBe(2) // alkane output + OP_RETURN
      expect(result.breakdown.transactionFee).toBe(result.estimatedFee)
      expect(result.totalRequired).toBe(330 + result.estimatedFee)
    })

    it('should estimate fee for multiple input transaction', async () => {
      const singleInputResult = await estimateExecuteFeeWithoutChange({
        feeRate: 10,
        inputCount: 1,
      })

      const multiInputResult = await estimateExecuteFeeWithoutChange({
        feeRate: 10,
        inputCount: 3,
      })

      // Multi-input should have higher fee due to larger transaction size
      expect(multiInputResult.estimatedFee).toBeGreaterThan(singleInputResult.estimatedFee)
      expect(multiInputResult.breakdown.inputCount).toBe(3)
      expect(multiInputResult.breakdown.outputCount).toBe(2)
    })

    it('should include frontend fee in calculation', async () => {
      const withoutFrontendFee = await estimateExecuteFeeWithoutChange({
        feeRate: 10,
        inputCount: 1,
      })

      const withFrontendFee = await estimateExecuteFeeWithoutChange({
        feeRate: 10,
        inputCount: 1,
        frontendFee: 1000n,
      })

      // Should have one more output for frontend fee
      expect(withFrontendFee.breakdown.outputCount).toBe(3)
      expect(withoutFrontendFee.breakdown.outputCount).toBe(2)
      
      // Should include frontend fee in breakdown
      expect(withFrontendFee.breakdown.frontendFee).toBe(1000)
      expect(withoutFrontendFee.breakdown.frontendFee).toBe(0)
      
      // Total should be higher due to frontend fee + increased tx size
      expect(withFrontendFee.totalRequired).toBeGreaterThan(
        withoutFrontendFee.totalRequired + 1000
      )
    })

    it('should ignore frontend fee below minimum relay', async () => {
      const result = await estimateExecuteFeeWithoutChange({
        feeRate: 10,
        inputCount: 1,
        frontendFee: 500n, // Below 546 sat minimum
      })

      expect(result.breakdown.frontendFee).toBe(0)
      expect(result.breakdown.outputCount).toBe(2) // No extra output for frontend fee
    })

    it('should calculate different fees for different fee rates', async () => {
      const lowFeeResult = await estimateExecuteFeeWithoutChange({
        feeRate: 5,
        inputCount: 1,
      })

      const highFeeResult = await estimateExecuteFeeWithoutChange({
        feeRate: 20,
        inputCount: 1,
      })

      expect(highFeeResult.estimatedFee).toBeGreaterThan(lowFeeResult.estimatedFee)
      expect(highFeeResult.totalRequired).toBeGreaterThan(lowFeeResult.totalRequired)
    })

    it('should ensure minimum fee of 250 sats', async () => {
      const result = await estimateExecuteFeeWithoutChange({
        feeRate: 1, // Very low fee rate
        inputCount: 1,
      })

      expect(result.estimatedFee).toBeGreaterThanOrEqual(250)
    })

    it('should provide accurate breakdown for batch splitting', async () => {
      const result = await estimateExecuteFeeWithoutChange({
        feeRate: 10,
        inputCount: 1,
        frontendFee: 1000n,
      })

      // Verify all components add up correctly
      const expectedTotal = 
        result.breakdown.alkaneOutput +
        result.breakdown.frontendFee +
        result.breakdown.transactionFee

      expect(result.totalRequired).toBe(expectedTotal)
      
      // Verify structure for batch splitting
      expect(result).toHaveProperty('estimatedFee')
      expect(result).toHaveProperty('totalRequired')
      expect(result).toHaveProperty('breakdown')
      expect(result.breakdown).toHaveProperty('alkaneOutput')
      expect(result.breakdown).toHaveProperty('frontendFee')
      expect(result.breakdown).toHaveProperty('transactionFee')
      expect(result.breakdown).toHaveProperty('inputCount')
      expect(result.breakdown).toHaveProperty('outputCount')
      expect(result.breakdown).toHaveProperty('estimatedTxSize')
    })
  })
})