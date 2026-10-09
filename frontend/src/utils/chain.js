// Read-only chain helpers that work without a connected wallet.

import { ethers } from "ethers";
import { BACKEND_URL, SEPOLIA } from "@/config";

let readProvider;

/** Shared read-only Sepolia provider (public RPC). */
export function getReadProvider() {
  if (!readProvider) {
    readProvider = new ethers.JsonRpcProvider(SEPOLIA.rpcUrl, SEPOLIA.chainId, { staticNetwork: true });
  }
  return readProvider;
}

let configPromise;

/** Backend config ({ deployer, chainId, contracts }). Cached; rejects if the backend is unreachable. */
export function getBackendConfig() {
  if (!configPromise) {
    configPromise = fetch(`${BACKEND_URL}/api/config`)
      .then((r) => {
        if (!r.ok) throw new Error(`Backend returned ${r.status}`);
        return r.json();
      })
      .catch((e) => {
        configPromise = undefined; // allow retry
        throw e;
      });
  }
  return configPromise;
}

/** fetch() that reports slow responses, for the free-tier backend that sleeps when idle. */
export async function fetchBackend(path, { onSlow, slowAfterMs = 4000, ...init } = {}) {
  const timer = onSlow ? setTimeout(onSlow, slowAfterMs) : null;
  try {
    return await fetch(`${BACKEND_URL}${path}`, init);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const shortAddress = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
