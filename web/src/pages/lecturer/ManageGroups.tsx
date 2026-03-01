// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { collection, onSnapshot, addDoc, doc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
// PageHeader intentionally removed per user preference

export default function ManageGroups() {
  const user = auth.currentUser;
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const [offerings, setOfferings] = useState<any[]>([]);
  const [selectedOffering, setSelectedOffering] = useState<string | null>(params.get('offeringId') || null);
  const [groups, setGroups] = useState<any[]>([]);
  const [label, setLabel] = useState('A');
  const [yearLevel, setYearLevel] = useState('1');
  const [lectureType, setLectureType] = useState('Lecture');

  useEffect(() => {
    if (!user) return;
    const ref = collection(db, 'offerings');
    return onSnapshot(ref, (snap) => {
      const items: any[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
      setOfferings(items);
      if (!selectedOffering && items.length) setSelectedOffering(items[0].id);
      const paramOffering = params.get('offeringId');
      if (paramOffering) {
        const found = items.find((it: any) => it.id === paramOffering);
        if (found) setSelectedOffering(paramOffering);
      }
    });
  }, [user, selectedOffering]);

  useEffect(() => {
    if (!selectedOffering) return setGroups([]);
    const ref = collection(db, 'groups');
    return onSnapshot(ref, (snap) => {
      const items: any[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.offeringId === selectedOffering) items.push({ id: d.id, ...data });
      });
      setGroups(items);
    });
  }, [selectedOffering]);

  async function createGroup() {
    if (!selectedOffering) return;
    await addDoc(collection(db, 'groups'), { offeringId: selectedOffering, label: label.trim(), yearLevel: Number(yearLevel), lectureType: lectureType || null });
    setLabel('');
    setLectureType('Lecture');
  }

  async function removeGroup(id: string) {
    if (!confirm('Delete group?')) return;
    await deleteDoc(doc(db, 'groups', id));
  }

  return (
    <div className="space-y-6">

      <div className="rounded-2xl border p-6 bg-surface">
        <div className="grid gap-3 sm:grid-cols-4">
          <select value={selectedOffering ?? ''} onChange={(e) => setSelectedOffering(e.target.value || null)} className="p-2 border rounded">
            {offerings.map((o) => <option key={o.id} value={o.id}>{o.academicYear || o.id} {o.term ? `• ${o.term}` : ''}</option>)}
          </select>
          <input className="p-2 border rounded" placeholder="Label (A)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <select className="p-2 border rounded" value={yearLevel} onChange={(e) => setYearLevel(e.target.value)}>
            <option value="1">Year 1</option>
            <option value="2">Year 2</option>
            <option value="3">Year 3</option>
            <option value="4">Year 4</option>
            <option value="PG">Postgraduate</option>
          </select>
          <select className="p-2 border rounded" value={lectureType} onChange={(e) => setLectureType(e.target.value)}>
            <option value="Lecture">Lecture</option>
            <option value="Tutorial">Tutorial</option>
            <option value="Practical">Practical</option>
            <option value="Other">Other</option>
          </select>
          <div />
        </div>
        <div className="mt-3">
          <button className="btn" onClick={createGroup}>Create group</button>
        </div>
      </div>

      <div className="rounded-2xl border p-6 bg-white">
        {groups.map((g) => (
          <div key={g.id} className="flex items-center justify-between py-2">
            <div>{g.label} · {g.lectureType ? `${g.lectureType} ·` : ''} Year {g.yearLevel}</div>
            <div>
              <button className="mr-2" onClick={() => navigator.clipboard.writeText(g.id)}>Copy ID</button>
              <button onClick={() => removeGroup(g.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
