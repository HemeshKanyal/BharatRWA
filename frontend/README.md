# BharatRWA Frontend

A premium, high-performance dashboard for interacting with the BharatRWA ecosystem. Built with **Next.js** and **Tailwind CSS**.

## ✨ Features

- **Trading Dashboard**: Real-time price charts powered by `lightweight-charts`.
- **KYC Onboarding**: Seamless integration with the ZK-KYC backend to generate and submit identity proofs.
- **Asset Marketplace**: Browse and invest in fractionalized Gold, Silver, and Real Estate.
- **Wallet Integration**: Native support for MetaMask and other EIP-1193 wallets via Ethers.js.
- **Portfolio Tracking**: View your holdings, historical trades, and pending dividends.

## 🛠 Tech Stack

- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS
- **Blockchain**: Ethers.js (v6)
- **Charts**: Lightweight Charts (TradingView)
- **Icons**: Lucide React

## 🚀 Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   Create a `.env.local` file with the following:
   ```env
   NEXT_PUBLIC_BACKEND_URL=http://localhost:3008
   NEXT_PUBLIC_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```

## 📁 Structure

- `/src/app`: Page routes and layouts.
- `/src/components`: Reusable UI components (Modals, Charts, Asset Cards).
- `/src/context`: React Context for Wallet and Market state.
- `/src/hooks`: Custom hooks for contract interactions.
- `/src/lib`: Utility functions and constants.
