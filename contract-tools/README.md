# Contract Tools

This subproject provides a backend API service for deploying and interacting with Wasm contracts on the OYL network.

## Features

- Pre-deploy contracts to calculate deployment costs and generate a PSBT for user signing.
- Deploy Wasm contracts to the chain.
- Execute methods on deployed contracts.

## API Endpoints

- `POST /preDeploy`: Calculates deployment costs and returns a PSBT and mnemonic.
- `POST /deploy`: Deploys a contract using a signed PSBT.
- `POST /execute`: Executes a method on a deployed contract.
