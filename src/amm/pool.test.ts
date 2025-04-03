import { AlkaneId } from '../shared/interface'
import { AlkanesAMMPoolDecoder, previewRemoveLiquidity } from './pool'
import {
  PoolDetailsResult,
  PoolOpcodes,
  estimateRemoveLiquidityAmounts,
} from './utils'
import { Provider } from '..'

describe('estimateRemoveLiquidityAmounts', () => {
  it('should correctly calculate token amounts based on proportion of liquidity', () => {
    const poolDetails: PoolDetailsResult = {
      token0: { block: '100', tx: '1' } as AlkaneId,
      token1: { block: '200', tx: '2' } as AlkaneId,
      token0Amount: '1000',
      token1Amount: '2000',
      tokenSupply: '500',
      poolName: 'Test Pool',
    }
    const tokenAmount = 100n // 20% of total supply

    const result = estimateRemoveLiquidityAmounts(poolDetails, tokenAmount)

    expect(result.token0).toEqual(poolDetails.token0)
    expect(result.token1).toEqual(poolDetails.token1)
    // 20% of 1000 = 200
    expect(result.token0Amount).toEqual(200n)
    // 20% of 2000 = 400
    expect(result.token1Amount).toEqual(400n)
  })

  it('should handle rounding correctly when calculating proportions', () => {
    const poolDetails: PoolDetailsResult = {
      token0: { block: '100', tx: '1' } as AlkaneId,
      token1: { block: '200', tx: '2' } as AlkaneId,
      token0Amount: '1000',
      token1Amount: '2000',
      tokenSupply: '3000',
      poolName: 'Test Pool',
    }
    const tokenAmount = 1n // A very small proportion that will need rounding

    const result = estimateRemoveLiquidityAmounts(poolDetails, tokenAmount)

    // 1/3000 of 1000 with 10000 as multiplier for precision = 0.33... tokens rounded down
    expect(result.token0Amount).toEqual(0n)
    // 1/3000 of 2000 with 10000 as multiplier for precision = 0.66... tokens rounded down
    expect(result.token1Amount).toEqual(0n)
  })

  it('should handle different token amounts and total supply values', () => {
    const poolDetails: PoolDetailsResult = {
      token0: { block: '100', tx: '1' } as AlkaneId,
      token1: { block: '200', tx: '2' } as AlkaneId,
      token0Amount: '10000000000',
      token1Amount: '5000000000',
      tokenSupply: '100000000',
      poolName: 'Test Pool',
    }
    const tokenAmount = 10000000n // 10% of total supply

    const result = estimateRemoveLiquidityAmounts(poolDetails, tokenAmount)

    // 10% of 10000000000 = 1000000000
    expect(result.token0Amount).toEqual(1000000000n)
    // 10% of 5000000000 = 500000000
    expect(result.token1Amount).toEqual(500000000n)
  })
})

describe('previewRemoveLiquidity', () => {
  // We'll use this to spy on the AlkanesAMMPoolDecoder.decodePoolDetails method
  let decoderSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup spy for AlkanesAMMPoolDecoder.decodePoolDetails
    // We'll implement specific behavior in each test
    decoderSpy = jest.spyOn(
      AlkanesAMMPoolDecoder.prototype,
      'decodePoolDetails'
    )
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should fetch pool details and calculate expected token amounts', async () => {
    // Define test data
    const tokenId = { block: '1', tx: '1' } as AlkaneId
    const tokenAmount = 100n

    // Mock pool details that will be returned by the decoder
    const mockPoolDetails: PoolDetailsResult = {
      token0: { block: '100', tx: '1' } as AlkaneId,
      token1: { block: '200', tx: '2' } as AlkaneId,
      token0Amount: '1000',
      token1Amount: '2000',
      tokenSupply: '500',
      poolName: 'Test Pool',
    }

    const expectedResult = {
      token0: mockPoolDetails.token0,
      token1: mockPoolDetails.token1,
      // For 100 / 500 = 0.2 (20%) of the pool:
      // 20% of 1000 = 200 tokens
      token0Amount: 200n,
      // 20% of 2000 = 400 tokens
      token1Amount: 400n,
    }

    // Configure our provider mock
    const mockSimulate = jest.fn().mockResolvedValue({
      execution: {
        data: 'mocked-pool-details-data',
      },
    })

    const mockProvider = {
      alkanes: {
        simulate: mockSimulate,
      },
    } as unknown as Provider

    // Setup decoder to return our mock pool details
    decoderSpy.mockReturnValue(mockPoolDetails)

    const result = await previewRemoveLiquidity({
      token: tokenId,
      tokenAmount,
      provider: mockProvider,
    })

    // Verify provider.alkanes.simulate was called with correct parameters
    expect(mockSimulate).toHaveBeenCalledWith({
      target: tokenId,
      inputs: [PoolOpcodes.POOL_DETAILS.toString()],
    })

    // Verify decoder was called with the simulation data
    expect(decoderSpy).toHaveBeenCalledWith('mocked-pool-details-data')

    expect(result).toEqual(expectedResult)
  })

  it('should throw an error if pool details cannot be fetched', async () => {
    const token = { block: '100', tx: '1' } as AlkaneId
    const tokenAmount = 100n

    // Setup a mock provider that returns null for pool details
    const mockProvider = {
      alkanes: {
        simulate: jest.fn().mockResolvedValue({
          execution: {
            data: 'invalid-data',
          },
        }),
      },
    } as unknown as Provider

    // Make the decoder return null to simulate failure
    ;(
      AlkanesAMMPoolDecoder.prototype.decodePoolDetails as jest.Mock
    ).mockReturnValue(null)

    await expect(
      previewRemoveLiquidity({ token, tokenAmount, provider: mockProvider })
    ).rejects.toThrow('Failed to get pool details')
  })
})
