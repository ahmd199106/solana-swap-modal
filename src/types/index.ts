import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

/**
 * Token information
 */
export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  balance?: number;
}

/**
 * Jupiter quote response
 */
export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: number;
  routePlan: RoutePlan[];
  contextSlot?: number;
  timeTaken?: number;
}

export interface RoutePlan {
  swapInfo: SwapInfo;
  percent: number;
}

export interface SwapInfo {
  ammKey: string;
  label?: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount: string;
  feeMint: string;
}

/**
 * Jupiter swap transaction response
 */
export interface JupiterSwapTransaction {
  swapTransaction: string; // Base64 encoded transaction
  lastValidBlockHeight: number;
}

/**
 * Helius priority fee levels
 */
export type PriorityFeeLevel = "Low" | "Medium" | "High" | "Turbo";

/**
 * Helius priority fee response
 */
export interface HeliusPriorityFee {
  min: number;
  low: number;
  medium: number;
  high: number;
  veryHigh: number;
  unsafeMax: number;
}

/**
 * Swap settings
 */
export interface SwapSettings {
  slippage: number; // Percentage (e.g., 0.5 for 0.5%)
  priorityFee: PriorityFeeLevel;
  jitoBribe: number; // In SOL
  enableJito: boolean;
}

/**
 * Swap state
 */
export type SwapStatus =
  | "idle"
  | "fetching-quote"
  | "building-transaction"
  | "signing"
  | "submitting"
  | "confirming"
  | "success"
  | "error";

export interface SwapState {
  status: SwapStatus;
  error?: string;
  signature?: string;
  quote?: JupiterQuote;
}

/**
 * Wallet connection state
 */
export interface WalletState {
  connected: boolean;
  publicKey?: PublicKey;
  address?: string;
  balance?: number;
}

/**
 * Turnkey signer response
 */
export interface TurnkeySigner {
  sign(transaction: Transaction | VersionedTransaction): Promise<Transaction | VersionedTransaction>;
  publicKey: PublicKey;
}
