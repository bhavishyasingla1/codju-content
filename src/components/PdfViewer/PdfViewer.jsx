import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { dataUrlToUint8Array, dataUrlToBlob } from '../../utils/helpers';
import './PdfViewer.css';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export default function PdfViewer({
  url,
  data,
  fileName = 'document.pdf',
  onDownload,
  onOpenNewTab,
}) {
  const containerRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.15);
  const [rotation, setRotation] = useState(0);
  const [viewMode, setViewMode] = useState('continuous'); // 'continuous' | 'single'
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState(null);
  const [nativeFallback, setNativeFallback] = useState(false);

  // Active rendering tasks ref to cancel in-flight page renders
  const renderTasksRef = useRef(new Map());
  const canvasRefs = useRef(new Map());

  // Load PDF document
  useEffect(() => {
    let isCancelled = false;
    let loadingTask = null;

    async function loadDocument() {
      setLoading(true);
      setError(null);
      setLoadingProgress(10);
      setPdfDoc(null);
      setNumPages(0);
      setCurrentPage(1);

      try {
        let docSource = null;

        if (data && (data instanceof Uint8Array || data instanceof ArrayBuffer)) {
          docSource = { data };
        } else if (typeof url === 'string') {
          const cleanUrl = url.split('#')[0].trim();
          if (cleanUrl.startsWith('data:')) {
            const u8arr = dataUrlToUint8Array(cleanUrl);
            if (!u8arr || u8arr.length === 0) {
              throw new Error('Invalid or corrupted base64 PDF data.');
            }
            docSource = { data: u8arr };
          } else {
            docSource = { url: cleanUrl };
          }
        } else {
          throw new Error('No valid PDF source provided.');
        }

        loadingTask = pdfjsLib.getDocument(docSource);

        loadingTask.onProgress = (progress) => {
          if (progress.total > 0) {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            setLoadingProgress(percent);
          }
        };

        const doc = await loadingTask.promise;
        if (isCancelled) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err) {
        if (isCancelled) return;
        console.error('PDF.js error loading document:', err);
        setError(err.message || 'Unable to render PDF document.');
        setLoading(false);
      }
    }

    loadDocument();

    return () => {
      isCancelled = true;
      if (loadingTask) {
        try {
          loadingTask.destroy();
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [url, data]);

  // Render a specific page to a canvas
  const renderPage = useCallback(
    async (pageNumber, canvas) => {
      if (!pdfDoc || !canvas) return;

      // Cancel any ongoing render for this page number
      if (renderTasksRef.current.has(pageNumber)) {
        try {
          renderTasksRef.current.get(pageNumber).cancel();
        } catch {
          // Task already finished or cancelled
        }
        renderTasksRef.current.delete(pageNumber);
      }

      try {
        const page = await pdfDoc.getPage(pageNumber);
        const pixelRatio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale, rotation: rotation });

        const context = canvas.getContext('2d', { alpha: false });
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const renderContext = {
          canvasContext: context,
          transform: pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : null,
          viewport: viewport,
        };

        const renderTask = page.render(renderContext);
        renderTasksRef.current.set(pageNumber, renderTask);

        await renderTask.promise;
        renderTasksRef.current.delete(pageNumber);
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn(`Error rendering PDF page ${pageNumber}:`, err);
        }
      }
    },
    [pdfDoc, scale, rotation]
  );

  // Trigger renders when doc, scale, rotation, viewMode, or currentPage changes
  useEffect(() => {
    if (!pdfDoc || loading) return;

    if (viewMode === 'continuous') {
      for (let i = 1; i <= numPages; i++) {
        const canvas = canvasRefs.current.get(i);
        if (canvas) {
          renderPage(i, canvas);
        }
      }
    } else {
      const canvas = canvasRefs.current.get(currentPage);
      if (canvas) {
        renderPage(currentPage, canvas);
      }
    }
  }, [pdfDoc, numPages, scale, rotation, viewMode, currentPage, loading, renderPage]);

  // Handle Zoom In
  const handleZoomIn = () => {
    setScale((prev) => Math.min(3.0, parseFloat((prev + 0.2).toFixed(2))));
  };

  // Handle Zoom Out
  const handleZoomOut = () => {
    setScale((prev) => Math.max(0.5, parseFloat((prev - 0.2).toFixed(2))));
  };

  // Handle Zoom Reset / Fit Width
  const handleFitWidth = () => {
    if (!containerRef.current) {
      setScale(1.0);
      return;
    }
    const containerWidth = containerRef.current.clientWidth - 48; // padding
    if (containerWidth > 0) {
      // standard PDF page width is ~612pt at 72dpi
      const targetScale = Math.min(2.0, Math.max(0.6, containerWidth / 620));
      setScale(parseFloat(targetScale.toFixed(2)));
    } else {
      setScale(1.0);
    }
  };

  // Handle Rotation
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Handle Page navigation in single mode
  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(numPages, prev + 1));
  };

  // Intersection observer for continuous scroll to update current page indicator
  useEffect(() => {
    if (viewMode !== 'continuous' || numPages <= 1 || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.getAttribute('data-page-number'), 10);
            if (!isNaN(pageNum)) {
              setCurrentPage(pageNum);
            }
          }
        });
      },
      {
        root: containerRef.current,
        threshold: 0.4,
      }
    );

    const pages = containerRef.current.querySelectorAll('.pdf-viewer__page-card');
    pages.forEach((page) => observer.observe(page));

    return () => observer.disconnect();
  }, [viewMode, numPages, scale, loading]);

  // Safe fallback URL for direct browser opening or native embed
  const getSafeBlobUrl = () => {
    if (!url) return null;
    if (url.startsWith('blob:') || url.startsWith('http')) return url;
    if (url.startsWith('data:')) {
      const blob = dataUrlToBlob(url, 'application/pdf');
      if (blob) {
        return URL.createObjectURL(blob);
      }
    }
    return url;
  };

  if (nativeFallback) {
    const safeUrl = getSafeBlobUrl();
    return (
      <div className="pdf-viewer pdf-viewer--native">
        <div className="pdf-viewer__fallback-bar">
          <span>Using Native Browser PDF Embed</span>
          <button
            type="button"
            className="pdf-viewer__toolbar-btn"
            onClick={() => setNativeFallback(false)}
          >
            Switch to Built-in Interactive Viewer
          </button>
        </div>
        <object
          data={safeUrl}
          type="application/pdf"
          className="pdf-viewer__native-object"
        >
          <iframe
            src={safeUrl}
            title={fileName}
            className="pdf-viewer__native-iframe"
            sandbox="allow-same-origin allow-downloads"
          />
        </object>
      </div>
    );
  }

  return (
    <div className="pdf-viewer" ref={containerRef}>
      {/* Top Floating Control Bar */}
      <div className="pdf-viewer__toolbar">
        <div className="pdf-viewer__toolbar-group">
          {/* Page Selector & Indicator */}
          {numPages > 0 && (
            <div className="pdf-viewer__page-controls">
              {viewMode === 'single' && (
                <button
                  type="button"
                  className="pdf-viewer__toolbar-btn"
                  onClick={handlePrevPage}
                  disabled={currentPage <= 1}
                  title="Previous Page (Up Arrow)"
                  aria-label="Previous Page"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              )}

              <span className="pdf-viewer__page-text">
                Page <strong>{currentPage}</strong> of <strong>{numPages}</strong>
              </span>

              {viewMode === 'single' && (
                <button
                  type="button"
                  className="pdf-viewer__toolbar-btn"
                  onClick={handleNextPage}
                  disabled={currentPage >= numPages}
                  title="Next Page (Down Arrow)"
                  aria-label="Next Page"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="pdf-viewer__toolbar-group">
          {/* Zoom Controls */}
          <div className="pdf-viewer__zoom-controls">
            <button
              type="button"
              className="pdf-viewer__toolbar-btn"
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              title="Zoom Out (-)"
              aria-label="Zoom Out"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>

            <button
              type="button"
              className="pdf-viewer__toolbar-btn pdf-viewer__scale-btn"
              onClick={handleFitWidth}
              title="Fit to Width / Reset Zoom"
            >
              {Math.round(scale * 100)}%
            </button>

            <button
              type="button"
              className="pdf-viewer__toolbar-btn"
              onClick={handleZoomIn}
              disabled={scale >= 3.0}
              title="Zoom In (+)"
              aria-label="Zoom In"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>
          </div>

          {/* Rotate Button */}
          <button
            type="button"
            className="pdf-viewer__toolbar-btn"
            onClick={handleRotate}
            title="Rotate Clockwise (90°)"
            aria-label="Rotate"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>

          {/* View Mode Switcher (Continuous vs Single) */}
          {numPages > 1 && (
            <button
              type="button"
              className={`pdf-viewer__toolbar-btn ${viewMode === 'continuous' ? 'pdf-viewer__toolbar-btn--active' : ''}`}
              onClick={() => setViewMode((prev) => (prev === 'continuous' ? 'single' : 'continuous'))}
              title={viewMode === 'continuous' ? 'Switch to Single Page Mode' : 'Switch to Continuous Scroll Mode'}
            >
              {viewMode === 'continuous' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="6" rx="1" />
                  <rect x="6" y="10" width="12" height="6" rx="1" />
                  <rect x="6" y="18" width="12" height="4" rx="1" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="4" y="3" width="16" height="18" rx="2" />
                  <line x1="8" y1="8" x2="16" y2="8" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              )}
              <span>{viewMode === 'continuous' ? 'All Pages' : '1 Page'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="pdf-viewer__loading">
          <div className="pdf-viewer__spinner" />
          <p className="pdf-viewer__loading-text">
            Loading PDF Document... {loadingProgress > 0 && `${loadingProgress}%`}
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="pdf-viewer__error-state">
          <div className="pdf-viewer__error-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h4 className="pdf-viewer__error-title">Unable to Display PDF</h4>
          <p className="pdf-viewer__error-desc">{error}</p>
          <div className="pdf-viewer__error-actions">
            {onDownload && (
              <button
                type="button"
                className="pdf-viewer__btn pdf-viewer__btn--primary"
                onClick={onDownload}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Download File</span>
              </button>
            )}
            {onOpenNewTab && (
              <button
                type="button"
                className="pdf-viewer__btn pdf-viewer__btn--secondary"
                onClick={onOpenNewTab}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                <span>Open in Tab</span>
              </button>
            )}
            <button
              type="button"
              className="pdf-viewer__btn pdf-viewer__btn--outline"
              onClick={() => setNativeFallback(true)}
            >
              Try Browser Native Embed
            </button>
          </div>
        </div>
      )}

      {/* Main Pages Canvas Container */}
      {!loading && !error && (
        <div className="pdf-viewer__pages-scroll">
          {viewMode === 'continuous' ? (
            // Render all pages in a vertical stream
            Array.from({ length: numPages }, (_, idx) => {
              const pageNum = idx + 1;
              return (
                <div
                  key={pageNum}
                  className="pdf-viewer__page-card animate-fade-in"
                  data-page-number={pageNum}
                >
                  <div className="pdf-viewer__page-badge">Page {pageNum}</div>
                  <canvas
                    ref={(el) => {
                      if (el) canvasRefs.current.set(pageNum, el);
                      else canvasRefs.current.delete(pageNum);
                    }}
                    className="pdf-viewer__canvas"
                  />
                </div>
              );
            })
          ) : (
            // Single page view
            <div className="pdf-viewer__page-card animate-fade-in" data-page-number={currentPage}>
              <div className="pdf-viewer__page-badge">
                Page {currentPage} of {numPages}
              </div>
              <canvas
                ref={(el) => {
                  if (el) canvasRefs.current.set(currentPage, el);
                  else canvasRefs.current.delete(currentPage);
                }}
                className="pdf-viewer__canvas"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
