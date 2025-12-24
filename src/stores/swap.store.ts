import { create } from "zustand";
import {
  SwapSettings,
  SwapState,
  Token,
  JupiterQuote,
  PriorityFeeLevel,
} from "@/types";

interface SwapStore extends SwapState {
  // Token selection
  inputToken: Token | null;
  outputToken: Token | null;
  inputAmount: string;
  outputAmount: string;

  // Settings
  settings: SwapSettings;

  // Actions
  setInputToken: (token: Token | null) => void;
  setOutputToken: (token: Token | null) => void;
  setInputAmount: (amount: string) => void;
  setOutputAmount: (amount: string) => void;
  swapTokens: () => void;

  // Settings actions
  setSlippage: (slippage: number) => void;
  setPriorityFee: (level: PriorityFeeLevel) => void;
  setJitoBribe: (amount: number) => void;
  setEnableJito: (enabled: boolean) => void;

  // Swap flow actions
  setStatus: (status: SwapState["status"]) => void;
  setQuote: (quote: JupiterQuote | undefined) => void;
  setError: (error: string | undefined) => void;
  setSignature: (signature: string | undefined) => void;
  reset: () => void;
}

const DEFAULT_SETTINGS: SwapSettings = {
  slippage: 0.5, // 0.5%
  priorityFee: "Medium",
  jitoBribe: 0.0001, // 0.0001 SOL
  enableJito: false, // Disabled - Jito never worked properly
};

export const useSwapStore = create<SwapStore>((set) => ({
  // Initial state
  status: "idle",
  error: undefined,
  signature: undefined,
  quote: undefined,

  inputToken: null,
  outputToken: null,
  inputAmount: "",
  outputAmount: "",

  settings: DEFAULT_SETTINGS,

  // Token selection actions
  setInputToken: (token) => set({ inputToken: token }),
  setOutputToken: (token) => set({ outputToken: token }),
  setInputAmount: (amount) => set({ inputAmount: amount }),
  setOutputAmount: (amount) => set({ outputAmount: amount }),

  swapTokens: () =>
    set((state) => ({
      inputToken: state.outputToken,
      outputToken: state.inputToken,
      inputAmount: state.outputAmount,
      outputAmount: state.inputAmount,
    })),

  // Settings actions
  setSlippage: (slippage) =>
    set((state) => ({
      settings: { ...state.settings, slippage },
    })),

  setPriorityFee: (level) =>
    set((state) => ({
      settings: { ...state.settings, priorityFee: level },
    })),

  setJitoBribe: (amount) =>
    set((state) => ({
      settings: { ...state.settings, jitoBribe: amount },
    })),

  setEnableJito: (enabled) =>
    set((state) => ({
      settings: { ...state.settings, enableJito: enabled },
    })),

  // Swap flow actions
  setStatus: (status) => set({ status }),
  setQuote: (quote) => set({ quote }),
  setError: (error) => set({ error }),
  setSignature: (signature) => set({ signature }),

  reset: () =>
    set({
      status: "idle",
      error: undefined,
      signature: undefined,
      quote: undefined,
      inputAmount: "",
      outputAmount: "",
    }),
}));
