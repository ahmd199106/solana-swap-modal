import axios from "axios";
import { VersionedTransaction } from "@solana/web3.js";
import { JupiterQuote, JupiterSwapTransaction } from "@/types";

// Jupiter API v6 endpoint
// IMPORTANT: quote-api.jup.ag was deprecated (as of Sept 30, 2025)
// Correct endpoint: https://api.jup.ag/v6 (or https://lite-api.jup.ag/swap/v1 for new API)
// API Key may be required for Basic plan (1 RPS) - get from portal.jup.ag/api-keys
const JUPITER_API_BASE =
  process.env.NEXT_PUBLIC_JUPITER_API_URL || "https://api.jup.ag/v6";

/**
 * Jupiter swap service
 * Handles quote fetching and transaction building
 */
class JupiterService {
  /**
   * Get swap quote
   * @param inputMint - Input token mint address
   * @param outputMint - Output token mint address
   * @param amount - Amount in smallest unit (e.g., lamports for SOL)
   * @param slippageBps - Slippage in basis points (50 = 0.5%)
   */
  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 50
  ): Promise<JupiterQuote> {
    try {
      // Handle CORS proxy URLs (if NEXT_PUBLIC_JUPITER_API_URL includes a proxy)
      let url = `${JUPITER_API_BASE}/quote`;
      const params: Record<string, string> = {
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps: slippageBps.toString(),
        onlyDirectRoutes: "false",
        asLegacyTransaction: "false",
      };

      // If using CORS proxy, append the full URL as a parameter
      if (
        JUPITER_API_BASE.includes("corsproxy.io") ||
        JUPITER_API_BASE.includes("allorigins.win")
      ) {
        // Proxy already includes the base URL, so we need to construct the full URL
        const targetUrl = `https://api.jup.ag/v6/quote?${new URLSearchParams(params).toString()}`;
        url = JUPITER_API_BASE.includes("corsproxy.io")
          ? `${JUPITER_API_BASE.replace("/v6", "")}${encodeURIComponent(targetUrl)}`
          : `${JUPITER_API_BASE}&url=${encodeURIComponent(targetUrl)}`;
        // Use empty params object since they're in the URL now
        Object.keys(params).forEach((key) => {
          delete params[key];
        });
      }

      // Get API key from environment (optional - required for Basic plan)
      const apiKey = process.env.NEXT_PUBLIC_JUPITER_API_KEY;
      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      // Add API key header if available (required for Basic plan: 1 RPS)
      if (apiKey) {
        headers["x-api-key"] = apiKey;
      }

      console.log("Fetching Jupiter quote:", {
        url,
        params,
        hasApiKey: !!apiKey,
      });

      const response = await axios.get<JupiterQuote>(url, {
        params: Object.keys(params).length > 0 ? params : undefined,
        timeout: 15000, // 15 second timeout for proxy
        headers,
      });

      console.log("Jupiter quote received:", response.data);
      return response.data;
    } catch (error) {
      console.error("Jupiter quote error:", error);

      // Provide more helpful error messages
      if (axios.isAxiosError(error)) {
        if (
          error.code === "ERR_NAME_NOT_RESOLVED" ||
          error.code === "ENOTFOUND"
        ) {
          throw new Error(
            `Cannot resolve Jupiter API domain. ` +
              `The endpoint has been updated. Use: https://api.jup.ag/v6 ` +
              `(quote-api.jup.ag was deprecated). Get API key from portal.jup.ag/api-keys`
          );
        }
        if (error.code === "ECONNABORTED") {
          throw new Error(
            "Request timeout. Jupiter API may be slow or unavailable."
          );
        }
        if (error.response) {
          throw new Error(
            `Jupiter API error: ${error.response.status} - ${error.response.statusText}`
          );
        }
      }

      throw new Error(
        `Failed to fetch quote: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Build swap transaction from quote
   * @param quote - Jupiter quote
   * @param userPublicKey - User's wallet public key
   * @param priorityFee - Priority fee in micro-lamports
   */
  async buildSwapTransaction(
    quote: JupiterQuote,
    userPublicKey: string,
    priorityFee?: number
  ): Promise<VersionedTransaction> {
    try {
      // Get API key from environment (optional - required for Basic plan)
      const apiKey = process.env.NEXT_PUBLIC_JUPITER_API_KEY;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add API key header if available
      if (apiKey) {
        headers["x-api-key"] = apiKey;
      }

      const response = await axios.post<JupiterSwapTransaction>(
        `${JUPITER_API_BASE}/swap`,
        {
          quoteResponse: quote,
          userPublicKey,
          wrapAndUnwrapSol: true,
          computeUnitPriceMicroLamports: priorityFee,
          dynamicComputeUnitLimit: true,
        },
        { headers }
      );

      // Deserialize transaction
      const swapTransactionBuf = Buffer.from(
        response.data.swapTransaction,
        "base64"
      );

      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      return transaction;
    } catch (error) {
      console.error("Jupiter swap transaction error:", error);
      throw new Error(
        `Failed to build swap transaction: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get price impact percentage from quote
   */
  getPriceImpact(quote: JupiterQuote): number {
    return quote.priceImpactPct * 100; // Convert to percentage
  }

  /**
   * Calculate minimum output amount after slippage
   */
  getMinimumOutputAmount(quote: JupiterQuote): number {
    return Number(quote.otherAmountThreshold);
  }

  /**
   * Convert slippage percentage to basis points
   * @param slippage - Slippage percentage (e.g., 0.5 for 0.5%)
   */
  slippageToBps(slippage: number): number {
    return Math.floor(slippage * 100);
  }
}

// Export singleton instance
export const jupiter = new JupiterService();
