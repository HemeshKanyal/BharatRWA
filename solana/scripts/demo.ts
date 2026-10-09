// End-to-end demo against the deployed mint: approve two investors, mint,
// transfer, show a blocked transfer, freeze, and force-transfer. Records each
// transaction signature in deployments/<cluster>.json.
//
//   npm run demo
// The issuer pays all fees; the attester is topped up from the issuer.

import { LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotent, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { DECIMALS, explorer, localKeypair, pubkey, readDeployment, recordTx, run, setup, toBaseUnits } from "./cli";
import {
  approveInvestor, balanceOf, clusterTime, forcedTransfer, freezeAccount, mintTokens, thawAccount, transfer,
} from "./lib";

run(async () => {
  const rwa = setup();
  const d = readDeployment();
  const mint = pubkey(d.mint);
  const attester = localKeypair("attester");
  const alice = localKeypair("investor-alice");
  const bob = localKeypair("investor-bob");
  const outsider = localKeypair("outsider");
  const fmt = (n: bigint) => (Number(n) / 10 ** DECIMALS).toString();

  const step = async (label: string, f: () => Promise<string>) => {
    const sig = await f();
    recordTx(label, sig);
    console.log(`✔ ${label}\n  ${explorer(sig)}`);
  };

  if ((await rwa.connection.getBalance(attester.publicKey)) < 0.05 * LAMPORTS_PER_SOL) {
    await sendAndConfirmTransaction(
      rwa.connection,
      new Transaction().add(SystemProgram.transfer({
        fromPubkey: rwa.issuer.publicKey, toPubkey: attester.publicKey, lamports: 0.1 * LAMPORTS_PER_SOL,
      })),
      [rwa.issuer],
      { commitment: "confirmed" }
    );
  }

  const expiresAt = (await clusterTime(rwa.connection)) + 365 * 86400;
  await step("approveAlice", () => approveInvestor(rwa, mint, attester, alice.publicKey, "IN", expiresAt));
  await step("approveBob", () => approveInvestor(rwa, mint, attester, bob.publicKey, "AE", expiresAt));
  await step("mintToAlice", () => mintTokens(rwa, mint, alice.publicKey, toBaseUnits("1000"), DECIMALS));
  await step("transferAliceToBob", () => transfer(rwa, mint, alice, bob.publicKey, toBaseUnits("100"), DECIMALS));

  // Blocked: outsider's account is thawed by the issuer but not allowlisted.
  await createAssociatedTokenAccountIdempotent(
    rwa.connection, rwa.issuer, mint, outsider.publicKey, { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
  );
  await step("thawOutsider", () => thawAccount(rwa, mint, outsider.publicKey));
  try {
    await transfer(rwa, mint, alice, outsider.publicKey, toBaseUnits("1"), DECIMALS);
    throw new Error("Transfer to non-allowlisted wallet was NOT blocked");
  } catch (e: any) {
    if (e.message.startsWith("Transfer to non-allowlisted")) throw e;
    const logs: string[] = e?.logs ?? [];
    console.log(`✔ blocked transfer to non-allowlisted wallet: ${logs.find((l) => l.includes("Error Code")) ?? e.message}`);
  }

  await step("freezeBob", () => freezeAccount(rwa, mint, bob.publicKey));
  await step("forcedTransferBobToAlice", () =>
    forcedTransfer(rwa, mint, bob.publicKey, alice.publicKey, toBaseUnits("100"), DECIMALS)
  );

  console.log(`\nBalances: alice=${fmt(await balanceOf(rwa, mint, alice.publicKey))} bob=${fmt(await balanceOf(rwa, mint, bob.publicKey))}`);
});
