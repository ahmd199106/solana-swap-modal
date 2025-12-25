"use client";

import { useCallback, useEffect } from "react";
import { useTurnkey } from "@turnkey/react-wallet-kit";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { useWalletStore } from "@/stores/wallet.store";
import { helius } from "@/services/helius";
import toast from "react-hot-toast";

// USDC Mint Address (mainnet)
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

/**
 * Custom hook for wallet connection and management using Turnkey Google OAuth
 */
export function useWallet() {
  const {
    connected,
    publicKey,
    address,
    balance,
    usdcBalance,
    setConnected,
    setPublicKey,
    setBalance,
    setUsdcBalance,
    disconnect: disconnectStore,
  } = useWalletStore();

  // Get Turnkey wallet kit methods
  const { handleGoogleOauth, user, refreshWallets, httpClient } = useTurnkey();

  /**
   * Create a new Solana wallet for the authenticated user
   */
  const createSolanaWallet = useCallback(async () => {
    if (!user) {
      throw new Error("User not authenticated");
    }

    if (!httpClient) {
      throw new Error("Turnkey client not ready");
    }

    console.log("🔧 [DEBUG] Creating new Solana wallet for user...");
    console.log("🔧 [DEBUG] User details:", user);
    toast.loading("Creating your wallet...", { id: "wallet-create" });

    try {
      // Generate a unique wallet name
      const walletName = `Solana Wallet ${Date.now()}`;

      // Get organization ID from authenticated session using getWhoami()
      console.log("🔍 [DEBUG] Calling getWhoami() to get organization ID...");

      const whoami = await httpClient.getWhoami();
      console.log("🔍 [DEBUG] getWhoami() response:", whoami);

      const organizationId = whoami?.organizationId;

      if (!organizationId) {
        console.error("❌ [ERROR] Could not get organization ID from getWhoami():", whoami);
        throw new Error("Organization ID not found in session");
      }

      console.log("🔧 [DEBUG] Using organization ID from getWhoami():", organizationId);

      // Create wallet with Solana account using Turnkey API
      const result = await httpClient.createWallet({
        timestampMs: String(Date.now()),
        organizationId: organizationId,
        walletName,
        accounts: [
          {
            curve: "CURVE_ED25519",
            pathFormat: "PATH_FORMAT_BIP32",
            path: "m/44'/501'/0'/0'", // Solana derivation path
            addressFormat: "ADDRESS_FORMAT_SOLANA",
          },
        ],
      });

      console.log("✅ [DEBUG] Wallet created successfully:", result);
      toast.success("Wallet created!", { id: "wallet-create" });

      return result;
    } catch (error) {
      console.error("❌ [ERROR] Failed to create wallet:", error);
      toast.error("Failed to create wallet", { id: "wallet-create" });
      throw error;
    }
  }, [user, httpClient]);

  /**
   * Connect wallet after OAuth is complete
   * This is called automatically after OAuth callback or manually when user clicks connect
   */
  const connectWalletAfterAuth = useCallback(async () => {
    try {
      toast.loading("Fetching wallet...", { id: "wallet-connect" });

      // Debug: Log authenticated user
      console.log("🔍 [DEBUG] Turnkey authenticated user:", user);
      console.log("🔍 [DEBUG] User details:", JSON.stringify(user, null, 2));

      // Refresh wallets to get latest state
      let wallets = await refreshWallets();

      // Debug: Log wallets returned
      console.log(
        "🔍 [DEBUG] Wallets returned from refreshWallets():",
        wallets
      );
      console.log("🔍 [DEBUG] Number of wallets:", wallets?.length || 0);
      if (wallets && wallets.length > 0) {
        console.log(
          "🔍 [DEBUG] First wallet details:",
          JSON.stringify(wallets[0], null, 2)
        );
      }

      // Auto-create wallet if none exists
      if (!wallets || wallets.length === 0) {
        console.log(
          "⚠️ [WARN] No wallets found - auto-creating Solana wallet..."
        );
        toast.loading("Creating your first wallet...", {
          id: "wallet-connect",
        });

        // Create a new Solana wallet
        await createSolanaWallet();

        // Refresh wallets to get the newly created wallet
        wallets = await refreshWallets();

        console.log("🔍 [DEBUG] Wallets after creation:", wallets);

        if (!wallets || wallets.length === 0) {
          throw new Error("Failed to create wallet. Please try again.");
        }
      }

      // Find Solana wallet - wallets have 'accounts' array
      const solanaWallet = wallets.find((w: any) =>
        w.accounts?.some(
          (acc: any) => acc.addressFormat === "ADDRESS_FORMAT_SOLANA"
        )
      );

      // Debug: Log Solana wallet search result
      console.log(
        "🔍 [DEBUG] Solana wallet found:",
        solanaWallet ? "YES" : "NO"
      );
      if (solanaWallet) {
        console.log(
          "🔍 [DEBUG] Solana wallet details:",
          JSON.stringify(solanaWallet, null, 2)
        );
      }

      if (!solanaWallet) {
        throw new Error(
          "No Solana wallet found. Please create a Solana wallet in your Turnkey dashboard."
        );
      }

      // Get Solana account
      const solanaAccount = (solanaWallet as any).accounts?.find(
        (acc: any) => acc.addressFormat === "ADDRESS_FORMAT_SOLANA"
      );

      // Debug: Log Solana account
      console.log("🔍 [DEBUG] Solana account:", solanaAccount);
      console.log(
        "🔍 [DEBUG] Solana address:",
        solanaAccount?.address || "No address"
      );

      if (!solanaAccount?.address) {
        throw new Error("Solana address not found in wallet.");
      }

      const pk = new PublicKey(solanaAccount.address);
      setPublicKey(pk);
      setConnected(true);

      // Fetch balances (SOL and USDC)
      const connection = helius.getConnection();
      const solBal = await connection.getBalance(pk);
      setBalance(solBal / 1e9); // Convert lamports to SOL

      // Fetch USDC balance
      try {
        const usdcTokenAccount = await getAssociatedTokenAddress(USDC_MINT, pk);
        const accountInfo = await getAccount(connection, usdcTokenAccount);
        const usdcBal = Number(accountInfo.amount) / 1e6; // USDC has 6 decimals
        setUsdcBalance(usdcBal);
      } catch (error) {
        console.log("No USDC token account or error fetching USDC balance");
        setUsdcBalance(0);
      }

      toast.success("Wallet connected!", { id: "wallet-connect" });
      return pk;
    } catch (error) {
      console.error("Wallet setup error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to set up wallet",
        { id: "wallet-connect" }
      );
      throw error;
    }
  }, [
    user,
    createSolanaWallet,
    refreshWallets,
    setConnected,
    setPublicKey,
    setBalance,
    setUsdcBalance,
  ]);

  /**
   * Connect wallet using Google OAuth via Turnkey
   */
  const connect = useCallback(async () => {
    try {
      console.log("🔍 [DEBUG] Starting Google OAuth flow...");
      console.log(
        "🔍 [DEBUG] Client ID:",
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
      );
      console.log("🔍 [DEBUG] Current user before OAuth:", user);

      toast.loading("Connecting with Google...", { id: "wallet-connect" });

      // Initiate Google OAuth flow
      await handleGoogleOauth({
        clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        onOauthSuccess: async () => {
          console.log("🔍 [DEBUG] OAuth success callback triggered!");
          console.log("🔍 [DEBUG] User after OAuth success:", user);

          // After OAuth success, connect the wallet
          await connectWalletAfterAuth();
        },
        openInPage: true, // Redirect in current page
      });

      console.log("🔍 [DEBUG] handleGoogleOauth completed");
    } catch (error) {
      console.error("❌ [ERROR] Google OAuth error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to connect with Google",
        { id: "wallet-connect" }
      );
      throw error;
    }
  }, [handleGoogleOauth, connectWalletAfterAuth, user]);

  /**
   * Disconnect wallet
   */
  const disconnect = useCallback(() => {
    disconnectStore();
    toast.success("Wallet disconnected");
  }, [disconnectStore]);

  /**
   * Refresh balance (SOL and USDC)
   */
  const refreshBalance = useCallback(async () => {
    if (!connected || !publicKey) {
      return;
    }

    try {
      const connection = helius.getConnection();

      // Fetch SOL balance
      const solBal = await connection.getBalance(publicKey);
      setBalance(solBal / 1e9);

      // Fetch USDC balance
      try {
        const usdcTokenAccount = await getAssociatedTokenAddress(
          USDC_MINT,
          publicKey
        );
        const accountInfo = await getAccount(connection, usdcTokenAccount);
        const usdcBal = Number(accountInfo.amount) / 1e6; // USDC has 6 decimals
        setUsdcBalance(usdcBal);
      } catch (error) {
        // Token account doesn't exist or other error - set balance to 0
        console.log("No USDC token account or error fetching USDC balance");
        setUsdcBalance(0);
      }
    } catch (error) {
      console.error("Failed to refresh balance:", error);
    }
  }, [connected, publicKey, setBalance, setUsdcBalance]);

  /**
   * Auto-connect wallet if user is already authenticated
   */
  useEffect(() => {
    console.log("🔍 [DEBUG] Auto-connect effect running", {
      hasUser: !!user,
      connected,
      userDetails: user,
    });

    // If user is authenticated but wallet not connected, connect it
    if (user && !connected) {
      console.log("🔍 [DEBUG] Triggering auto-connect...");
      connectWalletAfterAuth().catch((error) => {
        console.error("❌ [ERROR] Auto-connect failed:", error);
        // Silently fail - user can manually connect
      });
    } else if (!user) {
      console.log("⚠️ [WARN] No user authenticated - cannot auto-connect");
    }
  }, [user, connected, connectWalletAfterAuth]);

  /**
   * Auto-refresh balance on mount and periodically
   */
  useEffect(() => {
    if (connected) {
      refreshBalance();

      // Refresh balance every 30 seconds
      const interval = setInterval(refreshBalance, 30000);

      return () => clearInterval(interval);
    }
  }, [connected, refreshBalance]);

  return {
    connected,
    publicKey,
    address,
    balance,
    usdcBalance,
    connect,
    connectWalletAfterAuth, // Expose for OAuth callback to use
    disconnect,
    refreshBalance,
  };
}
