import React from "react";
import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="hp-container">
      {/* Hero Section */}
      <section className="hp-hero">
        <div className="hp-hero-content">
          <div className="hp-hero-badge">
            <span className="hp-hero-badge-icon">✦</span>
            The Future of Ownership
          </div>
          <h1 className="hp-title">
            Tokenize.<br />
            Transact.<br />
            <span className="hp-title-gradient">Transform.</span>
          </h1>
          <p className="hp-subtitle">
            BharatRWA is the institutional-grade platform powering real-world asset tokenization on the blockchain.
          </p>
          <div className="hp-hero-actions">
            <Link href="/marketplace" className="hp-btn-primary">
              Explore Platform →
            </Link>
            <Link href="/dashboard" className="hp-btn-secondary">
              Manage Portfolio
            </Link>
          </div>
        </div>

        <div className="hp-hero-graphic">
          <div className="hp-graphic-glow"></div>
          <div className="hp-graphic-img-wrapper" style={{ maskImage: 'radial-gradient(circle, black 50%, transparent 80%)', WebkitMaskImage: 'radial-gradient(circle, black 50%, transparent 80%)' }}>
            <Image
              src="/hero-glass-city.png"
              alt="Tokenized City"
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

      {/* Stats Bar */}
      <section className="hp-stats">
        <div className="hp-stat-item">
          <div className="hp-stat-icon">
            <Image src="/B-RWA-assets/Tokenizedvalue.png" alt="Value" width={48} height={48} style={{ objectFit: 'contain' }} />
          </div>
          <div>
            <div className="hp-stat-val">$2.45B+</div>
            <div className="hp-stat-label">Total Value Tokenized</div>
          </div>
        </div>
        <div className="hp-stat-item">
          <div className="hp-stat-icon">
            <Image src="/B-RWA-assets/Tokenizedassets.png" alt="Assets" width={48} height={48} style={{ objectFit: 'contain' }} />
          </div>
          <div>
            <div className="hp-stat-val">156+</div>
            <div className="hp-stat-label">Tokenized Assets</div>
          </div>
        </div>
        <div className="hp-stat-item">
          <div className="hp-stat-icon">
            <Image src="/B-RWA-assets/activeinvestor.png" alt="Investors" width={48} height={48} style={{ objectFit: 'contain' }} />
          </div>
          <div>
            <div className="hp-stat-val">28,500+</div>
            <div className="hp-stat-label">Active Investors</div>
          </div>
        </div>
        <div className="hp-stat-item">
          <div className="hp-stat-icon">
            <Image src="/B-RWA-assets/india.png" alt="India" width={48} height={48} style={{ objectFit: 'contain' }} />
          </div>
          <div>
            <div className="hp-stat-val">Pan-India</div>
            <div className="hp-stat-label">Coverage & Operations</div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section style={{ position: 'relative', overflow: 'hidden', padding: '6rem 0' }}>
        {/* Ambient Glows for Glassmorphism */}
        <div style={{ position: 'absolute', top: '20%', left: '10%', width: '300px', height: '300px', background: 'var(--primary)', filter: 'blur(150px)', opacity: 0.1, zIndex: 0 }}></div>
        <div style={{ position: 'absolute', bottom: '10%', right: '5%', width: '400px', height: '400px', background: 'var(--accent-purple)', filter: 'blur(180px)', opacity: 0.08, zIndex: 0 }}></div>
        
        <div className="hp-section-header" style={{ position: 'relative', zIndex: 1 }}>
          <span className="hp-section-sup">Why BharatRWA</span>
          <h2 className="hp-section-title">
            Built for Institutions.<br />
            Designed for the <span>Future.</span>
          </h2>
          <p className="hp-section-desc">
            BharatRWA combines compliance, technology, and liquidity to unlock the full potential of real-world assets.
          </p>
        </div>

        <div className="hp-features" style={{ position: 'relative', zIndex: 1 }}>
          <div className="hp-feature-card">
            <div className="hp-feature-icon">🛡️</div>
            <h3 className="hp-feature-title">Institutional Grade Security</h3>
            <p className="hp-feature-desc">Bank-level custody, advanced encryption, and on-chain compliance infrastructure.</p>
          </div>
          <div className="hp-feature-card">
            <div className="hp-feature-icon">⛓️</div>
            <h3 className="hp-feature-title">Seamless Tokenization</h3>
            <p className="hp-feature-desc">End-to-end tokenization engine with legal, KYC/AML, and smart contract automation.</p>
          </div>
          <div className="hp-feature-card">
            <div className="hp-feature-icon">💧</div>
            <h3 className="hp-feature-title">Deep Liquidity</h3>
            <p className="hp-feature-desc">Access global liquidity pools and secondary markets built for real-world assets.</p>
          </div>
          <div className="hp-feature-card">
            <div className="hp-feature-icon">🌐</div>
            <h3 className="hp-feature-title">Global Accessibility</h3>
            <p className="hp-feature-desc">Invest and manage tokenized assets across borders, 24/7, with ease.</p>
          </div>
        </div>
      </section>

      {/* Trust & Compliance Banner */}
      <section className="hp-trust-container">
        <div className="hp-trust-glass">
          <div className="hp-trust-col">
            <div className="hp-trust-title">Trusted by Global Institutions</div>
            <div className="hp-logos">
              <span className="hp-logo-text" style={{ fontFamily: '"Playfair Display", serif', fontWeight: 700 }}>Goldman Sachs</span>
              <span className="hp-logo-text" style={{ fontWeight: 900, letterSpacing: '-0.05em' }}>citi</span>
              <span className="hp-logo-text" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 700 }}>
                <span style={{ color: '#db0011', fontSize: '1.2rem' }}>▲</span> HSBC
              </span>
              <span className="hp-logo-text" style={{ fontWeight: 800 }}>BlackRock</span>
              <span className="hp-logo-text" style={{ fontFamily: '"Playfair Display", serif', fontWeight: 600 }}>J.P.Morgan</span>
            </div>
          </div>
          
          <div className="hp-trust-divider"></div>

          <div className="hp-trust-col">
            <div className="hp-trust-title" style={{ textAlign: 'right' }}>Compliance & Security First</div>
            <div className="hp-badges">
              <div className="hp-badge">
                <div className="hp-badge-icon">🛡️</div>
                <span>SOC 2 Type II</span>
              </div>
              <div className="hp-badge">
                <div className="hp-badge-icon">📜</div>
                <span>ISO 27001</span>
              </div>
              <div className="hp-badge">
                <div className="hp-badge-icon">⚖️</div>
                <span>AML Compliant</span>
              </div>
              <div className="hp-badge">
                <div className="hp-badge-icon">✅</div>
                <span>KYC Verified</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="hp-cta">
        <div className="hp-cta-left">
          <div style={{ width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Image src="/BharatRWA-logo.png" alt="BharatRWA Logo" width={80} height={80} style={{ objectFit: 'contain' }} />
          </div>
          <div>
            <h2 className="hp-cta-title">The world is evolving.<br />Ownership is too.</h2>
            <p className="hp-cta-desc">Join the future of finance with BharatRWA and unlock real value, on-chain.</p>
          </div>
        </div>
        <div className="hp-cta-btn">
          <Link href="/marketplace" className="hp-btn-primary" style={{ padding: "1.2rem 3rem", fontSize: "1.1rem" }}>
            Launch App →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="hp-footer">
        <div className="hp-footer-brand">
          <div className="hp-footer-logo">
            <Image src="/BharatRWA-logo.png" alt="BharatRWA Logo" width={28} height={28} style={{ objectFit: 'contain' }} />
            BharatRWA
          </div>
          <p>The institutional-grade platform powering real-world asset tokenization.</p>
          <div className="hp-footer-socials">
            <a href="#" className="hp-footer-social">𝕏</a>
            <a href="#" className="hp-footer-social">in</a>
            <a href="#" className="hp-footer-social">✈</a>
            <a href="#" className="hp-footer-social">🎮</a>
          </div>
          <p style={{ marginTop: '2rem', fontSize: '0.75rem', opacity: 0.7 }}>© 2026 BharatRWA. All rights reserved.</p>
        </div>

        <div className="hp-footer-links">
          <div className="hp-link-col">
            <h5>Platform</h5>
            <ul>
              <li><Link href="/overview">Overview</Link></li>
              <li><Link href="/how-it-works">How It Works</Link></li>
              <li><Link href="/marketplace">Security</Link></li>
              <li><Link href="/admin">Governance</Link></li>
            </ul>
          </div>
          <div className="hp-link-col">
            <h5>Solutions</h5>
            <ul>
              <li><Link href="/marketplace">Real Estate</Link></li>
              <li><Link href="/marketplace">Private Equity</Link></li>
              <li><Link href="/marketplace">Commodities</Link></li>
              <li><Link href="/marketplace">Fine Art</Link></li>
            </ul>
          </div>
          <div className="hp-link-col">
            <h5>Resources</h5>
            <ul>
              <li><Link href="/marketplace">Market Data</Link></li>
              <li><Link href="/dashboard">Portfolio</Link></li>
              <li><Link href="/admin">Admin Portal</Link></li>
              <li><Link href="/">Help Center</Link></li>
            </ul>
          </div>
          <div className="hp-link-col">
            <h5>Company</h5>
            <ul>
              <li><Link href="/about">About Us</Link></li>
              <li><Link href="/marketplace">Marketplace</Link></li>
              <li><Link href="/dashboard">Portfolio</Link></li>
              <li><Link href="/admin">Custodian Panel</Link></li>
            </ul>
          </div>
        </div>

        <div className="hp-footer-newsletter">
          <h5>Stay Updated</h5>
          <p>Subscribe to our newsletter</p>
          <div className="hp-newsletter-input">
            <input type="email" placeholder="Enter your email" />
            <button>→</button>
          </div>
          <p style={{ fontSize: '0.65rem', marginTop: '0.5rem', opacity: 0.6 }}>We respect your privacy.</p>
        </div>
      </footer>
    </div>
  );
}
