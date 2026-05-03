import React from "react";
import Link from "next/link";

export default function HowItWorksPage() {
  return (
    <div className="hp-container">
      <section className="hp-section-header" style={{ marginTop: '4rem' }}>
        <span className="hp-section-sup">The Process</span>
        <h1 className="hp-section-title">How <span>BharatRWA</span> Works</h1>
        <p className="hp-section-desc">
          Tokenizing real-world assets is a complex legal and technical process. 
          We've simplified it into four easy steps.
        </p>
      </section>

      <section className="hp-features" style={{ marginTop: '4rem', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2rem' }}>
        <div className="hp-feature-card">
          <div className="hp-feature-icon">🔍</div>
          <h3 className="hp-feature-title">1. Asset Identification & Legal Structuring</h3>
          <p className="hp-feature-desc">
            We identify high-value real-world assets and create a legal SPV (Special Purpose Vehicle) 
            to hold the asset, ensuring clear ownership rights.
          </p>
        </div>
        <div className="hp-feature-card">
          <div className="hp-feature-icon">🏗️</div>
          <h3 className="hp-feature-title">2. Token Creation & Smart Contracts</h3>
          <p className="hp-feature-desc">
            Digital tokens are minted on the blockchain, each representing a fractional 
            share of the SPV. These tokens are governed by automated smart contracts.
          </p>
        </div>
        <div className="hp-feature-card">
          <div className="hp-feature-icon">👤</div>
          <h3 className="hp-feature-title">3. KYC & Investor Onboarding</h3>
          <p className="hp-feature-desc">
            Investors undergo a one-time KYC/AML verification process. Once approved, 
            they gain access to our institutional-grade marketplace.
          </p>
        </div>
        <div className="hp-feature-card">
          <div className="hp-feature-icon">💰</div>
          <h3 className="hp-feature-title">4. Investment & Asset Management</h3>
          <p className="hp-feature-desc">
            Investors can buy, sell, or trade fractional shares of assets. They earn 
            yields from rents, dividends, or price appreciation directly on-chain.
          </p>
        </div>
      </section>

      <section style={{ marginTop: '6rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '2.5rem', color: 'var(--navy)', marginBottom: '1.5rem' }}>Secured by Blockchain</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '800px', margin: '0 auto 3rem', lineHeight: '1.6' }}>
          By using decentralized ledger technology, we ensure that every share is verifiable, 
          immutable, and transferable 24/7 without the need for manual paperwork.
        </p>
        <Link href="/marketplace" className="hp-btn-primary" style={{ padding: '1.2rem 4rem' }}>Browse Assets</Link>
      </section>
    </div>
  );
}
