import React, { useEffect, useState } from 'react';
import './UndoToast.css';

export default function UndoToast({ toast, onUndo, onDismiss }) {
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    setIsClosing(false);
  }, [toast?.id]);

  if (!toast) return null;

  const handleUndo = () => {
    setIsClosing(true);
    setTimeout(() => {
      onUndo();
    }, 150);
  };

  const handleDismiss = () => {
    setIsClosing(true);
    setTimeout(() => {
      onDismiss();
    }, 200);
  };

  return (
    <div className={`undo-toast ${isClosing ? 'undo-toast--exit' : 'undo-toast--enter'}`} role="status" aria-live="polite">
      <div className="undo-toast__content">
        <span className="undo-toast__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </span>
        <span className="undo-toast__message">{toast.message}</span>
      </div>

      <div className="undo-toast__actions">
        <button
          type="button"
          className="undo-toast__btn-undo"
          onClick={handleUndo}
          aria-label="Undo last action"
        >
          <span>Undo</span>
          <span className="undo-toast__kbd">⌘Z</span>
        </button>

        <button
          type="button"
          className="undo-toast__btn-close"
          onClick={handleDismiss}
          aria-label="Dismiss notification"
          title="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="undo-toast__progress-bar" />
    </div>
  );
}
