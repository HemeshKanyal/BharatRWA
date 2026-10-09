import React from "react";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";

export const metadata = { title: "How it works" };

const STEPS = [
  { icon: "🏗️", title: "1. A custodian registers an asset", desc: "The AssetRegistry contract deploys a capped ERC-20 token for the asset. On Solana, the issuer creates a Token-2022 mint with a transfer hook, default-frozen accounts and a permanent delegate." },
  { icon: "🔐", title: "2. The investor proves eligibility", desc: "The backend turns the investor's inputs into a Noir zero-knowledge proof that they are 18+, KYC-verified and not sanctioned. The proof is tied to their wallet address and reveals nothing else." },
  { icon: "✅", title: "3. Eligibility is recorded on-chain", desc: "On Ethereum, the ComplianceManager verifies the proof itself and records an approval with an expiry. On Solana, an attester checks the proof off-chain and writes an allowlist entry, which also unfreezes the investor's account." },
  { icon: "⚖️", title: "4. The token enforces the rules", desc: "Every transfer checks both parties. Non-approved wallets can't receive tokens. Enforcement roles can freeze holdings and force transfers for legal recovery." },
];

export default function HowItWorksPage() {
  return (
    <div className="hp-container">
      <section className="hp-section-header page-intro">
        <span className="hp-section-sup">How it works</span>
        <h1 className="hp-section-title">From asset to <span>compliant transfer</span></h1>
        <p className="hp-section-desc">The flow implemented in this prototype, step by step.</p>
      </section>

      <section className="hp-features steps-grid">
        {STEPS.map((s) => (
          <div className="hp-feature-card" key={s.title}>
            <div className="hp-feature-icon" aria-hidden="true">{s.icon}</div>
            <h3 className="hp-feature-title">{s.title}</h3>
            <p className="hp-feature-desc">{s.desc}</p>
          </div>
        ))}
      </section>

      <section className="info-card scope-note">
        <h2>Not covered by this prototype</h2>
        <p>
          Legal structuring (for example an SPV that owns the asset), custody, and real KYC providers. In the demo, the
          inputs to the ZK proof are typed in by the user rather than signed by a KYC provider, so the proof only shows
          that the user claimed them.
        </p>
      </section>

      <section className="howitworks-cta">
        <Link href="/compliance" className="hp-btn-primary">See the compliance rules live →</Link>
      </section>

      <SiteFooter />
    </div>
  );
}
