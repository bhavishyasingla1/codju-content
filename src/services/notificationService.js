// Notification and Settings API Client Service
const API_BASE = '/api';

export async function fetchSettings() {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch settings');
  }
  return res.json();
}

export async function saveSettings(settings) {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to save settings');
  }
  return res.json();
}

export async function sendNotification(payload) {
  const res = await fetch(`${API_BASE}/notifications/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to send notification');
  }
  return data;
}

export async function fetchNotificationHistory() {
  const res = await fetch(`${API_BASE}/notifications/history`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch notification history');
  }
  return res.json();
}

export async function triggerDailyUploadCheck() {
  const res = await fetch(`${API_BASE}/notifications/daily-check`, {
    method: 'POST',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to trigger daily upload check');
  }
  return data;
}
