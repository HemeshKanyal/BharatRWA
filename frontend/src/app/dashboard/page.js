"use client";

import React, { useState, useEffect } from "react";
import { useWallet } from "@/components/WalletProvider";
import { useToast } from "@/components/ToastProvider";
import { ethers } from "ethers";
import AssetRegistryABI from "@/abis/AssetRegistry.json";
import BharatRWATokenABI from "@/abis/BharatRWAToken.json";
import ComplianceManagerABI from "@/abis/ComplianceManager.json";
import { CONTRACTS, BACKEND_URL } from "@/config";
import Link from "next/link";

export default function DashboardPage() {
  const { address, provider } = useWallet();
  const { addToast } = useToast();
  const [holdings, setHoldings] = useState([]);
  const [kycStatus, setKycStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPortfolio = async () => {
      if (!address || !provider) { setLoading(false); return; }
      try {
        setLoading(true);

        const cm = new ethers.Contract(CONTRACTS.COMPLIANCE_MANAGER, ComplianceManagerABI.abi, provider);
        setKycStatus(await cm.isApproved(address));

        // Get market data for prices
        let market = [];
        try {
          const mres = await fetch(`${BACKEND_URL}/api/assets`);
          if (mres.ok) market = await mres.json();
        } catch {}

        const registry = new ethers.Contract(CONTRACTS.ASSET_REGISTRY, AssetRegistryABI.abi, provider);
        const assetIds = await registry.getAllAssetIds();
        const portfolioItems = [];

        for (const id of assetIds) {
          try {
            const asset = await registry.getAsset(id);
            const tokenAddr = asset.tokenContract;

            const token = new ethers.Contract(tokenAddr, BharatRWATokenABI.abi, provider);
            const balance = await token.balanceOf(address);
            if (balance === 0n) continue;

            const symbol = await token.symbol();
            const name = await token.name();
            const decimals = await token.decimals();

            const balF = parseFloat(ethers.formatUnits(balance, decimals));
            const mData = market.find(m => m.id === Number(id));
            const price = mData ? mData.currentPrice : 0;

            portfolioItems.push({
              assetId: Number(id),
              name, symbol, tokenAddress: tokenAddr,
              balance: balF,
              valueEth: balF * price,
              price: price,
              isActive: asset.isActive,
            });
          } catch (err) {
            console.error(`Error asset ${id}:`, err);
          }
        }
        setHoldings(portfolioItems.sort((a, b) => b.valueEth - a.valueEth));
      } catch (err) {
        addToast("❌", "Error", "Failed to load portfolio.");
      } finally {
        setLoading(false);
      }
    };
    fetchPortfolio();
  }, [address, provider, addToast]);

  const totalEth = holdings.reduce((sum, h) => sum + h.valueEth, 0);

  if (!address) {
    return (
      <div className="page-empty">
        <div className="page-empty-icon">📊</div>
        <h2>Connect Your Wallet</h2>
        <p>Connect your MetaMask wallet to view your portfolio.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <h1 className="page-title">Portfolio</h1>
            <p className="page-subtitle">Your tokenized real-world asset holdings on Sepolia</p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <span className={`badge ${kycStatus ? "badge-verified" : "badge-warning"}`}>
              {kycStatus === null ? "..." : kycStatus ? "✓ KYC Verified" : "⚠ KYC Required"}
            </span>
          </div>
        </div>
      </div>

      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-label">Total Portfolio Value</div>
          <div className="stat-value" style={{ color: "var(--accent-green)" }}>
            {loading ? "..." : `${totalEth.toFixed(4)} ETH`}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Assets Held</div>
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
        <h2 className="section-title">Your Holdings</h2>
      </div>

      <div className="table-container">
        {loading ? (
          <div className="page-empty" style={{ padding: "3rem" }}>
            <div className="loading-pulse" style={{ fontSize: "1.5rem" }}>⏳</div>
            <p>Loading your portfolio from the blockchain...</p>
          </div>
        ) : holdings.length === 0 ? (
          <div className="page-empty" style={{ padding: "3rem" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📭</div>
            <p>You don't hold any assets yet. Visit the Marketplace to start trading.</p>
            <Link href="/"><button className="btn btn-primary" style={{ marginTop: "1rem" }}>Explore Markets</button></Link>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Balance</th>
                <th>Price (ETH)</th>
                <th>Value (ETH)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.assetId}>
                  <td>
                    <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {h.name}
                      <span className="badge badge-active" style={{ background: "rgba(255,153,51,0.08)", color: "var(--saffron-dark)" }}>{h.symbol}</span>
                    </div>
                  </td>
                  <td><span style={{ fontWeight: 700, fontSize: "1.05rem" }}>{h.balance.toLocaleString()}</span></td>
                  <td><span style={{ fontFamily: "'SF Mono', monospace" }}>{h.price > 0 ? h.price.toFixed(6) : "—"}</span></td>
                  <td>
                    <span style={{ fontWeight: 700, color: "var(--accent-green)", fontFamily: "'SF Mono', monospace" }}>
                      {h.valueEth > 0 ? h.valueEth.toFixed(4) : "—"}
                    </span>
                  </td>
                  <td>
                    <Link href={`/trade/${h.assetId}`} style={{ textDecoration: 'none' }}>
                      <button className="btn" style={{ padding: "0.3rem 0.8rem", fontSize: "0.75rem", background: "white", border: "1px solid var(--border-light)", color: "var(--navy)" }}>
                        Trade
                      </button>
                    </Link>
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
