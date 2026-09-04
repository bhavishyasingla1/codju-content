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
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  // Only social content requires designer work (written content is admin-only)
  const socialItems = content.filter((item) => {
    return (item.category || 'social') === 'social' && item.date && item.date.startsWith(monthStr);
  });

  const handleSend = async () => {
    if (!designerEmail) {
      setError('Designer email is not configured. Please add the Designer Email in Settings.');
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
        items: socialItems.map((item) => ({
          id: item.id,
          date: item.date,
          name: item.name,
          platform: item.platform,
          type: item.type,
          summary: item.summary,
        })),
        customNote: customNote.trim(),
      });

      const monthSignature = socialItems.map((item) => item.id).sort().join(',');
      onSuccess?.(res.message || `Month brief sent to Designer (${designerEmail})!`, monthSignature);
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
              Send {monthName} {year} Brief to Designer
            </h3>
            <p className="month-notify-modal__subtitle">
              Notifies your designer that the social schedule is ready so they can begin design work
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

          {/* Recipient */}
          <div className="month-notify-modal__recipient-card">
            <div>
              <span className="month-notify-modal__label">Recipient (Designer):</span>
              <span className="month-notify-modal__email">
                {designerEmail || (
                  <span style={{ color: '#ea580c', fontWeight: 'bold' }}>
                    No Designer Email configured!
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

          {/* Planned Deliverables */}
          <div className="month-notify-modal__preview-box">
            <h4 className="month-notify-modal__preview-title">
              {socialItems.length} Deliverables for {monthName} {year}:
            </h4>
            <div className="month-notify-modal__items-list">
              {socialItems.length === 0 ? (
                <p className="month-notify-modal__empty">No social pieces scheduled for this month.</p>
              ) : (
                socialItems.slice(0, 6).map((item, idx) => (
                  <div key={item.id || idx} className="month-notify-modal__item-row">
                    <span className="month-notify-modal__item-date">{item.date}</span>
                    <span className="month-notify-modal__item-name">{item.name}</span>
                    <span className="month-notify-modal__item-type">{item.platform} &bull; {item.type}</span>
                  </div>
                ))
              )}
              {socialItems.length > 6 && (
                <div className="month-notify-modal__more">
                  + {socialItems.length - 6} more deliverables
                </div>
              )}
            </div>
          </div>

          {/* Custom Note */}
          <div className="month-notify-modal__field">
            <label className="month-notify-modal__label">
              Guidelines / Note for Designer (Optional)
            </label>
            <textarea
              className="month-notify-modal__textarea"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="e.g. Please prioritize the first 3 carousels and keep colors aligned with summer branding."
              rows={2}
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
            disabled={sending || !designerEmail || socialItems.length === 0}
          >
            {sending ? 'Sending...' : 'Send Email to Designer 🚀'}
          </button>
        </div>
      </div>
    </div>
  );
}
