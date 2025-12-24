"use client";

import { useEffect } from "react";
import { useTurnkey } from "@turnkey/react-wallet-kit";
import { ClientState } from "@turnkey/react-wallet-kit";
import { useWallet } from "@/hooks/useWallet";
import toast from "react-hot-toast";

/**
 * Parse URL hash fragment to extract OAuth parameters
 */
function parseOAuthHash(
  hashOrSearch: string
): { oidcToken: string; publicKey: string; providerName?: string } | null {
  try {
    // Remove leading # or ? and parse as URLSearchParams
    const cleanString = hashOrSearch.startsWith("#")
      ? hashOrSearch.substring(1)
      : hashOrSearch.startsWith("?")
        ? hashOrSearch.substring(1)
        : hashOrSearch;

    console.log("Parsing OAuth params from:", cleanString);
    const params = new URLSearchParams(cleanString);

    const idToken = params.get("id_token");
    const code = params.get("code");
    const state = params.get("state");

    console.log("OAuth params found:", {
      hasIdToken: !!idToken,
      hasCode: !!code,
      hasState: !!state,
      stateValue: state?.substring(0, 50) + "...",
    });

    // If we have code instead of id_token, Turnkey might handle it differently
    // For now, we need id_token for completeOauth
    if (!idToken && !code) {
      console.warn("No id_token or code found in OAuth callback");
      return null;
    }

    if (!state) {
      console.warn("No state parameter found");
      return null;
    }

    // Parse the state parameter to extract publicKey and provider
    const stateParams = new URLSearchParams(state);
    const publicKey = stateParams.get("publicKey");
    const provider = stateParams.get("provider");

    console.log("State params:", { publicKey: !!publicKey, provider });

    if (!publicKey) {
      console.error("No publicKey found in state parameter", { state });
      return null;
    }

    // If we have code but not id_token, we might need to handle it differently
    // For now, return null if we don't have id_token
    if (!idToken) {
      console.warn(
        "Have code but no id_token - Turnkey might handle this automatically"
      );
      return null;
    }

    return {
      oidcToken: idToken,
      publicKey: publicKey,
      providerName: provider || "google",
    };
  } catch (error) {
    console.error("Failed to parse OAuth hash:", error);
    return null;
  }
}

/**
 * Component that handles OAuth callback when redirected back from Google
 * This component checks for OAuth tokens in the URL hash on mount
 */
export function OAuthCallback() {
  const { completeOauth, clientState } = useTurnkey();
  const { connectWalletAfterAuth } = useWallet();

  useEffect(() => {
    // Debug: Log current state
    console.log("OAuthCallback effect running", {
      clientState,
      hash: window.location.hash,
      search: window.location.search,
      fullUrl: window.location.href,
    });

    // Wait for client to be initialized before processing OAuth callback
    if (clientState !== ClientState.Ready) {
      console.log("Client not ready yet, waiting...", clientState);
      return;
    }

    // Check if there's an OAuth callback in the URL hash
    const hash = window.location.hash;
    const search = window.location.search;

    // Check both hash and search params (Turnkey might use either)
    const hasOAuthParams =
      (hash && (hash.includes("id_token=") || hash.includes("code="))) ||
      (search && (search.includes("id_token=") || search.includes("code=")));

    if (hasOAuthParams) {
      console.log("OAuth callback detected!", { hash, search });
      toast.loading("Completing authentication...", { id: "oauth-callback" });

      // Try parsing from hash first, then search params
      const hashToParse = hash || search;
      const params = parseOAuthHash(hashToParse);

      if (!params) {
        console.error("Failed to parse OAuth parameters", {
          hash,
          search,
          hashToParse,
        });
        toast.error("Authentication failed - invalid parameters", {
          id: "oauth-callback",
        });
        return;
      }

      console.log("OAuth parameters parsed:", {
        oidcToken: params.oidcToken?.substring(0, 20) + "...",
        publicKey: params.publicKey,
        providerName: params.providerName,
      });

      // Complete the OAuth flow with proper parameters
      if (!completeOauth) {
        console.error("completeOauth function not available");
        toast.error("Authentication failed - client not ready", {
          id: "oauth-callback",
        });
        return;
      }

      completeOauth(params)
        .then(async () => {
          console.log("OAuth completed successfully");

          // Automatically connect wallet after OAuth success
          try {
            await connectWalletAfterAuth();
            toast.success("Authentication successful!", {
              id: "oauth-callback",
            });
          } catch (error) {
            console.error("Failed to connect wallet after OAuth:", error);
            toast.error(
              "Authentication successful but wallet connection failed",
              {
                id: "oauth-callback",
              }
            );
          }

          // Clear the hash from URL
          window.history.replaceState(null, "", window.location.pathname);
        })
        .catch((error) => {
          console.error("OAuth completion error:", error);
          toast.error("Authentication failed", { id: "oauth-callback" });
        });
    }
  }, [completeOauth, clientState, connectWalletAfterAuth]);

  return null; // This component doesn't render anything
}
