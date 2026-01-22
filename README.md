# Prediction Market

A decentralized prediction market powered by Chainlink CRE (Compute Runtime Environment) for AI-driven market settlement.

## Overview

This project implements a prediction market smart contract on Ethereum Sepolia where users can:

- Create markets based on yes/no questions
- Place predictions by staking ETH on outcomes
- Claim winnings after AI-powered settlement via Chainlink CRE

## Complete Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PREDICTION MARKET FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. CREATE MARKET                                                           │
│     ├── via Smart Contract: createMarket(question)                          │
│     └── via CRE HTTP Trigger: POST to workflow endpoint                     │
│                                                                             │
│  2. USERS PREDICT                                                           │
│     └── predict(marketId, 0=Yes/1=No) + ETH stake                           │
│                                                                             │
│  3. REQUEST SETTLEMENT                                                      │
│     └── requestSettlement(marketId)                                         │
│         └── Emits: SettlementRequested(marketId, question)                  │
│                                                                             │
│  4. CRE LOG TRIGGER (Automatic)                                             │
│     ├── Step 1: Decode event → extract marketId, question                   │
│     ├── Step 2: EVM Read → getMarket() to check if already settled          │
│     ├── Step 3: HTTP → Query Gemini AI for YES/NO + confidence              │
│     └── Step 4: EVM Write → Send 0x01 prefixed report to contract           │
│                                                                             │
│  5. CONTRACT SETTLES                                                        │
│     └── _settleMarket() → Updates outcome, confidence, settled=true         │
│                                                                             │
│  6. CLAIM WINNINGS                                                          │
│     └── claim(marketId) → Winners receive proportional payout               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Architecture

```
Prediction-market/
├── contracts/                 # Solidity smart contracts (Foundry)
│   ├── src/
│   │   ├── PredictionMarket.sol
│   │   └── interfaces/
│   │       ├── IReceiver.sol
│   │       └── ReceiverTemplate.sol
│   └── lib/                   # Dependencies (forge-std, openzeppelin)
├── my-workflow/               # Chainlink CRE workflow
│   ├── main.ts                # Workflow entry point (registers triggers)
│   ├── httpCallback.ts        # HTTP trigger handler (market creation)
│   ├── logCallback.ts         # Log trigger handler (4-step settlement)
│   ├── gemini.ts              # Gemini AI integration
│   ├── config.staging.json    # Sepolia testnet configuration
│   └── workflow.yaml          # Workflow configuration
├── project.yaml               # CRE project settings
└── secrets.yaml               # Secrets configuration (gitignored)
```

## Smart Contract

### PredictionMarket.sol

**Deployed Address (Sepolia):** `0x574aA1A5b99caE835a528f092F19c83583fEf13a`

The contract inherits from `ReceiverTemplate` to receive verified reports from Chainlink's KeystoneForwarder.

#### Key Functions

| Function | Description |
|----------|-------------|
| `createMarket(string question)` | Create a new prediction market |
| `predict(uint256 marketId, Prediction prediction)` | Stake ETH on Yes or No |
| `requestSettlement(uint256 marketId)` | Emit event to trigger CRE settlement |
| `claim(uint256 marketId)` | Claim winnings after settlement |
| `getMarket(uint256 marketId)` | View market details |
| `getPrediction(uint256 marketId, address user)` | View user's prediction |

#### Market Lifecycle

1. **Creation** - Anyone creates a market with a yes/no question
2. **Prediction** - Users stake ETH on Yes or No outcomes
3. **Settlement Request** - Emits `SettlementRequested` event for CRE
4. **AI Settlement** - CRE workflow determines outcome and calls `onReport`
5. **Claim** - Winners claim proportional share of the losing pool

#### Security

The contract uses Chainlink's `ReceiverTemplate` which validates:
- Forwarder address (KeystoneForwarder on Sepolia: `0x15fc6ae953e024d975e77382eeec56a9101f9f88`)
- Optional: workflow ID, workflow owner, workflow name

## Chainlink CRE Workflow

The workflow in `my-workflow/` provides two triggers:

### HTTP Trigger (Day 1)
- Creates prediction markets via API calls to the workflow endpoint
- Handler: `httpCallback.ts`

### Log Trigger (Day 2)
- Automatically settles markets when `SettlementRequested` events are emitted
- Handler: `logCallback.ts`

### Settlement Flow (4 Steps)

| Step | Capability | Description |
|------|------------|-------------|
| 1 | Event Decode | Extract `marketId` and `question` from log event using viem |
| 2 | EVM Read | Call `getMarket()` to check if already settled |
| 3 | HTTP | Query Gemini AI for YES/NO outcome + confidence (0-10000) |
| 4 | EVM Write | Send `0x01` prefixed settlement report to contract |

### CRE Capabilities Used

| Capability | Purpose |
|------------|---------|
| `EVMClient` | Read contract state & write DON-signed reports |
| `HTTPClient` | Query Gemini AI API for market resolution |
| `Log Trigger` | Listen for `SettlementRequested` on-chain events |
| `Report` | Generate cryptographically signed reports for on-chain verification |

### Settlement Report Format

The report sent to the contract contains:
- `0x01` prefix byte - Routes to `_settleMarket()` function
- `marketId` (uint256) - The market being settled
- `outcome` (uint8) - Yes (0) or No (1)
- `confidence` (uint16) - AI confidence score (0-10000 basis points)

## Setup

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Bun](https://bun.sh/) (for CRE workflow)
- [CRE CLI](https://docs.chain.link/cre)

### Install Dependencies

```bash
# Smart contracts
cd contracts
forge install

# CRE workflow
cd ../my-workflow
bun install
```

### Environment Variables

Create a `.env` file in the root directory:

```env
CRE_ETH_PRIVATE_KEY=your_private_key_here
```

## Deployment

### Deploy Contract

```bash
cd contracts
source ../.env

forge create src/PredictionMarket.sol:PredictionMarket \
  --rpc-url "https://ethereum-sepolia-rpc.publicnode.com" \
  --private-key $CRE_ETH_PRIVATE_KEY \
  --broadcast \
  --constructor-args 0x15fc6ae953e024d975e77382eeec56a9101f9f88
```

### Deploy CRE Workflow

```bash
cd my-workflow
cre workflow deploy --target staging-settings
```

## Testing

### Smart Contract Tests

```bash
cd contracts
forge test
```

### Manual Testing Commands

```bash
# Setup environment
source .env
export MARKET_ADDRESS="0x574aA1A5b99caE835a528f092F19c83583fEf13a"
export RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"

# 1. Create a market
cast send $MARKET_ADDRESS \
  "createMarket(string)" "Will BTC reach 100k by March 2026?" \
  --rpc-url $RPC_URL \
  --private-key $CRE_ETH_PRIVATE_KEY

# 2. Make a prediction (0 = Yes, 1 = No)
cast send $MARKET_ADDRESS \
  "predict(uint256,uint8)" 0 0 \
  --value 0.01ether \
  --rpc-url $RPC_URL \
  --private-key $CRE_ETH_PRIVATE_KEY

# 3. Check market details
cast call $MARKET_ADDRESS "getMarket(uint256)" 0 --rpc-url $RPC_URL

# 4. Request settlement (triggers CRE workflow)
cast send $MARKET_ADDRESS \
  "requestSettlement(uint256)" 0 \
  --rpc-url $RPC_URL \
  --private-key $CRE_ETH_PRIVATE_KEY

# 5. Claim winnings (after settlement)
cast send $MARKET_ADDRESS \
  "claim(uint256)" 0 \
  --rpc-url $RPC_URL \
  --private-key $CRE_ETH_PRIVATE_KEY
```

### CRE Workflow Simulation

```bash
cd my-workflow
cre workflow simulate my-workflow --broadcast -t staging-settings
```

## Network

| Network | Chain ID | RPC |
|---------|----------|-----|
| Sepolia | 11155111 | https://ethereum-sepolia-rpc.publicnode.com |

## License

MIT
