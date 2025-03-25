"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.multiCallSandshrewProviderCall = exports.ordProviderCall = exports.alkanesProvider = void 0;
const commander_1 = require("commander");
const constants_1 = require("./constants");
const __1 = require("..");
/* @dev example call
  oyl provider alkanes -method getAlkanesByAddress -params '{"address":"brct21..."}'

  oyl provider alkanes -method simulate -params '{ "alkanes": [],"transaction": "0x", "block": "0x", "height": "20000", "txindex": 0, "target": {"block": "2", "tx": "1"}, "inputs": ["101"],"pointer": 0, "refundPointer": 0, "vout": 0}' -p regtest

  oyl provider alkanes -method meta -params '{ "target": {"block": "2", "tx": "1"}}' -p regtest

  Note the json format if you need to pass an object.
*/
exports.alkanesProvider = new commander_1.Command('alkanes')
    .description('Returns data based on alkanes method invoked')
    .requiredOption('-method, --method <method>', 'name of the method you want to call for the api.')
    .option('-params, --parameters <parameters>', 'parameters for the api method you are calling.')
    .option('-p, --provider <provider>', 'provider to use to access the network.')
    .option('--metashrew-rpc-url <url>', 'Direct URL to metashrew RPC endpoint')
    .action(async (options) => {
    let provider;
    if (options.metashrewRpcUrl) {
        const defaultProvider = constants_1.DEFAULT_PROVIDER[options.provider || 'regtest'];
        provider = new __1.Provider({
            url: defaultProvider.url,
            projectId: defaultProvider.projectId || '',
            network: defaultProvider.network,
            networkType: defaultProvider.networkType,
            metashrewRpcUrl: options.metashrewRpcUrl
        });
    }
    else {
        provider = constants_1.DEFAULT_PROVIDER[options.provider || 'regtest'];
    }
    let isJson;
    try {
        isJson = JSON.parse(options.parameters);
        console.log(JSON.stringify(await provider.alkanes[options.method](isJson), null, 2));
    }
    catch (error) {
        console.log(error);
    }
});
/* @dev example call
  oyl provider ord -method getTxOutput -params '{"ticker":"ordi"}' -p bitcoin

  please note the json format if you need to pass an object.
*/
exports.ordProviderCall = new commander_1.Command('ord')
    .description('Returns data based on ord method invoked')
    .requiredOption('-p, --provider <provider>', 'provider to use to access the network.')
    .requiredOption('-method, --method <method>', 'name of the method you want to call for the api.')
    .option('-params, --parameters <parameters>', 'parameters for the ord method you are calling.')
    .option('--metashrew-rpc-url <url>', 'Direct URL to metashrew RPC endpoint')
    .action(async (options) => {
    let provider;
    if (options.metashrewRpcUrl) {
        const defaultProvider = constants_1.DEFAULT_PROVIDER[options.provider];
        provider = new __1.Provider({
            url: defaultProvider.url,
            projectId: defaultProvider.projectId || '',
            network: defaultProvider.network,
            networkType: defaultProvider.networkType,
            metashrewRpcUrl: options.metashrewRpcUrl
        });
    }
    else {
        provider = constants_1.DEFAULT_PROVIDER[options.provider];
    }
    let isJson;
    try {
        isJson = JSON.parse(options.parameters);
        console.log(await provider.ord[options.method](isJson));
    }
    catch (error) {
        console.log(error);
    }
});
/* @dev example call
  oyl provider sandShrewMulticall -c '[{"method":"esplora_tx","params":["688f5c239e4e114af461dc1331d02ad5702e795daf2dcf397815e0b05cd23dbc"]},{"method":"btc_getblockcount", "params":[]}]' -p bitcoin
*/
exports.multiCallSandshrewProviderCall = new commander_1.Command('sandShrewMulticall')
    .description('Send multiple calls to sandshrew provider')
    .requiredOption('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    .requiredOption('-c, --calls <calls>', 'calls in this format: {method: string, params: string[]}')
    .option('--metashrew-rpc-url <url>', 'Direct URL to metashrew RPC endpoint')
    .action(async (options) => {
    let isJson = [];
    try {
        isJson = JSON.parse(options.calls);
        const multiCall = isJson.map((call) => {
            return [call.method, call.params];
        });
        let provider;
        if (options.metashrewRpcUrl) {
            const defaultProvider = constants_1.DEFAULT_PROVIDER[options.provider];
            provider = new __1.Provider({
                url: defaultProvider.url,
                projectId: defaultProvider.projectId || '',
                network: defaultProvider.network,
                networkType: defaultProvider.networkType,
                metashrewRpcUrl: options.metashrewRpcUrl
            });
        }
        else {
            provider = constants_1.DEFAULT_PROVIDER[options.provider];
        }
        console.log(await provider.sandshrew.multiCall(multiCall));
    }
    catch (error) {
        console.log(error);
    }
});
//# sourceMappingURL=provider.js.map