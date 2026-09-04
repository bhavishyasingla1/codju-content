import { useState, useEffect, Fragment } from 'react';
import {
  fetchSettings,
  saveSettings,
  sendNotification,
  fetchNotificationHistory,
  triggerDailyUploadCheck,
} from '../../services/notificationService';
import { fetchActivityLogs } from '../../services/contentService';
import './SettingsModal.css';

export default function SettingsModal({
  isOpen,
  onClose,
  onSettingsUpdated,
}) {
  const [activeTab, setActiveTab] = useState('settings'); // 'settings' | 'activity' | 'emails'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [checkingDaily, setCheckingDaily] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [dailyCheckResult, setDailyCheckResult] = useState(null);

  // Settings state
  const [adminEmail, setAdminEmail] = useState('');
  const [designerEmail, setDesignerEmail] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');
  const [resendApiKeyConfigured, setResendApiKeyConfigured] = useState(false);
  const [groqApiKey, setGroqApiKey] = useState('');
  const [groqApiKeyConfigured, setGroqApiKeyConfigured] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');

  // Activity logs state
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityFilter, setActivityFilter] = useState('all');

  // Email logs state
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [logFilter, setLogFilter] = useState('all'); // 'all' | 'sent' | 'failed'

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      if (activeTab === 'emails') {
        loadLogs();
      } else if (activeTab === 'activity') {
        loadActivity();
      }
    }
  }, [isOpen, activeTab]);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSettings();
      const admin = data.adminEmail || 'bhavishyasingla2005@gmail.com';
      const designer = data.designerEmail || 'gurpreetcodju@gmail.com';
      setAdminEmail(admin);
      setDesignerEmail(designer);
      setTestRecipient(designer);
      setResendApiKeyConfigured(Boolean(data.resendApiKeyConfigured));
      setGroqApiKeyConfigured(Boolean(data.groqApiKeyConfigured));
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
      const list = Array.isArray(data) ? data : (data.logs || []);
      setLogs(list);
    } catch (err) {
      console.warn('Could not load notification logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const loadActivity = async () => {
    setActivityLoading(true);
    try {
      const data = await fetchActivityLogs(100);
      const list = Array.isArray(data) ? data : (data.logs || []);
      setActivityLogs(list);
    } catch (err) {
      console.warn('Could not load activity logs:', err);
    } finally {
      setActivityLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setError(null);
    setSuccessMsg(null);
    if (tab === 'emails') {
      loadLogs();
    } else if (tab === 'activity') {
      loadActivity();
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
      if (groqApiKey.trim()) {
        updates.groqApiKey = groqApiKey.trim();
      }

      await saveSettings(updates);
      setSuccessMsg('Settings updated and saved successfully!');
      setResendApiKey('');
      setGroqApiKey('');
      if (resendApiKey.trim()) setResendApiKeyConfigured(true);
      if (groqApiKey.trim()) setGroqApiKeyConfigured(true);
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

  const handleSendTestEmail = async () => {
    const target = testRecipient.trim() || designerEmail.trim() || adminEmail.trim();
    if (!target) {
      setError('Please enter a recipient email for the test.');
      return;
    }
    setTesting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await sendNotification({
        type: 'test',
        recipient: target,
      });
      setSuccessMsg(res.message || `Test email successfully delivered to ${target}!`);
      if (activeTab === 'emails') loadLogs();
    } catch (err) {
      setError(err.message || 'Failed to send test email');
    } finally {
      setTesting(false);
    }
  };

  const handleRunDailyCheckNow = async () => {
    setCheckingDaily(true);
    setError(null);
    setSuccessMsg(null);
    setDailyCheckResult(null);
    try {
      const res = await triggerDailyUploadCheck();
      const feedback = {
        skipped: !!res.skipped,
        message: res.message || res.reason || (res.skipped ? 'No deliverables are scheduled to be published today. Reminder skipped.' : 'Dispatched today\'s reminders.')
      };
      setDailyCheckResult(feedback);
      if (res.skipped) {
        setSuccessMsg(`ℹ️ ${feedback.message}`);
      } else {
        const count = res.itemCount ?? 0;
        setSuccessMsg(`✅ ${res.message || `Daily 12 PM check executed! Dispatched reminders for ${count} item(s) scheduled today.`}`);
      }
      if (activeTab === 'emails') loadLogs();
      if (activeTab === 'activity') loadActivity();
    } catch (err) {
      const errText = err.message || 'Failed to trigger daily check';
      setError(errText);
      setDailyCheckResult({ error: true, message: errText });
    } finally {
      setCheckingDaily(false);
    }
  };

  const formatLogType = (type) => {
    switch (type) {
      case 'month_ready': return 'Month Kickoff';
      case 'designer_month_ready': return 'Month Designs Ready';
      case 'changes_requested': return 'Changes Requested';
      case 'approval_needed': return 'Approval Request';
      case 'daily_upload': return 'Daily 12 PM Reminder';
      case 'test': return 'Test Email';
      default: return type?.replace(/_/g, ' ') || 'Notification';
    }
  };

  const formatAction = (action) => {
    switch (action) {
      case 'STATUS_CHANGE': return 'Status Changed';
      case 'CONTENT_CREATED': return 'Content Added';
      case 'CONTENT_UPDATED': return 'Content Updated';
      case 'CONTENT_DELETED': return 'Content Deleted';
      case 'ASSET_UPLOAD': return 'Asset Upload';
      case 'AI_GENERATED': return 'AI Generated';
      case 'BATCH_CREATED': return 'Batch Created';
      default: return action?.replace(/_/g, ' ') || 'Action';
    }
  };

  const filteredLogs = logs.filter(log => {
    if (logFilter === 'sent') return log.status === 'sent';
    if (logFilter === 'failed') return log.status === 'failed';
    return true;
  });

  const filteredActivityLogs = activityLogs.filter(log => {
    if (activityFilter === 'STATUS') return log.action === 'STATUS_CHANGE';
    if (activityFilter === 'CONTENT') return log.action?.includes('CONTENT') || log.action?.includes('BATCH');
    if (activityFilter === 'ASSET') return log.action === 'ASSET_UPLOAD';
    if (activityFilter === 'AI') return log.action === 'AI_GENERATED';
    return true;
  });

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
              <h3 className="settings-modal__title">Admin Settings &amp; Logs</h3>
              <p className="settings-modal__subtitle">Team emails, API credentials, real-time activity, and delivery history</p>
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
            ⚙️ Email &amp; API Settings
          </button>
          <button
            type="button"
            className={`settings-modal__tab ${activeTab === 'activity' ? 'settings-modal__tab--active' : ''}`}
            onClick={() => handleTabChange('activity')}
          >
            ⚡ Live Activity Logs
            {activityLogs.length > 0 && <span className="settings-modal__tab-badge">{activityLogs.length}</span>}
          </button>
          <button
            type="button"
            className={`settings-modal__tab ${activeTab === 'emails' ? 'settings-modal__tab--active' : ''}`}
            onClick={() => handleTabChange('emails')}
          >
            📋 Email History
            {logs.length > 0 && <span className="settings-modal__tab-badge">{logs.length}</span>}
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
            <span>{['✅', 'ℹ️', '✓'].some((icon) => successMsg.startsWith(icon)) ? successMsg : `✓ ${successMsg}`}</span>
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
                    Receives: Approval requests, revision submissions, and daily 12:00 PM publishing reminders.
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
                    onChange={(e) => {
                      setDesignerEmail(e.target.value);
                      if (!testRecipient || testRecipient === designerEmail) {
                        setTestRecipient(e.target.value);
                      }
                    }}
                    placeholder="designer@example.com"
                  />
                  <span className="settings-modal__hint">
                    Receives: Month deliverables brief and rectification/clarification requests with notes.
                  </span>
                </div>
              </div>

              {/* Resend API Key & Domain */}
              <div className="settings-modal__section">
                <div className="settings-modal__section-header">
                  <h4 className="settings-modal__section-title">
                    ⚡ Resend API Key &amp; Sender Domain
                  </h4>
                  {resendApiKeyConfigured ? (
                    <span className="settings-modal__status-pill settings-modal__status-pill--active">
                      ● API Key Active &amp; Domain Verified
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
                    placeholder={resendApiKeyConfigured ? "Resend API Key is active (enter new key to replace)" : "re_..."}
                    autoComplete="off"
                  />
                  <span className="settings-modal__hint">
                    Emails are delivered from verified sender domain <code>hibhavishya.in</code>.
                  </span>
                </div>

                {/* Direct Test Email Dispatcher */}
                <div className="settings-modal__test-box">
                  <span className="settings-modal__test-label">Send Test Email:</span>
                  <div className="settings-modal__test-input-row">
                    <input
                      type="email"
                      className="settings-modal__input settings-modal__input--test"
                      value={testRecipient}
                      onChange={(e) => setTestRecipient(e.target.value)}
                      placeholder="recipient@example.com"
                    />
                    <button
                      type="button"
                      className="settings-modal__btn settings-modal__btn--secondary settings-modal__btn--test"
                      onClick={handleSendTestEmail}
                      disabled={testing || !testRecipient}
                      title="Send test email via Resend"
                    >
                      {testing ? 'Sending...' : 'Send Test ⚡'}
                    </button>
                  </div>
                </div>

                {/* Daily 12 PM Automation Manual Trigger */}
                <div className="settings-modal__daily-box">
                  <div className="settings-modal__daily-row">
                    <div>
                      <span className="settings-modal__daily-title">⏰ Daily 12:00 PM Publishing Reminder</span>
                      <span className="settings-modal__daily-desc">
                        Automated cron triggers at 12:00 PM IST daily, but dispatches exclusively on days when deliverables are scheduled to be published.
                      </span>
                    </div>
                    <button
                      type="button"
                      className="settings-modal__btn settings-modal__btn--secondary settings-modal__btn--small"
                      onClick={handleRunDailyCheckNow}
                      disabled={checkingDaily}
                      title="Run the 12:00 PM check now for today's content"
                    >
                      {checkingDaily ? 'Checking...' : 'Run 12 PM Check Now'}
                    </button>
                  </div>

                  {dailyCheckResult && (
                    <div
                      className={`settings-modal__daily-feedback ${
                        dailyCheckResult.error
                          ? 'settings-modal__daily-feedback--error'
                          : dailyCheckResult.skipped
                          ? 'settings-modal__daily-feedback--skipped'
                          : 'settings-modal__daily-feedback--sent'
                      }`}
                    >
                      <span>
                        {dailyCheckResult.error ? '❌ ' : dailyCheckResult.skipped ? 'ℹ️ ' : '✅ '}
                        {dailyCheckResult.message}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Groq AI API Key */}
              <div className="settings-modal__section">
                <div className="settings-modal__section-header">
                  <h4 className="settings-modal__section-title">
                    🤖 Groq AI API Key (Content Calendar Generator)
                  </h4>
                  {groqApiKeyConfigured ? (
                    <span className="settings-modal__status-pill settings-modal__status-pill--active">
                      ● AI Key Active
                    </span>
                  ) : (
                    <span className="settings-modal__status-pill settings-modal__status-pill--warning">
                      ○ Server Default
                    </span>
                  )}
                </div>

                <div className="settings-modal__field">
                  <input
                    type="password"
                    className="settings-modal__input"
                    value={groqApiKey}
                    onChange={(e) => setGroqApiKey(e.target.value)}
                    placeholder={groqApiKeyConfigured ? "Groq API Key is active (enter new key to replace)" : "gsk_..."}
                    autoComplete="off"
                  />
                  <span className="settings-modal__hint">
                    Powers high-speed content calendar generation with zero hallucinations.
                  </span>
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
          ) : activeTab === 'activity' ? (
            /* Live Activity Logs */
            <div className="settings-modal__logs">
              <div className="settings-modal__logs-header">
                <div className="settings-modal__logs-filters">
                  <button
                    type="button"
                    className={`settings-modal__log-filter-btn ${activityFilter === 'all' ? 'settings-modal__log-filter-btn--active' : ''}`}
                    onClick={() => setActivityFilter('all')}
                  >
                    All ({activityLogs.length})
                  </button>
                  <button
                    type="button"
                    className={`settings-modal__log-filter-btn ${activityFilter === 'STATUS' ? 'settings-modal__log-filter-btn--active' : ''}`}
                    onClick={() => setActivityFilter('STATUS')}
                  >
                    Status
                  </button>
                  <button
                    type="button"
                    className={`settings-modal__log-filter-btn ${activityFilter === 'CONTENT' ? 'settings-modal__log-filter-btn--active' : ''}`}
                    onClick={() => setActivityFilter('CONTENT')}
                  >
                    Content
                  </button>
                  <button
                    type="button"
                    className={`settings-modal__log-filter-btn ${activityFilter === 'ASSET' ? 'settings-modal__log-filter-btn--active' : ''}`}
                    onClick={() => setActivityFilter('ASSET')}
                  >
                    Uploads
                  </button>
                  <button
                    type="button"
                    className={`settings-modal__log-filter-btn ${activityFilter === 'AI' ? 'settings-modal__log-filter-btn--active' : ''}`}
                    onClick={() => setActivityFilter('AI')}
                  >
                    AI
                  </button>
                </div>

                <button
                  type="button"
                  className="settings-modal__btn settings-modal__btn--secondary settings-modal__btn--small"
                  onClick={loadActivity}
                  disabled={activityLoading}
                >
                  {activityLoading ? 'Refreshing...' : '🔄 Refresh Live Logs'}
                </button>
              </div>

              {activityLoading ? (
                <div className="settings-modal__loading">
                  <div className="settings-modal__spinner" />
                  <p>Loading real-time activity logs from database...</p>
                </div>
              ) : filteredActivityLogs.length === 0 ? (
                <div className="settings-modal__empty-logs">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  <p>No activity records logged yet.</p>
                  <span>Perform actions in the calendar or generate content to see real-time records here.</span>
                </div>
              ) : (
                <div className="settings-modal__table-wrap">
                  <table className="settings-modal__table">
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Actor</th>
                        <th>Item / Target</th>
                        <th>Details</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredActivityLogs.map((log) => (
                        <tr key={log.id} className="settings-modal__row">
                          <td>
                            <span className="settings-modal__badge settings-modal__badge--info">
                              {formatAction(log.action)}
                            </span>
                          </td>
                          <td>
                            <span className={`settings-modal__badge settings-modal__badge--${log.actor === 'designer' ? 'simulated' : 'sent'}`}>
                              {log.actor || 'system'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }} className="settings-modal__cell-truncate" title={log.item_name || log.item_id}>
                            {log.item_name || log.item_id || '-'}
                          </td>
                          <td className="settings-modal__cell-truncate" title={log.details}>
                            {log.details || '-'}
                          </td>
                          <td className="settings-modal__cell-time">
                            {new Date(log.created_at).toLocaleString([], {
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
          ) : (
            /* Email History Logs */
            <div className="settings-modal__logs">
              <div className="settings-modal__logs-header">
                <div className="settings-modal__logs-filters">
                  <button
                    type="button"
                    className={`settings-modal__log-filter-btn ${logFilter === 'all' ? 'settings-modal__log-filter-btn--active' : ''}`}
                    onClick={() => setLogFilter('all')}
                  >
                    All ({logs.length})
                  </button>
                  <button
                    type="button"
                    className={`settings-modal__log-filter-btn ${logFilter === 'sent' ? 'settings-modal__log-filter-btn--active' : ''}`}
                    onClick={() => setLogFilter('sent')}
                  >
                    Sent ({logs.filter(l => l.status === 'sent').length})
                  </button>
                  <button
                    type="button"
                    className={`settings-modal__log-filter-btn ${logFilter === 'failed' ? 'settings-modal__log-filter-btn--active' : ''}`}
                    onClick={() => setLogFilter('failed')}
                  >
                    Failed ({logs.filter(l => l.status === 'failed').length})
                  </button>
                </div>

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
                  <p>Loading email logs from database...</p>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="settings-modal__empty-logs">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <p>No email notifications recorded in this view.</p>
                  <span>Trigger a test email or workflow action to see live records here.</span>
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
                      {filteredLogs.map((log) => {
                        const isExpanded = expandedLogId === log.id;
                        const hasError = Boolean(log.error);

                        return (
                          <Fragment key={log.id}>
                            <tr
                              className={`settings-modal__row ${hasError ? 'settings-modal__row--clickable' : ''}`}
                              onClick={() => hasError && setExpandedLogId(prev => prev === log.id ? null : log.id)}
                              title={hasError ? "Click to view delivery error details" : undefined}
                            >
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
                              <td title={log.subject} className="settings-modal__cell-truncate">
                                {log.subject}
                                {hasError && (
                                  <span className="settings-modal__error-pill">
                                    View Error &darr;
                                  </span>
                                )}
                              </td>
                              <td className="settings-modal__cell-time">
                                {new Date(log.sent_at).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </td>
                            </tr>
                            {isExpanded && hasError && (
                              <tr className="settings-modal__expanded-row">
                                <td colSpan={5}>
                                  <div className="settings-modal__error-detail">
                                    <div className="settings-modal__error-detail-title">
                                      <span>⚠️ Delivery Error Details</span>
                                      <button
                                        type="button"
                                        className="settings-modal__error-close"
                                        onClick={() => setExpandedLogId(null)}
                                      >
                                        &times;
                                      </button>
                                    </div>
                                    <pre className="settings-modal__error-message">{log.error}</pre>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
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
