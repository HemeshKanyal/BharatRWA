"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useWallet } from "./WalletProvider";
import { ethers } from "ethers";
import AssetRegistryABI from "@/abis/AssetRegistry.json";
import { CONTRACTS } from "@/config";

const BASE_LINKS = [
  { href: "/marketplace", label: "Marketplace", icon: "/B-RWA-assets/marketplace.png" },
  { href: "/dashboard", label: "Portfolio", icon: "/B-RWA-assets/portfolio.png" },
  { href: "/compliance", label: "Compliance", icon: "🛡️" },
];

export default function Navbar() {
  const { address, provider, isConnecting, connectWallet } = useWallet();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPath, setMenuPath] = useState(pathname);

  // Close the mobile menu after navigating (adjust state during render, not in an effect).
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    let cancelled = false;
    const checkAdmin = async () => {
      if (!address || !provider) return false;
      try {
        const registry = new ethers.Contract(CONTRACTS.ASSET_REGISTRY, AssetRegistryABI.abi, provider);
        const custodianRole = ethers.keccak256(ethers.toUtf8Bytes("CUSTODIAN_ROLE"));
        const [hasAdmin, hasCustodian] = await Promise.all([
          registry.hasRole(ethers.ZeroHash, address),
          registry.hasRole(custodianRole, address),
        ]);
        return hasAdmin || hasCustodian;
      } catch {
        return false;
      }
    };
    checkAdmin().then((v) => !cancelled && setIsAdmin(v));
    return () => {
      cancelled = true;
    };
  }, [address, provider]);

  const navLinks = isAdmin ? [...BASE_LINKS, { href: "/admin", label: "Admin", icon: "⚙️" }] : BASE_LINKS;

  const linkItems = navLinks.map((link) => (
    <Link
      key={link.href}
      href={link.href}
      className={`nav-link ${pathname === link.href ? "nav-link-active" : ""}`}
      aria-current={pathname === link.href ? "page" : undefined}
    >
      {link.icon.startsWith("/") ? (
        <Image src={link.icon} alt="" width={20} height={20} style={{ objectFit: "contain" }} />
      ) : (
        <span className="nav-link-icon" aria-hidden="true">{link.icon}</span>
      )}
      {link.label}
    </Link>
  ));

  const walletLabel = isConnecting
    ? "Connecting…"
    : address
      ? `${address.substring(0, 6)}...${address.substring(38)}`
      : "🦊 Connect Wallet";

  return (
    <nav className="navbar" aria-label="Main">
      <div className="navbar-inner">
        <div className="navbar-left">
          <Link href="/" className="navbar-brand">
            <Image src="/BharatRWA-logo.png" alt="BharatRWA" width={38} height={38} className="navbar-logo" style={{ objectFit: "contain" }} />
            <div>
              <div className="navbar-title">BharatRWA</div>
              <div className="navbar-subtitle">Real World Asset Platform</div>
            </div>
          </Link>
        </div>

        <div className="nav-links">{linkItems}</div>

        <div className="navbar-actions">
          <button
            className={`btn btn-wallet ${address ? "btn-wallet-connected" : ""}`}
            onClick={connectWallet}
            disabled={isConnecting}
          >
            {walletLabel}
          </button>
          <button
            className="nav-menu-toggle"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="mobile-nav" className="nav-mobile-panel">
          {linkItems}
          <Link href="/how-it-works" className="nav-link">How it works</Link>
          <Link href="/about" className="nav-link">About</Link>
        </div>
      )}
    </nav>
  );
}
