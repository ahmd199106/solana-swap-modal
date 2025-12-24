"use client";

import React, { useCallback, useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useWallet } from "@/hooks/useWallet";
import { useSwap } from "@/hooks/useSwap";
import { useSwapStore } from "@/stores/swap.store";
import { Token, PriorityFeeLevel } from "@/types";
import { formatNumber } from "@/lib/utils";
import { ArrowsUpDownIcon, ChevronDownIcon, CheckIcon } from "@heroicons/react/24/outline";
import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";
import * as Select from "@radix-ui/react-select";
import toast from "react-hot-toast";

interface SwapModalProps {
  open: boolean;
  onClose: () => void;
}

// Popular tokens (in production, fetch from Jupiter token list)
const POPULAR_TOKENS: Token[] = [
  {
    address: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
  },
  {
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
];

const PRIORITY_FEE_OPTIONS: { value: PriorityFeeLevel; label: string; description: string }[] = [
  { value: "Low", label: "Low", description: "~1-5k microlamports" },
  { value: "Medium", label: "Medium", description: "~10-50k microlamports (Recommended)" },
  { value: "High", label: "High", description: "~50-100k microlamports" },
  { value: "Turbo", label: "Turbo", description: "~100k+ microlamports" },
];

export function SwapModal({ open, onClose }: SwapModalProps) {
  const { connected, address, balance, usdcBalance, connect } = useWallet();
  const { inputAmount, outputAmount, status, quote, error, executeSwap } =
    useSwap();
  const {
    inputToken,
    outputToken,
    settings,
    setInputToken,
    setOutputToken,
    setInputAmount,
    setSlippage,
    setPriorityFee,
    setJitoBribe,
    setEnableJito,
    swapTokens
  } = useSwapStore();

  // Initialize tokens on mount and update SOL balance
  useEffect(() => {
    if (!inputToken) {
      setInputToken({ ...POPULAR_TOKENS[0], balance }); // SOL with balance
    } else if (inputToken.symbol === "SOL" && inputToken.balance !== balance) {
      // Update SOL balance when it changes
      setInputToken({ ...inputToken, balance });
    }

    if (!outputToken) {
      setOutputToken(POPULAR_TOKENS[1]); // USDC
    }
  }, [inputToken, outputToken, setInputToken, setOutputToken, balance]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // Allow only numbers and one decimal point
      if (value === "" || /^\d*\.?\d*$/.test(value)) {
        setInputAmount(value);
      }
    },
    [setInputAmount]
  );

  const handleSwap = useCallback(async () => {
    if (!connected) {
      await connect();
      return;
    }

    if (!inputToken || !outputToken || !inputAmount || !quote) {
      return;
    }

    executeSwap();
  }, [connected, connect, inputToken, outputToken, inputAmount, quote, executeSwap]);

  if (!open) return null;

  const isLoading =
    status === "fetching-quote" ||
    status === "building-transaction" ||
    status === "signing" ||
    status === "submitting" ||
    status === "confirming";

  const canSwap = connected && inputToken && outputToken && inputAmount && quote && !isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Swap</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Wallet Connection */}
        {connected ? (
          <div className="mb-4 space-y-2">
            <div className="p-3 bg-gray-100 rounded-lg space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">Wallet Address</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-700 truncate max-w-[180px]">
                    {address || "..."}
                  </span>
                  <button
                    onClick={() => {
                      if (address) {
                        navigator.clipboard.writeText(address);
                        toast.success("Address copied!", { duration: 2000 });
                      }
                    }}
                    className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                    title="Copy address"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="text-sm font-medium text-gray-700">Balances:</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">SOL</span>
                <span className="text-sm font-semibold">
                  {balance !== undefined ? formatNumber(balance, 4) : "..."}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">USDC</span>
                <span className="text-sm font-semibold">
                  {usdcBalance !== undefined ? formatNumber(usdcBalance, 2) : "..."}
                </span>
              </div>
            </div>
            {/* Low balance warning */}
            {balance !== undefined && balance < 0.01 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-700">
                  ⚠️ Low SOL balance. Please fund your wallet for swaps to work. You need SOL for transaction fees and token account creation.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              Connect your wallet to start trading
            </p>
          </div>
        )}

        {/* Input Token */}
        <div className="mb-2">
          <div className="bg-gray-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">You pay</span>
              {inputToken && inputToken.balance !== undefined && (
                <button
                  onClick={() => setInputAmount(inputToken.balance!.toString())}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Max: {formatNumber(inputToken.balance, 4)}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  // In production, open token selector
                  setInputToken(POPULAR_TOKENS[0]);
                }}
                className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold">
                  {inputToken?.symbol || "Select"}
                </span>
                <span className="text-gray-400">▼</span>
              </button>
              <Input
                type="text"
                placeholder="0.0"
                value={inputAmount}
                onChange={handleInputChange}
                className="flex-1 text-right text-2xl font-semibold border-none bg-transparent focus:ring-0"
                disabled={!connected || !inputToken}
              />
            </div>
          </div>
        </div>

        {/* Swap Direction Button */}
        <div className="flex justify-center -my-2 z-10 relative">
          <button
            onClick={swapTokens}
            className="p-2 bg-white border-4 border-white rounded-xl hover:bg-gray-50 transition-colors shadow-md"
            disabled={!inputToken || !outputToken}
          >
            <ArrowsUpDownIcon className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Output Token */}
        <div className="mb-4">
          <div className="bg-gray-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">You receive</span>
              {status === "fetching-quote" && (
                <span className="text-xs text-gray-500">Fetching quote...</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  // In production, open token selector
                  setOutputToken(POPULAR_TOKENS[1]);
                }}
                className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold">
                  {outputToken?.symbol || "Select"}
                </span>
                <span className="text-gray-400">▼</span>
              </button>
              <div className="flex-1 text-right text-2xl font-semibold text-gray-700">
                {outputAmount || "0.0"}
              </div>
            </div>
          </div>
        </div>

        {/* Quote Info */}
        {quote && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">Price Impact</span>
              <span className={quote.priceImpactPct > 0.01 ? "text-red-600" : "text-green-600"}>
                {formatNumber(quote.priceImpactPct * 100, 2)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Minimum Received</span>
              <span>{formatNumber(Number(quote.otherAmountThreshold) / Math.pow(10, outputToken?.decimals || 9), 4)}</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700 break-words whitespace-pre-wrap">
              {error.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
                if (part.match(/^https?:\/\//)) {
                  return (
                    <a
                      key={i}
                      href={part}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      {part}
                    </a>
                  );
                }
                return <span key={i}>{part}</span>;
              })}
            </p>
          </div>
        )}

        {/* Settings */}
        <div className="mb-4 space-y-4 p-4 bg-gray-50 rounded-xl">
          {/* Slippage Tolerance */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Slippage Tolerance
              </label>
              <span className="text-sm font-semibold text-blue-600">
                {settings.slippage.toFixed(2)}%
              </span>
            </div>

            {/* Slider */}
            <Slider.Root
              className="relative flex items-center select-none touch-none w-full h-5"
              value={[settings.slippage]}
              onValueChange={(value) => setSlippage(value[0])}
              min={0.1}
              max={5}
              step={0.1}
            >
              <Slider.Track className="bg-gray-200 relative grow rounded-full h-2">
                <Slider.Range className="absolute bg-blue-600 rounded-full h-full" />
              </Slider.Track>
              <Slider.Thumb
                className="block w-5 h-5 bg-white border-2 border-blue-600 rounded-full hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Slippage"
              />
            </Slider.Root>

            {/* Preset buttons */}
            <div className="flex gap-2 mt-2">
              {[0.5, 1, 2].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setSlippage(preset)}
                  className={`flex-1 py-1.5 px-3 text-sm font-medium rounded-lg transition-colors ${
                    settings.slippage === preset
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {preset}%
                </button>
              ))}
            </div>
          </div>

          {/* Priority Fee */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">
              Priority Fee
            </label>

            <Select.Root
              value={settings.priorityFee}
              onValueChange={(value) => setPriorityFee(value as PriorityFeeLevel)}
            >
              <Select.Trigger className="inline-flex items-center justify-between w-full px-4 py-3 bg-white rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <Select.Value />
                <Select.Icon>
                  <ChevronDownIcon className="w-4 h-4" />
                </Select.Icon>
              </Select.Trigger>

              <Select.Portal>
                <Select.Content
                  className="overflow-hidden bg-white rounded-lg shadow-lg border border-gray-200 z-50"
                  position="popper"
                  sideOffset={5}
                >
                  <Select.Viewport className="p-1">
                    {PRIORITY_FEE_OPTIONS.map((option) => (
                      <Select.Item
                        key={option.value}
                        value={option.value}
                        className="relative flex items-center px-3 py-2.5 text-sm rounded-md outline-none cursor-pointer hover:bg-gray-100 data-[highlighted]:bg-gray-100"
                      >
                        <Select.ItemText>
                          <div>
                            <div className="font-medium">{option.label}</div>
                            <div className="text-xs text-gray-500">{option.description}</div>
                          </div>
                        </Select.ItemText>
                        <Select.ItemIndicator className="absolute right-3">
                          <CheckIcon className="w-4 h-4 text-blue-600" />
                        </Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>

          {/* Jito Settings */}
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block">
                  Enable Jito Bundles
                </label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Faster inclusion and MEV protection
                </p>
              </div>

              <Switch.Root
                checked={settings.enableJito}
                onCheckedChange={setEnableJito}
                className={`w-11 h-6 rounded-full relative transition-colors ${
                  settings.enableJito ? "bg-blue-600" : "bg-gray-300"
                }`}
              >
                <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[22px]" />
              </Switch.Root>
            </div>

            {/* Jito Bribe (only show when enabled) */}
            {settings.enableJito && (
              <div className="mt-3 pl-4 border-l-2 border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    Jito Bribe
                  </label>
                  <span className="text-sm font-semibold text-blue-600">
                    {settings.jitoBribe.toFixed(4)} SOL
                  </span>
                </div>

                {/* Slider */}
                <Slider.Root
                  className="relative flex items-center select-none touch-none w-full h-5"
                  value={[settings.jitoBribe * 10000]} // Scale to 1-10 range
                  onValueChange={(value) => setJitoBribe(value[0] / 10000)}
                  min={1}
                  max={10}
                  step={0.5}
                >
                  <Slider.Track className="bg-gray-200 relative grow rounded-full h-2">
                    <Slider.Range className="absolute bg-blue-600 rounded-full h-full" />
                  </Slider.Track>
                  <Slider.Thumb
                    className="block w-5 h-5 bg-white border-2 border-blue-600 rounded-full hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="Jito Bribe"
                  />
                </Slider.Root>

                <p className="text-xs text-gray-500 mt-2">
                  Tip sent to Jito validators for faster block inclusion
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Swap Button */}
        <Button
          onClick={handleSwap}
          disabled={connected && !canSwap}
          loading={isLoading}
          className="w-full"
          size="lg"
        >
          {!connected
            ? "Connect Wallet"
            : isLoading
              ? status === "fetching-quote"
                ? "Fetching Quote..."
                : status === "building-transaction"
                  ? "Building Transaction..."
                  : status === "signing"
                    ? "Signing..."
                    : status === "submitting"
                      ? "Submitting..."
                      : "Confirming..."
              : !inputToken || !outputToken
                ? "Select Tokens"
                : !inputAmount
                  ? "Enter Amount"
                  : !quote
                    ? "Fetching Quote..."
                    : "Swap"}
        </Button>

        {/* Status */}
        {status === "success" && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-700 text-center">
              Swap completed successfully! 🎉
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
