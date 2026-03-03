import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query as qFn, where as whereFn } from 'firebase/firestore';
import { db } from '../../firebase';
import { loadPersisted, savePersisted } from '../localPersist';

const PERSIST_KEY = 'q:offerings';
const PERSIST_TTL = 15 * 60 * 1000; // 15 minutes

async function fetchAllOfferings() {
  const snap = await getDocs(collection(db, 'offerings'));
  const items: any[] = [];
  snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
  return items;
}

export function useOfferings(moduleId?: string | null) {
  return useQuery(['offerings', moduleId || 'all'], async () => {
    // try persisted
    const persisted = loadPersisted<any[]>(PERSIST_KEY, PERSIST_TTL);
    let all = persisted;
    if (!all) {
      all = await fetchAllOfferings();
      try { savePersisted(PERSIST_KEY, all); } catch {}
    }
    if (!moduleId) return all;
    return all.filter((o) => String(o.moduleId) === String(moduleId));
  }, {
    staleTime: 15 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
  });
}
