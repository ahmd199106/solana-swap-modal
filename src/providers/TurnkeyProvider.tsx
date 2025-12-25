"use client";

import { TurnkeyProvider as TurnkeyWalletKitProvider } from "@turnkey/react-wallet-kit";
import { ReactNode } from "react";
import toast from "react-hot-toast";

/**
 * Turnkey Provider with Auth Proxy for client-side Google OAuth
 * Wraps app with Turnkey Wallet Kit for authentication
 */
export function TurnkeyProvider({ children }: { children: ReactNode }) {
  const organizationId = process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID;
  const authProxyConfigId = process.env.NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID;

  if (!organizationId) {
    throw new Error(
      "Missing NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID environment variable"
    );
  }

  if (!authProxyConfigId) {
    console.warn(
      "Missing NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID - Enable Auth Proxy in Turnkey dashboard and add the Config ID to .env.local"
    );
  }

  return (
    <TurnkeyWalletKitProvider
      config={{
        organizationId,
        authProxyConfigId: authProxyConfigId || "",
        auth: {
          methods: {
            emailOtpAuthEnabled: false,
            smsOtpAuthEnabled: false,
            passkeyAuthEnabled: false,
            walletAuthEnabled: false,
            googleOauthEnabled: true, // Enable Google OAuth
            appleOauthEnabled: false,
            xOauthEnabled: false,
            discordOauthEnabled: false,
            facebookOauthEnabled: false,
          },
        },
      }}
      // No callbacks - let Turnkey handle OAuth internally
      // Wallet connection will be triggered by useWallet's auto-connect effect
    >
      {children}
    </TurnkeyWalletKitProvider>
  );
}
