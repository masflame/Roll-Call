import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query as qFn, where as whereFn, orderBy, limit as limitFn } from 'firebase/firestore';
import { db } from '../../firebase';

export async function fetchSessions({ lecturerId, moduleId, offeringId, groupId, limit }: { lecturerId?: string; moduleId?: string; offeringId?: string; groupId?: string; limit?: number }) {
  const sessionsRef = collection(db, 'sessions');
  const clauses: any[] = [];
  if (lecturerId) clauses.push(whereFn('lecturerId', '==', lecturerId));
  if (moduleId) clauses.push(whereFn('moduleId', '==', moduleId));
  if (offeringId) clauses.push(whereFn('offeringId', '==', offeringId));
  if (groupId) clauses.push(whereFn('groupId', '==', groupId));
  clauses.push(orderBy('createdAt', 'desc'));
  if (limit) clauses.push(limitFn(limit));
  const q = qFn(sessionsRef, ...clauses);
  const snap = await getDocs(q);
  const out: any[] = [];
  snap.forEach((d) => out.push({ id: d.id, ...(d.data() as any) }));
  return out;
}

export function useSessions(params: { lecturerId?: string; moduleId?: string; offeringId?: string; groupId?: string; limit?: number }) {
  return useQuery(['sessions', params], () => fetchSessions(params), {
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
    enabled: !!params.lecturerId || !!params.moduleId,
  });
}
