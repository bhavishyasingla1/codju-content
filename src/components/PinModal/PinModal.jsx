import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth, ROLES, PINS } from '../../context/AuthContext';
import './PinModal.css';

export default function PinModal({ isOpen, onClose }) {
  const { role, login, logout, selectDesigner, targetAction } = useAuth();
  const [step, setStep] = useState('select'); // 'select' | 'pin'
  const [digits, setDigits] = useState(['', '', '', '']);
  const [error, setError] = useState(null);
  const [successRole, setSuccessRole] = useState(null);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (isOpen) {
      setDigits(['', '', '', '']);
      setError(null);
      setSuccessRole(null);
      // If opened specifically by an admin-restricted action, jump to PIN entry directly
      if (targetAction) {
        setStep('pin');
        setTimeout(() => {
          inputRefs.current[0]?.focus();
        }, 50);
      } else {
        setStep('select');
      }
    }
  }, [isOpen, targetAction]);

  const handleChooseAdmin = () => {
    setDigits(['', '', '', '']);
    setError(null);
    setSuccessRole(null);
    setStep('pin');
    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 50);
  };

  const handleChooseDesigner = () => {
    selectDesigner();
  };

  const handleSelectViewer = () => {
    logout();
    onClose();
  };

  const handleDigitChange = (index, value) => {
    const cleanValue = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = cleanValue;
    setDigits(newDigits);
    setError(null);

    // Auto-advance
    if (cleanValue && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // If all 4 digits entered, auto-submit
    if (cleanValue && index === 3) {
      const fullPin = newDigits.join('');
      if (fullPin.length === 4) {
        verifyPin(fullPin);
      }
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted) {
      const newDigits = ['', '', '', ''];
      for (let i = 0; i < pasted.length; i++) {
        newDigits[i] = pasted[i];
      }
      setDigits(newDigits);
      if (pasted.length === 4) {
        verifyPin(pasted);
      } else {
        inputRefs.current[pasted.length]?.focus();
      }
    }
  };

  const verifyPin = useCallback((pinToVerify) => {
    const cleanPin = String(pinToVerify).trim();
    if (cleanPin === PINS.ADMIN) {
      const res = login(cleanPin);
      if (res.success) {
        setSuccessRole(ROLES.ADMIN);
        setTimeout(() => {
          onClose();
        }, 400);
        return;
      }
    } else if (cleanPin === PINS.DESIGNER) {
      const res = login(cleanPin);
      if (res.success) {
        setSuccessRole(ROLES.DESIGNER);
        setTimeout(() => {
          onClose();
        }, 400);
        return;
      }
    }

    setError('Incorrect PIN. Admin view requires valid PIN.');
    setDigits(['', '', '', '']);
    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 50);
  }, [login, onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const fullPin = digits.join('');
    if (fullPin.length === 4) {
      verifyPin(fullPin);
    } else {
      setError('Please enter all 4 digits');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="pin-modal__backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pin-modal animate-scale-in">
        {step === 'select' ? (
          <>
            {/* Step 1: Who is there? (Role Selection) */}
            <div className="pin-modal__header">
              <div className="pin-modal__header-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="pin-modal__title">Who is there?</h3>
              <p className="pin-modal__subtitle">
                Select your role to access the workspace
              </p>
              <button className="pin-modal__close" onClick={onClose} type="button" aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="pin-modal__body">
              {role !== ROLES.VIEWER && (
                <div className="pin-modal__current-role">
                  <span className="pin-modal__role-label">Current Access:</span>
                  <span className={`pin-modal__role-tag pin-modal__role-tag--${role}`}>
                    {role === ROLES.ADMIN && '👑 Admin'}
                    {role === ROLES.DESIGNER && '🎨 Designer'}
                  </span>
                </div>
              )}

              <div className="pin-modal__role-options">
                {/* Admin Role Button */}
                <button
                  type="button"
                  className="pin-modal__role-option-btn pin-modal__role-option-btn--admin"
                  onClick={handleChooseAdmin}
                >
                  <div className="pin-modal__role-option-icon pin-modal__role-option-icon--admin">
                    👑
                  </div>
                  <div className="pin-modal__role-option-content">
                    <div className="pin-modal__role-option-header">
                      <span className="pin-modal__role-option-title">Admin</span>
                      <span className="pin-modal__role-option-badge pin-modal__role-option-badge--admin">PIN Required</span>
                    </div>
                    <p className="pin-modal__role-option-desc">
                      Full workspace control, edits, reviews, AI & settings
                    </p>
                  </div>
                  <div className="pin-modal__role-option-arrow">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>

                {/* Designer Role Button */}
                <button
                  type="button"
                  className="pin-modal__role-option-btn pin-modal__role-option-btn--designer"
                  onClick={handleChooseDesigner}
                >
                  <div className="pin-modal__role-option-icon pin-modal__role-option-icon--designer">
                    🎨
                  </div>
                  <div className="pin-modal__role-option-content">
                    <div className="pin-modal__role-option-header">
                      <span className="pin-modal__role-option-title">Designer</span>
                      <span className="pin-modal__role-option-badge pin-modal__role-option-badge--designer">Workspace</span>
                    </div>
                    <p className="pin-modal__role-option-desc">
                      Upload visual assets, view briefs & submit revisions
                    </p>
                  </div>
                  <div className="pin-modal__role-option-arrow">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>
              </div>

              <div className="pin-modal__actions" style={{ marginTop: '4px' }}>
                <button
                  type="button"
                  className="pin-modal__logout-btn"
                  onClick={handleSelectViewer}
                >
                  Continue as Read-Only Viewer
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Step 2: Admin PIN Entry */}
            <div className="pin-modal__header">
              <div className="pin-modal__header-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h3 className="pin-modal__title">Admin Verification</h3>
              <p className="pin-modal__subtitle">
                Enter 4-digit Admin PIN to open Admin view
              </p>
              <button className="pin-modal__close" onClick={onClose} type="button" aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="pin-modal__body">
              {/* PIN Input Slots */}
              <div className="pin-modal__inputs" onPaste={handlePaste}>
                {digits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (inputRefs.current[idx] = el)}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    className={`pin-modal__input ${error ? 'pin-modal__input--error' : ''} ${digit ? 'pin-modal__input--filled' : ''}`}
                    autoComplete="off"
                  />
                ))}
              </div>

              {/* Error message */}
              {error && (
                <div className="pin-modal__alert pin-modal__alert--error animate-fade-in">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {/* Success message */}
              {successRole && (
                <div className="pin-modal__alert pin-modal__alert--success animate-fade-in">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>👑 Unlocked as Admin!</span>
                </div>
              )}

              <div className="pin-modal__actions">
                <button type="submit" className="pin-modal__submit-btn">
                  Unlock Admin View
                </button>
                <button
                  type="button"
                  className="pin-modal__back-btn"
                  onClick={() => {
                    setError(null);
                    setStep('select');
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
                  Back to Role Selection
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
