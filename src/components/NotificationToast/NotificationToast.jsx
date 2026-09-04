import { useEffect, useState } from 'react';
import './NotificationToast.css';

export default function NotificationToast({ toast, onDismiss }) {
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    setIsClosing(false);
    if (!toast) return;

    const timer = setTimeout(() => {
      setIsClosing(true);
      setTimeout(() => onDismiss?.(), 250);
    }, 4500);

    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const handleDismiss = () => {
    setIsClosing(true);
    setTimeout(() => onDismiss?.(), 200);
  };

  const isError = toast.isError;

  return (
    <div
      className={`notif-toast ${isError ? 'notif-toast--error' : 'notif-toast--success'} ${
        isClosing ? 'notif-toast--exit' : 'notif-toast--enter'
      }`}
      role="status"
    >
      <div className="notif-toast__icon">
        {isError ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>

      <div className="notif-toast__body">
        <span className="notif-toast__title">{toast.title || (isError ? 'Notice' : 'Notification')}</span>
        <span className="notif-toast__msg">{toast.message}</span>
      </div>

      <button
        type="button"
        className="notif-toast__close"
        onClick={handleDismiss}
        aria-label="Close notification"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="notif-toast__progress" />
    </div>
  );
}
