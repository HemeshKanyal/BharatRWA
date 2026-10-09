// ZK-KYC proof generation with Noir (nargo) and Barretenberg (bb).
//
// Circuit: zk_kyc/ (public input = wallet address). Matches
// bharat-rwa/src/zk/WalletBoundHonkVerifier.sol and ComplianceManagerV2.
// There is no fallback: if a real proof can't be produced, the request fails.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ZK_DIR = path.join(__dirname, 'zk_kyc');
const CIRCUIT = path.join(ZK_DIR, 'target', 'zk_kyc.json');
const WITNESS = path.join(ZK_DIR, 'target', 'zk_kyc.gz');
const VK = path.join(ZK_DIR, 'target', 'vk', 'vk');
const PROOF_DIR = path.join(ZK_DIR, 'target', 'proof');
const PROVER_TOML = path.join(ZK_DIR, 'Prover.toml');

// Public inputs, in order: [wallet, nullifier, age_flag, kyc_flag, sanction_flag, wallet_hash]
const PUBLIC_INPUT_COUNT = 6;

/** The user's inputs don't satisfy the circuit (e.g. under 18). */
class KycRequirementError extends Error {}

function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: ZK_DIR, stdio: 'pipe', timeout: 120_000 });
}

/** Compile the circuit and write its verification key once (also done at Docker build). */
function prepareCircuit() {
  if (!fs.existsSync(CIRCUIT)) run('nargo', ['compile']);
  if (!fs.existsSync(VK)) run('bb', ['write_vk', '-b', CIRCUIT, '-o', path.dirname(VK), '-t', 'evm']);
}

function toolVersions() {
  const v = (cmd, args) => {
    try { return execFileSync(cmd, args, { stdio: 'pipe' }).toString().trim().split('\n')[0]; } catch { return null; }
  };
  return { nargo: v('nargo', ['--version']), bb: v('bb', ['--version']) };
}

/**
 * Prove that the holder of `walletAddress` is 18+, KYC-verified and not sanctioned.
 * Demo limitation: these inputs are self-declared; no KYC provider signs them.
 * Note: execFileSync blocks the event loop, so proofs are generated one at a time.
 */
function generateProof(walletAddress, age) {
  if (!Number.isInteger(age) || age < 0 || age > 150) {
    throw new KycRequirementError('Age must be a whole number between 0 and 150');
  }
  prepareCircuit();

  const walletField = BigInt(walletAddress).toString();
  // Fresh secret per proof, so every proof has a new nullifier (re-verification renews expiry).
  const secret = BigInt('0x' + crypto.randomBytes(31).toString('hex')).toString();
  fs.writeFileSync(
    PROVER_TOML,
    [
      `age = ${age}`,
      'kyc_verified = true',
      'sanctioned = false',
      `wallet = "${walletField}"`,
      `secret = "${secret}"`,
      `expected_wallet_hash = "${walletField}"`,
      '',
    ].join('\n')
  );

  try {
    try {
      run('nargo', ['execute']);
    } catch (e) {
      const out = `${e.stdout || ''}${e.stderr || ''}`;
      if (out.includes('Failed constraint')) {
        throw new KycRequirementError('KYC requirements not met (must be 18 or older)');
      }
      throw new Error(`nargo execute failed: ${out.trim().split('\n').slice(-3).join(' ')}`);
    }

    run('bb', ['prove', '-b', CIRCUIT, '-w', WITNESS, '-k', VK, '-o', PROOF_DIR, '-t', 'evm']);

    const proof = '0x' + fs.readFileSync(path.join(PROOF_DIR, 'proof')).toString('hex');
    const raw = fs.readFileSync(path.join(PROOF_DIR, 'public_inputs'));
    if (raw.length !== PUBLIC_INPUT_COUNT * 32) {
      throw new Error(`Unexpected public inputs size ${raw.length}`);
    }
    const publicInputs = [];
    for (let i = 0; i < PUBLIC_INPUT_COUNT; i++) {
      publicInputs.push('0x' + raw.subarray(i * 32, (i + 1) * 32).toString('hex'));
    }
    if (BigInt(publicInputs[0]) !== BigInt(walletAddress)) {
      throw new Error('Proof public input does not match the wallet');
    }
    return { proof, publicInputs };
  } finally {
    // Don't leave the user's inputs or witness on disk.
    for (const f of [PROVER_TOML, WITNESS]) fs.rmSync(f, { force: true });
  }
}

module.exports = { generateProof, prepareCircuit, toolVersions, KycRequirementError, PUBLIC_INPUT_COUNT };
