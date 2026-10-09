"use client";

import React, { useState, useEffect } from "react";
import { useWallet } from "@/components/WalletProvider";
import { useToast } from "@/components/ToastProvider";
import { ethers } from "ethers";
import AssetRegistryABI from "@/abis/AssetRegistry.json";
import ComplianceManagerABI from "@/abis/ComplianceManager.json";
import { CONTRACTS } from "@/config";
import { fetchBackend } from "@/utils/chain";
import Link from "next/link";

const ERC7943_ID = "0x3edbb4c4";
const TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function supportsInterface(bytes4) view returns (bool)",
  "function getFrozenTokens(address) view returns (uint256)",
];
const CM_V2_ABI = [
  "function isApproved(address) view returns (bool)",
  "function isBlacklisted(address) view returns (bool)",
  "function getInvestor(address) view returns (tuple(bool approved, bytes2 jurisdiction, uint64 expiresAt))",
];

async function supportsErc7943(token) {
  try {
    return await token.supportsInterface(ERC7943_ID);
  } catch {
    return false; // V1 tokens don't implement ERC-165
  }
}

/** Compliance status from V2 (expiry, jurisdiction) if configured, otherwise V1. */
async function loadCompliance(address, provider) {
  if (CONTRACTS.COMPLIANCE_MANAGER_V2) {
    const cm = new ethers.Contract(CONTRACTS.COMPLIANCE_MANAGER_V2, CM_V2_ABI, provider);
    const [approved, blacklisted, inv] = await Promise.all([
      cm.isApproved(address), cm.isBlacklisted(address), cm.getInvestor(address),
    ]);
    const j = inv.jurisdiction === "0x0000" ? null : ethers.toUtf8String(inv.jurisdiction);
    return { version: "V2", approved, blacklisted, jurisdiction: j, expiresAt: Number(inv.expiresAt) || null };
  }
  const cm = new ethers.Contract(CONTRACTS.COMPLIANCE_MANAGER, ComplianceManagerABI.abi, provider);
  const [approved, blacklisted] = await Promise.all([cm.isApproved(address), cm.isBlacklisted(address)]);
  return { version: "V1", approved, blacklisted, jurisdiction: undefined, expiresAt: undefined };
}

export default function DashboardPage() {
  const { address, provider } = useWallet();
  const { addToast } = useToast();
  const [holdings, setHoldings] = useState([]);
  const [compliance, setCompliance] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address || !provider) return;
    let cancelled = false;

    const fetchPortfolio = async () => {
      try {
        loadCompliance(address, provider)
          .then((c) => !cancelled && setCompliance(c))
          .catch(() => !cancelled && setCompliance({ error: true }));

        let market = [];
        try {
          const mres = await fetchBackend("/api/assets");
          if (mres.ok) market = await mres.json();
        } catch {}

        const registry = new ethers.Contract(CONTRACTS.ASSET_REGISTRY, AssetRegistryABI.abi, provider);
        const assetIds = await registry.getAllAssetIds();
        const tokens = [];
        for (const id of assetIds) {
          try {
            const asset = await registry.getAsset(id);
            tokens.push({ assetId: Number(id), tokenAddress: asset.tokenContract, isActive: asset.isActive });
          } catch {}
        }
        if (CONTRACTS.TOKEN_V2) tokens.push({ assetId: null, tokenAddress: CONTRACTS.TOKEN_V2, isActive: true });

        const items = [];
        for (const t of tokens) {
          try {
            const token = new ethers.Contract(t.tokenAddress, TOKEN_ABI, provider);
            const balance = await token.balanceOf(address);
            if (balance === 0n) continue;
            const [symbol, name, decimals, isUrwa] = await Promise.all([
              token.symbol(), token.name(), token.decimals(), supportsErc7943(token),
            ]);
            const frozen = isUrwa ? await token.getFrozenTokens(address) : null;
            const balF = parseFloat(ethers.formatUnits(balance, decimals));
            const mData = t.assetId !== null ? market.find((m) => m.id === t.assetId) : null;
            const price = mData ? mData.currentPrice : 0;
            items.push({
              ...t, name, symbol, balance: balF, price, valueEth: balF * price, isUrwa,
              frozen: frozen === null ? null : Math.min(balF, parseFloat(ethers.formatUnits(frozen, decimals))),
            });
          } catch (err) {
            console.error(`Error reading token ${t.tokenAddress}:`, err);
          }
        }
        if (!cancelled) setHoldings(items.sort((a, b) => b.valueEth - a.valueEth));
      } catch {
        if (!cancelled) addToast("❌", "Error", "Failed to load portfolio.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchPortfolio();
    return () => {
      cancelled = true;
    };
  }, [address, provider, addToast]);

  const totalEth = holdings.reduce((sum, h) => sum + h.valueEth, 0);

  if (!address) {
    return (
      <div className="page-empty">
        <div className="page-empty-icon" aria-hidden="true">📊</div>
        <h2>Connect your wallet</h2>
        <p>Connect a Sepolia wallet to see your holdings and compliance status.</p>
      </div>
    );
  }

  const c = compliance;
  const fmtDate = (t) => new Date(t * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <h1 className="page-title">Portfolio</h1>
            <p className="page-subtitle">Your demo holdings and compliance status on Sepolia</p>
          </div>
        </div>
      </div>

      <section className="compliance-panel" aria-label="Compliance status">
        <div className="compliance-panel-head">
          <h2>Compliance status</h2>
          {c && !c.error && <span className="sim-tag">ComplianceManager {c.version}</span>}
        </div>
        {!c ? (
          <p className="loading-pulse">Reading from Sepolia…</p>
        ) : c.error ? (
          <p>Couldn&apos;t read compliance status from Sepolia.</p>
        ) : (
          <div className="compliance-grid">
            <div>
              <div className="stat-label">KYC approval</div>
              <span className={`badge ${c.approved ? "badge-verified" : "badge-warning"}`}>
                {c.approved ? "✓ Approved" : "Not approved"}
              </span>
              {!c.approved && <Link href="/marketplace" className="inline-link">Verify on the marketplace →</Link>}
            </div>
            <div>
              <div className="stat-label">Blacklist</div>
              <span className={`badge ${c.blacklisted ? "badge-danger" : "badge-verified"}`}>
                {c.blacklisted ? "Blacklisted" : "Not blacklisted"}
              </span>
            </div>
            <div>
              <div className="stat-label">Approval expires</div>
              <div className="compliance-value">
                {c.expiresAt === undefined ? <span className="muted">Not tracked by V1</span> : c.expiresAt ? fmtDate(c.expiresAt) : "—"}
              </div>
            </div>
            <div>
              <div className="stat-label">Jurisdiction</div>
              <div className="compliance-value">
                {c.jurisdiction === undefined ? <span className="muted">Not tracked by V1</span> : c.jurisdiction || "Not set"}
              </div>
            </div>
          </div>
        )}
        <p className="compliance-note">
          Tokens check this status on every transfer: you can only receive or send tokens while approved and not
          blacklisted. <Link href="/compliance" className="inline-link">How it works</Link>
        </p>
      </section>

      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-label">Portfolio value</div>
          <div className="stat-value" style={{ color: "var(--accent-green)" }}>
            {loading ? "..." : `${totalEth.toFixed(4)} ETH`}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Assets held</div>
          <div className="stat-value">{loading ? "..." : holdings.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Wallet</div>
          <div className="stat-value" style={{ fontSize: "0.95rem" }}>
            {address.substring(0, 8)}...{address.substring(36)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Network</div>
          <div className="stat-value">Sepolia</div>
        </div>
      </div>

      <div className="section-header">
        <h2 className="section-title">Your holdings</h2>
      </div>

      <div className="table-container">
        {loading ? (
          <div className="page-empty" style={{ padding: "3rem" }} role="status">
            <div className="loading-pulse" style={{ fontSize: "1.5rem" }} aria-hidden="true">⏳</div>
            <p>Loading your portfolio from the blockchain…</p>
          </div>
        ) : holdings.length === 0 ? (
          <div className="page-empty" style={{ padding: "3rem" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }} aria-hidden="true">📭</div>
            <p>You don&apos;t hold any assets yet.</p>
            <Link href="/marketplace"><button className="btn btn-primary" style={{ marginTop: "1rem" }}>Explore markets</button></Link>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Balance</th>
                <th>Frozen</th>
                <th>Price (ETH)</th>
                <th>Value (ETH)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.tokenAddress}>
                  <td>
                    <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      {h.name}
                      <span className="badge badge-active" style={{ background: "rgba(255,153,51,0.08)", color: "var(--saffron-dark)" }}>{h.symbol}</span>
                      {h.isUrwa && <span className="sim-tag">ERC-7943</span>}
                    </div>
                  </td>
                  <td><span style={{ fontWeight: 700, fontSize: "1.05rem" }}>{h.balance.toLocaleString()}</span></td>
                  <td title={h.isUrwa ? "Frozen by the issuer (ERC-7943 getFrozenTokens)" : "This token doesn't support partial freezing"}>
                    {h.frozen === null ? <span className="muted">n/a</span> : h.frozen > 0 ? <strong className="text-danger">{h.frozen.toLocaleString()}</strong> : "0"}
                  </td>
                  <td><span style={{ fontFamily: "'SF Mono', monospace" }}>{h.price > 0 ? h.price.toFixed(6) : "—"}</span></td>
                  <td>
                    <span style={{ fontWeight: 700, color: "var(--accent-green)", fontFamily: "'SF Mono', monospace" }}>
                      {h.valueEth > 0 ? h.valueEth.toFixed(4) : "—"}
                    </span>
                  </td>
                  <td>
                    {h.assetId !== null ? (
                      <Link href={`/trade/${h.assetId}`} style={{ textDecoration: "none" }}>
                        <button className="btn btn-small">Trade</button>
                      </Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
