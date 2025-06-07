import { Command } from 'commander'
import { alkaneExecute, alkaneBatchExecute } from './alkane'

describe('Alkane Commands Receiver Address Validation', () => {
  describe('alkaneExecute', () => {
    it('should require alkane receiver address', () => {
      // Check that the command has the required option
      const requiredOptions = alkaneExecute.options
        .filter(opt => opt.required)
        .map(opt => opt.long)

      expect(requiredOptions).toContain('--alkane-receiver')
    })

    it('should have correct description for receiver address', () => {
      const receiverOption = alkaneExecute.options
        .find(opt => opt.long === '--alkane-receiver')

      expect(receiverOption).toBeDefined()
      expect(receiverOption.description).toBe('Address to receive alkane assets (required)')
    })
  })

  describe('alkaneBatchExecute', () => {
    it('should require alkane receiver address', () => {
      // Check that the command has the required option
      const requiredOptions = alkaneBatchExecute.options
        .filter(opt => opt.required)
        .map(opt => opt.long)

      expect(requiredOptions).toContain('--alkane-receiver')
    })

    it('should have correct description for receiver address', () => {
      const receiverOption = alkaneBatchExecute.options
        .find(opt => opt.long === '--alkane-receiver')

      expect(receiverOption).toBeDefined()
      expect(receiverOption.description).toBe('Address to receive alkane assets (required)')
    })
  })
})