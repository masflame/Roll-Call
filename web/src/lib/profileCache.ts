// Simple localStorage-backed profile cache with TTL
export interface LecturerProfileCached {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  department?: string;
  createdAt?: string;
}

const KEY_PREFIX = "lecturerProfile:";
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function getCachedProfile(uid: string, ttlMs = DEFAULT_TTL_MS): LecturerProfileCached | null {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(KEY_PREFIX + uid);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; profile: LecturerProfileCached };
    if (!parsed || typeof parsed.ts !== 'number' || !parsed.profile) return null;
    if (Date.now() - parsed.ts > ttlMs) {
      // stale
      try { localStorage.removeItem(KEY_PREFIX + uid); } catch {}
      return null;
    }
    return parsed.profile;
  } catch (err) {
    return null;
  }
}

export function setCachedProfile(uid: string, profile: LecturerProfileCached) {
  if (!uid) return;
  try {
    const payload = { ts: Date.now(), profile };
    localStorage.setItem(KEY_PREFIX + uid, JSON.stringify(payload));
  } catch (err) {
    // ignore quota errors
  }
}

export function clearCachedProfile(uid: string) {
  if (!uid) return;
  try { localStorage.removeItem(KEY_PREFIX + uid); } catch {}
}

export function setCacheTTLHours(hours: number) {
  // helper if consumers want to compute TTL differently; not persisted
  return Math.max(0, Math.round(hours * 60 * 60 * 1000));
}
