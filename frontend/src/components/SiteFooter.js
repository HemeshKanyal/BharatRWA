import Link from "next/link";
import Image from "next/image";
import { CONTRACTS, LINKS, SOLANA, sepoliaExplorer, solanaExplorer } from "@/config";

export default function SiteFooter() {
  return (
    <footer className="hp-footer">
      <div className="hp-footer-brand">
        <div className="hp-footer-logo">
          <Image src="/BharatRWA-logo.png" alt="" width={28} height={28} style={{ objectFit: "contain" }} />
          BharatRWA
        </div>
        <p>Open-source prototype for compliant real-world-asset tokens with zero-knowledge KYC.</p>
        <p className="hp-footer-legal">
          © 2026 BharatRWA. Testnet prototype. Not an offer of securities or investment advice.
        </p>
      </div>

      <div className="hp-footer-links">
        <div className="hp-link-col">
          <h5>Product</h5>
          <ul>
            <li><Link href="/marketplace">Marketplace</Link></li>
            <li><Link href="/dashboard">Portfolio</Link></li>
            <li><Link href="/compliance">Compliance</Link></li>
            <li><Link href="/how-it-works">How it works</Link></li>
          </ul>
        </div>
        <div className="hp-link-col">
          <h5>Learn</h5>
          <ul>
            <li><Link href="/overview">Overview</Link></li>
            <li><Link href="/about">About</Link></li>
            <li><a href={LINKS.github} target="_blank" rel="noopener noreferrer">Source code (GitHub)</a></li>
            <li><a href={LINKS.limitations} target="_blank" rel="noopener noreferrer">Known limitations</a></li>
          </ul>
        </div>
        <div className="hp-link-col">
          <h5>On-chain</h5>
          <ul>
            <li><a href={sepoliaExplorer("address", CONTRACTS.COMPLIANCE_MANAGER)} target="_blank" rel="noopener noreferrer">Sepolia ComplianceManager</a></li>
            <li><a href={sepoliaExplorer("address", CONTRACTS.ASSET_REGISTRY)} target="_blank" rel="noopener noreferrer">Sepolia AssetRegistry</a></li>
            <li><a href={solanaExplorer("address", SOLANA.mint)} target="_blank" rel="noopener noreferrer">Solana devnet mint</a></li>
            <li><a href={LINKS.erc7943} target="_blank" rel="noopener noreferrer">ERC-7943 spec</a></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
