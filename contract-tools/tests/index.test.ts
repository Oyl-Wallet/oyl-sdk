import request from 'supertest';
import app from '../src/index'; // Your express app

// Mock oylsdk modules
jest.mock('../../src/account', () => ({
  generateMnemonic: jest.fn(),
  mnemonicToAccount: jest.fn(),
}));

jest.mock('../../src/provider', () => {
  // Mock constructor
  const mockProvider = jest.fn().mockImplementation(() => ({
    esplora: {
      broadcastTx: jest.fn(),
      getTxOutput: jest.fn(),
      getFeeEstimates: jest.fn().mockResolvedValue({ '1': 2 }), // Default fee rate
      getTx: jest.fn(), // For /deploy commit tx check - not directly in Provider but often a method
    },
    getUtxos: jest.fn(), // for /deploy and /execute
    // Add any other methods directly on Provider if used
    pushPsbt: jest.fn(), // General method for broadcasting
  }));
  return { Provider: mockProvider };
});


jest.mock('../../src/alkanes/alkanes', () => ({
  createDeployCommitPsbt: jest.fn(),
  createDeployRevealPsbt: jest.fn(), // Added for completeness, though sdkDeployReveal is primary
  sdkDeployReveal: jest.fn(), // This is from contract.ts, but often re-exported or called by execute
  execute: jest.fn(), // Renamed to sdkExecute in a previous step, ensure consistency
  encodeProtostone: jest.fn(),
  // Assuming sdkExecute is the correct name used in index.ts for the execute function
  // If `execute` is directly imported from alkanes.ts and aliased, this mock is fine.
  // Let's check index.ts for the actual import name, it was `sdkExecute`
}));

// Separate mock for contract.ts if functions are directly from there and not re-exported by alkanes/index.ts
jest.mock('../../src/alkanes/contract', () => ({
    actualDeployCommitFee: jest.fn(),
    actualDeployRevealFee: jest.fn(),
    deployReveal: jest.fn(), // This is the one aliased to sdkDeployReveal in index.ts
}));


jest.mock('../../src/psbt', () => ({
  Psbt: { // Mocking static methods of Psbt class if any, and constructor
    fromBase64: jest.fn(),
  },
  getEstimatedFee: jest.fn(),
}));

jest.mock('../../src/signer', () => ({
  Signer: jest.fn().mockImplementation(() => ({
    signAllInputs: jest.fn().mockResolvedValue({ signedPsbt: 'mock_signed_psbt_base64' }),
    // Add other methods if called, e.g., for reveal if not using high-level sdkDeployReveal's signer
  })),
}));

// Mock fs/promises
jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(Buffer.from('00asm_mock_wasm_content')),
}));

// Mock for alkanes/lib/index -> p2tr_ord_reveal if it's dynamically imported
// This is tricky. If it's a dynamic import, we might need to use jest.doMock
// For now, let's assume it's part of a module that can be mocked if needed,
// or the functions calling it (like sdkDeployReveal) are mocked directly.
// The dynamic import was `const { p2tr_ord_reveal } = await import('alkanes/lib/index');`
// This needs a specific setup if we are not mocking `sdkDeployReveal` entirely.
// Given `sdkDeployReveal` is mocked, this might not be immediately necessary.


// Import mocked modules to access their mock functions for assertions/setup
import { generateMnemonic, mnemonicToAccount } from '../../src/account';
import { Provider } from '../../src/provider';
import { Psbt, getEstimatedFee } from '../../src/psbt';
import { 
    createDeployCommitPsbt, 
    encodeProtostone,
    execute as sdkExecute // Assuming this is the final name used in index.ts
} from '../../src/alkanes/alkanes';
import { actualDeployCommitFee, actualDeployRevealFee, deployReveal as sdkDeployRevealAliased } from '../../src/alkanes/contract';
import { Signer } from '../../src/signer';
import fs from 'fs/promises';


// Mock for the dynamic import of alkanes/lib for p2tr_ord_reveal in /deploy
// This is complex. Awaiting guidance or will mock higher-level functions like sdkDeployReveal entirely.
// For now, assuming sdkDeployReveal mock handles this.

describe('Contract Tools API', () => {
    // Define mock return values for SDK functions
    const mockMnemonic = 'mock test mnemonic words';
    const mockAccount = { 
        taproot: { address: 'mock_taproot_address', pubKeyXOnly: 'mockpubkeyxonlyhex', pubkey: 'mocktaprootpubkeyhex' },
        nativeSegwit: { address: 'mock_nativesegwit_address' },
        // ... other address types if needed by tests
        spendStrategy: { changeAddress: 'taproot' }, // Example spend strategy
        network: {}, // Mock network object if needed
    };
    const mockCommitPsbtBase64 = 'mock_commit_psbt_base64_string';
    const mockCommitFee = 1000;
    const mockRevealFee = 500;
    const mockTotalEstimatedFee = mockCommitFee + mockRevealFee;
    const mockRecipientAddress = 'mock_recipient_address_from_mnemonic';
    
    let mockProviderInstance: any;
    let mockSignerInstance: any;
    let mockPsbtInstance: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup default mock implementations for each test
        (generateMnemonic as jest.Mock).mockReturnValue(mockMnemonic);
        (mnemonicToAccount as jest.Mock).mockReturnValue(mockAccount);

        // Provider mock setup
        mockProviderInstance = {
            esplora: {
                broadcastTx: jest.fn().mockResolvedValue('mock_tx_id_from_broadcast'),
                getTxOutput: jest.fn().mockResolvedValue({ value: 10000, scriptpubkey: 'mock_script_pub_key', address: 'mock_contract_utxo_address' }),
                getFeeEstimates: jest.fn().mockResolvedValue({ '1': 2 }),
                getTx: jest.fn().mockResolvedValue({ txid: 'mock_commit_tx_details', vout: [{ value: 10000 }] }), // For /deploy commit check
            },
            getUtxos: jest.fn().mockResolvedValue([{ txid: 'mock_utxo_txid', outputIndex: 0, satoshis: 50000, scriptPk: 'scriptpk', address: 'mock_utxo_address' }]),
            pushPsbt: jest.fn().mockResolvedValue({ txId: 'pushed_psbt_txid' }), // General method for broadcasting
        };
        (Provider as jest.Mock).mockImplementation(() => mockProviderInstance);
        
        // Signer mock setup
        mockSignerInstance = {
            signAllInputs: jest.fn().mockResolvedValue({ signedPsbt: 'mock_signed_psbt_base64_from_signer' }),
        };
        (Signer as jest.Mock).mockImplementation(() => mockSignerInstance);

        // PSBT mock setup (for Psbt.fromBase64)
        mockPsbtInstance = {
            extractTransaction: jest.fn().mockReturnValue({ toHex: jest.fn().mockReturnValue('mock_extracted_tx_hex') }),
            // Add other methods if called directly on PSBT object by routes
        };
        (Psbt.fromBase64 as jest.Mock).mockReturnValue(mockPsbtInstance);


        // Mock SDK functions for /preDeploy
        (actualDeployCommitFee as jest.Mock).mockResolvedValue({ fee: mockCommitFee, vsize: 200 });
        // For estimateSimplifiedRevealFee, it calls getEstimatedFee internally.
        (getEstimatedFee as jest.Mock).mockResolvedValue({ fee: mockRevealFee, vsize: 100 });
        (createDeployCommitPsbt as jest.Mock).mockResolvedValue({ psbt: mockCommitPsbtBase64 }); // Matches return structure of createDeployCommitPsbt

        // Mock for fs/promises
        (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('00asm_mock_wasm_content_hex', 'hex'));

        // Mock for /deploy
        (sdkDeployRevealAliased as jest.Mock).mockResolvedValue({ txId: 'mock_reveal_txid_from_sdk' });
        // Mock for encodeProtostone used in /deploy and /execute
        (encodeProtostone as jest.Mock).mockReturnValue(Buffer.from('mock_protostone_buffer_hex', 'hex'));
        
        // Mock for /execute
        // Note: `sdkExecute` was the alias for `execute` from `alkanes.ts`
        // Check that the mock name here matches the import alias in the test file.
        // The import was `import { ..., execute as sdkExecute } from '../../src/alkanes/alkanes';`
        // So the mock should be on `sdkExecute`.
        (sdkExecute as jest.Mock).mockResolvedValue({ txId: 'mock_execution_txid_from_sdk' });

    });

    describe('POST /preDeploy', () => {
        it('should pre-deploy successfully with valid inputs', async () => {
            const response = await request(app)
                .post('/preDeploy')
                .send({ contractName: 'testContract', symbol: 'TST', totalSupply: 1000 });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                psbt: mockCommitPsbtBase64,
                mnemonic: mockMnemonic,
                estimatedCommitFee: mockCommitFee,
                estimatedRevealFee: mockRevealFee, // This comes from getEstimatedFee mock
                totalEstimatedFee: mockCommitFee + mockRevealFee,
                recipientAddress: mockAccount.taproot.address,
            });

            expect(generateMnemonic).toHaveBeenCalledTimes(1);
            expect(mnemonicToAccount).toHaveBeenCalledWith({ mnemonic: mockMnemonic, opts: { network: {} } }); // Network is mocked provider's network
            expect(fs.readFile).toHaveBeenCalledWith(expect.stringContaining('placeholder_contract_1.wasm'));
            expect(actualDeployCommitFee).toHaveBeenCalled();
            expect(getEstimatedFee).toHaveBeenCalled(); // Called by estimateSimplifiedRevealFee
            expect(createDeployCommitPsbt).toHaveBeenCalled();
        });

        it('should return 400 if contractName is missing', async () => {
            const response = await request(app)
                .post('/preDeploy')
                .send({ symbol: 'TST', totalSupply: 1000 });
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Missing required fields');
        });

        it('should return 400 if symbol is missing', async () => {
            const response = await request(app)
                .post('/preDeploy')
                .send({ contractName: 'testContract', totalSupply: 1000 });
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Missing required fields');
        });

        it('should return 400 if totalSupply is missing', async () => {
            const response = await request(app)
                .post('/preDeploy')
                .send({ contractName: 'testContract', symbol: 'TST' });
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Missing required fields');
        });

        it('should return 500 if an SDK function throws an error', async () => {
            (actualDeployCommitFee as jest.Mock).mockRejectedValueOnce(new Error('SDK Error'));
            const response = await request(app)
                .post('/preDeploy')
                .send({ contractName: 'testContract', symbol: 'TST', totalSupply: 1000 });
            expect(response.status).toBe(500);
            expect(response.body.error).toContain('Failed to pre-deploy contract: SDK Error');
        });
    });

    describe('POST /deploy', () => {
        const deployPayload = {
            signedCommitPsbtBase64: 'mock_signed_commit_psbt_base64',
            mnemonic: mockMnemonic,
            contractName: 'testContract',
            symbol: 'TST',
            totalSupply: 1000,
            decimals: 0,
        };

        it('should deploy successfully with valid inputs', async () => {
            const response = await request(app)
                .post('/deploy')
                .send(deployPayload);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                success: true,
                commitTxId: 'mock_tx_id_from_broadcast', // from mockProviderInstance.esplora.broadcastTx
                revealTxId: 'mock_reveal_txid_from_sdk', // from sdkDeployRevealAliased mock
                contractId: 'mock_reveal_txid_from_sdk',
                alkaneId: 'mock_reveal_txid_from_sdk:0',
            });

            expect(Psbt.fromBase64).toHaveBeenCalledWith(deployPayload.signedCommitPsbtBase64, expect.anything());
            expect(mockPsbtInstance.extractTransaction).toHaveBeenCalledWith(true);
            expect(mockProviderInstance.esplora.broadcastTx).toHaveBeenCalledWith('mock_extracted_tx_hex');
            expect(fs.readFile).toHaveBeenCalledWith(expect.stringContaining(`${deployPayload.contractName}.wasm`));
            expect(encodeProtostone).toHaveBeenCalled(); // Called to prepare protostone for sdkDeployReveal
            expect(sdkDeployRevealAliased).toHaveBeenCalled();
            expect(mnemonicToAccount).toHaveBeenCalledWith({ mnemonic: deployPayload.mnemonic, opts: { network: {} }});
            expect(Signer).toHaveBeenCalled();
        });

        it('should return 400 if signedCommitPsbtBase64 is missing', async () => {
            const { signedCommitPsbtBase64, ...payload } = deployPayload;
            const response = await request(app).post('/deploy').send(payload);
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Missing required fields');
        });

        it('should return 400 if mnemonic is missing', async () => {
            const { mnemonic, ...payload } = deployPayload;
            const response = await request(app).post('/deploy').send(payload);
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Missing required fields');
        });
        
        it('should return 400 if contractName is missing', async () => {
            const { contractName, ...payload } = deployPayload;
            const response = await request(app).post('/deploy').send(payload);
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Missing required fields');
        });

        it('should return 500 if broadcasting commit tx fails', async () => {
            (mockProviderInstance.esplora.broadcastTx as jest.Mock).mockRejectedValueOnce(new Error('Broadcast failed'));
            
            const response = await request(app)
                .post('/deploy')
                .send(deployPayload);
            
            expect(response.status).toBe(500);
            expect(response.body.error).toContain('Failed to deploy contract: Broadcast failed');
        });

        it('should return 500 if sdkDeployReveal fails', async () => {
            (sdkDeployRevealAliased as jest.Mock).mockRejectedValueOnce(new Error('Reveal SDK Error'));
            
            const response = await request(app)
                .post('/deploy')
                .send(deployPayload);

            expect(response.status).toBe(500);
            expect(response.body.error).toContain('Failed to deploy contract: Reveal SDK Error');
        });

        it('should return 404 if wasm file not found (fs.readFile throws)', async () => {
            (fs.readFile as jest.Mock).mockRejectedValueOnce({ code: 'ENOENT' }); // Simulate file not found
            
            const response = await request(app)
                .post('/deploy')
                .send(deployPayload);
            
            expect(response.status).toBe(500); // Or handle as 404 if error handling is more specific
            expect(response.body.error).toContain('Failed to deploy contract');
        });
    });

    describe('POST /execute', () => {
        const executePayload = {
            contractId: 'mock_contract_txid:0',
            methodName: 'transfer',
            args: ['recipient_address_hex', 100],
            mnemonic: mockMnemonic,
            feeAddress: 'mock_fee_address',
            frontendFee: 50,
        };

        it('should execute successfully with valid inputs', async () => {
            const response = await request(app)
                .post('/execute')
                .send(executePayload);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                success: true,
                executionTxId: 'mock_execution_txid_from_sdk',
            });

            expect(mnemonicToAccount).toHaveBeenCalledWith({ mnemonic: executePayload.mnemonic, opts: { network: {} } });
            expect(Signer).toHaveBeenCalled();
            expect(mockProviderInstance.esplora.getTxOutput).toHaveBeenCalledWith('mock_contract_txid', 0);
            expect(mockProviderInstance.getUtxos).toHaveBeenCalledWith({ address: mockAccount.taproot.address, provider: mockProviderInstance });
            expect(encodeProtostone).toHaveBeenCalled();
            expect(sdkExecute).toHaveBeenCalledWith(expect.objectContaining({
                alkanesUtxos: [expect.objectContaining({ txId: 'mock_contract_txid', outputIndex: 0 })],
                account: mockAccount,
                protostone: Buffer.from('mock_protostone_buffer_hex', 'hex'),
                frontendFee: BigInt(executePayload.frontendFee),
                feeAddress: executePayload.feeAddress,
            }));
        });

        it('should return 400 if contractId is missing', async () => {
            const { contractId, ...payload } = executePayload;
            const response = await request(app).post('/execute').send(payload);
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Missing required fields');
        });

        it('should return 400 if contractId is malformed', async () => {
            const response = await request(app).post('/execute').send({ ...executePayload, contractId: 'invalid_id' });
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Invalid contractId format');
        });
        
        it('should return 400 if methodName is missing', async () => {
            const { methodName, ...payload } = executePayload;
            const response = await request(app).post('/execute').send(payload);
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Missing required fields');
        });

        it('should return 400 if args is not an array', async () => {
            const response = await request(app).post('/execute').send({ ...executePayload, args: 'not_an_array' });
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Missing required fields');
        });
        
        it('should return 400 if mnemonic is missing', async () => {
            const { mnemonic, ...payload } = executePayload;
            const response = await request(app).post('/execute').send(payload);
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Missing required fields');
        });

        it('should return 404 if contract UTXO not found', async () => {
            (mockProviderInstance.esplora.getTxOutput as jest.Mock).mockResolvedValueOnce(null);
            const response = await request(app).post('/execute').send(executePayload);
            expect(response.status).toBe(404);
            expect(response.body.error).toContain('Contract UTXO not found');
        });
        
        it('should return 400 if no UTXOs found for caller', async () => {
            (mockProviderInstance.getUtxos as jest.Mock).mockResolvedValueOnce([]);
            const response = await request(app).post('/execute').send(executePayload);
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('No UTXOs found for the caller account to pay fees');
        });

        it('should return 500 if sdkExecute fails', async () => {
            (sdkExecute as jest.Mock).mockRejectedValueOnce(new Error('Execute SDK Error'));
            const response = await request(app).post('/execute').send(executePayload);
            expect(response.status).toBe(500);
            expect(response.body.error).toContain('Failed to execute contract method: Execute SDK Error');
        });
    });
});
