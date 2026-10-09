// Normal transfer between two allowlisted holders.
//
//   npm run transfer -- <fromKeypairPath> <toWallet> <amount>

import { DECIMALS, arg, explorer, pubkey, readDeployment, readKeypair, run, setup, toBaseUnits } from "./cli";
import { transfer } from "./lib";

run(async () => {
  const rwa = setup();
  const d = readDeployment();
  const from = readKeypair(arg(0, "fromKeypairPath"));
  const to = pubkey(arg(1, "toWallet"));
  const sig = await transfer(rwa, pubkey(d.mint), from, to, toBaseUnits(arg(2, "amount")), DECIMALS);
  console.log(`Transferred ${process.argv[4]} from ${from.publicKey.toBase58()} to ${to.toBase58()}`);
  console.log(explorer(sig));
});
