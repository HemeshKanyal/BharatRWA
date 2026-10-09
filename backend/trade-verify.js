// On-chain checks for the demo exchange. Pure functions (plus a small file-backed
// store) so they can be unit-tested without a node: see test/trade-verify.test.js.

const fs = require('fs');
const { ethers } = require('ethers');

const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

/** Max age of a payment/transfer tx the backend will honour. Limits replay after a restart. */
const MAX_TX_AGE_SEC = 30 * 60;
/** Allowed price movement between quote and settlement, in basis points. */
const BUY_SLIPPAGE_BPS = 300n;

class TradeError extends Error {}

const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

function assertRecentSuccess({ tx, receipt, block, now }) {
  if (!tx || !receipt || !block) throw new TradeError('Transaction not found or not yet mined');
  if (receipt.status !== 1) throw new TradeError('Transaction failed on-chain');
  if (now - Number(block.timestamp) > MAX_TX_AGE_SEC) throw new TradeError('Transaction is too old');
}

/** Minimum wei the buyer must have paid for `amount` tokens at `priceEth` per token. */
function minPaymentWei(amount, priceEth) {
  const cost = ethers.parseEther((amount * priceEth).toFixed(18));
  return (cost * (10000n - BUY_SLIPPAGE_BPS)) / 10000n;
}

/**
 * Check that `tx` is a recent, successful ETH payment from `buyer` to `deployer`
 * worth at least `minValueWei`.
 */
function verifyBuyPayment({ tx, receipt, block, buyer, deployer, minValueWei, now }) {
  assertRecentSuccess({ tx, receipt, block, now });
  if (!same(tx.from, buyer)) throw new TradeError('Payment was not sent by this wallet');
  if (!same(tx.to, deployer)) throw new TradeError('Payment was not sent to the exchange');
  if (BigInt(tx.value) < minValueWei) throw new TradeError('Payment is less than the cost');
  return BigInt(tx.value);
}

/**
 * Sum the `token` Transfer events from `seller` to `deployer` in a recent,
 * successful transaction sent by `seller`. Returns the amount in base units.
 */
function verifySellTransfer({ tx, receipt, block, token, seller, deployer, now }) {
  assertRecentSuccess({ tx, receipt, block, now });
  if (!same(tx.from, seller)) throw new TradeError('Transfer was not sent by this wallet');
  let total = 0n;
  for (const log of receipt.logs) {
    if (!same(log.address, token) || log.topics[0] !== TRANSFER_TOPIC || log.topics.length !== 3) continue;
    const from = ethers.getAddress('0x' + log.topics[1].slice(26));
    const to = ethers.getAddress('0x' + log.topics[2].slice(26));
    if (same(from, seller) && same(to, deployer)) total += BigInt(log.data);
  }
  if (total === 0n) throw new TradeError('No token transfer to the exchange found in this transaction');
  return total;
}

/** Transaction hashes already settled, persisted to a JSON file. */
class UsedTxStore {
  constructor(file) {
    this.file = file;
    this.used = new Set();
    try {
      if (fs.existsSync(file)) for (const h of JSON.parse(fs.readFileSync(file, 'utf8'))) this.used.add(h);
    } catch {}
  }

  /** Reserve a hash synchronously; returns false if it was already used or in flight. */
  claim(hash) {
    const h = hash.toLowerCase();
    if (this.used.has(h)) return false;
    this.used.add(h);
    return true;
  }

  release(hash) {
    this.used.delete(hash.toLowerCase());
  }

  persist() {
    try { fs.writeFileSync(this.file, JSON.stringify([...this.used])); } catch {}
  }
}

module.exports = {
  TradeError,
  UsedTxStore,
  verifyBuyPayment,
  verifySellTransfer,
  minPaymentWei,
  MAX_TX_AGE_SEC,
  TRANSFER_TOPIC,
};
