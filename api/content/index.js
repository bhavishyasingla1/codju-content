import { queryD1, mapToFrontend } from '../db.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const monthQuery = req.query.month; // e.g. 2026-07
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
      return res.status(200).json(content);
    } catch (err) {
      console.error('Error fetching content:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const now = new Date().toISOString();

      const id = body.id || ('c' + Math.random().toString(36).substr(2, 9));
      const date = body.date || now.split('T')[0];
      const name = body.name || 'Untitled Content';
      const type = body.type || (body.category === 'written' ? 'blog' : 'static');
      const category = body.category || 'social';
      const summary = body.summary || '';
      const caption = body.caption || '';
      const platform = body.platform || (body.category === 'written' ? 'website' : 'instagram');
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
      return res.status(201).json(mapToFrontend(rows[0]));
    } catch (err) {
      console.error('Error creating content:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
