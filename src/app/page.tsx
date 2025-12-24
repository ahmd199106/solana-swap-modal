"use client";

import { useState } from "react";
import { SwapModal } from "@/components/modals/SwapModal";

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold text-center mb-8">
          Solana Swap Modal
        </h1>
        <p className="text-center mb-8 text-gray-600">
          Lightning-fast token swaps powered by Jupiter, Turnkey, and Helius
        </p>

        <div className="flex justify-center">
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors"
          >
            Open Swap Modal
          </button>
        </div>

        <SwapModal open={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </div>
    </main>
  );
}
