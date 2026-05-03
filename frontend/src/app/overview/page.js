import React from "react";
import Link from "next/link";
import Image from "next/image";

export default function OverviewPage() {
  return (
    <div className="hp-container">
      <section className="hp-section-header" style={{ marginTop: '4rem' }}>
        <span className="hp-section-sup">Ecosystem Overview</span>
        <h1 className="hp-section-title">The <span>BharatRWA</span> Marketplace</h1>
        <p className="hp-section-desc">
          Get a bird's eye view of our growing ecosystem of tokenized real-world assets.
        </p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem', marginTop: '4rem' }}>
        <div style={{ background: 'white', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-xl)', padding: '2.5rem', boxShadow: 'var(--shadow-md)' }}>
          <h2 style={{ fontSize: '1.5rem', color: 'var(--navy)', marginBottom: '1.5rem' }}>Market Statistics</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div style={{ padding: '1.5rem', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Market Cap</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.5rem' }}>$42.5M</div>
            </div>
            <div style={{ padding: '1.5rem', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>24h Volume</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-green)', marginTop: '0.5rem' }}>$1.2M</div>
            </div>
            <div style={{ padding: '1.5rem', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Users</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--navy)', marginTop: '0.5rem' }}>12.4k</div>
            </div>
            <div style={{ padding: '1.5rem', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Listings</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary-light)', marginTop: '0.5rem' }}>84</div>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--primary-gradient)', borderRadius: 'var(--radius-xl)', padding: '2.5rem', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '1.5rem' }}>Start Trading Today</h2>
          <p style={{ opacity: 0.9, lineHeight: 1.6, marginBottom: '2rem' }}>
            Access exclusive real estate, precious metals, and private equity deals. 
            Connect your wallet and start building your on-chain portfolio.
          </p>
          <Link href="/marketplace" className="hp-btn-secondary" style={{ width: 'fit-content', background: 'white', border: 'none', color: 'var(--primary)' }}>
            Go to Marketplace →
          </Link>
        </div>
      </div>

      <section style={{ marginTop: '6rem' }}>
        <h2 style={{ fontSize: '2rem', color: 'var(--navy)', marginBottom: '2.5rem', textAlign: 'center' }}>Featured Asset Classes</h2>
        <div className="hp-features">
          <div className="hp-feature-card">
            <div className="hp-feature-icon">
              <Image src="/B-RWA-assets/RealEstate.png" alt="Real Estate" width={32} height={32} style={{ objectFit: 'contain' }} />
            </div>
            <h3 className="hp-feature-title">Real Estate</h3>
            <p className="hp-feature-desc">Fractional ownership of commercial and residential properties with monthly yield.</p>
          </div>
          <div className="hp-feature-card">
            <div className="hp-feature-icon">
              <Image src="/B-RWA-assets/Commodities.png" alt="Commodities" width={32} height={32} style={{ objectFit: 'contain' }} />
            </div>
            <h3 className="hp-feature-title">Commodities</h3>
            <p className="hp-feature-desc">On-chain gold, silver, and precious metals backed 1:1 by physical audits.</p>
          </div>
          <div className="hp-feature-card">
            <div className="hp-feature-icon">
              <Image src="/B-RWA-assets/PrivateEquity.png" alt="Private Equity" width={32} height={32} style={{ objectFit: 'contain' }} />
            </div>
            <h3 className="hp-feature-title">Private Equity</h3>
            <p className="hp-feature-desc">Early-stage investment opportunities in high-growth startups and tech.</p>
          </div>
          <div className="hp-feature-card">
            <div className="hp-feature-icon">🎨</div>
            <h3 className="hp-feature-title">Fine Art</h3>
            <p className="hp-feature-desc">Collect shares of masterpiece artwork from world-renowned creators.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
