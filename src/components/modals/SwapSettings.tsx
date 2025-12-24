"use client";

import React from "react";
import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";
import * as Select from "@radix-ui/react-select";
import { ChevronDownIcon, CheckIcon } from "@heroicons/react/24/outline";
import { useSwapStore } from "@/stores/swap.store";
import { PriorityFeeLevel } from "@/types";

interface SwapSettingsProps {
  onClose: () => void;
}

const PRIORITY_FEE_OPTIONS: { value: PriorityFeeLevel; label: string; description: string }[] = [
  { value: "Low", label: "Low", description: "~1-5k microlamports" },
  { value: "Medium", label: "Medium", description: "~10-50k microlamports (Recommended)" },
  { value: "High", label: "High", description: "~50-100k microlamports" },
  { value: "Turbo", label: "Turbo", description: "~100k+ microlamports" },
];

export function SwapSettings({ onClose }: SwapSettingsProps) {
  const { settings, setSlippage, setPriorityFee, setJitoBribe, setEnableJito } = useSwapStore();

  return (
    <div className="absolute inset-0 bg-white z-10 rounded-2xl p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold">Settings</h3>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Settings Content */}
      <div className="space-y-6">
        {/* Slippage Tolerance */}
        <div>
          <div className="flex items-center justify-between mb-3">
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
          <div className="flex gap-2 mt-3">
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

          <p className="text-xs text-gray-500 mt-2">
            Your transaction will revert if the price changes unfavorably by more than this percentage.
          </p>
        </div>

        {/* Priority Fee */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-3">
            Priority Fee
          </label>

          <Select.Root
            value={settings.priorityFee}
            onValueChange={(value) => setPriorityFee(value as PriorityFeeLevel)}
          >
            <Select.Trigger className="inline-flex items-center justify-between w-full px-4 py-3 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
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

          <p className="text-xs text-gray-500 mt-2">
            Higher priority fees increase the likelihood of transaction inclusion.
          </p>
        </div>

        {/* Jito Settings */}
        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block">
                Enable Jito Bundles
              </label>
              <p className="text-xs text-gray-500 mt-1">
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
            <div className="mt-4 pl-4 border-l-2 border-blue-200">
              <div className="flex items-center justify-between mb-3">
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
                Tip sent to Jito validators for faster block inclusion. Higher tips = faster execution.
              </p>
            </div>
          )}
        </div>

        {/* Reset to Defaults */}
        <div className="pt-4">
          <button
            onClick={() => {
              setSlippage(0.5);
              setPriorityFee("Medium");
              setJitoBribe(0.0001);
              setEnableJito(true);
            }}
            className="w-full py-2.5 px-4 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}
