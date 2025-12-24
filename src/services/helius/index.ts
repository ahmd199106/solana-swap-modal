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
