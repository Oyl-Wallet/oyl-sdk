import { Command } from 'commander'
import { DEFAULT_PROVIDER } from './constants'
import { Provider } from '..'


/* @dev example call
  oyl provider alkanes -method getAlkanesByAddress -params '{"address":"brct21..."}'

  oyl provider alkanes -method simulate -params '{ "alkanes": [],"transaction": "0x", "block": "0x", "height": "20000", "txindex": 0, "target": {"block": "2", "tx": "1"}, "inputs": ["101"],"pointer": 0, "refundPointer": 0, "vout": 0}' -p regtest

  oyl provider alkanes -method meta -params '{ "target": {"block": "2", "tx": "1"}}' -p regtest

  Note the json format if you need to pass an object.
*/
export const alkanesProvider = new Command('alkanes')
  .description('Returns data based on alkanes method invoked')
  .requiredOption(
    '-method, --method <method>',
    'name of the method you want to call for the api.'
  )
  .option(
    '-params, --parameters <parameters>',
    'parameters for the api method you are calling.'
  )
  .option(
    '-p, --provider <provider>',
    'provider to use to access the network.'
  )
  .option(
    '--metashrew-rpc-url <url>',
    'Direct URL to metashrew RPC endpoint'
  )
  .action(async (options) => {
    let provider: Provider
    
    if (options.metashrewRpcUrl) {
      const defaultProvider = DEFAULT_PROVIDER[options.provider || 'regtest']
      provider = new Provider({
        url: defaultProvider.url,
        projectId: defaultProvider.projectId || '',
        network: defaultProvider.network,
        networkType: defaultProvider.networkType,
        metashrewRpcUrl: options.metashrewRpcUrl
      })
    } else {
      provider = DEFAULT_PROVIDER[options.provider || 'regtest']
    }
    let isJson: object
    try {
      isJson = JSON.parse(options.parameters)
      console.log(
        JSON.stringify(await provider.alkanes[options.method](isJson), null, 2)
      )
    } catch (error) {
      console.log(error)
    }
  })


/* @dev example call
  oyl provider ord -method getTxOutput -params '{"ticker":"ordi"}' -p bitcoin

  please note the json format if you need to pass an object.
*/
export const ordProviderCall = new Command('ord')
  .description('Returns data based on ord method invoked')
  .requiredOption(
    '-p, --provider <provider>',
    'provider to use to access the network.'
  )
  .requiredOption(
    '-method, --method <method>',
    'name of the method you want to call for the api.'
  )
  .option(
    '-params, --parameters <parameters>',
    'parameters for the ord method you are calling.'
  )
  .option(
    '--metashrew-rpc-url <url>',
    'Direct URL to metashrew RPC endpoint'
  )
  .action(async (options) => {
    let provider: Provider
    
    if (options.metashrewRpcUrl) {
      const defaultProvider = DEFAULT_PROVIDER[options.provider]
      provider = new Provider({
        url: defaultProvider.url,
        projectId: defaultProvider.projectId || '',
        network: defaultProvider.network,
        networkType: defaultProvider.networkType,
        metashrewRpcUrl: options.metashrewRpcUrl
      })
    } else {
      provider = DEFAULT_PROVIDER[options.provider]
    }
    let isJson: object
    try {
      isJson = JSON.parse(options.parameters)
      console.log(await provider.ord[options.method](isJson))
    } catch (error) {
      console.log(error)
    }
  })


/* @dev example call
  oyl provider sandShrewMulticall -c '[{"method":"esplora_tx","params":["688f5c239e4e114af461dc1331d02ad5702e795daf2dcf397815e0b05cd23dbc"]},{"method":"btc_getblockcount", "params":[]}]' -p bitcoin
*/
export const multiCallSandshrewProviderCall = new Command('sandShrewMulticall')
.description('Send multiple calls to sandshrew provider')
.requiredOption(
  '-p, --provider <provider>',
  'Network provider type (regtest, bitcoin)'
)
.requiredOption(
  '-c, --calls <calls>',
  'calls in this format: {method: string, params: string[]}'
)
.option(
  '--metashrew-rpc-url <url>',
  'Direct URL to metashrew RPC endpoint'
)
.action(async (options) => {
  type Call = { method: string; params: string[] }

  let isJson: Call[] = []
  try {
    isJson = JSON.parse(options.calls)

    const multiCall: (string | string[])[][] = isJson.map((call: Call) => {
      return [call.method, call.params]
    })

    let provider: Provider
    
    if (options.metashrewRpcUrl) {
      const defaultProvider = DEFAULT_PROVIDER[options.provider]
      provider = new Provider({
        url: defaultProvider.url,
        projectId: defaultProvider.projectId || '',
        network: defaultProvider.network,
        networkType: defaultProvider.networkType,
        metashrewRpcUrl: options.metashrewRpcUrl
      })
    } else {
      provider = DEFAULT_PROVIDER[options.provider]
    }
    console.log(await provider.sandshrew.multiCall(multiCall))
  } catch (error) {
    console.log(error)
  }
})