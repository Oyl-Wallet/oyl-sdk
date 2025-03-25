import fetch from 'node-fetch'
import asyncPool from 'tiny-async-pool'
import { EsploraRpc, EsploraUtxo } from './esplora'
import { AlkanesRpc as AlkanesRpcLib } from 'alkanes/lib/rpc'

export const stripHexPrefix = (s: string): string =>
  s.substr(0, 2) === '0x' ? s.substr(2) : s

// Helper function to convert BigInt values to hex strings for JSON serialization
export function mapToPrimitives(v: any): any {
  switch (typeof v) {
    case "bigint":
      return "0x" + v.toString(16);
    case "object":
      if (v === null) return null;
      if (Buffer.isBuffer(v)) return "0x" + v.toString("hex");
      if (Array.isArray(v)) return v.map((v) => mapToPrimitives(v));
      return Object.fromEntries(
        Object.entries(v).map(([key, value]) => [key, mapToPrimitives(value)]),
      );
    default:
      return v;
  }
}

// Helper function to convert hex strings back to BigInt values
export function unmapFromPrimitives(v: any): any {
  switch (typeof v) {
    case "string":
      if (v !== '0x' && !isNaN(v as any)) return BigInt(v);
      if (v.substr(0, 2) === "0x" || /^[0-9a-f]+$/.test(v)) return Buffer.from(stripHexPrefix(v), "hex");
      return v;
    case "object":
      if (v === null) return null;
      if (Array.isArray(v)) return v.map((item) => unmapFromPrimitives(item));
      return Object.fromEntries(
        Object.entries(v).map(([key, value]) => [
          key,
          unmapFromPrimitives(value),
        ]),
      );
    default:
      return v;
  }
}

export interface Rune {
  rune: {
    id: { block: string; tx: string }
    name: string
    spacedName: string
    divisibility: number
    spacers: number
    symbol: string
  }
  balance: string
}
export interface Outpoint {
  runes: Rune[]
  outpoint: { txid: string; vout: number }
  output: { value: string; script: string }
  txindex: number
  height: number
}
export interface AlkanesResponse {
  outpoints: Outpoint[]
  balanceSheet: []
}

interface AlkaneSimulateRequest {
  alkanes: any[]
  transaction: string
  block: string
  height: string
  txindex: number
  target: {
    block: string
    tx: string
  }
  inputs: string[]
  pointer: number
  refundPointer: number
  vout: number
}

interface AlkaneToken {
  name: string
  symbol: string
  totalSupply: number
  cap: number
  minted: number
  mintActive: boolean
  percentageMinted: number
  mintAmount: number
}

const opcodes: string[] = ['99', '100', '101', '102', '103', '104', '1000']
const opcodesHRV: string[] = [
  'name',
  'symbol',
  'totalSupply',
  'cap',
  'minted',
  'mintAmount',
  'data',
]

export class AlkanesRpc {
  public alkanesUrl: string
  public esplora: EsploraRpc
  private metashrewUrl: string | null

  constructor(url: string, metashrewUrl?: string) {
    this.alkanesUrl = url
    this.esplora = new EsploraRpc(url)
    this.metashrewUrl = metashrewUrl || null
  }

  async _call(method: string, params = []) {
    // If metashrewUrl is provided, use AlkanesRpcLib directly
    if (this.metashrewUrl) {
      const split = method.split('_')
      
      // Create an instance of AlkanesRpcLib with the metashrew URL
      const alkanesRpc = new AlkanesRpcLib({
        baseUrl: this.metashrewUrl,
      });
      
      try {
        let result;
        
        // Convert params to the format expected by AlkanesRpcLib
        const convertedParams = params.map(param => unmapFromPrimitives(param));
        
        if (split.length === 1) {
          // If no namespace is provided, call the method directly
          result = await alkanesRpc[method](...convertedParams);
        } else if (split[0] === 'alkanes') {
          // If the namespace is 'alkanes', call the method without the namespace
          result = await alkanesRpc[split[1]](...convertedParams);
        }
        
        // Convert the result back to a format that can be serialized to JSON
        return mapToPrimitives(result);
      } catch (error) {
        console.error('AlkanesRpcLib Error:', error);
        throw error;
      }
    }

    // If metashrewUrl is not provided or the method doesn't match the expected format,
    // use the regular JSON-RPC call
    const requestData = {
      jsonrpc: '2.0',
      method: method,
      params: params,
      id: 1,
    }

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
      cache: 'no-cache',
    }

    try {
      const response = await fetch(this.alkanesUrl, requestOptions)
      const responseData = await response.json()

      if (responseData.error) throw new Error(responseData.error.message)
      return responseData.result
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('Request Timeout:', error)
        throw new Error('Request timed out')
      } else {
        console.error('Request Error:', error)
        throw error
      }
    }
  }

  async getAlkanesByHeight({
    height,
    protocolTag = '1',
  }: {
    height: number
    protocolTag: string
  }) {
    return (await this._call('alkanes_protorunesbyheight', [
      {
        height,
        protocolTag,
      },
    ])) as AlkanesResponse
  }

  async getAlkanesByAddress({
    address,
    protocolTag = '1',
    name,
  }: {
    address: string
    protocolTag?: string
    name?: string
  }): Promise<Outpoint[]> {
    try {
      const utxos = await this.esplora.getAddressUtxo(address)

      if (!utxos || utxos.length === 0) {
        return []
      }

      const processUtxo = async (utxo: EsploraUtxo) => {
        try {
          const alkanesByOutpoint = await this.getAlkanesByOutpoint({
            txid: utxo.txid,
            vout: utxo.vout,
            protocolTag,
          })

          if (!alkanesByOutpoint || alkanesByOutpoint.length === 0) {
            return null
          }

          const txDetails = await this.esplora.getTxInfo(utxo.txid)
          const script = txDetails.vout[utxo.vout].scriptpubkey

          const firstAlkane = alkanesByOutpoint[0]
          if (!firstAlkane || !firstAlkane.token || !firstAlkane.token.id) {
            return null
          }

          return {
            runes: alkanesByOutpoint.map((item) => ({
              rune: {
                id: {
                  block: item.token.id.block,
                  tx: item.token.id.tx,
                },
                name: item.token.name,
                spacedName: item.token.name,
                divisibility: 1,
                spacers: 0,
                symbol: item.token.symbol,
              },
              balance: item.value,
            })),
            outpoint: {
              vout: utxo.vout,
              txid: utxo.txid,
            },
            output: {
              value: utxo.value.toString(),
              script: script,
            },

            height: parseInt(firstAlkane.token.id.block),
            txindex: parseInt(firstAlkane.token.id.tx),
          }
        } catch (error) {
          console.error(
            `Error processing UTXO ${utxo.txid}:${utxo.vout}:`,
            error
          )
          return null
        }
      }

      // Process UTXOs with concurrency limit using asyncPool
      const concurrencyLimit = 100
      const results = []
      for await (const result of asyncPool(
        concurrencyLimit,
        utxos,
        processUtxo
      )) {
        if (result !== null) {
          results.push(result)
        }
      }

      // Filter by name if specified
      if (name) {
        return results.filter((outpoint) =>
          outpoint.runes.some((rune) => rune.rune.name === name)
        )
      }

      return results
    } catch (error) {
      console.error('Error in getAlkanesByAddress:', error)
      throw error
    }
  }

  async trace(request: { vout: number; txid: string }) {
    request.txid = Buffer.from(request.txid, 'hex').reverse().toString('hex')
    const ret = await this._call('alkanes_trace', [request])
    return await ret
  }

  parsePoolInfo(hexData: string) {
    function parseLittleEndian(hexString: string): string[] {
      // Remove the "0x" prefix if present
      if (hexString.startsWith('0x')) {
        hexString = hexString.slice(2)
      }
      // Ensure the input length is a multiple of 32 hex chars (128-bit each)
      if (hexString.length % 32 !== 0) {
        throw new Error(
          'Invalid hex length. Expected multiples of 128-bit (32 hex chars).'
        )
      }
      // Function to convert a single 128-bit segment
      const convertSegment = (segment: string): bigint => {
        const littleEndianHex = segment.match(/.{2}/g)?.reverse()?.join('')
        if (!littleEndianHex) {
          throw new Error('Failed to process hex segment.')
        }
        return BigInt('0x' + littleEndianHex)
      }
      // Split into 128-bit (32 hex character) chunks
      const chunks = hexString.match(/.{32}/g) || []
      const parsedValues = chunks.map(convertSegment)
      return parsedValues.map((num) => num.toString())
    }
    // Parse the data
    const parsedData = parseLittleEndian(hexData)
    return {
      tokenA: {
        block: parsedData[0],
        tx: parsedData[1],
      },
      tokenB: {
        block: parsedData[2],
        tx: parsedData[3],
      },
      reserveA: parsedData[4],
      reserveB: parsedData[5],
    }
  }

  async simulate(request: Partial<AlkaneSimulateRequest>, decoder?: any) {
    const ret = await this._call('alkanes_simulate', [
      {
        alkanes: [],
        transaction: '0x',
        block: '0x',
        height: '20000',
        txindex: 0,
        inputs: [],
        pointer: 0,
        refundPointer: 0,
        vout: 0,
        ...request,
      },
    ])

    if (decoder) {
      const operationType = Number(request.inputs[0])
      ret.parsed = decoder(ret, operationType)
    } else {
      ret.parsed = this.parseSimulateReturn(ret.execution.data)
    }

    return ret
  }
  // @dev WIP
  // async meta(request: Partial<AlkaneSimulateRequest>, decoder?: any) {
  //   const ret = await this._call('alkanes___meta', [
  //     {
  //       alkanes: [],
  //       transaction: '0x',
  //       block: '0x',
  //       height: '20000',
  //       txindex: 0,
  //       inputs: [],
  //       pointer: 0,
  //       refundPointer: 0,
  //       vout: 0,
  //       ...request,
  //     },
  //   ])

  //   if (decoder) {
  //     const operationType = Number(request.inputs[0])
  //     ret.parsed = decoder(ret, operationType)
  //   } else {
  //     ret.parsed = this.parseSimulateReturn(ret.execution.data)
  //   }

  //   return ret
  // }

  async simulatePoolInfo(request: AlkaneSimulateRequest) {
    const ret = await this._call('alkanes_simulate', [request])
    const parsedPool = this.parsePoolInfo(ret.execution.data)
    ret.parsed = parsedPool
    return ret
  }

  async getAlkanesByOutpoint({
    txid,
    vout,
    protocolTag = '1',
  }: {
    txid: string
    vout: number
    protocolTag?: string
  }): Promise<any> {
    const alkaneList = await this._call('alkanes_protorunesbyoutpoint', [
      {
        txid: Buffer.from(txid, 'hex').reverse().toString('hex'),
        vout,
        protocolTag,
      },
    ])

    return alkaneList.map((outpoint) => ({
      ...outpoint,
      token: {
        ...outpoint.token,
        id: {
          block: parseInt(outpoint.token.id.block, 16).toString(),
          tx: parseInt(outpoint.token.id.tx, 16).toString(),
        },
      },
      value: parseInt(outpoint.value, 16).toString(),
    }))
  }

  async getAlkaneById({
    block,
    tx,
  }: {
    block: string
    tx: string
  }): Promise<AlkaneToken> {
    const alkaneData: AlkaneToken = {
      name: '',
      mintActive: false,
      percentageMinted: 0,
      symbol: '',
      totalSupply: 0,
      cap: 0,
      minted: 0,
      mintAmount: 0,
    }

    for (let j = 0; j < opcodes.length; j++) {
      try {
        const result = await this.simulate({
          target: { block, tx },
          alkanes: [],
          transaction: '0x',
          block: '0x',
          height: '20000',
          txindex: 0,
          inputs: [opcodes[j]],
          pointer: 0,
          refundPointer: 0,
          vout: 0,
        })
        if (result.status === 0) {
          alkaneData[opcodesHRV[j]] = Number(result.parsed?.le || 0)
          if (
            opcodesHRV[j] === 'name' ||
            opcodesHRV[j] === 'symbol' ||
            opcodesHRV[j] === 'data'
          ) {
            alkaneData[opcodesHRV[j]] = result.parsed?.string || ''
          }
          alkaneData.mintActive =
            Number(alkaneData.minted) < Number(alkaneData.cap)
          alkaneData.percentageMinted = Math.floor(
            (alkaneData.minted / alkaneData.cap) * 100
          )
        }
      } catch (error) {
        console.log(error)
      }
    }
    return alkaneData
  }
  async getAlkanes({
    limit,
    offset = 0,
  }: {
    limit: number
    offset?: number
  }): Promise<AlkaneToken[]> {
    if (limit > 1000) {
      throw new Error(
        'Max limit reached. Request fewer than 1000 alkanes per call'
      )
    }

    const indices = Array.from(
      { length: limit - offset + 1 },
      (_, i) => i + offset
    )

    const processAlkane = async (
      index: number
    ): Promise<AlkaneToken | null> => {
      const alkaneData: any = {
        id: {
          block: '2',
          tx: index.toString(),
        },
      }

      let hasValidResult = false
      const validOpcodes = opcodes.filter((opcode) => opcode !== undefined)

      try {
        const opcodeResults = await Promise.all(
          validOpcodes.map(async (opcode, opcodeIndex) => {
            if (!opcode) return null

            try {
              const result = await this.simulate({
                target: { block: '2', tx: index.toString() },
                alkanes: [],
                transaction: '0x',
                block: '0x',
                height: '20000',
                txindex: 0,
                inputs: [opcode],
                pointer: 0,
                refundPointer: 0,
                vout: 0,
              })

              if (result?.status === 0) {
                return {
                  opcode,
                  result,
                  opcodeIndex,
                  opcodeHRV: opcodesHRV[opcodeIndex],
                }
              }
            } catch (error) {
              return null
            }
            return null
          })
        )
        const validResults = opcodeResults.filter(
          (
            item
          ): item is {
            opcode: any
            result: any
            opcodeIndex: number
            opcodeHRV: string
          } => {
            return (
              item !== null &&
              item !== undefined &&
              item.opcodeHRV !== undefined
            )
          }
        )

        validResults.forEach(({ result, opcodeHRV }) => {
          if (!opcodeHRV) return

          if (['name', 'symbol', 'data'].includes(opcodeHRV)) {
            alkaneData[opcodeHRV] = result.parsed?.string || ''
          } else {
            alkaneData[opcodeHRV] = Number(result.parsed?.le || 0)
          }
          hasValidResult = true
        })

        if (hasValidResult) {
          alkaneData.mintActive =
            Number(alkaneData.minted || 0) < Number(alkaneData.cap || 0)
          alkaneData.percentageMinted = Math.floor(
            ((alkaneData.minted || 0) / (alkaneData.cap || 1)) * 100
          )
          return alkaneData
        }
      } catch (error) {
        console.log(`Error processing alkane at index ${index}:`, error)
      }

      return null
    }

    const results = []
    for await (const result of asyncPool(10, indices, processAlkane)) {
      if (result !== null) {
        results.push(result)
      }
    }

    return results
  }

  async meta(request: Partial<AlkaneSimulateRequest>, decoder?: any) {
    const ret = await this._call('alkanes_meta', [
      {
        alkanes: [],
        transaction: '0x',
        block: '0x',
        height: '0x',
        txindex: 0,
        inputs: [],
        pointer: 0,
        refundPointer: 0,
        vout: 0,
        ...request,
      },
    ])
    return ret
  }

  parseSimulateReturn(v: any) {
    if (v === '0x') {
      return undefined
    }
    const stripHexPrefix = (v: string) => (v.startsWith('0x') ? v.slice(2) : v)
    const addHexPrefix = (v: string) => '0x' + stripHexPrefix(v)

    let decodedString: string
    try {
      decodedString = Buffer.from(stripHexPrefix(v), 'hex').toString('utf8')
      if (/[\uFFFD]/.test(decodedString)) {
        throw new Error('Invalid UTF-8 string')
      }
    } catch (err) {
      decodedString = addHexPrefix(v)
    }

    return {
      string: decodedString,
      bytes: addHexPrefix(v),
      le: BigInt(
        addHexPrefix(
          Buffer.from(
            Array.from(Buffer.from(stripHexPrefix(v), 'hex')).reverse()
          ).toString('hex')
        )
      ).toString(),
      be: BigInt(addHexPrefix(v)).toString(),
    }
  }
}
