// Testnet configuration. Everything here is public.

// Sepolia (Ethereum testnet)
export const CONTRACTS = {
  COMPLIANCE_MANAGER: "0x07bfd4e030Cf250597A898E9EF43110365c7dbAC",
  ASSET_REGISTRY: "0x774E3195E3efB0fa403366033881C6ab1fe14B0D",
  ASSET_ORACLE: "0x590AE2361F302B274a7FB7277E1f15A450BBF392",
  DIVIDEND_DISTRIBUTOR: "0x8E53f313a17C3f6347696Fd2C87B97cDdE52F52C",
  ZK_VERIFIER: "0x8F4Fd9427aB0E7C15386C8ac6007091f06A9A183",
  // Fill in after running bharat-rwa/script/DeployTokenV2.s.sol (null = not deployed yet).
  COMPLIANCE_MANAGER_V2: null,
  TOKEN_V2: null,
};

export const SEPOLIA = {
  chainId: 11155111,
  // Public read-only RPC, used when no wallet is connected.
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  explorer: "https://sepolia.etherscan.io",
};

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://hemeshkanyal-bharatrwa.hf.space";

// Solana devnet deployment (see solana/deployments/devnet.json)
export const SOLANA = {
  cluster: "devnet",
  rpcUrl: "https://api.devnet.solana.com",
  complianceProgram: "588hz1dHm9goLKBAt4yRwNaEDeuF97teDrjd2E6XdE9E",
  transferHookProgram: "AtGeNjNoNobDCBP6gvtgDK1gvsWkQe2Xm3F5RziJkS88",
  mint: "4PC4Qm73fAvQLQNjX6xg569nQBGJx1VkdY9aZ3E99Epy",
  mintSymbol: "BMOT",
  examples: {
    approved: { label: "Approved investor (IN)", address: "5FiHrKVLQTBexvt7F4ZNzdqroWgyrjhGZq2CuukMeWeB" },
    approved2: { label: "Approved investor (AE)", address: "bK7ZkDjXVzHB3k8YytprevFBPGxUCPhR8NvyXE3oeTJ" },
    frozen: { label: "Frozen by issuer", address: "2q3kVqsbRVfTtzQ8hUaUfJgP1Ftjc1VvDekAy4bhfEjZ" },
    outsider: { label: "Not allowlisted", address: "7hs7xQFtAih4Vzgu588oZNE4Rk2iqvJiYhNJNRzAxyi9" },
  },
  demoTransactions: [
    { label: "Approve investor: write allowlist entry + thaw account", sig: "3Tfxf8syRsHh1BX7p7rgQn7EZugk2FpE1BBTjW3Zu6poZQumzWSv3vgMR5dVKKiDDRKNvbL3HvSDsCj38V8KDmcD" },
    { label: "Mint 1,000 BMOT to an approved investor", sig: "52h2Xyiydo3sVMsTWS9ZG4aMo866aYqCk4daukG1VpHX8xSadnsRBEPrNbDMvsdaNgdFAHa9nKVJzzayrkL7Cjbq" },
    { label: "Transfer between allowlisted investors", sig: "ruBEr42GaEqEdyM7Txu9SoQB1dR2RH8g4JZnJCXXHVZtm4o77D4H4KrZQEMt5ZjWQ6Vh8vhutG2KPcHTPNn45jC" },
    { label: "Issuer freeze + legal hold", sig: "g5mXu39y6heJZ9ENGSx2ighKqpQ2jZN6dxNXkEpNERkKqSp28azGSMD2VQuQg4RMjtqLbTYmQ7Xv4gAHCC5stAT" },
    { label: "Forced transfer by the permanent delegate", sig: "4xT69PbhY8o48seWPE5sEBfDiXNJFJUjjBWnPitHV3PjkT4Z26jwEXGz76s4wpBbRYxjHiEiPGkPo6CXMjCJGa3c" },
  ],
};

export const solanaExplorer = (kind, id) => `https://explorer.solana.com/${kind}/${id}?cluster=devnet`;
export const sepoliaExplorer = (kind, id) => `${SEPOLIA.explorer}/${kind}/${id}`;

export const LINKS = {
  github: "https://github.com/HemeshKanyal/BharatRWA",
  limitations: "https://github.com/HemeshKanyal/BharatRWA#known-limitations",
  erc7943: "https://eips.ethereum.org/EIPS/eip-7943",
};
