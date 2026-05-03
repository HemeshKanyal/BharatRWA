"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useWallet } from "./WalletProvider";
import { ethers } from "ethers";
import AssetRegistryABI from "@/abis/AssetRegistry.json";
import { CONTRACTS } from "@/config";

export default function Navbar() {
  const { address, provider, isConnecting, connectWallet } = useWallet();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!address || !provider) { setIsAdmin(false); return; }
      try {
        const registry = new ethers.Contract(CONTRACTS.ASSET_REGISTRY, AssetRegistryABI.abi, provider);
        const adminRole = ethers.ZeroHash;
        const custodianRole = ethers.keccak256(ethers.toUtf8Bytes("CUSTODIAN_ROLE"));
        const [hasAdmin, hasCustodian] = await Promise.all([
          registry.hasRole(adminRole, address),
          registry.hasRole(custodianRole, address),
        ]);
        setIsAdmin(hasAdmin || hasCustodian);
      } catch {
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, [address, provider]);

  const navLinks = [
    { href: "/marketplace", label: "Marketplace", icon: "/B-RWA-assets/marketplace.png" },
    { href: "/dashboard", label: "Portfolio", icon: "/B-RWA-assets/portfolio.png" },
  ];

  // Only show Admin link if user has admin role
  if (isAdmin) {
    navLinks.push({ href: "/admin", label: "Admin", icon: "⚙️" });
  }

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        {/* Left: Brand */}
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-start" }}>
          <Link href="/" className="navbar-brand">
            <Image src="/BharatRWA-logo.png" alt="BharatRWA Logo" width={38} height={38} className="navbar-logo" style={{ objectFit: 'contain' }} />
            <div>
              <div className="navbar-title">BharatRWA</div>
              <div className="navbar-subtitle">Real World Asset Platform</div>
            </div>
          </Link>
        </div>

        {/* Center: Navigation Links */}
        <div className="nav-links" style={{ flex: 2, display: "flex", justifyContent: "center", gap: "2rem" }}>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-link ${pathname === link.href ? "nav-link-active" : ""}`}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700 }}
            >
              {link.icon.startsWith('/') ? (
                <Image src={link.icon} alt={link.label} width={20} height={20} style={{ objectFit: 'contain' }} />
              ) : (
                <span className="nav-link-icon">{link.icon}</span>
              )}
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right: Actions */}
        <div className="navbar-actions" style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
          <button
            className={`btn btn-wallet ${address ? "btn-wallet-connected" : ""}`}
            onClick={connectWallet}
            disabled={isConnecting}
          >
            {isConnecting
              ? "..."
              : address
                ? `${address.substring(0, 6)}...${address.substring(38)}`
                : "🦊 Connect Wallet"}
          </button>
        </div>
      </div>
    </nav>
  );
}
