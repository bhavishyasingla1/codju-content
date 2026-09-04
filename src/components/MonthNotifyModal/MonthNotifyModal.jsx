import { useState } from 'react';
import { getMonthName } from '../../utils/helpers';
import { sendNotification } from '../../services/notificationService';
import './MonthNotifyModal.css';

export default function MonthNotifyModal({
  isOpen,
  onClose,
  year,
  month,
  content = [],
  designerEmail = '',
  onOpenSettings,
  onSuccess,
}) {
  const [customNote, setCustomNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const monthName = getMonthName(month);
  const monthItems = content.filter((item) => {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    return item.date && item.date.startsWith(monthStr);
  });

  const handleSend = async () => {
    if (!designerEmail) {
      setError('Designer email is not configured. Please configure it in Settings first.');
      return;
    }

    setSending(true);
    setError(null);

    try {
      const res = await sendNotification({
        type: 'month_ready',
        year,
        month,
        monthName,
        items: monthItems.map((item) => ({
          date: item.date,
          name: item.name,
          platform: item.platform,
          type: item.type,
          summary: item.summary,
        })),
        customNote: customNote.trim(),
      });

      onSuccess?.(res.message || `Notification sent to Designer (${designerEmail})!`);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to send notification to designer');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="month-notify-modal__backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="month-notify-modal animate-scale-in">
        {/* Header */}
        <div className="month-notify-modal__header">
          <div className="month-notify-modal__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div>
            <h3 className="month-notify-modal__title">
              Notify Designer for {monthName} {year}
            </h3>
            <p className="month-notify-modal__subtitle">
              Send an email that all work has been uploaded and design work can begin
            </p>
          </div>
          <button className="month-notify-modal__close" onClick={onClose} type="button" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="month-notify-modal__body">
          {error && (
            <div className="month-notify-modal__alert month-notify-modal__alert--error">
              <span>⚠️ {error}</span>
            </div>
          )}

          {/* Recipient card */}
          <div className="month-notify-modal__recipient-card">
            <div>
              <span className="month-notify-modal__label">Recipient (Designer):</span>
              <span className="month-notify-modal__email">
                {designerEmail || (
                  <span style={{ color: '#ea580c', fontWeight: 'bold' }}>
                    No Designer Email configured yet!
                  </span>
                )}
              </span>
            </div>
            {!designerEmail && (
              <button
                type="button"
                className="month-notify-modal__config-btn"
                onClick={() => {
                  onClose();
                  onOpenSettings?.();
                }}
              >
                Configure in Settings &rarr;
              </button>
            )}
          </div>

          {/* Month Summary stats */}
          <div className="month-notify-modal__stats">
            <div className="month-notify-modal__stat-item">
              <span className="month-notify-modal__stat-num">{monthItems.length}</span>
              <span className="month-notify-modal__stat-label">Planned Posts</span>
            </div>
            <div className="month-notify-modal__stat-item">
              <span className="month-notify-modal__stat-num">
                {monthItems.filter(i => (i.category || 'social') === 'social').length}
              </span>
              <span className="month-notify-modal__stat-label">Social Graphics</span>
            </div>
            <div className="month-notify-modal__stat-item">
              <span className="month-notify-modal__stat-num">
                {monthItems.filter(i => i.category === 'written').length}
              </span>
              <span className="month-notify-modal__stat-label">Written / Blogs</span>
            </div>
          </div>

          {/* Planned Items list */}
          <div className="month-notify-modal__preview-box">
            <h4 className="month-notify-modal__preview-title">
              Items included in email brief:
            </h4>
            <div className="month-notify-modal__items-list">
              {monthItems.length === 0 ? (
                <p className="month-notify-modal__empty">No items scheduled for this month yet.</p>
              ) : (
                monthItems.slice(0, 6).map((item, idx) => (
                  <div key={item.id || idx} className="month-notify-modal__item-row">
                    <span className="month-notify-modal__item-date">{item.date}</span>
                    <span className="month-notify-modal__item-name">{item.name}</span>
                    <span className="month-notify-modal__item-type">{item.platform} &bull; {item.type}</span>
                  </div>
                ))
              )}
              {monthItems.length > 6 && (
                <div className="month-notify-modal__more">
                  + {monthItems.length - 6} more content items
                </div>
              )}
            </div>
          </div>

          {/* Custom Note input */}
          <div className="month-notify-modal__field">
            <label className="month-notify-modal__label">
              Add Custom Note or Design Guidelines (Optional)
            </label>
            <textarea
              className="month-notify-modal__textarea"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="e.g. Please focus on vibrant summer color palettes for the carousels this month. High priority items are scheduled for the 1st and 15th."
              rows={3}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="month-notify-modal__actions">
          <button
            type="button"
            className="month-notify-modal__btn month-notify-modal__btn--secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="month-notify-modal__btn month-notify-modal__btn--primary"
            onClick={handleSend}
            disabled={sending || !designerEmail || monthItems.length === 0}
          >
            {sending ? 'Sending Notification...' : `Send Email to Designer 🚀`}
          </button>
        </div>
      </div>
    </div>
  );
}
