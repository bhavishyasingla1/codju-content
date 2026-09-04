import { queryD1 } from '../db.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { items } = body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items must be an array' });
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
        INSERT OR REPLACE INTO content (
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

    return res.status(200).json({ success: true, items: inserted });
  } catch (err) {
    console.error('Error batch creating content:', err);
    return res.status(500).json({ error: err.message });
  }
}
