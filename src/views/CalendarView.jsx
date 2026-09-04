import { getDaysInMonth, getFirstDayOfMonth, getMonthName } from '../utils/helpers';
import { CONTENT_TYPES } from '../data/mockContent';
import { useAuth } from '../context/AuthContext';
import './CalendarView.css';

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
        className={`calendar-grid__cell ${!isAdmin ? 'calendar-grid__cell--readonly' : ''}`}
        onClick={handleCellClick}
      >
        <div className="calendar-grid__day-header">
          <span className="calendar-grid__day-number">{day}</span>
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
            return (
              <button
                key={item.id}
                className="calendar-grid__item"
                style={{
                  borderLeft: `3px solid ${typeInfo.color}`,
                  background: typeInfo.bg,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditItem(item);
                }}
                title={`${item.name} (${typeInfo.label})`}
                type="button"
              >
                <span className="calendar-grid__item-title">{item.name}</span>
                <span className={`calendar-grid__item-status calendar-grid__item-status--${item.status}`} />
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
          <div key={d} className="calendar-grid__week-header">
            {d}
          </div>
        ))}

        {/* Day cells */}
        {cells}
      </div>
    </div>
  );
}
