import { useState, useEffect } from 'react';
import {
  fetchSettings,
  saveSettings,
  sendNotification,
  fetchNotificationHistory,
  triggerDailyUploadCheck,
} from '../../services/notificationService';
import './SettingsModal.css';

export default function SettingsModal({ isOpen, onClose, onSettingsUpdated }) {
  const [activeTab, setActiveTab] = useState('settings'); // 'settings' | 'logs'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingDaily, setTestingDaily] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Settings state
  const [adminEmail, setAdminEmail] = useState('');
  const [designerEmail, setDesignerEmail] = useState('');
  const [senderEmail, setSenderEmail] = useState('Codju Content Calendar <onboarding@resend.dev>');
  const [resendApiKey, setResendApiKey] = useState('');
  const [resendApiKeyConfigured, setResendApiKeyConfigured] = useState(false);
  const [dailyReminderEnabled, setDailyReminderEnabled] = useState(true);

  // History state
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSettings();
      setAdminEmail(data.adminEmail || '');
      setDesignerEmail(data.designerEmail || '');
      setSenderEmail(data.senderEmail || 'Codju Content Calendar <onboarding@resend.dev>');
      setResendApiKeyConfigured(data.resendApiKeyConfigured || false);
      setDailyReminderEnabled(data.dailyReminderEnabled !== false);
    } catch (err) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const data = await fetchNotificationHistory();
      setLogs(data || []);
    } catch (err) {
      console.error('Failed to load notification history:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setError(null);
    setSuccessMsg(null);
    if (tab === 'logs') {
      loadLogs();
    }
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const payload = {
        adminEmail: adminEmail.trim(),
        designerEmail: designerEmail.trim(),
        senderEmail: senderEmail.trim(),
        dailyReminderEnabled,
      };
      if (resendApiKey.trim()) {
        payload.resendApiKey = resendApiKey.trim();
      }

      const updated = await saveSettings(payload);
      setResendApiKey('');
      setResendApiKeyConfigured(updated.resendApiKeyConfigured);
      setSuccessMsg('Settings saved successfully!');
      onSettingsUpdated?.(updated);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async (targetRecipient) => {
    const recipient = targetRecipient || adminEmail;
    if (!recipient) {
      setError('Please provide an email address to send the test.');
      return;
    }
    setTesting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await sendNotification({
        type: 'test',
        recipient: recipient.trim(),
      });
      setSuccessMsg(res.message || `Test email sent to ${recipient}!`);
      if (activeTab === 'logs') loadLogs();
    } catch (err) {
      setError(err.message || 'Failed to send test email');
    } finally {
      setTesting(false);
    }
  };

  const handleTestDailyUpload = async () => {
    setTestingDaily(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await triggerDailyUploadCheck();
      setSuccessMsg(res.message || 'Daily upload check executed!');
      if (activeTab === 'logs') loadLogs();
    } catch (err) {
      setError(err.message || 'Daily upload check failed');
    } finally {
      setTestingDaily(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-modal__backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-modal animate-scale-in">
        {/* Header */}
        <div className="settings-modal__header">
          <div className="settings-modal__title-group">
            <div className="settings-modal__icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div>
              <h3 className="settings-modal__title">Admin Settings & Email System</h3>
              <p className="settings-modal__subtitle">Configure admin, designer, notifications, and scheduled reminders</p>
            </div>
          </div>

          <button className="settings-modal__close" onClick={onClose} type="button" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="settings-modal__tabs">
          <button
            type="button"
            className={`settings-modal__tab ${activeTab === 'settings' ? 'settings-modal__tab--active' : ''}`}
            onClick={() => handleTabChange('settings')}
          >
            ⚙️ Email & Team Settings
          </button>
          <button
            type="button"
            className={`settings-modal__tab ${activeTab === 'logs' ? 'settings-modal__tab--active' : ''}`}
            onClick={() => handleTabChange('logs')}
          >
            📋 Notification Activity Log
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="settings-modal__alert settings-modal__alert--error">
            <span>⚠️ {error}</span>
          </div>
        )}
        {successMsg && (
          <div className="settings-modal__alert settings-modal__alert--success">
            <span>✓ {successMsg}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="settings-modal__body">
          {loading ? (
            <div className="settings-modal__loading">
              <div className="settings-modal__spinner" />
              <p>Loading settings...</p>
            </div>
          ) : activeTab === 'settings' ? (
            <form onSubmit={handleSave} className="settings-modal__form">
              {/* Team Contacts Section */}
              <div className="settings-modal__section">
                <h4 className="settings-modal__section-title">
                  👥 Team Email Addresses
                </h4>
                <p className="settings-modal__section-desc">
                  These addresses receive automated notifications for change requests, creative approvals, and monthly assignments.
                </p>

                <div className="settings-modal__field">
                  <label className="settings-modal__label">
                    Admin Email <span className="settings-modal__required">*</span>
                  </label>
                  <div className="settings-modal__input-wrap">
                    <input
                      type="email"
                      className="settings-modal__input"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@example.com"
                      required
                    />
                    <button
                      type="button"
                      className="settings-modal__inline-btn"
                      onClick={() => handleSendTestEmail(adminEmail)}
                      disabled={testing || !adminEmail}
                      title="Send test email to Admin"
                    >
                      {testing ? 'Sending...' : 'Test Email'}
                    </button>
                  </div>
                  <span className="settings-modal__hint">
                    Receives: Creative approval requests, revision submissions, and daily 12:00 PM upload reminders.
                  </span>
                </div>

                <div className="settings-modal__field">
                  <label className="settings-modal__label">
                    Designer Email
                  </label>
                  <div className="settings-modal__input-wrap">
                    <input
                      type="email"
                      className="settings-modal__input"
                      value={designerEmail}
                      onChange={(e) => setDesignerEmail(e.target.value)}
                      placeholder="designer@example.com"
                    />
                    <button
                      type="button"
                      className="settings-modal__inline-btn"
                      onClick={() => handleSendTestEmail(designerEmail)}
                      disabled={testing || !designerEmail}
                      title="Send test email to Designer"
                    >
                      {testing ? 'Sending...' : 'Test Email'}
                    </button>
                  </div>
                  <span className="settings-modal__hint">
                    Receives: Change requests from Admin (with revision notes & reference images) and monthly brief assignments.
                  </span>
                </div>
              </div>

              {/* Email Delivery Provider (Resend) */}
              <div className="settings-modal__section">
                <div className="settings-modal__section-header">
                  <h4 className="settings-modal__section-title">
                    ⚡ Email Delivery Service (Resend)
                  </h4>
                  {resendApiKeyConfigured ? (
                    <span className="settings-modal__status-pill settings-modal__status-pill--active">
                      ● Active (API Key Configured)
                    </span>
                  ) : (
                    <span className="settings-modal__status-pill settings-modal__status-pill--warning">
                      ○ Simulated (No Key Set)
                    </span>
                  )}
                </div>
                <p className="settings-modal__section-desc">
                  Powered by <a href="https://resend.com" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>Resend</a> for high deliverability. Get a free API key with 3,000 free emails/month.
                </p>

                <div className="settings-modal__field">
                  <label className="settings-modal__label">
                    Resend API Key {resendApiKeyConfigured && <span style={{ color: 'var(--color-success)', fontWeight: 'normal' }}>(Currently Configured)</span>}
                  </label>
                  <input
                    type="password"
                    className="settings-modal__input"
                    value={resendApiKey}
                    onChange={(e) => setResendApiKey(e.target.value)}
                    placeholder={resendApiKeyConfigured ? "Enter new API key to replace existing" : "re_123456789..."}
                  />
                  <span className="settings-modal__hint">
                    Key is securely stored in Cloudflare D1. If left blank, notifications will be logged to the activity tab without sending external emails.
                  </span>
                </div>

                <div className="settings-modal__field">
                  <label className="settings-modal__label">
                    Sender Email / From Name
                  </label>
                  <input
                    type="text"
                    className="settings-modal__input"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    placeholder="Codju Content Calendar <onboarding@resend.dev>"
                  />
                  <span className="settings-modal__hint">
                    Default is Resend verified sandbox: <code>Codju Content Calendar &lt;onboarding@resend.dev&gt;</code>. Once you verify your domain on Resend, you can use your custom email.
                  </span>
                </div>
              </div>

              {/* Scheduled Daily Reminders */}
              <div className="settings-modal__section">
                <h4 className="settings-modal__section-title">
                  ⏰ Scheduled Daily Upload Reminders
                </h4>
                <p className="settings-modal__section-desc">
                  Automated Cloudflare Cron triggers every day at 12:00 PM IST sharp to remind Admin about content pieces scheduled for today.
                </p>

                <div className="settings-modal__toggle-field">
                  <div>
                    <span className="settings-modal__toggle-label">Enable Daily 12:00 PM Reminder</span>
                    <span className="settings-modal__toggle-desc">
                      Sends an email checklist of content scheduled for upload today at 12:00 PM sharp.
                    </span>
                  </div>
                  <label className="settings-modal__switch">
                    <input
                      type="checkbox"
                      checked={dailyReminderEnabled}
                      onChange={(e) => setDailyReminderEnabled(e.target.checked)}
                    />
                    <span className="settings-modal__slider round" />
                  </label>
                </div>

                <div style={{ marginTop: '14px' }}>
                  <button
                    type="button"
                    className="settings-modal__btn settings-modal__btn--secondary"
                    onClick={handleTestDailyUpload}
                    disabled={testingDaily || !adminEmail}
                  >
                    {testingDaily ? 'Checking & Sending...' : 'Trigger Today\'s 12:00 PM Upload Check Now ⚡'}
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="settings-modal__actions">
                <button
                  type="button"
                  className="settings-modal__btn settings-modal__btn--secondary"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="settings-modal__btn settings-modal__btn--primary"
                >
                  {saving ? 'Saving...' : 'Save Settings ✓'}
                </button>
              </div>
            </form>
          ) : (
            /* Logs Tab */
            <div className="settings-modal__logs">
              <div className="settings-modal__logs-header">
                <span className="settings-modal__logs-count">
                  Recent Notifications ({logs.length})
                </span>
                <button
                  type="button"
                  className="settings-modal__btn settings-modal__btn--secondary settings-modal__btn--small"
                  onClick={loadLogs}
                  disabled={logsLoading}
                >
                  {logsLoading ? 'Refreshing...' : '🔄 Refresh Logs'}
                </button>
              </div>

              {logsLoading ? (
                <div className="settings-modal__loading">
                  <div className="settings-modal__spinner" />
                  <p>Loading activity logs...</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="settings-modal__empty-logs">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <p>No notifications have been sent yet.</p>
                  <span>Trigger a test email or request changes on a piece to see activity here.</span>
                </div>
              ) : (
                <div className="settings-modal__table-wrap">
                  <table className="settings-modal__table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Type</th>
                        <th>Recipient</th>
                        <th>Subject</th>
                        <th>Sent At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id}>
                          <td>
                            <span className={`settings-modal__badge settings-modal__badge--${log.status}`}>
                              {log.status === 'sent' && '✓ Sent'}
                              {log.status === 'simulated' && '📝 Logged'}
                              {log.status === 'failed' && '✕ Failed'}
                            </span>
                          </td>
                          <td style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                            {log.type?.replace('_', ' ')}
                          </td>
                          <td className="settings-modal__cell-mono">{log.recipient}</td>
                          <td title={log.subject} className="settings-modal__cell-truncate">{log.subject}</td>
                          <td className="settings-modal__cell-time">
                            {new Date(log.sent_at).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
