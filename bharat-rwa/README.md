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

## ERC-7943 (uRWA) token — `BharatRWATokenV2`

New contracts added alongside the originals (nothing existing was changed or redeployed):

| File | Purpose |
|---|---|
| `src/interfaces/IERC7943.sol` | `IERC7943Fungible`, copied verbatim from the Final spec. ERC-165 id `0x3edbb4c4`. |
| `src/BharatRWATokenV2.sol` | ERC-20 + ERC-7943 token. Keeps ERC20Votes (timestamp clock), Permit and cap from V1, so `DividendDistributor` still works. |
| `src/ComplianceManagerV2.sol` | Compliance registry with wallet-bound ZK proofs, expiry and jurisdiction. Same `IComplianceManager` interface as V1. |
| `src/zk/WalletBoundHonkVerifier.sol` | UltraHonk verifier generated from `backend/zk_kyc` (`make zk-verifier-wallet-bound`). |
| `script/DeployTokenV2.s.sol` | Deploys the token, plus optionally ComplianceManagerV2. Sepolia/Anvil only. |

### How ERC-7943 maps onto the existing compliance layer

The token has no allowlist of its own. Eligibility comes from whichever
`IComplianceManager` it points at: the existing V1 `ComplianceManager` or
`ComplianceManagerV2`.

| ERC-7943 | BharatRWATokenV2 |
|---|---|
| `canSend(a)` / `canReceive(a)` | `isApproved(a) && !isBlacklisted(a)`. Never reverts; a failing compliance call reads as `false`. |
| `canTransfer(from, to, amount)` | Not paused, `amount` within the unfrozen balance, `canSend(from)`, `canReceive(to)`. An amount above the whole balance is left to ERC-20, as the spec requires. |
| `getFrozenTokens` / `setFrozenTokens` | Per-account frozen amount (`FREEZER_ROLE`). Can exceed the balance. Enforced on `transfer`, `transferFrom` and `burn`. |
| `forcedTransfer` | `ENFORCEMENT_ROLE`. Single-party: bypasses sender eligibility, frozen amounts and pause, but requires `canReceive(to)`. Unfreezes only the shortfall, emitting `Frozen` → `Transfer` → `ForcedTransfer`. |
| `canTransact` | Not in the Final spec (replaced by `canSend`/`canReceive`), so not implemented. |
| Mint | `canReceive(to)` enforced. |

Roles: `DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`, `PAUSER_ROLE`, `FREEZER_ROLE`,
`ENFORCEMENT_ROLE`. All are granted to the deployer at construction.

### Known weaknesses of the V1 ZK-KYC flow (why ComplianceManagerV2 exists)

1. **Proofs aren't bound to the caller.** `ComplianceManager.verifyAndApprove`
   builds its nullifier as `keccak256(publicInputs[0], msg.sender)` and never
   checks whose wallet the proof is for. Any wallet can submit anyone's proof
   and be approved.
2. **The live Sepolia verifier accepts garbage.** The verifier behind the
   Sepolia ComplianceManager (`0x1Fd6…e313`) returns `true` for
   `verify(0xaaaaaaaa, [])`; it was deployed with the mock (the `DeployAll`
   default). As deployed, anyone can be approved.
3. **There are two different circuits.** `zk_kyc/` uses `pedersen_hash(wallet)`;
   `backend/zk_kyc/` (the one the backend proves with) uses the raw wallet.
   `src/UltraVerifier.sol` comes from an older compile, and the root README
   doesn't say which circuit it matches.
4. **The backend fakes proofs.** It falls back to a fake proof (`"0x" + "a"*512`)
   when proving fails, and returns only `[wallet]` as public inputs.
5. **Inputs are self-declared.** Age, KYC and sanction status are typed in by
   the user and not signed by any KYC provider, so the proof shows only that
   the user claimed them.

ComplianceManagerV2 fixes 1–3 for new deployments:
- Public input 0 and the wallet output must equal `msg.sender`.
- It uses the circuit's own nullifier and checks the age, KYC and sanction flags.
- It verifies with a verifier generated from `backend/zk_kyc`.
- A real proof fixture is tested end to end, including replay from another
  wallet, a tampered proof, a forged nullifier and the garbage input above.

It also adds expiry (`defaultValidity` for ZK approvals, any expiry via
`setInvestor`) and a jurisdiction code per investor, matching the Solana
allowlist. Jurisdiction is recorded but not enforced.

Points 4 and 5 are **not** fixed:
- **Point 4** needs a backend change: return all 6 public inputs from `bb`, and
  never return a fake proof.
- **Point 5** needs a KYC provider's signature checked inside the circuit.

`verifyAndApprove` with a real proof costs about 3.3M gas.

### Deploy (Sepolia)

```bash
# .env: PRIVATE_KEY, SEPOLIA_RPC_URL, ETHERSCAN_API_KEY
make deploy-token-v2-dry-run          # simulate
make deploy-token-v2-sepolia          # deploy WalletBoundHonkVerifier + ComplianceManagerV2 + token

# or reuse the existing V1 ComplianceManager:
COMPLIANCE_MANAGER=0x07bfd4e030Cf250597A898E9EF43110365c7dbAC make deploy-token-v2-sepolia
```

Optional env: `TOKEN_NAME`, `TOKEN_SYMBOL`, `TOKEN_CAP` (whole tokens),
`ASSET_ID`, `ZK_VALIDITY_DAYS`.

## 🔗 Deployed Addresses (Sepolia)

- **Registry**: `0x774E3195E3efB0fa403366033881C6ab1fe14B0D`
- **Compliance**: `0x07bfd4e030Cf250597A898E9EF43110365c7dbAC`
- **Oracle**: `0x590AE2361F302B274a7FB7277E1f15A450BBF392`
