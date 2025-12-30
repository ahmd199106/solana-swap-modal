"use client";

import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useTransfer } from "@/hooks/useTransfer";
import toast from "react-hot-toast";

interface TransferModalProps {
  open: boolean;
  onClose: () => void;
}

export function TransferModal({ open, onClose }: TransferModalProps) {
  const { connected, address, balance, usdcBalance, connect } = useWallet();
  const { executeTransfer, status } = useTransfer();

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<"SOL" | "USDC">("SOL");

  const handleTransfer = async () => {
    if (!recipient || !amount) {
      toast.error("Please fill in all fields");
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("Invalid amount");
      return;
    }

    // Check sufficient balance
    const currentBalance = token === "SOL" ? balance : usdcBalance;
    if (!currentBalance || amountNum > currentBalance) {
      toast.error(`Insufficient ${token} balance`);
      return;
    }

    try {
      await executeTransfer(recipient, amountNum, token);
      // Clear form on success
      setRecipient("");
      setAmount("");
      toast.success("Transfer successful!");
    } catch (error) {
      console.error("Transfer failed:", error);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Transfer</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {!connected ? (
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">
              Connect your wallet to transfer tokens
            </p>
            <button
              onClick={connect}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors"
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Wallet Info */}
            <div className="bg-gray-100 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-2">Wallet Address</p>
              <p className="text-xs font-mono break-all">{address}</p>
              <div className="mt-3 space-y-1">
                <p className="text-sm">
                  <span className="text-gray-600">SOL:</span>{" "}
                  <span className="font-semibold">{balance?.toFixed(4)}</span>
                </p>
                <p className="text-sm">
                  <span className="text-gray-600">USDC:</span>{" "}
                  <span className="font-semibold">{usdcBalance?.toFixed(2)}</span>
                </p>
              </div>
            </div>

            {/* Token Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Token
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setToken("SOL")}
                  className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
                    token === "SOL"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  SOL
                </button>
                <button
                  onClick={() => setToken("USDC")}
                  className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
                    token === "USDC"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  USDC
                </button>
              </div>
            </div>

            {/* Recipient Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recipient Address
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Enter Solana address"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.000001"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => {
                    const maxBalance = token === "SOL"
                      ? (balance || 0) - 0.001 // Leave some for fees
                      : usdcBalance || 0;
                    setAmount(maxBalance.toString());
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-blue-600 hover:text-blue-700 font-semibold"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Transfer Button */}
            <button
              onClick={handleTransfer}
              disabled={status !== "idle"}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-8 rounded-lg transition-colors"
            >
              {status === "idle" && "Transfer"}
              {status === "building-transaction" && "Building..."}
              {status === "signing" && "Signing..."}
              {status === "submitting" && "Submitting..."}
              {status === "confirming" && "Confirming..."}
            </button>

            {/* Warning */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800">
                ⚠️ Double-check the recipient address. Transfers cannot be reversed!
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
