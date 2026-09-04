import { queryD1, mapToFrontend } from '../db.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const monthQuery = req.query.month; // e.g. 2026-08
  const clientSince = req.query.since; // ISO string
  const clientCount = req.query.count ? parseInt(req.query.count, 10) : null;

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

    // If client is already up-to-date, return lightweight response
    if (clientSince && clientSince === latest && (clientCount === null || clientCount === items.length)) {
      return res.status(200).json({
        changed: false,
        latest,
        count: items.length
      });
    }

    return res.status(200).json({
      changed: true,
      latest,
      count: items.length,
      items
    });
  } catch (err) {
    console.error('Error syncing content:', err);
    return res.status(500).json({ error: err.message });
  }
}
