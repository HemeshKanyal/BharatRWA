import { ImageResponse } from "next/og";

export const alt = "BharatRWA: compliant RWA tokens on Ethereum and Solana with zero-knowledge KYC";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  const pill = {
    display: "flex",
    padding: "10px 22px",
    borderRadius: 999,
    background: "rgba(99,102,241,0.12)",
    color: "#4f46e5",
    fontSize: 28,
    fontWeight: 600,
  };
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 60%, #e0e7ff 100%)",
          color: "#0f172a",
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 700, color: "#4f46e5" }}>BharatRWA</div>
        <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.1, marginTop: 24, maxWidth: 1000 }}>
          Compliant real-world-asset tokens with zero-knowledge KYC
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 44 }}>
          <div style={pill}>ERC-7943 on Ethereum</div>
          <div style={pill}>Token-2022 on Solana</div>
          <div style={pill}>Noir ZK proofs</div>
        </div>
        <div style={{ fontSize: 26, color: "#64748b", marginTop: 40 }}>Open-source testnet prototype</div>
      </div>
    ),
    size
  );
}
