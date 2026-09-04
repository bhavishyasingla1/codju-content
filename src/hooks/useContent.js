import { useState, useEffect, useCallback, useRef } from 'react';
import * as contentService from '../services/contentService';
import { safeJsonParse } from '../utils/helpers';

export function useContent(year, month) {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const cacheKey = `codju_cache_${monthKey}`;
  const latestTimestampKey = `codju_latest_ts_${monthKey}`;

  // Instant SWR Cache: load instantly from localStorage if available
  const [content, setContent] = useState(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = safeJsonParse(cached, null);
        if (Array.isArray(parsed)) {
          return parsed.sort((a, b) => new Date(a.date) - new Date(b.date));
        }
      }
    } catch (e) {
      console.warn('Error reading content cache:', e);
    }
    return [];
  });

  // Only show full loading skeleton if we have zero cached items
  const [loading, setLoading] = useState(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = safeJsonParse(cached, null);
        if (Array.isArray(parsed) && parsed.length > 0) return false;
      }
    } catch {
      // ignore
    }
    return true;
  });

  const [error, setError] = useState(null);

  // Keep track of deleted IDs to permanently prevent background pulse sync from restoring them
  const deletedIdsRef = useRef(new Set());
  // Keep track of in-flight optimistic additions so background sync polls never temporarily wipe them
  const pendingItemsRef = useRef(new Map());

  // Keep live references for sync comparisons
  const contentRef = useRef(content);
  contentRef.current = content;

  const latestTsRef = useRef(() => {
    try {
      return localStorage.getItem(latestTimestampKey) || null;
    } catch {
      return null;
    }
  });

  // Helper to persist to localStorage safely with quota protection and auto-cleanup
  const persistCache = useCallback((items, serverLatest = null) => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(items));
      if (serverLatest) {
        localStorage.setItem(latestTimestampKey, serverLatest);
        latestTsRef.current = serverLatest;
      }
    } catch {
      try {
        // Purge old temporary keys to free up space
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k !== cacheKey && k !== latestTimestampKey && (k.startsWith('codju_cache_') || k.startsWith('codju_temp_'))) {
            localStorage.removeItem(k);
          }
        }

        // Save compact representation without heavy binaries
        const lightweight = items.map(item => ({
          id: item.id,
          date: item.date,
          name: item.name,
          type: item.type,
          category: item.category,
          platform: item.platform,
          status: item.status,
          summary: item.summary,
          caption: item.caption,
          updatedAt: item.updatedAt
        }));

        localStorage.setItem(cacheKey, JSON.stringify(lightweight));
        if (serverLatest) {
          localStorage.setItem(latestTimestampKey, serverLatest);
          latestTsRef.current = serverLatest;
        }
      } catch {
        // In-memory state remains completely active
      }
    }
  }, [cacheKey, latestTimestampKey]);

  // Delta Sync Function
  const syncWithServer = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setError(null);
    }
    try {
      const currentSince = latestTsRef.current;
      const currentCount = contentRef.current.length;

      const syncResult = await contentService.fetchContentSync(
        year,
        month,
        currentSince,
        currentCount
      );

      if (syncResult.changed && Array.isArray(syncResult.items)) {
        const serverItems = syncResult.items.filter(item => !deletedIdsRef.current.has(item.id));
        const serverIds = new Set(serverItems.map(i => i.id));
        
        // Retain any pending optimistic items that have not yet arrived in server index
        const pendingItems = Array.from(pendingItemsRef.current.values())
          .filter(p => !serverIds.has(p.id) && !deletedIdsRef.current.has(p.id));
        
        const combined = [...serverItems, ...pendingItems]
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        setContent(combined);
        persistCache(combined, syncResult.latest);
      } else if (syncResult.latest && !latestTsRef.current) {
        latestTsRef.current = syncResult.latest;
        try {
          localStorage.setItem(latestTimestampKey, syncResult.latest);
        } catch {}
      }
    } catch (err) {
      console.warn('Sync error (recovering silently):', err.message);
      if (!isSilent && contentRef.current.length === 0) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [year, month, persistCache, latestTimestampKey]);

  // Initial Load / Month Switch
  useEffect(() => {
    // Check if cache exists for this newly selected month
    let hasCachedData = false;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = safeJsonParse(cached, null);
        if (Array.isArray(parsed) && parsed.length > 0) {
          hasCachedData = true;
          setContent(parsed.sort((a, b) => new Date(a.date) - new Date(b.date)));
          setLoading(false);
        }
      }
      latestTsRef.current = localStorage.getItem(latestTimestampKey) || null;
    } catch {
      // ignore
    }

    if (!hasCachedData) {
      setContent([]);
      setLoading(true);
    }

    // Immediately trigger background revalidation
    syncWithServer(hasCachedData);
  }, [year, month, cacheKey, latestTimestampKey, syncWithServer]);

  // Cross-Tab Realtime Synchronization via BroadcastChannel
  useEffect(() => {
    const unsubscribe = contentService.subscribeLiveEvents((event) => {
      if (!event || !event.type) return;

      if (event.type === 'CONTENT_CREATED') {
        const item = event.payload;
        if (item && item.date && item.date.startsWith(monthKey)) {
          setContent(prev => {
            if (prev.some(i => i.id === item.id)) return prev;
            const updated = [...prev, item].sort((a, b) => new Date(a.date) - new Date(b.date));
            persistCache(updated);
            return updated;
          });
        }
      } else if (event.type === 'CONTENT_UPDATED') {
        const item = event.payload;
        if (item && item.id) {
          setContent(prev => {
            const exists = prev.some(i => i.id === item.id);
            if (!exists) {
              if (item.date && item.date.startsWith(monthKey)) {
                const updated = [...prev, item].sort((a, b) => new Date(a.date) - new Date(b.date));
                persistCache(updated);
                return updated;
              }
              return prev;
            }
            const updated = prev
              .map(i => (i.id === item.id ? { ...i, ...item } : i))
              .sort((a, b) => new Date(a.date) - new Date(b.date));
            persistCache(updated);
            return updated;
          });
        }
      } else if (event.type === 'CONTENT_DELETED') {
        const { id } = event.payload || {};
        if (id) {
          deletedIdsRef.current.add(id);
          setContent(prev => {
            const updated = prev.filter(i => i.id !== id);
            persistCache(updated);
            return updated;
          });
        }
      }
    });

    return unsubscribe;
  }, [monthKey, persistCache]);

  // Multi-Device Realtime Pulse & Focus Sync
  useEffect(() => {
    let isMounted = true;

    // Pulse polling every 5 seconds when tab is active/visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && isMounted) {
        syncWithServer(true);
      }
    }, 5000);

    // Instant sync when user switches back to this browser tab/window
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && isMounted) {
        syncWithServer(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      isMounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [syncWithServer]);

  // Undo & Redo History Management
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [undoToast, setUndoToast] = useState(null);
  const toastTimerRef = useRef(null);

  const pushUndoAction = useCallback((action) => {
    setUndoStack(prev => [...prev.slice(-49), action]); // Cap at 50 actions
    setRedoStack([]); // New user action invalidates redo stack
  }, []);

  const showUndoToast = useCallback((message, onUndoAction) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setUndoToast({
      id: Date.now(),
      message,
      onUndo: onUndoAction,
    });
    toastTimerRef.current = setTimeout(() => {
      setUndoToast(null);
    }, 8000);
  }, []);

  const dismissUndoToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setUndoToast(null);
  }, []);

  const executeUndo = useCallback(async (action) => {
    if (!action) return;

    if (action.type === 'DELETE') {
      const item = action.item;
      if (!item) return;

      deletedIdsRef.current.delete(item.id);
      pendingItemsRef.current.set(item.id, item);

      setContent(prev => {
        if (prev.some(i => i.id === item.id)) return prev;
        const updated = [...prev, item].sort((a, b) => new Date(a.date) - new Date(b.date));
        persistCache(updated);
        return updated;
      });

      contentService.broadcastLiveEvent('CONTENT_CREATED', item);

      try {
        await contentService.createContent(item);
        pendingItemsRef.current.delete(item.id);
      } catch (err) {
        console.warn('Error restoring deleted item on server:', err);
      }

      setRedoStack(prev => [...prev, action]);
      dismissUndoToast();
      return;
    }

    if (action.type === 'CREATE') {
      const item = action.item;
      if (!item) return;

      pendingItemsRef.current.delete(item.id);
      deletedIdsRef.current.add(item.id);
      setContent(prev => {
        const updated = prev.filter(i => i.id !== item.id);
        persistCache(updated);
        return updated;
      });
      contentService.broadcastLiveEvent('CONTENT_DELETED', { id: item.id });

      try {
        await contentService.deleteContent(item.id);
      } catch (err) {
        console.warn('Error removing created item during undo:', err);
      }

      setRedoStack(prev => [...prev, action]);
      dismissUndoToast();
      return;
    }

    if (action.type === 'UPDATE') {
      const { id, prevItem } = action;
      if (!prevItem) return;

      setContent(prev => {
        const updated = prev.map(i => i.id === id ? prevItem : i)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        persistCache(updated);
        return updated;
      });

      try {
        await contentService.updateContent(id, prevItem);
      } catch (err) {
        console.warn('Error reverting item during undo:', err);
      }

      setRedoStack(prev => [...prev, action]);
      dismissUndoToast();
      return;
    }

    if (action.type === 'BATCH_CREATE') {
      const { items } = action;
      if (Array.isArray(items)) {
        const ids = new Set(items.map(i => i.id));
        items.forEach(i => {
          pendingItemsRef.current.delete(i.id);
          deletedIdsRef.current.add(i.id);
        });
        setContent(prev => {
          const updated = prev.filter(i => !ids.has(i.id));
          persistCache(updated);
          return updated;
        });

        for (const item of items) {
          contentService.deleteContent(item.id).catch(() => {});
        }
      }

      setRedoStack(prev => [...prev, action]);
      dismissUndoToast();
      return;
    }
  }, [persistCache, dismissUndoToast]);

  const executeRedo = useCallback(async (action) => {
    if (!action) return;

    if (action.type === 'DELETE') {
      const item = action.item;
      if (!item) return;

      pendingItemsRef.current.delete(item.id);
      deletedIdsRef.current.add(item.id);
      setContent(prev => {
        const updated = prev.filter(i => i.id !== item.id);
        persistCache(updated);
        return updated;
      });
      contentService.broadcastLiveEvent('CONTENT_DELETED', { id: item.id });

      try {
        await contentService.deleteContent(item.id);
      } catch (err) {
        console.warn('Error re-deleting item during redo:', err);
      }

      setUndoStack(prev => [...prev, action]);
      return;
    }

    if (action.type === 'CREATE') {
      const item = action.item;
      if (!item) return;

      deletedIdsRef.current.delete(item.id);
      pendingItemsRef.current.set(item.id, item);

      setContent(prev => {
        if (prev.some(i => i.id === item.id)) return prev;
        const updated = [...prev, item].sort((a, b) => new Date(a.date) - new Date(b.date));
        persistCache(updated);
        return updated;
      });
      contentService.broadcastLiveEvent('CONTENT_CREATED', item);

      try {
        await contentService.createContent(item);
        pendingItemsRef.current.delete(item.id);
      } catch (err) {
        console.warn('Error re-creating item during redo:', err);
      }

      setUndoStack(prev => [...prev, action]);
      return;
    }

    if (action.type === 'UPDATE') {
      const { id, nextItem } = action;
      if (!nextItem) return;

      setContent(prev => {
        const updated = prev.map(i => i.id === id ? nextItem : i)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        persistCache(updated);
        return updated;
      });

      try {
        await contentService.updateContent(id, nextItem);
      } catch (err) {
        console.warn('Error re-applying update during redo:', err);
      }

      setUndoStack(prev => [...prev, action]);
      return;
    }

    if (action.type === 'BATCH_CREATE') {
      const { items } = action;
      if (Array.isArray(items)) {
        items.forEach(item => {
          deletedIdsRef.current.delete(item.id);
          pendingItemsRef.current.set(item.id, item);
        });

        setContent(prev => {
          const updated = [...prev, ...items].sort((a, b) => new Date(a.date) - new Date(b.date));
          persistCache(updated);
          return updated;
        });

        contentService.createBatchContent(items).catch(() => {});
      }

      setUndoStack(prev => [...prev, action]);
      return;
    }
  }, [persistCache]);

  const undo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const action = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    await executeUndo(action);
  }, [undoStack, executeUndo]);

  const redo = useCallback(async () => {
    if (redoStack.length === 0) return;
    const action = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    await executeRedo(action);
  }, [redoStack, executeRedo]);

  // CRUD Mutations with Optimistic Updates + Cross-Tab Broadcasts + Undo Tracking
  const addContent = useCallback(async (contentData, recordHistory = true) => {
    const now = new Date().toISOString();
    const tempId = contentData.id || ('c_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6));
    const optimisticItem = {
      id: tempId,
      date: contentData.date || now.split('T')[0],
      name: contentData.name || 'New Content Piece',
      type: contentData.type || (contentData.category === 'written' ? 'blog' : 'static'),
      category: contentData.category || 'social',
      platform: contentData.platform || (contentData.category === 'written' ? 'website' : 'instagram'),
      status: contentData.status || 'draft',
      summary: contentData.summary || '',
      caption: contentData.caption || '',
      assets: contentData.assets || [],
      richText: contentData.richText || '',
      script: contentData.script || '',
      thumbnailAsset: contentData.thumbnailAsset || null,
      pdfAsset: contentData.pdfAsset || null,
      feedback: contentData.feedback || '',
      feedbackAssets: contentData.feedbackAssets || [],
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
      ...contentData,
    };

    deletedIdsRef.current.delete(tempId);
    pendingItemsRef.current.set(tempId, optimisticItem);

    if (recordHistory) {
      pushUndoAction({
        type: 'CREATE',
        item: { ...optimisticItem },
        description: `Created "${optimisticItem.name}"`
      });
    }

    // 1. Instantly update React state in 0ms
    setContent(prev => {
      const updated = [...prev, optimisticItem].sort((a, b) => new Date(a.date) - new Date(b.date));
      persistCache(updated, now);
      return updated;
    });

    contentService.broadcastLiveEvent('CONTENT_CREATED', optimisticItem);

    // 2. Persist to server in background
    try {
      const serverItem = await contentService.createContent(optimisticItem);
      pendingItemsRef.current.delete(tempId);
      if (serverItem && serverItem.id) {
        deletedIdsRef.current.delete(serverItem.id);
        setContent(prev => {
          const updated = prev.map(i => (i.id === tempId ? serverItem : i)).sort((a, b) => new Date(a.date) - new Date(b.date));
          persistCache(updated, serverItem.updatedAt || now);
          return updated;
        });
        return serverItem;
      }
      return optimisticItem;
    } catch (err) {
      console.warn('Background add sync note (persisted locally):', err.message);
      return optimisticItem;
    }
  }, [persistCache, pushUndoAction]);

  const updateContentItem = useCallback(async (id, updates, recordHistory = true) => {
    try {
      const prevItem = contentRef.current.find(item => item.id === id);
      if (recordHistory && prevItem) {
        pushUndoAction({
          type: 'UPDATE',
          id,
          prevItem: { ...prevItem },
          nextItem: { ...prevItem, ...updates },
          description: `Updated "${prevItem.name}"`
        });
      }

      // Optimistically update local state immediately
      setContent(prev => {
        const updated = prev.map(item => item.id === id ? { ...item, ...updates } : item)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        persistCache(updated);
        return updated;
      });

      const updated = await contentService.updateContent(id, updates);
      setContent(prev => {
        const final = prev.map(item => item.id === id ? updated : item)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        persistCache(final, updated.updatedAt || new Date().toISOString());
        return final;
      });
      return updated;
    } catch (err) {
      setError(err.message);
      // Revert/refresh on error
      syncWithServer(true);
      throw err;
    }
  }, [persistCache, syncWithServer, pushUndoAction]);

  const removeContent = useCallback(async (id, recordHistory = true) => {
    const targetItem = contentRef.current.find(item => item.id === id);

    pendingItemsRef.current.delete(id);
    deletedIdsRef.current.add(id);
    setContent(prev => {
      const updated = prev.filter(item => item.id !== id);
      persistCache(updated);
      return updated;
    });
    contentService.broadcastLiveEvent('CONTENT_DELETED', { id });

    if (recordHistory && targetItem) {
      const action = {
        type: 'DELETE',
        item: { ...targetItem },
        description: `Deleted "${targetItem.name || 'Content Piece'}"`
      };
      pushUndoAction(action);
      showUndoToast(`Deleted "${targetItem.name || 'Content Piece'}"`, () => {
        executeUndo(action);
      });
    }

    try {
      await contentService.deleteContent(id);
    } catch (err) {
      console.warn('Background delete error:', err.message);
    }
  }, [persistCache, pushUndoAction, showUndoToast, executeUndo]);

  const batchAddContent = useCallback(async (items, recordHistory = true) => {
    const now = new Date().toISOString();
    // 1. Instantly generate items and update UI + cache in 0ms
    const optimisticItems = items.map((item, idx) => ({
      id: item.id || ('c_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6) + idx),
      date: item.date || now.split('T')[0],
      name: item.name || 'Untitled Content',
      type: item.type || (item.category === 'written' ? 'blog' : 'static'),
      category: item.category || 'social',
      platform: item.platform || (item.category === 'written' ? 'website' : 'instagram'),
      status: item.status || 'draft',
      summary: item.summary || '',
      caption: item.caption || '',
      richText: item.richText || '',
      script: item.script || '',
      assets: item.assets || [],
      thumbnailAsset: null,
      pdfAsset: null,
      feedback: '',
      feedbackAssets: [],
      reviewedAt: null,
      createdAt: now,
      updatedAt: now
    }));

    optimisticItems.forEach(item => {
      deletedIdsRef.current.delete(item.id);
      pendingItemsRef.current.set(item.id, item);
    });

    if (recordHistory) {
      pushUndoAction({
        type: 'BATCH_CREATE',
        items: optimisticItems.map(i => ({ ...i })),
        description: `Added ${optimisticItems.length} items`
      });
    }

    setContent(prev => {
      const updated = [...prev, ...optimisticItems].sort((a, b) => new Date(a.date) - new Date(b.date));
      persistCache(updated, now);
      return updated;
    });
    optimisticItems.forEach(item => contentService.broadcastLiveEvent('CONTENT_CREATED', item));

    // 2. Persist to server in background
    try {
      const serverItems = await contentService.createBatchContent(optimisticItems);
      optimisticItems.forEach(item => pendingItemsRef.current.delete(item.id));
      if (Array.isArray(serverItems) && serverItems.length > 0) {
        const idMap = new Map();
        optimisticItems.forEach((opt, idx) => {
          if (serverItems[idx]) {
            idMap.set(opt.id, serverItems[idx]);
          }
        });

        setContent(prev => {
          const updated = prev.map(item => idMap.get(item.id) || item).sort((a, b) => new Date(a.date) - new Date(b.date));
          persistCache(updated, now);
          return updated;
        });
      }
      return serverItems;
    } catch (err) {
      console.warn('Background batch sync note (persisted locally):', err.message);
      return optimisticItems;
    }
  }, [persistCache, pushUndoAction]);

  const refreshContent = useCallback(() => {
    return syncWithServer(false);
  }, [syncWithServer]);

  return {
    content,
    loading,
    error,
    addContent,
    batchAddContent,
    updateContentItem,
    removeContent,
    refreshContent,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undo,
    redo,
    undoToast,
    dismissUndoToast,
    lastUndoAction: undoStack[undoStack.length - 1] || null,
    lastRedoAction: redoStack[redoStack.length - 1] || null,
  };
}

