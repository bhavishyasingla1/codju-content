import { useState, useEffect } from 'react';
import StatusBadge from '../StatusBadge/StatusBadge';
import ContentEditor from '../ContentEditor/ContentEditor';
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

  const handleClearRevision = (e) => {
    e?.stopPropagation();
    if (!isAdmin) {
      openPinModal();
      return;
    }
    onUpdate(item.id, {
      feedback: '',
      feedbackAssets: [],
      status: 'pending',
    });
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

  const handleClose = () => {
    onToggleExpand();
    const isDefaultName = !item.name || item.name.trim() === 'Untitled Content';
    const hasNoCaption = !item.caption?.trim();
    const hasNoSummary = !item.summary?.trim();
    const hasNoRichText = !item.richText?.trim() || item.richText === '<p><br></p>';
    const hasNoAssets = !item.assets || item.assets.length === 0;
    const hasNoPdf = !item.pdfAsset;
    const hasNoThumbnail = !item.thumbnailAsset;

    if (isAdmin && isDefaultName && hasNoCaption && hasNoSummary && hasNoRichText && hasNoAssets && hasNoPdf && hasNoThumbnail) {
      onDelete(item.id, true);
    }
  };

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

        {/* Cell: Summary */}
        <td className="content-row__cell content-row__cell--summary">
          {isAdmin ? (
            <input
              type="text"
              className="content-row__input content-row__input--summary"
              value={localItem.summary || ''}
              onChange={(e) => handleInputChange('summary', e.target.value)}
              placeholder="Enter summary..."
            />
          ) : (
            <span className="content-row__text content-row__text--summary" title={localItem.summary}>
              {localItem.summary || '—'}
            </span>
          )}
        </td>

        {/* Cell: Expand Editor */}
        <td className="content-row__cell content-row__cell--center">
          <button
            className={`content-row__btn-expand ${isExpanded ? 'content-row__btn-expand--active' : ''}`}
            onClick={onToggleExpand}
            title={isExpanded ? 'Collapse Details' : 'Expand Details'}
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </td>

        {/* Cell: Upload Indicator */}
        <td className="content-row__cell content-row__cell--center">
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
        <td className="content-row__cell content-row__cell--center">
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

      {isExpanded && (
        <tr className="content-row__editor-row">
          <td colSpan={11} className="content-row__editor-cell">
            <div className="content-row__editor-wrapper">
              <ContentEditor
                item={item}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onPreview={onPreview}
                onClose={handleClose}
                onOpenRevision={() => onOpenRevision?.(item)}
                onSendForApproval={onSendForApproval}
                showSummary={true}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
