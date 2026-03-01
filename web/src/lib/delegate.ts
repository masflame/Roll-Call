export type DelegateMode = {
  accessId: string;
  ownerUid: string | null;
  role: string | null;
  scope?: any;
  activatedAt: string;
};

const KEY = "rollcall_delegate";

export function setDelegateMode(payload: Partial<DelegateMode>) {
  const obj: DelegateMode = {
    accessId: String(payload.accessId || ""),
    ownerUid: payload.ownerUid || null,
    role: payload.role || null,
    scope: payload.scope,
    activatedAt: new Date().toISOString(),
  };
  try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {}
}

export function clearDelegateMode() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}

export function getDelegateMode(): DelegateMode | null {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    return JSON.parse(s) as DelegateMode;
  } catch (e) { return null; }
}

export function isDelegateActive() { return !!getDelegateMode(); }
