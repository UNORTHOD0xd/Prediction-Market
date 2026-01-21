# Prediction Market

A decentralized prediction market powered by Chainlink CRE (Compute Runtime Environment) for AI-driven market settlement.

## Overview

This project implements a prediction market smart contract on Ethereum Sepolia where users can:

- Create markets based on yes/no questions
- Place predictions by staking ETH on outcomes
- Claim winnings after AI-powered settlement via Chainlink CRE

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
│   ├── main.ts                # Workflow entry point
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

The workflow in `my-workflow/` handles market settlement:

- Listens for `SettlementRequested` events (Log Trigger)
- Processes the question using AI to determine the outcome
- Sends settlement report back to the contract with:
  - `marketId` - The market being settled
  - `outcome` - Yes (0) or No (1)
  - `confidence` - AI confidence score (0-10000 basis points)

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

```bash
cd contracts
forge test
```

## Network

| Network | Chain ID | RPC |
|---------|----------|-----|
| Sepolia | 11155111 | https://ethereum-sepolia-rpc.publicnode.com |

## License

MIT
