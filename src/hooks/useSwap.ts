import { useCallback, useEffect, useRef } from "react";
import { useSwapStore } from "@/stores/swap.store";
import { useWalletStore } from "@/stores/wallet.store";
import { useWallet } from "@/hooks/useWallet";
import { jupiter } from "@/services/jupiter";
import { helius } from "@/services/helius";
import { jito } from "@/services/jito";
import { useTurnkey } from "@turnkey/react-wallet-kit";
import toast from "react-hot-toast";
import { retryWithBackoff, sleep } from "@/lib/utils";
import {
  VersionedTransaction,
  TransactionMessage,
  PublicKey as SolanaPublicKey,
} from "@solana/web3.js";

// ---- helpers (safe in browser) ----

// IMPORTANT: Turnkey's Solana signing path (in your kit version) expects HEX,
// not base64. This is what fixes the "invalid hex string: AQAAAA..." error.
function uint8ToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToUint8(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("Invalid hex length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

function pickSolanaWalletAccount(wallets: any[]): any | null {
  for (const w of wallets ?? []) {
    const acc = w.accounts?.find(
      (a: any) => a.addressFormat === "ADDRESS_FORMAT_SOLANA"
    );
    if (acc) return acc;
  }
  return null;
}

/**
 * Custom hook for swap flow orchestration
 */
export function useSwap() {
  const {
    inputToken,
    outputToken,
    inputAmount,
    outputAmount,
    settings,
    status,
    quote,
    error,
    signature,
    setStatus,
    setQuote,
    setError,
    setSignature,
    setOutputAmount,
    reset,
  } = useSwapStore();

  const { publicKey, connected } = useWalletStore();
  const { refreshBalance } = useWallet();
  const { signTransaction, refreshWallets } = useTurnkey();

  const isFetchingQuote = useRef(false);
  const quoteAbortController = useRef<AbortController | null>(null);

  const fetchQuote = useCallback(async () => {
    if (
      !inputToken ||
      !outputToken ||
      !inputAmount ||
      parseFloat(inputAmount) <= 0
    ) {
      return;
    }

    if (quoteAbortController.current) quoteAbortController.current.abort();
    quoteAbortController.current = new AbortController();
    isFetchingQuote.current = true;

    try {
      setStatus("fetching-quote");
      setError(undefined);

      const amount = Math.floor(
        parseFloat(inputAmount) * Math.pow(10, inputToken.decimals)
      );
      const slippageBps = jupiter.slippageToBps(settings.slippage);

      const quoteData = await retryWithBackoff(
        () =>
          jupiter.getQuote(
            inputToken.address,
            outputToken.address,
            amount,
            slippageBps
          ),
        3,
        500
      );

      setQuote(quoteData);

      const outputAmt =
        Number(quoteData.outAmount) / Math.pow(10, outputToken.decimals);
      setOutputAmount(outputAmt.toString());

      setStatus("idle");
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Quote fetch error:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch quote");
        setStatus("error");
      }
    } finally {
      isFetchingQuote.current = false;
    }
  }, [
    inputToken,
    outputToken,
    inputAmount,
    settings.slippage,
    setStatus,
    setQuote,
    setError,
    setOutputAmount,
  ]);

  const executeSwap = useCallback(async () => {
    if (!connected || !publicKey || !quote || !inputToken || !outputToken) {
      toast.error("Missing requirements for swap");
      return;
    }

    // ⏱️ Performance timing
    const perfStart = performance.now();
    let perfBuildEnd = 0;
    let perfSignEnd = 0;
    let perfSubmitEnd = 0;

    try {
      setStatus("building-transaction");
      toast.loading("Building transaction...", { id: "swap-progress" });

      // priority fee fetch (optional)
      const priorityFeePromise = helius.getPriorityFeeForLevel(
        settings.priorityFee,
        [inputToken.address, outputToken.address]
      );

      // build tx (Jupiter returns a v0 VersionedTransaction)
      const transaction = await jupiter.buildSwapTransaction(
        quote,
        publicKey.toBase58(),
        undefined
      );

      await priorityFeePromise;

      // simulate (optional)
      await helius.simulateTransaction(transaction);

      perfBuildEnd = performance.now();
      console.log(`⏱️  Build phase: ${(perfBuildEnd - perfStart).toFixed(2)}ms`);

      // ---- SIGN ----
      setStatus("signing");
      toast.loading("Signing transaction...", { id: "swap-progress" });

      if (!signTransaction || !refreshWallets) {
        throw new Error("Turnkey not ready yet. Try again in a second.");
      }

      const wallets = await refreshWallets();
      const solanaAccount = pickSolanaWalletAccount(wallets);

      if (!solanaAccount) {
        throw new Error(
          "No Solana wallet account found in Turnkey. Create one in Turnkey dashboard."
        );
      }

      // Turnkey expects HEX unsigned tx + walletAccount (so it can set signWith)
      const unsignedTxHex = uint8ToHex(transaction.serialize());

      const signRes = await signTransaction({
        unsignedTransaction: unsignedTxHex,
        transactionType: "TRANSACTION_TYPE_SOLANA",
        walletAccount: solanaAccount,
      });

      console.log("Turnkey signTransaction response:", signRes);

      // Response shape varies by kit version — extract safely.
      const signResUnknown: unknown = signRes;

      let signedTxHex: string | undefined;

      if (typeof signResUnknown === "string") {
        signedTxHex = signResUnknown;
      } else if (
        signResUnknown &&
        typeof signResUnknown === "object" &&
        "signedTransaction" in signResUnknown &&
        typeof (signResUnknown as any).signedTransaction === "string"
      ) {
        signedTxHex = (signResUnknown as any).signedTransaction;
      } else if (
        signResUnknown &&
        typeof signResUnknown === "object" &&
        "signedTransactionHex" in signResUnknown &&
        typeof (signResUnknown as any).signedTransactionHex === "string"
      ) {
        signedTxHex = (signResUnknown as any).signedTransactionHex;
      }

      if (!signedTxHex) {
        console.error(
          "Unexpected Turnkey signTransaction response:",
          signResUnknown
        );
        throw new Error("Turnkey returned no signed transaction.");
      }

      const signedTx = VersionedTransaction.deserialize(
        hexToUint8(signedTxHex)
      ) as VersionedTransaction;

      perfSignEnd = performance.now();
      console.log(`⏱️  Sign phase: ${(perfSignEnd - perfBuildEnd).toFixed(2)}ms`);

      // ---- SUBMIT ----
      setStatus("submitting");

      // Check if we should use Jito bundles
      const useJito = jito.shouldUseJito(
        settings.enableJito,
        settings.jitoBribe
      );

      console.log("\n========== SWAP EXECUTION START ==========");
      console.log("📊 Settings:", {
        enableJito: settings.enableJito,
        jitoBribe: settings.jitoBribe,
        priorityFee: settings.priorityFee,
        slippage: settings.slippage,
      });
      console.log("🔀 Swap Direction:", `${inputToken?.symbol} → ${outputToken?.symbol}`);
      console.log("💰 Amount:", inputAmount, inputToken?.symbol);
      console.log("🚀 Using Jito?", useJito);
      console.log("⏱️  Start time:", new Date().toISOString());
      console.log("==========================================\n");

      // Track the actual transaction signature for logging
      let actualTxSignature = "";
      // Track whether Jito actually succeeded (not just attempted)
      let actuallyUsedJito = false;

      if (useJito) {
        console.log("🟢 [JITO PATH] Starting Jito bundle flow");
        console.log("💸 Jito bribe amount:", settings.jitoBribe, "SOL");
        // ---- JITO BUNDLE FLOW ----
        toast.loading("Submitting via Jito bundle...", {
          id: "swap-progress",
        });

        console.log(
          `[Jito] Creating tip transaction (${settings.jitoBribe} SOL)...`
        );

        // Create tip transaction
        const { blockhash, lastValidBlockHeight } =
          await helius.getRecentBlockhash();

        const tipInstruction = jito.createTipInstruction(
          publicKey,
          settings.jitoBribe
        );

        const tipMessage = new TransactionMessage({
          payerKey: publicKey,
          recentBlockhash: blockhash,
          instructions: [tipInstruction],
        }).compileToV0Message();

        const tipTx = new VersionedTransaction(tipMessage);

        // Sign tip transaction
        const unsignedTipTxHex = uint8ToHex(tipTx.serialize());

        const tipSignRes = await signTransaction({
          unsignedTransaction: unsignedTipTxHex,
          transactionType: "TRANSACTION_TYPE_SOLANA",
          walletAccount: solanaAccount,
        });

        // Extract signed tip transaction
        let signedTipTxHex: string | undefined;

        if (typeof tipSignRes === "string") {
          signedTipTxHex = tipSignRes;
        } else if (
          tipSignRes &&
          typeof tipSignRes === "object" &&
          "signedTransaction" in tipSignRes &&
          typeof (tipSignRes as any).signedTransaction === "string"
        ) {
          signedTipTxHex = (tipSignRes as any).signedTransaction;
        } else if (
          tipSignRes &&
          typeof tipSignRes === "object" &&
          "signedTransactionHex" in tipSignRes &&
          typeof (tipSignRes as any).signedTransactionHex === "string"
        ) {
          signedTipTxHex = (tipSignRes as any).signedTransactionHex;
        }

        if (!signedTipTxHex) {
          throw new Error("Failed to sign Jito tip transaction");
        }

        const signedTipTx = VersionedTransaction.deserialize(
          hexToUint8(signedTipTxHex)
        );

        console.log("📦 [Jito] Sending bundle (swap + tip)...");

        // Try to send bundle with retry logic
        let bundleId: string | null = null;
        let sendAttempts = 0;
        const maxSendAttempts = 3;
        let jitoSendFailed = false;

        while (sendAttempts < maxSendAttempts && !bundleId) {
          try {
            console.log(`📤 [Jito] Attempt ${sendAttempts + 1}/${maxSendAttempts} - Sending bundle...`);
            bundleId = await jito.sendBundle([signedTx, signedTipTx]);
            actuallyUsedJito = true; // Bundle successfully sent via Jito
            console.log("✅ [Jito] Bundle sent successfully!");
            console.log("🆔 Bundle ID:", bundleId);
          } catch (error: any) {
            sendAttempts++;
            console.warn(
              `[Jito] Bundle send failed (attempt ${sendAttempts}/${maxSendAttempts}):`,
              error.message
            );

            if (sendAttempts >= maxSendAttempts) {
              console.error("❌ [Jito] Max send attempts reached!");
              console.log("🔄 [Fallback] Switching to Helius RPC...");
              toast.loading("Jito unavailable, using Helius...", {
                id: "swap-progress",
              });
              jitoSendFailed = true;
              break;
            }

            await sleep(1000); // Wait 1s between retries
          }
        }

        // If Jito send failed, fall back to standard Helius flow
        if (jitoSendFailed || !bundleId) {
          console.log("🔵 [HELIUS FALLBACK] Jito failed, using Helius RPC");

          // Extract transaction signature
          const bs58 = await import("bs58");
          const txSignature = bs58.default.encode(signedTx.signatures[0]);
          actualTxSignature = txSignature;
          setSignature(txSignature);
          console.log("📝 Transaction signature:", txSignature);

          // Send via Helius (just send, don't wait for confirmation yet)
          setStatus("submitting");
          toast.loading("Submitting transaction...", { id: "swap-progress" });
          console.log("📤 [Helius] Sending transaction via Helius RPC...");

          const connection = helius.getConnection();
          const serialized = signedTx.serialize();
          await connection.sendRawTransaction(serialized, {
            skipPreflight: false,
            maxRetries: 3,
          });

          // Confirm via Helius
          setStatus("confirming");
          toast.loading("Confirming transaction...", { id: "swap-progress" });

          let confirmed = false;
          let attempts = 0;
          const maxAttempts = 60; // 60 seconds timeout

          while (!confirmed && attempts < maxAttempts) {
            const st = await helius.getTransactionStatus(txSignature);
            if (st.confirmed) {
              confirmed = true;
              console.log("[Helius] Transaction confirmed via Helius");
            } else if (st.error) {
              throw new Error(st.error);
            } else {
              await sleep(1000);
              attempts++;
            }
          }

          if (!confirmed) {
            throw new Error(
              `Transaction timeout after ${maxAttempts}s. Check explorer for status: https://solscan.io/tx/${txSignature}`
            );
          }
        } else {
          // Jito send succeeded - proceed with Jito confirmation flow
          console.log("✅ [Jito] Bundle sent! Proceeding to confirmation...");

          // Extract actual transaction signature for fallback confirmation
          const bs58 = await import("bs58");
          const txSignature = bs58.default.encode(signedTx.signatures[0]);
          actualTxSignature = txSignature;
          setSignature(txSignature);
          console.log("📝 Transaction signature:", txSignature);

        // ---- CONFIRM (track bundle status with fallback) ----
        setStatus("confirming");
        toast.loading("Confirming Jito bundle...", { id: "swap-progress" });
        console.log("⏳ [Jito] Starting bundle confirmation (max 3 attempts)...");

        let confirmed = false;
        let jitoAttempts = 0;
        const maxJitoAttempts = 3; // Only try Jito 3 times
        let usedHeliusFallback = false;

        // Try Jito bundle status check (max 3 attempts)
        while (!confirmed && jitoAttempts < maxJitoAttempts) {
          try {
            const status = await jito.getBundleStatus(bundleId);

            if (status.landed) {
              confirmed = true;
              console.log("[Jito] Bundle confirmed via Jito API");
              break;
            } else if (status.error) {
              // Handle 429 rate limiting in returned status
              if (status.error.includes("429")) {
                jitoAttempts++;
                console.warn(
                  `[Jito] Rate limited via status (attempt ${jitoAttempts}/${maxJitoAttempts})`
                );

                if (jitoAttempts >= maxJitoAttempts) {
                  console.warn(
                    "[Jito] Max retries reached, switching to Helius fallback..."
                  );
                  toast.loading("Jito rate limited, using Helius fallback...", {
                    id: "swap-progress",
                  });
                  break;
                }

                await sleep(2000);
              } else {
                // Non-rate-limit error
                throw new Error(`Jito bundle failed: ${status.error}`);
              }
            }
          } catch (error: any) {
            // Handle rate limiting (429) when thrown as exception
            if (
              error.message?.includes("429") ||
              error.code === "ERR_BAD_REQUEST"
            ) {
              console.warn(
                `[Jito] Rate limited (attempt ${jitoAttempts + 1}/${maxJitoAttempts})`
              );
              jitoAttempts++;

              // If we've exhausted Jito retries, break and use fallback
              if (jitoAttempts >= maxJitoAttempts) {
                console.warn(
                  "[Jito] Max retries reached, switching to Helius fallback..."
                );
                toast.loading("Jito rate limited, using Helius fallback...", {
                  id: "swap-progress",
                });
                break;
              }

              await sleep(2000); // Wait 2s between Jito retries
            } else {
              throw error;
            }
          }
        }

        // Fallback: Check transaction confirmation via Helius
        if (!confirmed) {
          usedHeliusFallback = true;
          toast.loading("Confirming transaction via Helius...", {
            id: "swap-progress",
          });

          let heliusAttempts = 0;
          const maxHeliusAttempts = 60; // Increased to 60 seconds for Jito bundles

          while (!confirmed && heliusAttempts < maxHeliusAttempts) {
            const st = await helius.getTransactionStatus(txSignature);

            if (st.confirmed) {
              confirmed = true;
              console.log("[Helius] Transaction confirmed via Helius fallback");
              break;
            } else if (st.error) {
              throw new Error(st.error);
            }

            await sleep(1000); // Check every 1 second via Helius
            heliusAttempts++;
          }

          if (!confirmed) {
            console.warn(
              `[Helius] Timeout after ${maxHeliusAttempts}s. Bundle may still land. Check signature: ${txSignature}`
            );
            throw new Error(
              `Transaction timeout after ${maxHeliusAttempts}s. View on explorer: https://solscan.io/tx/${txSignature}`
            );
          }
        }
        }
      } else {
        // ---- STANDARD HELIUS FLOW (Jito disabled) ----
        console.log("🔵 [HELIUS PATH] Jito disabled, using standard Helius flow");

        // Extract transaction signature
        const bs58 = await import("bs58");
        const txSignature = bs58.default.encode(signedTx.signatures[0]);
        actualTxSignature = txSignature;
        setSignature(txSignature);
        console.log("📝 Transaction signature:", txSignature);

        // Send transaction
        setStatus("submitting");
        toast.loading("Submitting transaction...", { id: "swap-progress" });
        console.log("📤 [Helius] Sending transaction via Helius RPC...");

        const connection = helius.getConnection();
        const serialized = signedTx.serialize();
        await connection.sendRawTransaction(serialized, {
          skipPreflight: false,
          maxRetries: 3,
        });

        // Confirm transaction
        setStatus("confirming");
        toast.loading("Confirming transaction...", { id: "swap-progress" });

        let confirmed = false;
        let attempts = 0;
        const maxAttempts = 60; // 60 seconds timeout

        while (!confirmed && attempts < maxAttempts) {
          const st = await helius.getTransactionStatus(txSignature);
          if (st.confirmed) {
            confirmed = true;
            console.log("[Helius] Transaction confirmed");
          } else if (st.error) {
            throw new Error(st.error);
          } else {
            await sleep(1000);
            attempts++;
          }
        }

        if (!confirmed) {
          throw new Error(
            `Transaction timeout after ${maxAttempts}s. View on explorer: https://solscan.io/tx/${txSignature}`
          );
        }
      }

      setStatus("success");

      const perfEnd = performance.now();
      const totalTime = perfEnd - perfStart;
      const buildTime = perfBuildEnd - perfStart;
      const signTime = perfSignEnd - perfBuildEnd;
      const submitConfirmTime = perfEnd - perfSignEnd;

      console.log("\n========== SWAP SUCCESS ==========");
      console.log("✅ Swap completed successfully!");
      console.log("📊 Method:", actuallyUsedJito ? "Jito Bundle" : "Helius RPC");
      console.log("📝 Final signature:", actualTxSignature);
      console.log("🔗 Solscan:", `https://solscan.io/tx/${actualTxSignature}`);
      console.log("\n⏱️  PERFORMANCE BREAKDOWN:");
      console.log(`   • Build phase:     ${buildTime.toFixed(0)}ms`);
      console.log(`   • Sign phase:      ${signTime.toFixed(0)}ms`);
      console.log(`   • Submit+Confirm:  ${submitConfirmTime.toFixed(0)}ms`);
      console.log(`   • TOTAL TIME:      ${totalTime.toFixed(0)}ms (${(totalTime / 1000).toFixed(2)}s)`);
      console.log("==================================\n");

      toast.success(
        `Swap completed successfully! ${actuallyUsedJito ? "(via Jito)" : ""}`,
        { id: "swap-progress" }
      );

      // Refresh wallet balances to show updated SOL and USDC amounts
      console.log("🔄 Refreshing wallet balances...");
      await refreshBalance();
      console.log("✅ Balances refreshed");

      setTimeout(() => reset(), 3000);
    } catch (err) {
      console.error("\n========== SWAP FAILED ==========");
      console.error("❌ Error:", err);
      console.error("==================================\n");

      const errorMsg = err instanceof Error ? err.message : "Swap failed";

      // Show full error in modal
      setError(errorMsg);
      setStatus("error");

      // Show shortened error in toast (first 100 chars)
      const shortError = errorMsg.length > 100
        ? errorMsg.substring(0, 100) + "..."
        : errorMsg;
      toast.error(shortError, { id: "swap-progress" });
    }
  }, [
    connected,
    publicKey,
    quote,
    inputToken,
    outputToken,
    settings.priorityFee,
    settings.enableJito,
    settings.jitoBribe,
    setStatus,
    setError,
    setSignature,
    reset,
    signTransaction,
    refreshWallets,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        inputToken &&
        outputToken &&
        inputAmount &&
        !isFetchingQuote.current
      ) {
        fetchQuote();
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [inputToken, outputToken, inputAmount, fetchQuote]);

  useEffect(() => {
    return () => {
      if (quoteAbortController.current) quoteAbortController.current.abort();
    };
  }, []);

  return {
    inputToken,
    outputToken,
    inputAmount,
    outputAmount,
    settings,
    status,
    quote,
    error,
    signature,
    fetchQuote,
    executeSwap,
    reset,
  };
}
