"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";
import { useToast } from "@/components/ToastProvider";
import dynamic from "next/dynamic";
import { ethers } from "ethers";
import { CONTRACTS, sepoliaExplorer } from "@/config";
import { fetchBackend, getBackendConfig } from "@/utils/chain";
import ComplianceManagerABI from "@/abis/ComplianceManager.json";
import BharatRWATokenABI from "@/abis/BharatRWAToken.json";

const TradingChart = dynamic(() => import("@/components/TradingChart"), { ssr: false });

async function postSettlement(path, body) {
  const res = await fetchBackend(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `Settlement failed (${res.status})`);
  return d;
}

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
  const [exchange, setExchange] = useState(null); // backend config: { deployer }
  const [exchangeError, setExchangeError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // A payment/transfer that went through on-chain but whose settlement call failed.
  const [pending, setPending] = useState(null); // { kind: "buy" | "sell", txHash, amount }

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Market data (every 10s) and exchange config
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetchBackend(`/api/market/${id}`);
        if (!res.ok) throw new Error("Not found");
        const d = await res.json();
        if (!cancelled) setData(d);
      } catch {
        // keep the last data; the empty state handles a missing asset
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 10000);
    getBackendConfig()
      .then((c) => !cancelled && setExchange(c))
      .catch(() => !cancelled && setExchangeError(true));
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [id, refreshKey]);

  // KYC status + balance
  useEffect(() => {
    if (!address || !provider || !data) return;
    let cancelled = false;
    (async () => {
      try {
        const cm = new ethers.Contract(CONTRACTS.COMPLIANCE_MANAGER, ComplianceManagerABI.abi, provider);
        const tok = new ethers.Contract(data.tokenAddress, BharatRWATokenABI.abi, provider);
        const [ok, bal] = await Promise.all([cm.isApproved(address), tok.balanceOf(address)]);
        if (!cancelled) {
          setKycOk(ok);
          setUserBalance(ethers.formatEther(bal));
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [address, provider, data]);

  const ethCost = data && amount ? (parseFloat(amount) * data.currentPrice).toFixed(8) : "0";

  const settle = async (p) => {
    const body = { walletAddress: address, assetId: parseInt(id), txHash: p.txHash };
    if (p.kind === "buy") body.amount = p.amount;
    const d = await postSettlement(p.kind === "buy" ? "/buy" : "/sell", body);
    setPending(null);
    setAmount("");
    refresh();
    return d;
  };

  const guard = () => {
    if (!address || !signer) { addToast("🦊", "Connect Wallet", "Please connect MetaMask."); return false; }
    if (!exchange) { addToast("⚠️", "Exchange unavailable", "Couldn't load the exchange address from the backend."); return false; }
    if (!amount || parseFloat(amount) <= 0) return false;
    return true;
  };

  const handleBuy = async () => {
    if (!guard()) return;
    if (!kycOk) { addToast("🔐", "KYC Required", "Complete KYC on the Marketplace first."); return; }
    const qty = parseFloat(amount);
    let p;
    try {
      setExecuting(true);
      const cost = qty * data.currentPrice;
      addToast("⏳", "Sending ETH", `Paying ${cost.toFixed(6)} test ETH for ${qty} ${data.symbol}…`);
      const ethTx = await signer.sendTransaction({ to: exchange.deployer, value: ethers.parseEther(cost.toFixed(18)) });
      await ethTx.wait(1);
      p = { kind: "buy", txHash: ethTx.hash, amount: qty };
      setPending(p);
      addToast("⏳", "Minting", "Payment confirmed. Minting your tokens…");
      await settle(p);
      addToast("🎉", "Buy successful", `Bought ${qty} ${data.symbol}`);
    } catch (e) {
      addToast("❌", "Buy failed", e.reason || e.shortMessage || e.message);
    } finally {
      setExecuting(false);
    }
  };

  const handleSell = async () => {
    if (!guard()) return;
    const qty = parseFloat(amount);
    if (qty > parseFloat(userBalance)) { addToast("❌", "Insufficient Balance", `You only have ${parseFloat(userBalance).toFixed(2)} ${data.symbol}`); return; }
    try {
      setExecuting(true);
      addToast("⏳", "Transferring", `Sending ${qty} ${data.symbol} to the exchange…`);
      const tok = new ethers.Contract(data.tokenAddress, BharatRWATokenABI.abi, signer);
      const tx = await tok.transfer(exchange.deployer, ethers.parseEther(amount));
      await tx.wait(1);
      const p = { kind: "sell", txHash: tx.hash, amount: qty };
      setPending(p);
      addToast("⏳", "Settling", "Transfer confirmed. Sending your test ETH…");
      const d = await settle(p);
      addToast("🎉", "Sell successful", `Sold ${qty} ${data.symbol} for ${d.ethReceived?.toFixed(6)} ETH`);
    } catch (e) {
      addToast("❌", "Sell failed", e.reason || e.shortMessage || e.message);
    } finally {
      setExecuting(false);
    }
  };

  const retryPending = async () => {
    try {
      setExecuting(true);
      await settle(pending);
      addToast("🎉", "Settled", "Your trade has been completed.");
    } catch (e) {
      addToast("❌", "Still failing", e.message);
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
            <h3 className="orderbook-title">Order book <span className="sim-tag">simulated</span></h3>
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
                disabled={executing || !exchange || !!pending || !amount || parseFloat(amount) <= 0}
              >
                {executing ? "Processing..." : tab === "buy" ? `Buy ${data.symbol}` : `Sell ${data.symbol}`}
              </button>

              {pending && (
                <div className="alert alert-error" role="alert" style={{ marginTop: "0.75rem" }}>
                  Your {pending.kind === "buy" ? "payment" : "token transfer"} went through on-chain
                  (<a href={sepoliaExplorer("tx", pending.txHash)} target="_blank" rel="noopener noreferrer">view</a>)
                  but settlement failed. You can retry for 30 minutes.
                  <button className="btn btn-primary btn-full" style={{ marginTop: "0.5rem" }} onClick={retryPending} disabled={executing}>
                    Retry settlement
                  </button>
                </div>
              )}

              {exchangeError && (
                <p className="form-hint form-hint-error">Couldn&apos;t load the exchange address from the backend; trading is disabled.</p>
              )}

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
