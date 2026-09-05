import { useEffect, useCallback, useState, useRef, lazy, Suspense } from 'react';
import { isImageFile, isVideoFile, isPdfFile, stripHtml, dataUrlToBlob, sanitizeHtml } from '../../utils/helpers';
import { downloadAsset } from '../../services/contentService';
import './PreviewModal.css';

const PdfViewer = lazy(() => import('../PdfViewer/PdfViewer'));

export default function PreviewModal({
  asset,
  assets = [],
  initialIndex = 0,
  richText,
  caption,
  onClose,
}) {
  // Normalize assets array
  const assetList = assets.length > 0 ? assets : (asset ? [asset] : []);
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (initialIndex >= 0 && initialIndex < assetList.length) {
      return initialIndex;
    }
    return 0;
  });
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Swipe & Touch gesture handling
  const touchStartX = useRef(null);
  const touchEndX = useRef(null);

  const currentAsset = assetList[currentIndex] || asset || null;
  const totalAssets = assetList.length;

  const handlePrev = useCallback((e) => {
    e?.stopPropagation();
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : totalAssets - 1));
  }, [totalAssets]);

  const handleNext = useCallback((e) => {
    e?.stopPropagation();
    setCurrentIndex(prev => (prev < totalAssets - 1 ? prev + 1 : 0));
  }, [totalAssets]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowLeft' && totalAssets > 1) {
      handlePrev();
    } else if (e.key === 'ArrowRight' && totalAssets > 1) {
      handleNext();
    }
  }, [onClose, totalAssets, handlePrev, handleNext]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      e.stopPropagation();
      onClose();
    }
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 40) {
      if (diff > 0 && totalAssets > 1) {
        handleNext();
      } else if (diff < 0 && totalAssets > 1) {
        handlePrev();
      }
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const handleCopy = () => {
    let textToCopy = '';
    if (richText) {
      textToCopy = stripHtml(richText);
    } else if (caption) {
      textToCopy = caption;
    }

    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = async () => {
    if (!currentAsset?.url || downloading) return;
    setDownloading(true);
    try {
      const ext = isPdfFile(currentAsset) ? '.pdf' : isImageFile(currentAsset) ? '.png' : '';
      const fallbackName = `asset_${currentIndex + 1}${ext}`;
      await downloadAsset(currentAsset.url, currentAsset.name || fallbackName);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleOpenNewTab = () => {
    if (!currentAsset?.url) return;
    if (currentAsset.url.startsWith('http') || currentAsset.url.startsWith('blob:') || currentAsset.url.startsWith('/api/')) {
      window.open(currentAsset.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (currentAsset.url.startsWith('data:')) {
      const isPdf = isPdfFile(currentAsset);
      const blob = dataUrlToBlob(currentAsset.url, isPdf ? 'application/pdf' : null);
      if (blob) {
        const tabUrl = URL.createObjectURL(blob);
        window.open(tabUrl, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(tabUrl), 60000);
        return;
      }
    }
    window.open(currentAsset.url, '_blank', 'noopener,noreferrer');
  };

  const renderMedia = () => {
    // Rich text article preview
    if (richText) {
      return (
        <div className="preview-modal__text">
          <div className="preview-modal__text-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(richText) }} />
        </div>
      );
    }

    if (!currentAsset) return null;

    // Image preview
    if (isImageFile(currentAsset)) {
      return (
        <div
          className="preview-modal__image-wrap"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <img
            src={currentAsset.url}
            alt={currentAsset.name || `Slide ${currentIndex + 1}`}
            className="preview-modal__image"
          />
        </div>
      );
    }

    // Video preview
    if (isVideoFile(currentAsset)) {
      return (
        <div className="preview-modal__video-wrap">
          <video src={currentAsset.url} controls className="preview-modal__video" autoPlay>
            Your browser does not support video playback.
          </video>
        </div>
      );
    }

    // Interactive PDF viewer (asynchronously loaded on demand)
    if (isPdfFile(currentAsset)) {
      return (
        <div className="preview-modal__pdf-wrap">
          <Suspense fallback={
            <div className="pdf-viewer__loading">
              <div className="pdf-viewer__spinner" />
              <p className="pdf-viewer__loading-text">Loading PDF viewer engine...</p>
            </div>
          }>
            <PdfViewer
              url={currentAsset.url}
              fileName={currentAsset.name || 'document.pdf'}
              onDownload={handleDownload}
              onOpenNewTab={handleOpenNewTab}
            />
          </Suspense>
        </div>
      );
    }

    // Generic file fallback
    return (
      <div className="preview-modal__generic">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <polyline points="13,2 13,9 20,9" />
        </svg>
        <p>{currentAsset.name || 'Document File'}</p>
      </div>
    );
  };

  const hasCopyableText = !!richText;
  const isPdf = currentAsset && isPdfFile(currentAsset);

  return (
    <div className="preview-modal__backdrop" onClick={handleBackdropClick}>
      <div className={`preview-modal animate-scale-in ${isPdf ? 'preview-modal--pdf-mode' : ''}`}>
        <div className="preview-modal__header">
          <div className="preview-modal__header-left">
            <span className="preview-modal__name">
              {richText
                ? 'Text Preview'
                : (currentAsset?.name || 'Preview')}
            </span>
            {totalAssets > 1 && (
              <span className="preview-modal__counter-badge">
                {currentIndex + 1} / {totalAssets}
              </span>
            )}
          </div>

          <div className="preview-modal__actions">

            {/* Copy Text Button */}
            {hasCopyableText && (
              <button
                className={`preview-modal__action-btn ${copied ? 'preview-modal__action-btn--success' : ''}`}
                onClick={handleCopy}
                title="Copy Article Text"
                type="button"
              >
                {copied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>Copy Text</span>
                  </>
                )}
              </button>
            )}

            {/* Open in New Tab for All Media */}
            {currentAsset?.url && (
              <button
                onClick={handleOpenNewTab}
                className="preview-modal__action-btn"
                title={isPdf ? 'Open PDF in a new tab' : 'Open full-size media in a new tab'}
                type="button"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                <span>Open Tab</span>
              </button>
            )}

            {/* Download HD / PDF Button */}
            {currentAsset && (
              <button
                className="preview-modal__action-btn preview-modal__action-btn--primary"
                onClick={handleDownload}
                disabled={downloading}
                title={isPdf ? 'Download PDF Document' : 'Download HD Image'}
                type="button"
              >
                {downloading ? (
                  <>
                    <span className="preview-modal__spinner" />
                    <span>Downloading...</span>
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>{isPdf ? 'Download PDF' : 'Download HD'}</span>
                  </>
                )}
              </button>
            )}

            <button
              className="preview-modal__close"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              type="button"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="preview-modal__body">
          {/* Previous Arrow button */}
          {totalAssets > 1 && (
            <button
              className="preview-modal__nav-btn preview-modal__nav-btn--prev"
              onClick={handlePrev}
              title="Previous Image (Left Arrow)"
              type="button"
              aria-label="Previous image"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}

          {/* Main Media Preview */}
          <div className="preview-modal__media-container">
            {renderMedia()}
          </div>

          {/* Next Arrow button */}
          {totalAssets > 1 && (
            <button
              className="preview-modal__nav-btn preview-modal__nav-btn--next"
              onClick={handleNext}
              title="Next Image (Right Arrow)"
              type="button"
              aria-label="Next image"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
        </div>

        {/* Carousel Navigation Dots */}
        {totalAssets > 1 && (
          <div className="preview-modal__dots">
            {assetList.map((item, idx) => (
              <button
                key={item.id || idx}
                className={`preview-modal__dot ${idx === currentIndex ? 'preview-modal__dot--active' : ''}`}
                onClick={() => setCurrentIndex(idx)}
                title={`Go to slide ${idx + 1}`}
                type="button"
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
