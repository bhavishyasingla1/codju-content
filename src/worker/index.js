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
  } catch {
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

/// Bulletproof JSON extractor that cleans markdown code fences, reasoning tokens, and extracts arrays
function extractJsonPayload(text) {
  if (!text || typeof text !== 'string') return null;
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (cleaned.includes('```')) {
    cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
  }
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      return parsed.items || parsed.schedule || parsed.posts || parsed.content || Object.values(parsed).find(Array.isArray) || null;
    }
  } catch {
    const arrMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (arrMatch) {
      try {
        const p = JSON.parse(arrMatch[0]);
        if (Array.isArray(p)) return p;
      } catch {}
    }
    const objMatch = cleaned.match(/\{\s*"(?:items|posts|schedule|content)"\s*:\s*\[[\s\S]*\]\s*\}/);
    if (objMatch) {
      try {
        const p = JSON.parse(objMatch[0]);
        return p.items || p.posts || p.schedule || p.content;
      } catch {}
    }
  }
  return null;
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

    let d1Settings = null;
    try {
      d1Settings = await getD1Settings(env);
    } catch {}

    const groqKey = (userKey && userKey.startsWith('gsk_'))
      ? userKey
      : (env.GROQ_API_KEY || d1Settings?.groqApiKey || userKey);
    const geminiKey = (userKey && userKey.startsWith('AIza'))
      ? userKey
      : (env.GEMINI_API_KEY || userKey);
    const openAiKey = (userKey && userKey.startsWith('sk-'))
      ? userKey
      : (env.OPENAI_API_KEY || userKey);

    const systemInstruction = category === 'written'
      ? `You are an expert editorial strategist. Generate a structured written editorial calendar for ${monthStr}. Return a JSON object with an "items" array where each object has: date (YYYY-MM-DD within ${monthStr}), name (catchy title), type (blog or newsletter), category (written), platform (website, medium, substack, newsletter, or linkedin), summary, caption, richText, script. Return valid JSON only.`
      : `You are an expert social media content strategist. Generate a high-performing social content calendar for ${monthStr}. Return a JSON object with an "items" array where each object has: date (YYYY-MM-DD within ${monthStr}), name (catchy title), type (carousel, static, or text), category (social), platform (instagram, linkedin, or twitter), summary, caption (ready to publish with hashtags), richText, script. Return valid JSON only.`;

    let generatedItems = null;

    // 1. Try Groq (openai/gpt-oss-20b, openai/gpt-oss-120b, qwen/qwen3.8-27b)
    if (groqKey && !generatedItems) {
      const groqModels = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b'];
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
            const items = extractJsonPayload(contentStr);
            if (Array.isArray(items) && items.length > 0) {
              generatedItems = items;
              break;
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
            const items = extractJsonPayload(text);
            if (Array.isArray(items) && items.length > 0) {
              generatedItems = items;
              break;
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
          const items = extractJsonPayload(text);
          if (Array.isArray(items) && items.length > 0) {
            generatedItems = items;
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
      return jsonResponse({ success: true, items: validated, count: validated.length, provider: 'ai' });
    }

    // Fallback to rich semantic generator (zero cost, no API key needed)
    const fallbackItems = generateSmartSchedule(prompt, yr, mo, category);
    return jsonResponse({ success: true, items: fallbackItems, count: fallbackItems.length, provider: 'smart_generator' });
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
              groqApiKeyConfigured: !!settings.groqApiKey,
              groqApiKeyMasked: settings.groqApiKey ? `${settings.groqApiKey.substring(0, 6)}...` : '',
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
            if (body.groqApiKey !== undefined && body.groqApiKey.trim()) {
              updates.groq_api_key = body.groqApiKey.trim();
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
              groqApiKeyConfigured: !!updatedSettings.groqApiKey,
              groqApiKeyMasked: updatedSettings.groqApiKey ? `${updatedSettings.groqApiKey.substring(0, 6)}...` : '',
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
      // ACTIVITY LOGS ROUTES (/api/activity-logs)
      // ==========================================
      if (pathname === '/api/activity-logs') {
        if (method === 'GET') {
          try {
            const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
            const { results } = await env.DB.prepare(
              'SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?;'
            ).bind(limit).all();
            return jsonResponse({ success: true, logs: results || [] });
          } catch (err) {
            console.error('Error fetching activity logs:', err);
            return jsonResponse({ success: false, logs: [], error: err.message }, 500);
          }
        }

        if (method === 'POST') {
          try {
            const body = await request.json();
            const id = 'act_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
            const action = body.action || 'system_event';
            const actor = body.actor || 'system';
            const itemId = body.item_id || body.itemId || null;
            const itemName = body.item_name || body.itemName || null;
            const details = typeof body.details === 'object' ? JSON.stringify(body.details) : (body.details || '');

            await env.DB.prepare(
              'INSERT INTO activity_logs (id, action, actor, item_id, item_name, details, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'));'
            ).bind(id, action, actor, itemId, itemName, details).run();

            return jsonResponse({ success: true, id }, 201);
          } catch (err) {
            console.error('Error recording activity log:', err);
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
          const result = await runDailyUploadCheck(env, appUrl, false);
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

            case 'designer_month_ready': {
              recipient = settings.adminEmail;
              if (!recipient) {
                return jsonResponse({
                  error: 'Admin email is not configured. Please add the Admin Email in Settings.'
                }, 400);
              }
              emailContent = buildDesignerMonthReadyEmail({
                month: body.month,
                year: body.year,
                monthName: body.monthName || `Month ${body.month}`,
                items: body.items || [],
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
              replyTo: settings.adminEmail || 'bhavishyasingla2005@gmail.com',
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
// ==========================================
// NOTIFICATIONS & SETTINGS HELPERS
// ==========================================

function normalizeSenderEmail(senderEmail) {
  if (!senderEmail || senderEmail.includes('onboarding@resend.dev') || senderEmail.includes('@gmail.com')) {
    return 'Bhavishya <noreply@hibhavishya.in>';
  }
  // If user typed haibhavishya.in, map to the verified domain hibhavishya.in
  if (senderEmail.includes('@haibhavishya.in')) {
    return senderEmail.replace('@haibhavishya.in', '@hibhavishya.in');
  }
  return senderEmail;
}

async function getD1Settings(env) {
  try {
    const { results } = await env.DB.prepare('SELECT key, value FROM app_settings').all();
    const map = {};
    for (const row of (results || [])) {
      map[row.key] = row.value;
    }
    return {
      adminEmail: map.admin_email || env.ADMIN_EMAIL || env.CLOUDFLARE_EMAIL || 'bhavishyasingla2005@gmail.com',
      designerEmail: map.designer_email || env.DESIGNER_EMAIL || 'gurpreetcodju@gmail.com',
      resendApiKey: map.resend_api_key || env.RESEND_API_KEY || '',
      groqApiKey: map.groq_api_key || env.GROQ_API_KEY || '',
      senderEmail: normalizeSenderEmail(map.sender_email || env.SENDER_EMAIL),
      dailyReminderEnabled: map.daily_reminder_enabled !== 'false',
      dailyReminderTime: map.daily_reminder_time || '12:00',
    };
  } catch (err) {
    console.error('Error reading settings from D1:', err);
    return {
      adminEmail: env.ADMIN_EMAIL || env.CLOUDFLARE_EMAIL || 'bhavishyasingla2005@gmail.com',
      designerEmail: env.DESIGNER_EMAIL || 'gurpreetcodju@gmail.com',
      resendApiKey: env.RESEND_API_KEY || '',
      groqApiKey: env.GROQ_API_KEY || '',
      senderEmail: 'Bhavishya <noreply@hibhavishya.in>',
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

async function sendEmailViaResend({ apiKey, from, to, replyTo, subject, html }) {
  const normalizedFrom = normalizeSenderEmail(from);
  const payload = {
    from: normalizedFrom,
    to: Array.isArray(to) ? to : [to],
    subject,
    html
  };
  if (replyTo) {
    payload.reply_to = replyTo;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
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

  const allItems = (results || []).map(mapRowToFrontend);

  // User requirement:
  // "send emails to admin on date where particular written content is to be added. if i clicked already published it means no email is needed."
  // Only alert for items that need to be published (status !== 'published')
  const pendingItems = allItems.filter(item => item.status !== 'published');

  if (pendingItems.length === 0) {
    const reason = allItems.length > 0
      ? `All content pieces scheduled for today (${todayStr}) are already published. No email needed.`
      : `No content pieces scheduled for today (${todayStr}). Daily reminder skipped.`;
    return {
      skipped: true,
      success: true,
      itemCount: 0,
      today: todayStr,
      message: reason,
      reason
    };
  }

  const recipient = settings.adminEmail;
  if (!recipient) {
    return { error: 'No admin email configured for daily upload reminder' };
  }

  const itemsToSend = pendingItems;

  const emailContent = buildDailyUploadEmail({
    items: itemsToSend,
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
      metadata: { itemCount: itemsToSend.length, todayStr }
    });
    return {
      success: true,
      simulated: true,
      itemCount: itemsToSend.length,
      today: todayStr,
      recipient,
      message: `Daily reminder simulated for ${itemsToSend.length} items. Add Resend API key for inbox delivery.`
    };
  }

  try {
    const resendRes = await sendEmailViaResend({
      apiKey,
      from: settings.senderEmail,
      to: recipient,
      replyTo: settings.adminEmail || 'bhavishyasingla2005@gmail.com',
      subject: emailContent.subject,
      html: emailContent.html
    });

    await logNotification(env, {
      type: 'daily_upload',
      recipient,
      subject: emailContent.subject,
      status: 'sent',
      metadata: { itemCount: itemsToSend.length, todayStr, resendId: resendRes.id }
    });

    return {
      success: true,
      itemCount: itemsToSend.length,
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
      metadata: { itemCount: itemsToSend.length, todayStr }
    });
    return { error: err.message };
  }
}

// ==========================================
// HTML EMAIL TEMPLATE GENERATORS
// ==========================================

function getItemDeepLink(appUrl, item) {
  if (!item) return appUrl || '#';
  const base = (appUrl || '').replace(/\/+$/, '');
  const category = item.category || 'social';
  const idParam = item.id ? `item=${encodeURIComponent(item.id)}` : '';
  const catParam = `category=${category}`;
  let dateParams = '';
  if (item.date && item.date.includes('-')) {
    const parts = item.date.split('-');
    if (parts.length >= 2) {
      dateParams = `&year=${parts[0]}&month=${parseInt(parts[1], 10)}`;
    }
  }
  const query = [idParam, catParam].filter(Boolean).join('&') + dateParams;
  return `${base}/?${query}`;
}

function getEmailShell(title, categoryLabel, contentHtml, ctaText, ctaUrl) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; line-height: 1.55;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f9fafb; padding: 36px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; text-align: left;">
          <!-- Top subtle app bar -->
          <tr>
            <td style="padding: 18px 26px; border-bottom: 1px solid #f3f4f6; background-color: #ffffff;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="font-size: 14px; font-weight: 700; color: #111827; letter-spacing: -0.2px;">
                    Codju Content Calendar
                  </td>
                  ${categoryLabel ? `
                  <td align="right" style="font-size: 12px; font-weight: 500; color: #6b7280;">
                    ${categoryLabel}
                  </td>` : ''}
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 26px 26px 22px 26px;">
              <h1 style="margin: 0 0 18px 0; font-size: 19px; font-weight: 700; color: #111827; line-height: 1.35; letter-spacing: -0.3px;">
                ${title}
              </h1>

              ${contentHtml}

              ${ctaText && ctaUrl ? `
              <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid #f3f4f6;">
                <a href="${ctaUrl}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 600; padding: 10px 18px; border-radius: 6px;">
                  ${ctaText} &rarr;
                </a>
              </div>` : ''}
            </td>
          </tr>

          <!-- Clean subtle footer -->
          <tr>
            <td style="padding: 14px 26px; background-color: #fafafa; border-top: 1px solid #f3f4f6; font-size: 12px; color: #6b7280;">
              Codju Content Calendar &bull; <a href="${ctaUrl || appUrl || '#'}" style="color: #4b5563; text-decoration: underline;">Open calendar dashboard</a>
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
  const title = `Changes requested: "${contentItem.name || 'Content Piece'}"`;
  const categoryLabel = `Revision Needed`;
  const itemUrl = getItemDeepLink(appUrl, contentItem);

  let refHtml = '';
  if (feedbackAssets && feedbackAssets.length > 0) {
    refHtml = `
      <div style="margin-top: 16px;">
        <p style="font-size: 12px; font-weight: 600; color: #475569; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.3px;">Reference Files:</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${feedbackAssets.map((a, i) => `
            <a href="${a.url && a.url.startsWith('http') ? a.url : appUrl + (a.url || '')}" target="_blank" style="display: inline-block; text-decoration: none; border: 1px solid #cbd5e1; border-radius: 5px; padding: 5px 10px; background: #ffffff; font-size: 12px; color: #0284c7; font-weight: 500;">
              Reference ${i + 1} (${a.name || 'View file'}) &rarr;
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }

  const contentHtml = `
    <p style="font-size: 14px; margin: 0 0 16px 0; color: #374151;">
      Hello Designer, revisions have been requested for <a href="${itemUrl}" style="color: #4f46e5; text-decoration: underline; font-weight: 600;">"${contentItem.name}"</a> before it can be approved.
    </p>

    <!-- Metadata Card -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f9fafb; border-radius: 6px; padding: 12px 14px; margin-bottom: 16px; border: 1px solid #e5e7eb; font-size: 13px;">
      <tr>
        <td style="padding: 4px 0; color: #6b7280; width: 110px;">Scheduled:</td>
        <td style="padding: 4px 0; font-weight: 600; color: #111827;">${contentItem.date || 'TBD'}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #6b7280;">Platform:</td>
        <td style="padding: 4px 0; font-weight: 600; color: #111827; text-transform: capitalize;">${contentItem.platform || 'Social Media'}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #6b7280;">Format:</td>
        <td style="padding: 4px 0; font-weight: 600; color: #111827; text-transform: capitalize;">${contentItem.type || 'Static'}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #6b7280;">Direct Link:</td>
        <td style="padding: 4px 0;"><a href="${itemUrl}" style="color: #4f46e5; text-decoration: underline; font-size: 12px;">Open item directly &rarr;</a></td>
      </tr>
    </table>

    <!-- Feedback Box -->
    <div style="background-color: #fefce8; border-left: 3px solid #eab308; border-radius: 4px; padding: 14px; margin: 14px 0;">
      <p style="font-size: 12px; font-weight: 700; color: #854d0e; text-transform: uppercase; margin: 0 0 4px 0; letter-spacing: 0.3px;">Notes / Changes Requested:</p>
      <p style="font-size: 14px; color: #713f12; margin: 0; white-space: pre-wrap;">
        ${feedback || 'Please update the creative assets according to the brief.'}
      </p>
    </div>

    ${refHtml}

    <p style="font-size: 13px; color: #6b7280; margin-top: 16px;">
      Once updated, upload the new files in the calendar and click <strong>"Resubmit for Review"</strong>.
    </p>
  `;

  return {
    subject: `Changes requested: "${contentItem.name}" (${contentItem.date})`,
    html: getEmailShell(title, categoryLabel, contentHtml, 'View in Content Calendar', itemUrl)
  };
}

function buildApprovalNeededEmail({ contentItem, appUrl, resubmitted = false }) {
  const title = resubmitted
    ? `Resubmitted for review: "${contentItem.name || 'Content Piece'}"`
    : `Creative submitted: "${contentItem.name || 'Content Piece'}"`;
  const categoryLabel = resubmitted ? `Resubmission` : `Approval Needed`;
  const itemUrl = getItemDeepLink(appUrl, contentItem);

  const fileCount = (contentItem.assets?.length || 0) + (contentItem.pdfAsset ? 1 : 0);

  const contentHtml = `
    <p style="font-size: 14px; margin: 0 0 16px 0; color: #374151;">
      Hello Admin, the Designer has ${resubmitted ? 'updated and resubmitted' : 'uploaded creative files for'} <a href="${itemUrl}" style="color: #4f46e5; text-decoration: underline; font-weight: 600;">"${contentItem.name}"</a> for your review.
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f9fafb; border-radius: 6px; padding: 12px 14px; margin-bottom: 16px; border: 1px solid #e5e7eb; font-size: 13px;">
      <tr>
        <td style="padding: 4px 0; color: #6b7280; width: 110px;">Scheduled:</td>
        <td style="padding: 4px 0; font-weight: 600; color: #111827;">${contentItem.date || 'TBD'}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #6b7280;">Platform:</td>
        <td style="padding: 4px 0; font-weight: 600; color: #111827; text-transform: capitalize;">${contentItem.platform || 'Social'}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #6b7280;">Format:</td>
        <td style="padding: 4px 0; font-weight: 600; color: #111827; text-transform: capitalize;">${contentItem.type || 'Static'}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #6b7280;">Assets:</td>
        <td style="padding: 4px 0; font-weight: 600; color: #111827;">${fileCount} file(s) attached ${contentItem.pdfAsset ? '(includes PDF)' : ''}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #6b7280;">Direct Link:</td>
        <td style="padding: 4px 0;"><a href="${itemUrl}" style="color: #4f46e5; text-decoration: underline; font-size: 12px;">Open item directly &rarr;</a></td>
      </tr>
      ${contentItem.summary ? `
      <tr>
        <td style="padding: 4px 0; color: #6b7280; vertical-align: top;">Summary:</td>
        <td style="padding: 4px 0; color: #374151;">${contentItem.summary}</td>
      </tr>` : ''}
    </table>

    <p style="font-size: 13px; color: #6b7280; margin: 0 0 16px 0;">
      You can review and approve this piece or request changes with revision notes from the calendar.
    </p>
  `;

  return {
    subject: `Ready for review: "${contentItem.name}" (${contentItem.date})`,
    html: getEmailShell(title, categoryLabel, contentHtml, 'Review & Approve Creative', itemUrl)
  };
}

function buildDailyUploadEmail({ items = [], date, appUrl }) {
  const itemsNeedingPublish = items.filter(item => item.status !== 'published');
  const itemsAlreadyPublished = items.filter(item => item.status === 'published');

  let title = '';
  let categoryLabel = '';
  let subject = '';
  let contentHtml = '';
  const primaryCta = itemsNeedingPublish.length === 1
    ? getItemDeepLink(appUrl, itemsNeedingPublish[0])
    : (itemsNeedingPublish[0] ? getItemDeepLink(appUrl, itemsNeedingPublish[0]) : appUrl);

  if (itemsNeedingPublish.length > 0) {
    const firstTitle = itemsNeedingPublish[0].name || 'Content Piece';
    if (itemsNeedingPublish.length === 1) {
      subject = `Action Required: Publish "${firstTitle}" today (${date})`;
    } else {
      subject = `Action Required: Publish ${itemsNeedingPublish.length} posts today (${date})`;
    }
    title = `Content requiring publishing today (${date})`;
    categoryLabel = `Action Required`;

    const needsPublishRows = itemsNeedingPublish.map((item, i) => `
      <tr style="border-bottom: 1px solid #f3f4f6;">
        <td style="padding: 10px 8px; font-weight: 600; font-size: 13px;">
          ${i + 1}. <a href="${getItemDeepLink(appUrl, item)}" style="color: #4f46e5; text-decoration: underline;">${item.name}</a>
        </td>
        <td style="padding: 10px 8px; font-size: 12px; color: #4b5563; text-transform: capitalize;">
          ${item.platform || 'Social'}
        </td>
        <td style="padding: 10px 8px; font-size: 12px; color: #4b5563; text-transform: capitalize;">
          ${item.type || 'Static'}
        </td>
        <td style="padding: 10px 8px;">
          <span style="font-size: 11px; font-weight: 600; text-transform: capitalize; padding: 2px 8px; border-radius: 4px; background: #fef3c7; color: #92400e;">
            ${item.status === 'ready' ? 'Ready' : item.status}
          </span>
        </td>
      </tr>
    `).join('');

    contentHtml = `
      <p style="font-size: 14px; margin: 0 0 14px 0; color: #374151;">
        Hello Admin, today you have to publish the following content from your <strong>Codju Content Calendar</strong>. Click any title or the button below to view the piece directly:
      </p>

      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-top: 10px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
        <thead>
          <tr style="background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 11px; color: #6b7280; text-transform: uppercase;">
            <th style="padding: 8px;">Content Piece</th>
            <th style="padding: 8px;">Platform</th>
            <th style="padding: 8px;">Format</th>
            <th style="padding: 8px;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${needsPublishRows}
        </tbody>
      </table>

      ${itemsAlreadyPublished.length > 0 ? `
      <div style="margin-top: 18px; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
        <p style="font-size: 12px; font-weight: 600; color: #475569; margin: 0 0 6px 0;">Already Published / Scheduled Today:</p>
        <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #64748b;">
          ${itemsAlreadyPublished.map(item => `<li><a href="${getItemDeepLink(appUrl, item)}" style="color: #64748b; text-decoration: underline;">${item.name}</a> (${item.platform || 'Social'}) &mdash; Marked Published ✓</li>`).join('')}
        </ul>
      </div>
      ` : ''}

      <p style="font-size: 13px; color: #6b7280; margin-top: 18px;">
        Once published to your channels, mark the item as <strong>Publish 🚀</strong> in the calendar.
      </p>
    `;
  } else {
    // All items for today were ALREADY published
    subject = `All posts scheduled for today (${date}) are published ✓`;
    title = `Content for today (${date})`;
    categoryLabel = `Published`;

    const publishedRows = itemsAlreadyPublished.map((item, i) => `
      <tr style="border-bottom: 1px solid #f3f4f6;">
        <td style="padding: 10px 8px; font-weight: 600; font-size: 13px;">
          ${i + 1}. <a href="${getItemDeepLink(appUrl, item)}" style="color: #111827; text-decoration: underline;">${item.name}</a>
        </td>
        <td style="padding: 10px 8px; font-size: 12px; color: #4b5563; text-transform: capitalize;">
          ${item.platform || 'Social'}
        </td>
        <td style="padding: 10px 8px; font-size: 12px; color: #4b5563; text-transform: capitalize;">
          ${item.type || 'Static'}
        </td>
        <td style="padding: 10px 8px;">
          <span style="font-size: 11px; font-weight: 600; text-transform: capitalize; padding: 2px 8px; border-radius: 4px; background: #ecfdf5; color: #047857;">
            Published ✓
          </span>
        </td>
      </tr>
    `).join('');

    contentHtml = `
      <p style="font-size: 14px; margin: 0 0 14px 0; color: #374151;">
        Hello Admin, all content scheduled for today (${date}) has already been marked as published in your Codju Content Calendar.
      </p>

      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-top: 10px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
        <thead>
          <tr style="background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 11px; color: #6b7280; text-transform: uppercase;">
            <th style="padding: 8px;">Content Piece</th>
            <th style="padding: 8px;">Platform</th>
            <th style="padding: 8px;">Format</th>
            <th style="padding: 8px;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${publishedRows}
        </tbody>
      </table>
    `;
  }

  return {
    subject,
    html: getEmailShell(title, categoryLabel, contentHtml, 'Open in Calendar', primaryCta)
  };
}

function buildDesignerMonthReadyEmail({ _month, year, monthName, items = [], appUrl }) {
  const count = items.length;
  const title = `All designs ready for ${monthName} ${year}`;
  const categoryLabel = `Review Needed`;
  const monthUrl = `${(appUrl || '').replace(/\/+$/, '')}/?year=${year}&month=${_month}&category=social`;

  const rowsHtml = items.slice(0, 15).map((item, i) => `
    <tr style="border-bottom: 1px solid #f3f4f6;">
      <td style="padding: 8px 6px; font-weight: 600; color: #111827; font-size: 12px;">${item.date}</td>
      <td style="padding: 8px 6px; font-weight: 500; font-size: 12px;">
        <a href="${getItemDeepLink(appUrl, item)}" style="color: #4f46e5; text-decoration: underline;">${i + 1}. ${item.name}</a>
      </td>
      <td style="padding: 8px 6px; font-size: 12px; color: #6b7280; text-transform: capitalize;">${item.platform || 'Social'}</td>
      <td style="padding: 8px 6px; font-size: 12px; color: #6b7280; text-transform: capitalize;">${item.type || 'Static'}</td>
      <td style="padding: 8px 6px; font-size: 11px; font-weight: 600; color: #0284c7;">Ready for Review</td>
    </tr>
  `).join('');

  const contentHtml = `
    <p style="font-size: 14px; margin: 0 0 14px 0; color: #374151;">
      Hello Admin, the Designer has completed the designs for <strong>${monthName} ${year}</strong> (${count} pieces total). You can check and review each design now.
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; margin-top: 12px;">
      <thead>
        <tr style="background-color: #f9fafb; text-align: left; font-size: 11px; color: #6b7280; text-transform: uppercase;">
          <th style="padding: 8px 6px;">Date</th>
          <th style="padding: 8px 6px;">Title</th>
          <th style="padding: 8px 6px;">Platform</th>
          <th style="padding: 8px 6px;">Format</th>
          <th style="padding: 8px 6px;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    ${items.length > 15 ? `
    <p style="font-size: 12px; color: #6b7280; margin-top: 8px; text-align: center;">
      + ${items.length - 15} more designs ready for ${monthName}
    </p>` : ''}

    <p style="font-size: 13px; color: #6b7280; margin-top: 16px;">
      Check each design in the calendar. You can click <strong>Approve</strong> or <strong>Rectify / Changes</strong> to provide specific clarification.
    </p>
  `;

  return {
    subject: `All designs ready: ${monthName} ${year} (${count} posts) by Designer`,
    html: getEmailShell(title, categoryLabel, contentHtml, `Review ${monthName} Designs`, monthUrl)
  };
}

function buildMonthReadyEmail({ _month, year, monthName, items = [], customNote = '', appUrl }) {
  const title = `Content schedule ready: ${monthName} ${year}`;
  const categoryLabel = `Monthly Brief`;
  const monthUrl = `${(appUrl || '').replace(/\/+$/, '')}/?year=${year}&month=${_month}&category=social`;

  const topItemsHtml = items.slice(0, 15).map((item) => `
    <tr style="border-bottom: 1px solid #f3f4f6;">
      <td style="padding: 8px 6px; font-weight: 600; color: #111827; font-size: 12px;">${item.date}</td>
      <td style="padding: 8px 6px; font-weight: 500; font-size: 12px;">
        <a href="${getItemDeepLink(appUrl, item)}" style="color: #4f46e5; text-decoration: underline;">${item.name}</a>
      </td>
      <td style="padding: 8px 6px; font-size: 12px; color: #6b7280; text-transform: capitalize;">${item.platform || 'Social'}</td>
      <td style="padding: 8px 6px; font-size: 12px; color: #6b7280; text-transform: capitalize;">${item.type || 'Static'}</td>
    </tr>
  `).join('');

  const contentHtml = `
    <p style="font-size: 14px; margin: 0 0 14px 0; color: #374151;">
      Hello Designer, the content schedule and briefs for <strong>${monthName} ${year}</strong> are ready in the calendar (${items.length} pieces planned). You can now begin creating designs for this month.
    </p>

    ${customNote ? `
    <div style="background-color: #f9fafb; border-left: 3px solid #6b7280; border-radius: 4px; padding: 12px 14px; margin: 14px 0;">
      <p style="font-size: 11px; font-weight: 700; color: #374151; text-transform: uppercase; margin: 0 0 4px 0; letter-spacing: 0.3px;">Admin Instructions:</p>
      <p style="font-size: 13px; color: #1f2937; margin: 0;">${customNote}</p>
    </div>` : ''}

    <p style="font-size: 13px; font-weight: 600; color: #111827; margin: 18px 0 8px 0;">
      Scheduled Content Pieces (${items.length} total &mdash; click any piece to open directly):
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
      <thead>
        <tr style="background-color: #f9fafb; text-align: left; font-size: 11px; color: #6b7280; text-transform: uppercase;">
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

    ${items.length > 15 ? `
    <p style="font-size: 12px; color: #6b7280; margin-top: 8px; text-align: center;">
      + ${items.length - 15} more content items scheduled for ${monthName}
    </p>` : ''}

    <p style="font-size: 13px; color: #6b7280; margin-top: 16px;">
      Open the calendar to view creative briefs, upload final assets, and submit each piece for Admin approval.
    </p>
  `;

  return {
    subject: `Content calendar ready: ${monthName} ${year} (${items.length} posts)`,
    html: getEmailShell(title, categoryLabel, contentHtml, `Open ${monthName} Calendar`, monthUrl)
  };
}

function buildTestEmail({ recipient, appUrl }) {
  const title = `Notification System Verified`;
  const categoryLabel = `System Active`;

  const contentHtml = `
    <p style="font-size: 14px; margin: 0 0 14px 0; color: #374151;">
      Hello, this is a test notification confirming that email notifications from <strong>Codju Content Calendar</strong> are active and delivering from your verified domain (<strong>hibhavishya.in</strong>).
    </p>
    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 14px; margin: 16px 0; font-size: 13px;">
      <p style="margin: 0 0 6px 0; color: #111827; font-weight: 600;">Delivery Status: Active &amp; Verified ✓</p>
      <p style="margin: 0 0 4px 0; color: #4b5563;">Sender: Bhavishya &lt;noreply@hibhavishya.in&gt;</p>
      <p style="margin: 0 0 4px 0; color: #4b5563;">Reply-To: bhavishyasingla2005@gmail.com</p>
      <p style="margin: 0; color: #4b5563;">Recipient: ${recipient}</p>
    </div>
    <p style="font-size: 13px; color: #6b7280; margin-top: 14px;">
      You can access the content calendar at: <a href="${appUrl}" style="color: #4f46e5; text-decoration: underline;">${appUrl}</a>
    </p>
  `;

  return {
    subject: `Email system active: Codju Content Calendar`,
    html: getEmailShell(title, categoryLabel, contentHtml, 'Open Content Calendar', appUrl)
  };
}

