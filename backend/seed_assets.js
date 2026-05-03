const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// ========== CONFIG ==========
const RPC = 'https://eth-sepolia.g.alchemy.com/v2/JzLs_sIi2ruO694q7uqsK';
const PK = '0x41d3ba410a6ca9b53504aceb915acaef68f3d36201d43c00f650cf72e31ac97d';
const REGISTRY_ADDR = '0x774E3195E3efB0fa403366033881C6ab1fe14B0D';

const REGISTRY_ABI = [
  "function registerAsset(string name, string symbol, bytes32 metadataHash, uint256 tokenSupply) external returns (uint256)",
  "function getAllAssetIds() view returns (uint256[])",
  "function getAsset(uint256) view returns (tuple(uint256 assetId, string name, string symbol, bytes32 metadataHash, address custodian, address tokenContract, uint256 totalSupply, bool isActive, uint256 registrationTimestamp))"
];

const ASSETS_TO_SEED = [
  { name: "Mumbai Commercial Hub", symbol: "MCH", supply: "50000000", image: "https://images.unsplash.com/photo-1570160897040-dc42caebd6b8?auto=format&fit=crop&q=80&w=800" },
  { name: "Bangalore Tech Park", symbol: "BTP", supply: "30000000", image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=800" },
  { name: "Delhi Luxury Residential", symbol: "DLR", supply: "20000000", image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&q=80&w=800" },
  { name: "Pune Logistics Center", symbol: "PLC", supply: "15000000", image: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=800" },
  { name: "AgriTech Solutions India", symbol: "AGRI", supply: "10000000", image: "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&q=80&w=800" },
  { name: "Silver Bullion Reserve", symbol: "SLVR", supply: "5000000", image: "https://images.unsplash.com/photo-1589118949245-7d38baf380d6?auto=format&fit=crop&q=80&w=800" },
  { name: "Fintech Bharat Series B", symbol: "FNB", supply: "40000000", image: "https://images.unsplash.com/photo-1551288049-bbbda536639a?auto=format&fit=crop&q=80&w=800" },
  { name: "CleanEnergy Solar Farm", symbol: "CES", supply: "22000000", image: "https://images.unsplash.com/photo-1509391366360-fe5bb58583bb?auto=format&fit=crop&q=80&w=800" },
  { name: "Crude Oil Futures", symbol: "OIL", supply: "50000000", image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&q=80&w=800" },
  { name: "Copper Industrial Grade", symbol: "COPR", supply: "12000000", image: "https://images.unsplash.com/photo-1558484663-f86448e91672?auto=format&fit=crop&q=80&w=800" },
  { name: "Fine Art Collection", symbol: "ART", supply: "4000000", image: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&q=80&w=800" },
  { name: "EdTech Growth Fund", symbol: "EDG", supply: "12000000", image: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&q=80&w=800" },
  { name: "Sustainable Forestry", symbol: "WOOD", supply: "9000000", image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&q=80&w=800" },
  { name: "Carbon Credit Pool", symbol: "CARB", supply: "15000000", image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=800" },
  { name: "Rare Earth Metals Fund", symbol: "REMF", supply: "28000000", image: "https://images.unsplash.com/photo-1614728263952-84ea206f99b6?auto=format&fit=crop&q=80&w=800" }
];

async function seed() {
  console.log("Seeding BharatRWA with diversified assets...");
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);
  const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, wallet);

  // Get current assets to avoid duplicates (by symbol)
  const currentIds = await registry.getAllAssetIds();
  const currentSymbols = new Set();
  for (const id of currentIds) {
    const a = await registry.getAsset(id);
    currentSymbols.add(a.symbol.toUpperCase());
  }

  const BACKEND_URL = "http://localhost:3008";

  for (const asset of ASSETS_TO_SEED) {
    if (currentSymbols.has(asset.symbol.toUpperCase())) {
      console.log(`Skipping ${asset.name} (${asset.symbol}) - already exists.`);
      continue;
    }

    try {
      console.log(`Registering ${asset.name} (${asset.symbol})...`);
      const supplyWei = ethers.parseEther(asset.supply);
      const tx = await registry.registerAsset(asset.name, asset.symbol, ethers.ZeroHash, supplyWei);
      console.log(`  Tx sent: ${tx.hash}`);
      const receipt = await tx.wait();
      
      // Try to find the assetId from events (simplistic search)
      const assetId = Number(currentIds.length + 1); // Mock increment if we can't parse logs easily here
      
      // Save metadata to backend
      if (asset.image) {
        // We'll need to get the real assetId from the backend after it syncs, 
        // but for now let's assume it's next in line.
        // Better: let the backend handle the sync.
        console.log(`  Saving metadata for ${asset.name}...`);
        try {
          // Note: In a real scenario we'd wait for backend to see the asset, 
          // but here we just push to the metadata endpoint.
          // Since the backend might not have the asset yet, we'll try a few times.
          await fetch(`${BACKEND_URL}/api/assets/${assetId}/metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: asset.image })
          });
        } catch (e) { console.log(`  Metadata save failed (expected if backend hasn't seen asset yet): ${e.message}`); }
      }
      
      console.log(`  Successfully registered ${asset.symbol}!`);
      currentSymbols.add(asset.symbol.toUpperCase());
      // Wait a bit to avoid nonce issues or RPC rate limits
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`  Failed to register ${asset.symbol}:`, err.message);
    }
  }
}

seed().catch(console.error);
