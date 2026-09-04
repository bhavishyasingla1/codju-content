import { useState, useEffect } from 'react';
import StatusBadge from '../StatusBadge/StatusBadge';
import { CONTENT_TYPES } from '../../data/mockContent';
import { useAuth } from '../../context/AuthContext';
import './ContentRow.css';

export default function ContentRow({
  item,
  index,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  onPreview,
  onEditItem,
  onOpenRevision,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
  isSelected,
  onSelectChange,
  onSendForApproval,
}) {
  const { isViewer, isDesigner, isAdmin, openPinModal } = useAuth();
  const [localItem, setLocalItem] = useState(item);
  const [isDraggable, setIsDraggable] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const isWritten = (item.category || 'social') === 'written';
  const canEdit = isWritten ? isAdmin : !isViewer;

  useEffect(() => {
    setLocalItem(item);
  }, [item]);

  const handleInputChange = (field, value) => {
    if (!canEdit) {
      openPinModal();
      return;
    }
    const updated = { ...localItem, [field]: value };
    setLocalItem(updated);
    onUpdate(item.id, { [field]: value });
  };

  const handleStatusChange = () => {
    if (!isAdmin) {
      openPinModal();
      return;
    }
    const order = isWritten
      ? ['draft', 'ready', 'published']
      : ['draft', 'pending', 'revision', 'ready', 'published'];
    const currentIdx = order.indexOf(item.status);
    const nextStatus = order[(currentIdx + 1) % order.length];
    onUpdate(item.id, { status: nextStatus });
  };

  const handleMarkReady = (e) => {
    e?.stopPropagation();
    if (!isAdmin) {
      openPinModal();
      return;
    }
    onUpdate(item.id, {
      status: 'ready',
      reviewedAt: new Date().toISOString(),
    });
  };

  const handleApprove = (e) => {
    e?.stopPropagation();
    if (!isAdmin) {
      openPinModal();
      return;
    }
    onUpdate(item.id, {
      status: 'ready',
      reviewedAt: new Date().toISOString(),
    });
  };

  const handlePublish = (e) => {
    e?.stopPropagation();
    if (!isAdmin) {
      openPinModal();
      return;
    }
    onUpdate(item.id, {
      status: 'published',
    });
  };

  const handleRequestRevision = (e) => {
    e?.stopPropagation();
    if (!isAdmin) {
      openPinModal();
      return;
    }
    onOpenRevision?.(item);
  };

  const handleViewFeedback = (e) => {
    e?.stopPropagation();
    onOpenRevision?.(item);
  };

  const handleSendForApproval = (e) => {
    e?.stopPropagation();
    if (isViewer || isWritten) {
      openPinModal();
      return;
    }
    if (onSendForApproval) {
      onSendForApproval(item);
    } else {
      onUpdate(item.id, {
        status: 'pending',
      });
    }
  };

  const fileCount = (item.assets?.length || 0) + (item.pdfAsset ? 1 : 0);
  const hasMedia = fileCount > 0 || !!item.thumbnailAsset || (item.type === 'text' && !!item.richText?.trim() && item.richText !== '<p><br></p>');

  // If content is present/uploaded from designer side (social only), effective status is 'pending' (In Review).
  // For written content, status is strictly controlled by Admin: draft -> ready -> published.
  const currentStatus = (!isWritten && item.status === 'draft' && hasMedia) ? 'pending' : item.status;

  const handleViewPreview = () => {
    const allAssets = [];
    if (item.assets && item.assets.length > 0) {
      allAssets.push(...item.assets);
    }
    if (item.pdfAsset) {
      allAssets.push(item.pdfAsset);
    }
    if (allAssets.length === 0 && item.thumbnailAsset) {
      allAssets.push(item.thumbnailAsset);
    }

    if (allAssets.length > 0) {
      onPreview({
        assets: allAssets,
        initialIndex: 0,
        richText: item.type === 'text' ? item.richText : null,
      });
    } else if (item.richText) {
      onPreview({
        richText: item.richText,
        caption: item.caption,
      });
    }
  };

  const handleCopySummary = (e) => {
    e?.stopPropagation();
    if (!localItem.summary) return;
    navigator.clipboard?.writeText(localItem.summary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const hasSummary = Boolean(localItem.summary && localItem.summary.trim());

  return (
    <>
      <tr
        className={`content-row ${isExpanded ? 'content-row--expanded' : ''} ${isDragging ? 'content-row--dragging' : ''}`}
        id={`row-${item.id}`}
        draggable={isAdmin && isDraggable}
        onDragStart={(e) => {
          setIsDraggable(false);
          onDragStart?.(e, index);
        }}
        onDragOver={(e) => onDragOver?.(e, index)}
        onDragEnd={onDragEnd}
      >
        {/* Cell: Drag Handle */}
        <td className="content-row__cell content-row__cell--drag">
          {isAdmin ? (
            <div
              className="content-row__drag-handle"
              title="Drag to reorder"
              onMouseDown={() => setIsDraggable(true)}
              onMouseUp={() => setIsDraggable(false)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="9" cy="5" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="9" cy="19" r="1.5" />
                <circle cx="15" cy="5" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="15" cy="19" r="1.5" />
              </svg>
            </div>
          ) : null}
        </td>

        {/* Cell: Checkbox selection */}
        <td className="content-row__cell content-row__cell--checkbox" onClick={(e) => e.stopPropagation()}>
          {isAdmin ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onSelectChange}
              className="content-row__checkbox"
            />
          ) : null}
        </td>

        {/* Cell: Date */}
        <td className="content-row__cell content-row__cell--date">
          {isAdmin ? (
            <input
              type="date"
              className="content-row__input content-row__input--date"
              value={localItem.date || ''}
              onChange={(e) => handleInputChange('date', e.target.value)}
            />
          ) : (
            <span className="content-row__text content-row__text--date">{localItem.date || '—'}</span>
          )}
        </td>

        {/* Cell: Name */}
        <td className="content-row__cell content-row__cell--name">
          {isAdmin ? (
            <input
              type="text"
              className="content-row__input content-row__input--name"
              value={localItem.name || ''}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="Content name..."
            />
          ) : (
            <span className="content-row__text content-row__text--name" title={localItem.name}>
              {localItem.name || 'Untitled'}
            </span>
          )}
        </td>

        {/* Cell: Type */}
        <td className="content-row__cell content-row__cell--type">
          {isAdmin ? (
            <select
              className="content-row__select"
              value={localItem.type}
              onChange={(e) => handleInputChange('type', e.target.value)}
            >
              {CONTENT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          ) : (
            <span className="content-row__type-pill">
              {CONTENT_TYPES.find(t => t.value === localItem.type)?.label || localItem.type}
            </span>
          )}
        </td>

        {/* Cell: Summary Accordion Downward Arrow Button */}
        <td className="content-row__cell content-row__cell--center content-row__cell--summary">
          <button
            className={`content-row__btn-summary-toggle ${isExpanded ? 'content-row__btn-summary-toggle--active' : ''} ${hasSummary ? 'content-row__btn-summary-toggle--has-content' : ''}`}
            onClick={onToggleExpand}
            title={isExpanded ? 'Collapse Brief & Summary' : (hasSummary ? 'View Creative Brief & Summary' : 'Add Creative Brief & Summary')}
            type="button"
            aria-expanded={isExpanded}
          >
            <svg
              className="content-row__chevron-icon"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </td>

        {/* Cell: Upload Indicator */}
        <td className="content-row__cell content-row__cell--center content-row__cell--upload">
          <button
            className={`content-row__btn-upload ${fileCount > 0 ? 'content-row__btn-upload--has-files' : ''}`}
            onClick={() => onEditItem(item)}
            title={isViewer ? 'Click to view assets' : isDesigner ? `${fileCount} files uploaded. Click to upload/edit designs.` : `${fileCount} files uploaded. Click to inspect/edit.`}
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17,8 12,3 7,8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {fileCount > 0 && <span className="content-row__file-count">{fileCount}</span>}
          </button>
        </td>

        {/* Cell: View Preview */}
        <td className="content-row__cell content-row__cell--center content-row__cell--view">
          <button
            className="content-row__btn-view"
            onClick={handleViewPreview}
            disabled={!hasMedia && !(item.type === 'text' && item.richText)}
            title="View Preview"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </td>

        {/* Cell: Status & Approval Action Buttons */}
        <td className="content-row__cell content-row__cell--status">
          <div className="content-row__approval-group">
            <div className="content-row__status-badge-container">
              <StatusBadge
                status={currentStatus}
                onClick={isAdmin ? handleStatusChange : undefined}
                onOpenRevision={handleViewFeedback}
                feedback={item.feedback}
                disabled={isViewer || isDesigner}
                size="small"
              />

              {/* ADMIN ACTIONS: Written Content (Draft -> Ready -> Published) */}
              {isAdmin && isWritten && currentStatus === 'draft' && (
                <button
                  type="button"
                  className="content-row__quick-btn content-row__quick-btn--approve"
                  onClick={handleMarkReady}
                  title="Mark article/newsletter as Ready for publishing"
                >
                  Mark Ready ✓
                </button>
              )}

              {isAdmin && isWritten && currentStatus === 'ready' && (
                <button
                  type="button"
                  className="content-row__quick-btn content-row__quick-btn--publish"
                  onClick={handlePublish}
                  title="Mark written content as Published"
                >
                  Publish 🚀
                </button>
              )}

              {/* ADMIN ACTIONS: Social Content */}
              {isAdmin && !isWritten && currentStatus === 'pending' && (
                <>
                  <button
                    type="button"
                    className="content-row__quick-btn content-row__quick-btn--approve"
                    onClick={handleApprove}
                    title="Approve design (Ready to publish)"
                  >
                    ✓ Approve
                  </button>
                  <button
                    type="button"
                    className="content-row__quick-btn content-row__quick-btn--changes"
                    onClick={handleRequestRevision}
                    title="Rectify design & provide clarification to Designer"
                  >
                    ✎ Rectify / Changes
                  </button>
                </>
              )}

              {isAdmin && !isWritten && currentStatus === 'ready' && (
                <button
                  type="button"
                  className="content-row__quick-btn content-row__quick-btn--publish"
                  onClick={handlePublish}
                  title="Mark post as published (Scheduled/Live)"
                >
                  Publish 🚀
                </button>
              )}

              {isAdmin && !isWritten && currentStatus === 'revision' && (
                <>
                  <button
                    type="button"
                    className="content-row__quick-btn content-row__quick-btn--changes"
                    onClick={handleRequestRevision}
                    title="View or update clarification instructions"
                  >
                    ✎ Clarification
                  </button>
                  <button
                    type="button"
                    className="content-row__quick-btn content-row__quick-btn--approve"
                    onClick={handleApprove}
                    title="Approve design directly"
                  >
                    ✓ Approve
                  </button>
                </>
              )}

              {/* DESIGNER ACTIONS: Social Content Only */}
              {isDesigner && !isWritten && currentStatus === 'draft' && (
                <button
                  type="button"
                  className="content-row__quick-btn content-row__quick-btn--send"
                  onClick={handleSendForApproval}
                  title="Send design to Admin for approval"
                >
                  Submit for Approval 🚀
                </button>
              )}

              {isDesigner && !isWritten && currentStatus === 'revision' && (
                <>
                  <button
                    type="button"
                    className="content-row__quick-btn content-row__quick-btn--changes"
                    onClick={handleViewFeedback}
                    title="View Admin's clarification and instructions"
                  >
                    View Instructions 💬
                  </button>
                  <button
                    type="button"
                    className="content-row__quick-btn content-row__quick-btn--send"
                    onClick={handleSendForApproval}
                    title="Resubmit updated design for approval"
                  >
                    Resubmit 🚀
                  </button>
                </>
              )}
            </div>

            {/* Row Delete Button (Admin Only) */}
            {isAdmin && (
              <button
                type="button"
                className="content-row__delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onDelete(item.id);
                }}
                title="Delete this row"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Accordion Row: ONLY Creative Brief & Summary */}
      {isExpanded && (
        <tr className="content-row__summary-row animate-fade-in">
          <td colSpan={9} className="content-row__summary-cell">
            <div className="content-row__summary-panel">
              <div className="content-row__summary-panel-header">
                <div className="content-row__summary-panel-title">
                  <span className="content-row__summary-panel-badge">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    Creative Brief & Summary
                  </span>
                  <span className="content-row__summary-panel-name">
                    {localItem.name || 'Untitled Content'}
                  </span>
                </div>

                <div className="content-row__summary-panel-actions">
                  {hasSummary && (
                    <button
                      type="button"
                      className="content-row__summary-action-btn"
                      onClick={handleCopySummary}
                      title="Copy creative brief to clipboard"
                    >
                      {copiedSummary ? (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          Copy Brief
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    className="content-row__summary-close-btn"
                    onClick={onToggleExpand}
                    title="Collapse brief"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="content-row__summary-panel-body">
                {isAdmin ? (
                  <div className="content-row__summary-admin-edit">
                    <textarea
                      className="content-row__summary-textarea"
                      value={localItem.summary || ''}
                      onChange={(e) => handleInputChange('summary', e.target.value)}
                      placeholder="Write the creative brief, visual instructions, copy notes, or summary for this post..."
                      rows={4}
                      autoFocus
                    />
                    <div className="content-row__summary-footer-meta">
                      <span className="content-row__summary-meta-hint">
                        💡 Auto-saves instantly. Visible to designers and team for content creation.
                      </span>
                      <span className="content-row__summary-meta-count">
                        {(localItem.summary || '').length} characters
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="content-row__summary-display">
                    {localItem.summary ? (
                      <p className="content-row__summary-text">{localItem.summary}</p>
                    ) : (
                      <div className="content-row__summary-empty">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span>No creative brief or summary provided yet for this post.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
