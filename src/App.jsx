import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useContent } from './hooks/useContent';
import { useSearch } from './hooks/useSearch';
import TopNav from './components/TopNav/TopNav';
import ListView from './views/ListView';
import GridView from './views/GridView';
import CalendarView from './views/CalendarView';
import EmptyState from './components/EmptyState/EmptyState';
import LoadingSkeleton from './components/LoadingSkeleton/LoadingSkeleton';
import PinModal from './components/PinModal/PinModal';
import Footer from './components/Footer/Footer';
import ContentEditor from './components/ContentEditor/ContentEditor';
import MonthNotes from './components/MonthNotes/MonthNotes';
import UndoToast from './components/UndoToast/UndoToast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { getMonthName, safeJsonParse } from './utils/helpers';
import ErrorBoundary from './components/ErrorBoundary';
import SettingsModal from './components/SettingsModal/SettingsModal';
import ViewToggle from './components/ViewToggle/ViewToggle';
import NotificationToast from './components/NotificationToast/NotificationToast';
import MonthNotifyModal from './components/MonthNotifyModal/MonthNotifyModal';
import { fetchSettings, sendNotification } from './services/notificationService';
import './App.css';

const PreviewModal = lazy(() => import('./components/PreviewModal/PreviewModal'));
const RevisionModal = lazy(() => import('./components/RevisionModal/RevisionModal'));
const AiModal = lazy(() => import('./components/AiModal/AiModal'));

function MainApp() {
  const { isAdmin, isDesigner, isViewer, isPinModalOpen, closePinModal, openPinModal } = useAuth();

  // Always default to the current active month and year
  const currentDate = useMemo(() => new Date(), []);
  const [year, setYear] = useState(() => currentDate.getFullYear());
  const [month, setMonth] = useState(() => currentDate.getMonth() + 1);
  const [view, setView] = useState('list'); // 'list' | 'grid' | 'calendar'
  const [activeCategory, setActiveCategory] = useState('social'); // 'social' | 'written'

  // Service CRUD Hook with Undo / Redo
  const {
    content,
    loading,
    error,
    addContent,
    batchAddContent,
    updateContentItem,
    removeContent,
    refreshContent,
    canUndo,
    canRedo,
    undo,
    redo,
    undoToast,
    dismissUndoToast,
    lastUndoAction,
    lastRedoAction,
  } = useContent(year, month);

  // Filter content by current active category (Social vs Written)
  const categoryContent = useMemo(() => {
    return content.filter(item => (item.category || 'social') === activeCategory);
  }, [content, activeCategory]);

  // Counts for tab badges
  const socialCount = useMemo(() => {
    return content.filter(item => (item.category || 'social') === 'social').length;
  }, [content]);

  const writtenCount = useMemo(() => {
    return content.filter(item => item.category === 'written').length;
  }, [content]);

  // Track sent month brief signatures in localStorage
  const [sentMonthBriefs, setSentMonthBriefs] = useState(() => {
    return safeJsonParse(localStorage.getItem('codju_sent_month_briefs'), {});
  });

  // Social content items specifically for the selected month
  const currentMonthSocialItems = useMemo(() => {
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    return content.filter(item => (item.category || 'social') === 'social' && item.date && item.date.startsWith(monthPrefix));
  }, [content, year, month]);

  // Current month's social content signature based on row IDs
  const currentMonthSignature = useMemo(() => {
    return currentMonthSocialItems.map(item => item.id).sort().join(',');
  }, [currentMonthSocialItems]);

  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const isCurrentMonthBriefSent = Boolean(
    currentMonthSignature &&
    sentMonthBriefs[monthKey] &&
    sentMonthBriefs[monthKey] === currentMonthSignature
  );

  // Send Month to Designer button:
  // ONLY comes once content for that month has been created/generated (> 0 items),
  // and once sent, it does NOT come again unless rows are added or removed!
  const canSendMonthToDesigner = isAdmin &&
    activeCategory === 'social' &&
    currentMonthSocialItems.length > 0 &&
    !isCurrentMonthBriefSent;

  // Search Hook on filtered category items
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    filteredContent,
    clearSearch,
  } = useSearch(categoryContent);

  // Modals state
  const [editingItem, setEditingItem] = useState(null);
  const [revisionItem, setRevisionItem] = useState(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMonthNotifyOpen, setIsMonthNotifyOpen] = useState(false);
  const [notifToast, setNotifToast] = useState(null);
  const [appSettings, setAppSettings] = useState({
    adminEmail: 'bhavishyasingla2005@gmail.com',
    designerEmail: 'gurpreetcodju@gmail.com',
  });

  // Load app notification settings
  useEffect(() => {
    fetchSettings()
      .then(setAppSettings)
      .catch((err) => console.warn('Could not load settings:', err));
  }, []);

  // Handle URL deep-linking (?item=...&category=...&year=...&month=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const targetCategory = params.get('category');
    const targetYear = params.get('year');
    const targetMonth = params.get('month');
    const targetItem = params.get('item');

    if (targetCategory && (targetCategory === 'social' || targetCategory === 'written')) {
      setActiveCategory(targetCategory);
    }
    if (targetYear && !isNaN(Number(targetYear))) {
      setYear(Number(targetYear));
    }
    if (targetMonth && !isNaN(Number(targetMonth))) {
      setMonth(Number(targetMonth));
    }

    if (targetItem) {
      const timer = setTimeout(() => {
        const rowEl = document.getElementById(`row-${targetItem}`);
        if (rowEl) {
          rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          rowEl.classList.add('content-row--highlight');
          setTimeout(() => rowEl.classList.remove('content-row--highlight'), 4500);
        }
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [content.length]);

  const showToast = (message, isError = false, title = null) => {
    setNotifToast({
      id: Date.now(),
      message,
      isError,
      title: title || (isError ? 'Notice' : 'Email Notification'),
    });
  };

  const handleMonthNotifySuccess = (msg, signature) => {
    showToast(msg);
    if (signature) {
      setSentMonthBriefs(prev => {
        const next = { ...prev, [monthKey]: signature };
        localStorage.setItem('codju_sent_month_briefs', JSON.stringify(next));
        return next;
      });
    }
  };

  // Preview state
  const [previewAsset, setPreviewAsset] = useState(null);
  const [previewAssets, setPreviewAssets] = useState([]);
  const [previewInitialIndex, setPreviewInitialIndex] = useState(0);
  const [previewText, setPreviewText] = useState(null);
  const [previewCaption, setPreviewCaption] = useState(null);

  // Global Keyboard Shortcuts for Undo (⌘Z / Ctrl+Z) and Redo (⌘⇧Z / Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Allow native undo/redo inside active form inputs and contenteditable areas
      const target = e.target;
      const isInput = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest?.('[contenteditable="true"]')
      );
      if (isInput) return;

      const isMac = typeof navigator !== 'undefined' && navigator.platform?.toUpperCase().includes('MAC');
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (isCmdOrCtrl && !e.altKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            if (canRedo) redo();
          } else {
            if (canUndo) undo();
          }
        } else if (e.key.toLowerCase() === 'y' && !isMac) {
          e.preventDefault();
          if (canRedo) redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  // Month navigation
  const handlePrevMonth = () => {
    setMonth(prev => {
      if (prev === 1) {
        setYear(y => y - 1);
        return 12;
      }
      return prev - 1;
    });
    setEditingItem(null);
    setRevisionItem(null);
  };

  const handleNextMonth = () => {
    setMonth(prev => {
      if (prev === 12) {
        setYear(y => y + 1);
        return 1;
      }
      return prev + 1;
    });
    setEditingItem(null);
    setRevisionItem(null);
  };

  const handleCreateMonth = () => {
    if (!isAdmin) {
      openPinModal();
      return;
    }
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    setYear(nextYear);
    setMonth(nextMonth);
    setEditingItem(null);
    setRevisionItem(null);
  };

  const handleDateChange = (newYear, newMonth) => {
    setYear(newYear);
    setMonth(newMonth);
    setEditingItem(null);
    setRevisionItem(null);
  };

  // Content CRUD Triggers
  const handleCreateNew = async () => {
    if (!isAdmin) {
      openPinModal();
      return;
    }

    const currentMonthItems = categoryContent.filter(item => {
      return item.date.startsWith(`${year}-${String(month).padStart(2, '0')}`);
    });

    let dateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    if (currentMonthItems.length > 0) {
      const dates = currentMonthItems
        .map(item => new Date(item.date).getTime())
        .filter(t => !isNaN(t));
      if (dates.length > 0) {
        const maxTime = Math.max(...dates);
        const maxDate = new Date(maxTime);
        maxDate.setDate(maxDate.getDate() + 1);

        if (maxDate.getFullYear() === year && (maxDate.getMonth() + 1) === month) {
          dateStr = maxDate.toISOString().split('T')[0];
        } else {
          const lastDay = new Date(year, month, 0).getDate();
          dateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        }
      }
    }

    const defaultType = activeCategory === 'written' ? 'blog' : 'static';
    const defaultPlatform = activeCategory === 'written' ? 'website' : 'instagram';
    const defaultName = activeCategory === 'written' ? 'New Article Draft' : 'New Content Piece';

    try {
      const newItem = await addContent({
        date: dateStr,
        name: defaultName,
        type: defaultType,
        category: activeCategory,
        platform: defaultPlatform,
        status: 'draft',
      });
      if (view !== 'list') {
        setEditingItem(newItem);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateNewForDate = async (dateString) => {
    if (!isAdmin) {
      openPinModal();
      return;
    }
    const defaultType = activeCategory === 'written' ? 'blog' : 'static';
    const defaultPlatform = activeCategory === 'written' ? 'website' : 'instagram';
    const defaultName = activeCategory === 'written' ? 'New Article Draft' : 'New Content Piece';

    try {
      const newItem = await addContent({
        date: dateString,
        name: defaultName,
        type: defaultType,
        category: activeCategory,
        platform: defaultPlatform,
        status: 'draft',
      });
      setEditingItem(newItem);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateItem = async (id, updates) => {
    try {
      const updated = await updateContentItem(id, updates);
      if (editingItem && editingItem.id === id) {
        setEditingItem(updated);
      }
      if (revisionItem && revisionItem.id === id) {
        setRevisionItem(updated);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteItem = async (id) => {
    if (!isAdmin) {
      openPinModal();
      return;
    }
    try {
      await removeContent(id);
      setEditingItem(null);
      if (revisionItem && revisionItem.id === id) {
        setRevisionItem(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Auto-delete stray drafts when closed without changes
  const handleCloseEditor = async (item) => {
    setEditingItem(null);
    if (!item) return;

    const isDefaultName = item.name === 'New Content Piece' || item.name === 'New Article Draft' || !item.name.trim();
    const hasNoCaption = !item.caption?.trim();
    const hasNoSummary = !item.summary?.trim();
    const hasNoRichText = !item.richText?.trim() || item.richText === '<p><br></p>';
    const hasNoAssets = !item.assets || item.assets.length === 0;
    const hasNoPdf = !item.pdfAsset;
    const hasNoThumbnail = !item.thumbnailAsset;

    if (isAdmin && isDefaultName && hasNoCaption && hasNoSummary && hasNoRichText && hasNoAssets && hasNoPdf && hasNoThumbnail) {
      try {
        // Suppress undo history for auto-cleaning pristine empty drafts
        await removeContent(item.id, false);
      } catch (e) {
        console.error('Failed to auto-delete empty item:', e);
      }
    }
  };

  // Preview triggers with multi-image support
  const handleOpenPreview = (target) => {
    if (!target) return;

    if (target.assets && Array.isArray(target.assets) && target.assets.length > 0) {
      setPreviewAssets(target.assets);
      setPreviewInitialIndex(target.initialIndex || 0);
      setPreviewAsset(target.assets[target.initialIndex || 0]);
      setPreviewText(null);
      setPreviewCaption(target.caption || null);
    } else if (target.asset !== undefined || target.richText !== undefined) {
      setPreviewAsset(target.asset || null);
      setPreviewAssets(target.asset ? [target.asset] : []);
      setPreviewInitialIndex(0);
      setPreviewText(target.richText || null);
      setPreviewCaption(target.caption || null);
    } else {
      if (target.url) {
        setPreviewAsset(target);
        setPreviewAssets([target]);
        setPreviewInitialIndex(0);
        setPreviewText(null);
      } else if (target.richText) {
        setPreviewText(target.richText);
        setPreviewAsset(null);
        setPreviewAssets([]);
      }
      setPreviewCaption(target.caption || null);
    }
  };

  // Revision Modal Handlers
  const handleSaveFeedback = async ({ feedback, feedbackAssets, status }) => {
    if (!revisionItem) return;
    await handleUpdateItem(revisionItem.id, {
      feedback,
      feedbackAssets,
      status: status || 'revision',
      reviewedAt: new Date().toISOString(),
    });

    if (status === 'revision') {
      try {
        const res = await sendNotification({
          type: 'changes_requested',
          contentItem: { ...revisionItem, feedback, feedbackAssets },
          feedback,
          feedbackAssets,
        });
        showToast(res.message || 'Changes requested & email dispatched to Designer!');
      } catch (err) {
        showToast(`Feedback saved, but email failed: ${err.message}`, true);
      }
    }
  };

  const handleResubmitForReview = async () => {
    if (!revisionItem) return;
    await handleUpdateItem(revisionItem.id, {
      status: 'pending',
    });

    try {
      const res = await sendNotification({
        type: 'approval_needed',
        contentItem: revisionItem,
        resubmitted: true,
      });
      showToast(res.message || 'Creative resubmitted & email sent to Admin!');
    } catch (err) {
      showToast(`Resubmitted for review (email notice: ${err.message})`, true);
    }
  };

  // Designer submit for approval handler
  const handleSendForApproval = async (item) => {
    await handleUpdateItem(item.id, {
      status: 'pending',
    });

    try {
      const res = await sendNotification({
        type: 'approval_needed',
        contentItem: item,
        resubmitted: false,
      });
      showToast(res.message || 'Creative submitted for approval & email sent to Admin!');
    } catch (err) {
      showToast(`Submitted for approval (email notice: ${err.message})`, true);
    }
  };

  // Designer notifies Admin that all designs for the month are completed
  const handleDesignerNotifyMonthReady = async () => {
    const monthItems = categoryContent.filter(item => {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      return item.date && item.date.startsWith(monthStr);
    });

    try {
      const res = await sendNotification({
        type: 'designer_month_ready',
        year,
        month,
        monthName: getMonthName(month),
        items: monthItems.map(item => ({
          date: item.date,
          name: item.name,
          platform: item.platform,
          type: item.type,
          status: item.status,
        })),
      });
      showToast(res.message || 'Admin notified that all month designs are ready for review!');
    } catch (err) {
      showToast(`Failed to notify admin: ${err.message}`, true);
    }
  };

  return (
    <div className="app-layout">
      {/* Top Navigation */}
      <TopNav
        year={year}
        month={month}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onCreateMonth={handleCreateMonth}
        onChangeDate={handleDateChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchClear={clearSearch}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Content Area */}
      <main className="app-main animate-fade-in">
        <div className="app-main__subheader">
          <div className="app-main__subheader-left">
            <h2 className="app-main__month-title">
              {getMonthName(month)} {year}
            </h2>

            {/* Category Channel Switcher */}
            <div className="app-category-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === 'social'}
                className={`app-category-tab ${activeCategory === 'social' ? 'app-category-tab--active' : ''}`}
                onClick={() => setActiveCategory('social')}
              >
                <span>📱 Social Content</span>
                <span className="app-category-tab__badge">{socialCount}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === 'written'}
                className={`app-category-tab ${activeCategory === 'written' ? 'app-category-tab--active' : ''}`}
                onClick={() => setActiveCategory('written')}
              >
                <span>✍️ Written Content (Blogs & Newsletters)</span>
                <span className="app-category-tab__badge">{writtenCount}</span>
              </button>
            </div>

            {/* View Switcher: List, Grid, Calendar */}
            <ViewToggle currentView={view} onViewChange={setView} />
          </div>

          <div className="app-main__subheader-right">
            {/* ADMIN ACTIONS: Kickoff Month notification, History, & AI Generation */}
            {isAdmin && (
              <>
                {canSendMonthToDesigner && (
                  <button
                    type="button"
                    className="app-main__notify-designer-btn"
                    onClick={() => setIsMonthNotifyOpen(true)}
                    title={`Send ${getMonthName(month)} content table to designer via email`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <span>Send Month to Designer</span>
                  </button>
                )}

                {/* Undo & Redo Buttons */}
                <div className="app-main__history-group" role="group" aria-label="Undo and Redo">
                  <button
                    type="button"
                    className="app-main__history-btn"
                    disabled={!canUndo}
                    onClick={undo}
                    title={canUndo ? `Undo: ${lastUndoAction?.description || 'Last action'} (⌘Z)` : 'Nothing to undo (⌘Z)'}
                    aria-label="Undo last action"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 4 1 10 7 10" />
                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                    </svg>
                    <span>Undo</span>
                  </button>

                  <button
                    type="button"
                    className="app-main__history-btn"
                    disabled={!canRedo}
                    onClick={redo}
                    title={canRedo ? `Redo: ${lastRedoAction?.description || 'Last undone action'} (⌘⇧Z)` : 'Nothing to redo (⌘⇧Z)'}
                    aria-label="Redo last undone action"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
                    </svg>
                    <span>Redo</span>
                  </button>
                </div>

                <button
                  className="app-main__ai-btn"
                  onClick={() => setIsAiModalOpen(true)}
                  type="button"
                  title={`Generate ${activeCategory === 'written' ? 'editorial articles schedule' : 'social content schedule'} with AI`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  <span>Generate Table</span>
                </button>
              </>
            )}

            {/* DESIGNER ACTIONS: Only active on Social Content */}
            {isDesigner && activeCategory === 'social' && (
              <div className="app-main__designer-actions">
                <span className="app-main__role-pill app-main__role-pill--designer">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m4.93 4.93 4.24 4.24" />
                    <path d="m14.83 9.17 4.24-4.24" />
                    <path d="m14.83 14.83 4.24 4.24" />
                    <path d="m9.17 14.83-4.24 4.24" />
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                  <span>Designer Mode</span>
                </span>
                <button
                  type="button"
                  className="app-main__notify-admin-btn"
                  onClick={handleDesignerNotifyMonthReady}
                  title="Notify Admin via email that all designs for this month are uploaded & ready for review"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <span>Notify Admin: Month Designs Ready</span>
                </button>
              </div>
            )}

            {/* DESIGNER ON WRITTEN CONTENT: Read-only notice */}
            {isDesigner && activeCategory === 'written' && (
              <span className="app-main__role-pill app-main__role-pill--viewer" title="Written content (Blogs & Newsletters) is managed solely by Admin">
                <span>Admin Editorial Only</span>
              </span>
            )}

            {/* VIEWER ACTIONS: Read-Only Viewer Pill */}
            {isViewer && (
              <span className="app-main__role-pill app-main__role-pill--viewer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span>Read-Only Viewer</span>
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <LoadingSkeleton view={view} />
        ) : (error && categoryContent.length === 0) ? (
          <div className="app-error">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <h2>Unable to connect to database</h2>
            <p>{error}</p>
            <button
              className="app-main__ai-btn"
              onClick={() => refreshContent()}
              style={{ marginTop: '14px', background: 'var(--color-primary)' }}
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              <span>Retry Connection</span>
            </button>
          </div>
        ) : filteredContent.length === 0 && !searchQuery ? (
          <EmptyState onCreateFirst={handleCreateNew} />
        ) : (
          <>
            {view === 'list' && (
              <ListView
                content={filteredContent}
                onUpdate={handleUpdateItem}
                onDelete={handleDeleteItem}
                onPreview={handleOpenPreview}
                onCreateNew={handleCreateNew}
                onEditItem={setEditingItem}
                onOpenRevision={setRevisionItem}
                onSendForApproval={handleSendForApproval}
                year={year}
                month={month}
              />
            )}

            {view === 'grid' && (
              <GridView
                content={filteredContent}
                onEditItem={setEditingItem}
                onUpdate={handleUpdateItem}
                onCreateNew={handleCreateNew}
              />
            )}

            {view === 'calendar' && (
              <CalendarView
                year={year}
                month={month}
                content={filteredContent}
                onEditItem={setEditingItem}
                onCreateNewForDate={handleCreateNewForDate}
              />
            )}
          </>
        )}

        <MonthNotes year={year} month={month} category={activeCategory} />
      </main>

      {/* Footer */}
      <Footer />

      {/* Editing Dialog Modal (Grid & Calendar views only) */}
      {editingItem && (
        <div className="app-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setEditingItem(null)}>
          <div className="app-modal animate-scale-in">
            <ContentEditor
              item={editingItem}
              onUpdate={handleUpdateItem}
              onDelete={handleDeleteItem}
              onPreview={handleOpenPreview}
              onClose={() => handleCloseEditor(editingItem)}
              onOpenRevision={() => setRevisionItem(editingItem)}
              onSendForApproval={handleSendForApproval}
            />
          </div>
        </div>
      )}

      {/* Multi-Image Carousel & PDF Lightbox Preview Modal */}
      {(previewAsset || previewAssets.length > 0 || previewText) && (
        <Suspense fallback={null}>
          <PreviewModal
            asset={previewAsset}
            assets={previewAssets}
            initialIndex={previewInitialIndex}
            richText={previewText}
            caption={previewCaption}
            onClose={() => {
              setPreviewAsset(null);
              setPreviewAssets([]);
              setPreviewInitialIndex(0);
              setPreviewText(null);
              setPreviewCaption(null);
            }}
          />
        </Suspense>
      )}

      {/* PIN Unlock Modal */}
      <PinModal isOpen={isPinModalOpen} onClose={closePinModal} />

      {/* Revision Feedback Modal */}
      {revisionItem && (
        <Suspense fallback={null}>
          <RevisionModal
            contentItem={revisionItem}
            onSaveFeedback={handleSaveFeedback}
            onResubmitForReview={handleResubmitForReview}
            onPreviewAsset={handleOpenPreview}
            onClose={() => setRevisionItem(null)}
          />
        </Suspense>
      )}

      {/* AI Generator Modal */}
      {isAiModalOpen && (
        <Suspense fallback={null}>
          <AiModal
            year={year}
            month={month}
            category={activeCategory}
            onGenerate={batchAddContent}
            onClose={() => setIsAiModalOpen(false)}
          />
        </Suspense>
      )}

      {/* Floating Undo Toast for instant 1-click recovery */}
      <UndoToast
        toast={undoToast}
        onUndo={undo}
        onDismiss={dismissUndoToast}
      />

      {/* Admin Settings Modal (Email & API credentials and live activity logs) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsUpdated={(newSettings) => setAppSettings(newSettings)}
      />

      {/* Direct Month Kickoff Notification Modal */}
      <MonthNotifyModal
        isOpen={isMonthNotifyOpen}
        onClose={() => setIsMonthNotifyOpen(false)}
        year={year}
        month={month}
        content={categoryContent}
        designerEmail={appSettings.designerEmail}
        onOpenSettings={() => {
          setIsMonthNotifyOpen(false);
          setIsSettingsOpen(true);
        }}
        onSuccess={handleMonthNotifySuccess}
      />

      {/* Live Email Notification Toast */}
      <NotificationToast
        toast={notifToast}
        onDismiss={() => setNotifToast(null)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}
