import fs from 'node:fs';
import path from 'node:path';

// Cloudflare D1 Database Client for Node.js / Local Dev
if (typeof process !== 'undefined' && process.loadEnvFile) {
  try { process.loadEnvFile(); } catch {}
}

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '2df51fcfaedf96d9b76335ea778a08b7';
const CF_EMAIL = process.env.CLOUDFLARE_EMAIL || 'bhavishyasingla2005@gmail.com';
const CF_API_KEY = process.env.CLOUDFLARE_API_KEY || '';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const D1_DATABASE_ID = process.env.CLOUDFLARE_D1_DATABASE_ID || '9d2fba12-d01f-4260-867f-c384937fad63';
const R2_BUCKET_NAME = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'codju-content-assets';

// Local storage directory for fallback
const DEV_DATA_DIR = path.resolve(process.cwd(), '.dev-data');
const DEV_ASSETS_DIR = path.join(DEV_DATA_DIR, 'assets');
const DEV_SQLITE_FILE = path.join(DEV_DATA_DIR, 'local-d1.sqlite');

let localDbInstance = null;
let useLocalFallback = false;

function getAuthHeaders() {
  if (CF_API_TOKEN) {
    return {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    };
  }
  if (CF_API_KEY) {
    if (CF_API_KEY.startsWith('cfut_') || CF_API_KEY.startsWith('Bearer ')) {
      const token = CF_API_KEY.replace(/^Bearer\s+/i, '');
      return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
    }
    return {
      'X-Auth-Email': CF_EMAIL,
      'X-Auth-Key': CF_API_KEY,
      'Content-Type': 'application/json'
    };
  }
  return { 'Content-Type': 'application/json' };
}

async function getLocalDb() {
  if (localDbInstance) return localDbInstance;
  if (!fs.existsSync(DEV_DATA_DIR)) {
    fs.mkdirSync(DEV_DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DEV_ASSETS_DIR)) {
    fs.mkdirSync(DEV_ASSETS_DIR, { recursive: true });
  }

  const { DatabaseSync } = await import('node:sqlite');
  localDbInstance = new DatabaseSync(DEV_SQLITE_FILE);

  // Initialize SQLite schema
  localDbInstance.exec(`
    CREATE TABLE IF NOT EXISTS content (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT DEFAULT 'social',
      summary TEXT DEFAULT '',
      caption TEXT DEFAULT '',
      platform TEXT DEFAULT 'instagram',
      status TEXT NOT NULL DEFAULT 'draft',
      assets TEXT DEFAULT '[]',
      rich_text TEXT DEFAULT '',
      script TEXT DEFAULT '',
      thumbnail_asset TEXT DEFAULT NULL,
      pdf_asset TEXT DEFAULT NULL,
      feedback TEXT DEFAULT '',
      feedback_assets TEXT DEFAULT '[]',
      reviewed_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_content_date ON content(date);
    CREATE INDEX IF NOT EXISTS idx_content_status ON content(status);

    CREATE TABLE IF NOT EXISTS month_notes (
      month_key TEXT PRIMARY KEY,
      notes TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      user_email TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notification_logs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      metadata TEXT DEFAULT '{}',
      sent_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return localDbInstance;
}

export async function queryD1(sql, params = []) {
  if (!useLocalFallback && (CF_API_TOKEN || CF_API_KEY)) {
    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;
      const res = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ sql, params })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return data.result?.[0]?.results || [];
      }
      const errMsg = data.errors?.map(e => `${e.code}: ${e.message}`).join(', ') || res.statusText;
      if (errMsg.includes('10000') || errMsg.includes('9103') || errMsg.includes('Authentication')) {
        console.warn(`[Local Dev] Cloudflare D1 authentication failed (${errMsg}). Switching seamlessly to local SQLite fallback.`);
        useLocalFallback = true;
      } else {
        throw new Error(`D1 query error: ${errMsg}`);
      }
    } catch (err) {
      if (!useLocalFallback) {
        console.warn(`[Local Dev] Cloudflare D1 query error: ${err.message}. Falling back to local SQLite.`);
        useLocalFallback = true;
      }
    }
  }

  // Local SQLite fallback execution
  const db = await getLocalDb();
  const trimmed = sql.trim().toUpperCase();
  const isSelect = trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA');

  try {
    const stmt = db.prepare(sql);
    if (isSelect) {
      return stmt.all(...params);
    }
    stmt.run(...params);
    return [];
  } catch (err) {
    throw new Error(`Local SQLite query error: ${err.message}`);
  }
}

export async function uploadToR2(key, buffer, contentType) {
  if (!useLocalFallback && (CF_API_TOKEN || CF_API_KEY)) {
    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${R2_BUCKET_NAME}/objects/${encodeURIComponent(key)}`;
      const headers = getAuthHeaders();
      headers['Content-Type'] = contentType || 'application/octet-stream';
      const res = await fetch(url, {
        method: 'PUT',
        headers,
        body: buffer
      });
      if (res.ok) return;
    } catch {
      // Fallback to local
    }
  }

  // Local filesystem fallback
  if (!fs.existsSync(DEV_ASSETS_DIR)) {
    fs.mkdirSync(DEV_ASSETS_DIR, { recursive: true });
  }
  const safeFilename = key.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(DEV_ASSETS_DIR, safeFilename);
  fs.writeFileSync(filePath, buffer);
  // Store metadata
  fs.writeFileSync(`${filePath}.meta`, JSON.stringify({ contentType: contentType || 'application/octet-stream' }));
}

export async function getFromR2(key) {
  if (!useLocalFallback && (CF_API_TOKEN || CF_API_KEY)) {
    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${R2_BUCKET_NAME}/objects/${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || 'application/octet-stream';
        const buffer = Buffer.from(await res.arrayBuffer());
        return { buffer, contentType };
      }
    } catch {
      // Fallback to local
    }
  }

  // Local filesystem fallback
  const safeFilename = key.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(DEV_ASSETS_DIR, safeFilename);
  if (!fs.existsSync(filePath)) return null;

  const buffer = fs.readFileSync(filePath);
  let contentType = 'application/octet-stream';
  if (fs.existsSync(`${filePath}.meta`)) {
    try {
      const meta = JSON.parse(fs.readFileSync(`${filePath}.meta`, 'utf-8'));
      contentType = meta.contentType || contentType;
    } catch {}
  }
  return { buffer, contentType };
}

function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  if (typeof str !== 'string') return str;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export function mapToFrontend(row) {
  if (!row) return null;
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    type: row.type,
    category: row.category || 'social',
    summary: row.summary || '',
    caption: row.caption || '',
    platform: row.platform || 'instagram',
    status: row.status,
    assets: safeJsonParse(row.assets, []),
    richText: row.rich_text || '',
    script: row.script || '',
    thumbnailAsset: safeJsonParse(row.thumbnail_asset, null),
    pdfAsset: safeJsonParse(row.pdf_asset, null),
    feedback: row.feedback || '',
    feedbackAssets: safeJsonParse(row.feedback_assets, []),
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapToDb(item) {
  if (!item) return null;
  const now = new Date().toISOString();
  return {
    id: item.id,
    date: item.date,
    name: item.name,
    type: item.type,
    category: item.category || 'social',
    summary: item.summary || '',
    caption: item.caption || '',
    platform: item.platform || 'instagram',
    status: item.status || 'draft',
    assets: JSON.stringify(item.assets || []),
    rich_text: item.richText || '',
    script: item.script || '',
    thumbnail_asset: item.thumbnailAsset ? JSON.stringify(item.thumbnailAsset) : null,
    pdf_asset: item.pdfAsset ? JSON.stringify(item.pdfAsset) : null,
    feedback: item.feedback || '',
    feedback_assets: JSON.stringify(item.feedbackAssets || []),
    reviewed_at: item.reviewedAt || null,
    updated_at: now
  };
}
