// Content Service Layer
// Communicates with Cloudflare Workers API connected to Cloudflare D1 & R2.

import { PLATFORMS, CONTENT_TYPES, STATUSES } from '../data/mockContent';
import { dataUrlToBlob } from '../utils/helpers';

// Generate a random temporary ID for client-side items
function generateId() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Cross-tab broadcast channel for instantaneous zero-latency updates
const syncChannel = typeof window !== 'undefined' && window.BroadcastChannel
  ? new BroadcastChannel('codju_live_sync')
  : null;

export function broadcastLiveEvent(type, payload) {
  if (syncChannel) {
    try {
      syncChannel.postMessage({ type, payload, timestamp: Date.now() });
    } catch (e) {
      console.warn('BroadcastChannel error:', e);
    }
  }
}

export function subscribeLiveEvents(callback) {
  if (!syncChannel) return () => {};
  const handler = (event) => {
    if (event.data) {
      callback(event.data);
    }
  };
  syncChannel.addEventListener('message', handler);
  return () => syncChannel.removeEventListener('message', handler);
}

/**
 * Fetch delta sync for a specific month
 * @param {number} year
 * @param {number} month
 * @param {string|null} since
 * @param {number|null} count
 * @returns {Promise<{ changed: boolean, latest: string, count: number, items?: Array }>}
 */
export async function fetchContentSync(year, month, since = null, count = null) {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  let url = `/api/content/sync?month=${monthKey}`;
  if (since) url += `&since=${encodeURIComponent(since)}`;
  if (count !== null && count !== undefined) url += `&count=${count}`;

  const response = await fetch(url);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to sync content');
  }
  return response.json();
}

/**
 * Fetch all content for a specific month
 * @param {number} year
 * @param {number} month - 1-indexed (1=Jan, 7=Jul)
 * @returns {Promise<Array>}
 */
export async function fetchContentByMonth(year, month) {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const response = await fetch(`/api/content?month=${monthKey}`);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch content');
  }
  return response.json();
}

/**
 * Get all available months that have content (defaults to current/prev months)
 * @returns {Promise<string[]>}
 */
export async function fetchAvailableMonths() {
  return ['2026-06', '2026-07', '2026-08'];
}

/**
 * Create a new content item
 * @param {object} contentData
 * @returns {Promise<object>}
 */
export async function createContent(contentData) {
  const payload = {
    id: generateId(),
    ...contentData,
  };
  const response = await fetch('/api/content', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to create content');
  }

  const created = await response.json();
  broadcastLiveEvent('CONTENT_CREATED', created);
  logActivity('CONTENT_CREATED', 'admin', {
    itemId: created.id,
    itemName: created.name || 'Untitled',
    details: `Created content scheduled for ${created.date || 'calendar'}`
  });
  return created;
}

/**
 * Update an existing content item
 * @param {string} id
 * @param {object} updates
 * @returns {Promise<object>}
 */
export async function updateContent(id, updates) {
  const response = await fetch(`/api/content/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to update content');
  }

  const updated = await response.json();
  broadcastLiveEvent('CONTENT_UPDATED', updated);

  // Log activity with descriptive context
  if (updates.status) {
    const actor = updates.designerUpdated ? 'designer' : 'admin';
    logActivity('STATUS_CHANGE', actor, {
      itemId: id,
      itemName: updated.name || 'Content Item',
      details: `Status changed to ${updates.status}`
    });
  } else if (updates.assetUrl) {
    logActivity('ASSET_UPLOAD', 'designer', {
      itemId: id,
      itemName: updated.name || 'Content Item',
      details: `Uploaded design file ${updates.assetName || ''}`
    });
  } else {
    logActivity('CONTENT_UPDATED', 'admin', {
      itemId: id,
      itemName: updated.name || 'Content Item',
      details: `Updated details for ${updated.name || id}`
    });
  }

  return updated;
}

/**
 * Delete a content item
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteContent(id) {
  const response = await fetch(`/api/content/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to delete content');
  }

  const result = await response.json();
  broadcastLiveEvent('CONTENT_DELETED', { id });
  logActivity('CONTENT_DELETED', 'admin', {
    itemId: id,
    details: 'Deleted content item from calendar'
  });
  return result.success;
}

/**
 * Create a new empty month
 * @param {number} year
 * @param {number} month
 * @returns {Promise<boolean>}
 */
export async function createMonth(_year, _month) {
  return true;
}

/**
 * Upload an asset to Cloudflare R2 object storage
 * @param {File} file
 * @returns {Promise<object>}
 */
export async function uploadAsset(file) {
  if (!file) throw new Error('No file provided');
  // 50MB maximum upload limit for browser safety
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File size exceeds the 50MB limit. Please upload a smaller file.');
  }
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/assets/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(errData.error || `Upload failed with status ${response.status}`);
    }

    const data = await response.json();
    logActivity('ASSET_UPLOAD', 'designer', {
      details: `Uploaded asset: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`
    });
    return {
      id: data.id || ('a' + Math.random().toString(36).substr(2, 9)),
      name: data.name || file.name,
      type: data.type || file.type || 'application/octet-stream',
      size: data.size || file.size,
      url: data.url,
      uploadedAt: data.uploadedAt || new Date().toISOString(),
    };
  } catch (error) {
    console.error('Failed to process asset upload to R2:', error);
    throw error;
  }
}

/**
 * Infer extension from mime type
 * @param {string} mimeType
 * @returns {string}
 */
function getExtensionFromMime(mimeType) {
  if (!mimeType) return '';
  const cleanMime = mimeType.split(';')[0].trim().toLowerCase();
  const map = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'application/pdf': '.pdf',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  };
  return map[cleanMime] || '';
}

/**
 * Ensure filename has a valid extension based on mimeType or fallback
 * @param {string} filename
 * @param {string} mimeType
 * @returns {string}
 */
function ensureFilenameExtension(filename, mimeType) {
  let name = filename || 'download';
  const hasExt = /\.[a-zA-Z0-9]{2,5}$/.test(name);
  if (!hasExt && mimeType) {
    const ext = getExtensionFromMime(mimeType);
    if (ext) {
      name += ext;
    }
  }
  return name;
}

/**
 * Download an asset reliably across all browsers by fetching blob or using native object URL
 * @param {string} url
 * @param {string} filename
 * @returns {Promise<void>}
 */
export async function downloadAsset(url, filename) {
  if (!url) return;

  let blob = null;
  let targetMime = null;
  let tempBlobUrl = null;

  try {
    if (typeof url === 'string' && url.startsWith('blob:')) {
      const safeName = ensureFilenameExtension(filename, null);
      const a = document.createElement('a');
      a.href = url;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    if (typeof url === 'string' && url.startsWith('data:')) {
      const isPdf = filename?.toLowerCase().endsWith('.pdf') || url.startsWith('data:application/pdf');
      blob = dataUrlToBlob(url, isPdf ? 'application/pdf' : null);
      if (blob) {
        targetMime = blob.type;
      }
    } else {
      let fetchUrl = url;
      if (url.startsWith('/api/assets/')) {
        const separator = url.includes('?') ? '&' : '?';
        fetchUrl = `${url}${separator}download=1&filename=${encodeURIComponent(filename || 'download')}`;
      }

      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
      }
      blob = await response.blob();
      targetMime = response.headers.get('content-type') || blob.type;
    }

    if (blob) {
      tempBlobUrl = URL.createObjectURL(blob);
      const safeFilename = ensureFilenameExtension(filename, targetMime);

      const a = document.createElement('a');
      a.href = tempBlobUrl;
      a.download = safeFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        URL.revokeObjectURL(tempBlobUrl);
      }, 60000);
      return;
    }
  } catch (err) {
    console.warn('Blob download encountered an issue, falling back to direct anchor:', err);
  }

  // Fallback to direct anchor download
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.error('Direct download failed:', err);
    window.open(url, '_blank');
  }
}


/**
 * Generate content using Gemini AI
 * @param {string} prompt
 * @param {number} year
 * @param {number} month
 * @param {string} category - 'social' | 'written'
 * @returns {Promise<Array>}
 */
export async function generateAIContent(prompt, year, month, category = 'social') {
  const response = await fetch('/api/generate-ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, year, month, category }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to generate AI content');
  }
  const result = await response.json();
  const items = Array.isArray(result)
    ? result
    : (result.items || result.schedule || result.content || result.posts || []);

  if (items.length > 0) {
    logActivity('AI_GENERATED', 'admin', {
      details: `Generated ${items.length} content items via AI (${category})`
    });
  }
  return items;
}

/**
 * Fetch real-time activity logs
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function fetchActivityLogs(limit = 50) {
  try {
    const response = await fetch(`/api/activity-logs?limit=${limit}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.logs || (Array.isArray(data) ? data : []);
  } catch (err) {
    console.warn('Failed to fetch activity logs:', err);
    return [];
  }
}

/**
 * Log a user or system activity
 * @param {string} action
 * @param {string} actor
 * @param {object} metadata
 */
export async function logActivity(action, actor = 'admin', metadata = {}) {
  try {
    await fetch('/api/activity-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, actor, ...metadata }),
    });
  } catch (err) {
    console.warn('Failed to log activity:', err);
  }
}

/**
 * Batch insert content items
 * @param {Array} items
 * @returns {Promise<Array>}
 */
export async function createBatchContent(items) {
  const response = await fetch('/api/content/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to batch create content');
  }
  const result = await response.json();
  logActivity('BATCH_CREATED', 'admin', {
    details: `Added ${items.length} items to calendar in batch`
  });
  return result.items || items;
}

/**
 * Reset all data to mock defaults
 * @returns {Promise<boolean>}
 */
export async function resetData() {
  // Client can just re-initialize if needed, or we could hit a reset endpoint.
  return true;
}

/**
 * Fetch month notes
 * @param {number} year
 * @param {number} month
 * @param {string} category - 'social' | 'written'
 * @returns {Promise<object>}
 */
export async function fetchNotesByMonth(year, month, category = 'social') {
  const baseKey = `${year}-${String(month).padStart(2, '0')}`;
  const monthKey = category === 'written' ? `${baseKey}-written` : `${baseKey}-social`;
  
  try {
    let response = await fetch(`/api/notes?month=${monthKey}`);
    if (response.ok) {
      const data = await response.json();
      // For social category, fallback to legacy baseKey if social key has no data
      if (category === 'social' && (!data.notes || data.notes === '')) {
        const fallbackRes = await fetch(`/api/notes?month=${baseKey}`);
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          if (fallbackData.notes) return fallbackData;
        }
      }
      return data;
    }
  } catch (e) {
    console.error('Error fetching notes:', e);
  }
  return { month_key: monthKey, notes: '' };
}

/**
 * Save month notes
 * @param {number} year
 * @param {number} month
 * @param {string} notes
 * @param {string} category - 'social' | 'written'
 * @returns {Promise<object>}
 */
export async function saveNotesByMonth(year, month, notes, category = 'social') {
  const baseKey = `${year}-${String(month).padStart(2, '0')}`;
  const monthKey = category === 'written' ? `${baseKey}-written` : `${baseKey}-social`;
  const response = await fetch('/api/notes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ month: monthKey, notes }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to save notes');
  }
  return response.json();
}

export { PLATFORMS, CONTENT_TYPES, STATUSES };
