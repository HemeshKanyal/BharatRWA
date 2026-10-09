const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { generateProof, prepareCircuit, toolVersions, KycRequirementError } = require('./zk');
const { TradeError, UsedTxStore, verifyBuyPayment, verifySellTransfer, minPaymentWei } = require('./trade-verify');

const app = express();
app.use(cors());
app.use(express.json());

// ========== CONFIG ==========
const PORT = process.env.PORT || 3008;
const { RPC, PK } = require('./config');

const ADDRS = {
  REGISTRY: '0x774E3195E3efB0fa403366033881C6ab1fe14B0D',
  ORACLE: '0x590AE2361F302B274a7FB7277E1f15A450BBF392',
  COMPLIANCE: '0x07bfd4e030Cf250597A898E9EF43110365c7dbAC',
};

const REG_ABI = [
  'function getAllAssetIds() view returns (uint256[])',
  'function getAsset(uint256) view returns (tuple(uint256 assetId, string name, string symbol, bytes32 metadataHash, address custodian, address tokenContract, uint256 totalSupply, bool isActive, uint256 registrationTimestamp))',
];
const ORA_ABI = [
  'function getLatestPrice(uint256) view returns (tuple(int256 price, uint256 timestamp, uint8 decimals, bool isManualOverride))',
];
const TOK_ABI = [
  'function mint(address,uint256) external',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function totalSupply() view returns (uint256)',
];
const CMP_ABI = [
  'function isApproved(address) view returns (bool)',
  'function manualApprove(address) external',
];
const ACCESS_ABI = ['function hasRole(bytes32,address) view returns (bool)'];
const CUSTODIAN_ROLE = ethers.id('CUSTODIAN_ROLE');

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PK, provider);
const DEPLOYER = wallet.address;
const CHAIN_ID = 11155111;
const usedTxs = new UsedTxStore(path.join(__dirname, 'used_txs.json'));

// ========== MARKET DATA ==========
const DATA_FILE = path.join(__dirname, 'market_data.json');
let market = {}; // assetId -> { tokenAddress, name, symbol, currentPrice, candles[], trades[] }

function save() {
  const s = {};
  for (const [id, d] of Object.entries(market)) {
    s[id] = { ...d, candles: d.candles.slice(-500), trades: d.trades.slice(-200) };
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(s));
}

function load() {
  try { if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch {}
  return null;
}

// ========== SYNTHETIC HISTORY ==========
function genCandles(base, count = 200) {
  const candles = [];
  let p = base;
  const now = Math.floor(Date.now() / 1000);
  const iv = 900; // 15-min candles
  for (let i = count; i > 0; i--) {
    const t = Math.floor((now - i * iv) / iv) * iv;
    const ch = (Math.random() - 0.48) * 0.025;
    const o = p, c = p * (1 + ch);
    const h = Math.max(o, c) * (1 + Math.random() * 0.004);
    const l = Math.min(o, c) * (1 - Math.random() * 0.004);
    const v = Math.floor(Math.random() * 150 + 10);
    candles.push({ time: t, open: +o.toFixed(8), high: +h.toFixed(8), low: +l.toFixed(8), close: +c.toFixed(8), volume: v });
    p = c;
  }
  return { candles, lastPrice: p };
}

function genOrderBook(price) {
  const bids = [], asks = [];
  const sp = price * 0.002;
  for (let i = 1; i <= 12; i++) {
    const ba = Math.floor(Math.random() * 300 + 20);
    const aa = Math.floor(Math.random() * 300 + 20);
    bids.push({ price: +(price - sp * i).toFixed(8), amount: ba });
    asks.push({ price: +(price + sp * i).toFixed(8), amount: aa });
  }
  return { bids, asks };
}

// ========== CANDLE UPDATE ==========
function recordTrade(assetId, side, price, amount, walletAddr, txHash) {
  const d = market[assetId];
  if (!d) return;
  const now = Math.floor(Date.now() / 1000);
  const iv = 900;
  const ct = Math.floor(now / iv) * iv;

  // Update or create candle
  const last = d.candles[d.candles.length - 1];
  if (last && last.time === ct) {
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
    last.close = price;
    last.volume += amount;
  } else {
    d.candles.push({ time: ct, open: price, high: price, low: price, close: price, volume: amount });
  }

  d.trades.unshift({ time: Date.now(), side, price: +price.toFixed(8), amount, total: +(price * amount).toFixed(8), wallet: walletAddr, txHash });
  if (d.trades.length > 200) d.trades.length = 200;

  // Price impact: ±0.1% per token
  const impact = amount * 0.001;
  d.currentPrice = side === 'buy' ? price * (1 + impact) : price * Math.max(0.5, 1 - impact);
  d.currentPrice = +d.currentPrice.toFixed(8);

  save();
}

// ========== ASSET SYNC ==========
async function fetchAssetFromChain(aid) {
  try {
    const reg = new ethers.Contract(ADDRS.REGISTRY, REG_ABI, provider);
    const ora = new ethers.Contract(ADDRS.ORACLE, ORA_ABI, provider);
    
    const a = await reg.getAsset(aid);
    const tok = new ethers.Contract(a.tokenContract, TOK_ABI, provider);
    const sym = await tok.symbol();
    const name = await tok.name();

    // Get oracle price → convert to ETH (assuming $3000/ETH as fallback)
    let basePrice = 0.0001;
    const symUp = sym.toUpperCase();
    
    try {
      if (['PAXG', 'GOLD'].includes(symUp)) {
         const paxUsd = await fetchBinancePrice('PAXGUSDT');
         const ethUsd = await fetchBinancePrice('ETHUSDT');
         if (paxUsd && ethUsd) basePrice = paxUsd / ethUsd;
      } else if (['BTC'].includes(symUp)) {
         const btcUsd = await fetchBinancePrice('BTCUSDT');
         const ethUsd = await fetchBinancePrice('ETHUSDT');
         if (btcUsd && ethUsd) basePrice = btcUsd / ethUsd;
      } else if (['SLVR', 'SILVER'].includes(symUp)) {
         const slvUsd = await fetchCoinGeckoPrice('kinesis-silver');
         const ethUsd = await fetchBinancePrice('ETHUSDT');
         if (slvUsd && ethUsd) basePrice = slvUsd / ethUsd;
      } else {
         const pd = await ora.getLatestPrice(aid);
         const usd = Number(pd.price) / Math.pow(10, Number(pd.decimals));
         basePrice = Math.max(0.00001, usd / 3000);
      }
    } catch (err) {
      console.warn(`    Price sync failed for #${aid}, using fallback.`, err.message);
    }

    const saved = load();
    if (saved && saved[aid] && saved[aid].candles && saved[aid].candles.length > 10) {
      market[aid] = {
        ...saved[aid],
        isActive: a.isActive,
        totalSupply: ethers.formatEther(a.totalSupply),
        tokenAddress: a.tokenContract,
        name, symbol: sym
      };
    } else {
      const { candles, lastPrice } = genCandles(basePrice);
      market[aid] = {
        tokenAddress: a.tokenContract,
        name, symbol: sym,
        totalSupply: ethers.formatEther(a.totalSupply),
        isActive: a.isActive,
        currentPrice: +lastPrice.toFixed(8),
        candles, trades: [],
      };
    }
    console.log(`  Synced Asset #${aid}: ${sym} @ ${market[aid].currentPrice} ETH`);
    save();
    return market[aid];
  } catch (e) {
    console.error(`  Failed to sync asset #${aid}:`, e.message);
    return null;
  }
}

// ========== INIT ==========
async function init() {
  console.log('Initializing market data...');
  const reg = new ethers.Contract(ADDRS.REGISTRY, REG_ABI, provider);

  let ids;
  try { ids = await reg.getAllAssetIds(); } catch { ids = []; }

  for (const id of ids) {
    await fetchAssetFromChain(Number(id));
  }

  // Ensure deployer is KYC-approved so it can receive sold tokens
  try {
    const cm = new ethers.Contract(ADDRS.COMPLIANCE, CMP_ABI, wallet);
    const approved = await cm.isApproved(DEPLOYER);
    if (!approved) {
      console.log('Approving deployer for compliance...');
      const tx = await cm.manualApprove(DEPLOYER);
      await tx.wait();
      console.log('Deployer approved.');
    }
  } catch (e) { console.error('Compliance check:', e.message); }

  save();
  console.log('Market initialized with', Object.keys(market).length, 'assets.');

  // Start external API price updater
  setInterval(updateExternalPrices, 15000);
}

// ========== EXTERNAL API SYNC ==========
async function fetchBinancePrice(symbol) {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    if (!res.ok) return null;
    const data = await res.json();
    return parseFloat(data.price);
  } catch { return null; }
}

async function fetchCoinGeckoPrice(id) {
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    if (!res.ok) return null;
    const data = await res.json();
    return parseFloat(data[id].usd);
  } catch { return null; }
}

async function updateExternalPrices() {
  try {
    // Check if we have any PAXG, SLVR, or BTC assets to update
    const needsExternal = Object.values(market).some(a => ['PAXG', 'GOLD', 'BTC', 'SLVR', 'SILVER'].includes(a.symbol.toUpperCase()));
    if (!needsExternal) return;

    const ethUsdt = await fetchBinancePrice('ETHUSDT');
    if (!ethUsdt) return;

    let paxgUsdt = null;
    let btcUsdt = null;
    let slvrUsdt = null;

    for (const [id, d] of Object.entries(market)) {
      const sym = d.symbol.toUpperCase();
      let newPriceEth = null;

      if (sym === 'PAXG' || sym === 'GOLD') {
        if (!paxgUsdt) paxgUsdt = await fetchBinancePrice('PAXGUSDT');
        if (paxgUsdt) newPriceEth = paxgUsdt / ethUsdt;
      } else if (sym === 'BTC') {
        if (!btcUsdt) btcUsdt = await fetchBinancePrice('BTCUSDT');
        if (btcUsdt) newPriceEth = btcUsdt / ethUsdt;
      } else if (sym === 'SLVR' || sym === 'SILVER') {
        if (!slvrUsdt) slvrUsdt = await fetchCoinGeckoPrice('kinesis-silver');
        if (slvrUsdt) newPriceEth = slvrUsdt / ethUsdt;
      }

      if (newPriceEth !== null) {
        // Record as a synthetic trade to update the chart candle
        recordTrade(id, Math.random() > 0.5 ? 'buy' : 'sell', newPriceEth, 0, '0xExternalMarketSync', null);
      }
    }
  } catch (e) {
    console.error('External API sync error:', e.message);
  }
}


// ========== ZK-KYC PROOF ==========
// Real proofs only. Inputs are self-declared in this demo (no KYC provider signature).
app.post('/generate-proof', async (req, res) => {
  const { walletAddress, age } = req.body; // documentId from older clients is ignored
  let norm;
  try { norm = ethers.getAddress(walletAddress); } catch { return res.status(400).json({ error: 'Invalid wallet address' }); }
  const ageNum = Number(age);

  try {
    console.log(`Generating ZK proof for ${norm}`);
    const { proof, publicInputs } = generateProof(norm, ageNum);
    res.json({ proof, publicInputs });
  } catch (e) {
    if (e instanceof KycRequirementError) return res.status(400).json({ error: e.message });
    console.error('Proof generation failed:', e.message);
    res.status(500).json({ error: 'Proof generation failed. Please try again later.' });
  }
});

// ========== CONFIG ==========
app.get('/api/config', (req, res) => {
  res.json({ deployer: DEPLOYER, chainId: CHAIN_ID, contracts: ADDRS, zk: toolVersions() });
});

// ========== MARKET API ==========
app.get('/api/assets', (req, res) => {
  const assets = Object.entries(market)
    .filter(([id, d]) => d && d.candles) // Only return fully synced assets
    .map(([id, d]) => {
      const c = d.candles || [];
      const price24hAgo = c.length > 96 ? c[c.length - 96].close : c[0]?.open || d.currentPrice || 0;
      const currentPrice = d.currentPrice || 0;
      const change24h = price24hAgo > 0 ? ((currentPrice - price24hAgo) / price24hAgo * 100) : 0;
      const vol = c.slice(-96).reduce((s, x) => s + (x.volume || 0), 0);
      return {
        id: +id, name: d.name || 'Unknown', symbol: d.symbol || '???', tokenAddress: d.tokenAddress,
        isActive: !!d.isActive, totalSupply: d.totalSupply || "0",
        currentPrice: currentPrice, change24h: +change24h.toFixed(2), volume24h: vol,
        marketCap: +(currentPrice * parseFloat(d.totalSupply || 0)).toFixed(4),
        imageUrl: d.imageUrl || null,
      };
    });
  res.json(assets);
});

app.post('/api/assets/sync', async (req, res) => {
  console.log('Manual sync requested...');
  const reg = new ethers.Contract(ADDRS.REGISTRY, REG_ABI, provider);
  let ids;
  try { ids = await reg.getAllAssetIds(); } catch { ids = []; }
  for (const id of ids) {
    await fetchAssetFromChain(Number(id));
  }
  res.json({ success: true, count: ids.length });
});

// Image URLs shown on the marketplace. Requires a fresh signature from an
// AssetRegistry admin or custodian (the admin page signs it).
const METADATA_SIG_MAX_AGE_MS = 10 * 60 * 1000;
function metadataMessage(assetId, imageUrl, issuedAt) {
  return `BharatRWA: set image for asset ${assetId}\nimageUrl: ${imageUrl}\nissuedAt: ${issuedAt}`;
}

app.post('/api/assets/:assetId/metadata', async (req, res) => {
  const assetId = Number(req.params.assetId);
  const { imageUrl, issuedAt, signature } = req.body;
  if (!Number.isInteger(assetId) || assetId < 0) return res.status(400).json({ error: 'Invalid asset id' });
  try {
    const u = new URL(imageUrl);
    if (u.protocol !== 'https:') throw new Error();
  } catch { return res.status(400).json({ error: 'imageUrl must be an https URL' }); }
  if (!signature || !issuedAt || Math.abs(Date.now() - Number(issuedAt)) > METADATA_SIG_MAX_AGE_MS) {
    return res.status(401).json({ error: 'Missing or expired signature' });
  }

  try {
    const signer = ethers.verifyMessage(metadataMessage(assetId, imageUrl, issuedAt), signature);
    const reg = new ethers.Contract(ADDRS.REGISTRY, ACCESS_ABI, provider);
    const [isAdmin, isCustodian] = await Promise.all([
      reg.hasRole(ethers.ZeroHash, signer),
      reg.hasRole(CUSTODIAN_ROLE, signer),
    ]);
    if (!isAdmin && !isCustodian) return res.status(403).json({ error: 'Signer is not a registry admin or custodian' });
  } catch (e) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  if (!market[assetId] || !market[assetId].candles) await fetchAssetFromChain(assetId);
  if (!market[assetId]) return res.status(404).json({ error: 'Asset not found' });
  market[assetId].imageUrl = imageUrl;
  save();
  res.json({ success: true, imageUrl });
});

app.get('/api/market/:assetId', (req, res) => {
  const d = market[req.params.assetId];
  if (!d) return res.status(404).json({ error: 'Asset not found' });
  const c = d.candles;
  const p24 = c.length > 96 ? c[c.length - 96].close : c[0]?.open || d.currentPrice;
  const ch = ((d.currentPrice - p24) / p24 * 100);
  const vol = c.slice(-96).reduce((s, x) => s + x.volume, 0);
  const hi = Math.max(...c.slice(-96).map(x => x.high));
  const lo = Math.min(...c.slice(-96).map(x => x.low));
  const ob = genOrderBook(d.currentPrice);
  res.json({
    name: d.name, symbol: d.symbol, tokenAddress: d.tokenAddress,
    totalSupply: d.totalSupply, isActive: d.isActive,
    currentPrice: d.currentPrice, change24h: +ch.toFixed(2),
    high24h: +hi.toFixed(8), low24h: +lo.toFixed(8),
    volume24h: vol, marketCap: +(d.currentPrice * parseFloat(d.totalSupply)).toFixed(4),
    candles: c, trades: d.trades.slice(0, 50), orderBook: ob,
    imageUrl: d.imageUrl || null,
  });
});

// ========== BUY ==========
// The client first sends ETH to DEPLOYER, then posts the tx hash. We check the
// payment on-chain (sender, recipient, amount, age, not used before) and mint.
const isTxHash = (h) => typeof h === 'string' && /^0x[0-9a-fA-F]{64}$/.test(h);

async function loadTx(hash) {
  const [tx, receipt] = await Promise.all([provider.getTransaction(hash), provider.getTransactionReceipt(hash)]);
  const block = receipt ? await provider.getBlock(receipt.blockNumber) : null;
  return { tx, receipt, block };
}

app.post('/buy', async (req, res) => {
  const { walletAddress, assetId, amount, txHash } = req.body;
  const d = market[assetId];
  if (!d) return res.status(404).json({ error: 'Asset not found' });
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0 || amountNum > 1e9) return res.status(400).json({ error: 'Invalid amount' });
  if (!isTxHash(txHash)) return res.status(400).json({ error: 'Payment transaction hash required' });
  let buyer;
  try { buyer = ethers.getAddress(walletAddress); } catch { return res.status(400).json({ error: 'Invalid wallet address' }); }
  if (!usedTxs.claim(txHash)) return res.status(409).json({ error: 'This payment has already been used' });

  try {
    const chain = await loadTx(txHash);
    verifyBuyPayment({
      ...chain, buyer, deployer: DEPLOYER,
      minValueWei: minPaymentWei(amountNum, d.currentPrice),
      now: Math.floor(Date.now() / 1000),
    });

    const tok = new ethers.Contract(ethers.getAddress(d.tokenAddress), TOK_ABI, wallet);
    console.log(`BUY: Minting ${amountNum} ${d.symbol} to ${buyer} (payment ${txHash})`);
    const tx = await tok.mint(buyer, ethers.parseEther(amountNum.toString()));
    await tx.wait(1);
    usedTxs.persist();

    recordTrade(assetId, 'buy', d.currentPrice, amountNum, buyer, tx.hash);
    res.json({ success: true, txHash: tx.hash, newPrice: market[assetId].currentPrice });
  } catch (e) {
    usedTxs.release(txHash);
    if (e instanceof TradeError) return res.status(400).json({ error: e.message });
    console.error('Buy error:', e.message);
    res.status(500).json({ error: 'Buy failed: ' + (e.shortMessage || e.message) });
  }
});

// ========== SELL ==========
// The client first transfers tokens to DEPLOYER from their own wallet, then posts
// the tx hash. The amount paid out is read from the on-chain Transfer event.
app.post('/sell', async (req, res) => {
  const { walletAddress, assetId, txHash } = req.body;
  const d = market[assetId];
  if (!d) return res.status(404).json({ error: 'Asset not found' });
  if (!isTxHash(txHash)) return res.status(400).json({ error: 'Token transfer transaction hash required' });
  let seller;
  try { seller = ethers.getAddress(walletAddress); } catch { return res.status(400).json({ error: 'Invalid wallet address' }); }
  if (!usedTxs.claim(txHash)) return res.status(409).json({ error: 'This transfer has already been used' });

  try {
    const chain = await loadTx(txHash);
    const amountWei = verifySellTransfer({
      ...chain, token: d.tokenAddress, seller, deployer: DEPLOYER, now: Math.floor(Date.now() / 1000),
    });
    const amount = Number(ethers.formatEther(amountWei));
    const ethAmount = d.currentPrice * amount;
    const payout = ethers.parseEther(ethAmount.toFixed(18));
    if ((await provider.getBalance(DEPLOYER)) < payout) {
      throw new TradeError('The demo exchange is out of test ETH; try again later');
    }

    console.log(`SELL: Paying ${ethAmount.toFixed(8)} ETH to ${seller} for ${amount} ${d.symbol} (transfer ${txHash})`);
    const tx = await wallet.sendTransaction({ to: seller, value: payout });
    await tx.wait(1);
    usedTxs.persist();

    recordTrade(assetId, 'sell', d.currentPrice, amount, seller, txHash);
    res.json({ success: true, txHash, ethTxHash: tx.hash, ethReceived: ethAmount, newPrice: market[assetId].currentPrice });
  } catch (e) {
    usedTxs.release(txHash);
    if (e instanceof TradeError) return res.status(400).json({ error: e.message });
    console.error('Sell error:', e.message);
    res.status(500).json({ error: 'Sell failed: ' + (e.shortMessage || e.message) });
  }
});

// ========== START ==========
try { prepareCircuit(); } catch (e) { console.error('ZK circuit setup failed:', e.message); }

init().then(() => {
  app.listen(PORT, () => console.log(`BharatRWA Exchange running on port ${PORT}`));
}).catch(e => {
  console.error('Init failed:', e);
  app.listen(PORT, () => console.log(`Server running (init failed) on port ${PORT}`));
});
