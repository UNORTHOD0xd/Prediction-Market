// =============================================================================
// CRE HTTP TRIGGER HANDLER
// =============================================================================
//
// This file contains the handler function for HTTP-triggered workflow executions.
// It demonstrates core CRE concepts including:
//   - Processing HTTP payloads
//   - Encoding data for smart contracts
//   - Generating signed CRE reports
//   - Writing reports to EVM chains
//
// FLOW OVERVIEW:
// ==============
//   1. Receive HTTP request with prediction market question
//   2. Validate and parse the input payload
//   3. Encode the data in a format the smart contract expects
//   4. Generate a cryptographically signed CRE report
//   5. Submit the report to the target smart contract
//   6. Return the transaction hash
//
// =============================================================================

import {
  cre,
  type Runtime,
  type HTTPPayload,
  getNetwork,
  bytesToHex,
  hexToBase64,
  TxStatus,
  decodeJson,
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters } from "viem";

// -----------------------------------------------------------------------------
// TYPE DEFINITIONS
// -----------------------------------------------------------------------------

// The expected structure of the HTTP request body
// When calling the workflow, send: {"question": "Will X happen?"}
interface CreateMarketPayload {
  question: string;
}

// Configuration type (must match config.staging.json / config.production.json)
// This is accessed via runtime.config in the handler
type Config = {
    geminiModel: string;
    evms: Array<{
        marketAddress: string;      // Target contract address
        chainSelectorName: string;  // Chain identifier
        gasLimit: string;           // Gas limit for tx
    }>;
};

// -----------------------------------------------------------------------------
// ABI ENCODING
// -----------------------------------------------------------------------------
// parseAbiParameters creates a typed parameter definition for encoding data
// that will be sent to the smart contract. This must match the contract's
// expected function signature.
//
// The smart contract's receiver function expects: onReport(bytes calldata report)
// Inside that report, we encode: (string question)
// -----------------------------------------------------------------------------
const CREATE_MARKET_PARAMS = parseAbiParameters("string question");

// =============================================================================
// MAIN HANDLER FUNCTION
// =============================================================================
//
// This is the core handler that processes HTTP triggers.
//
// PARAMETERS:
// -----------
// runtime: Runtime<Config>
//   The CRE runtime object providing access to:
//   - runtime.config: Your workflow configuration (from JSON config files)
//   - runtime.log(): Logging function for debugging and monitoring
//   - runtime.report(): Generate signed CRE reports
//   - Access to capabilities like EVMClient
//
// payload: HTTPPayload
//   The incoming HTTP request containing:
//   - payload.input: The request body as bytes (needs decoding)
//   - payload.headers: HTTP headers (if needed)
//
// RETURNS:
// --------
// string: The transaction hash if successful, or an error message
//
// =============================================================================
export function onHttpTrigger(runtime: Runtime<Config>, payload: HTTPPayload): string {
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  runtime.log("CRE Workflow: HTTP Trigger - Create Market");
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    // ─────────────────────────────────────────────────────────────
    // Step 1: Parse and validate the incoming payload
    // ─────────────────────────────────────────────────────────────
    // The payload.input is raw bytes from the HTTP request body.
    // decodeJson() parses it into a JavaScript object.
    // Always validate inputs before processing!
    // ─────────────────────────────────────────────────────────────
    if (!payload.input || payload.input.length === 0) {
      runtime.log("[ERROR] Empty request payload");
      return "Error: Empty request";
    }

    // decodeJson converts the raw bytes to a typed object
    // The 'as CreateMarketPayload' asserts the expected shape
    const inputData = decodeJson(payload.input) as CreateMarketPayload;
    runtime.log(`[Step 1] Received market question: "${inputData.question}"`);

    if (!inputData.question || inputData.question.trim().length === 0) {
      runtime.log("[ERROR] Question is required");
      return "Error: Question is required";
    }

    // ─────────────────────────────────────────────────────────────
    // Step 2: Get network and create EVM client
    // ─────────────────────────────────────────────────────────────
    // CRE uses Chainlink's chain selectors to identify networks.
    // getNetwork() returns network metadata including the selector.
    //
    // EVMClient is a CRE capability that enables:
    //   - Reading from EVM contracts
    //   - Writing signed reports to EVM contracts
    //   - Transaction management
    // ─────────────────────────────────────────────────────────────

    // Get the first EVM configuration from the config file
    // In production, you might iterate over multiple chains
    const evmConfig = runtime.config.evms[0];

    // getNetwork resolves the chain selector name to full network details
    // chainSelectorName examples: "ethereum-testnet-sepolia", "polygon-mainnet"
    const network = getNetwork({
      chainFamily: "evm",                           // EVM-compatible chain
      chainSelectorName: evmConfig.chainSelectorName,  // From config
      isTestnet: true,                              // Testnet flag
    });

    if (!network) {
      throw new Error(`Unknown chain: ${evmConfig.chainSelectorName}`);
    }

    runtime.log(`[Step 2] Target chain: ${evmConfig.chainSelectorName}`);
    runtime.log(`[Step 2] Contract address: ${evmConfig.marketAddress}`);

    // Create an EVM client for the target chain
    // The selector is a unique identifier for the chain in Chainlink's network
    const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

    // ─────────────────────────────────────────────────────────────
    // Step 3: Encode the market data for the smart contract
    // ─────────────────────────────────────────────────────────────
    // Smart contracts expect data in ABI-encoded format.
    // encodeAbiParameters (from viem) creates the proper encoding.
    //
    // This encoded data will be wrapped in a CRE report and sent
    // to the smart contract's onReport() function.
    // ─────────────────────────────────────────────────────────────
    runtime.log("[Step 3] Encoding market data...");

    // Encode the question string according to the ABI parameters
    // Result is a hex string like: 0x0000000...
    const reportData = encodeAbiParameters(CREATE_MARKET_PARAMS, [inputData.question]);

    // ─────────────────────────────────────────────────────────────
    // Step 4: Generate a signed CRE report
    // ─────────────────────────────────────────────────────────────
    // CRE REPORTS are the core primitive for trustworthy off-chain compute.
    //
    // A report contains:
    //   - Your encoded payload (the market question)
    //   - Cryptographic signatures from CRE nodes
    //   - Metadata for verification
    //
    // The report generation process:
    //   1. Your data is sent to the CRE network
    //   2. Multiple nodes independently verify/sign the data
    //   3. Signatures are aggregated into a single report
    //   4. The report can be verified on-chain
    //
    // Report options:
    //   - encodedPayload: Your data in base64 format
    //   - encoderName: "evm" for EVM-compatible encoding
    //   - signingAlgo: "ecdsa" (standard for EVM)
    //   - hashingAlgo: "keccak256" (standard for EVM)
    // ─────────────────────────────────────────────────────────────
    runtime.log("[Step 4] Generating CRE report...");

    const reportResponse = runtime
      .report({
        encodedPayload: hexToBase64(reportData),  // Convert hex to base64
        encoderName: "evm",                        // EVM-compatible encoding
        signingAlgo: "ecdsa",                      // Elliptic curve signature
        hashingAlgo: "keccak256",                  // Ethereum's hash function
      })
      .result();  // .result() blocks until the report is ready

    // ─────────────────────────────────────────────────────────────
    // Step 5: Write the report to the smart contract
    // ─────────────────────────────────────────────────────────────
    // writeReport submits the signed report to your smart contract.
    //
    // The smart contract must implement:
    //   function onReport(bytes calldata report) external
    //
    // Inside onReport, the contract can:
    //   1. Verify the CRE signatures
    //   2. Decode the payload
    //   3. Execute business logic (create market, etc.)
    //
    // writeReport options:
    //   - receiver: The contract address to call
    //   - report: The signed report from step 4
    //   - gasConfig: Transaction gas settings
    // ─────────────────────────────────────────────────────────────
    runtime.log(`[Step 5] Writing to contract: ${evmConfig.marketAddress}`);

    const writeResult = evmClient
      .writeReport(runtime, {
        receiver: evmConfig.marketAddress,  // Target contract
        report: reportResponse,             // Signed report
        gasConfig: {
          gasLimit: evmConfig.gasLimit,     // Gas limit from config
        },
      })
      .result();  // .result() blocks until the transaction completes

    // ─────────────────────────────────────────────────────────────
    // Step 6: Check result and return transaction hash
    // ─────────────────────────────────────────────────────────────
    // TxStatus indicates the outcome:
    //   - SUCCESS: Transaction confirmed on-chain
    //   - FAILED: Transaction reverted
    //   - PENDING: Still processing (shouldn't happen with .result())
    //
    // The transaction hash can be used to:
    //   - Verify the transaction on a block explorer
    //   - Track the market creation event
    //   - Provide confirmation to the user
    // ─────────────────────────────────────────────────────────────
    if (writeResult.txStatus === TxStatus.SUCCESS) {
      // Convert the raw bytes to a hex string (0x...)
      const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
      runtime.log(`[Step 6] ✓ Transaction successful: ${txHash}`);
      runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      return txHash;
    }

    throw new Error(`Transaction failed with status: ${writeResult.txStatus}`);
  } catch (err) {
    // Error handling - log and re-throw for CRE to handle
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[ERROR] ${msg}`);
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    throw err;
  }
}
