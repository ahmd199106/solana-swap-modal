import "@testing-library/jest-dom";
import { vi } from "vitest";
import { PublicKey } from "@solana/web3.js";

// Mock environment variables
process.env.NEXT_PUBLIC_TURNKEY_API_BASE_URL = "https://api.turnkey.com";
process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID = "test-org-id";
process.env.NEXT_PUBLIC_HELIUS_API_KEY = "test-helius-key";
process.env.NEXT_PUBLIC_RPC_URL = "https://api.devnet.solana.com";

// Mock Turnkey SDK globally to avoid module resolution issues
vi.mock("@turnkey/http", () => ({
  TurnkeyClient: vi.fn(() => ({
    stampHeaderFn: vi.fn(),
  })),
}));

vi.mock("@turnkey/sdk-browser", () => ({
  Turnkey: vi.fn(() => ({
    passkeyClient: vi.fn(() => ({
      login: vi.fn().mockResolvedValue({
        organizationId: "test-org",
        userId: "test-user",
      }),
    })),
    serverSign: vi.fn(),
  })),
}));

vi.mock("@turnkey/viem", () => ({
  createAccount: vi.fn(),
}));

// Mock @turnkey/core first (the problematic dependency)
vi.mock("@turnkey/core", () => ({
  default: {},
}));

vi.mock("@turnkey/core/dist/__types__/enums", () => ({
  default: {},
}));

vi.mock("@turnkey/react-wallet-kit", () => ({
  useTurnkey: vi.fn(() => ({
    turnkey: {
      passkeyClient: vi.fn(() => ({
        login: vi.fn().mockResolvedValue({
          organizationId: "test-org",
          userId: "test-user",
        }),
      })),
      serverSign: vi.fn(),
    },
    authIframeClient: {
      injectCredentialBundle: vi.fn(),
      injectWalletExportBundle: vi.fn(),
      extractWalletEncryptedBundle: vi.fn(),
    },
    getActiveClient: vi.fn(() => ({
      createWallet: vi.fn().mockResolvedValue({
        walletId: "test-wallet-id",
        addresses: ["test-address"],
      }),
      getWallets: vi.fn().mockResolvedValue({
        wallets: [],
      }),
    })),
  })),
}));

vi.mock("@solana/spl-token", () => ({
  getAssociatedTokenAddress: vi.fn().mockResolvedValue(
    new PublicKey("TokenAccount1111111111111111111111111111111")
  ),
  getAccount: vi.fn().mockResolvedValue({
    amount: BigInt(1000000),
  }),
  TOKEN_PROGRAM_ID: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
}));
