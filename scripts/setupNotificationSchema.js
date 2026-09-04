// Setup D1 schema for Settings and Notification Logs
import { queryD1 } from '../api/db.js';

async function setupNotificationSchema() {
  console.log('Setting up app_settings and notification_logs tables in Cloudflare D1...');

  await queryD1(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('app_settings table created or verified.');

  await queryD1(`
    CREATE TABLE IF NOT EXISTS notification_logs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      metadata TEXT DEFAULT '{}',
      sent_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('notification_logs table created or verified.');

  // Prepopulate default admin email if not set
  const existingAdmin = await queryD1('SELECT value FROM app_settings WHERE key = ?', ['admin_email']);
  if (!existingAdmin || existingAdmin.length === 0) {
    const defaultAdminEmail = process.env.CLOUDFLARE_EMAIL || 'bhavishyasingla2005@gmail.com';
    await queryD1(
      'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
      ['admin_email', defaultAdminEmail]
    );
    console.log(`Prepopulated admin_email: ${defaultAdminEmail}`);
  }

  // Prepopulate sender_email if not set
  const existingSender = await queryD1('SELECT value FROM app_settings WHERE key = ?', ['sender_email']);
  if (!existingSender || existingSender.length === 0) {
    await queryD1(
      'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
      ['sender_email', 'Codju Content Calendar <onboarding@resend.dev>']
    );
    console.log('Prepopulated sender_email: Codju Content Calendar <onboarding@resend.dev>');
  }

  // Check tables
  const tables = await queryD1('SELECT name FROM sqlite_master WHERE type="table";');
  console.log('Current D1 tables:', tables.map(t => t.name));

  console.log('Notification schema setup complete!');
}

setupNotificationSchema().catch(err => {
  console.error('Failed to setup notification schema:', err);
  process.exit(1);
});
