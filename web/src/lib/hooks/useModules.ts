import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query as qFn } from 'firebase/firestore';
import { db } from '../../firebase';
import { getDoc, doc } from 'firebase/firestore';
import { loadPersisted, savePersisted } from '../localPersist';

const PERSIST_KEY = 'q:modules';
const PERSIST_TTL = 15 * 60 * 1000; // 15 minutes

async function fetchModules(uid: string) {
  const modulesRef = collection(db, 'modules');
  const snap = await getDocs(qFn(modulesRef));
  const items: any[] = [];
  const statsPromises: Promise<void>[] = [];

  snap.forEach((d) => {
    const m = { id: d.id, ...(d.data() as any) };
    // fetch moduleStats
    const p = getDoc(doc(db, 'moduleStats', d.id)).then((s) => {
      if (s.exists()) {
        const data = s.data();
        items.push({ id: d.id, ...data, moduleCode: data.moduleCode || m.moduleCode || m.moduleId || m.id, moduleTitle: data.moduleTitle || m.moduleTitle || m.moduleName || null });
      } else {
        items.push(m);
      }
    }).catch(() => items.push(m));
    statsPromises.push(p as Promise<void>);
  });

  await Promise.all(statsPromises);

  items.sort((a, b) => {
    const as = Number(a.sessionsCount || 0);
    const bs = Number(b.sessionsCount || 0);
    if (bs !== as) return bs - as;
    const an = String(a.moduleCode || a.moduleTitle || a.moduleId || a.id || '');
    const bn = String(b.moduleCode || b.moduleTitle || b.moduleId || b.id || '');
    return an.localeCompare(bn);
  });

  return items;
}

export function useModules(uid?: string) {
  return useQuery(['modules', uid], async () => {
    // try persisted
    const persisted = loadPersisted<any[]>(PERSIST_KEY, PERSIST_TTL);
    if (persisted && persisted.length) return persisted;
    const res = await fetchModules(uid || '');
    try { savePersisted(PERSIST_KEY, res); } catch {}
    return res;
  }, {
    staleTime: 10 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
    enabled: !!uid,
  });
}
