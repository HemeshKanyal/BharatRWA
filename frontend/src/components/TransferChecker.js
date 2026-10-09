"use client";

import React, { useState } from "react";
import { ethers } from "ethers";
import { CONTRACTS, SOLANA, solanaExplorer } from "@/config";
import { getBackendConfig, getReadProvider } from "@/utils/chain";

// ============================================================
//                      ETHEREUM (Sepolia)
// ============================================================

const CM_ABI = [
  "function isApproved(address) view returns (bool)",
  "function isBlacklisted(address) view returns (bool)",
  "function isTransferCompliant(address,address) view returns (bool)",
];
const URWA_ABI = [
  "function canSend(address) view returns (bool)",
  "function canReceive(address) view returns (bool)",
  "function canTransfer(address,address,uint256) view returns (bool)",
  "function getFrozenTokens(address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function paused() view returns (bool)",
  "function symbol() view returns (string)",
];

async function checkEvm(from, to, amountStr) {
  const provider = getReadProvider();
  const checks = [];

  if (CONTRACTS.TOKEN_V2) {
    const token = new ethers.Contract(CONTRACTS.TOKEN_V2, URWA_ABI, provider);
    const amount = ethers.parseEther(amountStr || "0");
    const [canSend, canReceive, allowed, frozen, balance, paused, symbol] = await Promise.all([
      token.canSend(from), token.canReceive(to), token.canTransfer(from, to, amount),
      token.getFrozenTokens(from), token.balanceOf(from), token.paused(), token.symbol(),
    ]);
    const unfrozen = balance > frozen ? balance - frozen : 0n;
    const fmt = (v) => `${ethers.formatEther(v)} ${symbol}`;
    checks.push({ ok: !paused, label: "Token not paused", call: "paused()" });
    checks.push({ ok: canSend, label: "Sender can send (approved, not blacklisted)", call: "canSend(from)" });
    checks.push({ ok: canReceive, label: "Receiver can receive (approved, not blacklisted)", call: "canReceive(to)" });
    checks.push({
      ok: amount > balance || amount <= unfrozen,
      label: `Amount within unfrozen balance (${fmt(unfrozen)} unfrozen, ${fmt(frozen)} frozen)`,
      call: "getFrozenTokens(from)",
    });
    const note = amount > balance ? `Compliance allows it, but the sender only holds ${fmt(balance)}, so ERC-20 would reject it.` : null;
    return { allowed, source: `BharatRWATokenV2 (ERC-7943) ${CONTRACTS.TOKEN_V2}`, call: "canTransfer(from, to, amount)", checks, note };
  }

  const cm = new ethers.Contract(CONTRACTS.COMPLIANCE_MANAGER, CM_ABI, provider);
  const [fromOk, toOk, fromBl, toBl, allowed] = await Promise.all([
    cm.isApproved(from), cm.isApproved(to), cm.isBlacklisted(from), cm.isBlacklisted(to), cm.isTransferCompliant(from, to),
  ]);
  checks.push({ ok: fromOk, label: "Sender is KYC-approved", call: "isApproved(from)" });
  checks.push({ ok: !fromBl, label: "Sender is not blacklisted", call: "isBlacklisted(from)" });
  checks.push({ ok: toOk, label: "Receiver is KYC-approved", call: "isApproved(to)" });
  checks.push({ ok: !toBl, label: "Receiver is not blacklisted", call: "isBlacklisted(to)" });
  return {
    allowed,
    source: `ComplianceManager V1 ${CONTRACTS.COMPLIANCE_MANAGER}`,
    call: "isTransferCompliant(from, to)",
    checks,
    note: "BharatRWATokenV2 (ERC-7943) isn't deployed on Sepolia yet, so this uses the V1 ComplianceManager that the current demo tokens check on every transfer. Amounts and frozen balances only apply to the V2 token.",
  };
}

// ============================================================
//                      SOLANA (devnet)
// ============================================================

const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
// Anchor discriminator of compliance::AllowlistEntry (from the program IDL).
const ENTRY_DISCRIMINATOR = [42, 59, 88, 1, 124, 138, 92, 236];

/** AllowlistEntry: 8 disc | mint 32 | wallet 32 | approved 1 | jurisdiction 2 | expires_at i64 | bump 1 */
function decodeEntry(info, programId) {
  if (!info) return { exists: false };
  if (info.owner.toBase58() !== programId) return { exists: false, invalid: true };
  const d = info.data;
  if (d.length < 84 || ENTRY_DISCRIMINATOR.some((b, i) => d[i] !== b)) return { exists: false, invalid: true };
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength);
  return {
    exists: true,
    approved: d[72] === 1,
    jurisdiction: String.fromCharCode(d[73], d[74]),
    expiresAt: Number(view.getBigInt64(75, true)),
  };
}

/** SPL token account base layout: state byte at offset 108 (1 = initialized, 2 = frozen). */
function decodeTokenAccount(info) {
  if (!info) return { exists: false };
  const d = info.data;
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength);
  return { exists: true, frozen: d[108] === 2, amount: view.getBigUint64(64, true) };
}

async function checkSolana(fromStr, toStr) {
  const { Connection, PublicKey } = await import("@solana/web3.js");
  let from, to;
  try {
    from = new PublicKey(fromStr.trim());
    to = new PublicKey(toStr.trim());
  } catch {
    throw new Error("Enter two valid Solana wallet addresses");
  }
  const conn = new Connection(SOLANA.rpcUrl, "confirmed");
  const mint = new PublicKey(SOLANA.mint);
  const program = new PublicKey(SOLANA.complianceProgram);
  const enc = new TextEncoder();
  const entryPda = (w) => PublicKey.findProgramAddressSync([enc.encode("allowlist"), mint.toBytes(), w.toBytes()], program)[0];
  const ataPda = (w) => PublicKey.findProgramAddressSync([w.toBytes(), new PublicKey(TOKEN_2022).toBytes(), mint.toBytes()], new PublicKey(ATA_PROGRAM))[0];

  const keys = [entryPda(from), entryPda(to), ataPda(from), ataPda(to)];
  const [infos, slot] = await Promise.all([conn.getMultipleAccountsInfo(keys), conn.getSlot()]);
  const now = (await conn.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);

  const [eFrom, eTo] = [decodeEntry(infos[0], SOLANA.complianceProgram), decodeEntry(infos[1], SOLANA.complianceProgram)];
  const [aFrom, aTo] = [decodeTokenAccount(infos[2]), decodeTokenAccount(infos[3])];
  const valid = (e) => e.exists && e.approved && now < e.expiresAt;
  const describe = (e) =>
    !e.exists ? "no allowlist entry" : !e.approved ? `revoked (${e.jurisdiction})` : now >= e.expiresAt ? "expired" : `approved, ${e.jurisdiction}, until ${new Date(e.expiresAt * 1000).toLocaleDateString()}`;

  const checks = [
    { ok: valid(eFrom), label: `Sender allowlist entry: ${describe(eFrom)}`, link: solanaExplorer("address", keys[0].toBase58()) },
    { ok: valid(eTo), label: `Receiver allowlist entry: ${describe(eTo)}`, link: solanaExplorer("address", keys[1].toBase58()) },
    { ok: aFrom.exists && !aFrom.frozen, label: `Sender token account ${!aFrom.exists ? "doesn't exist" : aFrom.frozen ? "is frozen" : "is not frozen"}`, link: solanaExplorer("address", keys[2].toBase58()) },
    { ok: aTo.exists && !aTo.frozen, label: `Receiver token account ${!aTo.exists ? "doesn't exist yet" : aTo.frozen ? "is frozen" : "is not frozen"}`, link: solanaExplorer("address", keys[3].toBase58()) },
  ];
  const allowed = checks.every((c) => c.ok);
  return {
    allowed,
    source: `Token-2022 mint ${SOLANA.mint} (${SOLANA.mintSymbol}, devnet)`,
    call: "transfer hook + frozen-account check",
    checks,
    note: aFrom.exists && aFrom.amount === 0n ? "The sender holds no tokens, so a real transfer would also fail for lack of balance." : null,
  };
}

// ============================================================
//                          UI
// ============================================================

function Result({ result }) {
  return (
    <div className={`checker-result ${result.allowed ? "checker-allowed" : "checker-blocked"}`} role="status">
      <div className="checker-verdict">{result.allowed ? "✓ Transfer would be allowed" : "✕ Transfer would be blocked"}</div>
      <div className="checker-source">
        {result.source} · <code>{result.call}</code>
      </div>
      <ul className="checker-checks">
        {result.checks.map((c) => (
          <li key={c.label} className={c.ok ? "ok" : "fail"}>
            <span aria-hidden="true">{c.ok ? "✓" : "✕"}</span>
            <span>
              {c.label}
              {c.call && <code className="checker-call">{c.call}</code>}
              {c.link && <a href={c.link} target="_blank" rel="noopener noreferrer" className="checker-call">explorer</a>}
            </span>
          </li>
        ))}
      </ul>
      {result.note && <p className="checker-note">{result.note}</p>}
    </div>
  );
}

export default function TransferChecker() {
  const [chain, setChain] = useState("evm");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [evmExample, setEvmExample] = useState(null);

  const switchChain = (c) => {
    setChain(c);
    setFrom("");
    setTo("");
    setResult(null);
    setError(null);
  };

  const run = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (chain === "evm") {
        if (!ethers.isAddress(from.trim()) || !ethers.isAddress(to.trim())) throw new Error("Enter two valid Ethereum addresses");
        setResult(await checkEvm(ethers.getAddress(from.trim()), ethers.getAddress(to.trim()), amount));
      } else {
        setResult(await checkSolana(from, to));
      }
    } catch (err) {
      setError(err.shortMessage || err.message || "Check failed");
    } finally {
      setBusy(false);
    }
  };

  const loadEvmExample = async () => {
    try {
      const cfg = evmExample ?? (await getBackendConfig());
      setEvmExample(cfg);
      setFrom(cfg.deployer);
      setTo("0x000000000000000000000000000000000000dEaD");
      setResult(null);
    } catch {
      setError("Couldn't load the example (backend unreachable). Paste any two addresses instead.");
    }
  };

  const ex = SOLANA.examples;
  return (
    <div className="checker">
      <div className="checker-tabs" role="tablist" aria-label="Chain">
        <button role="tab" aria-selected={chain === "evm"} className={chain === "evm" ? "active" : ""} onClick={() => switchChain("evm")}>
          Ethereum · Sepolia
        </button>
        <button role="tab" aria-selected={chain === "sol"} className={chain === "sol" ? "active" : ""} onClick={() => switchChain("sol")}>
          Solana · devnet
        </button>
      </div>

      <form onSubmit={run} className="checker-form">
        <label className="form-label" htmlFor="chk-from">From</label>
        <input id="chk-from" className="form-input mono" value={from} onChange={(e) => setFrom(e.target.value)} placeholder={chain === "evm" ? "0x…" : "Solana wallet address"} spellCheck={false} />
        <label className="form-label" htmlFor="chk-to">To</label>
        <input id="chk-to" className="form-input mono" value={to} onChange={(e) => setTo(e.target.value)} placeholder={chain === "evm" ? "0x…" : "Solana wallet address"} spellCheck={false} />
        {chain === "evm" && CONTRACTS.TOKEN_V2 && (
          <>
            <label className="form-label" htmlFor="chk-amount">Amount</label>
            <input id="chk-amount" className="form-input" type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </>
        )}

        <div className="checker-examples">
          <span>Try:</span>
          {chain === "evm" ? (
            <button type="button" onClick={loadEvmExample}>approved exchange wallet → unverified address</button>
          ) : (
            <>
              <button type="button" onClick={() => { setFrom(ex.approved.address); setTo(ex.approved2.address); setResult(null); }}>approved → approved</button>
              <button type="button" onClick={() => { setFrom(ex.approved.address); setTo(ex.outsider.address); setResult(null); }}>approved → not allowlisted</button>
              <button type="button" onClick={() => { setFrom(ex.frozen.address); setTo(ex.approved.address); setResult(null); }}>frozen account → approved</button>
            </>
          )}
        </div>

        <button type="submit" className="btn btn-primary btn-full" disabled={busy || !from || !to}>
          {busy ? "Checking on-chain…" : "Check transfer"}
        </button>
      </form>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {result && <Result result={result} />}
    </div>
  );
}
