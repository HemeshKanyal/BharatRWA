# BharatRWA on Solana — Token-2022 compliant RWA token

A permissioned real-world-asset token built on SPL Token-2022 extensions,
with two Anchor programs that enforce an investor allowlist on every transfer.

## Devnet deployment

Deployed 2026-10-09 with Anchor 1.2.1 / Agave 4.3.0.

| Item | Address |
|---|---|
| Compliance program | [`588hz1dHm9goLKBAt4yRwNaEDeuF97teDrjd2E6XdE9E`](https://explorer.solana.com/address/588hz1dHm9goLKBAt4yRwNaEDeuF97teDrjd2E6XdE9E?cluster=devnet) |
| Transfer hook program | [`AtGeNjNoNobDCBP6gvtgDK1gvsWkQe2Xm3F5RziJkS88`](https://explorer.solana.com/address/AtGeNjNoNobDCBP6gvtgDK1gvsWkQe2Xm3F5RziJkS88?cluster=devnet) |
| RWA mint (BMOT, 6 decimals) | [`4PC4Qm73fAvQLQNjX6xg569nQBGJx1VkdY9aZ3E99Epy`](https://explorer.solana.com/address/4PC4Qm73fAvQLQNjX6xg569nQBGJx1VkdY9aZ3E99Epy?cluster=devnet) |
| Issuer (mint authority, permanent delegate, upgrade authority) | [`9VP8ehu39fJZ45T1Mn4BeXH9PYK5XBxAtoEVr3bobDb7`](https://explorer.solana.com/address/9VP8ehu39fJZ45T1Mn4BeXH9PYK5XBxAtoEVr3bobDb7?cluster=devnet) |
| Attester | [`5Sp8iczn7JbDwVouEri9GyuBrPC1Xfdja3be72Zg98Ab`](https://explorer.solana.com/address/5Sp8iczn7JbDwVouEri9GyuBrPC1Xfdja3be72Zg98Ab?cluster=devnet) |

Demo transactions (`npm run demo`):

| Step | Transaction |
|---|---|
| Approve investor (IN): write entry + thaw | [approveAlice](https://explorer.solana.com/tx/3Tfxf8syRsHh1BX7p7rgQn7EZugk2FpE1BBTjW3Zu6poZQumzWSv3vgMR5dVKKiDDRKNvbL3HvSDsCj38V8KDmcD?cluster=devnet) |
| Approve investor (AE) | [approveBob](https://explorer.solana.com/tx/2wi6YBtY9Qt3qUBj5qHT6cuo35vhDd5hkiUWAKKK6t2DwufgrJfyNAwgsMk9b6muU2R2VMy4DbpLQanEuAoKxK4a?cluster=devnet) |
| Mint 1,000 to approved investor | [mintToAlice](https://explorer.solana.com/tx/52h2Xyiydo3sVMsTWS9ZG4aMo866aYqCk4daukG1VpHX8xSadnsRBEPrNbDMvsdaNgdFAHa9nKVJzzayrkL7Cjbq?cluster=devnet) |
| Allowlisted transfer (100) | [transferAliceToBob](https://explorer.solana.com/tx/ruBEr42GaEqEdyM7Txu9SoQB1dR2RH8g4JZnJCXXHVZtm4o77D4H4KrZQEMt5ZjWQ6Vh8vhutG2KPcHTPNn45jC?cluster=devnet) |
| Issuer thaws a non-allowlisted account | [thawOutsider](https://explorer.solana.com/tx/3CqSfcBeg9DFmA6WmZbrobhvahbF5Bqtf37G7n1DS9KuPiJE7WhTw51JQiyWQD2vc5b3MkS6umcxbpmwqLrUzAyT?cluster=devnet) |
| Issuer freeze + legal hold | [freezeBob](https://explorer.solana.com/tx/g5mXu39y6heJZ9ENGSx2ighKqpQ2jZN6dxNXkEpNERkKqSp28azGSMD2VQuQg4RMjtqLbTYmQ7Xv4gAHCC5stAT?cluster=devnet) |
| Forced transfer out of frozen account (thaw → transfer → re-freeze) | [forcedTransferBobToAlice](https://explorer.solana.com/tx/4xT69PbhY8o48seWPE5sEBfDiXNJFJUjjBWnPitHV3PjkT4Z26jwEXGz76s4wpBbRYxjHiEiPGkPo6CXMjCJGa3c?cluster=devnet) |

The blocked transfer (to a thawed but non-allowlisted wallet) has no
signature because it fails simulation. The hook returns
`DestinationNotAllowlisted` (error 6001). `deployments/devnet.json` records
the same addresses and signatures.

## How it works

```
                    ┌────────────────────────── compliance program ─────────────────────────┐
 ZK-KYC proof  ──►  │ attester ──approve_investor──► AllowlistEntry PDA (mint, wallet)       │
 (verified          │                              { approved, jurisdiction, expires_at }   │
  off-chain by      │                         └──► thaw investor token account (CPI)        │
  the backend)      │ issuer ──freeze_account / thaw_account──► Config PDA = freeze authority│
                    └───────────────────────────────────────────────────────────────────────┘
                                                         ▲ reads entries
 holder ── transfer_checked ──► Token-2022 ── execute ──► transfer_hook program
                                                          rejects unless both owners are
                                                          approved and unexpired
```

### Mint extensions

| Extension | Setting | Purpose |
|---|---|---|
| Transfer hook | → `transfer_hook` program | Every transfer is checked against the allowlist. |
| Default account state | `Frozen` | New token accounts can't receive or send until the investor is approved. |
| Permanent delegate | issuer | Forced transfers (court order, legal recovery). |
| Metadata pointer | → the mint itself | Name, symbol and URI are stored on the mint (Token-2022 metadata). |
| Freeze authority | compliance `Config` PDA | Lets `approve_investor` thaw in the same instruction; only the issuer can freeze. |

### Roles

- **Issuer** — mint authority and permanent delegate. Freezes and thaws
  accounts through the compliance program and can rotate the attester.
- **Attester** — set at `initialize`. The only key that can add, update or
  remove allowlist entries.

### Compliance program (`programs/compliance`)

| Instruction | Signer | Effect |
|---|---|---|
| `initialize(attester)` | mint authority | Creates `Config` PDA `["config", mint]`. Fails unless the mint's freeze authority is that PDA. |
| `approve_investor(jurisdiction, expires_at)` | attester | Creates `AllowlistEntry` PDA `["allowlist", mint, wallet]` and thaws the wallet's token account. |
| `update_investor(approved, jurisdiction, expires_at)` | attester | Changes an entry. `approved = false` revokes. |
| `remove_investor` | attester | Closes an entry. |
| `freeze_account` | issuer | Freezes a token account and creates a `LegalHold` PDA `["legal-hold", token_account]`. |
| `thaw_account` | issuer | Thaws a token account and removes any legal hold. |
| `set_attester(new)` | issuer | Rotates the attester. |

The legal hold stops the attester from undoing an issuer freeze (for
example, by removing and re-approving the investor): `approve_investor`
refuses to thaw an account under legal hold.

Jurisdiction is a two-letter uppercase code (`IN`, `AE`, …). It is stored on
each entry for off-chain reporting and future rules; the hook does **not**
yet restrict transfers by jurisdiction.

### Transfer hook program (`programs/transfer_hook`)

`execute` runs inside every `transfer_checked`. It rejects the transfer unless:

1. the source owner's allowlist entry exists, is approved and hasn't expired, and
2. the destination owner's entry exists, is approved and hasn't expired.

When the transfer authority is the mint's **permanent delegate** (a forced
transfer), check 1 is skipped and only the destination is checked. This
matches ERC-7943's `forcedTransfer`, which may bypass the sender check but
should still check that the recipient can receive.

`execute` also checks that the source account's `transferring` flag is set,
so it can only run as part of a real Token-2022 transfer.

**Extra-account-metas.** The PDA `["extra-account-metas", mint]` lists the
three accounts Token-2022 must pass to the hook:

| Index | Account | How it is resolved |
|---|---|---|
| 5 | compliance program | fixed address |
| 6 | source owner's entry | compliance PDA `["allowlist", mint(1), source.data[32..64]]` |
| 7 | destination owner's entry | compliance PDA `["allowlist", mint(1), destination.data[32..64]]` |

Bytes 32–64 of a token account are its owner, so wallets and the
`@solana/spl-token` helpers (`createTransferCheckedWithTransferHookInstruction`)
derive the right PDAs from on-chain data with no custom code. The scripts and
tests use exactly that resolution path.

### Forced transfers

Token-2022 won't move tokens out of a frozen account, even for the permanent
delegate. `forcedTransfer` in `scripts/lib.ts` therefore sends one atomic
transaction: issuer thaw → `transfer_checked` signed by the permanent
delegate → issuer freeze. The destination must still be allowlisted.

## Design notes and trade-offs

### ZK-KYC is verified off-chain, then attested on-chain

The ZK-KYC proof is **not** verified by a Solana program. The intended flow:

1. The investor generates a Noir proof through the existing backend prover
   (`/backend`, `/zk_kyc`).
2. The backend verifies the proof off-chain.
3. If it is valid, the attester key signs `approve_investor`.

What this means:

- **Trust moves to the attester.** On-chain, the allowlist proves only that
  the attester approved the wallet, not that a valid proof exists. Anyone
  auditing must trust the attester's off-chain verification. A compromised
  attester key can approve anyone, so it should be an HSM/multisig key and
  be rotated with `set_attester` if exposed.
- **Privacy is unchanged.** No KYC data goes on-chain either way; only the
  wallet, jurisdiction and expiry do.
- **Cost and complexity are low.** Verifying an UltraHonk proof on Solana
  would need a dedicated verifier program, and the compute cost is high.
  This is a reasonable later step, not a requirement for the allowlist to work.
- **The current proof pipeline has known gaps** that this design inherits.
  The circuit's inputs are self-declared (no KYC-provider signature), and
  the backend falls back to a fake proof when proving fails. See the root
  README. The attester must reject any request without a valid proof.

### Solana freezes whole accounts; ERC-7943 freezes amounts

ERC-7943's `setFrozenTokens` / `getFrozenTokens` freeze a specific **amount**
per account and let the rest move. Token-2022's freeze authority freezes the
**entire token account**: all of the balance or none of it. There is no native
partial freeze, so `getFrozenTokens` doesn't map one-to-one. Approximations
if you need it:

- Move the frozen amount to a separate, frozen escrow account owned by the
  holder (or a PDA). The holder's main account stays liquid.
- Track frozen amounts in the compliance program and enforce
  `balance - frozen >= amount` in the hook. That needs the hook to read the
  source balance and amount, which it can, at extra compute cost.

Neither is implemented; today a freeze is all-or-nothing.

### Other limitations

- Jurisdiction is recorded but not enforced by the hook.
- Expiry uses the cluster clock (`Clock::unix_timestamp`), which can drift a
  little from wall time.
- Minting doesn't run the transfer hook. Because new accounts start frozen,
  tokens can only be minted to approved, thawed accounts.
- The issuer key is powerful (mint authority, permanent delegate, freeze
  control). Use a multisig for anything beyond devnet.

## Toolchain

| Tool | Version |
|---|---|
| Rust | 1.99.0 (programs build with the pinned `rust-toolchain.toml`, 1.89.0) |
| Solana CLI (Agave) | 4.3.0 |
| Anchor CLI / `anchor-lang` / `anchor-spl` | 1.2.1 |
| `spl-transfer-hook-interface` | 2.1.0 |
| `spl-tlv-account-resolution` | 0.11.4 |
| `@anchor-lang/core` | 1.2.1 |
| `@solana/spl-token` | 0.4.15 |
| `@solana/web3.js` | 1.99.0 |

## Setup

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Solana CLI (Agave)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
# Anchor CLI (from crates.io)
cargo install anchor-cli --version 1.2.1 --locked

cd solana
npm install
anchor build
```

## Test

```bash
npm test     # = anchor test --validator legacy
```

`--validator legacy` uses `solana-test-validator`. Anchor 1.x defaults to
Surfpool, which you'd need to install separately.

The tests cover:

- **Mint setup:** transfer hook, default-frozen state, permanent delegate, metadata and freeze authority.
- **Approval:** writes the entry and thaws the account; rejects a past expiry or a bad jurisdiction code.
- **Allowlisted → allowlisted transfer succeeds.**
- **Transfers that fail:**
  - to a never-approved wallet (its account is frozen);
  - to a thawed but non-allowlisted wallet (rejected by the hook);
  - to a revoked wallet;
  - from or to an expired entry.
- **Freezing:**
  - a frozen account can't transfer;
  - the attester can't lift an issuer freeze;
  - the issuer can.
- **Forced transfers:**
  - work out of a frozen, revoked account;
  - still require an allowlisted destination;
  - a non-delegate can't move someone else's tokens.
- **Access control:**
  - only the attester can add, update or remove entries;
  - only the issuer can freeze, thaw or rotate the attester;
  - rotating the attester revokes the old key;
  - only the mint authority can initialize;
  - initialize rejects a mint with the wrong freeze authority.

## Scripts

All scripts default to devnet (`CLUSTER=localnet` for a local validator) and
use `~/.config/solana/id.json` as the issuer (`ANCHOR_WALLET` overrides).
They refuse to run against mainnet. Generated secret keys (attester, demo
investors) are written to `solana/keys/`, which is gitignored.

```bash
npm run mint:create                       # create the mint + register it (writes deployments/devnet.json)
npm run investor:approve -- <wallet> IN 365
npm run mint:to          -- <wallet> 1000
npm run transfer         -- <fromKeypair.json> <toWallet> 10
npm run transfer:blocked -- <fromKeypair.json>        # expects the hook to reject
npm run account:freeze   -- <wallet>                  # add --thaw to unfreeze
npm run transfer:forced  -- <fromWallet> <toWallet> 10
npm run demo                              # all of the above, end to end
```

## Deploy to devnet

```bash
solana config set --url devnet
solana address                     # fund with ~3 devnet SOL (https://faucet.solana.com); the 2026-10-09 deploy + demo used 2.16 SOL
anchor build
anchor deploy --provider.cluster devnet
npm run mint:create
npm run demo
```

The program keypairs in `target/deploy/*-keypair.json` determine the program
IDs. They are gitignored; back them up if you need to redeploy to the same
IDs from another machine. Your wallet is the programs' upgrade authority.
