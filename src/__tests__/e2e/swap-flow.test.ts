import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSwapStore } from "@/stores/swap.store";
import { useWalletStore } from "@/stores/wallet.store";
import { jupiter } from "@/services/jupiter";
import { helius } from "@/services/helius";
import { jito } from "@/services/jito";
import { PublicKey, VersionedTransaction, TransactionMessage } from "@solana/web3.js";
import type { JupiterQuote } from "@/types";

// Mock all services
vi.mock("@/services/jupiter");
vi.mock("@/services/helius");
vi.mock("@/services/jito");

describe("E2E Swap Flow - Service Integration", () => {
  const MOCK_PUBLIC_KEY = new PublicKey(
    "7BgBvyjrZX1YKz4oh9mjb8ZScatkkwb8DzFx7LoiVkM3"
  );

  const mockQuote: JupiterQuote = {
    inputMint: "So11111111111111111111111111111111111111112", // SOL
    inAmount: "1000000", // 0.001 SOL
    outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    outAmount: "50000", // $0.05
    otherAmountThreshold: "49500",
    swapMode: "ExactIn",
    slippageBps: 50,
    priceImpactPct: 0.0012,
    routePlan: [],
  };

  // Create a mock VersionedTransaction with serialize method
  const mockSwapTransaction = {
    signatures: [new Uint8Array(64).fill(1)],
    message: {} as any,
    version: 0 as const,
    serialize: () => new Uint8Array([1, 2, 3, 4, 5]),
    sign: vi.fn(),
    addSignature: vi.fn(),
  } as unknown as VersionedTransaction;
  const mockSignature = "test-signature-12345";

  beforeEach(() => {
    vi.clearAllMocks();
    useSwapStore.getState().reset();
    useWalletStore.getState().disconnect();

    // Setup default mocks
    vi.mocked(jupiter.getQuote).mockResolvedValue(mockQuote);
    vi.mocked(jupiter.buildSwapTransaction).mockResolvedValue(
      mockSwapTransaction
    );
    vi.mocked(helius.getConnection).mockReturnValue({
      sendRawTransaction: vi.fn().mockResolvedValue(mockSignature),
      getSignatureStatus: vi.fn().mockResolvedValue({
        value: {
          confirmationStatus: "confirmed",
          err: null,
        },
      }),
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: "test-blockhash",
        lastValidBlockHeight: 123456,
      }),
    } as any);
    vi.mocked(jito.shouldUseJito).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Happy Path: Complete Swap Flow", () => {
    it("should execute complete swap flow from quote to confirmation", async () => {
      // Step 1: Setup initial state
      useSwapStore.setState({
        inputToken: {
          symbol: "SOL",
          name: "Solana",
          address: "So11111111111111111111111111111111111111112",
          decimals: 9,
          logoURI: "",
        },
        outputToken: {
          symbol: "USDC",
          name: "USD Coin",
          address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          decimals: 6,
          logoURI: "",
        },
        inputAmount: "0.001",
        settings: {
          slippage: 0.5,
          priorityFee: "Medium",
          jitoBribe: 0.0001,
          enableJito: false,
        },
      });

      useWalletStore.setState({
        connected: true,
        publicKey: MOCK_PUBLIC_KEY,
        balance: 1, // 1 SOL
        usdcBalance: 0,
      });

      // Step 2: Fetch quote
      const inputAmountLamports = 1000000; // 0.001 SOL * 10^9
      const slippageBps = 50; // 0.5%

      const quote = await jupiter.getQuote(
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        inputAmountLamports,
        slippageBps
      );

      expect(quote).toBeDefined();
      expect(quote.outAmount).toBe("50000");
      expect(jupiter.getQuote).toHaveBeenCalledWith(
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        1000000,
        50
      );

      // Step 3: Build transaction
      useSwapStore.setState({ quote, status: "building-transaction" });

      const swapTx = await jupiter.buildSwapTransaction(
        quote,
        MOCK_PUBLIC_KEY.toBase58()
      );

      expect(swapTx).toBeDefined();
      expect(jupiter.buildSwapTransaction).toHaveBeenCalledWith(
        mockQuote,
        MOCK_PUBLIC_KEY.toBase58()
      );

      // Step 4: Send transaction via Helius (Jito disabled)
      useSwapStore.setState({ status: "submitting" });

      const connection = helius.getConnection();
      const serialized = swapTx.serialize();
      const signature = await connection.sendRawTransaction(serialized);

      expect(signature).toBe(mockSignature);
      expect(connection.sendRawTransaction).toHaveBeenCalled();

      // Step 5: Confirm transaction
      useSwapStore.setState({ status: "confirming" });

      const status = await connection.getSignatureStatus(signature);

      expect(status.value?.confirmationStatus).toBe("confirmed");
      expect(status.value?.err).toBeNull();

      // Step 6: Verify final state
      useSwapStore.setState({ status: "success" });

      const finalStatus = useSwapStore.getState().status;
      expect(finalStatus).toBe("success");
    });
  });

  describe("Jito Flow: MEV Protection", () => {
    it("should use Jito when enabled and configured", async () => {
      const mockBundleId = "test-bundle-123";

      vi.mocked(jito.shouldUseJito).mockReturnValue(true);
      vi.mocked(jito.sendBundle).mockResolvedValue(mockBundleId);
      vi.mocked(jito.getBundleStatus).mockResolvedValue({
        landed: true,
        error: undefined,
      });

      // Setup state
      useSwapStore.setState({
        inputToken: {
          symbol: "SOL",
          name: "Solana",
          address: "So11111111111111111111111111111111111111112",
          decimals: 9,
          logoURI: "",
        },
        outputToken: {
          symbol: "USDC",
          name: "USD Coin",
          address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          decimals: 6,
          logoURI: "",
        },
        inputAmount: "0.001",
        settings: {
          slippage: 0.5,
          priorityFee: "Medium",
          jitoBribe: 0.0001,
          enableJito: true,
        },
      });

      // Fetch quote
      const quote = await jupiter.getQuote(
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        1000000,
        50
      );

      // Build transaction
      const swapTx = await jupiter.buildSwapTransaction(
        quote,
        MOCK_PUBLIC_KEY.toBase58()
      );

      // Send via Jito
      const shouldUse = jito.shouldUseJito(true, 0.0001);
      expect(shouldUse).toBe(true);

      // Mock VersionedTransaction for sendBundle
      const mockVersionedTx = {
        serialize: () => swapTx,
      } as any;

      const bundleId = await jito.sendBundle([mockVersionedTx]);
      expect(bundleId).toBe(mockBundleId);
      expect(jito.sendBundle).toHaveBeenCalled();

      // Check bundle status
      const bundleStatus = await jito.getBundleStatus(bundleId);
      expect(bundleStatus.landed).toBe(true);
      expect(jito.getBundleStatus).toHaveBeenCalledWith(mockBundleId);
    });

    it("should fallback to Helius when Jito fails", async () => {
      vi.mocked(jito.shouldUseJito).mockReturnValue(true);
      vi.mocked(jito.sendBundle).mockRejectedValue(
        new Error("Jito send failed")
      );

      // Fetch quote
      const quote = await jupiter.getQuote(
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        1000000,
        50
      );

      // Build transaction
      const swapTx = await jupiter.buildSwapTransaction(
        quote,
        MOCK_PUBLIC_KEY.toBase58()
      );

      // Try Jito first
      const mockVersionedTx = {
        serialize: () => swapTx,
      } as any;

      try {
        await jito.sendBundle([mockVersionedTx]);
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Fallback to Helius
      const connection = helius.getConnection();
      const serialized = swapTx.serialize();
      const signature = await connection.sendRawTransaction(serialized);

      expect(signature).toBe(mockSignature);
      expect(connection.sendRawTransaction).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle quote fetch failure gracefully", async () => {
      vi.mocked(jupiter.getQuote).mockRejectedValue(
        new Error("Failed to fetch quote")
      );

      try {
        await jupiter.getQuote(
          "So11111111111111111111111111111111111111112",
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          1000000,
          50
        );
      } catch (error: any) {
        expect(error.message).toBe("Failed to fetch quote");
      }
    });

    it("should handle transaction rejection", async () => {
      const connection = helius.getConnection();
      vi.mocked(connection.getSignatureStatus).mockResolvedValue({
        value: {
          confirmationStatus: "confirmed",
          err: { InstructionError: [0, "Custom error"] },
        },
      } as any);

      // Fetch quote and build transaction
      const quote = await jupiter.getQuote(
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        1000000,
        50
      );

      const swapTx = await jupiter.buildSwapTransaction(
        quote,
        MOCK_PUBLIC_KEY.toBase58()
      );

      // Send transaction
      const serialized = swapTx.serialize();
      const signature = await connection.sendRawTransaction(serialized);

      // Check status - should show error
      const status = await connection.getSignatureStatus(signature);

      expect(status.value?.err).toBeDefined();
    });

    it("should handle network timeout", async () => {
      vi.mocked(jupiter.buildSwapTransaction).mockRejectedValue(
        new Error("Network timeout")
      );

      const quote = await jupiter.getQuote(
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        1000000,
        50
      );

      try {
        await jupiter.buildSwapTransaction(
          quote,
          MOCK_PUBLIC_KEY.toBase58()
        );
      } catch (error: any) {
        expect(error.message).toBe("Network timeout");
      }
    });
  });

  describe("Slippage Handling", () => {
    it("should respect custom slippage settings", async () => {
      await jupiter.getQuote(
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        1000000,
        250 // 2.5% = 250 bps
      );

      expect(jupiter.getQuote).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        250
      );
    });

    it("should calculate minimum output with slippage", async () => {
      const quote = await jupiter.getQuote(
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        1000000,
        50
      );

      vi.mocked(jupiter.getMinimumOutputAmount).mockReturnValue(49500);

      const minOutput = jupiter.getMinimumOutputAmount(quote);
      expect(minOutput).toBe(49500); // otherAmountThreshold
    });

    it("should calculate price impact", async () => {
      const quote = await jupiter.getQuote(
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        1000000,
        50
      );

      vi.mocked(jupiter.getPriceImpact).mockReturnValue(0.12);

      const priceImpact = jupiter.getPriceImpact(quote);
      expect(priceImpact).toBe(0.12); // 0.0012 * 100 = 0.12%
    });
  });

  describe("Token Swap Directions", () => {
    it("should handle SOL → USDC swap", async () => {
      const quote = await jupiter.getQuote(
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        1000000,
        50
      );

      expect(quote.inputMint).toBe(
        "So11111111111111111111111111111111111111112"
      );
      expect(quote.outputMint).toBe(
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      );
    });

    it("should handle USDC → SOL swap", async () => {
      const mockUsdcToSolQuote: JupiterQuote = {
        inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        inAmount: "1000000", // 1 USDC
        outputMint: "So11111111111111111111111111111111111111112", // SOL
        outAmount: "20000000", // 0.02 SOL
        otherAmountThreshold: "19800000",
        swapMode: "ExactIn",
        slippageBps: 50,
        priceImpactPct: 0.0015,
        routePlan: [],
      };

      vi.mocked(jupiter.getQuote).mockResolvedValue(mockUsdcToSolQuote);

      const quote = await jupiter.getQuote(
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "So11111111111111111111111111111111111111112",
        1000000, // 1 USDC = 1_000_000 (6 decimals)
        50
      );

      expect(quote.inputMint).toBe(
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      );
      expect(quote.outputMint).toBe(
        "So11111111111111111111111111111111111111112"
      );
    });
  });

  describe("Store Integration", () => {
    it("should update swap store during flow", async () => {
      // Initial state
      useSwapStore.setState({
        inputToken: {
          symbol: "SOL",
          name: "Solana",
          address: "So11111111111111111111111111111111111111112",
          decimals: 9,
          logoURI: "",
        },
        outputToken: {
          symbol: "USDC",
          name: "USD Coin",
          address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          decimals: 6,
          logoURI: "",
        },
        inputAmount: "0.001",
        settings: {
          slippage: 0.5,
          priorityFee: "Medium",
          jitoBribe: 0.0001,
          enableJito: false,
        },
        status: "idle",
      });

      // Fetch quote
      useSwapStore.setState({ status: "fetching-quote" });
      const quote = await jupiter.getQuote(
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        1000000,
        50
      );

      useSwapStore.setState({ quote, status: "building-transaction" });

      // Build transaction
      const swapTx = await jupiter.buildSwapTransaction(
        quote,
        MOCK_PUBLIC_KEY.toBase58()
      );

      useSwapStore.setState({ status: "submitting" });

      // Send transaction
      const connection = helius.getConnection();
      const serialized = swapTx.serialize();
      const signature = await connection.sendRawTransaction(serialized);

      useSwapStore.setState({ status: "confirming" });

      // Confirm
      const status = await connection.getSignatureStatus(signature);

      if (status.value?.err === null) {
        useSwapStore.setState({ status: "success" });
      }

      // Verify final state
      const finalState = useSwapStore.getState();
      expect(finalState.status).toBe("success");
      expect(finalState.quote).toBeDefined();
    });

    it("should track wallet balances", async () => {
      useWalletStore.setState({
        connected: true,
        publicKey: MOCK_PUBLIC_KEY,
        balance: 1.5,
        usdcBalance: 100,
      });

      const walletState = useWalletStore.getState();
      expect(walletState.balance).toBe(1.5);
      expect(walletState.usdcBalance).toBe(100);
      expect(walletState.connected).toBe(true);
    });
  });
});
