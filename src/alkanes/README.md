\*\* How to interact with alkanes

1. Deploy factory wasm using deployFactory

```
oyl alkane new-contract -resNumber 0x7 -p regtest -feeRate 2

```

Set a reserve number using the parameter -resNumber. This is what will be used to target the contract deployed in the commit tx when revealing.
This step only needs to be done 1 time, and everyone can use this contract to create tokens from it. No need to incur the cost of redeploying the wasm each time.

2. Launch a new token. This CLI function calls the execute function in alkanes.ts which builds a tx with a Protostone OP Return on it to send to yourself.

```
oyl alkane new-token -i ./src/cli/player1.png -resNumber 0x7 -p regtest -feeRate 2 -amount 1000 -name "OYL" -symbol "OL" -cap 100000 -supply 5000

```

3. You can then call OP Codes within the deployed token contract using the execute function and passing the alkane ID in the calldata

```
oyl alkane execute -p regtest -feeRate 2 -calldata '2,1,77'

```

If at any time you want to get information that doesnt change state know as a "view" function you can use simulate to read static data.
The target and the input is what matters here.

```
oyl provider alkanes -method simulate -params '{ "alkanes": [],"transaction": "0x", "block": "0x", "height": "20000", "txindex": 0, "target": {"block": "2", "tx": "1"}, "inputs": ["101"],"pointer": 0, "refundPointer": 0, "vout": 0}' -p regtest

```

Trace is another powerful utility that gives the entire alkane history given a txid and a vout. This can be for a factory contract or a individual contract.

```
oyl alkane trace -params '{"txid":"6cef369ae805d670b938b54461d460ebc2205f423c9b93aaf357cf22fe836582","vout":3}' -p regtest
```
