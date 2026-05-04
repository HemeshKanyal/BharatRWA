---
title: BharatRWA
emoji: 🛡️
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
---

# BharatRWA Backend

Institutional-grade Real World Asset (RWA) tokenization backend with Noir ZK proof generation.

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

### Market Data
- `GET /api/assets`: List all registered RWAs with 24h stats.
- `GET /api/market/:assetId`: Detailed market data, candles, and order books for a specific asset.
- `POST /api/assets/:assetId/metadata`: Update asset imagery.

### Trading
- `POST /buy`: Executes a buy order (mints tokens to user).
- `POST /sell`: Executes a sell order (transfers tokens from user, sends ETH).

### ZK-KYC
- `POST /generate-proof`: Generates a ZK-proof for a wallet address based on age and status.

## 🐳 Docker Setup

The backend is fully dockerized to include the necessary dependencies for ZK-proof generation (Noir and Barretenberg backends).

```bash
docker build -t bharat-rwa-backend .
docker run -p 3008:3008 bharat-rwa-backend
```

## 🔐 Environment Variables

- `PRIVATE_KEY`: The wallet private key for the system deployer/custodian.
- `SEPOLIA_RPC_URL`: Ethereum Sepolia RPC endpoint.
- `PORT`: Port to run the server on (default 3008).
