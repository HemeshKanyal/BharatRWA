// Shared setup for the CLI scripts: provider, programs, keypairs and the
// deployment record (public addresses only) in deployments/<cluster>.json.
//
// Env:
//   CLUSTER          devnet (default) | localnet
//   ANCHOR_WALLET    issuer keypair path (default ~/.config/solana/id.json)
// Secret keypairs the scripts generate (attester, demo investors) are written
// to solana/keys/, which is gitignored.

import { AnchorProvider, Wallet } from "@anchor-lang/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";

import { Rwa, loadPrograms } from "./lib";

export const DECIMALS = 6;
export const CLUSTER = process.env.CLUSTER ?? "devnet";
if (CLUSTER === "mainnet" || CLUSTER === "mainnet-beta") {
  throw new Error("These scripts are for devnet/localnet only.");
}
const RPC: Record<string, string> = {
  devnet: "https://api.devnet.solana.com",
  localnet: "http://127.0.0.1:8899",
};

const ROOT = path.resolve(__dirname, "..");
const KEYS_DIR = path.join(ROOT, "keys");
const DEPLOYMENT_FILE = path.join(ROOT, "deployments", `${CLUSTER}.json`);

export interface Deployment {
  cluster: string;
  complianceProgram: string;
  transferHookProgram: string;
  mint: string;
  issuer: string;
  attester: string;
  metadata: { name: string; symbol: string; uri: string };
  transactions?: Record<string, string>;
}

export function readKeypair(file: string): Keypair {
  const p = file.startsWith("~") ? path.join(os.homedir(), file.slice(1)) : file;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}

/** Load keys/<name>.json, creating it if it does not exist. */
export function localKeypair(name: string): Keypair {
  const file = path.join(KEYS_DIR, `${name}.json`);
  if (fs.existsSync(file)) return readKeypair(file);
  fs.mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
  const kp = Keypair.generate();
  fs.writeFileSync(file, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  return kp;
}

export function setup(): Rwa {
  const url = RPC[CLUSTER];
  if (!url) throw new Error(`Unknown CLUSTER "${CLUSTER}"`);
  const issuer = readKeypair(process.env.ANCHOR_WALLET ?? "~/.config/solana/id.json");
  const connection = new Connection(url, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(issuer), { commitment: "confirmed" });
  return loadPrograms(provider, issuer);
}

export function readDeployment(): Deployment {
  if (!fs.existsSync(DEPLOYMENT_FILE)) {
    throw new Error(`No ${path.relative(ROOT, DEPLOYMENT_FILE)}; run \`npm run mint:create\` first.`);
  }
  return JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
}

export function writeDeployment(d: Deployment) {
  fs.mkdirSync(path.dirname(DEPLOYMENT_FILE), { recursive: true });
  fs.writeFileSync(DEPLOYMENT_FILE, JSON.stringify(d, null, 2) + "\n");
}

export function recordTx(label: string, sig: string) {
  const d = readDeployment();
  d.transactions = { ...(d.transactions ?? {}), [label]: sig };
  writeDeployment(d);
}

export function explorer(sig: string) {
  const suffix = CLUSTER === "devnet" ? "?cluster=devnet" : "?cluster=custom";
  return `https://explorer.solana.com/tx/${sig}${suffix}`;
}

export function arg(i: number, name: string): string {
  const v = process.argv[2 + i];
  if (!v) {
    console.error(`Missing argument <${name}>`);
    process.exit(1);
  }
  return v;
}

export const pubkey = (s: string) => new PublicKey(s);

/** Parse a decimal token amount ("12.5") into base units. */
export function toBaseUnits(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  if (frac.length > DECIMALS) throw new Error(`At most ${DECIMALS} decimal places`);
  return BigInt(whole) * 10n ** BigInt(DECIMALS) + BigInt(frac.padEnd(DECIMALS, "0") || "0");
}

export function run(main: () => Promise<void>) {
  main().catch((e) => {
    console.error(e?.message ?? e);
    if (e?.logs) console.error(e.logs.join("\n"));
    process.exit(1);
  });
}
