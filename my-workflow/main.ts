// =============================================================================
// CRE WORKFLOW ENTRY POINT
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
//   1. TRIGGERS  - Events that start the workflow (HTTP requests, schedules, etc.)
//   2. HANDLERS  - Functions that process the trigger and execute business logic
//   3. CAPABILITIES - Built-in features like EVM clients, HTTP, consensus, etc.
//
// This workflow implements a prediction market creation flow:
//   HTTP Request → Parse Question → Generate Report → Write to Smart Contract
//
// =============================================================================

import { cre, Runner, type Runtime } from "@chainlink/cre-sdk";
import { onHttpTrigger } from "./httpCallback";

// -----------------------------------------------------------------------------
// WORKFLOW CONFIGURATION TYPE
// -----------------------------------------------------------------------------
// This type defines the shape of your workflow's configuration.
// The config is loaded from config.staging.json or config.production.json
// based on the target specified when running the workflow.
//
// Config values are injected at runtime and accessed via `runtime.config`
// -----------------------------------------------------------------------------
type Config = {
  geminiModel: string;  // AI model for future enhancements (e.g., market validation)
  evms: Array<{
    marketAddress: string;      // Smart contract address to interact with
    chainSelectorName: string;  // Chainlink's chain identifier (e.g., "ethereum-testnet-sepolia")
    gasLimit: string;           // Gas limit for the transaction
  }>;
};

// -----------------------------------------------------------------------------
// WORKFLOW INITIALIZATION
// -----------------------------------------------------------------------------
// This function defines the workflow's structure by connecting triggers to handlers.
//
// KEY CONCEPTS:
//
// 1. CAPABILITIES - Pre-built modules that provide specific functionality:
//    - HTTPCapability: Enables HTTP request/response handling
//    - EVMClient: Enables interaction with EVM-compatible blockchains
//    - ConsensusCapability: Enables multi-node agreement on data
//
// 2. TRIGGERS - Events that initiate workflow execution:
//    - HTTP triggers: Activated by incoming HTTP requests
//    - Schedule triggers: Activated by cron-like schedules
//    - On-chain triggers: Activated by blockchain events
//
// 3. HANDLERS - Functions that process triggers using `cre.handler()`:
//    - Receive a Runtime object for accessing capabilities and config
//    - Receive the trigger's payload (e.g., HTTP request body)
//    - Return a response or perform actions like writing to contracts
// -----------------------------------------------------------------------------
const initWorkflow = (config: Config) => {
  // Create an HTTP capability instance
  // This enables the workflow to receive and respond to HTTP requests
  const httpCapability = new cre.capabilities.HTTPCapability();

  // Create a trigger from the HTTP capability
  // The empty object {} means no special trigger configuration
  // You could add options like authentication requirements here
  const httpTrigger = httpCapability.trigger({});

  // Return an array of handlers
  // Each handler connects a trigger to a processing function
  // Multiple handlers can be defined for different triggers
  return [
    cre.handler(
      httpTrigger,      // The trigger that activates this handler
      onHttpTrigger     // The function that processes the trigger
    ),
  ];
};

// -----------------------------------------------------------------------------
// MAIN FUNCTION
// -----------------------------------------------------------------------------
// The entry point that bootstraps and runs the workflow.
//
// Runner.newRunner<Config>():
//   - Initializes the CRE runtime environment
//   - Loads configuration from the appropriate config file
//   - Sets up communication with the Chainlink network
//
// runner.run(initWorkflow):
//   - Registers all handlers defined in initWorkflow
//   - Starts listening for triggers
//   - In simulation mode, processes test inputs
//   - In production, runs as a long-lived service
// -----------------------------------------------------------------------------
export async function main() {
  // Create a new runner instance with our Config type
  // The generic <Config> ensures type safety for runtime.config
  const runner = await Runner.newRunner<Config>();

  // Start the workflow with our initialization function
  await runner.run(initWorkflow);
}

// Bootstrap the workflow
main();
