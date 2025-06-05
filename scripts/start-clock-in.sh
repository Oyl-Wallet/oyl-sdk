#!/bin/bash

# Auto Clock-In Service Launcher
# This script starts the automatic clock-in service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🕐 Starting Auto Clock-In Service${NC}"
echo -e "${BLUE}=================================${NC}"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo -e "${YELLOW}Please create a .env file with the required configuration:${NC}"
    echo "CLOCK_IN_MNEMONIC=\"your mnemonic here\""
    echo "NETWORK_TYPE=\"mainnet\""
    echo "SANDSHREW_PROJECT_ID=\"your project id\""
    exit 1
fi

# Check if TypeScript is compiled
if [ ! -f "lib/scripts/auto-clock-in.js" ]; then
    echo -e "${YELLOW}⚠️  Compiled JavaScript not found, building project...${NC}"
    npm run build
fi

# Load environment variables
source .env

# Validate required environment variables
if [ -z "$CLOCK_IN_MNEMONIC" ]; then
    echo -e "${RED}❌ Error: CLOCK_IN_MNEMONIC not set in .env${NC}"
    exit 1
fi

if [ -z "$SANDSHREW_PROJECT_ID" ]; then
    echo -e "${RED}❌ Error: SANDSHREW_PROJECT_ID not set in .env${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Configuration validated${NC}"
echo -e "${BLUE}📊 Service Configuration:${NC}"
echo -e "  Network: ${NETWORK_TYPE:-mainnet}"
echo -e "  Wallets: ${CLOCK_IN_WALLETS:-20}"
echo -e "  Calldata: ${CLOCK_IN_CALLDATA:-2,21568,103}"
echo -e "  Start Height: ${CLOCK_IN_START_HEIGHT:-899573}"
echo -e "  Interval: ${CLOCK_IN_INTERVAL:-144} blocks"
echo -e "  Initial Fee Multiplier: ${INITIAL_FEE_MULTIPLIER:-1.5}x"
echo -e "  Check Interval: ${BLOCK_CHECK_INTERVAL:-10000}ms"

echo ""
echo -e "${GREEN}🚀 Starting service...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Start the service
node lib/scripts/auto-clock-in.js