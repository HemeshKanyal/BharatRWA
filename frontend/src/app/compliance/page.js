import React from "react";
import TransferChecker from "@/components/TransferChecker";
import SiteFooter from "@/components/SiteFooter";
import { CONTRACTS, LINKS, SOLANA, sepoliaExplorer, solanaExplorer } from "@/config";

export const metadata = {
  title: "Compliance",
  description: "How BharatRWA enforces investor eligibility on Ethereum (ERC-7943) and Solana (Token-2022), with a live transfer checker.",
};

const EVM_FLOW = [
  { title: "ZK proof", desc: "Backend proves age 18+, KYC and sanctions status with Noir. Tied to the wallet." },
  { title: "ComplianceManagerV2", desc: "Verifies the proof on-chain, checks it's for msg.sender, records approval with expiry." },
  { title: "BharatRWATokenV2", desc: "ERC-7943: canSend / canReceive / canTransfer on every transfer, mint and burn." },
];

const SOL_FLOW = [
  { title: "ZK proof", desc: "Same proof, verified off-chain by the backend." },
  { title: "Attester → allowlist", desc: "approve_investor writes an entry PDA (approved, jurisdiction, expiry) and thaws the account." },
  { title: "Transfer hook", desc: "Token-2022 calls the hook on every transfer; it rejects unless both owners are allowlisted." },
];

const MAPPING = [
  ["canSend / canReceive / canTransfer", "Transfer hook reads both allowlist entries", "Not a view function; the hook ignores amounts"],
  ["setFrozenTokens / getFrozenTokens", "Freeze authority + accounts frozen by default", "Whole accounts only, no partial amounts"],
  ["forcedTransfer", "Permanent delegate", "Frozen source must be thawed and re-frozen in the same transaction"],
  ["ERC-165 0x3edbb4c4", "None", "Clients inspect the mint's extensions instead"],
  ["Metadata (ERC-20 name/symbol)", "Metadata pointer + on-mint metadata", "No ERC-7943 equivalent needed"],
];

function Flow({ steps }) {
  return (
    <ol className="flow">
      {steps.map((s, i) => (
        <li key={s.title} className="flow-step">
          <div className="flow-num" aria-hidden="true">{i + 1}</div>
          <div>
            <strong>{s.title}</strong>
            <p>{s.desc}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function CompliancePage() {
  return (
    <div className="hp-container">
      <section className="hp-section-header page-intro">
        <span className="hp-section-sup">Compliance</span>
        <h1 className="hp-section-title">Rules enforced <span>on-chain</span></h1>
        <p className="hp-section-desc">
          Only verified investors can hold BharatRWA tokens. The check happens inside the token on every transfer, on
          both chains, so it can&apos;t be bypassed by using another app.
        </p>
      </section>

      <section className="split-2 compliance-flows">
        <div className="info-card">
          <h2>Ethereum <span className="sim-tag">ERC-7943</span></h2>
          <Flow steps={EVM_FLOW} />
          <p className="info-card-foot">
            The ZK proof is verified by the contract itself.
            {CONTRACTS.TOKEN_V2 ? (
              <> Token: <a href={sepoliaExplorer("address", CONTRACTS.TOKEN_V2)} target="_blank" rel="noopener noreferrer">{CONTRACTS.TOKEN_V2.slice(0, 10)}…</a></>
            ) : (
              <> The V2 contracts are built and tested but not yet deployed on Sepolia; current demo tokens use ComplianceManager V1.</>
            )}
          </p>
        </div>
        <div className="info-card">
          <h2>Solana <span className="sim-tag">Token-2022</span></h2>
          <Flow steps={SOL_FLOW} />
          <p className="info-card-foot">
            The chain trusts the attester&apos;s off-chain check. Live on devnet:{" "}
            <a href={solanaExplorer("address", SOLANA.mint)} target="_blank" rel="noopener noreferrer">{SOLANA.mintSymbol} mint</a>.
          </p>
        </div>
      </section>

      <section className="checker-section" id="checker">
        <h2 className="section-heading-center">Would this transfer be allowed?</h2>
        <p className="section-sub-center">Reads the live compliance state from Sepolia or Solana devnet. Nothing is signed or sent.</p>
        <TransferChecker />
      </section>

      <section className="mapping-section">
        <h2 className="section-heading-center">ERC-7943 on Token-2022</h2>
        <div className="table-scroll">
          <table className="data-table mapping-table">
            <thead>
              <tr><th>ERC-7943</th><th>Token-2022 equivalent</th><th>Limitation</th></tr>
            </thead>
            <tbody>
              {MAPPING.map(([a, b, c]) => (
                <tr key={a}><td><code>{a}</code></td><td>{b}</td><td>{c}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="section-sub-center">
          Full table and trade-offs in the <a href={LINKS.github} target="_blank" rel="noopener noreferrer">README</a> ·{" "}
          <a href={LINKS.erc7943} target="_blank" rel="noopener noreferrer">ERC-7943 spec</a>
        </p>
      </section>

      <section className="devnet-section">
        <h2 className="section-heading-center">Solana devnet transactions</h2>
        <ul className="tx-list">
          {SOLANA.demoTransactions.map((t) => (
            <li key={t.sig}>
              <span>{t.label}</span>
              <a href={solanaExplorer("tx", t.sig)} target="_blank" rel="noopener noreferrer" className="mono">{t.sig.slice(0, 8)}…{t.sig.slice(-6)} ↗</a>
            </li>
          ))}
        </ul>
        <p className="section-sub-center">
          Programs:{" "}
          <a href={solanaExplorer("address", SOLANA.complianceProgram)} target="_blank" rel="noopener noreferrer">compliance</a> ·{" "}
          <a href={solanaExplorer("address", SOLANA.transferHookProgram)} target="_blank" rel="noopener noreferrer">transfer hook</a>
        </p>
      </section>

      <SiteFooter />
    </div>
  );
}
