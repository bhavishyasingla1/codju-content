import { useState, useEffect, useRef, useMemo } from 'react';
import ContentRow from '../components/ContentRow/ContentRow';
import { useAuth } from '../context/AuthContext';
import { safeJsonParse } from '../utils/helpers';
import './ListView.css';

export default function ListView({
  content,
  onUpdate,
  onDelete,
  onPreview,
  onCreateNew,
  onEditItem,
  onOpenRevision,
  onSendForApproval,
  year,
  month,
}) {
  const { isViewer, isDesigner, isAdmin } = useAuth();
  const [expandedId, setExpandedId] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [customOrder, setCustomOrder] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const dragNode = useRef(null);
  const tableBottomRef = useRef(null);
  const prevContentLengthRef = useRef(content.length);

  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  // Instant 0ms synchronous sorting without useEffect re-render lag
  const displayedContent = useMemo(() => {
    let items = [...content];
    const order = customOrder || safeJsonParse(localStorage.getItem(`codju_order_${monthKey}`), null);
    if (order && Array.isArray(order) && order.length > 0) {
      items.sort((a, b) => {
        const idxA = order.indexOf(a.id);
        const idxB = order.indexOf(b.id);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return new Date(a.date) - new Date(b.date);
      });
    }
    return items;
  }, [content, customOrder, monthKey]);

  // Auto scroll smoothly to bottom when a new row is added
  useEffect(() => {
    if (content.length > prevContentLengthRef.current) {
      setTimeout(() => {
        tableBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
    prevContentLengthRef.current = content.length;
  }, [content.length]);

  // Reset custom order and selections when switching month/year
  useEffect(() => {
    setCustomOrder(null);
    setSelectedIds([]);
  }, [year, month]);

  const handleToggleExpand = (id) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const handleSelectRow = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === displayedContent.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(displayedContent.map(item => item.id));
    }
  };

  const handleBulkDelete = async () => {
    try {
      for (const id of selectedIds) {
        await onDelete(id, true);
      }
      setSelectedIds([]);
    } catch (e) {
      console.error('Failed to bulk delete items:', e);
    }
  };

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    dragNode.current = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const updated = [...displayedContent];
    const draggedItem = updated[draggedIndex];
    updated.splice(draggedIndex, 1);
    updated.splice(index, 0, draggedItem);

    setDraggedIndex(index);
    setCustomOrder(updated.map(i => i.id));
  };

  const handleDragEnd = () => {
    if (customOrder) {
      localStorage.setItem(`codju_order_${monthKey}`, JSON.stringify(customOrder));
    }
    setDraggedIndex(null);
    dragNode.current = null;
  };

  // Keyboard navigation helpers
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const activeElement = document.activeElement;
      if (activeElement && activeElement.tagName === 'INPUT') {
        const currentTd = activeElement.closest('td');
        const currentTr = activeElement.closest('tr');
        if (currentTd && currentTr) {
          const cellIndex = Array.from(currentTr.children).indexOf(currentTd);
          const nextTr = currentTr.nextElementSibling;
          let targetTr = nextTr;
          while (targetTr && (targetTr.classList.contains('content-row__summary-row') || targetTr.classList.contains('content-row__editor-row'))) {
            targetTr = targetTr.nextElementSibling;
          }
          if (targetTr) {
            const targetCell = targetTr.children[cellIndex];
            const targetInput = targetCell?.querySelector('input, select');
            targetInput?.focus();
            e.preventDefault();
          }
        }
      }
    }
  };

  const isAllSelected = displayedContent.length > 0 && selectedIds.length === displayedContent.length;

  return (
    <div className="list-view-container animate-fade-in" onKeyDown={handleKeyDown}>
      <div className="list-view__scroll">
        <table className="list-view__table">
          <thead>
            <tr>
              <th className="list-view__th list-view__th--drag" />
              <th className="list-view__th list-view__th--checkbox">
                {isAdmin && (
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    className="list-view__checkbox"
                  />
                )}
              </th>
              <th className="list-view__th list-view__th--date">Date</th>
              <th className="list-view__th list-view__th--name">Content Name</th>
              <th className="list-view__th list-view__th--type">Type</th>
              <th className="list-view__th list-view__th--center list-view__th--summary">Summary</th>
              <th className="list-view__th list-view__th--center list-view__th--upload">Upload</th>
              <th className="list-view__th list-view__th--center list-view__th--view">View</th>
              <th className="list-view__th list-view__th--status">Status</th>
            </tr>
          </thead>
          <tbody>
            {displayedContent.map((item, idx) => (
              <ContentRow
                key={item.id}
                item={item}
                index={idx}
                isExpanded={expandedId === item.id}
                onToggleExpand={() => handleToggleExpand(item.id)}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onPreview={onPreview}
                onEditItem={onEditItem}
                onOpenRevision={onOpenRevision}
                onSendForApproval={onSendForApproval}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                isDragging={draggedIndex === idx}
                isSelected={selectedIds.includes(item.id)}
                onSelectChange={() => handleSelectRow(item.id)}
              />
            ))}
          </tbody>
        </table>
        <div ref={tableBottomRef} />
      </div>

      <div className="list-view__footer-actions">
        {isAdmin && (
          <>
            <button className="list-view__add-row" onClick={onCreateNew} type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Row
            </button>

            {selectedIds.length > 0 && (
              <button className="list-view__delete-bulk animate-scale-in" onClick={handleBulkDelete} type="button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3,6 5,6 21,6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Delete Selected ({selectedIds.length})
              </button>
            )}
          </>
        )}

        {isDesigner && (
          <div className="list-view__designer-footer">
            <span className="list-view__designer-note">
              🎨 Designer Workspace &bull; {displayedContent.length} posts for this month
            </span>
          </div>
        )}

        {isViewer && (
          <div className="list-view__viewer-footer">
            <span className="list-view__viewer-note">
              👁️ Viewer Mode &bull; Showing {displayedContent.length} posts (Read-Only)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
