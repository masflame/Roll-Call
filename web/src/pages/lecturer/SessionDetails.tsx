// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, doc, onSnapshot } from "firebase/firestore";
import AttendanceTable, { AttendanceRow } from "../../components/AttendanceTable";
import ExportButtons from "../../components/ExportButtons";
import { db } from "../../firebase";
import PageHeader from "../../components/PageHeader";

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
      <PageHeader
        title="Session details"
        description={headerDescription}
        action={<ExportButtons sessionId={sessionId || ""} />}
        noBackground
      />

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
        <AttendanceTable data={attendance} globalFilter={filter} onGlobalFilterChange={setFilter} />
      </section>
    </div>
  );
}

export default SessionDetails;
