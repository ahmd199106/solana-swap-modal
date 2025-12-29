"use client";

import { useState } from "react";
import { SwapModal } from "@/components/modals/SwapModal";
import { useWallet } from "@/hooks/useWallet";

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { connected, address, disconnect } = useWallet();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold text-center mb-8">
          Solana Swap Modal
        </h1>
        <p className="text-center mb-8 text-gray-600">
          Lightning-fast token swaps powered by Jupiter, Turnkey, and Helius
        </p>

        {/* Wallet Status */}
        {connected && address && (
          <div className="flex justify-center mb-4">
            <p className="text-sm text-gray-500">
              Connected: {address.slice(0, 4)}...{address.slice(-4)}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-center gap-4">
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors"
          >
            Open Swap Modal
          </button>

          {connected && (
            <button
              onClick={disconnect}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors"
            >
              Logout
            </button>
          )}
        </div>

        <SwapModal open={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </div>
    </main>
  );
}
