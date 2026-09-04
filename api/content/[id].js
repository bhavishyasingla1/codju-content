import { queryD1, mapToFrontend } from '../db.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing ID parameter' });
  }

  if (req.method === 'PUT') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const now = new Date().toISOString();

      const existingRows = await queryD1('SELECT * FROM content WHERE id = ?', [id]);
      const existing = existingRows[0];
      if (!existing) {
        return res.status(404).json({ error: 'Content not found' });
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
      return res.status(200).json(mapToFrontend(rows[0]));
    } catch (err) {
      console.error('Error updating content:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await queryD1('DELETE FROM content WHERE id = ?', [id]);
      return res.status(200).json({ success: true, id });
    } catch (err) {
      console.error('Error deleting content:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
