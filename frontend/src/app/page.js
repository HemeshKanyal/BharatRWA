import React from "react";
import Link from "next/link";
import Image from "next/image";
import LiveStats from "@/components/LiveStats";
import SiteFooter from "@/components/SiteFooter";

export default function HomePage() {
  return (
    <div className="hp-container">
      {/* Hero Section */}
      <section className="hp-hero">
        <div className="hp-hero-content">
          <div className="hp-hero-badge">
            <span className="hp-hero-badge-icon">✦</span>
            Open source · Testnet prototype
          </div>
          <h1 className="hp-title">
            Tokenize.<br />
            Transact.<br />
            <span className="hp-title-gradient">Transform.</span>
          </h1>
          <p className="hp-subtitle">
            BharatRWA issues real-world-asset tokens that only verified investors can hold. Investors prove
            eligibility with a zero-knowledge proof, and the token enforces the rules on every transfer, on
            Ethereum and Solana.
          </p>
          <div className="hp-hero-actions">
            <Link href="/marketplace" className="hp-btn-primary">
              Explore marketplace →
            </Link>
            <Link href="/compliance" className="hp-btn-secondary">
              How compliance works
            </Link>
          </div>
        </div>

        <div className="hp-hero-graphic">
          <div className="hp-graphic-glow"></div>
          <div className="hp-graphic-img-wrapper" style={{ maskImage: 'radial-gradient(circle, black 50%, transparent 80%)', WebkitMaskImage: 'radial-gradient(circle, black 50%, transparent 80%)' }}>
            <Image
              src="/hero-glass-city.png"
              alt=""
              width={800}
              height={800}
              style={{ objectFit: 'contain' }}
              priority
            />
          </div>

          <div className="hp-floating-card" style={{ top: "15%", right: "8%" }}>
            <div className="hp-floating-icon">
              <Image src="/B-RWA-assets/RealEstate.png" alt="Real Estate" width={24} height={24} style={{ objectFit: 'contain' }} />
            </div>
            <div className="hp-floating-text">
              <h4>Real Estate</h4>
              <p>Tokenize</p>
            </div>
          </div>

          <div className="hp-floating-card" style={{ top: "40%", right: "2%" }}>
            <div className="hp-floating-icon">
              <Image src="/B-RWA-assets/PrivateEquity.png" alt="Private Equity" width={24} height={24} style={{ objectFit: 'contain' }} />
            </div>
            <div className="hp-floating-text">
              <h4>Private Equity</h4>
              <p>Tokenize</p>
            </div>
          </div>

          <div className="hp-floating-card" style={{ top: "65%", right: "12%" }}>
            <div className="hp-floating-icon">
              <Image src="/B-RWA-assets/Commodities.png" alt="Commodities" width={24} height={24} style={{ objectFit: 'contain' }} />
            </div>
            <div className="hp-floating-text">
              <h4>Commodities</h4>
              <p>Tokenize</p>
            </div>
          </div>
        </div>
      </section>

      {/* Live stats */}
      <LiveStats />

      {/* Features Section */}
      <section style={{ position: 'relative', overflow: 'hidden', padding: '6rem 0' }}>
        {/* Ambient Glows for Glassmorphism */}
        <div style={{ position: 'absolute', top: '20%', left: '10%', width: '300px', height: '300px', background: 'var(--primary)', filter: 'blur(150px)', opacity: 0.1, zIndex: 0 }}></div>
        <div style={{ position: 'absolute', bottom: '10%', right: '5%', width: '400px', height: '400px', background: 'var(--accent-purple)', filter: 'blur(180px)', opacity: 0.08, zIndex: 0 }}></div>
        
        <div className="hp-section-header" style={{ position: 'relative', zIndex: 1 }}>
          <span className="hp-section-sup">What&apos;s built</span>
          <h2 className="hp-section-title">
            Compliance enforced<br />
            by the <span>token itself.</span>
          </h2>
          <p className="hp-section-desc">
            Eligibility rules live in the token and its compliance contracts, so a transfer to an unverified
            wallet fails on-chain instead of relying on the app to block it.
          </p>
        </div>

        <div className="hp-features" style={{ position: 'relative', zIndex: 1 }}>
          <div className="hp-feature-card">
            <div className="hp-feature-icon" aria-hidden="true">🔐</div>
            <h3 className="hp-feature-title">Zero-knowledge KYC</h3>
            <p className="hp-feature-desc">Prove you are 18+, KYC-verified and not sanctioned without revealing who you are. Noir circuits, UltraHonk proofs.</p>
          </div>
          <div className="hp-feature-card">
            <div className="hp-feature-icon" aria-hidden="true">⚖️</div>
            <h3 className="hp-feature-title">ERC-7943 on Ethereum</h3>
            <p className="hp-feature-desc">canSend, canReceive and canTransfer checks on every transfer, partial freezes, and role-gated forced transfers for legal recovery.</p>
          </div>
          <div className="hp-feature-card">
            <div className="hp-feature-icon" aria-hidden="true">◎</div>
            <h3 className="hp-feature-title">Token-2022 on Solana</h3>
            <p className="hp-feature-desc">A transfer hook checks an on-chain allowlist, new accounts start frozen until approved, and a permanent delegate handles recovery.</p>
          </div>
          <div className="hp-feature-card">
            <div className="hp-feature-icon" aria-hidden="true">🧪</div>
            <h3 className="hp-feature-title">Open and tested</h3>
            <p className="hp-feature-desc">Contracts, programs and backend are open source, with 200+ automated tests including real ZK proofs verified on-chain.</p>
          </div>
        </div>
      </section>

      {/* Built with */}
      <section className="hp-trust-container">
        <div className="hp-trust-glass">
          <div className="hp-trust-col">
            <div className="hp-trust-title">Built with</div>
            <div className="hp-logos">
              {["Noir", "Barretenberg", "Foundry", "OpenZeppelin", "Anchor", "Next.js"].map((t) => (
                <span key={t} className="hp-logo-text">{t}</span>
              ))}
            </div>
          </div>

          <div className="hp-trust-divider"></div>

          <div className="hp-trust-col">
            <div className="hp-trust-title hp-trust-title-right">Standards implemented</div>
            <div className="hp-badges">
              {["ERC-20", "ERC-7943", "ERC-165", "SPL Token-2022"].map((t) => (
                <div key={t} className="hp-badge"><span>{t}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="hp-cta">
        <div className="hp-cta-left">
          <div style={{ width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Image src="/BharatRWA-logo.png" alt="" width={80} height={80} style={{ objectFit: 'contain' }} />
          </div>
          <div>
            <h2 className="hp-cta-title">See it working on testnet</h2>
            <p className="hp-cta-desc">Connect a Sepolia wallet, verify with a ZK proof and trade demo assets, or inspect the Solana devnet deployment.</p>
          </div>
        </div>
        <div className="hp-cta-btn">
          <Link href="/marketplace" className="hp-btn-primary" style={{ padding: "1.2rem 3rem", fontSize: "1.1rem" }}>
            Launch App →
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
