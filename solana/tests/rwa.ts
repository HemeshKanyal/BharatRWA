import * as anchor from "@anchor-lang/core";
import {
  AccountState,
  TOKEN_2022_PROGRAM_ID,
  getDefaultAccountState,
  getMetadataPointerState,
  getMint,
  getPermanentDelegate,
  getTokenMetadata,
  getTransferHook,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { expect } from "chai";

import {
  Rwa,
  TRANSFER_HOOK_PROGRAM_ID,
  approveInvestor,
  balanceOf,
  clusterTime,
  configPda,
  createRwaMint,
  entryPda,
  forcedTransfer,
  freezeAccount,
  isFrozen,
  loadPrograms,
  mintTokens,
  removeInvestor,
  thawAccount,
  transfer,
  updateInvestor,
} from "../scripts/lib";

const DECIMALS = 6;
const ONE = 10n ** BigInt(DECIMALS);
const YEAR = 365 * 24 * 3600;

/** Assert that a promise rejects and that the error or its logs mention `needle`. */
async function expectFail(p: Promise<unknown>, needle: string) {
  try {
    await p;
  } catch (e: any) {
    const text = [e?.message, ...(e?.logs ?? []), ...(e?.transactionLogs ?? [])].join("\n");
    expect(text, `expected failure mentioning "${needle}"`).to.include(needle);
    return;
  }
  expect.fail(`expected transaction to fail with "${needle}", but it succeeded`);
}

describe("BharatRWA Token-2022 compliant RWA", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const issuer = (provider.wallet as anchor.Wallet).payer;
  const rwa: Rwa = loadPrograms(provider, issuer);

  const attester = Keypair.generate();
  const alice = Keypair.generate(); // approved, IN
  const bob = Keypair.generate(); // approved, AE
  const carol = Keypair.generate(); // never approved
  const dave = Keypair.generate(); // thawed by issuer but not allowlisted
  const mintKp = Keypair.generate();
  let mint: PublicKey;
  let now: number;

  before(async () => {
    for (const kp of [attester, alice, bob]) {
      const sig = await provider.connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig, "confirmed");
    }
    mint = await createRwaMint(rwa, {
      mint: mintKp,
      attester: attester.publicKey,
      decimals: DECIMALS,
      name: "BharatRWA Mumbai Office Tower",
      symbol: "BMOT",
      uri: "https://bharatrwa.hemeshkanyal.com/metadata/bmot.json",
    });
    now = await clusterTime(provider.connection);
  });

  describe("mint setup", () => {
    it("has transfer hook, default-frozen state, permanent delegate and on-mint metadata", async () => {
      const info = await getMint(provider.connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
      expect(getTransferHook(info)!.programId.toBase58()).to.eq(TRANSFER_HOOK_PROGRAM_ID.toBase58());
      expect(getDefaultAccountState(info)!.state).to.eq(AccountState.Frozen);
      expect(getPermanentDelegate(info)!.delegate.toBase58()).to.eq(issuer.publicKey.toBase58());
      expect(getMetadataPointerState(info)!.metadataAddress!.toBase58()).to.eq(mint.toBase58());
      expect(info.freezeAuthority!.toBase58()).to.eq(configPda(mint).toBase58());

      const md = await getTokenMetadata(provider.connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
      expect(md!.name).to.eq("BharatRWA Mumbai Office Tower");
      expect(md!.symbol).to.eq("BMOT");
    });
  });

  describe("approval", () => {
    it("approve_investor writes the entry and thaws the token account", async () => {
      await approveInvestor(rwa, mint, attester, alice.publicKey, "IN", now + YEAR);
      await approveInvestor(rwa, mint, attester, bob.publicKey, "AE", now + YEAR);

      const entry = await rwa.compliance.account.allowlistEntry.fetch(entryPda(mint, alice.publicKey));
      expect(entry.approved).to.eq(true);
      expect(Buffer.from(entry.jurisdiction).toString()).to.eq("IN");
      expect(entry.expiresAt.toNumber()).to.eq(now + YEAR);
      expect(await isFrozen(rwa, mint, alice.publicKey)).to.eq(false);

      await mintTokens(rwa, mint, alice.publicKey, 1_000n * ONE, DECIMALS);
      expect(await balanceOf(rwa, mint, alice.publicKey)).to.eq(1_000n * ONE);
    });

    it("rejects an expiry in the past and a malformed jurisdiction", async () => {
      await expectFail(
        approveInvestor(rwa, mint, attester, carol.publicKey, "IN", now - 10),
        "ExpiryInPast"
      );
      await expectFail(
        rwa.compliance.methods
          .updateInvestor(true, [0x69, 0x6e], new anchor.BN(now + YEAR)) // "in"
          .accountsPartial({ attester: attester.publicKey, entry: entryPda(mint, alice.publicKey) })
          .signers([attester])
          .rpc(),
        "InvalidJurisdiction"
      );
    });
  });

  describe("transfers", () => {
    it("allowlisted -> allowlisted transfer succeeds", async () => {
      await transfer(rwa, mint, alice, bob.publicKey, 100n * ONE, DECIMALS);
      expect(await balanceOf(rwa, mint, bob.publicKey)).to.eq(100n * ONE);
    });

    it("transfer to a never-approved wallet fails (account is frozen by default)", async () => {
      // Create carol's token account; it starts Frozen because of DefaultAccountState.
      const { createAssociatedTokenAccountIdempotent } = await import("@solana/spl-token");
      await createAssociatedTokenAccountIdempotent(
        provider.connection, issuer, mint, carol.publicKey, { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
      );
      expect(await isFrozen(rwa, mint, carol.publicKey)).to.eq(true);
      await expectFail(transfer(rwa, mint, alice, carol.publicKey, ONE, DECIMALS), "Account is frozen");
    });

    it("transfer to a thawed but non-allowlisted wallet is rejected by the hook", async () => {
      const { createAssociatedTokenAccountIdempotent } = await import("@solana/spl-token");
      await createAssociatedTokenAccountIdempotent(
        provider.connection, issuer, mint, dave.publicKey, { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
      );
      await thawAccount(rwa, mint, dave.publicKey); // issuer thaws, no allowlist entry
      expect(await isFrozen(rwa, mint, dave.publicKey)).to.eq(false);
      await expectFail(
        transfer(rwa, mint, alice, dave.publicKey, ONE, DECIMALS),
        "DestinationNotAllowlisted"
      );
    });

    it("transfer to a revoked (approved = false) wallet is rejected by the hook", async () => {
      await updateInvestor(rwa, mint, attester, bob.publicKey, false, "AE", now + YEAR);
      await expectFail(
        transfer(rwa, mint, alice, bob.publicKey, ONE, DECIMALS),
        "DestinationNotAllowlisted"
      );
      await updateInvestor(rwa, mint, attester, bob.publicKey, true, "AE", now + YEAR);
    });

    it("transfer from an expired entry fails", async () => {
      const t = await clusterTime(provider.connection);
      await updateInvestor(rwa, mint, attester, bob.publicKey, true, "AE", t + 3);
      // Wait for cluster time to pass the expiry.
      while ((await clusterTime(provider.connection)) <= t + 3) {
        await new Promise((r) => setTimeout(r, 500));
      }
      await expectFail(
        transfer(rwa, mint, bob, alice.publicKey, ONE, DECIMALS),
        "SourceNotAllowlisted"
      );
      // ...and to it.
      await expectFail(
        transfer(rwa, mint, alice, bob.publicKey, ONE, DECIMALS),
        "DestinationNotAllowlisted"
      );
      const t2 = await clusterTime(provider.connection);
      await updateInvestor(rwa, mint, attester, bob.publicKey, true, "AE", t2 + YEAR);
      await transfer(rwa, mint, bob, alice.publicKey, ONE, DECIMALS);
    });
  });

  describe("freezing", () => {
    it("a frozen account cannot transfer", async () => {
      await freezeAccount(rwa, mint, bob.publicKey);
      expect(await isFrozen(rwa, mint, bob.publicKey)).to.eq(true);
      await expectFail(transfer(rwa, mint, bob, alice.publicKey, ONE, DECIMALS), "Account is frozen");
    });

    it("the attester cannot lift an issuer freeze by re-approving", async () => {
      await removeInvestor(rwa, mint, attester, bob.publicKey);
      await expectFail(
        approveInvestor(rwa, mint, attester, bob.publicKey, "AE", now + YEAR),
        "UnderLegalHold"
      );
    });

    it("the issuer can thaw, which lifts the legal hold", async () => {
      await thawAccount(rwa, mint, bob.publicKey);
      await approveInvestor(rwa, mint, attester, bob.publicKey, "AE", now + YEAR);
      await transfer(rwa, mint, bob, alice.publicKey, ONE, DECIMALS);
    });
  });

  describe("forced transfer (permanent delegate)", () => {
    it("moves tokens out of a frozen, revoked account to an allowlisted wallet", async () => {
      await freezeAccount(rwa, mint, bob.publicKey);
      await updateInvestor(rwa, mint, attester, bob.publicKey, false, "AE", now + YEAR);
      const before = await balanceOf(rwa, mint, bob.publicKey);
      const aliceBefore = await balanceOf(rwa, mint, alice.publicKey);

      await forcedTransfer(rwa, mint, bob.publicKey, alice.publicKey, before, DECIMALS);

      expect(await balanceOf(rwa, mint, bob.publicKey)).to.eq(0n);
      expect(await balanceOf(rwa, mint, alice.publicKey)).to.eq(aliceBefore + before);
      expect(await isFrozen(rwa, mint, bob.publicKey)).to.eq(true); // re-frozen
    });

    it("still requires the destination to be allowlisted", async () => {
      await expectFail(
        forcedTransfer(rwa, mint, alice.publicKey, dave.publicKey, ONE, DECIMALS),
        "DestinationNotAllowlisted"
      );
    });

    it("a non-delegate cannot move another holder's tokens", async () => {
      const { createTransferCheckedWithTransferHookInstruction } = await import("@solana/spl-token");
      const { ata } = await import("../scripts/lib");
      const ix = await createTransferCheckedWithTransferHookInstruction(
        provider.connection, ata(mint, alice.publicKey), mint, ata(mint, bob.publicKey),
        carol.publicKey, ONE, DECIMALS, [], "confirmed", TOKEN_2022_PROGRAM_ID
      );
      const tx = new anchor.web3.Transaction().add(ix);
      await expectFail(
        anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [issuer, carol]),
        "owner does not match"
      );
    });
  });

  describe("access control", () => {
    const mallory = Keypair.generate();

    before(async () => {
      const sig = await provider.connection.requestAirdrop(mallory.publicKey, LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig, "confirmed");
    });

    it("only the attester can add allowlist entries", async () => {
      await expectFail(approveInvestor(rwa, mint, mallory, mallory.publicKey, "IN", now + YEAR), "Unauthorized");
      // The issuer is not the attester either.
      await expectFail(approveInvestor(rwa, mint, issuer, carol.publicKey, "IN", now + YEAR), "Unauthorized");
    });

    it("only the attester can update or remove entries", async () => {
      await expectFail(updateInvestor(rwa, mint, mallory, alice.publicKey, false, "IN", now + YEAR), "Unauthorized");
      await expectFail(removeInvestor(rwa, mint, mallory, alice.publicKey), "Unauthorized");
      const entry = await rwa.compliance.account.allowlistEntry.fetch(entryPda(mint, alice.publicKey));
      expect(entry.approved).to.eq(true);
    });

    it("only the issuer can freeze, thaw or rotate the attester", async () => {
      const asMallory = loadPrograms(provider, mallory);
      await expectFail(freezeAccount(asMallory, mint, alice.publicKey), "Unauthorized");
      await expectFail(thawAccount(asMallory, mint, carol.publicKey), "Unauthorized");
      await expectFail(
        rwa.compliance.methods
          .setAttester(mallory.publicKey)
          .accountsPartial({ issuer: mallory.publicKey, config: configPda(mint) })
          .signers([mallory])
          .rpc(),
        "Unauthorized"
      );
    });

    it("the issuer can rotate the attester, and the old attester loses access", async () => {
      const newAttester = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(newAttester.publicKey, LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig, "confirmed");

      await rwa.compliance.methods
        .setAttester(newAttester.publicKey)
        .accountsPartial({ issuer: issuer.publicKey, config: configPda(mint) })
        .rpc({ commitment: "confirmed" });

      await expectFail(approveInvestor(rwa, mint, attester, carol.publicKey, "IN", now + YEAR), "Unauthorized");
      await approveInvestor(rwa, mint, newAttester, carol.publicKey, "IN", now + YEAR);
      expect(await isFrozen(rwa, mint, carol.publicKey)).to.eq(false);
    });

    it("only the mint authority can initialize compliance for a mint", async () => {
      const { createMint } = await import("@solana/spl-token");
      const other = Keypair.generate();
      await createMint(
        provider.connection, issuer, issuer.publicKey, configPda(other.publicKey), 0, other,
        { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
      );
      await expectFail(
        rwa.compliance.methods
          .initialize(mallory.publicKey)
          .accountsPartial({ issuer: mallory.publicKey, mint: other.publicKey })
          .signers([mallory])
          .rpc(),
        "NotMintAuthority"
      );
    });

    it("refuses a mint whose freeze authority is not the config PDA", async () => {
      const { createMint } = await import("@solana/spl-token");
      const other = Keypair.generate();
      await createMint(
        provider.connection, issuer, issuer.publicKey, issuer.publicKey, 0, other,
        { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
      );
      await expectFail(
        rwa.compliance.methods
          .initialize(attester.publicKey)
          .accountsPartial({ issuer: issuer.publicKey, mint: other.publicKey })
          .rpc(),
        "FreezeAuthorityNotConfig"
      );
    });
  });
});
