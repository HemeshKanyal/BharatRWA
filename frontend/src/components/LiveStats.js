"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { ethers } from "ethers";
import { CONTRACTS } from "@/config";
import { fetchBackend, getReadProvider } from "@/utils/chain";

const CM_ABI = ["function totalApproved() view returns (uint256)"];

/** Live numbers only: asset count from the backend, approved wallets from Sepolia. */
export default function LiveStats() {
  const [assets, setAssets] = useState(null);
  const [approved, setApproved] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchBackend("/api/assets")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((list) => !cancelled && setAssets(list.filter((a) => a.isActive).length))
      .catch(() => !cancelled && setAssets("—"));
    new ethers.Contract(CONTRACTS.COMPLIANCE_MANAGER, CM_ABI, getReadProvider())
      .totalApproved()
      .then((n) => !cancelled && setApproved(Number(n)))
      .catch(() => !cancelled && setApproved("—"));
    return () => {
      cancelled = true;
    };
  }, []);

  const items = [
    { icon: "/B-RWA-assets/Tokenizedassets.png", value: assets ?? "…", label: "Demo assets listed (Sepolia)" },
    { icon: "/B-RWA-assets/activeinvestor.png", value: approved ?? "…", label: "Wallets approved by the V1 ComplianceManager" },
    { icon: "/B-RWA-assets/Tokenizedvalue.png", value: "2 chains", label: "Ethereum Sepolia · Solana devnet" },
    { icon: "/B-RWA-assets/portfolio.png", value: "ERC-7943", label: "and SPL Token-2022 compliance" },
  ];

  return (
    <section className="hp-stats" aria-label="Live testnet numbers">
      {items.map((it) => (
        <div className="hp-stat-item" key={it.label}>
          <div className="hp-stat-icon">
            <Image src={it.icon} alt="" width={48} height={48} style={{ objectFit: "contain" }} />
          </div>
          <div>
            <div className="hp-stat-val">{it.value}</div>
            <div className="hp-stat-label">{it.label}</div>
          </div>
        </div>
      ))}
    </section>
  );
}
