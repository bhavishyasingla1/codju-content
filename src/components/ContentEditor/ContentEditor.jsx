import { useState, useCallback } from 'react';
import { CONTENT_TYPES } from '../../data/mockContent';
import UploadZone from '../UploadZone/UploadZone';
import RichTextEditor from '../RichTextEditor/RichTextEditor';
import StatusBadge from '../StatusBadge/StatusBadge';
import SaveButton from '../SaveButton/SaveButton';
import { useAutoSave } from '../../hooks/useAutoSave';
import { uploadAsset } from '../../services/contentService';
import { useAuth } from '../../context/AuthContext';
import './ContentEditor.css';

export default function ContentEditor({ item, onUpdate, onDelete, onPreview, onClose, onOpenRevision, onSendForApproval, showSummary = false }) {
  const { isViewer, isDesigner, isAdmin, openPinModal } = useAuth();
  const [formData, setFormData] = useState({ ...item });

  const saveFunction = useCallback(async () => {
    if (isViewer) return;
    await onUpdate(item.id, formData);
  }, [item.id, formData, onUpdate, isViewer]);

  const { saveStatus, triggerSave, forceSave } = useAutoSave(saveFunction, 3000);

  const handleChange = (field, value) => {
    if (isViewer) {
      openPinModal();
      return;
    }
    setFormData(prev => ({ ...prev, [field]: value }));
    triggerSave();
  };

  const handleTypeChange = (newType) => {
    if (!isAdmin) {
      openPinModal();
      return;
    }
    setFormData(prev => ({ ...prev, type: newType }));
    triggerSave();
  };

  const handleStatusChange = (newStatus) => {
    if (!isAdmin) {
      openPinModal();
      return;
    }
    setFormData(prev => ({ ...prev, status: newStatus }));
    onUpdate(item.id, { ...formData, status: newStatus });
  };

  const handleUpload = async (file) => {
    if (isViewer) {
      openPinModal();
      return;
    }
    const asset = await uploadAsset(file);
    setFormData(prev => {
      const nextAssets = [...(prev.assets || []), asset];
      const nextStatus = prev.status === 'draft' ? 'pending' : prev.status;
      const updated = { ...prev, assets: nextAssets, status: nextStatus };
      onUpdate(item.id, updated);
      return updated;
    });
  };

  const handleSendForApproval = () => {
    if (isViewer) {
      openPinModal();
      return;
    }
    const updated = { ...formData, status: 'pending' };
    setFormData(updated);
    if (onSendForApproval) {
      onSendForApproval(updated);
    } else {
      onUpdate(item.id, updated);
    }
  };

  const handleRemoveAsset = (assetId) => {
    if (isViewer) {
      openPinModal();
      return;
    }
    setFormData(prev => {
      const nextAssets = prev.assets.filter((a, idx) => (a.id || idx) !== assetId);
      const hasAnyMedia = nextAssets.length > 0 || !!prev.pdfAsset || !!prev.thumbnailAsset;
      const nextStatus = (!hasAnyMedia && prev.status === 'pending') ? 'draft' : prev.status;
      const updated = { ...prev, assets: nextAssets, status: nextStatus };
      onUpdate(item.id, updated);
      return updated;
    });
  };

  const renderTypeFields = () => {
    switch (formData.type) {
      case 'static':
        return (
          <>
            <div className="editor__field">
              <label className="editor__label">Caption</label>
              <textarea
                className="editor__textarea"
                value={formData.caption || ''}
                onChange={(e) => handleChange('caption', e.target.value)}
                placeholder="Write your caption..."
                rows={4}
              />
            </div>
            <UploadZone
              label="Upload Asset (Image, Video, or PDF)"
              assets={formData.assets || []}
              onUpload={handleUpload}
              onRemove={handleRemoveAsset}
              onPreview={(asset, idx) => onPreview({ asset, assets: formData.assets || [asset], initialIndex: idx ?? 0, caption: formData.caption })}
              accept="image/*,video/*,application/pdf,.pdf"
            />
          </>
        );

      case 'carousel':
        return (
          <>
            <div className="editor__field">
              <label className="editor__label">Caption</label>
              <textarea
                className="editor__textarea"
                value={formData.caption || ''}
                onChange={(e) => handleChange('caption', e.target.value)}
                placeholder="Write your caption..."
                rows={4}
              />
            </div>
            <UploadZone
              label="Upload Images (4-5 Slides)"
              assets={(formData.assets || []).filter(a => a.type?.startsWith('image/') || !a.type?.includes('pdf'))}
              onUpload={handleUpload}
              onRemove={handleRemoveAsset}
              onPreview={(asset, idx) => {
                const imgAssets = (formData.assets || []).filter(a => a.type?.startsWith('image/') || !a.type?.includes('pdf'));
                onPreview({ asset, assets: imgAssets, initialIndex: idx ?? 0, caption: formData.caption });
              }}
              multiple
              accept="image/*"
            />
            <UploadZone
              label="Upload Carousel PDF Document"
              assets={formData.pdfAsset ? [formData.pdfAsset] : []}
              onUpload={async (file) => {
                const asset = await uploadAsset(file);
                setFormData(prev => {
                  const nextStatus = prev.status === 'draft' ? 'pending' : prev.status;
                  const updated = { ...prev, pdfAsset: asset, status: nextStatus };
                  onUpdate(item.id, updated);
                  return updated;
                });
              }}
              onRemove={() => {
                setFormData(prev => {
                  const hasOtherMedia = (prev.assets || []).length > 0 || !!prev.thumbnailAsset;
                  const nextStatus = (!hasOtherMedia && prev.status === 'pending') ? 'draft' : prev.status;
                  const updated = { ...prev, pdfAsset: null, status: nextStatus };
                  onUpdate(item.id, updated);
                  return updated;
                });
              }}
              onPreview={(asset) => onPreview({ asset, assets: [asset], initialIndex: 0, caption: formData.caption })}
              accept="application/pdf,.pdf"
            />
          </>
        );

      case 'blog':
      case 'newsletter':
        return (
          <>
            <div className="editor__field">
              <label className="editor__label">
                {formData.type === 'newsletter' ? 'Newsletter Draft Body' : 'Article / Blog Content (Rich Text)'}
              </label>
              <RichTextEditor
                value={formData.richText || ''}
                onChange={(html) => handleChange('richText', html)}
                placeholder="Write your full article, blog post, or newsletter draft..."
                showCopyButton
                showCharCount
              />
            </div>
            <div className="editor__field">
              <label className="editor__label">Teaser / Hook / Meta Description</label>
              <textarea
                className="editor__textarea"
                value={formData.caption || ''}
                onChange={(e) => handleChange('caption', e.target.value)}
                placeholder="Short hook, meta summary, or social share copy..."
                rows={3}
              />
            </div>
            <UploadZone
              label="Cover Graphics & Article Media"
              assets={(formData.assets || []).filter(a => a.type?.startsWith('image/'))}
              onUpload={handleUpload}
              onRemove={handleRemoveAsset}
              onPreview={(asset, idx) => onPreview({ asset, assets: formData.assets || [asset], initialIndex: idx ?? 0, caption: formData.caption })}
              multiple
              accept="image/*"
            />
            <UploadZone
              label="Attach PDF Document / Draft Brief"
              assets={formData.pdfAsset ? [formData.pdfAsset] : []}
              onUpload={async (file) => {
                const asset = await uploadAsset(file);
                setFormData(prev => {
                  onUpdate(item.id, { ...prev, pdfAsset: asset });
                  return { ...prev, pdfAsset: asset };
                });
              }}
              onRemove={() => {
                setFormData(prev => {
                  onUpdate(item.id, { ...prev, pdfAsset: null });
                  return { ...prev, pdfAsset: null };
                });
              }}
              onPreview={(asset) => onPreview({ asset, assets: [asset], initialIndex: 0, caption: formData.caption })}
              accept="application/pdf,.pdf"
            />
          </>
        );

      case 'text':
        return (
          <>
            <div className="editor__field">
              <label className="editor__label">Content (LinkedIn/Text Post)</label>
              <RichTextEditor
                value={formData.richText || ''}
                onChange={(html) => handleChange('richText', html)}
                placeholder="Start writing your post..."
                showCopyButton
                showCharCount
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const isNeedsRevision = formData.status === 'revision';

  return (
    <div className="editor animate-fade-in-up">
      <div className="editor__header">
        <div className="editor__header-left">
          <h3 className="editor__title">Edit Content</h3>
          <StatusBadge
            status={formData.status}
            onClick={isAdmin ? handleStatusChange : undefined}
            onOpenRevision={onOpenRevision}
            feedback={formData.feedback}
            disabled={!isAdmin}
          />
        </div>
        <div className="editor__header-right">
          {!isViewer && saveStatus !== 'idle' && (
            <span className={`editor__auto-save editor__auto-save--${saveStatus}`}>
              {saveStatus === 'saving' && 'Auto-saving...'}
              {saveStatus === 'saved' && 'Auto-saved ✓'}
            </span>
          )}
          {!isViewer && <SaveButton onSave={forceSave} saveStatus={saveStatus} />}

          {/* Designer Action: Send for Approval */}
          {(isDesigner || (!isAdmin && !isViewer)) && (formData.status === 'draft' || formData.status === 'revision') && (
            <button
              type="button"
              className="editor__send-btn"
              onClick={handleSendForApproval}
              title="Submit creative to Admin for approval"
            >
              Send for Approval 🚀
            </button>
          )}

          {/* Admin Action: Approve / Request Changes when pending review */}
          {isAdmin && formData.status === 'pending' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="editor__quick-action-btn editor__quick-action-btn--approve"
                onClick={() => {
                  const updated = { ...formData, status: 'ready' };
                  setFormData(updated);
                  onUpdate(item.id, updated);
                }}
                title="Approve creative"
              >
                ✓ Approve
              </button>
              <button
                type="button"
                className="editor__quick-action-btn editor__quick-action-btn--changes"
                onClick={onOpenRevision}
                title="Request changes"
              >
                ✕ Changes
              </button>
            </div>
          )}

          <button
            className="editor__delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onDelete(item.id);
              onClose?.();
            }}
            title="Delete Content Piece"
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
          {onClose && (
            <button className="editor__close-btn" onClick={onClose} title="Close / Collapse" type="button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="editor__body">
        {/* Revision Alert Banner if changes are requested */}
        {isNeedsRevision && (
          <div className="editor__revision-banner animate-scale-in">
            <div className="editor__revision-banner-header">
              <div className="editor__revision-banner-title">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>Changes Requested by Team</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isAdmin && (
                  <button
                    type="button"
                    className="editor__revision-banner-btn editor__revision-banner-btn--clear"
                    onClick={() => {
                      const updated = { ...formData, feedback: '', feedbackAssets: [], status: 'pending' };
                      setFormData(updated);
                      onUpdate(item.id, updated);
                    }}
                    title="Remove 'Needs Changes' and clear feedback"
                  >
                    Clear Request ✕
                  </button>
                )}
                <button
                  type="button"
                  className="editor__revision-banner-btn"
                  onClick={onOpenRevision}
                >
                  {isAdmin ? 'Edit Feedback' : 'View Full Details'} 💬
                </button>
              </div>
            </div>
            {formData.feedback && (
              <p className="editor__revision-banner-text">{formData.feedback}</p>
            )}
            {formData.feedbackAssets?.length > 0 && (
              <div className="editor__revision-banner-assets">
                {formData.feedbackAssets.map((asset) => (
                  <img
                    key={asset.id}
                    src={asset.url}
                    alt={asset.name || 'Reference'}
                    className="editor__revision-banner-thumb"
                    title={`Reference: ${asset.name || 'Image'} (Click to preview)`}
                    onClick={() => onPreview({ asset, assets: [asset], initialIndex: 0 })}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Common fields */}
        <div className="editor__row">
          <div className="editor__field editor__field--flex">
            <label className="editor__label">Date</label>
            <input
              type="date"
              className="editor__input"
              value={formData.date || ''}
              onChange={(e) => handleChange('date', e.target.value)}
              readOnly={!isAdmin}
            />
          </div>
          <div className="editor__field editor__field--flex">
            <label className="editor__label">Content Name</label>
            <input
              type="text"
              className="editor__input"
              value={formData.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Content name..."
              readOnly={!isAdmin}
            />
          </div>
          <div className="editor__field">
            <label className="editor__label">Type</label>
            {isAdmin ? (
              <select
                className="editor__select"
                value={formData.type}
                onChange={(e) => handleTypeChange(e.target.value)}
              >
                {CONTENT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="editor__input"
                value={CONTENT_TYPES.find(t => t.value === formData.type)?.label || formData.type}
                readOnly
              />
            )}
          </div>
        </div>

        {showSummary && (
          <div className="editor__field" style={{ marginTop: '16px' }}>
            <label className="editor__label">Summary / Creative Brief</label>
            <textarea
              className="editor__textarea"
              value={formData.summary || ''}
              onChange={(e) => handleChange('summary', e.target.value)}
              placeholder="Brief summary of this content..."
              rows={2}
              readOnly={!isAdmin}
            />
          </div>
        )}

        {/* Type-specific fields */}
        <div className="editor__type-fields">
          {renderTypeFields()}
        </div>
      </div>
    </div>
  );
}
