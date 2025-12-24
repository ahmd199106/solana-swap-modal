import { describe, it, expect, beforeEach, vi } from "vitest";
import axios from "axios";
import { jupiter } from "../index";
import { JupiterQuote } from "@/types";

vi.mock("axios");

describe("Jupiter Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("slippageToBps", () => {
    it("should convert slippage percentage to basis points", () => {
      expect(jupiter.slippageToBps(0.5)).toBe(50);
      expect(jupiter.slippageToBps(1)).toBe(100);
      expect(jupiter.slippageToBps(2.5)).toBe(250);
    });
  });

  describe("getPriceImpact", () => {
    it("should return price impact as percentage", () => {
      const mockQuote: JupiterQuote = {
        inputMint: "So11111111111111111111111111111111111111112",
        inAmount: "1000000000",
        outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        outAmount: "50000000",
        otherAmountThreshold: "49500000",
        swapMode: "ExactIn",
        slippageBps: 50,
        priceImpactPct: 0.0012,
        routePlan: [],
      };

      expect(jupiter.getPriceImpact(mockQuote)).toBe(0.12);
    });
  });

  describe("getMinimumOutputAmount", () => {
    it("should return minimum output after slippage", () => {
      const mockQuote: JupiterQuote = {
        inputMint: "So11111111111111111111111111111111111111112",
        inAmount: "1000000000",
        outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        outAmount: "50000000",
        otherAmountThreshold: "49500000",
        swapMode: "ExactIn",
        slippageBps: 50,
        priceImpactPct: 0.0012,
        routePlan: [],
      };

      expect(jupiter.getMinimumOutputAmount(mockQuote)).toBe(49500000);
    });
  });

  describe("getQuote", () => {
    it("should fetch quote successfully", async () => {
      const mockQuote: JupiterQuote = {
        inputMint: "So11111111111111111111111111111111111111112",
        inAmount: "1000000000",
        outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        outAmount: "50000000",
        otherAmountThreshold: "49500000",
        swapMode: "ExactIn",
        slippageBps: 50,
        priceImpactPct: 0.0012,
        routePlan: [],
      };

      vi.mocked(axios.get).mockResolvedValueOnce({ data: mockQuote });

      const quote = await jupiter.getQuote(
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        1000000000,
        50
      );

      expect(quote).toEqual(mockQuote);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining("/quote"),
        expect.objectContaining({
          params: expect.objectContaining({
            inputMint: "So11111111111111111111111111111111111111112",
            outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            amount: "1000000000", // Jupiter API expects strings
            slippageBps: "50", // Jupiter API expects strings
          }),
        })
      );
    });

    it("should throw error on failed quote fetch", async () => {
      vi.mocked(axios.get).mockRejectedValueOnce(
        new Error("Network error")
      );

      await expect(
        jupiter.getQuote(
          "So11111111111111111111111111111111111111112",
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          1000000000,
          50
        )
      ).rejects.toThrow("Failed to fetch quote");
    });
  });
});
