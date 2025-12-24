import { vi } from "vitest";

// Mock Turnkey SDK to avoid module resolution issues
export const mockTurnkeyClient = {
  stampHeaderFn: vi.fn(),
};

export const mockTurnkeyPasskeyClient = {
  login: vi.fn().mockResolvedValue({
    organizationId: "test-org",
    userId: "test-user",
  }),
};

export const mockTurnkey = {
  passkeyClient: vi.fn(() => mockTurnkeyPasskeyClient),
  serverSign: vi.fn(),
};

export const mockAuthIframeClient = {
  injectCredentialBundle: vi.fn(),
  injectWalletExportBundle: vi.fn(),
  extractWalletEncryptedBundle: vi.fn(),
};

export const mockHttpClient = {
  createWallet: vi.fn().mockResolvedValue({
    walletId: "test-wallet-id",
    addresses: ["test-address"],
  }),
  getWallets: vi.fn().mockResolvedValue({
    wallets: [],
  }),
};

// Export for @turnkey/http
export const TurnkeyClient = vi.fn(() => mockTurnkeyClient);

// Export for @turnkey/sdk-browser
export const Turnkey = vi.fn(() => mockTurnkey);

// Export for @turnkey/viem
export const createAccount = vi.fn();

// Export for @turnkey/react-wallet-kit
export const useTurnkey = vi.fn(() => ({
  turnkey: mockTurnkey,
  authIframeClient: mockAuthIframeClient,
  getActiveClient: vi.fn(() => mockHttpClient),
}));

// Export for @turnkey/core (empty to prevent import errors)
export default {};
