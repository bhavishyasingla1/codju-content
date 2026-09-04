import { createClient } from '@supabase/supabase-js';

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '2df51fcfaedf96d9b76335ea778a08b7';
const CF_EMAIL = process.env.CLOUDFLARE_EMAIL || 'bhavishyasingla2005@gmail.com';
const CF_API_KEY = process.env.CLOUDFLARE_API_KEY || 'cfk_Q78IYMkuzZofYFEhUrQqOcxDePw1TTU8hSlNtMwQb9e4baea';

const D1_DB_NAME = 'codju-content-db';
const R2_BUCKET_NAME = 'codju-content-assets';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nbehjvipntthyttxgutt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iZWhqdmlwbnR0aHl0dHhndXR0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzUwMDU2OSwiZXhwIjoyMDk5MDc2NTY5fQ.kkdGUo8Rm8rplHLCbQpG5yfnx4Ei6sOLY-kGRJxvoz8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

const cfHeaders = {
  'X-Auth-Email': CF_EMAIL,
  'X-Auth-Key': CF_API_KEY,
  'Content-Type': 'application/json'
};

async function cfApi(endpoint, options = {}) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...cfHeaders,
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    const errMsg = data.errors?.map(e => `${e.code}: ${e.message}`).join(', ') || res.statusText;
    throw new Error(`Cloudflare API error [${res.status}] on ${endpoint}: ${errMsg}`);
  }
  return data.result;
}

// Ensure D1 database exists
async function ensureD1Database() {
  console.log(`Checking D1 database "${D1_DB_NAME}"...`);
  const dbs = await cfApi('/d1/database');
  const existing = dbs.find(db => db.name === D1_DB_NAME);
  if (existing) {
    console.log(`Found existing D1 database: ${existing.uuid}`);
    return existing.uuid;
  }

  console.log(`Creating D1 database "${D1_DB_NAME}"...`);
  const created = await cfApi('/d1/database', {
    method: 'POST',
    body: JSON.stringify({ name: D1_DB_NAME })
  });
  console.log(`Created D1 database successfully! ID: ${created.uuid}`);
  return created.uuid;
}

// Ensure R2 bucket exists
async function ensureR2Bucket() {
  console.log(`Checking R2 bucket "${R2_BUCKET_NAME}"...`);
  try {
    const res = await cfApi('/r2/buckets');
    const buckets = res.buckets || [];
    const existing = buckets.find(b => b.name === R2_BUCKET_NAME);
    if (existing) {
      console.log(`Found existing R2 bucket: ${R2_BUCKET_NAME}`);
      return;
    }
  } catch (err) {
    console.warn(`Could not list buckets: ${err.message}. Attempting creation...`);
  }

  try {
    await cfApi(`/r2/buckets/${R2_BUCKET_NAME}`, {
      method: 'PUT',
      body: JSON.stringify({ locationHint: 'apac' })
    });
    console.log(`Created R2 bucket "${R2_BUCKET_NAME}" successfully!`);
  } catch (err) {
    if (err.message.includes('already exists') || err.message.includes('10006')) {
      console.log(`R2 bucket "${R2_BUCKET_NAME}" already exists.`);
    } else {
      throw err;
    }
  }
}

// Upload object directly to R2 bucket via Cloudflare API
async function uploadToR2(key, buffer, contentType) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${R2_BUCKET_NAME}/objects/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'X-Auth-Email': CF_EMAIL,
      'X-Auth-Key': CF_API_KEY,
      'Content-Type': contentType || 'application/octet-stream'
    },
    body: buffer
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to upload to R2 (${key}): ${res.status} ${text}`);
  }
}

// Execute query on D1 database
async function queryD1(databaseId, sql, params = []) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${databaseId}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: cfHeaders,
    body: JSON.stringify({ sql, params })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    const errMsg = data.errors?.map(e => `${e.code}: ${e.message}`).join(', ') || res.statusText;
    throw new Error(`D1 query error on "${sql.substring(0, 50)}...": ${errMsg}`);
  }
  return data.result?.[0]?.results || [];
}

// Initialize tables in D1
async function initD1Schema(databaseId) {
  console.log('Initializing D1 schema...');

  const statements = [
    `CREATE TABLE IF NOT EXISTS content (
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
    );`,
    `CREATE INDEX IF NOT EXISTS idx_content_date ON content(date);`,
    `CREATE INDEX IF NOT EXISTS idx_content_status ON content(status);`,
    `CREATE TABLE IF NOT EXISTS month_notes (
      month_key TEXT PRIMARY KEY,
      notes TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );`
  ];

  for (const stmt of statements) {
    await queryD1(databaseId, stmt);
  }
  console.log('D1 schema initialized successfully!');
}

// Helper: parse base64 data URL into buffer and mime
function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return null;
  }
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!matches) return null;
  return {
    contentType: matches[1],
    buffer: Buffer.from(matches[2], 'base64')
  };
}

// Helper: extension from contentType
function getExtension(contentType, fallback = 'bin') {
  if (!contentType) return fallback;
  if (contentType.includes('pdf')) return 'pdf';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('svg')) return 'svg';
  return fallback;
}

// Process an asset object, migrating base64 data URL to R2
async function processAsset(asset, recordId, prefix = 'asset') {
  if (!asset) return null;
  if (typeof asset.url !== 'string' || !asset.url.startsWith('data:')) {
    return asset; // Already an HTTP URL or null
  }

  const parsed = parseDataUrl(asset.url);
  if (!parsed) return asset;

  const ext = getExtension(parsed.contentType, asset.name ? asset.name.split('.').pop() : 'bin');
  const assetId = asset.id || ('a' + Math.random().toString(36).substr(2, 9));
  const key = `${prefix}_${recordId}_${assetId}.${ext}`;

  console.log(`Uploading asset ${key} (${Math.round(parsed.buffer.length / 1024)} KB, ${parsed.contentType}) to R2...`);
  await uploadToR2(key, parsed.buffer, parsed.contentType);

  return {
    ...asset,
    id: assetId,
    type: parsed.contentType,
    size: parsed.buffer.length,
    url: `/api/assets/${key}`
  };
}

// Main migration runner
async function runMigration() {
  console.log('=== STARTING CLOUDFLARE MIGRATION ===');

  // 1. Ensure D1 and R2
  const databaseId = await ensureD1Database();
  await ensureR2Bucket();

  // 2. Initialize Schema
  await initD1Schema(databaseId);

  // 3. Migrate month_notes
  console.log('Fetching month_notes from Supabase...');
  const { data: notes, error: notesErr } = await supabase.from('month_notes').select('*');
  if (notesErr) {
    console.error('Error reading notes from Supabase:', notesErr);
  } else {
    console.log(`Found ${notes.length} month notes.`);
    for (const note of notes) {
      await queryD1(
        databaseId,
        `INSERT INTO month_notes (month_key, notes, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(month_key) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at;`,
        [note.month_key, note.notes || '', note.updated_at || new Date().toISOString()]
      );
      console.log(`Migrated note for month: ${note.month_key}`);
    }
  }

  // 4. Migrate content items
  console.log('Fetching content items from Supabase...');
  const { data: contentItems, error: contentErr } = await supabase.from('content').select('*');
  if (contentErr) {
    throw new Error(`Failed to fetch content from Supabase: ${contentErr.message}`);
  }

  console.log(`Found ${contentItems.length} content items to migrate.`);

  for (const item of contentItems) {
    console.log(`Processing item "${item.name}" (ID: ${item.id})...`);

    // Process assets array
    const rawAssets = Array.isArray(item.assets) ? item.assets : [];
    const migratedAssets = [];
    for (let i = 0; i < rawAssets.length; i++) {
      const a = rawAssets[i];
      const migrated = await processAsset(a, item.id, `asset_${i + 1}`);
      migratedAssets.push(migrated);
    }

    // Process thumbnail asset
    let migratedThumb = item.thumbnail_asset;
    if (migratedThumb) {
      migratedThumb = await processAsset(migratedThumb, item.id, 'thumb');
    }

    // Process PDF asset
    let migratedPdf = item.pdf_asset;
    if (migratedPdf) {
      migratedPdf = await processAsset(migratedPdf, item.id, 'pdf');
    }

    // Process feedback assets
    const rawFeedbackAssets = Array.isArray(item.feedback_assets) ? item.feedback_assets : [];
    const migratedFeedbackAssets = [];
    for (let i = 0; i < rawFeedbackAssets.length; i++) {
      const fbAsset = rawFeedbackAssets[i];
      const migrated = await processAsset(fbAsset, item.id, `fb_${i + 1}`);
      migratedFeedbackAssets.push(migrated);
    }

    // Upsert into D1
    await queryD1(
      databaseId,
      `INSERT INTO content (
        id, date, name, type, category, summary, caption, platform, status,
        assets, rich_text, script, thumbnail_asset, pdf_asset, feedback, feedback_assets, reviewed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        date = excluded.date,
        name = excluded.name,
        type = excluded.type,
        category = excluded.category,
        summary = excluded.summary,
        caption = excluded.caption,
        platform = excluded.platform,
        status = excluded.status,
        assets = excluded.assets,
        rich_text = excluded.rich_text,
        script = excluded.script,
        thumbnail_asset = excluded.thumbnail_asset,
        pdf_asset = excluded.pdf_asset,
        feedback = excluded.feedback,
        feedback_assets = excluded.feedback_assets,
        reviewed_at = excluded.reviewed_at,
        updated_at = excluded.updated_at;`,
      [
        item.id,
        item.date,
        item.name,
        item.type,
        item.category || 'social',
        item.summary || '',
        item.caption || '',
        item.platform || 'instagram',
        item.status || 'draft',
        JSON.stringify(migratedAssets),
        item.rich_text || '',
        item.script || '',
        migratedThumb ? JSON.stringify(migratedThumb) : null,
        migratedPdf ? JSON.stringify(migratedPdf) : null,
        item.feedback || '',
        JSON.stringify(migratedFeedbackAssets),
        item.reviewed_at || null,
        item.created_at || new Date().toISOString(),
        item.updated_at || new Date().toISOString()
      ]
    );

    console.log(`Saved "${item.name}" to Cloudflare D1.`);
  }

  // 5. Verification count
  const contentCount = await queryD1(databaseId, 'SELECT COUNT(*) as count FROM content;');
  const notesCount = await queryD1(databaseId, 'SELECT COUNT(*) as count FROM month_notes;');

  console.log('\n=== MIGRATION VERIFICATION ===');
  console.log(`Total rows in D1 content: ${contentCount[0]?.count}`);
  console.log(`Total rows in D1 month_notes: ${notesCount[0]?.count}`);
  console.log(`D1 Database ID: ${databaseId}`);
  console.log(`R2 Bucket Name: ${R2_BUCKET_NAME}`);
  console.log('=== MIGRATION COMPLETE ===');

  return { databaseId, bucketName: R2_BUCKET_NAME };
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
