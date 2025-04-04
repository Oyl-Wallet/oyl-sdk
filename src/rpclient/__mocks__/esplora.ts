export class EsploraRpc {
  async getAddressUtxo() {
    return [
      {
        txid: '1234',
        vout: 0,
        value: 1000,
        // ... other required UTXO fields
      },
    ]
  }

  // Add other required mock methods...
}
