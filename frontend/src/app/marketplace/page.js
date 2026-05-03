"use client";

import React, { useState, useEffect } from "react";
import { useWallet } from "@/components/WalletProvider";
import { KycModal } from "@/components/KycModal";
import { useToast } from "@/components/ToastProvider";
import { ethers } from "ethers";
import ComplianceManagerABI from "@/abis/ComplianceManager.json";
import { CONTRACTS, BACKEND_URL } from "@/config";
import Link from "next/link";

function getAssetMeta(name) {
  const n = name.toLowerCase();
  if (n.includes("gold") || n.includes("silver") || n.includes("oil") || n.includes("copper") || n.includes("metal") || n.includes("gas") || n.includes("platinum")) {
    return { icon: "🪙", cls: "asset-icon-gold", sector: "Commodities" };
  }
  if (n.includes("land") || n.includes("agri") || n.includes("farm") || n.includes("forestry") || n.includes("wood") || n.includes("carbon")) {
    return { icon: "🌾", cls: "asset-icon-land", sector: "Sustainability & Agri" };
  }
  if (n.includes("tech") || n.includes("fund") || n.includes("equity") || n.includes("series") || n.includes("edtech") || n.includes("growth")) {
    return { icon: "🚀", cls: "asset-icon-pe", sector: "Private Equity" };
  }
  if (n.includes("art") || n.includes("collection")) {
    return { icon: "🎨", cls: "asset-icon-art", sector: "Exotic Assets" };
  }
  return { icon: "🏢", cls: "asset-icon-property", sector: "Real Estate" };
}

export default function MarketplacePage() {
  const { address, provider, signer } = useWallet();
  const { addToast } = useToast();
  const [isKycOpen, setIsKycOpen] = useState(false);
  const [kycVerified, setKycVerified] = useState(false);
  const [isCheckingKyc, setIsCheckingKyc] = useState(false);
  const [assets, setAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(true);

  // Fetch on-chain KYC status
  useEffect(() => {
    const checkKyc = async () => {
      if (!address || !provider) return;
      setIsCheckingKyc(true);
      try {
        const cm = new ethers.Contract(CONTRACTS.COMPLIANCE_MANAGER, ComplianceManagerABI.abi, provider);
        const approved = await cm.isApproved(address);
        setKycVerified(approved);
      } catch (e) {
        console.error("KYC check failed:", e);
      } finally {
        setIsCheckingKyc(false);
      }
    };
    checkKyc();
  }, [address, provider]);

  // Fetch from new backend API
  useEffect(() => {
    const fetchAssets = async () => {
      try {
        setLoadingAssets(true);
        const res = await fetch(`${BACKEND_URL}/api/assets`);
        if (!res.ok) throw new Error("Failed to fetch assets");
        const data = await res.json();
        
        const activeAssets = data.filter(a => a.isActive);
        setAssets(activeAssets.map(a => ({
          ...a,
          priceStr: a.currentPrice ? `${a.currentPrice.toFixed(6)} ETH` : "—",
          supplyStr: Number(a.totalSupply).toLocaleString(),
          ...getAssetMeta(a.name)
        })));
      } catch (err) {
        console.error("Failed to fetch assets:", err);
      } finally {
        setLoadingAssets(false);
      }
    };
    fetchAssets();
    const interval = setInterval(fetchAssets, 10000); // Auto-refresh prices
    return () => clearInterval(interval);
  }, []);

  const handleKycVerified = async (proof, publicInputs) => {
    if (!signer) return;
    try {
      const cm = new ethers.Contract(CONTRACTS.COMPLIANCE_MANAGER, ComplianceManagerABI.abi, signer);
      addToast("⏳", "Submitting Proof", "Sending ZK proof on-chain...");
      const tx = await cm.verifyAndApprove(proof, publicInputs);
      addToast("⏳", "Confirming", `Tx: ${tx.hash.substring(0, 16)}...`);
      await tx.wait();
      setKycVerified(true);
      setIsKycOpen(false);
      addToast("✅", "KYC Verified!", "You can now trade assets.");
    } catch (err) {
      addToast("❌", "Verification Failed", err.reason || err.message);
    }
  };

  return (
    <>
      {/* KYC Status Bar */}
      {address && (
        <div className="page-status-bar">
          <div className="page-status-inner">
            {isCheckingKyc ? (
              <span className="badge badge-warning loading-pulse">Checking KYC...</span>
            ) : kycVerified ? (
              <span className="badge badge-verified">✓ KYC Verified</span>
            ) : (
              <span className="badge badge-warning" onClick={() => setIsKycOpen(true)} style={{ cursor: 'pointer' }}>
                ⚠ Complete KYC to Trade
              </span>
            )}
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-eyebrow">🔗 Powered by Zero-Knowledge Proofs</div>
          <h1 className="hero-title">Trade <span>Real World Assets</span> with Confidence</h1>
          <p className="hero-description">
            Tokenized gold, real estate, and commodities — verified with
            privacy-preserving KYC and secured on Ethereum.
          </p>
        </div>
      </section>

      {/* Stats */}
      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-label">Listed Assets</div>
          <div className="stat-value">{loadingAssets ? "..." : assets.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total 24h Vol</div>
          <div className="stat-value">{loadingAssets ? "..." : assets.reduce((sum, a) => sum + a.volume24h, 0).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Network</div>
          <div className="stat-value">Sepolia</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Protocol</div>
          <div className="stat-value">UltraHonk</div>
        </div>
      </div>

      {/* Assets */}
      <div className="section-header">
        <h2 className="section-title">Markets</h2>
      </div>

      <div className="asset-grid">
        {loadingAssets && assets.length === 0 ? (
          <div className="asset-card" style={{ textAlign: "center", padding: "3rem" }}>
            <div className="loading-pulse" style={{ fontSize: "1.5rem" }}>⏳</div>
            <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem" }}>Loading market data...</p>
          </div>
        ) : assets.length === 0 ? (
          <div className="asset-card" style={{ textAlign: "center", padding: "3rem" }}>
            <p style={{ color: "var(--text-secondary)" }}>No assets registered yet. Use the Admin panel to register one.</p>
          </div>
        ) : (
          assets.map((asset) => (
            <div key={asset.id} className="asset-card">
              <div className="asset-card-header">
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div className={`asset-icon ${asset.cls}`}>
                    {asset.imageUrl ? (
                      <img src={asset.imageUrl} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                    ) : (
                      asset.icon
                    )}
                  </div>
                  <div>
                    <div className="asset-name">{asset.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontWeight: 500 }}>{asset.symbol}/ETH</span>
                      <span className="badge" style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', background: 'rgba(0,0,0,0.05)', color: 'var(--text-secondary)' }}>{asset.sector}</span>
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>{asset.currentPrice.toFixed(6)}</div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: asset.change24h >= 0 ? '#26a69a' : '#ef5350' }}>
                    {asset.change24h >= 0 ? '▲' : '▼'} {Math.abs(asset.change24h).toFixed(2)}%
                  </div>
                </div>
              </div>
              <div className="asset-details">
                <div className="asset-detail-item">
                  <span className="asset-detail-label">24h Vol</span>
                  <span className="asset-detail-value">{asset.volume24h.toLocaleString()}</span>
                </div>
                <div className="asset-detail-item">
                  <span className="asset-detail-label">Market Cap</span>
                  <span className="asset-detail-value">{asset.marketCap.toFixed(2)} ETH</span>
                </div>
                <div className="asset-detail-item">
                  <span className="asset-detail-label">Supply</span>
                  <span className="asset-detail-value">{asset.supplyStr}</span>
                </div>
              </div>
              <div className="asset-card-footer">
                <Link href={`/trade/${asset.id}`} style={{ textDecoration: 'none' }}>
                  <button
                    className="btn btn-primary btn-full"
                    disabled={!asset.isActive}
                    style={{ opacity: asset.isActive ? 1 : 0.4 }}
                  >
                    {asset.isActive ? "Trade Now" : "Trading Halted"}
                  </button>
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      <KycModal isOpen={isKycOpen} onClose={() => setIsKycOpen(false)} onVerified={handleKycVerified} />
    </>
  );
}
