"use client";

import { useCallback, useState } from "react";
import { useWallet } from "./useWallet";
import { useTurnkey } from "@turnkey/react-wallet-kit";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { helius } from "@/services/helius";
import toast from "react-hot-toast";

// USDC Mint Address (mainnet)
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

type TransferStatus =
  | "idle"
  | "building-transaction"
  | "signing"
  | "submitting"
  | "confirming"
  | "success"
  | "error";

export function useTransfer() {
  const { publicKey, connected, refreshBalance } = useWallet();
  const { signTransaction, refreshWallets } = useTurnkey();

  const [status, setStatus] = useState<TransferStatus>("idle");
  const [signature, setSignature] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const executeTransfer = useCallback(
    async (recipientAddress: string, amount: number, token: "SOL" | "USDC") => {
      if (!connected || !publicKey) {
        toast.error("Wallet not connected");
        return;
      }

      if (!signTransaction || !refreshWallets) {
        toast.error("Turnkey not ready");
        return;
      }

      setStatus("building-transaction");
      setError(undefined);
      setSignature(undefined);

      try {
        toast.loading("Building transfer...", { id: "transfer-progress" });

        const connection = helius.getConnection();
        const recipientPubkey = new PublicKey(recipientAddress);

        // Get recent blockhash
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");

        const transaction = new Transaction({
          feePayer: publicKey,
          blockhash,
          lastValidBlockHeight,
        });

        if (token === "SOL") {
          // Transfer SOL
          const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: publicKey,
              toPubkey: recipientPubkey,
              lamports,
            })
          );
        } else {
          // Transfer USDC
          const senderTokenAccount = await getAssociatedTokenAddress(
            USDC_MINT,
            publicKey
          );

          const recipientTokenAccount = await getAssociatedTokenAddress(
            USDC_MINT,
            recipientPubkey
          );

          // USDC has 6 decimals
          const usdcAmount = Math.floor(amount * 1e6);

          transaction.add(
            createTransferInstruction(
              senderTokenAccount,
              recipientTokenAccount,
              publicKey,
              usdcAmount,
              [],
              TOKEN_PROGRAM_ID
            )
          );
        }

        console.log(`📦 Transfer transaction built for ${amount} ${token}`);

        // Sign transaction
        setStatus("signing");
        toast.loading("Signing transfer...", { id: "transfer-progress" });

        const wallets = await refreshWallets();
        const solanaAccount = wallets?.find((w: any) =>
          w.accounts?.some(
            (acc: any) => acc.addressFormat === "ADDRESS_FORMAT_SOLANA"
          )
        );

        if (!solanaAccount) {
          throw new Error("Solana wallet not found");
        }

        const solanaWalletAccount = (solanaAccount as any).accounts?.find(
          (acc: any) => acc.addressFormat === "ADDRESS_FORMAT_SOLANA"
        );

        const unsignedTxBytes = transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        });

        const unsignedTxHex = Buffer.from(unsignedTxBytes).toString("hex");

        const signRes = await signTransaction({
          unsignedTransaction: unsignedTxHex,
          transactionType: "TRANSACTION_TYPE_SOLANA",
          walletAccount: solanaWalletAccount,
        });

        let signedTxHex: string | undefined;

        if (typeof signRes === "string") {
          signedTxHex = signRes;
        } else if (
          signRes &&
          typeof signRes === "object" &&
          "signedTransaction" in signRes
        ) {
          signedTxHex = (signRes as any).signedTransaction;
        } else if (
          signRes &&
          typeof signRes === "object" &&
          "signedTransactionHex" in signRes
        ) {
          signedTxHex = (signRes as any).signedTransactionHex;
        }

        if (!signedTxHex) {
          throw new Error("Failed to extract signed transaction");
        }

        const signedTxBytes = Buffer.from(signedTxHex, "hex");
        const signedTx = Transaction.from(signedTxBytes);

        console.log("✍️ Transaction signed");

        // Submit transaction
        setStatus("submitting");
        toast.loading("Submitting transfer...", { id: "transfer-progress" });

        const txSignature = await connection.sendRawTransaction(
          signedTx.serialize(),
          {
            skipPreflight: true,
            maxRetries: 0,
          }
        );

        console.log("🚀 Transfer submitted:", txSignature);
        setSignature(txSignature);

        // Confirm via WebSocket
        setStatus("confirming");
        toast.loading("Confirming transfer...", { id: "transfer-progress" });

        const result = await helius.waitForConfirmationWebSocket(
          txSignature,
          60000
        );

        if (!result.confirmed) {
          throw new Error(
            result.error ||
              `Transfer timeout. Check explorer: https://solscan.io/tx/${txSignature}`
          );
        }

        console.log("✅ Transfer confirmed");

        setStatus("success");
        toast.success(
          `Successfully sent ${amount} ${token} to ${recipientAddress.slice(0, 4)}...${recipientAddress.slice(-4)}`,
          { id: "transfer-progress", duration: 5000 }
        );

        // Refresh balance
        await refreshBalance();
      } catch (err: any) {
        console.error("Transfer failed:", err);
        const errorMsg = err?.message || "Transfer failed";
        setError(errorMsg);
        setStatus("error");
        toast.error(errorMsg, { id: "transfer-progress" });
      }
    },
    [connected, publicKey, signTransaction, refreshWallets, refreshBalance]
  );

  return {
    executeTransfer,
    status,
    signature,
    error,
  };
}
