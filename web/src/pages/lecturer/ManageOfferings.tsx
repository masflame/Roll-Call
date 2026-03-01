// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
// no page header per user preference
import { collection, onSnapshot, addDoc, doc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { PrimaryButton, Input } from '../../components/ui';

export default function ManageOfferings() {
  const user = auth.currentUser;
  const [modules, setModules] = useState<any[]>([]);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const [selectedModule, setSelectedModule] = useState<string | null>(params.get('moduleId') || null);
  const [offerings, setOfferings] = useState<any[]>([]);
  const [year, setYear] = useState('2026');
  const [term, setTerm] = useState('Semester 1');
  const [programme, setProgramme] = useState('');
  const [yearLevel, setYearLevel] = useState('1');
  const navigate = useNavigate();
  const programmeOptions = ['IT','CS','Business','Engineering','Other'];

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
      if (!selectedModule && items.length) setSelectedModule(items[0].id);
      // if a moduleId param was provided but not present in items, keep param value
      const paramModule = params.get('moduleId');
      if (paramModule) {
        const found = items.find((it: any) => it.id === paramModule);
        if (found) setSelectedModule(paramModule);
      }
    });
  }, [user, selectedModule]);

  useEffect(() => {
    if (!selectedModule) return setOfferings([]);
    const ref = collection(db, 'offerings');
    return onSnapshot(ref, (snap) => {
      const items: any[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.moduleId === selectedModule) items.push({ id: d.id, ...data });
      });
      setOfferings(items);
    });
  }, [selectedModule]);

  async function createOffering() {
    if (!selectedModule) return;
    await addDoc(collection(db, 'offerings'), { moduleId: selectedModule, academicYear: year, term, programme, yearLevel });
    setProgramme('');
  }

  async function removeOffering(id: string) {
    if (!confirm('Delete offering?')) return;
    await deleteDoc(doc(db, 'offerings', id));
  }

  return (
    <div className="space-y-6">
      {/* PageHeader removed per user preference */}

      <div className="rounded-2xl border border-stroke-subtle bg-surface p-6 shadow-subtle">
        {/* header removed per user preference */}
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-text-muted">Module</label>
            <select value={selectedModule ?? ''} onChange={(e) => setSelectedModule(e.target.value || null)} className="p-2 border rounded bg-white text-text-primary placeholder:text-text-muted w-full">
              {modules.map((m) => <option key={m.id} value={m.id}>{m.moduleCode} {m.moduleName ? `— ${m.moduleName}` : ''}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-text-muted">Academic year</label>
            <input className="p-2 border rounded bg-white text-text-primary placeholder:text-text-muted w-full" placeholder="Academic year" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-text-muted">Term</label>
            <input className="p-2 border rounded bg-white text-text-primary placeholder:text-text-muted w-full" placeholder="Term" value={term} onChange={(e) => setTerm(e.target.value)} />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-text-muted">Year level</label>
            <select className="p-2 border rounded bg-white text-text-primary w-full" value={yearLevel} onChange={(e) => setYearLevel(e.target.value)}>
              <option value="1">Year 1</option>
              <option value="2">Year 2</option>
              <option value="3">Year 3</option>
              <option value="4">Year 4</option>
              <option value="PG">Postgraduate</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-text-muted">Programme (optional)</label>
            <select className="p-2 border rounded bg-white text-text-primary placeholder:text-text-muted w-full" value={programme} onChange={(e) => setProgramme(e.target.value)}>
              <option value="">(none)</option>
              {programmeOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <PrimaryButton onClick={createOffering}>Create offering</PrimaryButton>
        </div>
      </div>

      <div className="rounded-2xl border p-6 bg-white">
        {offerings.map((o) => (
          <div key={o.id} className="flex items-center justify-between py-2">
            <div>{o.academicYear} · {o.term} {o.programme ? `· ${o.programme}` : ''} · {o.yearLevel ? `Year ${o.yearLevel}` : ''}</div>
            <div className="flex items-center gap-2">
              <PrimaryButton onClick={() => navigator.clipboard.writeText(o.id)} className="!px-3 !py-2 !text-sm">Copy ID</PrimaryButton>
              <PrimaryButton onClick={() => navigate(`/groups/manage?offeringId=${o.id}`)} className="!px-3 !py-2 !text-sm">Manage groups</PrimaryButton>
              <PrimaryButton onClick={() => removeOffering(o.id)} className="!px-3 !py-2 !text-sm">Delete</PrimaryButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
