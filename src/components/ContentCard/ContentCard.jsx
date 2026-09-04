import TypeBadge from '../TypeBadge/TypeBadge';
import StatusBadge from '../StatusBadge/StatusBadge';
import { formatDate, truncate } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';
import './ContentCard.css';

export default function ContentCard({ item, onEdit, onStatusChange }) {
  const { isAdmin, isViewer } = useAuth();

  // Try to find a thumbnail from the item assets or the designated thumbnail field
  const getThumbnail = () => {
    if (item.thumbnailAsset?.url) {
      return item.thumbnailAsset.url;
    }
    const imgAsset = item.assets?.find(a => a.type?.startsWith('image/'));
    return imgAsset?.url || null;
  };

  const thumbnail = getThumbnail();

  return (
    <div className="content-card animate-fade-in-up">
      {/* Thumbnail */}
      <div className="content-card__media" onClick={onEdit}>
        {thumbnail ? (
          <img src={thumbnail} alt={item.name} className="content-card__img" />
        ) : (
          <div className="content-card__media-placeholder">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21,15 16,10 5,21" />
            </svg>
            <span className="content-card__placeholder-text">No Media</span>
          </div>
        )}

      </div>

      {/* Body */}
      <div className="content-card__body">
        <div className="content-card__meta">
          <span className="content-card__date">{formatDate(item.date)}</span>
          <TypeBadge type={item.type} size="small" />
        </div>

        <h3 className="content-card__title" onClick={onEdit}>
          {item.name}
        </h3>

        <p className="content-card__summary">
          {truncate(item.summary || item.caption, 80) || <i>No description</i>}
        </p>
      </div>

      {/* Footer */}
      <div className="content-card__footer">
        <StatusBadge
          status={item.status}
          onClick={isAdmin ? () => {
            const isWritten = (item.category || 'social') === 'written';
            const order = isWritten
              ? ['draft', 'ready', 'published']
              : ['draft', 'pending', 'revision', 'ready', 'published'];
            const currentIdx = order.indexOf(item.status);
            const nextStatus = order[(currentIdx + 1) % order.length];
            onStatusChange?.(item.id, nextStatus);
          } : undefined}
          disabled={!isAdmin}
          size="small"
        />
        <button className="content-card__edit-btn" onClick={onEdit} type="button">
          {isViewer ? 'View' : 'Edit'}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
