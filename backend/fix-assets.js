const { ethers } = require("ethers");

const RPC = process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/JzLs_sIi2ruO694q7uqsK';
const PK = process.env.PRIVATE_KEY || '0x41d3ba410a6ca9b53504aceb915acaef68f3d36201d43c00f650cf72e31ac97d';

const ADDRS = {
  REGISTRY: '0x774E3195E3efB0fa403366033881C6ab1fe14B0D',
};

const REG_ABI = [
  'function deactivateAsset(uint256) external',
  'function registerAsset(string,string,bytes32,uint256) external',
];

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PK, provider);
const registry = new ethers.Contract(ADDRS.REGISTRY, REG_ABI, wallet);

async function main() {
  console.log("Deactivating old broken Asset #4 and #5...");
  let tx = await registry.deactivateAsset(4);
  await tx.wait();
  console.log("Deactivated #4");
  
  tx = await registry.deactivateAsset(5);
  await tx.wait();
  console.log("Deactivated #5");

  console.log("Registering fixed Gold...");
  const supplyGold = ethers.parseEther("1000000"); // 1M tokens in wei
  tx = await registry.registerAsset("Tokenized Gold", "PAXG", ethers.id("gold"), supplyGold);
  await tx.wait();
  console.log("Gold registered: ", tx.hash);

  console.log("Registering fixed Silver...");
  const supplySilver = ethers.parseEther("5000000"); // 5M tokens in wei
  tx = await registry.registerAsset("Tokenized Silver", "SLVR", ethers.id("silver"), supplySilver);
  await tx.wait();
  console.log("Silver registered: ", tx.hash);
}

main().catch(console.error);
