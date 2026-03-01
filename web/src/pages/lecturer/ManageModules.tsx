// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
// PageHeader intentionally removed per user preference

export default function ManageModules() {
  const user = auth.currentUser;
  const [modules, setModules] = useState<any[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    if (!user) return;
    const ref = collection(db, 'modules');
    return onSnapshot(ref, (snap) => {
      const items: any[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.lecturerId === user.uid) items.push({ id: d.id, ...data });
      });
      setModules(items);
    });
  }, [user]);

  async function createModule() {
    if (!code) return;
    await addDoc(collection(db, 'modules'), { moduleCode: code.trim(), moduleName: name.trim(), lecturerId: user.uid });
    setCode(''); setName('');
  }

  async function removeModule(id: string) {
    if (!confirm('Delete module?')) return;
    await deleteDoc(doc(db, 'modules', id));
  }

  return (
    <div className="space-y-6">

      <div className="rounded-2xl border p-6 bg-surface">
        <div className="grid gap-3 sm:grid-cols-3">
          <input className="p-2 border rounded" placeholder="Code (e.g. INF101)" value={code} onChange={(e) => setCode(e.target.value)} />
          <input className="p-2 border rounded" placeholder="Title" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" onClick={createModule}>Add Module</button>
        </div>
      </div>

      <div className="rounded-2xl border p-6 bg-white">
        {modules.map((m) => (
          <div key={m.id} className="flex items-center justify-between py-2">
            <div>{m.moduleCode} {m.moduleName ? `— ${m.moduleName}` : ''}</div>
            <div>
              <button className="mr-2" onClick={() => navigator.clipboard.writeText(m.id)}>Copy ID</button>
              <button onClick={() => removeModule(m.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
