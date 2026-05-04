# BharatRWA ZK-KYC Circuits

This directory contains the Zero-Knowledge circuits for the BharatRWA platform, built using the **Noir** programming language.

## 🧠 The Circuit: `zk_kyc`

The primary goal of this circuit is to verify identity attributes without revealing the identity itself. It generates an **UltraPlonk** proof that can be verified on-chain.

### What it proves:
1. **Identity Possession**: The user knows the private key/secret associated with a specific wallet hash.
2. **Age Requirement**: The user is older than a specified threshold (e.g., 18+).
3. **Sanction Status**: The user is not on a global sanctions list.
4. **KYC Status**: The user has been previously verified by a trusted off-chain authority.

## 🛠 Development

### Prerequisites
- [Nargo](https://noir-lang.org/docs/getting_started/installation) (Noir's package manager and compiler)
- [Barretenberg](https://github.com/AztecProtocol/barretenberg) (Backend for proof generation)

### Commands

1. **Compile the circuit**
   ```bash
   nargo compile
   ```

2. **Generate a witness**
   Update `Prover.toml` with the input values, then:
   ```bash
   nargo execute witness
   ```

3. **Generate a proof**
   ```bash
   nargo prove p
   ```

4. **Verify the proof locally**
   ```bash
   nargo verify p
   ```

5. **Generate Solidity Verifier**
   This generates the `UltraVerifier.sol` contract used in the `bharat-rwa` directory.
   ```bash
   nargo codegen-verifier
   ```

## 🏗 Integration

The generated proof is sent to the `ComplianceManager.sol` contract on-chain, which uses the `UltraVerifier.sol` to validate the proof. If valid, the user's wallet is whitelisted for RWA trading.
