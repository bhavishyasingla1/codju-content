import { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { uploadAsset } from '../../services/contentService';
import './RevisionModal.css';

export default function RevisionModal({
  contentItem,
  onSaveFeedback,
  onResubmitForReview,
  onPreviewAsset,
  onClose,
}) {
  const { isAdmin, isDesigner } = useAuth();
  const [feedbackText, setFeedbackText] = useState(contentItem?.feedback || '');
  const [feedbackAssets, setFeedbackAssets] = useState(contentItem?.feedbackAssets || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = [];
      for (const file of files) {
        const asset = await uploadAsset(file);
        uploaded.push(asset);
      }
      setFeedbackAssets(prev => [...prev, ...uploaded]);
    } catch (err) {
      setUploadError(err.message || 'Failed to upload reference image');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAsset = (id) => {
    setFeedbackAssets(prev => prev.filter(a => a.id !== id));
  };

  const handleSubmitRevision = async (e) => {
    e?.preventDefault();
    if (!feedbackText.trim() && feedbackAssets.length === 0) {
      setUploadError('Please provide feedback notes or attach a reference image.');
      return;
    }
    setSaving(true);
    try {
      await onSaveFeedback({
        feedback: feedbackText.trim(),
        feedbackAssets,
        status: 'revision',
      });
      onClose();
    } catch (err) {
      setUploadError(err.message || 'Failed to save revision request');
    } finally {
      setSaving(false);
    }
  };

  const handleClearRevision = async () => {
    setSaving(true);
    try {
      await onSaveFeedback({
        feedback: '',
        feedbackAssets: [],
        status: 'pending',
      });
      onClose();
    } catch (err) {
      setUploadError(err.message || 'Failed to remove revision request');
    } finally {
      setSaving(false);
    }
  };

  const handleResubmit = async () => {
    setSaving(true);
    try {
      await onResubmitForReview();
      onClose();
    } catch (err) {
      setUploadError(err.message || 'Failed to resubmit');
    } finally {
      setSaving(false);
    }
  };

  if (!contentItem) return null;

  const isNeedsRevision = contentItem.status === 'revision';

  return (
    <div className="revision-modal__backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="revision-modal animate-scale-in">
        {/* Header */}
        <div className="revision-modal__header">
          <div className="revision-modal__title-group">
            <div className="revision-modal__icon-wrap">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <div>
              <h3 className="revision-modal__title">
                {isAdmin ? 'Rectify Design & Clarification Instructions' : isDesigner ? 'Design Clarification & Feedback' : 'Design Notes'}
              </h3>
              <p className="revision-modal__subtitle">
                {contentItem.name} • {contentItem.date}
              </p>
            </div>
          </div>

          <button className="revision-modal__close" onClick={onClose} type="button" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="revision-modal__body">
          {/* Admin Editor View */}
          {isAdmin ? (
            <form onSubmit={handleSubmitRevision} className="revision-modal__form">
              <div className="revision-modal__field">
                <label className="revision-modal__label">
                  What changes are needed? (Clarification for Designer)
                </label>
                <textarea
                  className="revision-modal__textarea"
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Detail the changes needed, what didn't work, and specific instructions on how to design it..."
                  rows={4}
                  autoFocus
                />
              </div>

              {/* Reference Images Upload */}
              <div className="revision-modal__field">
                <div className="revision-modal__field-header">
                  <label className="revision-modal__label">Reference Images & Screenshots</label>
                  <button
                    type="button"
                    className="revision-modal__upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>{uploading ? 'Uploading...' : 'Add Reference'}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                  />
                </div>

                {feedbackAssets.length > 0 ? (
                  <div className="revision-modal__assets-grid">
                    {feedbackAssets.map((asset) => (
                      <div key={asset.id} className="revision-modal__asset-card">
                        <img
                          src={asset.url}
                          alt={asset.name || 'Reference'}
                          className="revision-modal__asset-thumb"
                          onClick={() => onPreviewAsset?.(asset)}
                          title="Click to preview"
                        />
                        <span className="revision-modal__asset-name" title={asset.name}>
                          {asset.name || 'Reference Image'}
                        </span>
                        <button
                          type="button"
                          className="revision-modal__asset-delete"
                          onClick={() => handleRemoveAsset(asset.id)}
                          title="Remove reference"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className="revision-modal__dropzone"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span>Click or drag reference screenshots here</span>
                  </div>
                )}
              </div>

              <div className="revision-modal__info-tip">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>Clicking send will update this item to <strong>Needs Changes</strong> and email your instructions to the Designer.</span>
              </div>

              {uploadError && (
                <div className="revision-modal__error-msg">{uploadError}</div>
              )}

              <div className="revision-modal__actions">
                {isNeedsRevision && (
                  <button
                    type="button"
                    className="revision-modal__btn revision-modal__btn--clear"
                    onClick={handleClearRevision}
                    disabled={saving}
                    title="Remove 'Needs Changes' status and clear feedback"
                  >
                    Clear Request ✕
                  </button>
                )}
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  className="revision-modal__btn revision-modal__btn--secondary"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || (!feedbackText.trim() && feedbackAssets.length === 0)}
                  className="revision-modal__btn revision-modal__btn--send"
                >
                  {saving ? 'Sending...' : 'Send Changes to Designer ✉️'}
                </button>
              </div>
            </form>
          ) : (
            /* Designer & Viewer View */
            <div className="revision-modal__view">
              <div className="revision-modal__alert-box">
                <div className="revision-modal__alert-badge">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>Admin Clarification &amp; Requested Changes</span>
                </div>
                <p className="revision-modal__feedback-text">
                  {contentItem.feedback || 'Please review and update the creative assets according to the brief.'}
                </p>
              </div>

              {/* Reference Images List */}
              {contentItem.feedbackAssets?.length > 0 && (
                <div className="revision-modal__ref-section">
                  <h4 className="revision-modal__ref-title">Reference Images & Screenshots:</h4>
                  <div className="revision-modal__assets-grid">
                    {contentItem.feedbackAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="revision-modal__asset-card revision-modal__asset-card--clickable"
                        onClick={() => onPreviewAsset?.(asset)}
                      >
                        <img
                          src={asset.url}
                          alt={asset.name || 'Reference'}
                          className="revision-modal__asset-thumb"
                        />
                        <span className="revision-modal__asset-name" title={asset.name}>
                          {asset.name || 'Reference Image'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isDesigner && (
                <div className="revision-modal__info-tip">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>After updating designs, click below to notify the Admin for approval.</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="revision-modal__actions">
                <button
                  type="button"
                  className="revision-modal__btn revision-modal__btn--secondary"
                  onClick={onClose}
                >
                  Close
                </button>
                {isDesigner && isNeedsRevision && (
                  <button
                    type="button"
                    onClick={handleResubmit}
                    disabled={saving}
                    className="revision-modal__btn revision-modal__btn--primary"
                  >
                    {saving ? 'Notifying Admin...' : 'Resubmit for Approval 🚀'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
