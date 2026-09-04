import MonthSelector from '../MonthSelector/MonthSelector';
import SearchBar from '../SearchBar/SearchBar';
import { useAuth, ROLES } from '../../context/AuthContext';
import './TopNav.css';

export default function TopNav({
  year,
  month,
  onPrevMonth,
  onNextMonth,
  onCreateMonth,
  onChangeDate,
  searchQuery,
  onSearchChange,
  onSearchClear,
  onOpenSettings,
}) {
  const { role, openPinModal, isAdmin } = useAuth();

  return (
    <nav className="top-nav" id="top-nav">
      <div className="top-nav__inner">
        {/* Logo */}
        <div className="top-nav__logo">
          <img src="/assets/codju-logo.png" alt="Codju" className="top-nav__logo-img" />
        </div>

        {/* Month Selector */}
        <MonthSelector
          year={year}
          month={month}
          onPrev={onPrevMonth}
          onNext={onNextMonth}
          onCreateMonth={onCreateMonth}
          onChangeDate={onChangeDate}
        />

        {/* Right side: Settings + Role Switcher + Search */}
        <div className="top-nav__actions">
          {/* Admin: Settings modal button (all email configs are centralized inside) */}
          {isAdmin && (
            <button
              type="button"
              className="top-nav__settings-btn"
              onClick={onOpenSettings}
              title="Settings & Email Notifications"
              aria-label="Settings"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span className="top-nav__settings-label">Settings</span>
            </button>
          )}

          <button
            className={`top-nav__role-btn top-nav__role-btn--${role}`}
            onClick={() => openPinModal()}
            type="button"
            title="Click to enter PIN and change role"
          >
            <span className="top-nav__role-dot" />
            <span className="top-nav__role-text">
              {role === ROLES.ADMIN && 'Admin'}
              {role === ROLES.DESIGNER && 'Designer'}
              {role === ROLES.VIEWER && 'Viewer'}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </button>

          <SearchBar
            query={searchQuery}
            onChange={onSearchChange}
            onClear={onSearchClear}
          />
        </div>
      </div>
    </nav>
  );
}

