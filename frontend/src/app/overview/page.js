import React from "react";
import Link from "next/link";
import Image from "next/image";
import LiveStats from "@/components/LiveStats";
import SiteFooter from "@/components/SiteFooter";

export const metadata = { title: "Overview" };

const ASSET_CLASSES = [
  { icon: "/B-RWA-assets/RealEstate.png", title: "Real estate", desc: "Example property listings, each with its own capped ERC-20 token registered in the AssetRegistry." },
  { icon: "/B-RWA-assets/Commodities.png", title: "Commodities", desc: "Gold and silver demo tokens priced from public market feeds (PAXG, silver) converted to ETH." },
  { icon: "/B-RWA-assets/PrivateEquity.png", title: "Private equity", desc: "Example fund and startup listings that show how restricted securities could be represented." },
  { emoji: "🌾", title: "Agriculture & other", desc: "Any asset a custodian registers gets a token with the same compliance rules." },
];

export default function OverviewPage() {
  return (
    <div className="hp-container">
      <section className="hp-section-header page-intro">
        <span className="hp-section-sup">Overview</span>
        <h1 className="hp-section-title">The <span>BharatRWA</span> testnet</h1>
        <p className="hp-section-desc">
          Live numbers from the demo deployment. Listings are examples registered on Sepolia; they are not backed by real assets.
        </p>
      </section>

      <div className="overview-stats"><LiveStats /></div>

      <div className="split-2 overview-split">
        <div className="info-card">
          <h2>What you can do</h2>
          <ul className="check-list">
            <li>Verify with a zero-knowledge proof (age 18+, demo inputs)</li>
            <li>Buy and sell demo tokens with Sepolia test ETH</li>
            <li>Check whether any transfer would pass the compliance rules</li>
            <li>Inspect the Solana devnet mint and its transfer hook</li>
          </ul>
        </div>
        <div className="info-card info-card-accent">
          <h2>Try the demo</h2>
          <p>You need a wallet on Sepolia and some free test ETH from a Sepolia faucet.</p>
          <Link href="/marketplace" className="hp-btn-secondary info-card-btn">Go to marketplace →</Link>
        </div>
      </div>

      <section className="overview-classes">
        <h2 className="section-heading-center">Demo asset classes</h2>
        <div className="hp-features">
          {ASSET_CLASSES.map((c) => (
            <div className="hp-feature-card" key={c.title}>
              <div className="hp-feature-icon" aria-hidden="true">
                {c.icon ? <Image src={c.icon} alt="" width={32} height={32} style={{ objectFit: "contain" }} /> : c.emoji}
              </div>
              <h3 className="hp-feature-title">{c.title}</h3>
              <p className="hp-feature-desc">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
