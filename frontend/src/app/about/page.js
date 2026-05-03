import React from "react";
import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="hp-container">
      <section className="hp-section-header" style={{ marginTop: '4rem' }}>
        <span className="hp-section-sup">Our Mission</span>
        <h1 className="hp-section-title">Democratizing <span>Global Assets</span></h1>
        <p className="hp-section-desc">
          BharatRWA is dedicated to bringing real-world assets onto the blockchain, 
          providing transparency, liquidity, and accessibility to everyone, everywhere.
        </p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', marginTop: '4rem' }}>
        <div>
          <h2 style={{ fontSize: '2rem', color: 'var(--navy)', marginBottom: '1.5rem' }}>The BharatRWA Vision</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.8', marginBottom: '1.5rem' }}>
            We believe that the future of finance is on-chain. By tokenizing assets like real estate, 
            commodities, and private equity, we eliminate intermediaries, reduce costs, and 
            open up premium investment opportunities to a global audience.
          </p>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
            Our platform is built on the principles of security, compliance, and decentralization, 
            ensuring that your investments are safe and verifiable at all times.
          </p>
        </div>
        <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-xl)', padding: '3rem', border: '1px solid var(--border-light)' }}>
          <h3 style={{ fontSize: '1.5rem', color: 'var(--navy)', marginBottom: '2rem' }}>Core Values</h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <li style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.5rem' }}>⚖️</span>
              <div>
                <strong style={{ display: 'block', color: 'var(--navy)' }}>Transparency</strong>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-tertiary)' }}>Every transaction is logged on the immutable ledger.</span>
              </div>
            </li>
            <li style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.5rem' }}>🛡️</span>
              <div>
                <strong style={{ display: 'block', color: 'var(--navy)' }}>Security</strong>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-tertiary)' }}>Institutional-grade custody and encryption.</span>
              </div>
            </li>
            <li style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.5rem' }}>💧</span>
              <div>
                <strong style={{ display: 'block', color: 'var(--navy)' }}>Liquidity</strong>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-tertiary)' }}>Trade your assets anytime, anywhere in the world.</span>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section className="hp-cta" style={{ marginTop: '6rem' }}>
        <div className="hp-cta-left">
          <div className="hp-cta-orb" style={{ background: 'var(--primary-gradient)' }}></div>
          <div>
            <h2 className="hp-cta-title">Ready to join the revolution?</h2>
            <p className="hp-cta-desc">Start your journey into the world of tokenized real-world assets today.</p>
          </div>
        </div>
        <div className="hp-cta-btn">
          <Link href="/marketplace" className="hp-btn-primary">Get Started</Link>
        </div>
      </section>
    </div>
  );
}
