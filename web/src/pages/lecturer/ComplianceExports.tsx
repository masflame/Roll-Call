// @ts-nocheck
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";
import { useToast } from "../../components/ToastProvider";
import { db } from "../../firebase";
import { collection, getDocs } from "firebase/firestore";
import { Card, PrimaryButton, Input } from "../../components/ui";

export default function ComplianceExports() {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const navigate = useNavigate();
  const [modules, setModules] = useState<Array<{ id: string; moduleCode?: string; title?: string }>>([]);
  // `allOfferings` keeps raw offering objects (with moduleId); `offerings` is the filtered list shown in the UI
  const [allOfferings, setAllOfferings] = useState<Array<any>>([]);
  const [offerings, setOfferings] = useState<Array<{ id: string; moduleId?: string; label?: string }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; label?: string }>>([]);
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [selectedOffering, setSelectedOffering] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const handleGenerate = async () => {
    setBusy(true);
    try {
      // basic client-side validation for date range
      if (startDate && endDate) {
        const s = new Date(startDate);
        const e = new Date(endDate);
        if (e < s) {
          showToast({ message: "End date must be after start date", variant: "error" });
          setBusy(false);
          return;
        }
      }
      const callable = httpsCallable(functions, "generateExportBundle");
      // pass optional date range and filters to the callable
      const args: any = {};
      if (startDate) args.startDate = new Date(startDate).toISOString();
      if (endDate) args.endDate = new Date(endDate).toISOString();
      if (selectedModuleIds && selectedModuleIds.length) args.moduleIds = selectedModuleIds;
      if (selectedOffering) args.offeringId = selectedOffering;
      if (selectedGroup) args.groupId = selectedGroup;

      const res: any = await callable(args);

      // if server returned a single zip, download that
      const zipInfo = res.data?.zip || res.zip;
      if (zipInfo && zipInfo.contentBase64) {
        const bin = Uint8Array.from(atob(zipInfo.contentBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bin], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = zipInfo.name || `rollcall_export.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast({ message: "Export bundle downloaded", variant: "success" });
      } else {
        const files = res.data?.files || res.files || [];
        if (!files.length) {
          showToast({ message: "No files returned", variant: "error" });
          setBusy(false);
          return;
        }

        for (const f of files) {
          const blob = Uint8Array.from(atob(f.contentBase64), (c) => c.charCodeAt(0));
          const blobObj = new Blob([blob]);
          const url = URL.createObjectURL(blobObj);
          const a = document.createElement("a");
          a.href = url;
          a.download = f.name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        }
        showToast({ message: "Export bundle downloaded", variant: "success" });
      }
    } catch (err: any) {
      console.error(err);
      showToast({ message: err?.message || "Export failed", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const mods: any[] = [];
        const mSnap = await getDocs(collection(db, "modules"));
        mSnap.forEach((d) => mods.push({ id: d.id, ...(d.data() as any) }));
        if (!mounted) return;
        setModules(mods.map((m) => ({ id: m.id, moduleCode: m.moduleCode || m.id, title: m.title || "" })));

        const offs: any[] = [];
        const oSnap = await getDocs(collection(db, "offerings"));
        oSnap.forEach((d) => offs.push({ id: d.id, ...(d.data() as any) }));
        if (!mounted) return;
        // preserve moduleId so we can filter offerings by selected module(s)
        const mapped = offs.map((o) => {
          const parts = [] as string[];
          if (o.academicYear) parts.push(String(o.academicYear));
          if (o.term) parts.push(String(o.term));
          if (o.programme) parts.push(String(o.programme));
          if (o.yearLevel) parts.push(String(o.yearLevel));
          if (o.classLabel) parts.push(String(o.classLabel));
          if (o.class) parts.push(String(o.class));
          if (o.year) parts.push(String(o.year));
          if (o.grade) parts.push(String(o.grade));
          if (o.label) parts.push(String(o.label));
          if (o.name) parts.push(String(o.name));
          const label = parts.length ? parts.join(" ") : o.id;
          return { id: o.id, moduleId: o.moduleId || null, label };
        });
        setAllOfferings(offs);
        setOfferings(mapped);

        const grs: any[] = [];
        const gSnap = await getDocs(collection(db, "groups"));
        gSnap.forEach((d) => grs.push({ id: d.id, ...(d.data() as any) }));
        if (!mounted) return;
        setGroups(
          grs.map((g) => {
            const label = g.label || g.name || g.groupLabel || g.code || g.id;
            return { id: g.id, label };
          })
        );
      } catch (e) {
        console.error("Failed to load filters", e);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  // when user selects modules, show only offerings for those modules (or all if none selected)
  useEffect(() => {
    if (!allOfferings || allOfferings.length === 0) return;
    if (!selectedModuleIds || selectedModuleIds.length === 0) {
      // show all offerings
      const mapped = allOfferings.map((o) => {
        const parts: string[] = [];
        if (o.academicYear) parts.push(String(o.academicYear));
        if (o.term) parts.push(String(o.term));
        if (o.programme) parts.push(String(o.programme));
        if (o.yearLevel) parts.push(String(o.yearLevel));
        if (o.classLabel) parts.push(String(o.classLabel));
        if (o.class) parts.push(String(o.class));
        if (o.year) parts.push(String(o.year));
        if (o.grade) parts.push(String(o.grade));
        if (o.label) parts.push(String(o.label));
        if (o.name) parts.push(String(o.name));
        const label = parts.length ? parts.join(" ") : o.id;
        return { id: o.id, moduleId: o.moduleId || null, label };
      });
      setOfferings(mapped);
      return;
    }
    const filtered = allOfferings.filter((o) => selectedModuleIds.includes(String(o.moduleId)));
    const mapped = filtered.map((o) => {
      const parts: string[] = [];
      if (o.academicYear) parts.push(String(o.academicYear));
      if (o.term) parts.push(String(o.term));
      if (o.programme) parts.push(String(o.programme));
      if (o.yearLevel) parts.push(String(o.yearLevel));
      if (o.classLabel) parts.push(String(o.classLabel));
      if (o.class) parts.push(String(o.class));
      if (o.year) parts.push(String(o.year));
      if (o.grade) parts.push(String(o.grade));
      if (o.label) parts.push(String(o.label));
      if (o.name) parts.push(String(o.name));
      const label = parts.length ? parts.join(" ") : o.id;
      return { id: o.id, moduleId: o.moduleId || null, label };
    });
    setOfferings(mapped);
  }, [selectedModuleIds, allOfferings]);

  return (
    <div className="rounded-2xl border border-stroke-subtle bg-surface p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate("/settings")}
            className="rounded-md p-2 hover:bg-surface-muted"
            aria-label="Back to settings"
          >
            ←
          </button>
          <h3 className="text-lg font-semibold">Compliance & Exports</h3>
        </div>
      </div>
      <p className="mt-2 text-sm text-text-muted">Generate audit and accreditation export bundles.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className="block text-xs font-medium text-text-muted">Modules</label>
          <select
            multiple
            value={selectedModuleIds}
            onChange={(e) => setSelectedModuleIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
            className="mt-1 w-full rounded-md border px-2 py-1"
          >
            {modules.map((m) => (
              <option key={m.id} value={m.id}>{m.moduleCode} {m.title ? `— ${m.title}` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted">Offering (class/year)</label>
          <select value={selectedOffering || ''} onChange={(e) => setSelectedOffering(e.target.value || null)} className="mt-1 w-full rounded-md border px-2 py-1">
            <option value="">All</option>
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted">Group</label>
          <select value={selectedGroup || ''} onChange={(e) => setSelectedGroup(e.target.value || null)} className="mt-1 w-full rounded-md border px-2 py-1">
            <option value="">All</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted">Date range</label>
          <div className="flex gap-2">
            <input type="date" value={startDate || ""} onChange={(e) => setStartDate(e.target.value || null)} className="mt-1 w-1/2 rounded-md border px-2 py-1" />
            <input type="date" value={endDate || ""} onChange={(e) => setEndDate(e.target.value || null)} className="mt-1 w-1/2 rounded-md border px-2 py-1" />
          </div>
            <div className="mt-2 flex items-end">
            <PrimaryButton onClick={handleGenerate} disabled={busy}>{busy ? "Generating…" : "Generate Audit Bundle"}</PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
