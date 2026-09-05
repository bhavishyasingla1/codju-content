// Cloudflare D1 Database Client for Node.js / Local Dev
if (typeof process !== 'undefined' && process.loadEnvFile) {
  try { process.loadEnvFile(); } catch {}
}

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '2df51fcfaedf96d9b76335ea778a08b7';
const CF_EMAIL = process.env.CLOUDFLARE_EMAIL || 'bhavishyasingla2005@gmail.com';
const CF_API_KEY = process.env.CLOUDFLARE_API_KEY || '';
const D1_DATABASE_ID = process.env.CLOUDFLARE_D1_DATABASE_ID || '9d2fba12-d01f-4260-867f-c384937fad63';
const _R2_BUCKET_NAME = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'codju-content-assets';

export async function queryD1(sql, params = []) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Auth-Email': CF_EMAIL,
      'X-Auth-Key': CF_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql, params })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    const errMsg = data.errors?.map(e => `${e.code}: ${e.message}`).join(', ') || res.statusText;
    throw new Error(`D1 query error: ${errMsg}`);
  }
  return data.result?.[0]?.results || [];
}

export async function uploadToR2(key, buffer, contentType) {
  const workerUrl = `https://codju-content.bhavishyasingla2005.workers.dev/api/assets/upload`;
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: contentType || 'application/octet-stream' }), key);
  const res = await fetch(workerUrl, {
    method: 'POST',
    body: form
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`R2 upload error (${res.status}): ${errText}`);
  }
}

export async function getFromR2(key) {
  const workerUrl = `https://codju-content.bhavishyasingla2005.workers.dev/api/assets/${encodeURIComponent(key)}`;
  try {
    const res = await fetch(workerUrl);
    if (res.ok) {
      const contentType = res.headers.get('content-type') || 'application/octet-stream';
      const buffer = Buffer.from(await res.arrayBuffer());
      return { buffer, contentType };
    }
  } catch (err) {
    console.error(`Error fetching ${key} from worker R2:`, err.message);
  }
  return null;
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
