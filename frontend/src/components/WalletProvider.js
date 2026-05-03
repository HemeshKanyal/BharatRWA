"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { ethers } from "ethers";

const WalletContext = createContext(null);

export const WalletProvider = ({ children }) => {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // The target chain for local development is Anvil (31337)
  // For Sepolia testnet, the chainId is 11155111
  const TARGET_CHAIN_ID = 11155111; // Sepolia

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask!");
      return;
    }

    try {
      setIsConnecting(true);
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      if (accounts.length > 0) {
        const connectedSigner = await web3Provider.getSigner();
        const network = await web3Provider.getNetwork();
        
        setProvider(web3Provider);
        setSigner(connectedSigner);
        setAddress(accounts[0]);
        setChainId(Number(network.chainId));

        // Prompt to switch network if not on Sepolia
        if (Number(network.chainId) !== TARGET_CHAIN_ID) {
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: ethers.toBeHex(TARGET_CHAIN_ID) }],
            });
          } catch (switchError) {
            console.error("Failed to switch network", switchError);
          }
        }
      }
    } catch (error) {
      console.error("Failed to connect wallet", error);
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts.length > 0) {
          setAddress(accounts[0]);
        } else {
          setAddress(null);
          setSigner(null);
        }
      });

      window.ethereum.on("chainChanged", (newChainId) => {
        setChainId(Number(newChainId));
        window.location.reload();
      });
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeAllListeners();
      }
    };
  }, []);

  return (
    <WalletContext.Provider value={{ provider, signer, address, chainId, isConnecting, connectWallet, TARGET_CHAIN_ID }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => useContext(WalletContext);
