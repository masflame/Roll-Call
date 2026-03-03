// Small local persistence helper with TTL
export function loadPersisted<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: T };
    if (!parsed || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > ttlMs) {
      try { localStorage.removeItem(key); } catch {}
      return null;
    }
    return parsed.data;
  } catch (e) {
    return null;
  }
}

export function savePersisted<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {
    // ignore
  }
}

export function clearPersisted(key: string) {
  try { localStorage.removeItem(key); } catch {}
}
