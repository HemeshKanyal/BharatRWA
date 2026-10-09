---
title: BharatRWA
emoji: 🛡️
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
---

# BharatRWA Backend

Demo backend for BharatRWA (Sepolia testnet): Noir ZK-KYC proof generation, simulated market data, and settlement of demo trades.

## 🚀 Overview

This backend serves as the core orchestration layer for the BharatRWA ecosystem. It handles:
1. **ZK-KYC Proving**: Interface for generating Zero-Knowledge proofs using Noir.
2. **Market Simulation**: Synthetic data generation for RWA assets including price history and order books.
3. **Price Feeds**: Real-time integration with Binance and CoinGecko for 24/7 assets.
4. **Blockchain Relaying**: Interaction with the Sepolia testnet for minting and transferring RWA tokens.

## 🛠 Tech Stack

- **Framework**: Express.js
- **Blockchain**: Ethers.js (v6)
- **ZK Engine**: Noir (Nargo) & Barretenberg
- **Deployment**: Dockerized for Hugging Face Spaces / Production

## 📡 API Endpoints

### Config
- `GET /api/config`: Exchange (deployer) address, chain id, contract addresses, nargo/bb versions. The frontend reads the deployer from here instead of hardcoding it.

### Market Data (simulated)
- `GET /api/assets`: Registered assets with 24h stats. Candles, volume and order books are synthetic.
- `GET /api/market/:assetId`: Candles, simulated order book and recent trades for one asset.
- `POST /api/assets/:assetId/metadata`: Set an asset's image (`https` URL). Requires `issuedAt` and an EIP-191 `signature` over
  `BharatRWA: set image for asset <id>\nimageUrl: <url>\nissuedAt: <ms>` from an AssetRegistry admin or custodian, at most 10 minutes old.

### Trading (demo settlement on Sepolia)
- `POST /buy` `{ walletAddress, assetId, amount, txHash }`: `txHash` must be a payment from `walletAddress` to the deployer, at most 30 minutes old, worth at least `amount × price` (3% slippage allowed), and not used before. Then the backend mints.
- `POST /sell` `{ walletAddress, assetId, txHash }`: `txHash` must be a token transfer from `walletAddress` to the deployer. The amount comes from the on-chain `Transfer` event, not from the request. Then the backend pays ETH.

Used transaction hashes are stored in `used_txs.json`. The 30-minute limit bounds replay if that file is lost on a restart.

### ZK-KYC
- `POST /generate-proof` `{ walletAddress, age }`: Generates a real UltraHonk proof with `backend/zk_kyc` and returns `{ proof, publicInputs }` (6 inputs, wallet-bound). There is no fake-proof fallback: under-18 returns 400, prover errors return 500. Inputs are self-declared in this demo.

## 🧪 Tests

```bash
npm test     # trade verification unit tests (node:test)
```

## 🐳 Docker Setup

The backend is fully dockerized to include the necessary dependencies for ZK-proof generation (Noir and Barretenberg backends).

```bash
docker build -t bharat-rwa-backend .
docker run -p 3008:3008 -e PRIVATE_KEY=... -e SEPOLIA_RPC_URL=... bharat-rwa-backend
```

## 🔐 Environment Variables

- `PRIVATE_KEY`: The wallet private key for the system deployer/custodian.
- `SEPOLIA_RPC_URL`: Ethereum Sepolia RPC endpoint.
- `PORT`: Port to run the server on (default 3008).

`PRIVATE_KEY` and `SEPOLIA_RPC_URL` are **required** — the server and scripts exit on start-up if either is missing (there are no hardcoded fallbacks). Locally, put them in `backend/.env` (gitignored) and run `node --env-file=.env server.js`. On Hugging Face, add them as Space secrets.
