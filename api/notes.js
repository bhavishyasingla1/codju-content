import { queryD1 } from './db.js';

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
    if (!monthQuery) {
      return res.status(400).json({ error: 'Missing month parameter' });
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
        return res.status(200).json({ month_key: monthQuery, notes: '' });
      } else {
        return res.status(200).json(data);
      }
    } catch (err) {
      console.error('Error fetching month notes:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { month, notes } = body;

      if (!month) {
        return res.status(400).json({ error: 'Missing month parameter' });
      }

      const now = new Date().toISOString();
      await queryD1(`
        INSERT INTO month_notes (month_key, notes, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(month_key) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at;
      `, [month, notes || '', now]);

      const rows = await queryD1('SELECT * FROM month_notes WHERE month_key = ?', [month]);
      return res.status(200).json(rows[0] || { month_key: month, notes: notes || '' });
    } catch (err) {
      console.error('Error saving month notes:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
