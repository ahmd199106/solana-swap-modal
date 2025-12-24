import { create } from "zustand";
import { PublicKey } from "@solana/web3.js";
import { WalletState } from "@/types";

interface WalletStore extends WalletState {
  usdcBalance: number | undefined;
  setConnected: (connected: boolean) => void;
  setPublicKey: (publicKey: PublicKey | undefined) => void;
  setBalance: (balance: number | undefined) => void;
  setUsdcBalance: (balance: number | undefined) => void;
  disconnect: () => void;
}

export const useWalletStore = create<WalletStore>((set) => ({
  connected: false,
  publicKey: undefined,
  address: undefined,
  balance: undefined,
  usdcBalance: undefined,

  setConnected: (connected) => set({ connected }),

  setPublicKey: (publicKey) =>
    set({
      publicKey,
      address: publicKey?.toBase58(),
    }),

  setBalance: (balance) => set({ balance }),

  setUsdcBalance: (usdcBalance) => set({ usdcBalance }),

  disconnect: () =>
    set({
      connected: false,
      publicKey: undefined,
      address: undefined,
      balance: undefined,
      usdcBalance: undefined,
    }),
}));
