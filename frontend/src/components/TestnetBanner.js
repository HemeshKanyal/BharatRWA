import { LINKS } from "@/config";

export default function TestnetBanner() {
  return (
    <div className="testnet-banner" role="note">
      <strong>Testnet demo.</strong> Runs on Sepolia and Solana devnet with test tokens only. No real assets or money.{" "}
      <a href={LINKS.limitations} target="_blank" rel="noopener noreferrer">
        Known limitations
      </a>
    </div>
  );
}
