# CRE Prediction Market Workflow

This project demonstrates how to build a **Chainlink Runtime Environment (CRE)** workflow for creating prediction markets on-chain. It serves as an introduction to CRE concepts and patterns.

## What is CRE?

**Chainlink Runtime Environment (CRE)** is Chainlink's decentralized compute platform that enables developers to:

- Execute off-chain logic in a decentralized, trust-minimized manner
- Generate cryptographically signed reports verified by multiple nodes
- Write verified data to smart contracts across multiple chains
- Build complex workflows with triggers, handlers, and capabilities

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Workflow** | A program that runs on CRE nodes, processing triggers and executing logic |
| **Trigger** | An event that starts workflow execution (HTTP request, schedule, on-chain event) |
| **Handler** | A function that processes a trigger and executes business logic |
| **Capability** | Built-in modules providing functionality (EVMClient, HTTP, Consensus) |
| **Report** | A cryptographically signed payload that can be verified on-chain |
| **Runtime** | The execution context providing access to config, logging, and capabilities |

## Project Structure

```
my-workflow/
├── main.ts              # Workflow entry point - defines triggers and handlers
├── httpCallback.ts      # HTTP trigger handler - processes requests and writes to chain
├── workflow.yaml        # Deployment targets (staging, production)
├── config.staging.json  # Staging configuration (testnet)
├── config.production.json # Production configuration (mainnet)
├── package.json         # Dependencies
└── README.md            # This file
```

## Workflow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CRE WORKFLOW FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  HTTP Request                                                    Smart Contract
  {"question": "..."}                                            (Prediction Market)
        │                                                               ▲
        ▼                                                               │
┌───────────────┐    ┌───────────────┐    ┌───────────────┐    ┌──────────────┐
│  HTTP Trigger │───▶│    Handler    │───▶│  CRE Report   │───▶│  writeReport │
│               │    │ (httpCallback)│    │  (signed)     │    │  (EVMClient) │
└───────────────┘    └───────────────┘    └───────────────┘    └──────────────┘
                            │
                            ▼
                     ┌───────────────┐
                     │ ABI Encode    │
                     │ (viem)        │
                     └───────────────┘
```

## Configuration Files

### config.staging.json

```json
{
  "geminiModel": "gemini-2.0-flash",
  "evms": [
    {
      "marketAddress": "0x574aA1A5b99caE835a528f092F19c83583fEf13a",
      "chainSelectorName": "ethereum-testnet-sepolia",
      "gasLimit": "500000"
    }
  ]
}
```

### Configuration Fields

| Field | Type | Description |
|-------|------|-------------|
| `geminiModel` | string | AI model identifier (for future enhancements) |
| `evms` | array | List of EVM chain configurations |
| `evms[].marketAddress` | string | Smart contract address to interact with |
| `evms[].chainSelectorName` | string | Chainlink chain selector (e.g., `ethereum-testnet-sepolia`) |
| `evms[].gasLimit` | string | Gas limit for transactions |

### Supported Chain Selectors

| Chain | Selector Name |
|-------|---------------|
| Ethereum Sepolia | `ethereum-testnet-sepolia` |
| Polygon Mumbai | `polygon-testnet-mumbai` |
| Arbitrum Sepolia | `arbitrum-testnet-sepolia` |
| Avalanche Fuji | `avalanche-testnet-fuji` |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) runtime installed
- [CRE CLI](https://docs.chain.link/cre) installed
- A funded wallet (for chain writes)

### 1. Install Dependencies

```bash
cd my-workflow && bun install
```

### 2. Set Environment Variables

Create a `.env` file in the project root:

```bash
# Private key for signing transactions (must be funded on target chain)
CRE_ETH_PRIVATE_KEY=your_private_key_here
```

### 3. Simulate the Workflow

Run a simulation with broadcasting to test the full flow:

```bash
# From project root
cre workflow simulate my-workflow --broadcast -t staging-settings
```

With input data:

```bash
cre workflow simulate my-workflow --broadcast -t staging-settings \
  --input '{"question": "Will Argentina win the 2026 World Cup?"}'
```

### 4. Deploy to Production

```bash
cre workflow deploy my-workflow -t production-settings
```

## Key Code Walkthrough

### Entry Point (main.ts)

```typescript
// Create HTTP capability and trigger
const httpCapability = new cre.capabilities.HTTPCapability();
const httpTrigger = httpCapability.trigger({});

// Connect trigger to handler
return [
  cre.handler(httpTrigger, onHttpTrigger),
];
```

### Handler (httpCallback.ts)

```typescript
// 1. Parse input
const inputData = decodeJson(payload.input) as CreateMarketPayload;

// 2. Get network and create EVM client
const network = getNetwork({ chainFamily: "evm", chainSelectorName: "..." });
const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

// 3. Encode data for smart contract
const reportData = encodeAbiParameters(params, [inputData.question]);

// 4. Generate signed CRE report
const reportResponse = runtime.report({
  encodedPayload: hexToBase64(reportData),
  encoderName: "evm",
  signingAlgo: "ecdsa",
  hashingAlgo: "keccak256",
}).result();

// 5. Write report to smart contract
const writeResult = evmClient.writeReport(runtime, {
  receiver: contractAddress,
  report: reportResponse,
  gasConfig: { gasLimit: "500000" },
}).result();
```

## Smart Contract Integration

Your smart contract must implement the `onReport` function:

```solidity
function onReport(bytes calldata report) external {
    // 1. Verify CRE signatures (using Chainlink's verifier)
    // 2. Decode the payload
    // 3. Execute business logic (create market, etc.)
}
```

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Unknown chain: ...` | Invalid chainSelectorName | Check supported chain selectors |
| `Empty request payload` | No input provided | Pass `--input '{"question": "..."}'` |
| `Transaction failed` | Contract reverted | Check contract address and gas limit |
| `runtime.config.evms is undefined` | Missing config fields | Ensure config JSON has all required fields |

### Debugging Tips

1. Use `runtime.log()` for debugging output
2. Check transaction on block explorer using the returned tx hash
3. Verify contract address is correct and deployed
4. Ensure wallet has sufficient funds for gas

## Resources

- [CRE Documentation](https://docs.chain.link/cre)
- [Chainlink Chain Selectors](https://docs.chain.link/ccip/supported-networks)
- [Viem Documentation](https://viem.sh/) (for ABI encoding)
