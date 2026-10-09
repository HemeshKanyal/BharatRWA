// Attester approves an investor after their ZK-KYC proof was verified
// off-chain: writes the allowlist entry and thaws their token account.
//
//   npm run investor:approve -- <wallet> <jurisdiction e.g. IN> [validDays=365]

import { arg, explorer, localKeypair, pubkey, readDeployment, run, setup } from "./cli";
import { approveInvestor, clusterTime } from "./lib";

run(async () => {
  const rwa = setup();
  const d = readDeployment();
  const wallet = pubkey(arg(0, "wallet"));
  const jurisdiction = arg(1, "jurisdiction");
  const days = Number(process.argv[4] ?? 365);
  const expiresAt = (await clusterTime(rwa.connection)) + days * 86400;

  const sig = await approveInvestor(rwa, pubkey(d.mint), localKeypair("attester"), wallet, jurisdiction, expiresAt);
  console.log(`Approved ${wallet.toBase58()} (${jurisdiction}) until ${new Date(expiresAt * 1000).toISOString()}`);
  console.log(explorer(sig));
});
