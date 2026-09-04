import React from 'react';
import './StatusFilterBar.css';

export default function StatusFilterBar({
  activeFilter = 'all',
  onFilterChange,
  counts = {},
  category = 'social',
}) {
  const isWritten = category === 'written';

  const filterOptions = isWritten
    ? [
        { id: 'all', label: 'All Items', key: 'all', desc: 'View all written deliverables for this month' },
        { id: 'draft', label: 'Drafts', key: 'draft', dotColor: 'var(--color-status-draft, #94a3b8)', desc: 'Written items currently being drafted' },
        { id: 'ready', label: 'Ready to Publish', key: 'ready', dotColor: 'var(--color-status-ready, #10b981)', desc: 'Proofread & ready for publishing' },
        { id: 'published', label: 'Published', key: 'published', dotColor: 'var(--color-status-published, #3b82f6)', desc: 'Live & archived written pieces' },
      ]
    : [
        { id: 'all', label: 'All Content', key: 'all', desc: 'View entire monthly content calendar' },
        { id: 'draft', label: 'Drafts', key: 'draft', dotColor: '#94a3b8', desc: 'Briefs created, awaiting designer media' },
        { id: 'pending', label: 'In Review', key: 'pending', dotColor: '#f59e0b', desc: 'Creative assets uploaded, awaiting admin review' },
        { id: 'revision', label: 'Changes Requested', key: 'revision', dotColor: '#f43f5e', desc: 'Feedback provided, awaiting designer changes' },
        { id: 'ready', label: 'Approved & Ready', key: 'ready', dotColor: '#10b981', desc: 'Designs approved and ready for publishing' },
        { id: 'published', label: 'Published', key: 'published', dotColor: '#3b82f6', desc: 'Posts that have been published and finalized' },
      ];

  return (
    <div className="status-filter-bar" role="toolbar" aria-label="Filter content by workflow stage">
      <div className="status-filter-bar__pills">
        {filterOptions.map((option) => {
          const isActive = activeFilter === option.id;
          const count = counts[option.key] || 0;

          return (
            <button
              key={option.id}
              type="button"
              className={`status-filter-bar__pill ${isActive ? 'status-filter-bar__pill--active' : ''} status-filter-bar__pill--${option.id}`}
              onClick={() => onFilterChange(option.id)}
              aria-pressed={isActive}
              title={`${option.label} (${count}) — ${option.desc}`}
            >
              {option.dotColor && (
                <span
                  className="status-filter-bar__dot"
                  style={{ backgroundColor: option.dotColor }}
                  aria-hidden="true"
                />
              )}
              <span className="status-filter-bar__label">{option.label}</span>
              <span 
                className={`status-filter-bar__count ${isActive ? 'status-filter-bar__count--active' : ''}`}
                aria-label={`${count} items`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

