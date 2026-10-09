const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { ethers } = require('ethers');
const {
  TradeError, UsedTxStore, verifyBuyPayment, verifySellTransfer, minPaymentWei, MAX_TX_AGE_SEC, TRANSFER_TOPIC,
} = require('../trade-verify');

const buyer = ethers.Wallet.createRandom().address;
const deployer = ethers.Wallet.createRandom().address;
const token = ethers.Wallet.createRandom().address;
const now = 1_800_000_000;
const pad = (a) => ethers.zeroPadValue(a, 32);

const okBuy = (over = {}) => ({
  tx: { from: buyer, to: deployer, value: ethers.parseEther('1') },
  receipt: { status: 1, logs: [] },
  block: { timestamp: now - 60 },
  buyer, deployer, minValueWei: ethers.parseEther('0.99'), now,
  ...over,
});

test('buy: accepts a recent payment from the buyer to the deployer', () => {
  assert.strictEqual(verifyBuyPayment(okBuy()), ethers.parseEther('1'));
});

test('buy: rejects payment from another wallet (someone else\'s tx hash)', () => {
  const other = ethers.Wallet.createRandom().address;
  assert.throws(() => verifyBuyPayment(okBuy({ buyer: other })), /not sent by this wallet/);
});

test('buy: rejects payment to the wrong address', () => {
  const o = okBuy();
  o.tx = { ...o.tx, to: ethers.Wallet.createRandom().address };
  assert.throws(() => verifyBuyPayment(o), /not sent to the exchange/);
});

test('buy: rejects underpayment', () => {
  assert.throws(() => verifyBuyPayment(okBuy({ minValueWei: ethers.parseEther('2') })), /less than the cost/);
});

test('buy: rejects failed, missing and stale transactions', () => {
  assert.throws(() => verifyBuyPayment(okBuy({ receipt: { status: 0, logs: [] } })), /failed on-chain/);
  assert.throws(() => verifyBuyPayment(okBuy({ receipt: null })), /not found/);
  assert.throws(() => verifyBuyPayment(okBuy({ block: { timestamp: now - MAX_TX_AGE_SEC - 1 } })), /too old/);
});

test('buy: minPaymentWei allows 3% slippage', () => {
  assert.strictEqual(minPaymentWei(10, 0.1), ethers.parseEther('0.97'));
});

const transferLog = (from, to, amount, address = token) => ({
  address,
  topics: [TRANSFER_TOPIC, pad(from), pad(to)],
  data: ethers.toBeHex(amount, 32),
});

const okSell = (logs, over = {}) => ({
  tx: { from: buyer, to: token, value: 0n },
  receipt: { status: 1, logs },
  block: { timestamp: now - 60 },
  token, seller: buyer, deployer, now,
  ...over,
});

test('sell: reads the amount from the Transfer event, not from the request', () => {
  const amt = ethers.parseEther('5');
  assert.strictEqual(verifySellTransfer(okSell([transferLog(buyer, deployer, amt)])), amt);
});

test('sell: ignores transfers of other tokens, to other addresses, or from other wallets', () => {
  const other = ethers.Wallet.createRandom().address;
  const logs = [
    transferLog(buyer, deployer, 1n, other), // wrong token
    transferLog(buyer, other, 2n), // wrong recipient
    transferLog(other, deployer, 3n), // wrong sender
  ];
  assert.throws(() => verifySellTransfer(okSell(logs)), /No token transfer/);
});

test('sell: rejects a transfer tx sent by someone else', () => {
  const other = ethers.Wallet.createRandom().address;
  const o = okSell([transferLog(buyer, deployer, 1n)]);
  o.tx = { ...o.tx, from: other };
  assert.throws(() => verifySellTransfer(o), /not sent by this wallet/);
});

test('UsedTxStore: a hash can be claimed once, released on failure, and persisted', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'used-')), 'used.json');
  const s = new UsedTxStore(file);
  const h = '0xABC';
  assert.strictEqual(s.claim(h), true);
  assert.strictEqual(s.claim('0xabc'), false); // case-insensitive
  s.release(h);
  assert.strictEqual(s.claim(h), true);
  s.persist();
  assert.strictEqual(new UsedTxStore(file).claim(h), false);
});

test('errors are TradeErrors (returned to the client as 400)', () => {
  try { verifyBuyPayment(okBuy({ receipt: null })); } catch (e) { assert.ok(e instanceof TradeError); }
});
