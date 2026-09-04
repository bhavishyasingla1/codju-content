import { useState, useEffect } from 'react';
import {
  fetchSettings,
  saveSettings,
  sendNotification,
  fetchNotificationHistory,
} from '../../services/notificationService';
import './SettingsModal.css';

export default function SettingsModal({
  isOpen,
  onClose,
  onSettingsUpdated,
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  content = [],
}) {
  const [activeTab, setActiveTab] = useState('settings'); // 'settings' | 'logs'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Settings state
  const [adminEmail, setAdminEmail] = useState('');
  const [designerEmail, setDesignerEmail] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');
  const [resendApiKeyConfigured, setResendApiKeyConfigured] = useState(false);

  // History state
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      if (activeTab === 'logs') {
        loadLogs();
      }
    }
  }, [isOpen, activeTab]);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSettings();
      setAdminEmail(data.adminEmail || 'bhavishyasingla2005@gmail.com');
      setDesignerEmail(data.designerEmail || 'gurpreetcodju@gmail.com');
      setResendApiKeyConfigured(data.resendApiKeyConfigured || false);
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
      setLogs(data.logs || []);
    } catch (err) {
      console.warn('Could not load notification logs:', err);
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
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const updates = {
        adminEmail: adminEmail.trim(),
        designerEmail: designerEmail.trim(),
      };
      if (resendApiKey.trim()) {
        updates.resendApiKey = resendApiKey.trim();
      }

      await saveSettings(updates);
      setSuccessMsg('Settings updated and saved successfully!');
      setResendApiKey('');
      if (resendApiKey.trim()) setResendApiKeyConfigured(true);
      onSettingsUpdated?.({
        adminEmail: adminEmail.trim(),
        designerEmail: designerEmail.trim(),
      });
    } catch (err) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async (overrideRecipient) => {
    const targetRecipient = overrideRecipient || designerEmail.trim() || 'gurpreetcodju@gmail.com';
    setTesting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await sendNotification({
        type: 'test',
        recipient: targetRecipient,
      });
      setSuccessMsg(res.message || `Test email successfully delivered to ${targetRecipient}!`);
      if (activeTab === 'logs') loadLogs();
    } catch (err) {
      setError(err.message || 'Failed to send test email');
    } finally {
      setTesting(false);
    }
  };

  const formatLogType = (type) => {
    switch (type) {
      case 'month_ready': return 'Month Kickoff';
      case 'designer_month_ready': return 'Month Designs Ready';
      case 'changes_requested': return 'Changes Requested';
      case 'approval_needed': return 'Approval Request';
      case 'daily_upload': return 'Daily 12 PM';
      case 'test': return 'Test Email';
      default: return type?.replace('_', ' ') || 'Notification';
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
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div>
              <h3 className="settings-modal__title">Admin Settings</h3>
              <p className="settings-modal__subtitle">Admin email, designer email, and Resend API status</p>
            </div>
          </div>

          <button className="settings-modal__close" onClick={onClose} type="button" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 2 Focused Tabs */}
        <div className="settings-modal__tabs">
          <button
            type="button"
            className={`settings-modal__tab ${activeTab === 'settings' ? 'settings-modal__tab--active' : ''}`}
            onClick={() => handleTabChange('settings')}
          >
            ⚙️ Email &amp; API Settings
          </button>
          <button
            type="button"
            className={`settings-modal__tab ${activeTab === 'logs' ? 'settings-modal__tab--active' : ''}`}
            onClick={() => handleTabChange('logs')}
          >
            📋 Real Activity Logs
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
              {/* Contacts */}
              <div className="settings-modal__section">
                <h4 className="settings-modal__section-title">
                  👥 Team Email Addresses
                </h4>

                <div className="settings-modal__field">
                  <label className="settings-modal__label">
                    Admin Email <span className="settings-modal__required">*</span>
                  </label>
                  <input
                    type="email"
                    className="settings-modal__input"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@example.com"
                    required
                  />
                  <span className="settings-modal__hint">
                    Receives: Approval notifications, revision submissions, and daily 12:00 PM publishing reminders.
                  </span>
                </div>

                <div className="settings-modal__field">
                  <label className="settings-modal__label">
                    Designer Email
                  </label>
                  <input
                    type="email"
                    className="settings-modal__input"
                    value={designerEmail}
                    onChange={(e) => setDesignerEmail(e.target.value)}
                    placeholder="designer@example.com"
                  />
                  <span className="settings-modal__hint">
                    Receives: Month briefs and change/rectification requests with notes & screenshots.
                  </span>
                </div>
              </div>

              {/* API Key */}
              <div className="settings-modal__section">
                <div className="settings-modal__section-header">
                  <h4 className="settings-modal__section-title">
                    ⚡ Resend API Key
                  </h4>
                  {resendApiKeyConfigured ? (
                    <span className="settings-modal__status-pill settings-modal__status-pill--active">
                      ● API Key Working & Active
                    </span>
                  ) : (
                    <span className="settings-modal__status-pill settings-modal__status-pill--warning">
                      ○ No Key Set (Simulated)
                    </span>
                  )}
                </div>

                <div className="settings-modal__field">
                  <input
                    type="password"
                    className="settings-modal__input"
                    value={resendApiKey}
                    onChange={(e) => setResendApiKey(e.target.value)}
                    placeholder={resendApiKeyConfigured ? "API Key is active (enter new key to replace)" : "re_..."}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                    <span className="settings-modal__hint" style={{ margin: 0 }}>
                      Key is securely stored in Cloudflare.
                    </span>
                    <button
                      type="button"
                      className="settings-modal__btn settings-modal__btn--secondary settings-modal__btn--small"
                      onClick={() => handleSendTestEmail(designerEmail || 'gurpreetcodju@gmail.com')}
                      disabled={testing || (!designerEmail && !adminEmail)}
                      title={`Send test email via Resend to ${designerEmail || 'gurpreetcodju@gmail.com'}`}
                    >
                      {testing ? 'Testing...' : 'Send Test Email ⚡'}
                    </button>
                  </div>
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
            /* Real Activity Logs */
            <div className="settings-modal__logs">
              <div className="settings-modal__logs-header">
                <span className="settings-modal__logs-count">
                  Recent Email Activity ({logs.length})
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
                  <p>Loading activity logs from database...</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="settings-modal__empty-logs">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <p>No email notifications recorded yet.</p>
                  <span>Send a test email or trigger an approval to see live activity here.</span>
                </div>
              ) : (
                <div className="settings-modal__table-wrap">
                  <table className="settings-modal__table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Event</th>
                        <th>Recipient</th>
                        <th>Subject</th>
                        <th>Date &amp; Time</th>
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
                          <td style={{ fontWeight: 600 }}>
                            {formatLogType(log.type)}
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
