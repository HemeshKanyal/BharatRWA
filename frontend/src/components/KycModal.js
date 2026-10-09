"use client";

import React, { useState } from "react";
import { useWallet } from "./WalletProvider";
import { fetchBackend } from "@/utils/chain";

export const KycModal = ({ isOpen, onClose, onVerified }) => {
  const { address } = useWallet();
  const [age, setAge] = useState("");
  const [status, setStatus] = useState(null); // null | "proving" | "slow" | "submitting"
  const [error, setError] = useState(null);

  if (!isOpen) return null;
  const busy = status !== null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("proving");
    setError(null);

    try {
      const response = await fetchBackend("/generate-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, age: parseInt(age, 10) }),
        onSlow: () => setStatus((s) => (s === "proving" ? "slow" : s)),
        slowAfterMs: 5000,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Proof generation failed. Please try again.");

      setStatus("submitting");
      await onVerified(body.proof, body.publicInputs);
    } catch (err) {
      setError(err.message);
    } finally {
      setStatus(null);
    }
  };

  const buttonLabel = {
    proving: "Generating proof…",
    slow: "Waking the server…",
    submitting: "Confirm in your wallet…",
  }[status] || "Generate proof and verify";

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="kyc-title">
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "1.5rem" }} aria-hidden="true">🔐</span>
            <h2 id="kyc-title" className="modal-title" style={{ marginBottom: 0 }}>ZK identity verification</h2>
          </div>
          <p className="modal-description">
            The backend turns your input into a zero-knowledge proof that you are 18 or older, tied to your wallet.
            Only the proof goes on-chain; <span className="modal-highlight">your age is not stored on-chain</span>.
          </p>
        </div>

        {error && <div className="alert alert-error" role="alert">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="kyc-age">Age</label>
            <input
              id="kyc-age"
              className="form-input"
              type="number"
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              required
              min="1"
              max="150"
              placeholder="Enter your age"
              disabled={busy}
            />
          </div>

          <div className="alert alert-info" style={{ marginTop: "0.5rem" }}>
            Demo: you enter your age yourself. In production, a KYC provider would sign these inputs. Do not enter real
            identity documents here.
          </div>

          {status === "slow" && (
            <p className="modal-note">
              The demo backend sleeps when idle and can take up to a minute to start.
            </p>
          )}

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy} style={{ flex: 1 }}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !address} style={{ flex: 2 }}>
              {buttonLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
