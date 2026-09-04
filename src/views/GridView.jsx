import ContentCard from '../components/ContentCard/ContentCard';
import { useAuth } from '../context/AuthContext';
import './GridView.css';

export default function GridView({ content, onEditItem, onUpdate, onCreateNew }) {
  const { isAdmin } = useAuth();

  return (
    <div className="grid-view-container animate-fade-in">
      <div className="grid-view__grid">
        {content.map(item => (
          <ContentCard
            key={item.id}
            item={item}
            onEdit={() => onEditItem(item)}
            onStatusChange={(id, status) => onUpdate(id, { status })}
          />
        ))}
      </div>

      {isAdmin && (
        <button className="grid-view__add-card" onClick={onCreateNew} type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Create New Content</span>
        </button>
      )}
    </div>
  );
}
