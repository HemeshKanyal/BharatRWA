// Issuer mints tokens to an approved investor.
//
//   npm run mint:to -- <wallet> <amount>

import { DECIMALS, arg, explorer, pubkey, readDeployment, run, setup, toBaseUnits } from "./cli";
import { mintTokens } from "./lib";

run(async () => {
  const rwa = setup();
  const d = readDeployment();
  const wallet = pubkey(arg(0, "wallet"));
  const sig = await mintTokens(rwa, pubkey(d.mint), wallet, toBaseUnits(arg(1, "amount")), DECIMALS);
  console.log(`Minted to ${wallet.toBase58()}`);
  console.log(explorer(sig));
});
