"use client";

import React, { useState, useEffect } from "react";
import { useWallet } from "@/components/WalletProvider";
import { useToast } from "@/components/ToastProvider";
import { ethers } from "ethers";
import AssetRegistryABI from "@/abis/AssetRegistry.json";
import AssetOracleABI from "@/abis/AssetOracle.json";
import ComplianceManagerABI from "@/abis/ComplianceManager.json";
import { CONTRACTS, BACKEND_URL } from "@/config";

export default function AdminPage() {
  const { address, signer, provider } = useWallet();
  const { addToast } = useToast();

  // Admin role check
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);

  // Register Asset form
  const [assetName, setAssetName] = useState("");
  const [assetSymbol, setAssetSymbol] = useState("");
  const [assetSupply, setAssetSupply] = useState("");
  const [assetImage, setAssetImage] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  // Oracle Price form
  const [oracleAssetId, setOracleAssetId] = useState("");
  const [oraclePrice, setOraclePrice] = useState("");
  const [isSettingPrice, setIsSettingPrice] = useState(false);

  // Manual Approve form
  const [approveAddress, setApproveAddress] = useState("");
  const [isApproving, setIsApproving] = useState(false);

  // Registered assets list
  const [registeredAssets, setRegisteredAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [isToggling, setIsToggling] = useState({});

  // Check if connected wallet has admin role
  useEffect(() => {
    const checkAdminRole = async () => {
      if (!address || !provider) {
        setCheckingRole(false);
        setIsAdmin(false);
        return;
      }
      try {
        setCheckingRole(true);
        const registry = new ethers.Contract(CONTRACTS.ASSET_REGISTRY, AssetRegistryABI.abi, provider);
        const cm = new ethers.Contract(CONTRACTS.COMPLIANCE_MANAGER, ComplianceManagerABI.abi, provider);

        // Check DEFAULT_ADMIN_ROLE on both contracts
        const adminRole = ethers.ZeroHash; // DEFAULT_ADMIN_ROLE = 0x00
        const custodianRole = ethers.keccak256(ethers.toUtf8Bytes("CUSTODIAN_ROLE"));

        const [hasRegistryAdmin, hasCustodian, hasComplianceAdmin] = await Promise.all([
          registry.hasRole(adminRole, address),
          registry.hasRole(custodianRole, address),
          cm.hasRole(adminRole, address),
        ]);

        setIsAdmin(hasRegistryAdmin || hasCustodian || hasComplianceAdmin);
      } catch (err) {
        console.error("Role check failed:", err);
        setIsAdmin(false);
      } finally {
        setCheckingRole(false);
      }
    };
    checkAdminRole();
  }, [address, provider]);

  // Fetch registered assets (now from backend to include images)
  useEffect(() => {
    const fetchAssets = async () => {
      try {
        setLoadingAssets(true);
        const res = await fetch(`${BACKEND_URL}/api/assets`);
        if (!res.ok) throw new Error("Failed to fetch assets");
        const data = await res.json();
        setRegisteredAssets(data);
      } catch (err) {
        console.error("Failed to fetch assets:", err);
      } finally {
        setLoadingAssets(false);
      }
    };
    fetchAssets();
  }, []);

  const handleRegisterAsset = async (e) => {
    e.preventDefault();
    if (!signer) { addToast("❌", "Error", "Connect wallet first."); return; }

    try {
      setIsRegistering(true);
      const registry = new ethers.Contract(CONTRACTS.ASSET_REGISTRY, AssetRegistryABI.abi, signer);
      const supplyWei = ethers.parseEther(assetSupply);
      const metadataHash = ethers.ZeroHash;

      addToast("⏳", "Registering Asset", `Deploying ${assetName} (${assetSymbol})...`);
      const tx = await registry.registerAsset(assetName, assetSymbol, metadataHash, supplyWei);
      addToast("⏳", "Confirming", `Tx: ${tx.hash.substring(0, 16)}...`);
      const receipt = await tx.wait();

      // Get assetId from logs (event AssetRegistered(uint256 indexed assetId, ...))
      const log = receipt.logs.find(x => x.address.toLowerCase() === CONTRACTS.ASSET_REGISTRY.toLowerCase());
      if (log && assetImage) {
        try {
          const parsedLogs = registry.interface.parseLog(log);
          const assetId = Number(parsedLogs.args.assetId);
          await fetch(`${BACKEND_URL}/api/assets/${assetId}/metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: assetImage })
          });
        } catch (e) {
          console.error("Failed to save image metadata:", e);
        }
      }

      addToast("🎉", "Asset Registered!", `${assetName} token has been deployed on Sepolia.`);
      setAssetName("");
      setAssetSymbol("");
      setAssetSupply("");
      setAssetImage("");

      // Refresh assets list after a small delay to allow backend to finish syncing
      await new Promise(r => setTimeout(r, 1500));
      window.location.reload();
    } catch (err) {
      console.error(err);
      addToast("❌", "Registration Failed", err.reason || err.message);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleSetPrice = async (e) => {
    e.preventDefault();
    if (!signer) return;

    try {
      setIsSettingPrice(true);
      const oracle = new ethers.Contract(CONTRACTS.ASSET_ORACLE, AssetOracleABI.abi, signer);

      // Price in 8 decimals (Chainlink standard)
      const priceInt = Math.round(parseFloat(oraclePrice) * 1e8);
      const decimals = 8;

      addToast("⏳", "Setting Price", `Asset #${oracleAssetId} → $${oraclePrice}`);
      const tx = await oracle.setManualPrice(oracleAssetId, priceInt, decimals);
      await tx.wait();

      addToast("✅", "Price Updated!", `Asset #${oracleAssetId} is now $${oraclePrice}`);
      setOracleAssetId("");
      setOraclePrice("");
    } catch (err) {
      addToast("❌", "Failed", err.reason || err.message);
    } finally {
      setIsSettingPrice(false);
    }
  };

  const handleManualApprove = async (e) => {
    e.preventDefault();
    if (!signer) return;

    try {
      setIsApproving(true);
      const cm = new ethers.Contract(CONTRACTS.COMPLIANCE_MANAGER, ComplianceManagerABI.abi, signer);

      addToast("⏳", "Approving", `Manually approving ${approveAddress.substring(0, 10)}...`);
      const tx = await cm.manualApprove(approveAddress);
      await tx.wait();

      addToast("✅", "Approved!", "Investor has been manually KYC-approved.");
      setApproveAddress("");
    } catch (err) {
      addToast("❌", "Failed", err.reason || err.message);
    } finally {
      setIsApproving(false);
    }
  };

  const handleToggleAssetStatus = async (assetId, isActive) => {
    if (!signer) return;
    try {
      setIsToggling(prev => ({ ...prev, [assetId]: true }));
      const registry = new ethers.Contract(CONTRACTS.ASSET_REGISTRY, AssetRegistryABI.abi, signer);
      
      const actionName = isActive ? "Deactivating" : "Reactivating";
      addToast("⏳", actionName, `${actionName} asset #${assetId}...`);
      
      const tx = isActive 
        ? await registry.deactivateAsset(assetId) 
        : await registry.reactivateAsset(assetId);
        
      await tx.wait();
      addToast("✅", "Success", `Asset #${assetId} is now ${isActive ? 'Inactive' : 'Active'}.`);
      
      // Update local state without full reload
      setRegisteredAssets(assets => assets.map(a => 
        a.id === assetId ? { ...a, isActive: !isActive } : a
      ));
    } catch (err) {
      let errorMessage = err.reason || err.message;
      
      // Try to parse custom error
      if (err.data && AssetRegistryABI.abi) {
        try {
          const iface = new ethers.Interface(AssetRegistryABI.abi);
          const decodedError = iface.parseError(err.data);
          if (decodedError) {
            errorMessage = `${decodedError.name}(${decodedError.args.join(", ")})`;
          }
        } catch (e) {
          console.log("Could not parse error data", e);
        }
      }
      
      addToast("❌", "Failed", errorMessage);
    } finally {
      setIsToggling(prev => ({ ...prev, [assetId]: false }));
    }
  };

  // Not connected
  if (!address) {
    return (
      <div className="page-empty">
        <div className="page-empty-icon">⚙️</div>
        <h2>Admin Panel</h2>
        <p>Connect your wallet with an admin/custodian account to access this panel.</p>
      </div>
    );
  }

  // Checking role
  if (checkingRole) {
    return (
      <div className="page-empty">
        <div className="page-empty-icon loading-pulse">🔍</div>
        <h2>Verifying Access</h2>
        <p>Checking your admin role on-chain...</p>
      </div>
    );
  }

  // Not admin
  if (!isAdmin) {
    return (
      <div className="page-empty">
        <div className="page-empty-icon">🔒</div>
        <h2>Access Denied</h2>
        <p>
          Your wallet <strong>{address.substring(0, 8)}...{address.substring(36)}</strong> does
          not have admin or custodian permissions on the AssetRegistry or ComplianceManager contracts.
        </p>
        <p style={{ marginTop: "1rem", fontSize: "0.85rem", color: "var(--text-tertiary)" }}>
          Switch to the deployer wallet to access the admin panel.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <h1 className="page-title">Admin Panel</h1>
            <p className="page-subtitle">Register assets, set oracle prices, and manage compliance</p>
          </div>
          <span className="badge badge-verified">✓ Admin Access</span>
        </div>
      </div>

      <div className="admin-grid">
        {/* Register Asset */}
        <div className="admin-card">
          <h3 className="admin-card-title">📋 Register New Asset</h3>
          <p className="admin-card-desc">Deploy a new BharatRWAToken for a real-world asset.</p>
          <form onSubmit={handleRegisterAsset}>
            <div className="form-group">
              <label className="form-label">Asset Name</label>
              <input className="form-input" value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="e.g. Mumbai Office Tower" required />
            </div>
            <div className="form-group">
              <label className="form-label">Token Symbol</label>
              <input className="form-input" value={assetSymbol} onChange={(e) => setAssetSymbol(e.target.value)} placeholder="e.g. MOFF" required />
            </div>
            <div className="form-group">
              <label className="form-label">Total Supply (tokens)</label>
              <input className="form-input" type="number" value={assetSupply} onChange={(e) => setAssetSupply(e.target.value)} placeholder="e.g. 1000000" required />
            </div>
            <div className="form-group">
              <label className="form-label">Asset Image URL (Optional)</label>
              <input className="form-input" value={assetImage} onChange={(e) => setAssetImage(e.target.value)} placeholder="e.g. https://example.com/image.png" />
            </div>
            <button className="btn btn-primary btn-full" type="submit" disabled={isRegistering}>
              {isRegistering ? "Deploying..." : "Register Asset"}
            </button>
          </form>
        </div>

        {/* Set Oracle Price */}
        <div className="admin-card">
          <h3 className="admin-card-title">📈 Update Oracle Price</h3>
          <p className="admin-card-desc">Set the USD price for a registered asset (8 decimal precision).</p>
          <form onSubmit={handleSetPrice}>
            <div className="form-group">
              <label className="form-label">Asset ID</label>
              <input className="form-input" type="number" value={oracleAssetId} onChange={(e) => setOracleAssetId(e.target.value)} placeholder="e.g. 1" required />
            </div>
            <div className="form-group">
              <label className="form-label">Price (USD)</label>
              <input className="form-input" type="number" step="0.01" value={oraclePrice} onChange={(e) => setOraclePrice(e.target.value)} placeholder="e.g. 1.50" required />
            </div>
            <button className="btn btn-primary btn-full" type="submit" disabled={isSettingPrice}>
              {isSettingPrice ? "Setting..." : "Update Price"}
            </button>
          </form>
        </div>

        {/* Manual KYC Approve */}
        <div className="admin-card">
          <h3 className="admin-card-title">🔐 Manual KYC Approval</h3>
          <p className="admin-card-desc">Approve an investor address for off-chain verified KYC.</p>
          <form onSubmit={handleManualApprove}>
            <div className="form-group">
              <label className="form-label">Wallet Address</label>
              <input className="form-input" value={approveAddress} onChange={(e) => setApproveAddress(e.target.value)} placeholder="0x..." required />
            </div>
            <button className="btn btn-primary btn-full" type="submit" disabled={isApproving}>
              {isApproving ? "Approving..." : "Approve Investor"}
            </button>
          </form>
        </div>
      </div>

      {/* Registered Assets Table */}
      <div className="section-header">
        <h2 className="section-title">Registered Assets</h2>
      </div>

      <div className="table-container">
        {loadingAssets ? (
          <div className="page-empty" style={{ padding: "2rem" }}>
            <p className="loading-pulse">Loading assets from blockchain...</p>
          </div>
        ) : registeredAssets.length === 0 ? (
          <div className="page-empty" style={{ padding: "2rem" }}>
            <p>No assets registered yet.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Symbol</th>
                <th>Supply</th>
                <th>Token Contract</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {registeredAssets.map((a) => (
                <tr key={a.id} style={{ opacity: a.isActive ? 1 : 0.6 }}>
                  <td style={{ fontWeight: 600 }}>#{a.id}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {a.imageUrl && (
                        <img src={a.imageUrl} alt={a.name} style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover" }} />
                      )}
                      <span>{a.name}</span>
                    </div>
                  </td>
                  <td><span className="badge badge-active" style={{ background: "rgba(255,153,51,0.08)", color: "var(--saffron-dark)" }}>{a.symbol}</span></td>
                  <td>{parseFloat(a.totalSupply).toLocaleString()}</td>
                  <td>
                    <a href={`https://sepolia.etherscan.io/address/${a.tokenAddress}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.8rem", color: "var(--saffron-dark)" }}>
                      {a.tokenAddress?.substring(0, 8)}...{a.tokenAddress?.substring(36)}
                    </a>
                  </td>
                  <td><span className={`badge ${a.isActive ? "badge-active" : "badge-inactive"}`}>{a.isActive ? "Active" : "Inactive"}</span></td>
                  <td>
                    <button 
                      className={`btn ${a.isActive ? "btn-inactive" : "btn-active"}`} 
                      style={{ padding: "0.3rem 0.8rem", fontSize: "0.75rem", background: a.isActive ? "#ef5350" : "#26a69a", color: "white" }}
                      onClick={() => handleToggleAssetStatus(a.id, a.isActive)}
                      disabled={isToggling[a.id]}
                    >
                      {isToggling[a.id] ? "..." : a.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
