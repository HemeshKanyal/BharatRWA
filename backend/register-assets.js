const { ethers } = require("ethers");
const fs = require("fs");

const RPC = process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/JzLs_sIi2ruO694q7uqsK';
const PK = process.env.PRIVATE_KEY || '0x41d3ba410a6ca9b53504aceb915acaef68f3d36201d43c00f650cf72e31ac97d';

const ADDRS = {
  REGISTRY: '0x774E3195E3efB0fa403366033881C6ab1fe14B0D',
  ORACLE: '0x590AE2361F302B274a7FB7277E1f15A450BBF392',
};

const REG_ABI = [
  'function registerAsset(string,string,bytes32,uint256) external',
];

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PK, provider);
const registry = new ethers.Contract(ADDRS.REGISTRY, REG_ABI, wallet);

async function main() {
  console.log("Registering Gold...");
  let tx = await registry.registerAsset("Tokenized Gold Ounce", "PAXG", ethers.id("gold-meta"), 10000);
  await tx.wait();
  console.log("Gold registered: ", tx.hash);

  console.log("Registering Silver...");
  tx = await registry.registerAsset("Tokenized Silver Ounce", "SLVR", ethers.id("silver-meta"), 500000);
  await tx.wait();
  console.log("Silver registered: ", tx.hash);
}

main().catch(console.error);
