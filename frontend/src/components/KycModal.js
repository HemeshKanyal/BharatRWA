"use client";

import React, { useState } from 'react';
import { useWallet } from './WalletProvider';

export const KycModal = ({ isOpen, onClose, onVerified }) => {
  const { address } = useWallet();
  const [age, setAge] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:3008/generate-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          age: parseInt(age),
          documentId: documentId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate proof. Ensure you meet KYC requirements.');
      }

      const { proof, publicInputs } = await response.json();
      onVerified(proof, publicInputs);

    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !isSubmitting && onClose()}>
      <div className="modal-card">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🔐</span>
            <h2 className="modal-title" style={{ marginBottom: 0 }}>ZK Identity Verification</h2>
          </div>
          <p className="modal-description">
            Your private details are <span className="modal-highlight">never stored on-chain</span>.
            Only a cryptographic proof confirming you meet age requirements (≥ 18) is submitted to the blockchain.
          </p>
        </div>

        {error && (
          <div className="alert alert-error">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Age</label>
            <input
              className="form-input"
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              required
              min="1"
              placeholder="Enter your age"
            />
          </div>

          <div className="form-group">
            <label className="form-label">National ID / Passport Number</label>
            <input
              className="form-input"
              type="text"
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              required
              placeholder="e.g. AB1234567"
            />
          </div>

          <div className="alert alert-info" style={{ marginTop: '0.5rem' }}>
            🛡️ Powered by Noir circuits & UltraHonk verification
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isSubmitting}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{ flex: 2 }}
            >
              {isSubmitting ? '⏳ Generating Proof...' : '🔐 Verify Identity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
