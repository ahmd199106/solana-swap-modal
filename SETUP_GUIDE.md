# Production Setup Guide - Solana Swap Modal

## What We're Building
A production-ready swap modal with **Google OAuth** authentication via Turnkey for secure wallet management.

## Required Setup Steps

### 1. Turnkey Configuration

#### A. Enable Google OAuth in Turnkey Dashboard
**REQUIRED - DO THIS NEXT:**

1. Go to [app.turnkey.com](https://app.turnkey.com)
2. Navigate to **Settings → Authentication → OAuth Providers**
3. Click **"Enable OAuth"** (if not already enabled)
4. Select **Google** as the OAuth provider
5. Enter your Google OAuth credentials from `.env.local`:
   - **Client ID**: (from `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `.env.local`)
   - **Client Secret**: (from `NEXT_PUBLIC_GOOGLE_CLIENT_SECRET` in `.env.local`)
6. Configure allowed redirect URLs:
   - Development: `http://localhost:3000`
   - Production: `https://your-vercel-app.vercel.app` (add when deployed)
7. **Save** the OAuth configuration

#### B. Create Solana Wallet
1. Wallets → Create Wallet
2. Select: **Solana** blockchain
3. Choose: **Devnet** (we'll start with testing, move to mainnet later)
4. **Save the wallet address** - you'll need this!

#### C. Get Organization ID
1. Settings → Organization
2. Copy the **Organization ID** (looks like: `01234567-89ab-cdef-0123-456789abcdef`)

### What I Need From You:
- [ ] Organization ID
- [ ] OAuth Client ID (if Turnkey provides one)
- [ ] Solana wallet address (the one you just created)
- [ ] Network preference (mainnet or devnet)

---

### 2. Helius Configuration

#### A. Create Account & API Key
1. Go to [helius.dev](https://helius.dev)
2. Sign up (free tier works)
3. Dashboard → Create new API key
4. Select network: **Devnet** (we'll start here first)
5. **Copy the API key**

### What I Need From You:
- [ ] Helius API key (devnet)
- [ ] Confirm network: devnet

---

### 3. Environment Variables

Once you provide the above, I'll configure:

```env
# Turnkey (Discord OAuth)
NEXT_PUBLIC_TURNKEY_API_BASE_URL=https://api.turnkey.com
NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID=your-org-id-here

# Helius (Devnet for now)
NEXT_PUBLIC_HELIUS_API_KEY=your-helius-key-here
NEXT_PUBLIC_RPC_URL=https://devnet.helius-rpc.com/?api-key=your-key

# Network (Start with devnet, move to mainnet later)
NEXT_PUBLIC_SOLANA_NETWORK=devnet
```

---

## Questions to Answer

1. **Network**: Starting with **Devnet** (fake SOL for testing)
   - Get free devnet SOL from: https://faucet.solana.com
   - We'll move to mainnet once everything works

2. **Discord OAuth Redirect**: What URL should Discord redirect to after authentication?
   - Development: `http://localhost:3000/auth/callback`
   - Production: `https://your-app.vercel.app/auth/callback`
   - (I'll set this up once you configure Turnkey)

---

## Next Steps - Testing the Complete Flow

### 1. Enable Google OAuth in Turnkey Dashboard
Follow the instructions in **Section 2A** above to configure Google OAuth in your Turnkey dashboard.

### 2. Start the Development Server
```bash
cd solana-swap-modal
npm run dev
```

The app will be available at `http://localhost:3000`

### 3. Test the Google OAuth Flow

**What will happen:**

1. **Click "Open Swap Modal"** button on the home page
2. **Click "Connect Wallet"** button in the modal
3. **You will be redirected** to `https://auth.turnkey.com`
4. **Sign in with Google** - use your Google account
5. **You will be redirected back** to `http://localhost:3000`
6. **Click "Connect Wallet" again** - this time it will work because you have a session
7. **Your wallet address will appear** in the modal
8. **Test a swap:**
   - Select SOL → USDC
   - Enter an amount
   - Click "Swap"
   - Confirm the transaction

### 4. Troubleshooting

**If the redirect doesn't work:**
- Make sure you added `http://localhost:3000` to the allowed redirect URLs in Turnkey dashboard
- Check the browser console for errors
- Verify your Google OAuth credentials are correctly configured in Turnkey

**If you see "No Solana wallet found":**
- Go to Turnkey dashboard → Wallets → Create Wallet
- Select Solana blockchain
- Use Devnet for testing
- The wallet address should be: `3aCtFEQNeMcEcZRGEd8WTqQsAn2n436hbFD8z3YwrpTH`

**If swap fails:**
- Make sure you have SOL in your Turnkey wallet on Devnet
- Get free devnet SOL from: https://faucet.solana.com
- Paste your wallet address: `3aCtFEQNeMcEcZRGEd8WTqQsAn2n436hbFD8z3YwrpTH`

### 5. Deploy to Vercel (When Ready)

Once local testing works:
```bash
npm run build  # Verify production build works
vercel deploy  # Deploy to Vercel
```

Update the Turnkey redirect URL to include your Vercel deployment URL:
- `https://your-app-name.vercel.app`

---

## Current Status: Ready for Testing! 🚀

✅ TypeScript compilation passes
✅ Production build succeeds
✅ Google OAuth credentials configured
✅ Turnkey wallet service implemented
✅ Helius RPC configured (Devnet)
✅ Jupiter swap integration ready
✅ Jito bundle support ready

**Next: Configure Google OAuth in Turnkey dashboard and test the flow!**
