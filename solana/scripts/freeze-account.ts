// Issuer freezes a holder's token account (places a legal hold), or thaws it.
//
//   npm run account:freeze -- <wallet> [--thaw]

import { arg, explorer, pubkey, readDeployment, run, setup } from "./cli";
import { freezeAccount, thawAccount } from "./lib";

run(async () => {
  const rwa = setup();
  const d = readDeployment();
  const wallet = pubkey(arg(0, "wallet"));
  const thaw = process.argv.includes("--thaw");
  const sig = thaw
    ? await thawAccount(rwa, pubkey(d.mint), wallet)
    : await freezeAccount(rwa, pubkey(d.mint), wallet);
  console.log(`${thaw ? "Thawed" : "Froze"} token account of ${wallet.toBase58()}`);
  console.log(explorer(sig));
});
