// Attempt a transfer that the compliance rules must block, and show why.
// The destination's token account is thawed by the issuer but has no
// allowlist entry, so the transfer hook (not the freeze) is what rejects it.
// Exits 0 if the transfer was blocked, 1 if it unexpectedly succeeded.
//
//   npm run transfer:blocked -- <fromKeypairPath> [amount=1]

import { createAssociatedTokenAccountIdempotent, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { DECIMALS, arg, localKeypair, pubkey, readDeployment, readKeypair, run, setup, toBaseUnits } from "./cli";
import { thawAccount, transfer } from "./lib";

run(async () => {
  const rwa = setup();
  const d = readDeployment();
  const mint = pubkey(d.mint);
  const from = readKeypair(arg(0, "fromKeypairPath"));
  const outsider = localKeypair("outsider").publicKey;

  await createAssociatedTokenAccountIdempotent(
    rwa.connection, rwa.issuer, mint, outsider, { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
  );
  await thawAccount(rwa, mint, outsider);

  try {
    await transfer(rwa, mint, from, outsider, toBaseUnits(process.argv[3] ?? "1"), DECIMALS);
  } catch (e: any) {
    const logs: string[] = e?.logs ?? (await e?.getLogs?.(rwa.connection)) ?? [];
    const reason = logs.find((l) => l.includes("Error Code")) ?? e.message;
    console.log(`Blocked as expected: transfer to non-allowlisted ${outsider.toBase58()}`);
    console.log(reason);
    return;
  }
  console.error("Transfer was NOT blocked — compliance hook is not enforcing!");
  process.exit(1);
});
