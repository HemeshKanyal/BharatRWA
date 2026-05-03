const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { execSync } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// ========== CONFIG ==========
const PORT = process.env.PORT || 3008;
const RPC = process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/JzLs_sIi2ruO694q7uqsK';
const PK = process.env.PRIVATE_KEY || '0x41d3ba410a6ca9b53504aceb915acaef68f3d36201d43c00f650cf72e31ac97d';

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
  'function transferFrom(address,address,uint256) external returns (bool)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function totalSupply() view returns (uint256)',
];
const CMP_ABI = [
  'function isApproved(address) view returns (bool)',
  'function manualApprove(address) external',
];

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PK, provider);
const DEPLOYER = wallet.address;

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

// ========== INIT ==========
async function init() {
  console.log('Initializing market data...');
  const saved = load();
  const reg = new ethers.Contract(ADDRS.REGISTRY, REG_ABI, provider);
  const ora = new ethers.Contract(ADDRS.ORACLE, ORA_ABI, provider);

  let ids;
  try { ids = await reg.getAllAssetIds(); } catch { ids = []; }

  for (const id of ids) {
    const aid = Number(id);
    try {
      const a = await reg.getAsset(id);
      const tok = new ethers.Contract(a.tokenContract, TOK_ABI, provider);
      const sym = await tok.symbol();
      const name = await tok.name();

      // Get oracle price → convert to ETH (assuming $3000/ETH as fallback)
      let basePrice = 0.0001;
      
      // Override with external APIs for 24/7 assets
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
      } catch {}

      if (saved && saved[aid] && saved[aid].candles.length > 10) {
        market[aid] = saved[aid];
        market[aid].isActive = a.isActive; // always update active status
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
      console.log(`  Asset #${aid}: ${sym} @ ${market[aid].currentPrice} ETH`);
    } catch (e) {
      console.error(`  Failed asset #${aid}:`, e.message);
    }
  }

  // Ensure deployer is KYC-approved for transferFrom
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


// ========== PROOF ENDPOINT (existing) ==========
function computeWalletHash(addr) {
  const c = ethers.getAddress(addr);
  return ethers.keccak256(ethers.zeroPadValue(c, 32));
}

function computeWalletHash(addr) {
  const c = ethers.getAddress(addr);
  // We'll use a simple poseidon-like hash for the demo, 
  // but for now let's just use the numeric address as the identity
  return BigInt(c).toString();
}

async function generateZKProof(walletAddress, age) {
  const zkDir = path.join(__dirname, 'zk_kyc');
  const proverToml = path.join(zkDir, 'Prover.toml');
  
  // Convert address to Field
  const walletField = BigInt(walletAddress).toString();
  const secret = "123456789"; // In a real app, user would provide this
  
  // We need to compute the expected wallet hash. 
  // Since our circuit computes it, we'll run execute first to get it
  // or just hardcode the logic if it's simple. 
  // In our main.nr, it uses pedersen_hash.
  
  const tomlContent = `age = ${age}
kyc_verified = true
sanctioned = false
wallet = "${walletField}"
secret = "${secret}"
expected_wallet_hash = "${walletField}" # For simplicity, let's match wallet for now
`;

  fs.writeFileSync(proverToml, tomlContent);
  
  try {
    console.log("Running nargo execute...");
    execSync('nargo execute witness', { cwd: zkDir });
    
    console.log("Running bb prove...");
    // bb prove -b ./target/zk_kyc.json -w ./target/witness.gz -o ./target/proof
    execSync('bb prove -b ./target/zk_kyc.json -w ./target/witness.gz -o ./target/proof', { cwd: zkDir });
    
    const proof = '0x' + fs.readFileSync(path.join(zkDir, 'target', 'proof')).toString('hex');
    
    // In real scenario, we'd also read public_inputs
    // For now, we'll return the expected public input for the contract
    const publicInputs = [ethers.zeroPadValue(walletAddress, 32)];
    
    return { proof, publicInputs };
  } catch (err) {
    console.error("ZK Proof Generation failed:", err.message);
    throw err;
  }
}

app.post('/generate-proof', async (req, res) => {
  const { walletAddress, age, documentId } = req.body;
  if (!walletAddress || !age || !documentId) return res.status(400).json({ error: 'Missing params' });
  
  try {
    const norm = ethers.getAddress(walletAddress);
    console.log(`Generating REAL ZK proof for ${norm}, age: ${age}`);
    
    const { proof, publicInputs } = await generateZKProof(norm, age);
    
    res.json({ proof, publicInputs });
  } catch (e) {
    res.status(500).json({ error: "ZK Proof Generation Failed: " + e.message });
  }
});

// ========== MARKET API ==========
app.get('/api/assets', (req, res) => {
  const assets = Object.entries(market).map(([id, d]) => {
    const c = d.candles;
    const price24hAgo = c.length > 96 ? c[c.length - 96].close : c[0]?.open || d.currentPrice;
    const change24h = ((d.currentPrice - price24hAgo) / price24hAgo * 100);
    const vol = c.slice(-96).reduce((s, x) => s + x.volume, 0);
    return {
      id: +id, name: d.name, symbol: d.symbol, tokenAddress: d.tokenAddress,
      isActive: d.isActive, totalSupply: d.totalSupply,
      currentPrice: d.currentPrice, change24h: +change24h.toFixed(2), volume24h: vol,
      marketCap: +(d.currentPrice * parseFloat(d.totalSupply)).toFixed(4),
      imageUrl: d.imageUrl || null,
    };
  });
  res.json(assets);
});

app.post('/api/assets/:assetId/metadata', (req, res) => {
  const { assetId } = req.params;
  const { imageUrl } = req.body;
  if (!market[assetId]) {
    // If not in market yet (just registered), create a placeholder
    market[assetId] = { imageUrl };
  } else {
    market[assetId].imageUrl = imageUrl;
  }
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
app.post('/buy', async (req, res) => {
  const { walletAddress, assetId, amount, txHash } = req.body;
  if (!walletAddress || !assetId || !amount) return res.status(400).json({ error: 'Missing params' });
  const d = market[assetId];
  if (!d) return res.status(404).json({ error: 'Asset not found' });

  try {
    const norm = ethers.getAddress(walletAddress);
    const normToken = ethers.getAddress(d.tokenAddress);

    // Verify ETH tx if provided
    if (txHash) {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt || receipt.status !== 1) return res.status(400).json({ error: 'ETH tx failed or not found' });
    }

    // Mint tokens
    const tok = new ethers.Contract(normToken, TOK_ABI, wallet);
    console.log(`BUY: Minting ${amount} ${d.symbol} to ${norm}`);
    const tx = await tok.mint(norm, ethers.parseEther(amount.toString()));
    await tx.wait(1);
    console.log('Mint tx:', tx.hash);

    recordTrade(assetId, 'buy', d.currentPrice, amount, norm, tx.hash);

    res.json({ success: true, txHash: tx.hash, newPrice: market[assetId].currentPrice });
  } catch (e) {
    console.error('Buy error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== SELL ==========
app.post('/sell', async (req, res) => {
  const { walletAddress, assetId, amount } = req.body;
  if (!walletAddress || !assetId || !amount) return res.status(400).json({ error: 'Missing params' });
  const d = market[assetId];
  if (!d) return res.status(404).json({ error: 'Asset not found' });

  try {
    const norm = ethers.getAddress(walletAddress);
    const normToken = ethers.getAddress(d.tokenAddress);
    const ethAmount = d.currentPrice * amount;

    // Transfer tokens from user to deployer
    const tok = new ethers.Contract(normToken, TOK_ABI, wallet);
    console.log(`SELL: Transferring ${amount} ${d.symbol} from ${norm}`);
    const tx1 = await tok.transferFrom(norm, DEPLOYER, ethers.parseEther(amount.toString()));
    await tx1.wait(1);
    console.log('Transfer tx:', tx1.hash);

    // Send ETH back to user
    console.log(`SELL: Sending ${ethAmount.toFixed(8)} ETH to ${norm}`);
    const tx2 = await wallet.sendTransaction({ to: norm, value: ethers.parseEther(ethAmount.toFixed(8)) });
    await tx2.wait(1);
    console.log('ETH tx:', tx2.hash);

    recordTrade(assetId, 'sell', d.currentPrice, amount, norm, tx1.hash);

    res.json({ success: true, txHash: tx1.hash, ethTxHash: tx2.hash, ethReceived: ethAmount, newPrice: market[assetId].currentPrice });
  } catch (e) {
    console.error('Sell error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== LEGACY INVEST (keep backward compat) ==========
app.post('/invest', async (req, res) => {
  const { walletAddress, tokenAddress, amount } = req.body;
  if (!walletAddress || !tokenAddress || !amount) return res.status(400).json({ error: 'Missing params' });
  try {
    const nw = ethers.getAddress(walletAddress);
    const nt = ethers.getAddress(tokenAddress);
    const tok = new ethers.Contract(nt, TOK_ABI, wallet);
    const tx = await tok.mint(nw, ethers.parseEther(amount.toString()));
    await tx.wait(1);
    res.json({ success: true, txHash: tx.hash });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== START ==========
init().then(() => {
  app.listen(PORT, () => console.log(`BharatRWA Exchange running on port ${PORT}`));
}).catch(e => {
  console.error('Init failed:', e);
  app.listen(PORT, () => console.log(`Server running (init failed) on port ${PORT}`));
});
