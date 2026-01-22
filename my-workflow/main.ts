// =============================================================================
// CRE WORKFLOW ENTRY POINT - PREDICTION MARKET
// =============================================================================
//
// This is the main entry point for a Chainlink Runtime Environment (CRE) workflow.
//
// WHAT IS CRE?
// ------------
// CRE (Chainlink Runtime Environment) is Chainlink's decentralized compute
// platform that allows developers to build workflows that:
//   - Execute off-chain logic in a decentralized manner
//   - Interact with smart contracts across multiple chains
//   - Generate cryptographically signed reports that can be verified on-chain
//
// WORKFLOW ARCHITECTURE
// ---------------------
// A CRE workflow consists of:
//   1. TRIGGERS  - Events that start the workflow (HTTP requests, logs, schedules)
//   2. HANDLERS  - Functions that process triggers and execute business logic
//   3. CAPABILITIES - Built-in features like EVM clients, HTTP, consensus, etc.
//
// THIS WORKFLOW IMPLEMENTS:
//   Day 1: HTTP Trigger  → Create prediction markets via API calls
//   Day 2: Log Trigger   → Automatically settle markets when events are emitted
//
// =============================================================================

import { cre, Runner, getNetwork } from "@chainlink/cre-sdk";
import { keccak256, toHex } from "viem";
import { onHttpTrigger } from "./httpCallback";
import { onLogTrigger } from "./logCallback";

// -----------------------------------------------------------------------------
// WORKFLOW CONFIGURATION TYPE
// -----------------------------------------------------------------------------
// This type defines the shape of your workflow's configuration.
// The config is loaded from config.staging.json or config.production.json
// based on the environment. Config values are accessed via `runtime.config`.
// -----------------------------------------------------------------------------
type Config = {
  geminiModel: string;  // AI model for market resolution (future enhancement)
  evms: Array<{
    marketAddress: string;      // Smart contract address to interact with
    chainSelectorName: string;  // Chainlink's chain identifier (e.g., "ethereum-testnet-sepolia")
    gasLimit: string;           // Gas limit for transactions
  }>;
};

// -----------------------------------------------------------------------------
// EVENT SIGNATURE FOR LOG TRIGGER
// -----------------------------------------------------------------------------
// This is the Solidity event signature that the log trigger will listen for.
// When this event is emitted by the smart contract, the workflow is triggered.
//
// Event: SettlementRequested(uint256 indexed marketId, string question)
//   - marketId: The unique identifier of the prediction market
//   - question: The market's question that needs to be resolved
//
// The signature format follows Solidity's convention: "EventName(type1,type2,...)"
// Note: No spaces, no parameter names, just types
// -----------------------------------------------------------------------------
const SETTLEMENT_REQUESTED_SIGNATURE = "SettlementRequested(uint256,string)";

// =============================================================================
// WORKFLOW INITIALIZATION
// =============================================================================
// This function defines the workflow's structure by connecting triggers to handlers.
//
// KEY CONCEPTS:
//   CAPABILITIES - Pre-built modules providing specific functionality
//   TRIGGERS     - Events that initiate workflow execution
//   HANDLERS     - Functions that process triggers (via cre.handler())
// =============================================================================
const initWorkflow = (config: Config) => {
  // ---------------------------------------------------------------------------
  // HTTP TRIGGER SETUP (Day 1)
  // ---------------------------------------------------------------------------
  // HTTPCapability enables the workflow to receive HTTP requests.
  // When someone calls the workflow's HTTP endpoint, this trigger fires.
  // ---------------------------------------------------------------------------
  const httpCapability = new cre.capabilities.HTTPCapability();
  const httpTrigger = httpCapability.trigger({});

  // ---------------------------------------------------------------------------
  // LOG TRIGGER SETUP (Day 2) - On-Chain Event Listener
  // ---------------------------------------------------------------------------
  // Log triggers allow workflows to react to smart contract events.
  // This enables fully autonomous, event-driven systems without polling.
  //
  // HOW IT WORKS:
  //   1. CRE network monitors the specified contract address for events
  //   2. When a matching event is emitted, the workflow is automatically triggered
  //   3. The event data (topics and data) is passed to the handler function
  //
  // CONFIGURATION:
  //   - addresses: Contract addresses to monitor (hex format)
  //   - topics: Event signature hash + optional indexed parameter filters
  //   - confidence: Block confirmation level before triggering
  // ---------------------------------------------------------------------------

  // Resolve chain selector name to network metadata (including bigint selector)
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.evms[0].chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Network not found: ${config.evms[0].chainSelectorName}`);
  }

  // EVMClient provides blockchain interaction capabilities AND log triggers
  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

  // Compute keccak256 hash of the event signature
  // This is how Ethereum identifies events - topic[0] is always the signature hash
  // "SettlementRequested(uint256,string)" → 0x... (32 bytes)
  const eventHash = keccak256(toHex(SETTLEMENT_REQUESTED_SIGNATURE));

  // ---------------------------------------------------------------------------
  // HANDLER REGISTRATION
  // ---------------------------------------------------------------------------
  // Return an array of handlers - each connects a trigger to a processing function.
  // Multiple handlers allow a single workflow to respond to various events.
  // ---------------------------------------------------------------------------
  return [
    // Day 1: HTTP Trigger - Market Creation
    // Triggered by: POST request to workflow endpoint with market question
    cre.handler(httpTrigger, onHttpTrigger),

    // Day 2: Log Trigger - Event-Driven Settlement
    // Triggered by: SettlementRequested event emitted from the smart contract
    cre.handler(
      evmClient.logTrigger({
        addresses: [config.evms[0].marketAddress],  // Monitor our prediction market contract
        topics: [{ values: [eventHash] }],          // Filter for SettlementRequested events
        confidence: "CONFIDENCE_LEVEL_FINALIZED",   // Wait for block finalization
      }),
      onLogTrigger
    ),
  ];
};

// =============================================================================
// MAIN FUNCTION
// =============================================================================
// The entry point that bootstraps and runs the workflow.
//
// Runner.newRunner<Config>():
//   - Initializes the CRE runtime environment
//   - Loads configuration from the appropriate config file
//   - Sets up communication with the Chainlink network
//
// runner.run(initWorkflow):
//   - Registers all handlers defined in initWorkflow
//   - Starts listening for triggers (HTTP requests, on-chain events)
//   - In simulation mode, processes test inputs
//   - In production, runs as a long-lived service
// =============================================================================
export async function main() {
  // Create a new runner instance with our Config type
  // The generic <Config> ensures type safety for runtime.config
  const runner = await Runner.newRunner<Config>();

  // Start the workflow - this registers handlers and begins listening
  await runner.run(initWorkflow);
}

// Bootstrap the workflow
main();
