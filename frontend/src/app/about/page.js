import React from "react";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { LINKS } from "@/config";

export const metadata = { title: "About" };

const VALUES = [
  { icon: "🔍", title: "Verifiable", desc: "Contracts, Solana programs and backend are open source; every rule can be read and every transaction checked on a block explorer." },
  { icon: "🔐", title: "Private", desc: "Investors prove eligibility with zero-knowledge proofs; no identity documents are stored on-chain." },
  { icon: "⚖️", title: "Compliant by design", desc: "Transfer rules live in the token (ERC-7943, Token-2022 transfer hook), not just in the user interface." },
];

export default function AboutPage() {
  return (
    <div className="hp-container">
      <section className="hp-section-header page-intro">
        <span className="hp-section-sup">About</span>
        <h1 className="hp-section-title">Why <span>BharatRWA</span></h1>
        <p className="hp-section-desc">
          Tokenized real-world assets are usually securities, so only eligible investors may hold them. BharatRWA is an
          open-source prototype that explores how to enforce that on-chain while keeping investors&apos; identities private.
        </p>
      </section>

      <section className="split-2 about-split">
        <div>
          <h2 className="about-heading">What this project is</h2>
          <p className="about-text">
            A working testnet implementation of compliant RWA tokens on two chains: an ERC-20 token that implements
            ERC-7943 on Ethereum, and an SPL Token-2022 mint with a compliance transfer hook on Solana. Both use the
            same idea: an investor proves eligibility once with a zero-knowledge proof, and the token checks that status
            on every transfer.
          </p>
          <p className="about-text">
            It is not a licensed platform. Legal structuring, custody of the underlying assets and real KYC provider
            integration are outside its scope. See the{" "}
            <a href={LINKS.limitations} target="_blank" rel="noopener noreferrer">known limitations</a>.
          </p>
        </div>
        <div className="info-card">
          <h3>Principles</h3>
          <ul className="values-list">
            {VALUES.map((v) => (
              <li key={v.title}>
                <span aria-hidden="true">{v.icon}</span>
                <div>
                  <strong>{v.title}</strong>
                  <span>{v.desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="hp-cta about-cta">
        <div className="hp-cta-left">
          <div>
            <h2 className="hp-cta-title">Read the code</h2>
            <p className="hp-cta-desc">Everything, including the tests and deployment scripts, is on GitHub.</p>
          </div>
        </div>
        <div className="hp-cta-btn">
          <a href={LINKS.github} target="_blank" rel="noopener noreferrer" className="hp-btn-primary">View on GitHub</a>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
