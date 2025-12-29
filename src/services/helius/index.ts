import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import axios from "axios";
import { HeliusPriorityFee, PriorityFeeLevel } from "@/types";

/**
 * Helius RPC service
 * Handles Solana connection and priority fee API
 */
class HeliusService {
  private connection: Connection | null = null;
  private apiKey: string;
  private rpcUrl: string;

  constructor() {
    this.apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY || "";
    this.rpcUrl =
      process.env.NEXT_PUBLIC_RPC_URL ||
      `https://mainnet.helius-rpc.com/?api-key=${this.apiKey}`;
  }

  /**
   * Get Solana connection
   */
  getConnection(): Connection {
    if (!this.connection) {
      this.connection = new Connection(this.rpcUrl, {
        commitment: "confirmed",
        confirmTransactionInitialTimeout: 60000, // 60 seconds
      });
    }
    return this.connection;
  }

  /**
   * Fetch priority fees from Helius API
   * https://docs.helius.dev/solana-rpc-nodes/alpha-priority-fee-api
   */
  async getPriorityFees(
    accountKeys: string[] = []
  ): Promise<HeliusPriorityFee> {
    const cleanKeys = (accountKeys || []).filter(
      (k): k is string => typeof k === "string" && k.length > 0
    );

    // Standard Solana RPC method (supported on Helius RPC endpoints)
    const body = {
      jsonrpc: "2.0",
      id: "recent-priority-fees",
      method: "getRecentPrioritizationFees",
      params: [cleanKeys], // can be [] too
    };

    try {
      console.log("[Helius] RPC URL:", this.rpcUrl);
      console.log("[Helius] Request body:", body);

      const res = await axios.post(this.rpcUrl, body, {
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
      });

      if (res.data?.error) {
        throw new Error(
          `RPC error ${res.data.error.code}: ${res.data.error.message}`
        );
      }

      // res.data.result = [{ slot: number, prioritizationFee: number }, ...]
      const fees: number[] = (res.data?.result ?? [])
        .map((x: { prioritizationFee: number }) => x.prioritizationFee)
        .filter((n: number) => Number.isFinite(n))
        .sort((a: number, b: number) => a - b);

      if (!fees.length) {
        // no data returned (rare), fallback
        return {
          min: 0,
          low: 1_000,
          medium: 10_000,
          high: 50_000,
          veryHigh: 100_000,
          unsafeMax: 1_000_000,
        };
      }

      const pick = (p: number) =>
        fees[Math.min(fees.length - 1, Math.floor(fees.length * p))];

      // Map percentiles into your levels (all in microLamports/CU)
      return {
        min: fees[0],
        low: pick(0.25),
        medium: pick(0.5),
        high: pick(0.75),
        veryHigh: pick(0.9),
        unsafeMax: fees[fees.length - 1],
      };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        console.error("[Helius] HTTP status:", err.response?.status);
        console.error("[Helius] Response data:", err.response?.data);
      }
      console.error("Failed to fetch priority fees:", err);

      return {
        min: 0,
        low: 1_000,
        medium: 10_000,
        high: 50_000,
        veryHigh: 100_000,
        unsafeMax: 1_000_000,
      };
    }
  }

  /**
   * Get priority fee for a specific level
   */
  async getPriorityFeeForLevel(
    level: PriorityFeeLevel,
    accountKeys?: string[]
  ): Promise<number> {
    const fees = await this.getPriorityFees(accountKeys);

    switch (level) {
      case "Low":
        return fees.low;
      case "Medium":
        return fees.medium;
      case "High":
        return fees.high;
      case "Turbo":
        return fees.veryHigh;
      default:
        return fees.medium;
    }
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(signature: string): Promise<{
    confirmed: boolean;
    error?: string;
  }> {
    const connection = this.getConnection();

    try {
      const status = await connection.getSignatureStatus(signature);

      if (!status.value) {
        return { confirmed: false };
      }

      if (status.value.err) {
        return {
          confirmed: false,
          error: JSON.stringify(status.value.err),
        };
      }

      return {
        confirmed:
          status.value.confirmationStatus === "confirmed" ||
          status.value.confirmationStatus === "finalized",
      };
    } catch (error) {
      return {
        confirmed: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Wait for transaction confirmation via WebSocket (real-time, no polling)
   * Opens WebSocket → Subscribes → Waits → Closes (lifecycle: 2-5s)
   * Free tier: ~150ms connection + real-time notification
   * Saves ~350ms vs 1s polling + reduces RPC calls (1 connection vs 30 polls)
   */
  async waitForConfirmationWebSocket(
    signature: string,
    timeoutMs: number = 60000
  ): Promise<{ confirmed: boolean; error?: string }> {
    const startTime = Date.now();
    console.log(`\n🔌 [WebSocket] Initiating connection for signature: ${signature}`);

    return new Promise((resolve) => {
      const wsUrl = this.rpcUrl.replace('https://', 'wss://');
      let ws: WebSocket | null = null;
      let subscriptionId: number | null = null;

      const cleanup = () => {
        if (ws) {
          try {
            // Unsubscribe if we have a subscription
            if (subscriptionId !== null) {
              ws.send(JSON.stringify({
                jsonrpc: '2.0',
                id: 999,
                method: 'signatureUnsubscribe',
                params: [subscriptionId]
              }));
              console.log(`🔌 [WebSocket] Unsubscribed from signature (ID: ${subscriptionId})`);
            }
            ws.close();
          } catch (err) {
            console.error('🔌 [WebSocket] Cleanup error:', err);
          }
        }
      };

      const timeout = setTimeout(() => {
        const elapsed = Date.now() - startTime;
        console.log(`⏱️  [WebSocket] Timeout after ${elapsed}ms`);
        cleanup();
        resolve({ confirmed: false, error: 'Confirmation timeout' });
      }, timeoutMs);

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          const connectTime = Date.now() - startTime;
          console.log(`✅ [WebSocket] Connected in ${connectTime}ms`);

          // Subscribe to signature notifications
          ws!.send(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'signatureSubscribe',
            params: [
              signature,
              { commitment: 'confirmed' }
            ]
          }));
          console.log(`🔌 [WebSocket] Subscription request sent for signature`);
        };

        ws.onmessage = (event) => {
          try {
            const response = JSON.parse(event.data);

            // Handle subscription confirmation (returns subscription ID)
            if (response.id === 1 && response.result !== undefined) {
              subscriptionId = response.result;
              console.log(`✅ [WebSocket] Subscribed successfully (ID: ${subscriptionId})`);
              return;
            }

            // Handle signature notification (transaction confirmed)
            if (response.method === 'signatureNotification') {
              const totalTime = Date.now() - startTime;
              console.log(`🔔 [WebSocket] Notification received after ${totalTime}ms`);

              clearTimeout(timeout);
              cleanup();

              const result = response.params?.result;

              if (result?.value?.err) {
                const error = JSON.stringify(result.value.err);
                console.log(`❌ [WebSocket] Transaction failed: ${error}`);
                resolve({
                  confirmed: false,
                  error
                });
              } else {
                console.log(`✅ [WebSocket] Transaction confirmed! Total time: ${totalTime}ms`);
                resolve({ confirmed: true });
              }
            }
          } catch (err) {
            console.error('🔌 [WebSocket] Message parse error:', err);
          }
        };

        ws.onerror = (error) => {
          const elapsed = Date.now() - startTime;
          console.error(`❌ [WebSocket] Error after ${elapsed}ms:`, error);
          clearTimeout(timeout);
          cleanup();
          resolve({ confirmed: false, error: 'WebSocket connection failed' });
        };

        ws.onclose = (event) => {
          const elapsed = Date.now() - startTime;
          console.log(`🔌 [WebSocket] Connection closed after ${elapsed}ms (code: ${event.code}, reason: ${event.reason || 'none'})`);
          clearTimeout(timeout);
        };

      } catch (err) {
        console.error('❌ [WebSocket] Failed to create connection:', err);
        clearTimeout(timeout);
        resolve({ confirmed: false, error: 'Failed to create WebSocket' });
      }
    });
  }

  /**
   * Get recent blockhash
   */
  async getRecentBlockhash(): Promise<{
    blockhash: string;
    lastValidBlockHeight: number;
  }> {
    const connection = this.getConnection();
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    return { blockhash, lastValidBlockHeight };
  }

  /**
   * Simulate transaction to get compute units
   */
  // async simulateTransaction(
  //   transaction: Transaction | VersionedTransaction
  // ): Promise<number> {
  //   const connection = this.getConnection();

  //   try {
  //     // Handle different transaction types with proper overloads
  //     const simulation =
  //       transaction instanceof VersionedTransaction
  //         ? await connection.simulateTransaction(transaction)
  //         : await connection.simulateTransaction(transaction);

  //     if (simulation.value.err) {
  //       throw new Error(
  //         `Simulation failed: ${JSON.stringify(simulation.value.err)}`
  //       );
  //     }

  //     // Return compute units used
  //     return simulation.value.unitsConsumed || 200000;
  //   } catch (error) {
  //     console.warn("Transaction simulation failed:", error);
  //     // Return default compute units if simulation fails
  //     return 200000;
  //   }
  // }

  async simulateTransaction(
    transaction: Transaction | VersionedTransaction
  ): Promise<number> {
    const connection = this.getConnection();

    try {
      let simulation;

      if (transaction instanceof VersionedTransaction) {
        // ✅ Versioned tx supports config object
        simulation = await connection.simulateTransaction(transaction, {
          sigVerify: false,
          replaceRecentBlockhash: true,
        });
      } else {
        // ✅ Legacy tx overload DOES NOT accept config object as 2nd arg
        // Use the legacy overload: (tx, signers?, includeAccounts?)
        simulation = await connection.simulateTransaction(
          transaction,
          undefined, // no signers
          true // includeAccounts -> helps debugging
        );
      }

      if (simulation.value.err) {
        console.error("[Sim] err:", simulation.value.err);
        console.error(
          "[Sim] logs:\n",
          (simulation.value.logs || []).join("\n")
        );

        // Check for insufficient lamports error
        const logs = simulation.value.logs || [];
        const insufficientLamportsLog = logs.find(log =>
          log.includes("insufficient lamports")
        );

        if (insufficientLamportsLog) {
          // Extract lamports amounts from log: "Transfer: insufficient lamports X, need Y"
          const match = insufficientLamportsLog.match(/insufficient lamports (\d+), need (\d+)/);
          if (match) {
            const have = parseInt(match[1]);
            const need = parseInt(match[2]);
            const short = need - have;
            throw new Error(
              `Insufficient SOL. You have ${(have / 1e9).toFixed(6)} SOL but need ${(need / 1e9).toFixed(6)} SOL (short by ${(short / 1e9).toFixed(6)} SOL). Add at least 0.02 SOL to your wallet to cover rent and fees.`
            );
          }
          throw new Error(
            `Insufficient SOL in wallet. Add at least 0.02 SOL to cover transaction rent and fees.`
          );
        }

        throw new Error(
          `Simulation failed: ${JSON.stringify(simulation.value.err)}`
        );
      }

      if (simulation.value.logs?.length) {
        console.log("[Sim] logs:\n", simulation.value.logs.join("\n"));
      }

      return simulation.value.unitsConsumed || 200000;
    } catch (error) {
      console.warn("Transaction simulation failed:", error);
      return 200000;
    }
  }
}

// Export singleton instance
export const helius = new HeliusService();
