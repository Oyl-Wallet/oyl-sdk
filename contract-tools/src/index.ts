import express, { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import * as bitcoin from 'bitcoinjs-lib';
import ecc from '@bitcoinerlab/secp256k1';
bitcoin.initEccLib(ecc);

// OYLSDK imports
import { generateMnemonic, mnemonicToAccount, Account } from '../../src/account';
import { Provider } from '../../src/provider';
import { 
    actualDeployCommitFee,
    actualDeployRevealFee,
    deployReveal as sdkDeployReveal, // Renaming to avoid conflict with potential local function
    // createDeployCommitPsbt is in alkanes.ts, actualDeployCommitFee is in contract.ts
} from '../../src/alkanes/contract';
import { 
    createDeployCommitPsbt,
    createDeployRevealPsbt, // Import this for creating reveal PSBT
    encodeProtostone, // For encoding contract metadata
    AlkanesPayload, // Already have this but ensure it's available
    execute as sdkExecute, // For executing contract methods
    ProtostoneMessage // Type for protostone message
} from '../../src/alkanes/alkanes';
import { Signer } from '../../src/signer'; // For signing the reveal transaction
import { FormattedUtxo, selectSpendableUtxos, getUtxos } from '../../src/utxo'; // For empty UTXO arrays and UTXO selection
import { getEstimatedFee, Psbt } from '../../src/psbt'; // For estimating reveal fee component if needed separately & Psbt class
import { tweakSigner, getAddressType } from '../../src/shared/utils'; // to get tweakedPublicKey and address type


const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// --- Helper: Estimate Reveal Fee (Simplified) ---
// This is a simplified estimation because actualDeployRevealFee needs commitTxId and script.
// We'll construct a dummy reveal PSBT structure for size estimation.
const estimateSimplifiedRevealFee = async (
    provider: Provider, 
    feeRate: number, 
    deployerAccount: Account, 
    placeholderProtostone: Buffer
): Promise<number> => {
    // Create a dummy reveal PSBT structure for fee estimation
    // This won't be the actual reveal PSBT, just for size calculation.
    const dummyCommitTxId = '0000000000000000000000000000000000000000000000000000000000000000';
    const dummyScript = Buffer.from('00c8', 'hex'); // A dummy script, e.g., OP_0 OP_RETURN (minimal)
                                                  // Actual script is output of p2tr_ord_reveal
                                                  // but for size, a placeholder is okay.

    // The tweaked public key for reveal is derived from the deployer's account
    // This assumes the deployer account's taproot key pair is used for the inscription.
    // For preDeploy, we are generating a new mnemonic, so this new account *is* the deployer.
    const internalKey = Buffer.from(deployerAccount.taproot.pubKeyXOnly, 'hex');
    
    // A simplified p2tr structure for the reveal input from commit
    const revealInputPayment = bitcoin.payments.p2tr({
        internalPubkey: internalKey,
        scriptTree: { output: dummyScript }, // Dummy script tree
        network: provider.network,
    });

    const psbt = new bitcoin.Psbt({ network: provider.network });
    psbt.addInput({
        hash: dummyCommitTxId,
        index: 0,
        witnessUtxo: { value: 10000, script: revealInputPayment.output! }, // Dummy value and script
        tapLeafScript: [
            {
                leafVersion: bitcoin.payments.bip341.LEAF_VERSION_TAPSCRIPT,
                script: dummyScript,
                controlBlock: Buffer.from(revealInputPayment.witness![revealInputPayment.witness!.length - 1]!), // Dummy control block
            },
        ],
    });
    psbt.addOutput({ address: deployerAccount.taproot.address, value: 546 }); // Output for contract asset
    psbt.addOutput({ script: placeholderProtostone, value: 0 }); // OP_RETURN for protostone

    try {
        const { fee } = await getEstimatedFee({ feeRate, psbt: psbt.toBase64(), provider });
        return fee;
    } catch (e) {
        // Fallback to a rough estimate if getEstimatedFee fails on dummy PSBT
        console.warn("Simplified reveal fee estimation using getEstimatedFee failed, using fallback size.", e);
        const typicalRevealVSize = 150; // A rough estimate for a typical reveal transaction
        return typicalRevealVSize * feeRate;
    }
};


app.post('/preDeploy', async (req: Request, res: Response) => {
    const { contractName, symbol, totalSupply } = req.body;

    if (!contractName || !symbol || typeof totalSupply !== 'number') {
        return res.status(400).json({ error: 'Missing required fields: contractName, symbol, totalSupply' });
    }

    try {
        // 1. Initialize Provider (assuming testnet for now)
        const provider = new Provider(bitcoin.networks.testnet);
        const feeRate = (await provider.esplora.getFeeEstimates())['1'] || 2; // Default to 2 sats/vB if API fails

        // 2. Generate mnemonic and deployer account
        // This new account will be used to derive the tweakedPublicKey for the commit output.
        // The user will sign a PSBT that sends funds to an output controlled by this new account's key.
        const mnemonic = generateMnemonic();
        const deployerAccount = mnemonicToAccount({ mnemonic, opts: { network: provider.network } });
        const recipientAddress = deployerAccount.taproot.address; // Final destination for contract assets (in protostone)

        // 3. Load placeholder Wasm
        const wasmFileName = 'placeholder_contract_1.wasm'; // Later use contractName to select
        // Path relative to compiled output (e.g., contract-tools/lib/src/index.js)
        const wasmFilePath = path.join(__dirname, `../../wasm/${wasmFileName}`);
        const contractWasm = await fs.readFile(wasmFilePath);

        // 4. Prepare AlkanesPayload for commit
        const payload: AlkanesPayload = {
            body: contractWasm.toString('hex'),
            contentType: 'application/wasm',
            // `protostone` field is not part of AlkanesPayload for commit, it's for reveal.
            // The symbol, totalSupply, recipientAddress will be part of the `protostone` data for the reveal step.
        };

        // 5. Estimate Commit Fee
        // For preDeploy, UTXOs are unknown. Pass empty array.
        // The `tweakedPublicKey` for `actualDeployCommitFee` should be derived from the `deployerAccount`'s taproot pubkey.
        // The `oylsdk`'s `deployCommit` uses `tweakSigner` internally. We need to replicate that concept for the public key.
        // However, `actualDeployCommitFee` itself takes `tweakedPublicKey` as a string.
        // The `signer.taprootKeyPair` is not available directly from `Account` type.
        // We need to create a dummy Signer or directly a keypair for `tweakSigner`.
        // For simplicity here, we'll assume the `deployerAccount.taproot.pubKeyXOnly` can be used as the basis for a tweaked key
        // or that `actualDeployCommitFee` handles this if `tweakedPublicKey` is just the xOnly pubkey.
        // Let's use a simple internal key for tweaking, as the actual signing will be by the user.
        // The `tweakSigner` function expects a `bitcoin.Signer` (like ECPair).
        // We'll use the `deployerAccount.taproot.pubkey` as the public key from which the commit output address is derived.
        
        // For `actualDeployCommitFee`, we need a `tweakedPublicKey`.
        // This key is what the commit output UTXO will be spendable by (in the reveal tx).
        // In a real scenario, this would be the user's key. For preDeploy, we use our generated `deployerAccount`.
        const commitOutputInternalKey = Buffer.from(deployerAccount.taproot.pubKeyXOnly, 'hex');
        // `tweakSigner` is usually for a private key / ECPair. For just getting a tweaked *public* key for an address,
        // we can use bitcoin.payments.p2tr's internal logic.
        // The address for the commit output will be a P2TR address. Its internal key is `commitOutputInternalKey`.
        const commitPayment = bitcoin.payments.p2tr({ internalPubkey: commitOutputInternalKey, network: provider.network });
        const tweakedPublicKeyForEstimation = commitOutputInternalKey.toString('hex'); // Simplified: actual tweaking might involve script tree.
                                                                        // SDK functions might abstract this.
                                                                        // `actualDeployCommitFee` takes this as string.

        const { fee: commitFee } = await actualDeployCommitFee({
            payload,
            utxos: [] as FormattedUtxo[], // No user UTXOs known at preDeploy
            tweakedPublicKey: tweakedPublicKeyForEstimation, // Pubkey of the generated account
            account: deployerAccount, // For change address configuration (less relevant here)
            provider,
            feeRate,
        });
        
        // 6. Estimate Reveal Fee (Simplified)
        // The protostone data for reveal (symbol, supply, recipient)
        // This is a simplified protostone for fee estimation. Actual encoding might be more complex.
        const placeholderProtostoneCalldata = [
            Buffer.from(symbol, 'utf8').toString('hex'), // Example: symbol as hex
            totalSupply.toString(16), // Example: totalSupply as hex
            Buffer.from(recipientAddress, 'utf8').toString('hex') // Example: recipient as hex
        ].map(hex => BigInt('0x' + hex)); // Convert hex strings to BigInt array

        // This is a placeholder for the actual protostone encoding logic
        // const { encodeProtostone } from '../../src/alkanes/alkanes'; // Assuming this function exists and is suitable
        // const actualProtostoneBuffer = encodeProtostone({ calldata: placeholderProtostoneCalldata });
        const simpleProtostoneForFeeEst = Buffer.from(`000102030405${Buffer.from(symbol).toString('hex')}${totalSupply.toString(16)}`, 'hex'); // Very rough

        const revealFee = await estimateSimplifiedRevealFee(provider, feeRate, deployerAccount, simpleProtostoneForFeeEst);

        const totalEstimatedFee = commitFee + revealFee;

        // 7. Create Commit PSBT
        // This PSBT will have no inputs. The user's wallet will add inputs.
        // The output will be to an address derived from `deployerAccount.taproot.pubkey` (via tweaking).
        const { psbt: commitPsbtBase64 } = await createDeployCommitPsbt({
            payload,
            utxos: [] as FormattedUtxo[],
            tweakedPublicKey: tweakedPublicKeyForEstimation, // Pubkey of the generated account
            account: deployerAccount, // For change address output in PSBT (user's wallet might override)
            provider,
            feeRate,
            fee: commitFee, // Use the estimated commit fee
        });

        // 8. Return PSBT (for commit) and mnemonic
        res.json({ 
            psbt: commitPsbtBase64, 
            mnemonic,
            estimatedCommitFee: commitFee,
            estimatedRevealFee: revealFee,
            totalEstimatedFee: totalEstimatedFee,
            recipientAddress: recipientAddress, // Address derived from mnemonic for contract assets
        });

    } catch (error: any) {
        console.error('Error in /preDeploy:', error);
        let errorMessage = 'Failed to pre-deploy contract';
        if (error.message) {
            errorMessage += `: ${error.message}`;
        }
        if (error.response && error.response.data) { // Axios error
            errorMessage += ` - ${JSON.stringify(error.response.data)}`;
        }
        res.status(500).json({ error: errorMessage, details: error.stack });
    }
});

app.listen(port, () => {
    console.log(`Contract tools server listening on port ${port}`);
});

// Export app for testing purposes
// export default app; // Commenting out for now if running directly, will be uncommented if needed for tests

app.post('/deploy', async (req: Request, res: Response) => {
    const { signedCommitPsbtBase64, mnemonic, contractName, symbol, totalSupply, decimals } = req.body;

    if (!signedCommitPsbtBase64 || !mnemonic || !contractName || !symbol || typeof totalSupply !== 'number') {
        return res.status(400).json({ 
            error: 'Missing required fields: signedCommitPsbtBase64, mnemonic, contractName, symbol, totalSupply' 
        });
    }
    const contractDecimals = decimals ?? 0; // Default decimals to 0 if not provided

    try {
        // 1. Initialize SDK components
        const provider = new Provider(bitcoin.networks.testnet); // Assuming testnet
        const feeRate = (await provider.esplora.getFeeEstimates())['1'] || 2;

        // Account from the mnemonic provided (this account signed the commit inputs and will pay for reveal)
        const deployerAccount = mnemonicToAccount({ mnemonic, opts: { network: provider.network } });
        const signer = new Signer({ account: deployerAccount, provider }); // Signer for reveal tx

        // 2. Process and Broadcast Commit Transaction
        const commitPsbt = Psbt.fromBase64(signedCommitPsbtBase64, { network: provider.network });
        
        // The PSBT should already be signed by the user.
        // Finalize if necessary (Psbt class in oylsdk might handle this internally or need explicit call)
        // Assuming extractTransaction works on an already signed PSBT.
        // If oylsdk's Psbt needs explicit finalization:
        // commitPsbt.finalizeAllInputs(); // This method might not exist or be named differently.
                                        // For now, assume user's wallet finalized it.
        const commitTxHex = commitPsbt.extractTransaction(true).toHex(); // true for witness
        const commitTxId = await provider.esplora.broadcastTx(commitTxHex);

        console.log(`Commit Tx broadcasted: ${commitTxId}`);

        // Wait for commit tx to be picked up by mempool (important for Esplora to find it)
        // In a real app, use a more robust confirmation check (e.g., check getTx until found)
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay

        // 3. Load Wasm
        const wasmFileName = `${contractName}.wasm`;
        const wasmFilePath = path.join(__dirname, `../../wasm/${wasmFileName}`);
        const contractWasm = await fs.readFile(wasmFilePath);

        // 4. Prepare AlkanesPayload for Reveal (needed for script construction)
        const revealPayload: AlkanesPayload = {
            body: contractWasm.toString('hex'),
            contentType: 'application/wasm',
        };
        
        // 5. Construct Protostone data for contract initialization (symbol, supply, etc.)
        // This data is embedded in the OP_RETURN of the reveal transaction.
        // The actual structure of calldata depends on the contract's constructor/init function.
        // Assuming a simple structure: [symbol_hex, totalSupply_hex, decimals_hex, owner_address_hex]
        // The `encodeProtostone` function from alkanes.ts is used.
        const calldata = [
            BigInt('0x' + Buffer.from(symbol, 'utf8').toString('hex')),
            BigInt(totalSupply),
            BigInt(contractDecimals),
            // The recipient of tokens or contract ownership is often the deployerAccount's taproot address
            BigInt('0x' + Buffer.from(deployerAccount.taproot.address, 'ascii').toString('hex')) 
        ];
        const protostoneBuffer = encodeProtostone({ calldata });


        // 6. Determine script for reveal (from commit output)
        // The commit transaction creates an output that the reveal transaction will spend.
        // We need the script from that output.
        // The `createDeployCommitPsbt` in `/preDeploy` used `deployerAccount.taproot.pubKeyXOnly`
        // to form the `tweakedPublicKeyForEstimation`. This means the output script of the commit tx
        // is a P2TR output spendable by this `deployerAccount`.
        // The actual script (tapscript) for the inscription is constructed using `p2tr_ord_reveal`.

        // We need the commit transaction's output script that pays to the tweaked public key.
        // This is used to build the *input* for the reveal transaction.
        // The `sdkDeployReveal` function in `oylsdk/src/alkanes/contract.ts` handles this.
        // It needs the `script` from the commit output.
        // `deployCommit` (not used here directly) returns this script.
        // We need to reconstruct or fetch the script for the specific output of the commit tx.

        // For `sdkDeployReveal`, we need the `script` from the commit transaction's output that
        // corresponds to the inscription. This script is what `p2tr_ord_reveal` generates.
        // The `createDeployCommitPsbt` function in `alkanes.ts` (used in `/preDeploy`)
        // creates an output to `inscriberInfo.address`. The `script` of this output is needed.
        // Let's assume the commit PSBT (and thus tx) was structured correctly by `/preDeploy`'s use of `createDeployCommitPsbt`.
        // The `script` parameter for `sdkDeployReveal` is the script of the *commit output being spent*.
        
        // The `deployCommit` function in `alkanes.ts` (which `preDeploy` doesn't call directly to get the tx)
        // returns a `script`. This script is the `p2tr_ord_reveal(...).script`.
        // Since we don't have it directly from `/preDeploy`, we need to reconstruct it or ensure
        // `sdkDeployReveal` can derive it or doesn't need it explicitly if it can use `commitTxId`.

        // Looking at `oylsdk/src/alkanes/contract.ts -> deployReveal`
        // It takes `commitTxId`, `script` (hex string of the script from commit output), `protostone`, `account`, `provider`, `feeRate`, `signer`.
        // The `script` is crucial. It's the output script of the P2TR inscription envelope from the commit.
        // This script was generated by `p2tr_ord_reveal` using the tweaked public key of the `deployerAccount` (from mnemonic)
        // and the `AlkanesPayload` (Wasm).

        const internalKeyHex = deployerAccount.taproot.pubKeyXOnly; // from the account associated with the mnemonic
        const internalKeyBuffer = Buffer.from(internalKeyHex, 'hex');
        
        // Reconstruct the tapscript for the inscription (this is what `p2tr_ord_reveal` does)
        // This might be a simplified version of what `p2tr_ord_reveal` in `alkanes/lib` does.
        // The actual `p2tr_ord_reveal` is more complex and involves tagging.
        // For now, let's assume `sdkDeployReveal` can handle finding this script or it's passed correctly.
        // The `preDeploy` step created a PSBT whose output is spendable by `deployerAccount`.
        // The `script` for `sdkDeployReveal` refers to the script to be revealed (the inscription script).
        
        // Let's use a placeholder for the script construction or assume sdkDeployReveal handles it.
        // The `script` argument for `sdkDeployReveal` is the scriptHex of the commit output.
        // This can be obtained by parsing the commitTx's output.
        // However, the `sdkDeployReveal` function from `contract.ts` internally calls `actualDeployRevealFee`
        // and `createDeployRevealPsbt` from `alkanes.ts`. These need the script.

        // We need to get the script from the commit transaction output.
        // The commit transaction (from signedCommitPsbtBase64) was created by `createDeployCommitPsbt`.
        // Its first output (index 0) should be the one that pays to the inscription address.
        const commitTxOutputs = bitcoin.Transaction.fromHex(commitTxHex).outs;
        if (commitTxOutputs.length === 0) {
            throw new Error('Commit transaction has no outputs.');
        }
        const commitOutputScriptHex = commitTxOutputs[0].script.toString('hex');
        // This `commitOutputScriptHex` is NOT the inscription content script itself, but the scriptPubKey of the UTXO.
        // The `script` parameter for `sdkDeployReveal` (and underlying functions)
        // is the actual *inscription content script* that was part of the commit's scriptTree.
        // This is generated using `p2tr_ord_reveal` from `alkanes/lib`.
        // The `AlkanesPayload` (Wasm) is used for this.
        // We need to reconstruct this script.
        
        const { p2tr_ord_reveal } = await import('alkanes/lib/index'); // Dynamically import for p2tr_ord_reveal
        const inscriptionScript = Buffer.from(
            p2tr_ord_reveal(internalKeyBuffer, [revealPayload]) // revealPayload contains wasm etc.
                .script
        ).toString('hex');


        // 7. Perform the Reveal step using the SDK's `deployReveal` function
        const revealResult = await sdkDeployReveal({
            commitTxId,
            script: inscriptionScript, // The actual inscription script hex
            protostone: protostoneBuffer,
            account: deployerAccount,
            provider,
            feeRate,
            signer,
            // `utxos` will be fetched by the SDK function if not provided or if it needs more
        });

        // 8. Return response
        // The contractId is typically the revealTxId or revealTxId:vout (alkaneId)
        const contractId = revealResult.txId; // Assuming revealResult.txId is the reveal txid
                                           // and this is used as contractId

        res.json({
            success: true,
            commitTxId,
            revealTxId: revealResult.txId,
            contractId: contractId, // Or derive as per oylsdk convention e.g. AlkaneID
            alkaneId: `${revealResult.txId}:0`, // Example alkane ID format
        });

    } catch (error: any) {
        console.error('Error in /deploy:', error, error.stack);
        let errorMessage = 'Failed to deploy contract';
        if (error.message) {
            errorMessage += `: ${error.message}`;
        }
        // Check for esplora errors (e.g., broadcast error)
        if (error.response && error.response.data) { 
            errorMessage += ` - Esplora: ${error.response.data}`;
        }
        res.status(500).json({ error: errorMessage, details: error.stack });
    }
});


app.listen(port, () => {
    console.log(`Contract tools server listening on port ${port}`);
});

export default app;


app.post('/execute', async (req: Request, res: Response) => {
    const { contractId, methodName, args, mnemonic, feeAddress, frontendFee } = req.body;

    if (!contractId || !methodName || !Array.isArray(args) || !mnemonic) {
        return res.status(400).json({ 
            error: 'Missing required fields: contractId, methodName, args, mnemonic' 
        });
    }

    try {
        // 1. Initialize SDK components
        const provider = new Provider(bitcoin.networks.testnet); // Assuming testnet
        const feeRate = (await provider.esplora.getFeeEstimates())['1'] || 2;

        const callerAccount = mnemonicToAccount({ mnemonic, opts: { network: provider.network } });
        const signer = new Signer({ account: callerAccount, provider });

        // 2. Parse contractId and fetch contract UTXO (alkane UTXO)
        const [contractTxid, contractVoutStr] = contractId.split(':');
        const contractVout = parseInt(contractVoutStr, 10);
        if (!contractTxid || isNaN(contractVout)) {
            return res.status(400).json({ error: 'Invalid contractId format. Expected txid:vout.' });
        }

        // Fetch the specific UTXO that represents the contract (alkane)
        // This UTXO will be spent as an input to the contract call transaction.
        const contractUtxoDetails = await provider.esplora.getTxOutput(contractTxid, contractVout);
        if (!contractUtxoDetails) {
            return res.status(404).json({ error: `Contract UTXO not found for ${contractId}` });
        }
        const contractAlkaneUtxo: FormattedUtxo = {
            txId: contractTxid,
            outputIndex: contractVout,
            satoshis: contractUtxoDetails.value,
            scriptPk: contractUtxoDetails.scriptpubkey,
            address: contractUtxoDetails.address, // Assuming esplora returns this
        };
        
        // 3. Prepare Protostone calldata for the method call
        // The `calldata` for `encodeProtostone` should be an array of BigInts.
        // `methodName` could be one of the BigInts, and `args` converted to BigInts.
        // This encoding is highly dependent on the contract's expected format.
        // Example: [methodIdentifier, arg1, arg2, ...]
        // For simplicity, converting methodName to a number (e.g., hash or predefined id)
        // and args to numbers/BigInts.
        
        let encodedArgs: bigint[] = [];
        try {
            // Attempt to convert methodName to a BigInt (e.g. if it's a number string)
            // Or use a hashing scheme if method names are strings, e.g. simple char sum for demo
            let methodId: bigint;
            if (!isNaN(Number(methodName))) {
                methodId = BigInt(methodName);
            } else {
                methodId = BigInt(methodName.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0));
            }
            encodedArgs.push(methodId);

            for (const arg of args) {
                if (typeof arg === 'number' || (typeof arg === 'string' && !isNaN(Number(arg)))) {
                    encodedArgs.push(BigInt(arg));
                } else if (typeof arg === 'string') {
                    // Convert string to hex, then to BigInt if it's not a number
                    encodedArgs.push(BigInt('0x' + Buffer.from(arg, 'utf8').toString('hex')));
                } else {
                    // Fallback for other types or throw error
                    throw new Error(`Unsupported argument type: ${typeof arg}`);
                }
            }
        } catch (e: any) {
            return res.status(400).json({ error: `Invalid argument format for protostone encoding: ${e.message}` });
        }
        
        const protostoneMessage: ProtostoneMessage = {
            calldata: encodedArgs,
            // `pointer` could be used if the call targets a specific UTXO output for result, default 0
            // `edicts` for token transfers, etc. For generic calls, might be empty.
        };
        const protostoneBuffer = encodeProtostone(protostoneMessage);

        // 4. Fetch UTXOs for the caller to pay for fees
        const allUtxos = await getUtxos({ address: callerAccount.taproot.address, provider });
        if (!allUtxos || allUtxos.length === 0) {
            return res.status(400).json({ error: 'No UTXOs found for the caller account to pay fees.' });
        }
        // Filter out the contract UTXO itself if it happens to be owned by the caller and is in allUtxos
        const spendableUtxos = allUtxos.filter(utxo => !(utxo.txId === contractTxid && utxo.outputIndex === contractVout));
        if (spendableUtxos.length === 0 && contractAlkaneUtxo.address !== callerAccount.taproot.address) {
             // Special case: if the contract UTXO is the only UTXO and not owned by caller, then error.
             // Or if all UTXOs are just the contract UTXO and it's not owned by caller.
            return res.status(400).json({ error: 'No spendable UTXOs found for the caller account to pay fees, excluding the contract UTXO itself if not owned.' });
        }


        // 5. Execute the contract method using the SDK's `execute` function
        // The `execute` function in `alkanes.ts` handles PSBT creation, signing, and broadcasting.
        // It requires the contract's UTXO to be passed in `alkanesUtxos`.
        const executionResult = await sdkExecute({
            alkanesUtxos: [contractAlkaneUtxo], // The specific contract UTXO to be spent
            utxos: spendableUtxos, // UTXOs for fee payment
            account: callerAccount,
            protostone: protostoneBuffer,
            provider,
            feeRate,
            signer,
            frontendFee: frontendFee ? BigInt(frontendFee) : undefined,
            feeAddress: feeAddress,
        });

        // 6. Return response
        res.json({
            success: true,
            executionTxId: executionResult.txId,
            // `result` from contract execution is complex and typically involves observing new UTXOs or events.
            // For now, just returning the transaction ID.
        });

    } catch (error: any) {
        console.error('Error in /execute:', error, error.stack);
        let errorMessage = 'Failed to execute contract method';
        if (error.message) {
            errorMessage += `: ${error.message}`;
        }
        if (error.response && error.response.data) { 
            errorMessage += ` - Details: ${typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)}`;
        }
        res.status(500).json({ error: errorMessage, details: error.stack });
    }
});
