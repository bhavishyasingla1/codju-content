import { getDaysInMonth, getFirstDayOfMonth, getMonthName } from '../utils/helpers';
import { CONTENT_TYPES } from '../data/mockContent';
import { useAuth } from '../context/AuthContext';
import './CalendarView.css';

// Mini icon component for content types
function TypeIcon({ type }) {
  switch (type) {
    case 'carousel':
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="16" height="16" rx="2" />
          <rect x="6" y="2" width="16" height="16" rx="2" />
        </svg>
      );
    case 'reel':
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="2.2" />
          <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
        </svg>
      );
    case 'static':
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    case 'blog':
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case 'newsletter':
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      );
    case 'text':
    default:
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
  }
}

const STATUS_CONFIG = {
  draft: { label: 'Draft', className: 'calendar-grid__status--draft' },
  pending: { label: 'In Review', className: 'calendar-grid__status--pending' },
  revision: { label: 'Changes', className: 'calendar-grid__status--revision' },
  ready: { label: 'Approved', className: 'calendar-grid__status--ready' },
  published: { label: 'Published', className: 'calendar-grid__status--published' },
};

export default function CalendarView({
  year,
  month,
  content,
  onEditItem,
  onCreateNewForDate,
}) {
  const { isAdmin } = useAuth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayIndex = getFirstDayOfMonth(year, month);

  const monthName = getMonthName(month);
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Current real date for 'today' highlight
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  // Helper to match items to a day
  const getItemsForDay = (day) => {
    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return content.filter(item => item.date === dateString);
  };

  // Render cells list
  const cells = [];

  // Previous month cells
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevMonthDays = getDaysInMonth(prevYear, prevMonth);

  for (let i = 0; i < firstDayIndex; i++) {
    const dayNum = prevMonthDays - firstDayIndex + 1 + i;
    cells.push(
      <div key={`prev-${dayNum}`} className="calendar-grid__cell calendar-grid__cell--adjacent-month">
        <div className="calendar-grid__day-header">
          <span className="calendar-grid__day-number">{dayNum}</span>
        </div>
      </div>
    );
  }

  // Active month day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const items = getItemsForDay(day);
    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = year === currentYear && month === currentMonth && day === currentDay;

    const handleCellClick = (e) => {
      // Do not trigger if not admin or if clicking on an existing content item or the plus button
      if (!isAdmin) return;
      if (!e.target.closest('.calendar-grid__item') && !e.target.closest('.calendar-grid__add-btn')) {
        onCreateNewForDate(dateString);
      }
    };

    cells.push(
      <div
        key={`day-${day}`}
        className={`calendar-grid__cell ${isToday ? 'calendar-grid__cell--today' : ''} ${!isAdmin ? 'calendar-grid__cell--readonly' : ''}`}
        onClick={handleCellClick}
      >
        <div className="calendar-grid__day-header">
          <span className={`calendar-grid__day-number ${isToday ? 'calendar-grid__day-number--today' : ''}`}>
            {day}
            {isToday && <span className="calendar-grid__today-label">TODAY</span>}
          </span>
          {isAdmin && (
            <button
              className="calendar-grid__add-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCreateNewForDate(dateString);
              }}
              title={`Add content on ${monthName} ${day}`}
              type="button"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
        </div>

        <div className="calendar-grid__items">
          {items.map(item => {
            const typeInfo = CONTENT_TYPES.find(t => t.value === item.type) || CONTENT_TYPES[0];
            const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.draft;

            return (
              <button
                key={item.id}
                className="calendar-grid__item"
                style={{
                  borderLeftColor: typeInfo.color,
                  '--card-accent': typeInfo.color,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditItem(item);
                }}
                title={`${item.name} • ${typeInfo.label} (${statusConfig.label})`}
                type="button"
              >
                <div className="calendar-grid__item-top">
                  <span className="calendar-grid__item-type" style={{ color: typeInfo.color }}>
                    <TypeIcon type={item.type} />
                    <span className="calendar-grid__item-type-text">{typeInfo.label}</span>
                  </span>
                  <span
                    className={`calendar-grid__item-status-dot ${statusConfig.className}`}
                    title={`Status: ${statusConfig.label}`}
                  />
                </div>
                <span className="calendar-grid__item-title">{item.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Next month cells to fill the 5 or 6-week grid uniformly (35 or 42 cells total)
  const totalCells = firstDayIndex + daysInMonth;
  const nextMonthDaysCount = totalCells > 35 ? 42 - totalCells : 35 - totalCells;

  for (let day = 1; day <= nextMonthDaysCount; day++) {
    cells.push(
      <div key={`next-${day}`} className="calendar-grid__cell calendar-grid__cell--adjacent-month">
        <div className="calendar-grid__day-header">
          <span className="calendar-grid__day-number">{day}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="calendar-view animate-fade-in">
      <div className="calendar-grid">
        {/* Week headers */}
        {weekDays.map(d => (
          <div key={d} className={`calendar-grid__week-header ${d === 'Sun' || d === 'Sat' ? 'calendar-grid__week-header--weekend' : ''}`}>
            {d}
          </div>
        ))}

        {/* Day cells */}
        {cells}
      </div>
    </div>
  );
}
