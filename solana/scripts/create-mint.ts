// Create the Token-2022 RWA mint with transfer hook, default-frozen state,
// permanent delegate and on-mint metadata, and register it with the
// compliance and transfer-hook programs.
//
//   npm run mint:create -- [name] [symbol] [uri]

import { Keypair } from "@solana/web3.js";
import { CLUSTER, DECIMALS, localKeypair, run, setup, writeDeployment } from "./cli";
import { COMPLIANCE_PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID, createRwaMint } from "./lib";

run(async () => {
  const rwa = setup();
  const metadata = {
    name: process.argv[2] ?? "BharatRWA Mumbai Office Tower",
    symbol: process.argv[3] ?? "BMOT",
    uri: process.argv[4] ?? "https://bharatrwa.hemeshkanyal.com/metadata/bmot.json",
  };
  const attester = localKeypair("attester");
  const mintKp = Keypair.generate();

  const mint = await createRwaMint(rwa, { mint: mintKp, attester: attester.publicKey, decimals: DECIMALS, ...metadata });

  writeDeployment({
    cluster: CLUSTER,
    complianceProgram: COMPLIANCE_PROGRAM_ID.toBase58(),
    transferHookProgram: TRANSFER_HOOK_PROGRAM_ID.toBase58(),
    mint: mint.toBase58(),
    issuer: rwa.issuer.publicKey.toBase58(),
    attester: attester.publicKey.toBase58(),
    metadata,
  });
  console.log(`Mint:     ${mint.toBase58()}`);
  console.log(`Issuer:   ${rwa.issuer.publicKey.toBase58()} (mint authority, permanent delegate)`);
  console.log(`Attester: ${attester.publicKey.toBase58()} (keypair in solana/keys/attester.json)`);
});
