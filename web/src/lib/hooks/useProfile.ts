import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { loadPersisted, savePersisted } from '../localPersist';

const PERSIST_PREFIX = 'profile:';
const PERSIST_TTL = 6 * 60 * 60 * 1000; // 6 hours

async function fetchProfile(uid: string) {
  const ref = doc(db, 'lecturers', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data() as any;
    return {
      ...data,
      email: data.email || undefined,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : undefined,
    };
  }
  return null;
}

export function useProfile(uid?: string | null) {
  return useQuery(['profile', uid], async () => {
    if (!uid) return null;
    const persisted = loadPersisted<any>(PERSIST_PREFIX + uid, PERSIST_TTL);
    if (persisted) return persisted;
    const p = await fetchProfile(uid);
    if (p) savePersisted(PERSIST_PREFIX + uid, p);
    return p;
  }, {
    staleTime: 6 * 60 * 60 * 1000,
    cacheTime: 12 * 60 * 60 * 1000,
    enabled: !!uid,
  });
}
