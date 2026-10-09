// Forced transfer by the issuer as permanent delegate (court order / legal
// recovery). Works on frozen accounts (thaw -> transfer -> re-freeze, atomic).
// The destination must still be allowlisted.
//
//   npm run transfer:forced -- <fromWallet> <toWallet> <amount>

import { DECIMALS, arg, explorer, pubkey, readDeployment, run, setup, toBaseUnits } from "./cli";
import { forcedTransfer } from "./lib";

run(async () => {
  const rwa = setup();
  const d = readDeployment();
  const from = pubkey(arg(0, "fromWallet"));
  const to = pubkey(arg(1, "toWallet"));
  const sig = await forcedTransfer(rwa, pubkey(d.mint), from, to, toBaseUnits(arg(2, "amount")), DECIMALS);
  console.log(`Forced transfer of ${process.argv[4]} from ${from.toBase58()} to ${to.toBase58()}`);
  console.log(explorer(sig));
});
