import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchNotesByMonth, saveNotesByMonth } from '../../services/contentService';
import { useAutoSave } from '../../hooks/useAutoSave';
import { getMonthName, sanitizeUrl, safeJsonParse } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';
import './MonthNotes.css';

/**
 * Detect smart domain metadata (icon, brand name, badge color)
 */
function getDomainMeta(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    if (host.includes('notion.so') || host.includes('notion.site')) return { name: 'Notion', badge: 'Notion', icon: '📝', domain: host };
    if (host.includes('figma.com')) return { name: 'Figma', badge: 'Figma', icon: '🎨', domain: host };
    if (host.includes('docs.google.com')) return { name: 'Google Docs', badge: 'Docs', icon: '📄', domain: host };
    if (host.includes('drive.google.com')) return { name: 'Google Drive', badge: 'Drive', icon: '📁', domain: host };
    if (host.includes('sheets.google.com')) return { name: 'Google Sheets', badge: 'Sheets', icon: '📊', domain: host };
    if (host.includes('canva.com')) return { name: 'Canva', badge: 'Canva', icon: '✨', domain: host };
    if (host.includes('chatgpt.com') || host.includes('openai.com')) return { name: 'ChatGPT', badge: 'ChatGPT', icon: '🤖', domain: host };
    if (host.includes('linkedin.com')) return { name: 'LinkedIn', badge: 'LinkedIn', icon: '💼', domain: host };
    if (host.includes('twitter.com') || host.includes('x.com')) return { name: 'X', badge: 'X', icon: '🐦', domain: host };
    if (host.includes('youtube.com') || host.includes('youtu.be')) return { name: 'YouTube', badge: 'YouTube', icon: '▶️', domain: host };
    if (host.includes('github.com')) return { name: 'GitHub', badge: 'GitHub', icon: '🐙', domain: host };

    return { name: host, badge: host.split('.')[0] || 'Web', icon: '🔗', domain: host };
  } catch {
    return { name: 'Resource Link', badge: 'Web', icon: '🔗', domain: urlStr };
  }
}

/**
 * Safely parse existing notes content into links and text body
 */
function parseNotesPayload(raw) {
  if (!raw) return { links: [], notes: '' };

  const parsed = safeJsonParse(raw, null);
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.links)) {
    const cleanLinks = parsed.links
      .map(link => {
        const cleanUrl = sanitizeUrl(link.url);
        return cleanUrl ? { ...link, url: cleanUrl } : null;
      })
      .filter(Boolean);
    return {
      links: cleanLinks,
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    };
  }

  // Legacy plain text parsing fallback
  if (typeof raw === 'string') {
    const lines = raw.split('\n');
    const links = [];
    const remainingLines = [];

    for (const line of lines) {
      const urlMatch = line.match(/https?:\/\/[^\s]+/i);
      if (urlMatch) {
        let title = line.replace(urlMatch[0], '').replace(/[-–—:|()[\]]/g, ' ').trim();
        if (!title) {
          try {
            const urlObj = new URL(urlMatch[0]);
            title = urlObj.hostname.replace(/^www\./, '');
          } catch {
            title = 'Resource Link';
          }
        }
        const cleanUrl = sanitizeUrl(urlMatch[0]);
        if (cleanUrl) {
          links.push({
            id: 'l_' + Math.random().toString(36).substr(2, 7),
            title: title || 'Resource Link',
            url: cleanUrl,
          });
        }
      } else {
        remainingLines.push(line);
      }
    }

    return {
      links,
      notes: remainingLines.join('\n').trim(),
    };
  }

  return { links: [], notes: String(raw) };
}

export default function MonthNotes({ year, month, category = 'social' }) {
  const { isAdmin, openPinModal } = useAuth();
  const isWritten = category === 'written';
  const baseKey = `${year}-${String(month).padStart(2, '0')}`;
  const monthKey = isWritten ? `${baseKey}-written` : `${baseKey}-social`;
  const cacheKey = `codju_notes_cache_${monthKey}`;

  // Instant SWR Cache
  const [links, setLinks] = useState(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = parseNotesPayload(cached);
        return parsed.links || [];
      }
    } catch {}
    return [];
  });

  const [notes, setNotes] = useState(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = parseNotesPayload(cached);
        return parsed.notes || '';
      }
    } catch {}
    return '';
  });

  const [loading, setLoading] = useState(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) return false;
    } catch {}
    return true;
  });

  const [error, setError] = useState(null);

  // In-flight typing ref so background sync doesn't overwrite active typing
  const isTypingRef = useRef(false);
  const typingTimerRef = useRef(null);

  // New link form state
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [copiedLinkId, setCopiedLinkId] = useState(null);

  const titleInputRef = useRef(null);
  const textareaRef = useRef(null);

  // Word & Character count calculation
  const stats = useMemo(() => {
    const trimmed = notes.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const chars = notes.length;
    return { words, chars };
  }, [notes]);

  // Helper to persist cache
  const persistNotesCache = useCallback((rawNotes) => {
    try {
      localStorage.setItem(cacheKey, typeof rawNotes === 'string' ? rawNotes : JSON.stringify(rawNotes));
    } catch {
      // ignore
    }
  }, [cacheKey]);

  // Load notes function (supports silent background revalidation)
  const loadNotes = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await fetchNotesByMonth(year, month, category);
      if (!isTypingRef.current) {
        const parsed = parseNotesPayload(data.notes || '');
        setLinks(parsed.links);
        setNotes(parsed.notes);
        persistNotesCache(data.notes || '');
      }
    } catch (err) {
      if (!isSilent) {
        setError(err.message || 'Failed to load notes');
      }
    } finally {
      setLoading(false);
    }
  }, [year, month, category, persistNotesCache]);

  // Fetch notes on month/year/category change
  useEffect(() => {
    let hasCache = false;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        hasCache = true;
        const parsed = parseNotesPayload(cached);
        setLinks(parsed.links);
        setNotes(parsed.notes);
        setLoading(false);
      }
    } catch {}

    if (!hasCache) {
      setLinks([]);
      setNotes('');
      setLoading(true);
    }

    loadNotes(hasCache);
  }, [year, month, category, cacheKey, loadNotes]);

  // Multi-Device & Focus Sync for notes
  useEffect(() => {
    let isMounted = true;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !isTypingRef.current && isMounted) {
        loadNotes(true);
      }
    }, 5000);

    const handleFocus = () => {
      if (document.visibilityState === 'visible' && !isTypingRef.current && isMounted) {
        loadNotes(true);
      }
    };

    document.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);

    return () => {
      isMounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadNotes]);

  // Save notes handler (serializes links + notes to JSON)
  const saveFunction = useCallback(async () => {
    if (!isAdmin) return;
    const payload = JSON.stringify({ links, notes });
    persistNotesCache(payload);
    await saveNotesByMonth(year, month, payload, category);
  }, [year, month, category, links, notes, isAdmin, persistNotesCache]);

  const { saveStatus, triggerSave } = useAutoSave(saveFunction, 1800);

  const handleNotesChange = (e) => {
    if (!isAdmin) {
      openPinModal();
      return;
    }
    isTypingRef.current = true;
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
    }, 3000);

    setNotes(e.target.value);
    triggerSave();
  };

  const handleStartAddLink = () => {
    if (!isAdmin) {
      openPinModal();
      return;
    }
    setIsAddingLink(true);
    setNewTitle('');
    setNewUrl('');
    setUrlError('');
    setTimeout(() => titleInputRef.current?.focus(), 60);
  };

  const handleCancelAddLink = () => {
    setIsAddingLink(false);
    setNewTitle('');
    setNewUrl('');
    setUrlError('');
  };

  const handleConfirmAddLink = (e) => {
    e?.preventDefault();
    setUrlError('');

    let rawInput = newUrl.trim();
    if (!rawInput) {
      setUrlError('URL is required');
      return;
    }

    if (!/^https?:\/\//i.test(rawInput)) {
      rawInput = 'https://' + rawInput;
    }

    const validatedUrl = sanitizeUrl(rawInput);
    if (!validatedUrl) {
      setUrlError('Please enter a valid URL (e.g. https://notion.so/doc)');
      return;
    }

    let resolvedTitle = newTitle.trim();
    if (!resolvedTitle) {
      try {
        const urlObj = new URL(validatedUrl);
        resolvedTitle = urlObj.hostname.replace(/^www\./, '');
      } catch {
        resolvedTitle = 'Resource ' + (links.length + 1);
      }
    }

    const newLink = {
      id: 'l_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      title: resolvedTitle,
      url: validatedUrl,
      addedAt: new Date().toISOString(),
    };

    const nextLinks = [...links, newLink];
    setLinks(nextLinks);
    setIsAddingLink(false);
    setNewTitle('');
    setNewUrl('');
    setUrlError('');

    isTypingRef.current = true;
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
    }, 4000);

    const payload = JSON.stringify({ links: nextLinks, notes });
    persistNotesCache(payload);
    saveNotesByMonth(year, month, payload, category).catch(err => {
      console.warn('Error saving added link:', err);
    });
  };

  const handleDeleteLink = async (e, id) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!isAdmin) {
      openPinModal();
      return;
    }
    const nextLinks = links.filter(link => link.id !== id);
    setLinks(nextLinks);

    isTypingRef.current = true;
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
    }, 4000);

    const payload = JSON.stringify({ links: nextLinks, notes });
    persistNotesCache(payload);
    try {
      await saveNotesByMonth(year, month, payload, category);
    } catch (err) {
      console.warn('Error saving deleted link:', err);
    }
  };

  const handleCopyLink = (link) => {
    if (!link?.url) return;
    navigator.clipboard.writeText(link.url);
    setCopiedLinkId(link.id);
    setTimeout(() => setCopiedLinkId(null), 2000);
  };

  return (
    <section className="month-notes-card animate-fade-in-up" aria-label="Month Resource Links and Notes">
      {/* Card Master Header */}
      <div className="month-notes-card__header">
        <div className="month-notes-card__title-group">
          <span className={`month-notes-card__category-badge month-notes-card__category-badge--${category}`}>
            {isWritten ? '✍️ Written Content' : '📱 Social Content'}
          </span>
          <div className="month-notes-card__heading-text">
            <h3 className="month-notes-card__title">
              Resource Hub &amp; Strategic Notes
            </h3>
            <span className="month-notes-card__period">
              {getMonthName(month)} {year}
            </span>
          </div>
        </div>

        {/* Header Right Status */}
        <div className="month-notes-card__status-wrap">
          {saveStatus !== 'idle' && (
            <div className={`month-notes-card__save-pill month-notes-card__save-pill--${saveStatus}`}>
              <span className="month-notes-card__save-dot" />
              <span>
                {saveStatus === 'saving' && 'Auto-saving...'}
                {saveStatus === 'saved' && 'Saved'}
                {saveStatus === 'error' && 'Save error'}
              </span>
            </div>
          )}
          {!isAdmin && (
            <span className="month-notes-card__viewer-pill" title="Admin PIN required to edit">
              🔒 Viewer Mode
            </span>
          )}
        </div>
      </div>

      {/* Main Body */}
      <div className="month-notes-card__body">
        {loading ? (
          <div className="month-notes-card__loading">
            <div className="month-notes-card__shimmer" />
          </div>
        ) : error ? (
          <div className="month-notes-card__error">{error}</div>
        ) : (
          <div className="month-notes-grid">
            {/* LEFT COLUMN: REFERENCE & ASSET LINKS */}
            <div className="month-notes__column month-notes__column--links">
              <div className="month-notes__panel-header">
                <div className="month-notes__panel-title-wrap">
                  <div className="month-notes__icon-circle month-notes__icon-circle--blue">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="month-notes__panel-title">
                      {isWritten ? 'Reference Links & Articles' : 'Inspiration & Asset Links'}
                    </h4>
                    <span className="month-notes__panel-sub">
                      {links.length} {links.length === 1 ? 'link' : 'links'} pinned
                    </span>
                  </div>
                </div>

                {!isAddingLink && (
                  <button
                    className="month-notes__action-btn"
                    onClick={handleStartAddLink}
                    type="button"
                    title="Add a new resource link"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>Add Link</span>
                  </button>
                )}
              </div>

              {/* Add Link Form */}
              {isAddingLink && (
                <form onSubmit={handleConfirmAddLink} className="month-notes__form-card animate-scale-in">
                  <div className="month-notes__form-header">
                    <span className="month-notes__form-title">Add Reference Link</span>
                    <button
                      type="button"
                      className="month-notes__form-close"
                      onClick={handleCancelAddLink}
                      aria-label="Close add link form"
                    >
                      &times;
                    </button>
                  </div>

                  <div className="month-notes__form-inputs">
                    <div className="month-notes__form-field">
                      <label className="month-notes__field-label">Link Title</label>
                      <input
                        ref={titleInputRef}
                        type="text"
                        className="month-notes__input"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="e.g. ChatGPT Prompt, Notion Board, Design Doc"
                      />
                    </div>

                    <div className="month-notes__form-field">
                      <label className="month-notes__field-label">
                        Destination URL <span className="month-notes__required">*</span>
                      </label>
                      <input
                        type="text"
                        className={`month-notes__input ${urlError ? 'month-notes__input--error' : ''}`}
                        value={newUrl}
                        onChange={(e) => {
                          setNewUrl(e.target.value);
                          if (urlError) setUrlError('');
                        }}
                        placeholder="e.g. https://notion.so/... or figma.com/file/..."
                        required
                      />
                      {urlError && <span className="month-notes__error-text">{urlError}</span>}
                    </div>
                  </div>

                  <div className="month-notes__form-footer">
                    <button
                      type="button"
                      onClick={handleCancelAddLink}
                      className="month-notes__btn month-notes__btn--cancel"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newUrl.trim()}
                      className="month-notes__btn month-notes__btn--submit"
                    >
                      Save Link
                    </button>
                  </div>
                </form>
              )}

              {/* Links List / Empty State */}
              <div className="month-notes__links-wrapper">
                {links.length === 0 ? (
                  <div className="month-notes__empty-links">
                    <div className="month-notes__empty-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    </div>
                    <p className="month-notes__empty-title">No links saved for this month yet</p>
                    <p className="month-notes__empty-desc">
                      Keep your prompt threads, Canva designs, Google Docs, or research bookmarks organized here.
                    </p>
                    {!isAddingLink && (
                      <button
                        type="button"
                        className="month-notes__empty-cta"
                        onClick={handleStartAddLink}
                      >
                        + Add First Link
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="month-notes__links-stack">
                    {links.map((link) => {
                      const meta = getDomainMeta(link.url);
                      return (
                        <div key={link.id} className="month-notes__link-row animate-scale-in">
                          <div className="month-notes__domain-badge" title={meta.name}>
                            <span className="month-notes__domain-emoji">{meta.icon}</span>
                            <span className="month-notes__domain-name">{meta.badge}</span>
                          </div>

                          <div className="month-notes__link-meta">
                            <span className="month-notes__link-title" title={link.title}>
                              {link.title}
                            </span>
                            <span className="month-notes__link-host">
                              {meta.domain}
                            </span>
                          </div>

                          <div className="month-notes__link-actions">
                            {/* Copy URL Button */}
                            <button
                              className={`month-notes__icon-btn ${copiedLinkId === link.id ? 'month-notes__icon-btn--copied' : ''}`}
                              onClick={() => handleCopyLink(link)}
                              title={copiedLinkId === link.id ? 'Copied to clipboard!' : 'Copy link URL'}
                              type="button"
                            >
                              {copiedLinkId === link.id ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              )}
                            </button>

                            {/* Open in Tab Button */}
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="month-notes__icon-btn month-notes__icon-btn--external"
                              title="Open link in new tab"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                            </a>

                            {/* Delete Link Button */}
                            {isAdmin && (
                              <button
                                className="month-notes__icon-btn month-notes__icon-btn--delete"
                                onClick={(e) => handleDeleteLink(e, link.id)}
                                title="Delete link"
                                type="button"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: STRATEGY & CREATIVE NOTES */}
            <div className="month-notes__column month-notes__column--notes">
              <div className="month-notes__panel-header">
                <div className="month-notes__panel-title-wrap">
                  <div className="month-notes__icon-circle month-notes__icon-circle--purple">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="month-notes__panel-title">
                      {isWritten ? 'Editorial Strategy & Outlines' : 'Campaign Strategy & Prompts'}
                    </h4>
                    <span className="month-notes__panel-sub">
                      {stats.words} words • {stats.chars} characters
                    </span>
                  </div>
                </div>
              </div>

              {/* Textarea or Read-Only Viewer */}
              <div className="month-notes__textarea-container">
                <textarea
                  ref={textareaRef}
                  className="month-notes__textarea"
                  value={notes}
                  onChange={handleNotesChange}
                  placeholder={
                    isAdmin
                      ? (isWritten
                          ? `Draft your editorial themes, newsletter topics, target SEO keywords, or blog outlines for ${getMonthName(month)} ${year}...`
                          : `Write your social campaign goals, brand guidelines, content hooks, or creative ideas for ${getMonthName(month)} ${year}...`)
                      : `${isWritten ? 'Written content' : 'Social content'} strategy & notes for ${getMonthName(month)} ${year} (Admin access required to edit)`
                  }
                  rows={8}
                  readOnly={!isAdmin}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
