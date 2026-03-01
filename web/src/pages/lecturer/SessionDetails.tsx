// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import AttendanceTable, { AttendanceRow } from "../../components/AttendanceTable";
import ExportButtons from "../../components/ExportButtons";
import { db } from "../../firebase";
// PageHeader removed from page; layout will provide heading

interface SessionData {
  moduleCode: string;
  title?: string;
  createdAt?: Date | null;
  stats?: {
    submissionsCount?: number;
  };
}

function SessionDetails() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<SessionData | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [flags, setFlags] = useState<any[]>([]);
  const [flagDetailsList, setFlagDetailsList] = useState<any[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!sessionId) return;
    const sessionRef = doc(db, "sessions", sessionId);
    const unsubscribe = onSnapshot(sessionRef, (snapshot) => {
      const data = snapshot.data();
      if (!data) return;
      setSession({
        moduleCode: data.moduleCode,
        title: data.title,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
        stats: data.stats
      });
    });
    return () => unsubscribe();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const attendanceRef = collection(db, "sessions", sessionId, "attendance");
    const unsubscribe = onSnapshot(attendanceRef, (snapshot) => {
      const rows: AttendanceRow[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          studentNumber: data.studentNumber,
          name: data.name,
          surname: data.surname,
          email: data.email,
          initials: data.initials,
          group: data.group,
          status: data.status || "Present",
          submittedAt: data.submittedAt?.toDate ? data.submittedAt.toDate().toISOString() : ""
        };
      });
      setAttendance(rows);
    });
    return () => unsubscribe();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const flagsRef = query(collection(db, "sessions", sessionId, "integrity"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(flagsRef, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setFlags(items);
    });
    return () => unsub();
  }, [sessionId]);

  // enrich flags with attendance audit (approxGeo) where possible
  useEffect(() => {
    if (!sessionId) return;
    if (!flags || !flags.length) {
      setFlagDetailsList([]);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const enriched = await Promise.all(flags.map(async (f) => {
          const student = f.studentNumber || f.student || "";
          let approxGeo = "";
          try {
            if (student) {
              const attRef = doc(db, "sessions", sessionId, "attendance", String(student));
              const attSnap = await attRef.get();
              const data = attSnap.exists ? (attSnap.data() as any) : null;
              approxGeo = data?.audit?.approxGeo || (data?.audit?.geo ? `${data.audit.geo.distanceMeters}m` : "");
            }
          } catch (e) {
            // ignore per-flag fetch failures
          }
          return Object.assign({ approxGeo }, f);
        }));
        if (mounted) setFlagDetailsList(enriched.filter(Boolean));
      } catch (e) {
        // ignore
      }
    })();

    return () => { mounted = false; };
  }, [flags, sessionId]);

  const uniqueCount = useMemo(() => new Set(attendance.map((row) => row.studentNumber)).size, [attendance]);
  const submissionCount = session?.stats?.submissionsCount ?? attendance.length;

  const headerDescription = session
    ? `${session.moduleCode}${session.title ? ` • ${session.title}` : ""}`
    : "Loading session...";

  const createdLabel = useMemo(() => {
    if (!session?.createdAt) return "--";
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(session.createdAt);
    } catch (error) {
      return session.createdAt.toISOString();
    }
  }, [session?.createdAt]);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-stroke-subtle bg-surface p-6 shadow-subtle">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-stroke-subtle bg-surfaceAlt p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Created</p>
            <p className="mt-2 text-sm font-semibold text-text-primary">{createdLabel}</p>
            <p className="mt-1 text-xs text-text-muted">Timestamp captured when the session opened.</p>
          </div>
          <div className="rounded-2xl border border-brand-soft bg-surfaceAlt p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-primary">Total submissions</p>
            <p className="mt-2 text-2xl font-semibold text-text-primary">{submissionCount}</p>
            <p className="mt-1 text-xs text-text-muted">Includes duplicates for auditing.</p>
          </div>
          <div className="rounded-2xl border border-accent-success/40 bg-accent-success/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-success">Unique students</p>
            <p className="mt-2 text-2xl font-semibold text-text-primary">{uniqueCount}</p>
            <p className="mt-1 text-xs text-text-muted">Deduplicated by student number.</p>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-stroke-subtle bg-surface p-6 shadow-subtle">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Attendance log</h2>
            <p className="text-sm text-text-muted">Review the records captured during this session.</p>
          </div>
          <input
            className="w-full rounded-full border border-stroke-subtle px-4 py-2 text-sm focus:border-brand-secondary focus:outline-none sm:w-72"
            placeholder="Search students"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        {flags.length > 0 && (
          <div className="mb-4 space-y-4">
            <div className="rounded-2xl border border-yellow-300 bg-yellow-50 p-4">
              <p className="text-sm font-semibold text-yellow-800">Flags (summary)</p>
              <ul className="mt-2 space-y-2 text-sm text-yellow-900">
                {flags.slice(0, 6).map((f) => (
                  <li key={f.id} className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">{f.type}</div>
                      <div className="text-xs text-text-muted">{f.reason ? `${f.reason}${f.count ? ` • ${f.count}` : ""}` : ""}</div>
                    </div>
                    <div className="text-xs text-text-muted">{f.createdAt?.toDate ? f.createdAt.toDate().toLocaleString() : ""}</div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-stroke-subtle bg-surfaceAlt p-4">
              <h3 className="text-sm font-semibold">Proxy & Geofence flags</h3>
              <p className="text-xs text-text-muted">Detailed list of proxy and geofence events with student and location where available.</p>
              <div className="mt-3 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-text-muted">
                      <th className="pb-2">Student</th>
                      <th className="pb-2">Type</th>
                      <th className="pb-2">Location</th>
                      <th className="pb-2">Evidence</th>
                      <th className="pb-2">Detected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flagDetailsList.filter((f) => f.type === "proxy" || f.type === "geo_mismatch").map((f) => (
                      <tr key={f.id} className="border-t border-stroke-subtle">
                        <td className="py-2">{f.studentNumber || f.student || "—"}</td>
                        <td className="py-2">{f.type}</td>
                        <td className="py-2">{f.approxGeo || (f.evidence && f.evidence.lat ? `${f.evidence.lat},${f.evidence.lng}` : "—")}</td>
                        <td className="py-2">{f.type === "geo_mismatch" ? (f.evidence ? `${f.evidence.distanceMeters}m from centre (radius ${f.evidence.radiusMeters}m)` : "") : (f.reason ? `${f.reason}${f.count ? ` • ${f.count}` : ""}` : "")}</td>
                        <td className="py-2">{f.createdAt?.toDate ? f.createdAt.toDate().toLocaleString() : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        <AttendanceTable data={attendance} globalFilter={filter} onGlobalFilterChange={setFilter} />
      </section>
    </div>
  );
}

export default SessionDetails;
