import { useState, useRef, useCallback } from 'react';
import { formatFileSize, isImageFile, isVideoFile, isPdfFile } from '../../utils/helpers';
import './UploadZone.css';

export default function UploadZone({
  assets = [],
  onUpload,
  onRemove,
  onPreview,
  multiple = false,
  accept = 'image/*,video/*,application/pdf,.pdf',
  label = 'Upload File',
  readOnly = false,
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const fileInputRef = useRef(null);

  const handleFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setErrorMessage(null);
    try {
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        await onUpload(file);
      }
    } catch (err) {
      console.error('File upload failed:', err);
      setErrorMessage(err.message || 'Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [onUpload]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleBrowse = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = (e) => {
    handleFiles(e.target.files);
    e.target.value = '';
  };

  const getFileIcon = (asset) => {
    if (isImageFile(asset)) {
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21,15 16,10 5,21" />
        </svg>
      );
    }
    if (isVideoFile(asset)) {
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5,3 19,12 5,21 5,3" />
        </svg>
      );
    }
    if (isPdfFile(asset)) {
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="13" y2="17" />
        </svg>
      );
    }
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <polyline points="13,2 13,9 20,9" />
      </svg>
    );
  };

  return (
    <div className="upload-zone">
      <label className="upload-zone__label">{label}</label>

      {errorMessage && (
        <div className="upload-zone__error animate-fade-in">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)} className="upload-zone__error-close">×</button>
        </div>
      )}

      {/* Drop area */}
      {!readOnly && (multiple || assets.length === 0) && (
        <div
          className={`upload-zone__drop ${isDragOver ? 'upload-zone__drop--active' : ''} ${uploading ? 'upload-zone__drop--uploading' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleBrowse}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="upload-zone__input"
            onChange={handleInputChange}
            accept={accept}
            multiple={multiple}
          />

          {uploading ? (
            <div className="upload-zone__uploading">
              <span className="upload-zone__spinner" />
              <span>Uploading file...</span>
            </div>
          ) : (
            <>
              <svg className="upload-zone__icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17,8 12,3 7,8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="upload-zone__text">
                Drag & drop {multiple ? 'files (images, PDFs, videos)' : 'a file (image, PDF, video)'} here
              </p>
              <p className="upload-zone__or">or</p>
              <span className="upload-zone__browse">Browse Files</span>
            </>
          )}
        </div>
      )}

      {/* Read-Only Empty State */}
      {readOnly && assets.length === 0 && (
        <div className="upload-zone__readonly-empty">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21,15 16,10 5,21" />
          </svg>
          <span>No creative files attached yet</span>
        </div>
      )}

      {/* Uploaded files list */}
      {assets.length > 0 && (
        <div className="upload-zone__files">
          {assets.map((asset, idx) => (
            <div key={asset.id || idx} className="upload-zone__file">
              <div className="upload-zone__file-preview">
                {isImageFile(asset) && asset.url ? (
                  <img src={asset.url} alt={asset.name} className="upload-zone__thumbnail" />
                ) : (
                  <div className="upload-zone__file-icon">
                    {getFileIcon(asset)}
                  </div>
                )}
              </div>
              <div className="upload-zone__file-info">
                <span className="upload-zone__file-name">{asset.name}</span>
                {asset.size && (
                  <span className="upload-zone__file-size">{formatFileSize(asset.size)}</span>
                )}
              </div>
              <div className="upload-zone__file-actions">
                {onPreview && (
                  <button
                    className="upload-zone__file-btn"
                    onClick={() => onPreview(asset, idx)}
                    title="Preview"
                    type="button"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                )}
                {!readOnly && onRemove && (
                  <button
                    className="upload-zone__file-btn upload-zone__file-btn--delete"
                    onClick={() => onRemove(asset.id || idx)}
                    title="Remove"
                    type="button"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3,6 5,6 21,6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
