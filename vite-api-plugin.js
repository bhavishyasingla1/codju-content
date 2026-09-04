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

export function viteApiPlugin() {
  return {
    name: 'vite-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
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

              // Simple multipart parser
              const parts = rawBody.toString('binary').split('--' + boundary);
              let fileBuf = null;
              let fileName = 'upload.bin';
              let fileType = 'application/octet-stream';

              for (const part of parts) {
                if (part.includes('Content-Disposition') && part.includes('filename=')) {
                  const nameMatch = part.match(/filename="([^"]+)"/);
                  if (nameMatch) fileName = nameMatch[1];

                  const typeMatch = part.match(/Content-Type:\s*([^\r\n]+)/i);
                  if (typeMatch) fileType = typeMatch[1].trim();

                  const headerEndIndex = part.indexOf('\r\n\r\n');
                  if (headerEndIndex !== -1) {
                    const dataString = part.substring(headerEndIndex + 4, part.length - 2);
                    fileBuf = Buffer.from(dataString, 'binary');
                    break;
                  }
                }
              }

              if (!fileBuf) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'No file found in request' }));
                return;
              }

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
              const senderEmail = map.sender_email || 'Codju Content Calendar <onboarding@resend.dev>';
              const dailyReminderEnabled = map.daily_reminder_enabled !== 'false';
              const dailyReminderTime = map.daily_reminder_time || '12:00';

              res.end(JSON.stringify({
                adminEmail,
                designerEmail,
                senderEmail,
                resendApiKeyConfigured: !!resendApiKey,
                resendApiKeyMasked: resendApiKey ? `${resendApiKey.substring(0, 6)}...` : '',
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

              res.end(JSON.stringify({
                success: true,
                adminEmail: map.admin_email || process.env.CLOUDFLARE_EMAIL || 'bhavishyasingla2005@gmail.com',
                designerEmail: map.designer_email || '',
                senderEmail: map.sender_email || 'Codju Content Calendar <onboarding@resend.dev>',
                resendApiKeyConfigured: !!resendApiKey,
                resendApiKeyMasked: resendApiKey ? `${resendApiKey.substring(0, 6)}...` : '',
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
            const senderEmail = map.sender_email || 'Codju Content Calendar <onboarding@resend.dev>';

            const now = new Date();
            const istDate = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
            const todayStr = istDate.toISOString().split('T')[0];

            const contentRows = await queryD1('SELECT * FROM content WHERE date = ?;', [todayStr]);
            const items = (contentRows || []).map(mapToFrontend);

            const logId = 'nl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            const subject = `⏰ [Action Required] Daily Upload Reminder: ${items.length} Post(s) to Upload Today (${todayStr})`;

            if (!resendApiKey) {
              await queryD1(
                'INSERT INTO notification_logs (id, type, recipient, subject, status, error, metadata, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"));',
                [logId, 'daily_upload', adminEmail, subject, 'simulated', null, JSON.stringify({ itemCount: items.length, todayStr })]
              );
              res.end(JSON.stringify({
                success: true,
                simulated: true,
                itemCount: items.length,
                today: todayStr,
                recipient: adminEmail,
                message: `Daily reminder simulated for ${items.length} items. Add Resend API key in Settings for live inbox delivery.`
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
            const designerEmail = map.designer_email || '';
            const resendApiKey = map.resend_api_key || process.env.RESEND_API_KEY || '';
            const senderEmail = map.sender_email || 'Codju Content Calendar <onboarding@resend.dev>';

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
                subject = `⚠️ Changes Requested: "${body.contentItem?.name || 'Content Piece'}" (${body.contentItem?.date || ''})`;
                html = `<div style="font-family: sans-serif; padding: 20px;"><h2>Changes Requested</h2><p>Admin requested changes for <strong>${body.contentItem?.name}</strong>.</p><blockquote>${body.feedback || ''}</blockquote></div>`;
                break;

              case 'approval_needed':
                recipient = adminEmail;
                if (!recipient) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Admin email is not configured. Please add the Admin Email in Settings.' }));
                  return;
                }
                subject = `🚀 [Approval Needed] Creative Submitted: "${body.contentItem?.name || 'Content Piece'}" (${body.contentItem?.date || ''})`;
                html = `<div style="font-family: sans-serif; padding: 20px;"><h2>Approval Needed</h2><p>Designer submitted files for <strong>${body.contentItem?.name}</strong>.</p></div>`;
                break;

              case 'month_ready':
                recipient = designerEmail;
                if (!recipient) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Designer email is not configured. Please add the Designer Email in Settings.' }));
                  return;
                }
                subject = `🎨 [Work Uploaded] Content Calendar Ready for ${body.monthName || ''} ${body.year || ''} - Create Content`;
                html = `<div style="font-family: sans-serif; padding: 20px;"><h2>All Work Uploaded for ${body.monthName} ${body.year}</h2><p>All work has been uploaded. Now you can create content for this month.</p></div>`;
                break;

              case 'test':
                recipient = body.recipient || adminEmail;
                subject = '✅ Codju Content Calendar Notifications Verified!';
                html = `<div style="font-family: sans-serif; padding: 20px;"><h2>Notification Test</h2><p>Your notification setup is working properly!</p></div>`;
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
      });
    }
  };
}
