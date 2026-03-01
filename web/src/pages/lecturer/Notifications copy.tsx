// @ts-nocheck
import { useEffect, useState } from "react";
import Layout from "../../components/ui/Layout";
import { auth, db } from "../../firebase";
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, serverTimestamp } from "firebase/firestore";

export default function Notifications() {
  const user = auth.currentUser;
  const [notes, setNotes] = useState([] as any[]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const notRef = collection(db, 'notifications');
    const q = query(notRef, where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const arr: any[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setNotes(arr);
      setLoading(false);
    }, (err) => {
      console.error('notifications listener error', err);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const markRead = async (n: any) => {
    if (n.read) return;
    try {
      await updateDoc(doc(db, 'notifications', n.id), { read: true, readAt: serverTimestamp() });
    } catch (e) { console.error('mark read failed', e); }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">Notifications</h1>
        <div className="space-y-3">
          {loading && <div className="text-sm text-text-muted">Loading…</div>}
          {!loading && notes.length === 0 && <div className="text-sm text-text-muted">No notifications</div>}
          {notes.map((n) => (
            <div key={n.id} className={`rounded-lg border p-4 ${n.read ? 'bg-white' : 'bg-blue-50 border-blue-200'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-semibold text-gray-600">{n.sender || 'system'}</div>
                    {!n.read && <div className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">UNREAD</div>}
                  </div>
                  <div className="mt-2 text-sm text-gray-800">{n.message}</div>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>{n.createdAt?.toDate ? new Date(n.createdAt.toDate()).toLocaleString() : (n.createdAt ? new Date(n.createdAt).toLocaleString() : '')}</div>
                  <div className="mt-2">
                    {!n.read && <button className="rounded bg-brand-primary text-white px-3 py-1 text-xs" onClick={() => markRead(n)}>Mark read</button>}
                  </div>
                </div>
              </div>
              {n.meta && (
                <div className="mt-3 text-xs text-gray-600">
                  <div>IP: {n.meta.ip || '—'}</div>
                  <div>Location: {([n.meta.city, n.meta.region, n.meta.country].filter(Boolean).join(', ')) || '—'}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
