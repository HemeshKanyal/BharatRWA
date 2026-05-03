"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";
import { useToast } from "@/components/ToastProvider";
import dynamic from "next/dynamic";
import { ethers } from "ethers";
import { BACKEND_URL, CONTRACTS } from "@/config";
import ComplianceManagerABI from "@/abis/ComplianceManager.json";
import BharatRWATokenABI from "@/abis/BharatRWAToken.json";

const TradingChart = dynamic(() => import("@/components/TradingChart"), { ssr: false });

const DEPLOYER = "0x623B2a013d804253101A0b1679315c677427AFd1";

export default function TradePage() {
  const { id } = useParams();
  const { address, signer, provider } = useWallet();
  const { addToast } = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("buy");
  const [amount, setAmount] = useState("");
  const [executing, setExecuting] = useState(false);
  const [kycOk, setKycOk] = useState(false);
  const [userBalance, setUserBalance] = useState("0");

  // Fetch market data
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/market/${id}`);
      if (!res.ok) throw new Error("Not found");
      const d = await res.json();
      setData(d);
    } catch { }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); const iv = setInterval(fetchData, 10000); return () => clearInterval(iv); }, [fetchData]);

  // Check KYC + balance
  useEffect(() => {
    const check = async () => {
      if (!address || !provider || !data) return;
      try {
        const cm = new ethers.Contract(CONTRACTS.COMPLIANCE_MANAGER, ComplianceManagerABI.abi, provider);
        setKycOk(await cm.isApproved(address));
        const tok = new ethers.Contract(data.tokenAddress, BharatRWATokenABI.abi, provider);
        const bal = await tok.balanceOf(address);
        setUserBalance(ethers.formatEther(bal));
      } catch { }
    };
    check();
  }, [address, provider, data]);

  const ethCost = data && amount ? (parseFloat(amount) * data.currentPrice).toFixed(8) : "0";

  const handleBuy = async () => {
    if (!address || !signer) { addToast("🦊", "Connect Wallet", "Please connect MetaMask."); return; }
    if (!kycOk) { addToast("🔐", "KYC Required", "Complete KYC on the Marketplace first."); return; }
    if (!amount || parseFloat(amount) <= 0) return;

    try {
      setExecuting(true);
      const cost = parseFloat(amount) * data.currentPrice;

      // Step 1: Send ETH to deployer
      addToast("⏳", "Sending ETH", `Sending ${cost.toFixed(6)} ETH for ${amount} ${data.symbol}...`);
      const ethTx = await signer.sendTransaction({
        to: DEPLOYER,
        value: ethers.parseEther(cost.toFixed(8)),
      });
      await ethTx.wait(1);

      // Step 2: Tell backend to mint
      addToast("⏳", "Minting Tokens", "ETH received. Minting tokens...");
      const res = await fetch(`${BACKEND_URL}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, assetId: parseInt(id), amount: parseFloat(amount), txHash: ethTx.hash }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);

      addToast("🎉", "Buy Successful!", `Bought ${amount} ${data.symbol} @ ${data.currentPrice.toFixed(6)} ETH`);
      setAmount("");
      fetchData();

      // Refresh balance
      const tok = new ethers.Contract(data.tokenAddress, BharatRWATokenABI.abi, provider);
      setUserBalance(ethers.formatEther(await tok.balanceOf(address)));
    } catch (e) {
      addToast("❌", "Buy Failed", e.reason || e.message);
    } finally {
      setExecuting(false);
    }
  };

  const handleSell = async () => {
    if (!address || !signer) { addToast("🦊", "Connect Wallet", "Please connect MetaMask."); return; }
    if (!amount || parseFloat(amount) <= 0) return;
    if (parseFloat(amount) > parseFloat(userBalance)) { addToast("❌", "Insufficient Balance", `You only have ${parseFloat(userBalance).toFixed(2)} ${data.symbol}`); return; }

    try {
      setExecuting(true);
      const ethBack = (parseFloat(amount) * data.currentPrice).toFixed(6);

      // Step 1: Approve deployer to take tokens
      addToast("⏳", "Approving", `Approving ${amount} ${data.symbol} for sale...`);
      const tok = new ethers.Contract(data.tokenAddress, BharatRWATokenABI.abi, signer);
      const appTx = await tok.approve(DEPLOYER, ethers.parseEther(amount));
      await appTx.wait(1);

      // Step 2: Backend does transferFrom + sends ETH
      addToast("⏳", "Selling", `Selling ${amount} ${data.symbol} for ~${ethBack} ETH...`);
      const res = await fetch(`${BACKEND_URL}/sell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, assetId: parseInt(id), amount: parseFloat(amount) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);

      addToast("🎉", "Sell Successful!", `Sold ${amount} ${data.symbol} for ${d.ethReceived?.toFixed(6)} ETH`);
      setAmount("");
      fetchData();

      setUserBalance(ethers.formatEther(await tok.balanceOf(address)));
    } catch (e) {
      addToast("❌", "Sell Failed", e.reason || e.message);
    } finally {
      setExecuting(false);
    }
  };

  if (loading) return <div className="page-empty"><div className="loading-pulse" style={{ fontSize: "2rem" }}>⏳</div><p>Loading trading terminal...</p></div>;
  if (!data) return <div className="page-empty"><div style={{ fontSize: "2rem" }}>❌</div><h2>Asset Not Found</h2></div>;

  const isUp = data.change24h >= 0;

  return (
    <div className="trade-page">
      {/* Ticker Bar */}
      <div className="ticker-bar">
        <div className="ticker-main">
          <span className="ticker-symbol">{data.symbol}/ETH</span>
          <span className={`ticker-price ${isUp ? "price-up" : "price-down"}`}>{data.currentPrice.toFixed(6)}</span>
          <span className={`ticker-change ${isUp ? "price-up" : "price-down"}`}>{isUp ? "▲" : "▼"} {data.change24h.toFixed(2)}%</span>
        </div>
        <div className="ticker-stats">
          <div className="ticker-stat"><span className="ticker-stat-label">24h High</span><span>{data.high24h?.toFixed(6)}</span></div>
          <div className="ticker-stat"><span className="ticker-stat-label">24h Low</span><span>{data.low24h?.toFixed(6)}</span></div>
          <div className="ticker-stat"><span className="ticker-stat-label">24h Volume</span><span>{data.volume24h?.toLocaleString()}</span></div>
          <div className="ticker-stat"><span className="ticker-stat-label">Market Cap</span><span>{data.marketCap?.toFixed(2)} ETH</span></div>
        </div>
      </div>

      <div className="trade-layout">
        {/* Chart + Order Book */}
        <div className="trade-left">
          <TradingChart candles={data.candles} currentPrice={data.currentPrice} symbol={data.symbol} />

          {/* Order Book */}
          <div className="orderbook">
            <h3 className="orderbook-title">Order Book</h3>
            <div className="orderbook-grid">
              <div className="orderbook-side">
                <div className="orderbook-header"><span>Price (ETH)</span><span>Amount</span></div>
                {data.orderBook?.bids?.map((b, i) => (
                  <div key={`b${i}`} className="orderbook-row bid-row">
                    <span className="price-up">{b.price.toFixed(6)}</span>
                    <span>{b.amount}</span>
                    <div className="orderbook-bar bid-bar" style={{ width: `${Math.min(100, b.amount / 3)}%` }} />
                  </div>
                ))}
              </div>
              <div className="orderbook-side">
                <div className="orderbook-header"><span>Price (ETH)</span><span>Amount</span></div>
                {data.orderBook?.asks?.map((a, i) => (
                  <div key={`a${i}`} className="orderbook-row ask-row">
                    <span className="price-down">{a.price.toFixed(6)}</span>
                    <span>{a.amount}</span>
                    <div className="orderbook-bar ask-bar" style={{ width: `${Math.min(100, a.amount / 3)}%` }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Trade Form + Recent Trades */}
        <div className="trade-right">
          <div className="trade-form-card">
            <div className="trade-tabs">
              <button className={`trade-tab ${tab === "buy" ? "trade-tab-buy" : ""}`} onClick={() => setTab("buy")}>Buy</button>
              <button className={`trade-tab ${tab === "sell" ? "trade-tab-sell" : ""}`} onClick={() => setTab("sell")}>Sell</button>
            </div>

            <div className="trade-form-body">
              <div className="trade-price-display">
                <span className="trade-price-label">Price</span>
                <span className="trade-price-value">{data.currentPrice.toFixed(6)} ETH</span>
              </div>

              <div className="form-group">
                <label className="form-label">Amount ({data.symbol})</label>
                <input className="form-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" min="0" step="1" />
              </div>

              {tab === "sell" && (
                <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>
                  Balance: <strong style={{ color: "var(--text-primary)" }}>{parseFloat(userBalance).toFixed(2)}</strong> {data.symbol}
                  <button style={{ marginLeft: "0.5rem", color: "var(--saffron)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.75rem" }}
                    onClick={() => setAmount(Math.floor(parseFloat(userBalance)).toString())}>MAX</button>
                </div>
              )}

              <div className="trade-summary">
                <div className="trade-summary-row">
                  <span>{tab === "buy" ? "Total Cost" : "You Receive"}</span>
                  <span style={{ fontWeight: 700 }}>{ethCost} ETH</span>
                </div>
              </div>

              <button
                className={`btn btn-full ${tab === "buy" ? "btn-buy" : "btn-sell"}`}
                onClick={tab === "buy" ? handleBuy : handleSell}
                disabled={executing || !amount || parseFloat(amount) <= 0}
              >
                {executing ? "Processing..." : tab === "buy" ? `Buy ${data.symbol}` : `Sell ${data.symbol}`}
              </button>

              {!kycOk && address && (
                <p style={{ fontSize: "0.75rem", color: "var(--accent-red)", marginTop: "0.5rem", textAlign: "center" }}>
                  ⚠ Complete KYC on the Marketplace to trade
                </p>
              )}
            </div>
          </div>

          {/* Recent Trades */}
          <div className="recent-trades">
            <h3 className="recent-trades-title">Recent Trades</h3>
            <div className="recent-trades-header">
              <span>Price</span><span>Amount</span><span>Side</span>
            </div>
            <div className="recent-trades-list">
              {data.trades?.length === 0 && <div style={{ padding: "1rem", color: "var(--text-tertiary)", textAlign: "center", fontSize: "0.8rem" }}>No trades yet</div>}
              {data.trades?.map((t, i) => (
                <div key={i} className="recent-trade-row">
                  <span className={t.side === "buy" ? "price-up" : "price-down"}>{t.price.toFixed(6)}</span>
                  <span>{t.amount}</span>
                  <span className={`trade-side-badge ${t.side}`}>{t.side.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
