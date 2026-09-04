// Utility helpers for the Codju Content Dashboard

/**
 * Format a date string to a readable format
 * @param {string} dateStr - ISO date string or YYYY-MM-DD
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string}
 */
export function formatDate(dateStr, options = {}) {
  const date = new Date(dateStr + 'T00:00:00');
  const defaults = { month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', { ...defaults, ...options });
}

/**
 * Format a date for the date input
 * @param {string} dateStr
 * @returns {string} YYYY-MM-DD
 */
export function toInputDate(dateStr) {
  return dateStr ? dateStr.substring(0, 10) : '';
}

/**
 * Get month name from month number
 * @param {number} month - 1-indexed
 * @returns {string}
 */
export function getMonthName(month) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month - 1] || '';
}

/**
 * Get number of days in a month
 * @param {number} year
 * @param {number} month - 1-indexed
 * @returns {number}
 */
export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Get the day of the week for the first day of a month (0=Sun, 6=Sat)
 * @param {number} year
 * @param {number} month - 1-indexed
 * @returns {number}
 */
export function getFirstDayOfMonth(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

/**
 * Truncate text to a max length
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
export function truncate(text, maxLength = 100) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '…';
}

/**
 * Strip HTML tags from a string
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  if (!html) return '';
  
  // Replace tag blocks with carriage returns to preserve paragraph layout
  let processed = html
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<\/ol>/gi, '\n');

  // Strip all other HTML tags
  processed = processed.replace(/<[^>]*>/g, '');

  // Decode common HTML entities
  const entities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'"
  };
  
  for (const [entity, replacement] of Object.entries(entities)) {
    processed = processed.replace(new RegExp(entity, 'g'), replacement);
  }

  // Normalize duplicate newlines and trim ends
  return processed.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Get character count from HTML content
 * @param {string} html
 * @returns {number}
 */
export function getCharCount(html) {
  return stripHtml(html).length;
}

/**
 * Copy text to clipboard
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch {
      document.body.removeChild(textarea);
      return false;
    }
  }
}

/**
 * Get file extension from filename
 * @param {string} filename
 * @returns {string}
 */
export function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

/**
 * Check if a file or asset is an image
 * @param {string|object} input
 * @returns {boolean}
 */
export function isImageFile(input) {
  if (!input) return false;
  if (typeof input === 'object') {
    if (input.type?.startsWith('image/')) return true;
    if (input.name && isImageFile(input.name)) return true;
    if (input.url?.startsWith('data:image/')) return true;
    return false;
  }
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
  return imageExts.includes(getFileExtension(input));
}

/**
 * Check if a file or asset is a video
 * @param {string|object} input
 * @returns {boolean}
 */
export function isVideoFile(input) {
  if (!input) return false;
  if (typeof input === 'object') {
    if (input.type?.startsWith('video/')) return true;
    if (input.name && isVideoFile(input.name)) return true;
    if (input.url?.startsWith('data:video/')) return true;
    return false;
  }
  const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'avi'];
  return videoExts.includes(getFileExtension(input));
}

/**
 * Check if a file or asset is a PDF
 * @param {string|object} input
 * @returns {boolean}
 */
export function isPdfFile(input) {
  if (!input) return false;
  if (typeof input === 'object') {
    if (input.type?.includes('pdf') || input.type === 'application/pdf') return true;
    if (input.name && isPdfFile(input.name)) return true;
    if (typeof input.url === 'string' && (input.url.startsWith('data:application/pdf') || input.url.toLowerCase().includes('.pdf'))) return true;
    return false;
  }
  if (typeof input === 'string') {
    if (input.startsWith('data:application/pdf')) return true;
    if (input.toLowerCase().includes('.pdf')) return true;
    return getFileExtension(input) === 'pdf';
  }
  return false;
}

/**
 * Convert base64 data URL to a Uint8Array
 * @param {string} dataUrl
 * @returns {Uint8Array|null}
 */
export function dataUrlToUint8Array(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  try {
    const cleanUrl = dataUrl.split('#')[0].trim();
    if (!cleanUrl.startsWith('data:')) return null;
    const parts = cleanUrl.split(',');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/[\r\n\s]/g, '');
    const bstr = atob(base64);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return u8arr;
  } catch (e) {
    console.error('Failed to convert data URL to Uint8Array:', e);
    return null;
  }
}

/**
 * Convert base64 data URL to a native Blob
 * @param {string} dataUrl
 * @param {string} forcedMime
 * @returns {Blob|null}
 */
export function dataUrlToBlob(dataUrl, forcedMime = null) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  try {
    const cleanUrl = dataUrl.split('#')[0].trim();
    if (!cleanUrl.startsWith('data:')) return null;
    const parts = cleanUrl.split(',');
    if (parts.length < 2) return null;
    const mimeMatch = parts[0].match(/:(.*?);/);
    let mime = forcedMime || (mimeMatch ? mimeMatch[1] : 'application/pdf');
    if ((mime === 'application/octet-stream' || mime === 'text/plain') && forcedMime) {
      mime = forcedMime;
    }
    const u8arr = dataUrlToUint8Array(cleanUrl);
    if (!u8arr) return null;
    return new Blob([u8arr], { type: mime });
  } catch (e) {
    console.error('Failed to convert data URL to Blob:', e);
    return null;
  }
}

/**
 * Format file size
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Debounce a function
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Validate and sanitize URL (enforces http/https/mailto protocols, rejects javascript:/data:/vbscript:)
 * @param {string} urlStr
 * @returns {string|null}
 */
export function sanitizeUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;
  const trimmed = urlStr.trim();
  if (!trimmed) return null;

  // Auto-prefix protocol if missing
  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(candidate)) {
    candidate = 'https://' + candidate;
  }

  try {
    const parsed = new URL(candidate);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') {
      return parsed.href;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Sanitize rich HTML to prevent Cross-Site Scripting (XSS)
 * Strips script tags, unsafe iframe/objects, and inline on* event attributes.
 * @param {string} dirtyHtml
 * @returns {string}
 */
export function sanitizeHtml(dirtyHtml) {
  if (!dirtyHtml || typeof dirtyHtml !== 'string') return '';

  // Remove dangerous tags and their content
  let clean = dirtyHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<applet\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*>/gi, '');

  // Strip all inline event handlers (e.g. onload, onerror, onclick)
  clean = clean.replace(/\s+on[a-zA-Z]+\s*=\s*(['"]).*?\1/gi, '');
  clean = clean.replace(/\s+on[a-zA-Z]+\s*=\s*[^ >]+/gi, '');

  // Neutralize javascript: pseudo-protocol in attributes
  clean = clean.replace(/href\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, 'href="#"');
  clean = clean.replace(/src\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, 'src=""');

  return clean;
}

/**
 * Safely parse JSON without throwing exceptions
 * @param {string} jsonStr
 * @param {*} fallback
 * @returns {*}
 */
export function safeJsonParse(jsonStr, fallback = null) {
  if (!jsonStr || typeof jsonStr !== 'string') return fallback;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return fallback;
  }
}

/**
 * Generate a consistent color from a string
 * @param {string} str
 * @returns {string} HSL color
 */
export function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${hash % 360}, 65%, 55%)`;
}

/**
 * Compute the effective pipeline status of a content item.
 * For social content, if an item is still marked as 'draft' but assets or text media have been uploaded,
 * its effective workflow status is 'pending' (In Review for Admin approval).
 * @param {object} item
 * @param {boolean} isWritten
 * @returns {string}
 */
export function getEffectiveStatus(item, isWritten = false) {
  if (!item) return 'draft';
  const status = item.status || 'draft';
  if (isWritten) return status;

  const fileCount = (item.assets?.length || 0) + (item.pdfAsset ? 1 : 0);
  const hasMedia = fileCount > 0 || !!item.thumbnailAsset || (item.type === 'text' && !!item.richText?.trim() && item.richText !== '<p><br></p>');

  if (status === 'draft' && hasMedia) {
    return 'pending';
  }
  return status;
}

