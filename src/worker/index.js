// Cloudflare Worker backend for Codju Content Calendar
// Handles all API routes (D1 SQLite database & R2 object storage) and serves static SPA assets

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  if (typeof str !== 'string') return str;
  try {
    return JSON.parse(str);
  } catch (_e) {
    return fallback;
  }
}

function mapRowToFrontend(row) {
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

// Smart schedule fallback generator
function generateSmartSchedule(prompt, year, month, category = 'social') {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const rawPrompt = (prompt || '').trim();

  const countMatch = rawPrompt.match(/(\d+)\s*(?:posts?|items?|articles?|blogs?|newsletters?|pieces?|rows?|ideas?)/i);
  let targetCount = countMatch ? parseInt(countMatch[1], 10) : 0;

  const rawLines = rawPrompt
    .split(/\n+|\r+|(?:\d+\.|\*|-)\s+/)
    .map(s => s.replace(/^[,\s;]+|[,\s;]+$/g, '').trim())
    .filter(s => s.length > 2 && !/^(?:create|generate|plan|schedule|make)\s+\d+/i.test(s));

  if (targetCount <= 0) {
    targetCount = Math.max(rawLines.length, category === 'written' ? 4 : 5);
  }
  targetCount = Math.min(Math.max(targetCount, 2), 20);

  const topics = rawLines.length > 0 ? rawLines : [rawPrompt || 'Industry Insights & Innovation'];
  const mainSubject = rawPrompt
    .replace(/(?:create|generate|plan|schedule|for|the|month|of|in|with|about|on|posts?|articles?|blogs?|\d+)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Content Marketing';

  if (category === 'written') {
    const writtenTypes = ['blog', 'newsletter'];
    const platforms = ['website', 'newsletter', 'medium', 'linkedin', 'substack'];
    const items = [];
    for (let i = 0; i < targetCount; i++) {
      const topic = topics[i % topics.length] || `${mainSubject} Guide: Part ${i + 1}`;
      const dayStep = Math.max(1, Math.floor((daysInMonth - 2) / targetCount));
      const day = Math.min(daysInMonth, 2 + i * dayStep);
      items.push({
        date: `${monthStr}-${String(day).padStart(2, '0')}`,
        name: `Deep Dive: ${topic}`,
        type: writtenTypes[i % writtenTypes.length],
        category: 'written',
        platform: platforms[i % platforms.length],
        status: 'draft',
        summary: `Strategic editorial covering ${topic.toLowerCase()}.`,
        richText: `<h2>${topic}</h2><p>In-depth insights and actionable frameworks for modern teams.</p>`,
        script: '',
        caption: ''
      });
    }
    return items;
  }

  const socialTypes = ['static', 'carousel', 'reel', 'story'];
  const platforms = ['instagram', 'linkedin', 'twitter'];
  const items = [];
  for (let i = 0; i < targetCount; i++) {
    const topic = topics[i % topics.length] || `${mainSubject} Tip #${i + 1}`;
    const dayStep = Math.max(1, Math.floor((daysInMonth - 2) / targetCount));
    const day = Math.min(daysInMonth, 1 + i * dayStep);
    items.push({
      date: `${monthStr}-${String(day).padStart(2, '0')}`,
      name: topic,
      type: socialTypes[i % socialTypes.length],
      category: 'social',
      platform: platforms[i % platforms.length],
      status: 'draft',
      summary: `Engaging visual piece spotlighting ${topic.toLowerCase()}.`,
      caption: `✨ ${topic}\n\nKey takeaway: Consistency and clarity drive real impact.\n\n#Codju #${mainSubject.replace(/\s+/g, '')}`,
      richText: '',
      script: ''
    });
  }
  return items;
}

// AI Content Generation Handler (supports Groq, Gemini, and OpenAI)
async function handleGenerateAi(request, env) {
  try {
    const body = await request.json();
    const { prompt, year, month, category = 'social', apiKey: userKey } = body;
    if (!prompt) return jsonResponse({ error: 'Missing prompt' }, 400);

    const yr = parseInt(year, 10) || new Date().getFullYear();
    const mo = parseInt(month, 10) || (new Date().getMonth() + 1);
    const monthStr = `${yr}-${String(mo).padStart(2, '0')}`;

    const groqKey = (userKey && userKey.startsWith('gsk_')) ? userKey : (env.GROQ_API_KEY || userKey);
    const geminiKey = (userKey && userKey.startsWith('AIza')) ? userKey : (env.GEMINI_API_KEY || userKey);
    const openAiKey = (userKey && userKey.startsWith('sk-')) ? userKey : (env.OPENAI_API_KEY || userKey);

    const systemInstruction = category === 'written'
      ? `You are an expert editorial strategist. Generate a structured written editorial calendar for ${monthStr}. Return a JSON object with an "items" array where each object has: date (YYYY-MM-DD within ${monthStr}), name (catchy title), type (blog or newsletter), category (written), platform (website, medium, substack, newsletter, or linkedin), summary, caption, richText, script. Return valid JSON only.`
      : `You are an expert social media content strategist. Generate a high-performing social content calendar for ${monthStr}. Return a JSON object with an "items" array where each object has: date (YYYY-MM-DD within ${monthStr}), name (catchy title), type (carousel, static, or text), category (social), platform (instagram, linkedin, or twitter), summary, caption (ready to publish with hashtags), richText, script. Return valid JSON only.`;

    let generatedItems = null;

    // 1. Try Groq (openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b, llama-3.3-70b-versatile)
    if (groqKey && !generatedItems) {
      const groqModels = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
      for (const model of groqModels) {
        try {
          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${groqKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: prompt }
              ],
              temperature: 0.7,
              response_format: { type: 'json_object' }
            })
          });
          if (groqRes.ok) {
            const resData = await groqRes.json();
            const contentStr = resData.choices?.[0]?.message?.content;
            if (contentStr) {
              const parsed = JSON.parse(contentStr);
              const items = Array.isArray(parsed) ? parsed : (parsed.items || parsed.content || parsed.posts || parsed.schedule);
              if (Array.isArray(items) && items.length > 0) {
                generatedItems = items;
                break;
              }
            }
          } else {
            const errJson = await groqRes.json().catch(() => ({}));
            console.warn(`Groq (${model}) returned status ${groqRes.status}:`, errJson);
          }
        } catch (err) {
          console.warn(`Groq (${model}) error:`, err);
        }
      }
    }

    // 2. Try Google Gemini
    if (geminiKey && !generatedItems) {
      const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
      for (const model of models) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              systemInstruction: { parts: [{ text: systemInstruction }] },
              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.7
              }
            })
          });
          if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              const parsed = JSON.parse(text.trim());
              const items = Array.isArray(parsed) ? parsed : (parsed.items || parsed.schedule || parsed.posts || Object.values(parsed)[0]);
              if (Array.isArray(items) && items.length > 0) {
                generatedItems = items;
                break;
              }
            }
          }
        } catch (err) {
          console.warn(`Gemini (${model}) error:`, err);
        }
      }
    }

    // 3. Try OpenAI (GPT-4o-mini)
    if (openAiKey && !generatedItems) {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.7
          })
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content;
          if (text) {
            const parsed = JSON.parse(text);
            const items = Array.isArray(parsed) ? parsed : (parsed.items || parsed.schedule || parsed.posts || Object.values(parsed)[0]);
            if (Array.isArray(items) && items.length > 0) generatedItems = items;
          }
        }
      } catch (err) {
        console.warn('OpenAI error:', err);
      }
    }

    // If AI returned items, validate & format
    if (Array.isArray(generatedItems) && generatedItems.length > 0) {
      const validated = generatedItems.map((item, idx) => ({
        date: item.date && item.date.startsWith(monthStr) ? item.date : `${monthStr}-${String(Math.min(28, 2 + idx * 4)).padStart(2, '0')}`,
        name: item.name || `Content Idea ${idx + 1}`,
        type: item.type || (category === 'written' ? 'blog' : 'static'),
        category: category,
        platform: item.platform || (category === 'written' ? 'website' : 'instagram'),
        status: 'draft',
        summary: item.summary || '',
        caption: item.caption || '',
        richText: item.richText || (category === 'written' ? `<p>${item.summary || ''}</p>` : ''),
        script: item.script || '',
        assets: [],
        thumbnailAsset: null,
        pdfAsset: null,
        feedback: '',
        feedbackAssets: []
      }));
      return jsonResponse(validated);
    }

    // Fallback to rich semantic generator (zero cost, no API key needed)
    const fallbackItems = generateSmartSchedule(prompt, yr, mo, category);
    return jsonResponse(fallbackItems);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/$/, '') || '/';
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    // ==========================================
    // API ROUTES
    // ==========================================
    if (pathname.startsWith('/api/')) {

      // Route: GET/POST /api/generate-ai
      if (pathname === '/api/generate-ai') {
        if (method === 'POST') return handleGenerateAi(request, env);
        return jsonResponse({ error: 'Method Not Allowed' }, 405);
      }

      // Route: /api/assets/upload (POST)
      if (pathname === '/api/assets/upload' && method === 'POST') {
        try {
          const formData = await request.formData();
          const file = formData.get('file');
          if (!file || !(file instanceof File)) {
            return jsonResponse({ error: 'No valid file provided' }, 400);
          }

          const safeName = (file.name || 'asset')
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .toLowerCase();
          const assetId = 'a' + Math.random().toString(36).substr(2, 9);
          const key = `asset_${Date.now()}_${assetId}_${safeName}`;

          const arrayBuffer = await file.arrayBuffer();
          await env.BUCKET.put(key, arrayBuffer, {
            httpMetadata: {
              contentType: file.type || 'application/octet-stream'
            }
          });

          return jsonResponse({
            id: assetId,
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            url: `/api/assets/${encodeURIComponent(key)}`,
            uploadedAt: new Date().toISOString()
          }, 201);
        } catch (err) {
          console.error('R2 upload error:', err);
          return jsonResponse({ error: err.message }, 500);
        }
      }

      // Route: /api/assets/:key (GET, DELETE)
      if (pathname.startsWith('/api/assets/')) {
        const key = decodeURIComponent(pathname.replace('/api/assets/', ''));
        if (!key) return jsonResponse({ error: 'Missing asset key' }, 400);

        if (method === 'GET' || method === 'HEAD') {
          const object = await env.BUCKET.get(key);
          if (!object) {
            return jsonResponse({ error: 'Asset not found' }, 404);
          }

          const headers = new Headers(CORS_HEADERS);
          object.writeHttpMetadata(headers);
          headers.set('etag', object.httpEtag);
          headers.set('cache-control', 'public, max-age=31536000, immutable');

          return new Response(method === 'HEAD' ? null : object.body, { headers });
        }

        if (method === 'DELETE') {
          await env.BUCKET.delete(key);
          return jsonResponse({ success: true, key });
        }

        return jsonResponse({ error: 'Method Not Allowed' }, 405);
      }

      // Route: /api/content/sync (GET)
      if (pathname === '/api/content/sync' && method === 'GET') {
        try {
          const monthQuery = url.searchParams.get('month');
          const clientSince = url.searchParams.get('since');
          const countParam = url.searchParams.get('count');
          const clientCount = countParam ? parseInt(countParam, 10) : null;

          let query = 'SELECT * FROM content';
          const params = [];
          if (monthQuery) {
            query += ' WHERE date LIKE ?';
            params.push(`${monthQuery}%`);
          }
          query += ' ORDER BY date ASC;';

          const { results } = await env.DB.prepare(query).bind(...params).all();
          const items = (results || []).map(mapRowToFrontend);

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
            return jsonResponse({
              changed: false,
              latest,
              count: items.length
            }, 200, { 'Cache-Control': 'no-cache, no-store, must-revalidate' });
          }

          return jsonResponse({
            changed: true,
            latest,
            count: items.length,
            items
          }, 200, { 'Cache-Control': 'no-cache, no-store, must-revalidate' });
        } catch (err) {
          console.error('Error syncing content:', err);
          return jsonResponse({ error: err.message }, 500);
        }
      }

      // Route: /api/content/batch (POST)
      if (pathname === '/api/content/batch' && method === 'POST') {
        try {
          const body = await request.json();
          const { items } = body;
          if (!Array.isArray(items)) {
            return jsonResponse({ error: 'Items must be an array' }, 400);
          }

          const now = new Date().toISOString();
          const statements = [];
          const insertedItems = [];

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
            const richText = item.richText || (type === 'text' ? `<p>${caption || ''}</p>` : '');
            const script = item.script || '';
            const thumb = item.thumbnailAsset ? JSON.stringify(item.thumbnailAsset) : null;
            const pdf = item.pdfAsset ? JSON.stringify(item.pdfAsset) : null;
            const feedback = item.feedback || '';
            const fbAssets = JSON.stringify(item.feedbackAssets || []);
            const reviewedAt = item.reviewedAt || null;

            statements.push(
              env.DB.prepare(`
                INSERT INTO content (
                  id, date, name, type, category, summary, caption, platform, status,
                  assets, rich_text, script, thumbnail_asset, pdf_asset, feedback, feedback_assets, reviewed_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).bind(
                id, date, name, type, category, summary, caption, platform, status,
                assets, richText, script, thumb, pdf, feedback, fbAssets, reviewedAt, now, now
              )
            );

            insertedItems.push({
              id, date, name, type, category, summary, caption, platform, status,
              assets: item.assets || [], richText, script,
              thumbnailAsset: item.thumbnailAsset || null,
              pdfAsset: item.pdfAsset || null,
              feedback, feedbackAssets: item.feedbackAssets || [],
              reviewedAt, createdAt: now, updatedAt: now
            });
          }

          await env.DB.batch(statements);
          return jsonResponse({ success: true, items: insertedItems });
        } catch (err) {
          console.error('Error batch inserting content:', err);
          return jsonResponse({ error: err.message }, 500);
        }
      }

      // Route: /api/content/:id (PUT, DELETE)
      const contentIdMatch = pathname.match(/^\/api\/content\/([^/]+)$/);
      if (contentIdMatch) {
        const id = decodeURIComponent(contentIdMatch[1]);

        if (method === 'PUT') {
          try {
            const body = await request.json();
            const now = new Date().toISOString();

            const existing = await env.DB.prepare('SELECT * FROM content WHERE id = ?').bind(id).first();
            if (!existing) {
              return jsonResponse({ error: 'Content not found' }, 404);
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

            await env.DB.prepare(`
              UPDATE content SET
                date = ?, name = ?, type = ?, category = ?, summary = ?, caption = ?, platform = ?, status = ?,
                assets = ?, rich_text = ?, script = ?, thumbnail_asset = ?, pdf_asset = ?, feedback = ?,
                feedback_assets = ?, reviewed_at = ?, updated_at = ?
              WHERE id = ?;
            `).bind(
              updated.date, updated.name, updated.type, updated.category, updated.summary, updated.caption,
              updated.platform, updated.status, updated.assets, updated.rich_text, updated.script,
              updated.thumbnail_asset, updated.pdf_asset, updated.feedback, updated.feedback_assets,
              updated.reviewed_at, updated.updated_at, id
            ).run();

            const row = await env.DB.prepare('SELECT * FROM content WHERE id = ?').bind(id).first();
            return jsonResponse(mapRowToFrontend(row));
          } catch (err) {
            console.error('Error updating content item:', err);
            return jsonResponse({ error: err.message }, 500);
          }
        }

        if (method === 'DELETE') {
          try {
            await env.DB.prepare('DELETE FROM content WHERE id = ?').bind(id).run();
            return jsonResponse({ success: true, id });
          } catch (err) {
            console.error('Error deleting content item:', err);
            return jsonResponse({ error: err.message }, 500);
          }
        }

        return jsonResponse({ error: 'Method Not Allowed' }, 405);
      }

      // Route: /api/content (GET, POST)
      if (pathname === '/api/content') {
        if (method === 'GET') {
          try {
            const monthQuery = url.searchParams.get('month');
            let query = 'SELECT * FROM content';
            const params = [];
            if (monthQuery) {
              query += ' WHERE date LIKE ?';
              params.push(`${monthQuery}%`);
            }
            query += ' ORDER BY date ASC;';

            const { results } = await env.DB.prepare(query).bind(...params).all();
            const items = (results || []).map(mapRowToFrontend);
            return jsonResponse(items);
          } catch (err) {
            console.error('Error listing content:', err);
            return jsonResponse({ error: err.message }, 500);
          }
        }

        if (method === 'POST') {
          try {
            const body = await request.json();
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

            await env.DB.prepare(`
              INSERT INTO content (
                id, date, name, type, category, summary, caption, platform, status,
                assets, rich_text, script, thumbnail_asset, pdf_asset, feedback, feedback_assets, reviewed_at, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            `).bind(
              id, date, name, type, category, summary, caption, platform, status,
              assets, richText, script, thumb, pdf, feedback, fbAssets, reviewedAt, now, now
            ).run();

            const inserted = await env.DB.prepare('SELECT * FROM content WHERE id = ?').bind(id).first();
            return jsonResponse(mapRowToFrontend(inserted), 201);
          } catch (err) {
            console.error('Error creating content item:', err);
            return jsonResponse({ error: err.message }, 500);
          }
        }

        return jsonResponse({ error: 'Method Not Allowed' }, 405);
      }

      // Route: /api/notes (GET, POST)
      if (pathname === '/api/notes') {
        if (method === 'GET') {
          const monthQuery = url.searchParams.get('month');
          if (!monthQuery) return jsonResponse({ error: 'Missing month parameter' }, 400);

          try {
            let row = await env.DB.prepare('SELECT * FROM month_notes WHERE month_key = ?').bind(monthQuery).first();
            if (!row && monthQuery.length > 7) {
              const baseMonth = monthQuery.substring(0, 7);
              row = await env.DB.prepare('SELECT * FROM month_notes WHERE month_key = ?').bind(baseMonth).first();
            }

            if (!row) {
              return jsonResponse({ month_key: monthQuery, notes: '' });
            }
            return jsonResponse(row);
          } catch (err) {
            console.error('Error fetching month notes:', err);
            return jsonResponse({ error: err.message }, 500);
          }
        }

        if (method === 'POST') {
          try {
            const body = await request.json();
            const { month, notes } = body;
            if (!month) return jsonResponse({ error: 'Missing month parameter' }, 400);

            const now = new Date().toISOString();
            await env.DB.prepare(`
              INSERT INTO month_notes (month_key, notes, updated_at)
              VALUES (?, ?, ?)
              ON CONFLICT(month_key) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at;
            `).bind(month, notes || '', now).run();

            const row = await env.DB.prepare('SELECT * FROM month_notes WHERE month_key = ?').bind(month).first();
            return jsonResponse(row);
          } catch (err) {
            console.error('Error saving month notes:', err);
            return jsonResponse({ error: err.message }, 500);
          }
        }

        return jsonResponse({ error: 'Method Not Allowed' }, 405);
      }

      // ==========================================
      // SETTINGS ROUTES (/api/settings)
      // ==========================================
      if (pathname === '/api/settings') {
        if (method === 'GET') {
          try {
            const settings = await getD1Settings(env);
            return jsonResponse({
              adminEmail: settings.adminEmail,
              designerEmail: settings.designerEmail,
              senderEmail: settings.senderEmail,
              resendApiKeyConfigured: !!settings.resendApiKey,
              resendApiKeyMasked: settings.resendApiKey ? `${settings.resendApiKey.substring(0, 6)}...` : '',
              dailyReminderEnabled: settings.dailyReminderEnabled,
              dailyReminderTime: settings.dailyReminderTime,
            });
          } catch (err) {
            console.error('Error fetching settings:', err);
            return jsonResponse({ error: err.message }, 500);
          }
        }

        if (method === 'POST') {
          try {
            const body = await request.json();
            const updates = {};
            if (body.adminEmail !== undefined) updates.admin_email = body.adminEmail.trim();
            if (body.designerEmail !== undefined) updates.designer_email = body.designerEmail.trim();
            if (body.senderEmail !== undefined) updates.sender_email = body.senderEmail.trim();
            if (body.resendApiKey !== undefined && body.resendApiKey.trim()) {
              updates.resend_api_key = body.resendApiKey.trim();
            }
            if (body.dailyReminderEnabled !== undefined) {
              updates.daily_reminder_enabled = String(body.dailyReminderEnabled);
            }
            if (body.dailyReminderTime !== undefined) {
              updates.daily_reminder_time = body.dailyReminderTime.trim();
            }

            await saveD1Settings(env, updates);

            const updatedSettings = await getD1Settings(env);
            return jsonResponse({
              success: true,
              adminEmail: updatedSettings.adminEmail,
              designerEmail: updatedSettings.designerEmail,
              senderEmail: updatedSettings.senderEmail,
              resendApiKeyConfigured: !!updatedSettings.resendApiKey,
              resendApiKeyMasked: updatedSettings.resendApiKey ? `${updatedSettings.resendApiKey.substring(0, 6)}...` : '',
              dailyReminderEnabled: updatedSettings.dailyReminderEnabled,
              dailyReminderTime: updatedSettings.dailyReminderTime,
            });
          } catch (err) {
            console.error('Error saving settings:', err);
            return jsonResponse({ error: err.message }, 500);
          }
        }

        return jsonResponse({ error: 'Method Not Allowed' }, 405);
      }

      // ==========================================
      // NOTIFICATION ROUTES (/api/notifications/*)
      // ==========================================
      if (pathname === '/api/notifications/history' && method === 'GET') {
        try {
          const { results } = await env.DB.prepare(
            'SELECT * FROM notification_logs ORDER BY sent_at DESC LIMIT 50;'
          ).all();
          return jsonResponse(results || []);
        } catch (err) {
          console.error('Error fetching notification logs:', err);
          return jsonResponse({ error: err.message }, 500);
        }
      }

      if (pathname === '/api/notifications/daily-check') {
        try {
          const appUrl = url.origin;
          const result = await runDailyUploadCheck(env, appUrl, true);
          return jsonResponse(result);
        } catch (err) {
          console.error('Error in daily upload check:', err);
          return jsonResponse({ error: err.message }, 500);
        }
      }

      if (pathname === '/api/notifications/send' && method === 'POST') {
        try {
          const body = await request.json();
          const { type } = body;
          const appUrl = url.origin;
          const settings = await getD1Settings(env);

          let recipient = '';
          let emailContent = null;
          let metadata = { type, ...body };

          switch (type) {
            case 'changes_requested': {
              recipient = settings.designerEmail;
              if (!recipient) {
                return jsonResponse({
                  error: 'Designer email is not configured. Please add the Designer Email in Settings.'
                }, 400);
              }
              emailContent = buildChangesRequestedEmail({
                contentItem: body.contentItem || {},
                feedback: body.feedback || '',
                feedbackAssets: body.feedbackAssets || [],
                appUrl
              });
              break;
            }

            case 'approval_needed': {
              recipient = settings.adminEmail;
              if (!recipient) {
                return jsonResponse({
                  error: 'Admin email is not configured. Please add the Admin Email in Settings.'
                }, 400);
              }
              emailContent = buildApprovalNeededEmail({
                contentItem: body.contentItem || {},
                appUrl,
                resubmitted: !!body.resubmitted
              });
              break;
            }

            case 'daily_upload': {
              recipient = settings.adminEmail;
              if (!recipient) {
                return jsonResponse({
                  error: 'Admin email is not configured. Please add the Admin Email in Settings.'
                }, 400);
              }
              emailContent = buildDailyUploadEmail({
                items: body.items || [],
                date: body.date || new Date().toISOString().split('T')[0],
                appUrl
              });
              break;
            }

            case 'month_ready': {
              recipient = settings.designerEmail;
              if (!recipient) {
                return jsonResponse({
                  error: 'Designer email is not configured. Please add the Designer Email in Settings.'
                }, 400);
              }
              emailContent = buildMonthReadyEmail({
                month: body.month,
                year: body.year,
                monthName: body.monthName || `Month ${body.month}`,
                items: body.items || [],
                customNote: body.customNote || '',
                appUrl
              });
              break;
            }

            case 'test': {
              recipient = body.recipient || settings.adminEmail;
              if (!recipient) {
                return jsonResponse({ error: 'Please specify an email address to test.' }, 400);
              }
              emailContent = buildTestEmail({ recipient, appUrl });
              break;
            }

            default:
              return jsonResponse({ error: `Unknown notification type: ${type}` }, 400);
          }

          // Check if Resend API Key is present
          const apiKey = settings.resendApiKey;
          if (!apiKey) {
            // Log as simulated
            await logNotification(env, {
              type,
              recipient,
              subject: emailContent.subject,
              status: 'simulated',
              metadata
            });

            return jsonResponse({
              success: true,
              simulated: true,
              recipient,
              subject: emailContent.subject,
              message: `Notification recorded! Add a Resend API key in Settings to send live emails to ${recipient}.`
            });
          }

          // Dispatch live email via Resend
          try {
            const resendRes = await sendEmailViaResend({
              apiKey,
              from: settings.senderEmail,
              to: recipient,
              subject: emailContent.subject,
              html: emailContent.html
            });

            await logNotification(env, {
              type,
              recipient,
              subject: emailContent.subject,
              status: 'sent',
              metadata: { ...metadata, resendId: resendRes.id }
            });

            return jsonResponse({
              success: true,
              recipient,
              subject: emailContent.subject,
              id: resendRes.id,
              message: `Email successfully sent to ${recipient}!`
            });
          } catch (sendErr) {
            console.error('Failed to send email via Resend:', sendErr);
            await logNotification(env, {
              type,
              recipient,
              subject: emailContent.subject,
              status: 'failed',
              error: sendErr.message,
              metadata
            });

            return jsonResponse({
              error: `Failed to deliver email: ${sendErr.message}`,
              recipient
            }, 500);
          }
        } catch (err) {
          console.error('Error handling notification:', err);
          return jsonResponse({ error: err.message }, 500);
        }
      }

      return jsonResponse({ error: 'Not Found' }, 404);
    }

    // ==========================================
    // STATIC ASSETS FALLBACK (SPA)
    // ==========================================
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },

  // ==========================================
  // SCHEDULED CRON HANDLER (Daily 12:00 PM IST)
  // ==========================================
  async scheduled(_event, env, _ctx) {
    console.log('Cloudflare Scheduled Cron triggered: Checking daily uploads...');
    try {
      const appUrl = 'https://codju-content-calander.bhavishyasingla2005.workers.dev';
      await runDailyUploadCheck(env, appUrl, false);
    } catch (err) {
      console.error('Error executing scheduled daily upload check:', err);
    }
  }
};

// ==========================================
// NOTIFICATIONS & SETTINGS HELPERS
// ==========================================

async function getD1Settings(env) {
  try {
    const { results } = await env.DB.prepare('SELECT key, value FROM app_settings').all();
    const map = {};
    for (const row of (results || [])) {
      map[row.key] = row.value;
    }
    return {
      adminEmail: map.admin_email || env.ADMIN_EMAIL || env.CLOUDFLARE_EMAIL || 'bhavishyasingla2005@gmail.com',
      designerEmail: map.designer_email || env.DESIGNER_EMAIL || '',
      resendApiKey: map.resend_api_key || env.RESEND_API_KEY || '',
      senderEmail: map.sender_email || env.SENDER_EMAIL || 'Codju Content Calendar <onboarding@resend.dev>',
      dailyReminderEnabled: map.daily_reminder_enabled !== 'false',
      dailyReminderTime: map.daily_reminder_time || '12:00',
    };
  } catch (err) {
    console.error('Error reading settings from D1:', err);
    return {
      adminEmail: env.ADMIN_EMAIL || env.CLOUDFLARE_EMAIL || 'bhavishyasingla2005@gmail.com',
      designerEmail: env.DESIGNER_EMAIL || '',
      resendApiKey: env.RESEND_API_KEY || '',
      senderEmail: 'Codju Content Calendar <onboarding@resend.dev>',
      dailyReminderEnabled: true,
      dailyReminderTime: '12:00',
    };
  }
}

async function saveD1Settings(env, updates) {
  const statements = [];
  const now = new Date().toISOString();
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) {
      statements.push(
        env.DB.prepare(`
          INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
        `).bind(k, String(v), now)
      );
    }
  }
  if (statements.length > 0) {
    await env.DB.batch(statements);
  }
}

async function logNotification(env, { type, recipient, subject, status, error = null, metadata = {} }) {
  try {
    const id = 'nl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    await env.DB.prepare(`
      INSERT INTO notification_logs (id, type, recipient, subject, status, error, metadata, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'));
    `).bind(id, type, recipient, subject, status, error || null, JSON.stringify(metadata)).run();
  } catch (err) {
    console.warn('Failed to insert into notification_logs:', err);
  }
}

async function sendEmailViaResend({ apiKey, from, to, subject, html }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errMsg = data.message || `Resend error (${response.status}): ${JSON.stringify(data)}`;
    throw new Error(errMsg);
  }
  return data;
}

// Daily upload checker logic
async function runDailyUploadCheck(env, appUrl, forceSend = false) {
  const settings = await getD1Settings(env);
  if (!settings.dailyReminderEnabled && !forceSend) {
    return { skipped: true, reason: 'Daily reminder disabled in settings' };
  }

  // Calculate today's date in IST (UTC+5:30)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  const todayStr = istDate.toISOString().split('T')[0];

  const { results } = await env.DB.prepare(
    'SELECT * FROM content WHERE date = ? ORDER BY id ASC'
  ).bind(todayStr).all();

  const items = (results || []).map(mapRowToFrontend);

  if (items.length === 0 && !forceSend) {
    return { skipped: true, reason: `No content pieces scheduled for today (${todayStr})` };
  }

  const recipient = settings.adminEmail;
  if (!recipient) {
    return { error: 'No admin email configured for daily upload reminder' };
  }

  const emailContent = buildDailyUploadEmail({
    items: items.length > 0 ? items : [{ name: 'Test Content Piece', platform: 'instagram', type: 'carousel', status: 'ready' }],
    date: todayStr,
    appUrl
  });

  const apiKey = settings.resendApiKey;
  if (!apiKey) {
    await logNotification(env, {
      type: 'daily_upload',
      recipient,
      subject: emailContent.subject,
      status: 'simulated',
      metadata: { itemCount: items.length, todayStr }
    });
    return {
      success: true,
      simulated: true,
      itemCount: items.length,
      today: todayStr,
      recipient,
      message: `Daily reminder simulated for ${items.length} items. Add Resend API key for inbox delivery.`
    };
  }

  try {
    const resendRes = await sendEmailViaResend({
      apiKey,
      from: settings.senderEmail,
      to: recipient,
      subject: emailContent.subject,
      html: emailContent.html
    });

    await logNotification(env, {
      type: 'daily_upload',
      recipient,
      subject: emailContent.subject,
      status: 'sent',
      metadata: { itemCount: items.length, todayStr, resendId: resendRes.id }
    });

    return {
      success: true,
      itemCount: items.length,
      today: todayStr,
      recipient,
      message: `Daily upload reminder sent to ${recipient}!`
    };
  } catch (err) {
    console.error('Failed to send daily reminder:', err);
    await logNotification(env, {
      type: 'daily_upload',
      recipient,
      subject: emailContent.subject,
      status: 'failed',
      error: err.message,
      metadata: { itemCount: items.length, todayStr }
    });
    return { error: err.message };
  }
}

// ==========================================
// HTML EMAIL TEMPLATE GENERATORS
// ==========================================

function getEmailShell(title, badgeText, badgeColor, contentHtml, ctaText, ctaUrl) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0;">
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #4f46e5; padding: 28px 32px; text-align: left;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">Codju</span>
                    <span style="font-size: 13px; font-weight: 500; color: #c7d2fe; margin-left: 8px; background: rgba(255,255,255,0.15); padding: 3px 8px; border-radius: 6px;">Content Calendar</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 14px;">
                    <div style="display: inline-block; background-color: ${badgeColor}; color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 10px; border-radius: 20px; margin-bottom: 8px;">
                      ${badgeText}
                    </div>
                    <h1 style="margin: 0; font-size: 21px; font-weight: 700; color: #ffffff; line-height: 1.3;">
                      ${title}
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 28px 32px 24px 32px;">
              ${contentHtml}

              ${ctaText && ctaUrl ? `
              <div style="margin-top: 28px; padding-top: 22px; border-top: 1px solid #f1f5f9; text-align: center;">
                <a href="${ctaUrl}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 12px 28px; border-radius: 8px; box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25);">
                  ${ctaText} &rarr;
                </a>
              </div>` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 18px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
              <p style="margin: 0 0 4px 0;">Codju Content Calendar &bull; Automated Collaboration Notification</p>
              <p style="margin: 0;">Sent automatically from <a href="${ctaUrl || '#'}" style="color: #6366f1; text-decoration: none;">Codju Dashboard</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildChangesRequestedEmail({ contentItem, feedback, feedbackAssets = [], appUrl }) {
  const title = `Changes Requested: "${contentItem.name || 'Content Piece'}"`;
  const badgeText = `Design Revision Needed`;
  const badgeColor = '#ea580c';
  const itemUrl = `${appUrl}/#row-${contentItem.id}`;

  let refHtml = '';
  if (feedbackAssets && feedbackAssets.length > 0) {
    refHtml = `
      <div style="margin-top: 18px;">
        <p style="font-size: 12px; font-weight: 700; color: #475569; margin: 0 0 8px 0; text-transform: uppercase;">Reference Images / Screenshots:</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${feedbackAssets.map((a, i) => `
            <a href="${a.url && a.url.startsWith('http') ? a.url : appUrl + (a.url || '')}" target="_blank" style="display: inline-block; text-decoration: none; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 12px; background: #ffffff; font-size: 12px; color: #4f46e5; font-weight: 600;">
              🖼️ Reference ${i + 1} (${a.name || 'View Image'})
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }

  const contentHtml = `
    <p style="font-size: 15px; margin: 0 0 16px 0; color: #334155;">
      Hello <strong>Designer</strong>, the Admin has reviewed your submission for <strong>"${contentItem.name}"</strong> and requested revisions before it can be approved.
    </p>

    <!-- Metadata Card -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 10px; padding: 12px 16px; margin-bottom: 18px; border: 1px solid #e2e8f0; font-size: 14px;">
      <tr>
        <td style="padding: 4px 0; color: #64748b; width: 110px;">📅 Scheduled:</td>
        <td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${contentItem.date || 'TBD'}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #64748b;">📱 Platform:</td>
        <td style="padding: 4px 0; font-weight: 600; color: #0f172a; text-transform: capitalize;">${contentItem.platform || 'Social Media'}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #64748b;">🎨 Format:</td>
        <td style="padding: 4px 0; font-weight: 600; color: #0f172a; text-transform: capitalize;">${contentItem.type || 'Static'}</td>
      </tr>
    </table>

    <!-- Feedback Box -->
    <div style="background-color: #fff7ed; border-left: 4px solid #ea580c; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <p style="font-size: 11px; font-weight: 700; color: #9a3412; text-transform: uppercase; margin: 0 0 6px 0;">Required Changes / Admin Instructions:</p>
      <p style="font-size: 15px; color: #7c2d12; margin: 0; white-space: pre-wrap; font-style: italic;">
        "${feedback || 'Please update the creative assets according to the brief.'}"
      </p>
    </div>

    ${refHtml}

    <p style="font-size: 14px; color: #64748b; margin-top: 18px;">
      Once you have made the updates, upload the new files and click <strong>"Resubmit for Review ✓"</strong> in the calendar.
    </p>
  `;

  return {
    subject: `⚠️ Changes Requested: "${contentItem.name}" (${contentItem.date})`,
    html: getEmailShell(title, badgeText, badgeColor, contentHtml, 'Open Calendar & View Instructions', itemUrl)
  };
}

function buildApprovalNeededEmail({ contentItem, appUrl, resubmitted = false }) {
  const title = resubmitted
    ? `Resubmitted for Review: "${contentItem.name || 'Content Piece'}"`
    : `Approval Needed: "${contentItem.name || 'Content Piece'}"`;
  const badgeText = resubmitted ? `Creative Resubmitted` : `Ready for Approval`;
  const badgeColor = '#0284c7';
  const itemUrl = `${appUrl}/#row-${contentItem.id}`;

  const fileCount = (contentItem.assets?.length || 0) + (contentItem.pdfAsset ? 1 : 0);

  const contentHtml = `
    <p style="font-size: 15px; margin: 0 0 16px 0; color: #334155;">
      Hello <strong>Admin</strong>, the Designer has ${resubmitted ? 'updated and resubmitted' : 'uploaded creative files for'} <strong>"${contentItem.name}"</strong> and requested your review and approval.
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 10px; padding: 12px 16px; margin-bottom: 18px; border: 1px solid #e2e8f0; font-size: 14px;">
      <tr>
        <td style="padding: 4px 0; color: #64748b; width: 120px;">📅 Date:</td>
        <td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${contentItem.date || 'TBD'}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #64748b;">📱 Platform:</td>
        <td style="padding: 4px 0; font-weight: 600; color: #0f172a; text-transform: capitalize;">${contentItem.platform || 'Social'}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #64748b;">🎨 Format:</td>
        <td style="padding: 4px 0; font-weight: 600; color: #0f172a; text-transform: capitalize;">${contentItem.type || 'Static'}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #64748b;">📎 Assets:</td>
        <td style="padding: 4px 0; font-weight: 600; color: #4f46e5;">${fileCount} file(s) attached ${contentItem.pdfAsset ? '(includes PDF)' : ''}</td>
      </tr>
      ${contentItem.summary ? `
      <tr>
        <td style="padding: 4px 0; color: #64748b; vertical-align: top;">📝 Summary:</td>
        <td style="padding: 4px 0; color: #334155;">${contentItem.summary}</td>
      </tr>` : ''}
    </table>

    <p style="font-size: 14px; color: #475569; margin: 0 0 16px 0;">
      Please inspect the creative. You can approve it immediately or request revisions with notes from the dashboard.
    </p>
  `;

  return {
    subject: `🚀 [Approval Needed] Creative Submitted: "${contentItem.name}" (${contentItem.date})`,
    html: getEmailShell(title, badgeText, badgeColor, contentHtml, 'Review & Approve Creative', itemUrl)
  };
}

function buildDailyUploadEmail({ items, date, appUrl }) {
  const count = items.length;
  const title = `Today's Upload Schedule: ${count} Piece${count === 1 ? '' : 's'}`;
  const badgeText = `12:00 PM Daily Reminder`;
  const badgeColor = '#10b981';
  const listUrl = `${appUrl}`;

  const rowsHtml = items.map((item, i) => `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 10px 8px; font-weight: 600; color: #0f172a; font-size: 14px;">
        ${i + 1}. ${item.name}
      </td>
      <td style="padding: 10px 8px; font-size: 13px; color: #475569; text-transform: capitalize;">
        ${item.platform || 'Social'}
      </td>
      <td style="padding: 10px 8px; font-size: 13px; color: #475569; text-transform: capitalize;">
        ${item.type || 'Static'}
      </td>
      <td style="padding: 10px 8px;">
        <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: 12px; background: ${item.status === 'ready' ? '#dcfce7; color: #166534;' : item.status === 'published' ? '#f1f5f9; color: #475569;' : '#fef3c7; color: #92400e;'}">
          ${item.status}
        </span>
      </td>
    </tr>
  `).join('');

  const contentHtml = `
    <p style="font-size: 15px; margin: 0 0 16px 0; color: #334155;">
      Hello <strong>Admin</strong>, here is your daily reminder for <strong>${date}</strong>:
    </p>

    <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; border-radius: 6px; padding: 14px 18px; margin: 16px 0 20px 0;">
      <p style="font-size: 14px; font-weight: 700; color: #065f46; margin: 0;">
        🚨 Today we have to upload this content from content calendar. Make sure it is uploaded!
      </p>
    </div>

    <!-- Items Table -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-top: 14px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <thead>
        <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left; font-size: 11px; color: #64748b; text-transform: uppercase;">
          <th style="padding: 8px;">Content</th>
          <th style="padding: 8px;">Platform</th>
          <th style="padding: 8px;">Format</th>
          <th style="padding: 8px;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <p style="font-size: 13px; color: #64748b; margin-top: 18px;">
      After uploading to Zoho Social or Instagram/LinkedIn, mark the item as <strong>"Publish 🚀"</strong> in the calendar.
    </p>
  `;

  return {
    subject: `⏰ [Action Required] Daily Upload Reminder: ${count} Post${count === 1 ? '' : 's'} to Upload Today (${date})`,
    html: getEmailShell(title, badgeText, badgeColor, contentHtml, 'Open Content Calendar & Upload', listUrl)
  };
}

function buildMonthReadyEmail({ _month, year, monthName, items = [], customNote = '', appUrl }) {
  const title = `Content Calendar Ready: ${monthName} ${year}`;
  const badgeText = `Month Ready for Design`;
  const badgeColor = '#6366f1';
  const listUrl = `${appUrl}`;

  const topItemsHtml = items.slice(0, 10).map((item) => `
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 8px 6px; font-weight: 600; color: #0f172a; font-size: 13px;">${item.date}</td>
      <td style="padding: 8px 6px; font-weight: 600; color: #334155; font-size: 13px;">${item.name}</td>
      <td style="padding: 8px 6px; font-size: 12px; color: #64748b; text-transform: capitalize;">${item.platform || 'Social'}</td>
      <td style="padding: 8px 6px; font-size: 12px; color: #64748b; text-transform: capitalize;">${item.type || 'Static'}</td>
    </tr>
  `).join('');

  const contentHtml = `
    <p style="font-size: 15px; margin: 0 0 16px 0; color: #334155;">
      Hello <strong>Designer</strong>,
    </p>

    <div style="background-color: #eef2ff; border-left: 4px solid #6366f1; border-radius: 6px; padding: 14px 18px; margin: 16px 0 20px 0;">
      <p style="font-size: 15px; font-weight: 700; color: #3730a3; margin: 0 0 4px 0;">
        🎉 All work has been uploaded for ${monthName} ${year}!
      </p>
      <p style="font-size: 14px; color: #4338ca; margin: 0;">
        Now you can create and design the content pieces for this month.
      </p>
    </div>

    ${customNote ? `
    <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px; margin: 16px 0;">
      <p style="font-size: 11px; font-weight: 700; color: #92400e; text-transform: uppercase; margin: 0 0 4px 0;">Admin Note:</p>
      <p style="font-size: 14px; color: #78350f; margin: 0; font-style: italic;">"${customNote}"</p>
    </div>` : ''}

    <p style="font-size: 14px; font-weight: 600; color: #0f172a; margin: 20px 0 8px 0;">
      Planned Content Pieces (${items.length} total):
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <thead>
        <tr style="background-color: #f8fafc; text-align: left; font-size: 11px; color: #64748b; text-transform: uppercase;">
          <th style="padding: 8px 6px;">Date</th>
          <th style="padding: 8px 6px;">Title</th>
          <th style="padding: 8px 6px;">Platform</th>
          <th style="padding: 8px 6px;">Type</th>
        </tr>
      </thead>
      <tbody>
        ${topItemsHtml}
      </tbody>
    </table>

    ${items.length > 10 ? `
    <p style="font-size: 12px; color: #64748b; margin-top: 8px; text-align: center;">
      + ${items.length - 10} more content items scheduled for ${monthName}
    </p>` : ''}

    <p style="font-size: 14px; color: #475569; margin-top: 20px;">
      Click the button below to view all briefs, captions, and details in the dashboard.
    </p>
  `;

  return {
    subject: `🎨 [Work Uploaded] Content Calendar Ready for ${monthName} ${year} - Create Content`,
    html: getEmailShell(title, badgeText, badgeColor, contentHtml, `Open ${monthName} Calendar & Start Designing`, listUrl)
  };
}

function buildTestEmail({ recipient, appUrl }) {
  const title = `Codju Notification System Test`;
  const badgeText = `Connection Verified`;
  const badgeColor = '#10b981';

  const contentHtml = `
    <p style="font-size: 15px; margin: 0 0 16px 0; color: #334155;">
      Hello! This is a test email from your <strong>Codju Content Calendar</strong> system.
    </p>
    <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; border-radius: 6px; padding: 14px; margin: 16px 0;">
      <p style="font-size: 14px; font-weight: 700; color: #065f46; margin: 0;">
        ✅ Your email delivery system is working!
      </p>
      <p style="font-size: 13px; color: #047857; margin: 4px 0 0 0;">
        Automated emails for changes requested, approvals, 12:00 PM upload reminders, and monthly briefs will be dispatched to this address (${recipient}).
      </p>
    </div>
  `;

  return {
    subject: `✅ Codju Content Calendar Notifications Verified!`,
    html: getEmailShell(title, badgeText, badgeColor, contentHtml, 'Open Content Calendar', appUrl)
  };
}
