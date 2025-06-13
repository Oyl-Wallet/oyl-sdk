# Project Snowball - Chain Minting Usage Guide

## Overview

The `chain-mint` command implements Project Snowball, allowing you to mint exactly 25 alkane tokens in a single efficient transaction chain. This uses a sophisticated parent-child transaction architecture with implicit asset passing.

## Prerequisites

1. **Environment Setup**: Set your mnemonic in `.env` file:
   ```bash
   BATCH_MINT_MNEMONIC="your twelve word mnemonic phrase here"
   ```

2. **Sufficient BTC Balance**: Ensure your main wallet has enough BTC for:
   - Parent transaction fees
   - Child transaction fees (24 transactions)
   - Relay fuel amount
   - Safety buffer

3. **Valid Mint Contract**: You need a deployed alkane contract that supports minting (opcode 77).

## Command Syntax

```bash
oyl alkane chain-mint [options]
```

## Required Options

- `-c, --contract <contract>`: Contract ID in "block:tx" format (e.g., "12345:1")
- `-r, --receiver <address>`: Final receiver address for all minted tokens

## Optional Parameters

| Option | Default | Description |
|--------|---------|-------------|
| `-p, --provider <provider>` | `regtest` | Network provider (regtest, testnet, bitcoin) |
| `--fee-rate <sats>` | `10` | Fee rate in sat/vB (1-1000) |
| `--child-count <count>` | `24` | Number of child transactions (1-24) |
| `--retry-max <count>` | `3` | Maximum retry attempts for broadcasting |
| `--retry-delay <ms>` | `5000` | Delay between retries in milliseconds |
| `--dry-run` | `false` | Only calculate fees, don't execute |
| `--no-wait` | `false` | Don't wait for transaction acceptance |
| `--verbose` | `false` | Enable verbose logging |

## Usage Examples

### 1. Dry Run (Recommended First Step)
```bash
# Test the setup without executing
oyl alkane chain-mint \
  -c "12345:1" \
  -r "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4" \
  --dry-run
```

### 2. Basic Chain Minting (Regtest)
```bash
# Mint 24 tokens on regtest
oyl alkane chain-mint \
  -c "12345:1" \
  -r "bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kyaw3c8"
```

### 3. Mainnet with Custom Settings
```bash
# Mint on mainnet with higher fees and more retries
oyl alkane chain-mint \
  -p bitcoin \
  -c "840000:123" \
  -r "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4" \
  --fee-rate 50 \
  --retry-max 5 \
  --retry-delay 10000
```

### 4. Smaller Batch
```bash
# Mint only 10 tokens instead of 24
oyl alkane chain-mint \
  -c "12345:1" \
  -r "bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kyaw3c8" \
  --child-count 10
```

### 5. Fast Mode (No Wait)
```bash
# Don't wait for confirmations between transactions
oyl alkane chain-mint \
  -c "12345:1" \
  -r "bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kyaw3c8" \
  --no-wait
```

## Execution Flow

1. **Parameter Validation**: Checks contract ID format, receiver address, and fee parameters
2. **Wallet Generation**: Creates main wallet (funding) and relay wallet (intermediate) from your mnemonic
3. **Fee Calculation**: Performs dry-run to calculate exact fees needed for the entire chain
4. **Balance Check**: Verifies sufficient BTC balance in main wallet
5. **Transaction Building**: Constructs parent transaction and 24 child transactions
6. **Transaction Signing**: Signs all transactions with appropriate private keys
7. **Sequential Broadcasting**: 
   - Broadcasts parent transaction first
   - Waits for acceptance (unless `--no-wait`)
   - Broadcasts child transactions sequentially
8. **Result Monitoring**: Tracks success/failure of each transaction

## Expected Output

### Dry Run Output
```
🚀 Project Snowball - Alkane Chain Minting
=====================================

📋 Configuration:
   Network: regtest
   Contract: 12345:1
   Receiver: bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kyaw3c8
   Fee Rate: 10 sat/vB
   Child Transactions: 24
   Dry Run: Yes

🔐 Generating wallet system...
   Main Wallet: bcrt1p...
   Relay Wallet: bcrt1q...
   Relay Index: 123456

🧮 Calculating fees...
💰 Fee Calculation Result:
   Parent TX: 1500 sats (150 vB × 10 sat/vB)
   Normal Child TX (1-23): 1463 sats each (146.25 vB × 10 sat/vB)
   Final Child TX (24): 1585 sats (158.5 vB × 10 sat/vB)
   Total Child Fees: 35234 sats
   Final Output Dust: 330 sats (P2TR minimum)
   Relay Fuel: 35564 sats (including final output)
   Total Required: 37064 sats

💳 Checking balance...
   Available BTC: 500000 sats
   ✅ Sufficient funds available

🎯 DRY RUN COMPLETE - No transactions were executed
```

### Successful Execution Output
```
📡 Broadcasting transaction chain...

✅ Parent transaction broadcast successful: abc123...
✅ Child transaction 1 broadcast successful
✅ Child transaction 2 broadcast successful
...
✅ Child transaction 24 broadcast successful

📊 Final Summary:
   Total Transactions: 25
   Successful: 25
   Failed: 0
   Success Rate: 100.0%
   All Successful: Yes

🎉 PROJECT SNOWBALL COMPLETE!
   24 alkane tokens have been minted and sent to:
   bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kyaw3c8

💡 You can check your token balance using:
   oyl alkane list -p regtest
```

## Technical Details

### Transaction Architecture
- **Parent Transaction (TX₀)**: Initiates the chain, mints first token
  - vout=0: Relay output (fuel for child transactions)
  - vout=1: OP_RETURN (Protostone instruction)
  - vout=2: Change output (back to main wallet)

- **Child Transactions (TX₁-TX₂₄)**: Chain together sequentially
  - vout=0: Relay/final output (continues chain or final destination)
  - vout=1: OP_RETURN (Protostone instruction)

### Key Features
- **Implicit Asset Passing**: Empty edicts trigger automatic asset loading
- **Fixed vout Layout**: Predictable output structure for chain dependencies
- **RBF Support**: All transactions support Replace-by-Fee
- **Dust Threshold Validation**: Ensures outputs meet minimum requirements
- **Comprehensive Error Handling**: Detailed error messages and recovery suggestions

## Troubleshooting

### Common Issues

1. **"BATCH_MINT_MNEMONIC not set"**
   - Add your mnemonic to the `.env` file
   - Ensure the `.env` file is in the project root

2. **"Insufficient funds"**
   - Check your main wallet balance with `oyl utxo account-balance`
   - Consider using `oyl btc split` to create appropriately sized UTXOs

3. **"Invalid contract ID format"**
   - Use the format "block:tx" (e.g., "12345:1")
   - Verify the contract exists and supports minting

4. **"Transaction broadcast failed"**
   - Check network connectivity
   - Verify the node is synchronized
   - Try increasing `--retry-max` and `--retry-delay`

5. **"Parent transaction failed"**
   - This will stop the entire chain
   - Check if UTXOs were already spent
   - Try building the transaction again

### Best Practices

1. **Always run with `--dry-run` first** to verify setup and fee calculation
2. **Use appropriate fee rates** for current network conditions
3. **Monitor the process** - don't close the terminal during execution
4. **Keep sufficient buffer** - have more BTC than the calculated requirement
5. **Test on regtest first** before using mainnet
6. **Save transaction IDs** from the output for future reference

## Fee Estimation

The system calculates fees based on:
- Actual PSBT vSize measurements
- Current fee rate (sat/vB)
- Precise fee calculation without safety buffers
- Relay fuel for child transaction chain


Typical costs (at 10 sat/vB):
- Parent transaction: 1,500 sats (150 vB × 10 sat/vB)
- Normal child transactions (1-23): 1,463 sats each (146.25 vB × 10 sat/vB)
- Final child transaction (24): 1,585 sats (158.5 vB × 10 sat/vB)
- Final output dust: 330 sats (P2TR minimum)
- Total for 24 tokens: 37,064 sats (1,500 + 23×1,463 + 1,585 + 330)

## Security Considerations

- Your mnemonic is used to generate both main and relay wallets
- Private keys are only used for signing, never transmitted
- All transactions use RBF for potential fee bumping
- The relay wallet uses a random derivation index for privacy
- No sensitive data is logged in verbose mode

## Integration with Existing Tools

After successful chain minting, use these commands to verify results:

```bash
# Check your alkane token balance
oyl alkane list -p <network>

# View specific transaction details
oyl provider ord-provider-call -m "tx" -params '{"txid":"<transaction_id>"}'

# Check UTXO status
oyl utxo account-utxos
```