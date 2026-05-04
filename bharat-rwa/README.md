# BharatRWA Smart Contracts

The core protocol logic for BharatRWA, built using the **Foundry** framework.

## 📜 Contract Overview

- **`AssetRegistry.sol`**: Manages the lifecycle of Real-World Assets. It stores metadata, custodian information, and links each asset ID to its fractionalized ERC-20 token.
- **`ComplianceManager.sol`**: A role-based access control system that integrates with ZK-KYC. It allows users to be whitelisted for trading only after presenting a valid ZK-proof.
- **`BharatRWAToken.sol`**: A flexible ERC-20 implementation for asset fractionalization. Supports minting by authorized custodians and compliant transfers.
- **`AssetOracle.sol`**: Maintains up-to-date valuations for assets by aggregating off-chain price data.
- **`ZKVerifier.sol` / `UltraVerifier.sol`**: The on-chain proof verification logic generated from Noir circuits.

## 🛠 Setup & Commands

### Build
```bash
forge build
```

### Test
```bash
forge test
```

### Deployment
To deploy the contracts to the Sepolia testnet:
```bash
source .env
forge script script/DeployBharatRWA.s.sol --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY --broadcast --verify
```

## 📐 Inheritance & Architecture

The system follows a modular design pattern where compliance is decoupled from asset management. The `BharatRWAToken` checks with the `ComplianceManager` on every transfer to ensure both sender and receiver are verified.

## 🔗 Deployed Addresses (Sepolia)

- **Registry**: `0x774E3195E3efB0fa403366033881C6ab1fe14B0D`
- **Compliance**: `0x07bfd4e030Cf250597A898E9EF43110365c7dbAC`
- **Oracle**: `0x590AE2361F302B274a7FB7277E1f15A450BBF392`
