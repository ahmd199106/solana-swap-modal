import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { helius } from "../index";

// Mock axios
vi.mock("axios");
const mockedAxios = vi.mocked(axios);

// Mock Solana Connection
vi.mock("@solana/web3.js", async () => {
  const actual = await vi.importActual("@solana/web3.js");
  return {
    ...actual,
    Connection: vi.fn().mockImplementation(() => ({
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: "test-blockhash",
        lastValidBlockHeight: 123456,
      }),
      sendRawTransaction: vi.fn().mockResolvedValue("test-signature"),
      confirmTransaction: vi.fn().mockResolvedValue({
        value: { err: null },
      }),
      getSignatureStatus: vi.fn().mockResolvedValue({
        value: {
          confirmationStatus: "confirmed",
          err: null,
        },
      }),
      simulateTransaction: vi.fn().mockResolvedValue({
        value: {
          err: null,
          logs: [],
          unitsConsumed: 150000,
        },
      }),
    })),
  };
});

describe("HeliusService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getConnection", () => {
    it("should return a Connection object", () => {
      const connection = helius.getConnection();
      expect(connection).toBeDefined();
      expect(connection).toHaveProperty("getLatestBlockhash");
      expect(connection).toHaveProperty("sendRawTransaction");
    });

    it("should reuse the same connection instance", () => {
      const connection1 = helius.getConnection();
      const connection2 = helius.getConnection();
      expect(connection1).toBe(connection2);
    });
  });

  describe("getPriorityFees", () => {
    it("should fetch priority fees successfully", async () => {
      const mockResponse = {
        data: {
          result: [
            { slot: 1, prioritizationFee: 1000 },
            { slot: 2, prioritizationFee: 5000 },
            { slot: 3, prioritizationFee: 10000 },
            { slot: 4, prioritizationFee: 50000 },
            { slot: 5, prioritizationFee: 100000 },
          ],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const fees = await helius.getPriorityFees(["test-account"]);

      expect(fees).toHaveProperty("min");
      expect(fees).toHaveProperty("low");
      expect(fees).toHaveProperty("medium");
      expect(fees).toHaveProperty("high");
      expect(fees).toHaveProperty("veryHigh");
      expect(fees).toHaveProperty("unsafeMax");

      expect(fees.min).toBe(1000);
      expect(fees.unsafeMax).toBe(100000);
      expect(fees.medium).toBeGreaterThanOrEqual(fees.low);
      expect(fees.high).toBeGreaterThanOrEqual(fees.medium);
    });

    it("should return fallback fees when API returns empty result", async () => {
      const mockResponse = {
        data: {
          result: [],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const fees = await helius.getPriorityFees();

      expect(fees).toEqual({
        min: 0,
        low: 1_000,
        medium: 10_000,
        high: 50_000,
        veryHigh: 100_000,
        unsafeMax: 1_000_000,
      });
    });

    it("should return fallback fees on API error", async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error("Network error"));

      const fees = await helius.getPriorityFees();

      expect(fees).toEqual({
        min: 0,
        low: 1_000,
        medium: 10_000,
        high: 50_000,
        veryHigh: 100_000,
        unsafeMax: 1_000_000,
      });
    });

    it("should handle RPC errors", async () => {
      const mockResponse = {
        data: {
          error: {
            code: -32600,
            message: "Invalid request",
          },
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const fees = await helius.getPriorityFees();

      expect(fees).toEqual({
        min: 0,
        low: 1_000,
        medium: 10_000,
        high: 50_000,
        veryHigh: 100_000,
        unsafeMax: 1_000_000,
      });
    });

    it("should filter out invalid fee values", async () => {
      const mockResponse = {
        data: {
          result: [
            { slot: 1, prioritizationFee: 1000 },
            { slot: 2, prioritizationFee: NaN },
            { slot: 3, prioritizationFee: Infinity },
            { slot: 4, prioritizationFee: 5000 },
          ],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const fees = await helius.getPriorityFees();

      expect(fees.min).toBe(1000);
      expect(fees.unsafeMax).toBe(5000);
    });
  });

  describe("getPriorityFeeForLevel", () => {
    beforeEach(() => {
      const mockResponse = {
        data: {
          result: [
            { slot: 1, prioritizationFee: 1000 },
            { slot: 2, prioritizationFee: 5000 },
            { slot: 3, prioritizationFee: 10000 },
            { slot: 4, prioritizationFee: 50000 },
            { slot: 5, prioritizationFee: 100000 },
          ],
        },
      };

      mockedAxios.post.mockResolvedValue(mockResponse);
    });

    it("should return low priority fee", async () => {
      const fee = await helius.getPriorityFeeForLevel("Low");
      expect(fee).toBeGreaterThan(0);
    });

    it("should return medium priority fee", async () => {
      const fee = await helius.getPriorityFeeForLevel("Medium");
      expect(fee).toBeGreaterThan(0);
    });

    it("should return high priority fee", async () => {
      const fee = await helius.getPriorityFeeForLevel("High");
      expect(fee).toBeGreaterThan(0);
    });

    it("should return turbo priority fee", async () => {
      const fee = await helius.getPriorityFeeForLevel("Turbo");
      expect(fee).toBeGreaterThan(0);
    });

    it("should return medium fee for unknown level", async () => {
      const fee = await helius.getPriorityFeeForLevel("Unknown" as any);
      expect(fee).toBeGreaterThan(0);
    });
  });

  describe("getTransactionStatus", () => {
    it("should return confirmed status for confirmed transaction", async () => {
      const mockConnection = helius.getConnection();
      vi.mocked(mockConnection.getSignatureStatus).mockResolvedValueOnce({
        context: { slot: 123 },
        value: {
          confirmationStatus: "confirmed",
          err: null,
          slot: 123,
          confirmations: null,
        },
      });

      const status = await helius.getTransactionStatus("test-signature");

      expect(status.confirmed).toBe(true);
      expect(status.error).toBeUndefined();
    });

    it("should return confirmed status for finalized transaction", async () => {
      const mockConnection = helius.getConnection();
      vi.mocked(mockConnection.getSignatureStatus).mockResolvedValueOnce({
        context: { slot: 123 },
        value: {
          confirmationStatus: "finalized",
          err: null,
          slot: 123,
          confirmations: null,
        },
      });

      const status = await helius.getTransactionStatus("test-signature");

      expect(status.confirmed).toBe(true);
    });

    it("should return not confirmed for pending transaction", async () => {
      const mockConnection = helius.getConnection();
      vi.mocked(mockConnection.getSignatureStatus).mockResolvedValueOnce({
        context: { slot: 123 },
        value: null,
      });

      const status = await helius.getTransactionStatus("test-signature");

      expect(status.confirmed).toBe(false);
    });

    it("should return error for failed transaction", async () => {
      const mockConnection = helius.getConnection();
      vi.mocked(mockConnection.getSignatureStatus).mockResolvedValueOnce({
        context: { slot: 123 },
        value: {
          confirmationStatus: "confirmed",
          err: { InstructionError: [0, "Custom error"] },
          slot: 123,
          confirmations: null,
        },
      });

      const status = await helius.getTransactionStatus("test-signature");

      expect(status.confirmed).toBe(false);
      expect(status.error).toBeDefined();
    });

    it("should handle getSignatureStatus errors", async () => {
      const mockConnection = helius.getConnection();
      vi.mocked(mockConnection.getSignatureStatus).mockRejectedValueOnce(
        new Error("RPC error")
      );

      const status = await helius.getTransactionStatus("test-signature");

      expect(status.confirmed).toBe(false);
      expect(status.error).toBe("RPC error");
    });
  });

  describe("getRecentBlockhash", () => {
    it("should return blockhash and lastValidBlockHeight", async () => {
      const mockConnection = helius.getConnection();
      vi.mocked(mockConnection.getLatestBlockhash).mockResolvedValueOnce({
        blockhash: "test-blockhash",
        lastValidBlockHeight: 123456,
      });

      const result = await helius.getRecentBlockhash();

      expect(result).toHaveProperty("blockhash");
      expect(result).toHaveProperty("lastValidBlockHeight");
      expect(result.blockhash).toBe("test-blockhash");
      expect(result.lastValidBlockHeight).toBe(123456);
    });
  });

  describe("simulateTransaction", () => {
    it("should return compute units for successful simulation", async () => {
      const mockConnection = helius.getConnection();
      vi.mocked(mockConnection.simulateTransaction).mockResolvedValueOnce({
        context: { slot: 123 },
        value: {
          err: null,
          logs: ["Program log: Success"],
          unitsConsumed: 150000,
          accounts: null,
          returnData: null,
        },
      });

      // Create a mock VersionedTransaction
      const mockTx = {} as VersionedTransaction;

      const units = await helius.simulateTransaction(mockTx);

      expect(units).toBe(150000);
    });

    it("should return default units on simulation failure", async () => {
      const mockConnection = helius.getConnection();
      vi.mocked(mockConnection.simulateTransaction).mockResolvedValueOnce({
        context: { slot: 123 },
        value: {
          err: { InstructionError: [0, "Simulation failed"] },
          logs: ["Program log: Error"],
          unitsConsumed: null,
          accounts: null,
          returnData: null,
        },
      });

      const mockTx = {} as VersionedTransaction;

      const units = await helius.simulateTransaction(mockTx);

      expect(units).toBe(200000);
    });

    it("should return default units when simulation throws", async () => {
      const mockConnection = helius.getConnection();
      vi.mocked(mockConnection.simulateTransaction).mockRejectedValueOnce(
        new Error("Network error")
      );

      const mockTx = {} as VersionedTransaction;

      const units = await helius.simulateTransaction(mockTx);

      expect(units).toBe(200000);
    });
  });
});
