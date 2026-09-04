import url from 'url';
import generateAiHandler from './api/generate-ai.js';
import { queryD1, uploadToR2, getFromR2, mapToFrontend } from './api/db.js';

// Helper: parse raw request body with size protection
function parseRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const MAX_SIZE = 60 * 1024 * 1024; // 60MB max request size
    let received = 0;

    req.on('data', chunk => {
      received += chunk.length;
      if (received > MAX_SIZE) {
        req.destroy(new Error('Payload Too Large: Maximum allowed size is 60MB.'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', err => reject(err));
  });
}

// Helper: parse JSON request body
async function parseJsonBody(req) {
  const buf = await parseRawBody(req);
  if (!buf || buf.length === 0) return {};
  return JSON.parse(buf.toString('utf-8'));
}

// Normalize sender email to verified domain hibhavishya.in
function normalizeSenderEmail(senderEmail) {
  if (!senderEmail || senderEmail.includes('onboarding@resend.dev') || senderEmail.includes('@gmail.com')) {
    return 'Bhavishya <noreply@hibhavishya.in>';
  }
  // If user typed haibhavishya.in, map to verified domain hibhavishya.in
  if (senderEmail.includes('@haibhavishya.in')) {
    return senderEmail.replace('@haibhavishya.in', '@hibhavishya.in');
  }
  return senderEmail;
}


// Lossless pure Buffer multipart parser (preserves 100% byte fidelity without string encoding corruption)
function parseMultipartBuffer(rawBuf, boundary) {
  const boundaryBuf = Buffer.from('--' + boundary);
  const headerDelimBuf = Buffer.from('\r\n\r\n');
  
  let startIdx = rawBuf.indexOf(boundaryBuf);
  if (startIdx === -1) return null;
  
  while (startIdx !== -1) {
    const nextIdx = rawBuf.indexOf(boundaryBuf, startIdx + boundaryBuf.length);
    if (nextIdx === -1) break;
    
    // Chunk between boundaries
    const partBuf = rawBuf.subarray(startIdx + boundaryBuf.length + 2, nextIdx);
    const headerEnd = partBuf.indexOf(headerDelimBuf);
    
    if (headerEnd !== -1) {
      const headerStr = partBuf.subarray(0, headerEnd).toString('utf8');
      if (headerStr.includes('filename=')) {
        const nameMatch = headerStr.match(/filename="([^"]+)"/);
        const fileName = nameMatch ? nameMatch[1] : 'upload.bin';
        const typeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
        const fileType = typeMatch ? typeMatch[1].trim() : 'application/octet-stream';
        
        let dataEnd = partBuf.length;
        if (dataEnd >= 2 && partBuf[dataEnd - 2] === 0x0D && partBuf[dataEnd - 1] === 0x0A) {
          dataEnd -= 2;
        }
        const fileData = partBuf.subarray(headerEnd + 4, dataEnd);
        return { fileName, fileType, buffer: fileData };
      }
    }
    
    startIdx = nextIdx;
  }
  return null;
}

export function viteApiPlugin() {
  return {
    name: 'vite-api-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        (async () => {
          // Set standard CORS & security headers
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;

        // Route: POST /api/generate-ai
        if (pathname === '/api/generate-ai' && req.method === 'POST') {
          try {
            const body = await parseJsonBody(req);
            if (!body.apiKey) {
              try {
                const rows = await queryD1("SELECT value FROM app_settings WHERE key = 'groq_api_key' LIMIT 1;");
                if (rows?.[0]?.value) {
                  body.apiKey = rows[0].value;
                }
              } catch {}
            }
            const mockRes = {
              setHeader: (k, v) => res.setHeader(k, v),
              status: (code) => { res.statusCode = code; return mockRes; },
              json: (data) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
              },
              end: (data) => res.end(data)
            };
            await generateAiHandler({ method: 'POST', body }, mockRes);
          } catch (err) {
            console.error('Error generating AI content in dev:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Route: POST /api/assets/upload
        if (pathname === '/api/assets/upload' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const rawBody = await parseRawBody(req);
            const contentType = req.headers['content-type'] || '';

            // Handle multipart/form-data
            if (contentType.includes('multipart/form-data')) {
              // Extract boundary
              const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
              const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : null;

              if (!boundary) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Missing multipart boundary' }));
                return;
              }

              const parsedFile = parseMultipartBuffer(rawBody, boundary);
              if (!parsedFile || !parsedFile.buffer || parsedFile.buffer.length === 0) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'No file found in request' }));
                return;
              }

              const fileName = parsedFile.fileName;
              const fileType = parsedFile.fileType;
              const fileBuf = parsedFile.buffer;

              const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
              const assetId = 'a' + Math.random().toString(36).substr(2, 9);
              const key = `asset_${Date.now()}_${assetId}_${safeName}`;

              await uploadToR2(key, fileBuf, fileType);

              res.statusCode = 201;
              res.end(JSON.stringify({
                id: assetId,
                name: fileName,
                type: fileType,
                size: fileBuf.length,
                url: `/api/assets/${encodeURIComponent(key)}`,
                uploadedAt: new Date().toISOString()
              }));
              return;
            }

            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Expected multipart/form-data' }));
          } catch (err) {
            console.error('Error uploading asset in dev:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Route: GET /api/assets/:key
        if (pathname.startsWith('/api/assets/') && req.method === 'GET') {
          const key = decodeURIComponent(pathname.substring('/api/assets/'.length));
          if (!key) {
            res.statusCode = 400;
            res.end('Missing asset key');
            return;
          }
          try {
            const asset = await getFromR2(key);
            if (!asset) {
              res.statusCode = 404;
              res.end('Asset not found');
              return;
            }
            res.setHeader('Content-Type', asset.contentType);
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.end(asset.buffer);
          } catch (err) {
            console.error('Error fetching asset from R2 in dev:', err);
            res.statusCode = 500;
            res.end('Error loading asset');
          }
          return;
        }

        // Route: GET /api/content/sync
        if (pathname === '/api/content/sync' && req.method === 'GET') {
          const monthQuery = parsedUrl.query.month;
          const clientSince = parsedUrl.query.since;
          const clientCount = parsedUrl.query.count ? parseInt(parsedUrl.query.count, 10) : null;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

          try {
            let sql = 'SELECT * FROM content';
            const params = [];
            if (monthQuery) {
              sql += ' WHERE date LIKE ?';
              params.push(`${monthQuery}%`);
            }
            sql += ' ORDER BY date ASC;';

            const rows = await queryD1(sql, params);
            const items = (rows || []).map(mapToFrontend);

            let latest = null;
            if (items.length > 0) {
              const timestamps = items
                .map(i => i.updatedAt ? new Date(i.updatedAt).getTime() : 0)
                .filter(t => !isNaN(t) && t > 0);
              if (timestamps.length > 0) {
                latest = new Date(Math.max(...timestamps)).toISOString();
              }
            }

            if (clientSince && clientSince === latest && (clientCount === null || clientCount === items.length)) {
              res.end(JSON.stringify({
                changed: false,
                latest,
                count: items.length
              }));
              return;
            }

            res.end(JSON.stringify({
              changed: true,
              latest,
              count: items.length,
              items
            }));
          } catch (err) {
            console.error('Error syncing content in dev:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Route: POST /api/content/batch
        if (pathname === '/api/content/batch' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const body = await parseJsonBody(req);
            const { items } = body;
            if (!Array.isArray(items)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Items must be an array' }));
              return;
            }

            const now = new Date().toISOString();
            const inserted = [];

            for (const item of items) {
              const id = item.id || ('c' + Math.random().toString(36).substr(2, 9));
              const date = item.date || now.split('T')[0];
              const name = item.name || 'Untitled Content';
              const type = item.type || (item.category === 'written' ? 'blog' : 'static');
              const category = item.category || 'social';
              const summary = item.summary || '';
              const caption = item.caption || '';
              const platform = item.platform || (category === 'written' ? 'website' : 'instagram');
              const status = item.status || 'draft';
              const assets = JSON.stringify(item.assets || []);
              const richText = item.richText || '';
              const script = item.script || '';
              const thumb = item.thumbnailAsset ? JSON.stringify(item.thumbnailAsset) : null;
              const pdf = item.pdfAsset ? JSON.stringify(item.pdfAsset) : null;
              const feedback = item.feedback || '';
              const fbAssets = JSON.stringify(item.feedbackAssets || []);
              const reviewedAt = item.reviewedAt || null;

              await queryD1(`
                INSERT INTO content (
                  id, date, name, type, category, summary, caption, platform, status,
                  assets, rich_text, script, thumbnail_asset, pdf_asset, feedback, feedback_assets, reviewed_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
              `, [
                id, date, name, type, category, summary, caption, platform, status,
                assets, richText, script, thumb, pdf, feedback, fbAssets, reviewedAt, now, now
              ]);

              inserted.push({
                id, date, name, type, category, summary, caption, platform, status,
                assets: item.assets || [], richText, script,
                thumbnailAsset: item.thumbnailAsset || null,
                pdfAsset: item.pdfAsset || null,
                feedback, feedbackAssets: item.feedbackAssets || [],
                reviewedAt, createdAt: now, updatedAt: now
              });
            }

            res.end(JSON.stringify({ success: true, items: inserted }));
          } catch (err) {
            console.error('Error batch creating content in dev:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Route: GET /api/notes
        if (pathname === '/api/notes' && req.method === 'GET') {
          const monthQuery = parsedUrl.query.month;
          res.setHeader('Content-Type', 'application/json');

          if (!monthQuery) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing month parameter' }));
            return;
          }

          try {
            let rows = await queryD1('SELECT * FROM month_notes WHERE month_key = ?', [monthQuery]);
            let data = rows[0] || null;

            if (!data && monthQuery.length > 7) {
              const baseMonth = monthQuery.substring(0, 7);
              rows = await queryD1('SELECT * FROM month_notes WHERE month_key = ?', [baseMonth]);
              data = rows[0] || null;
            }

            if (!data) {
              res.end(JSON.stringify({ month_key: monthQuery, notes: '' }));
            } else {
              res.end(JSON.stringify(data));
            }
          } catch (err) {
            console.error('Error fetching month notes in dev:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Route: POST /api/notes
        if (pathname === '/api/notes' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const body = await parseJsonBody(req);
            const { month, notes } = body;

            if (!month) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing month parameter' }));
              return;
            }

            const now = new Date().toISOString();
            await queryD1(`
              INSERT INTO month_notes (month_key, notes, updated_at)
              VALUES (?, ?, ?)
              ON CONFLICT(month_key) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at;
            `, [month, notes || '', now]);

            const rows = await queryD1('SELECT * FROM month_notes WHERE month_key = ?', [month]);
            res.end(JSON.stringify(rows[0] || { month_key: month, notes: notes || '' }));
          } catch (err) {
            console.error('Error saving month notes in dev:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Route: GET /api/content
        if (pathname === '/api/content' && req.method === 'GET') {
          const monthQuery = parsedUrl.query.month;
          res.setHeader('Content-Type', 'application/json');

          try {
            let sql = 'SELECT * FROM content';
            const params = [];
            if (monthQuery) {
              sql += ' WHERE date LIKE ?';
              params.push(`${monthQuery}%`);
            }
            sql += ' ORDER BY date ASC;';

            const rows = await queryD1(sql, params);
            const content = (rows || []).map(mapToFrontend);
            res.end(JSON.stringify(content));
          } catch (err) {
            console.error('Error fetching content in dev:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Route: POST /api/content
        if (pathname === '/api/content' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const body = await parseJsonBody(req);
            const now = new Date().toISOString();

            const id = body.id || ('c' + Math.random().toString(36).substr(2, 9));
            const date = body.date || now.split('T')[0];
            const name = body.name || 'Untitled Content';
            const type = body.type || (body.category === 'written' ? 'blog' : 'static');
            const category = body.category || 'social';
            const summary = body.summary || '';
            const caption = body.caption || '';
            const platform = body.platform || (category === 'written' ? 'website' : 'instagram');
            const status = body.status || 'draft';
            const assets = JSON.stringify(body.assets || []);
            const richText = body.richText || '';
            const script = body.script || '';
            const thumb = body.thumbnailAsset ? JSON.stringify(body.thumbnailAsset) : null;
            const pdf = body.pdfAsset ? JSON.stringify(body.pdfAsset) : null;
            const feedback = body.feedback || '';
            const fbAssets = JSON.stringify(body.feedbackAssets || []);
            const reviewedAt = body.reviewedAt || null;

            await queryD1(`
              INSERT INTO content (
                id, date, name, type, category, summary, caption, platform, status,
                assets, rich_text, script, thumbnail_asset, pdf_asset, feedback, feedback_assets, reviewed_at, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            `, [
              id, date, name, type, category, summary, caption, platform, status,
              assets, richText, script, thumb, pdf, feedback, fbAssets, reviewedAt, now, now
            ]);

            const rows = await queryD1('SELECT * FROM content WHERE id = ?', [id]);
            res.statusCode = 201;
            res.end(JSON.stringify(mapToFrontend(rows[0])));
          } catch (err) {
            console.error('Error creating content in dev:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Route: PUT /api/content/:id
        if (pathname.startsWith('/api/content/') && req.method === 'PUT') {
          const id = pathname.substring('/api/content/'.length);
          res.setHeader('Content-Type', 'application/json');

          try {
            const body = await parseJsonBody(req);
            const now = new Date().toISOString();

            const existingRows = await queryD1('SELECT * FROM content WHERE id = ?', [id]);
            const existing = existingRows[0];
            if (!existing) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Content not found' }));
              return;
            }

            const updated = {
              date: body.date !== undefined ? body.date : existing.date,
              name: body.name !== undefined ? body.name : existing.name,
              type: body.type !== undefined ? body.type : existing.type,
              category: body.category !== undefined ? body.category : existing.category,
              summary: body.summary !== undefined ? body.summary : existing.summary,
              caption: body.caption !== undefined ? body.caption : existing.caption,
              platform: body.platform !== undefined ? body.platform : existing.platform,
              status: body.status !== undefined ? body.status : existing.status,
              assets: body.assets !== undefined ? JSON.stringify(body.assets) : existing.assets,
              rich_text: body.richText !== undefined ? body.richText : existing.rich_text,
              script: body.script !== undefined ? body.script : existing.script,
              thumbnail_asset: body.thumbnailAsset !== undefined ? (body.thumbnailAsset ? JSON.stringify(body.thumbnailAsset) : null) : existing.thumbnail_asset,
              pdf_asset: body.pdfAsset !== undefined ? (body.pdfAsset ? JSON.stringify(body.pdfAsset) : null) : existing.pdf_asset,
              feedback: body.feedback !== undefined ? body.feedback : existing.feedback,
              feedback_assets: body.feedbackAssets !== undefined ? JSON.stringify(body.feedbackAssets) : existing.feedback_assets,
              reviewed_at: body.reviewedAt !== undefined ? body.reviewedAt : existing.reviewed_at,
              updated_at: now
            };

            await queryD1(`
              UPDATE content SET
                date = ?, name = ?, type = ?, category = ?, summary = ?, caption = ?, platform = ?, status = ?,
                assets = ?, rich_text = ?, script = ?, thumbnail_asset = ?, pdf_asset = ?, feedback = ?,
                feedback_assets = ?, reviewed_at = ?, updated_at = ?
              WHERE id = ?;
            `, [
              updated.date, updated.name, updated.type, updated.category, updated.summary, updated.caption,
              updated.platform, updated.status, updated.assets, updated.rich_text, updated.script,
              updated.thumbnail_asset, updated.pdf_asset, updated.feedback, updated.feedback_assets,
              updated.reviewed_at, updated.updated_at, id
            ]);

            const rows = await queryD1('SELECT * FROM content WHERE id = ?', [id]);
            res.end(JSON.stringify(mapToFrontend(rows[0])));
          } catch (err) {
            console.error('Error updating content in dev:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Route: DELETE /api/content/:id
        if (pathname.startsWith('/api/content/') && req.method === 'DELETE') {
          const id = pathname.substring('/api/content/'.length);
          res.setHeader('Content-Type', 'application/json');

          try {
            await queryD1('DELETE FROM content WHERE id = ?', [id]);
            res.end(JSON.stringify({ success: true, id }));
          } catch (err) {
            console.error('Error deleting content in dev:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Route: GET/POST /api/settings
        if (pathname === '/api/settings') {
          res.setHeader('Content-Type', 'application/json');

          if (req.method === 'GET') {
            try {
              const rows = await queryD1('SELECT key, value FROM app_settings;');
              const map = {};
              for (const r of (rows || [])) map[r.key] = r.value;

              const adminEmail = map.admin_email || process.env.CLOUDFLARE_EMAIL || 'bhavishyasingla2005@gmail.com';
              const designerEmail = map.designer_email || '';
              const resendApiKey = map.resend_api_key || process.env.RESEND_API_KEY || '';
              const groqApiKey = map.groq_api_key || process.env.GROQ_API_KEY || '';
              const senderEmail = normalizeSenderEmail(map.sender_email);
              const dailyReminderEnabled = map.daily_reminder_enabled !== 'false';
              const dailyReminderTime = map.daily_reminder_time || '12:00';

              res.end(JSON.stringify({
                adminEmail,
                designerEmail,
                senderEmail,
                resendApiKeyConfigured: !!resendApiKey,
                resendApiKeyMasked: resendApiKey ? `${resendApiKey.substring(0, 6)}...` : '',
                groqApiKeyConfigured: !!groqApiKey,
                groqApiKeyMasked: groqApiKey ? `${groqApiKey.substring(0, 6)}...` : '',
                dailyReminderEnabled,
                dailyReminderTime,
              }));
            } catch (err) {
              console.error('Error getting settings in dev:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (req.method === 'POST') {
            try {
              const body = await parseJsonBody(req);
              const now = new Date().toISOString();

              if (body.adminEmail !== undefined) {
                await queryD1(
                  'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;',
                  ['admin_email', body.adminEmail.trim(), now]
                );
              }
              if (body.designerEmail !== undefined) {
                await queryD1(
                  'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;',
                  ['designer_email', body.designerEmail.trim(), now]
                );
              }
              if (body.senderEmail !== undefined) {
                await queryD1(
                  'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;',
                  ['sender_email', body.senderEmail.trim(), now]
                );
              }
              if (body.resendApiKey !== undefined && body.resendApiKey.trim()) {
                await queryD1(
                  'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;',
                  ['resend_api_key', body.resendApiKey.trim(), now]
                );
              }
              if (body.groqApiKey !== undefined && body.groqApiKey.trim()) {
                await queryD1(
                  'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;',
                  ['groq_api_key', body.groqApiKey.trim(), now]
                );
              }
              if (body.dailyReminderEnabled !== undefined) {
                await queryD1(
                  'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;',
                  ['daily_reminder_enabled', String(body.dailyReminderEnabled), now]
                );
              }
              if (body.dailyReminderTime !== undefined) {
                await queryD1(
                  'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;',
                  ['daily_reminder_time', body.dailyReminderTime.trim(), now]
                );
              }

              const rows = await queryD1('SELECT key, value FROM app_settings;');
              const map = {};
              for (const r of (rows || [])) map[r.key] = r.value;

              const resendApiKey = map.resend_api_key || process.env.RESEND_API_KEY || '';
              const groqApiKey = map.groq_api_key || process.env.GROQ_API_KEY || '';

              res.end(JSON.stringify({
                success: true,
                adminEmail: map.admin_email || process.env.CLOUDFLARE_EMAIL || 'bhavishyasingla2005@gmail.com',
                designerEmail: map.designer_email || '',
                senderEmail: normalizeSenderEmail(map.sender_email),
                resendApiKeyConfigured: !!resendApiKey,
                resendApiKeyMasked: resendApiKey ? `${resendApiKey.substring(0, 6)}...` : '',
                groqApiKeyConfigured: !!groqApiKey,
                groqApiKeyMasked: groqApiKey ? `${groqApiKey.substring(0, 6)}...` : '',
                dailyReminderEnabled: map.daily_reminder_enabled !== 'false',
                dailyReminderTime: map.daily_reminder_time || '12:00',
              }));
            } catch (err) {
              console.error('Error saving settings in dev:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        // Route: GET/POST /api/activity-logs
        if (pathname === '/api/activity-logs') {
          res.setHeader('Content-Type', 'application/json');

          if (req.method === 'GET') {
            try {
              const limit = Math.min(100, Math.max(1, parseInt(parsedUrl.query?.limit || '50', 10)));
              const rows = await queryD1('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?;', [limit]);
              res.end(JSON.stringify({ success: true, logs: rows || [] }));
            } catch (err) {
              console.error('Error fetching activity logs in dev:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, logs: [], error: err.message }));
            }
            return;
          }

          if (req.method === 'POST') {
            try {
              const body = await parseJsonBody(req);
              const id = 'act_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
              const action = body.action || 'system_event';
              const actor = body.actor || 'system';
              const itemId = body.item_id || body.itemId || null;
              const itemName = body.item_name || body.itemName || null;
              const details = typeof body.details === 'object' ? JSON.stringify(body.details) : (body.details || '');

              await queryD1(
                "INSERT INTO activity_logs (id, action, actor, item_id, item_name, details, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'));",
                [id, action, actor, itemId, itemName, details]
              );

              res.statusCode = 201;
              res.end(JSON.stringify({ success: true, id }));
            } catch (err) {
              console.error('Error recording activity log in dev:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        // Route: GET /api/notifications/history
        if (pathname === '/api/notifications/history' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const rows = await queryD1('SELECT * FROM notification_logs ORDER BY sent_at DESC LIMIT 50;');
            res.end(JSON.stringify(rows || []));
          } catch (err) {
            console.error('Error fetching notification logs in dev:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Route: POST /api/notifications/daily-check
        if (pathname === '/api/notifications/daily-check' && (req.method === 'POST' || req.method === 'GET')) {
          res.setHeader('Content-Type', 'application/json');
          try {
            const rows = await queryD1('SELECT key, value FROM app_settings;');
            const map = {};
            for (const r of (rows || [])) map[r.key] = r.value;

            const adminEmail = map.admin_email || process.env.CLOUDFLARE_EMAIL || 'bhavishyasingla2005@gmail.com';
            const resendApiKey = map.resend_api_key || process.env.RESEND_API_KEY || '';
            const senderEmail = normalizeSenderEmail(map.sender_email);

            const now = new Date();
            const istDate = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
            const todayStr = istDate.toISOString().split('T')[0];

            const contentRows = await queryD1('SELECT * FROM content WHERE date = ?;', [todayStr]);
            const allItems = (contentRows || []).map(mapToFrontend);
            const pendingItems = allItems.filter(item => item.status !== 'published');

            if (pendingItems.length === 0) {
              const reason = allItems.length > 0
                ? `All content pieces scheduled for today (${todayStr}) are already published. No email needed.`
                : `No content pieces are scheduled for publication today (${todayStr}). Reminder not sent.`;

              res.end(JSON.stringify({
                skipped: true,
                success: true,
                itemCount: 0,
                today: todayStr,
                message: reason,
                reason
              }));
              return;
            }

            const itemsToSend = pendingItems;
            const logId = 'nl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            const subject = `⏰ [Action Required] Daily Upload Reminder: ${itemsToSend.length} Post(s) to Upload Today (${todayStr})`;

            if (!resendApiKey) {
              await queryD1(
                'INSERT INTO notification_logs (id, type, recipient, subject, status, error, metadata, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"));',
                [logId, 'daily_upload', adminEmail, subject, 'simulated', null, JSON.stringify({ itemCount: itemsToSend.length, todayStr })]
              );
              res.end(JSON.stringify({
                success: true,
                simulated: true,
                itemCount: itemsToSend.length,
                today: todayStr,
                recipient: adminEmail,
                message: `Daily reminder simulated for ${itemsToSend.length} scheduled item(s). Add Resend API key in Settings for live inbox delivery.`
              }));
              return;
            }

            // Live Resend dispatch
            const emailRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: senderEmail,
                to: [adminEmail],
                subject,
                html: `<div style="font-family: sans-serif; padding: 20px;"><h2>Today's Upload Schedule (${todayStr})</h2><p>Today we have to upload this content from content calendar. Make sure it is uploaded!</p><p>Total items: ${items.length}</p></div>`
              })
            });
            const resData = await emailRes.json().catch(() => ({}));

            await queryD1(
              'INSERT INTO notification_logs (id, type, recipient, subject, status, error, metadata, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"));',
              [logId, 'daily_upload', adminEmail, subject, 'sent', null, JSON.stringify({ itemCount: items.length, todayStr, resendId: resData.id })]
            );

            res.end(JSON.stringify({
              success: true,
              itemCount: items.length,
              today: todayStr,
              recipient: adminEmail,
              message: `Daily upload reminder sent to ${adminEmail}!`
            }));
          } catch (err) {
            console.error('Error in daily check:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Route: POST /api/notifications/send
        if (pathname === '/api/notifications/send' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const body = await parseJsonBody(req);
            const { type } = body;

            const rows = await queryD1('SELECT key, value FROM app_settings;');
            const map = {};
            for (const r of (rows || [])) map[r.key] = r.value;

            const adminEmail = map.admin_email || process.env.CLOUDFLARE_EMAIL || 'bhavishyasingla2005@gmail.com';
            const designerEmail = map.designer_email || 'gurpreetcodju@gmail.com';
            const resendApiKey = map.resend_api_key || process.env.RESEND_API_KEY || '';
            const senderEmail = normalizeSenderEmail(map.sender_email);

            let recipient = '';
            let subject = '';
            let html = '';

            switch (type) {
              case 'changes_requested':
                recipient = designerEmail;
                if (!recipient) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Designer email is not configured. Please add the Designer Email in Settings.' }));
                  return;
                }
                subject = `Changes requested: "${body.contentItem?.name || 'Content Piece'}" (${body.contentItem?.date || ''})`;
                html = `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
                    <h2 style="font-size: 18px; margin: 0 0 14px 0; color: #111827;">Changes requested: "${body.contentItem?.name || 'Content Piece'}"</h2>
                    <p style="font-size: 14px; color: #374151;">Hello Designer, revisions have been requested before this content piece can be approved.</p>
                    <div style="background: #fefce8; border-left: 3px solid #eab308; padding: 12px 14px; margin: 16px 0; border-radius: 4px;">
                      <strong style="font-size: 12px; text-transform: uppercase; color: #854d0e;">Notes / Changes:</strong>
                      <p style="margin: 4px 0 0 0; font-size: 14px; color: #713f12; white-space: pre-wrap;">${body.feedback || 'Please update creative assets according to the brief.'}</p>
                    </div>
                    <p style="font-size: 13px; color: #6b7280;">Once updated, upload the new files in the content calendar and click "Resubmit for Review".</p>
                  </div>`;
                break;

              case 'approval_needed':
                recipient = adminEmail;
                if (!recipient) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Admin email is not configured. Please add the Admin Email in Settings.' }));
                  return;
                }
                subject = `Ready for review: "${body.contentItem?.name || 'Content Piece'}" (${body.contentItem?.date || ''})`;
                html = `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
                    <h2 style="font-size: 18px; margin: 0 0 14px 0; color: #111827;">Creative submitted: "${body.contentItem?.name || 'Content Piece'}"</h2>
                    <p style="font-size: 14px; color: #374151;">Hello Admin, the Designer has submitted creative files for review.</p>
                    <table style="width: 100%; font-size: 13px; background: #f9fafb; padding: 12px; border-radius: 6px; border: 1px solid #e5e7eb;">
                      <tr><td style="color: #6b7280; width: 100px;">Scheduled:</td><td><strong>${body.contentItem?.date || 'TBD'}</strong></td></tr>
                      <tr><td style="color: #6b7280;">Platform:</td><td><strong>${body.contentItem?.platform || 'Social'}</strong></td></tr>
                      <tr><td style="color: #6b7280;">Format:</td><td><strong>${body.contentItem?.type || 'Static'}</strong></td></tr>
                    </table>
                    <p style="font-size: 13px; color: #6b7280; margin-top: 16px;">Please review the files in your calendar dashboard.</p>
                  </div>`;
                break;

              case 'month_ready': {
                recipient = designerEmail;
                if (!recipient) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Designer email is not configured. Please add the Designer Email in Settings.' }));
                  return;
                }
                const origin = (req.headers['x-forwarded-proto'] || 'http') + '://' + (req.headers.host || 'localhost:5174');
                const targetUrl = `${origin}/?year=${body.year}&month=${body.month}&category=social`;
                subject = `Content calendar ready: ${body.monthName || ''} ${body.year || ''} (${body.items?.length || 0} posts)`;
                html = `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
                    <h2 style="font-size: 18px; margin: 0 0 14px 0; color: #111827;">Content schedule ready: ${body.monthName || ''} ${body.year || ''}</h2>
                    <p style="font-size: 14px; color: #374151;">Hello Designer, all work has been uploaded for <strong>${body.monthName || ''} ${body.year || ''}</strong> (${body.items?.length || 0} posts scheduled). You can now begin creating the designs for this month.</p>
                    ${body.customNote ? `
                    <div style="background: #f9fafb; border-left: 3px solid #6b7280; padding: 12px; margin: 14px 0; border-radius: 4px;">
                      <strong style="font-size: 11px; text-transform: uppercase; color: #374151;">Admin Note:</strong>
                      <p style="margin: 4px 0 0 0; font-size: 13px; color: #1f2937;">${body.customNote}</p>
                    </div>` : ''}
                    <div style="margin: 20px 0;">
                      <a href="${targetUrl}" style="display: inline-block; padding: 10px 20px; background: #6b21d8; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Open ${body.monthName || ''} Calendar</a>
                    </div>
                    <p style="font-size: 13px; color: #6b7280;">Please open the calendar dashboard to view all briefs and start designing.</p>
                  </div>`;
                break;
              }

              case 'designer_month_ready': {
                recipient = adminEmail;
                if (!recipient) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Admin email is not configured. Please add the Admin Email in Settings.' }));
                  return;
                }
                const origin = (req.headers['x-forwarded-proto'] || 'http') + '://' + (req.headers.host || 'localhost:5174');
                const targetUrl = `${origin}/?year=${body.year}&month=${body.month}&category=social`;
                subject = `All designs ready: ${body.monthName || ''} ${body.year || ''} (${body.items?.length || 0} posts) by Designer`;
                html = `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
                    <h2 style="font-size: 18px; margin: 0 0 14px 0; color: #111827;">All designs ready for ${body.monthName || ''} ${body.year || ''}</h2>
                    <p style="font-size: 14px; color: #374151;">Hello Admin, the Designer has completed the designs for <strong>${body.monthName || ''} ${body.year || ''}</strong> (${body.items?.length || 0} pieces total). You can check and review each design now.</p>
                    <div style="margin: 20px 0;">
                      <a href="${targetUrl}" style="display: inline-block; padding: 10px 20px; background: #6b21d8; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Review ${body.monthName || ''} Designs</a>
                    </div>
                    <p style="font-size: 13px; color: #6b7280;">Open the calendar to approve designs or request changes with clarification notes.</p>
                  </div>`;
                break;
              }

              case 'test':
                recipient = body.recipient || adminEmail;
                subject = 'Email notification test: Codju Content Calendar';
                html = `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
                    <h2 style="font-size: 18px; margin: 0 0 14px 0; color: #111827;">Notification System Test</h2>
                    <p style="font-size: 14px; color: #374151;">Your email notification setup is verified and active!</p>
                    <p style="font-size: 13px; color: #6b7280;">Delivered to: ${recipient}</p>
                  </div>`;
                break;

              default:
                res.statusCode = 400;
                res.end(JSON.stringify({ error: `Unknown notification type: ${type}` }));
                return;
            }

            const logId = 'nl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

            if (!resendApiKey) {
              await queryD1(
                'INSERT INTO notification_logs (id, type, recipient, subject, status, error, metadata, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"));',
                [logId, type, recipient, subject, 'simulated', null, JSON.stringify(body)]
              );
              res.end(JSON.stringify({
                success: true,
                simulated: true,
                recipient,
                subject,
                message: `Notification recorded! Add a Resend API key in Settings to send live emails to ${recipient}.`
              }));
              return;
            }

            // Live Resend dispatch
            const emailRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: senderEmail,
                to: [recipient],
                reply_to: adminEmail,
                subject,
                html
              })
            });
            const resData = await emailRes.json().catch(() => ({}));

            if (!emailRes.ok) {
              const errMsg = resData.message || `Resend error (${emailRes.status})`;
              await queryD1(
                'INSERT INTO notification_logs (id, type, recipient, subject, status, error, metadata, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"));',
                [logId, type, recipient, subject, 'failed', errMsg, JSON.stringify(body)]
              );
              res.statusCode = 500;
              res.end(JSON.stringify({ error: errMsg }));
              return;
            }

            await queryD1(
              'INSERT INTO notification_logs (id, type, recipient, subject, status, error, metadata, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"));',
              [logId, type, recipient, subject, 'sent', null, JSON.stringify({ ...body, resendId: resData.id })]
            );

            res.end(JSON.stringify({
              success: true,
              recipient,
              subject,
              id: resData.id,
              message: `Email successfully sent to ${recipient}!`
            }));
          } catch (err) {
            console.error('Error sending notification in dev:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Pass to next middleware
        next();
      })().catch(next);
    });
    }
  };
}
