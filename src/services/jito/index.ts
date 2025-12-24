import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import axios from "axios";
import bs58 from "bs58";

const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];

const JITO_BUNDLE_API = "https://mainnet.block-engine.jito.wtf/api/v1";

/**
 * Jito bundle service
 * Handles Jito bundles for faster transaction inclusion
 */
class JitoService {
  /**
   * Get random Jito tip account
   */
  private getRandomTipAccount(): PublicKey {
    const randomIndex = Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length);
    return new PublicKey(JITO_TIP_ACCOUNTS[randomIndex]);
  }

  /**
   * Add Jito tip instruction to versioned transaction
   * Note: For versioned transactions, the tip instruction should be added
   * before the transaction is signed
   */
  createTipInstruction(
    payer: PublicKey,
    tipAmount: number
  ): TransactionInstruction {
    const tipAccount = this.getRandomTipAccount();
    const tipLamports = Math.floor(tipAmount * LAMPORTS_PER_SOL);

    return SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: tipAccount,
      lamports: tipLamports,
    });
  }

  /**
   * Send bundle to Jito
   * @param transactions - Array of signed transactions
   */
  async sendBundle(
    transactions: (Transaction | VersionedTransaction)[]
  ): Promise<string> {
    try {
      // Serialize transactions
      const serializedTransactions = transactions.map((tx) => {
        const serialized =
          tx instanceof VersionedTransaction
            ? tx.serialize()
            : tx.serialize();
        return bs58.encode(serialized);
      });

      // Send bundle
      const response = await axios.post<{
        result: string;
      }>(`${JITO_BUNDLE_API}/bundles`, {
        jsonrpc: "2.0",
        id: 1,
        method: "sendBundle",
        params: [serializedTransactions],
      });

      return response.data.result;
    } catch (error) {
      console.error("Jito bundle error:", error);
      throw new Error(
        `Failed to send Jito bundle: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get bundle status
   * @param bundleId - Bundle ID returned from sendBundle
   */
  async getBundleStatus(bundleId: string): Promise<{
    landed: boolean;
    error?: string;
  }> {
    try {
      const response = await axios.post<{
        result: {
          context: { slot: number };
          value: Array<{
            confirmation_status: string;
            err: unknown;
            slot: number;
          }>;
        };
      }>(`${JITO_BUNDLE_API}/bundles`, {
        jsonrpc: "2.0",
        id: 1,
        method: "getBundleStatuses",
        params: [[bundleId]],
      });

      const statuses = response.data.result.value;

      if (statuses.length === 0) {
        return { landed: false };
      }

      const status = statuses[0];

      if (status.err) {
        return {
          landed: false,
          error: JSON.stringify(status.err),
        };
      }

      return {
        landed: status.confirmation_status === "confirmed" ||
          status.confirmation_status === "finalized",
      };
    } catch (error) {
      console.error("Bundle status error:", error);
      return {
        landed: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Check if Jito should be used based on settings
   */
  shouldUseJito(enableJito: boolean, jitoBribe: number): boolean {
    return enableJito && jitoBribe > 0;
  }
}

// Export singleton instance
export const jito = new JitoService();
