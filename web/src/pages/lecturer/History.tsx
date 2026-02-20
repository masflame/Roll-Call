// @ts-nocheck
import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Link } from "react-router-dom";
import { auth, db } from "../../firebase";
import PageHeader from "../../components/PageHeader";

interface SessionSummary {
  id: string;
  moduleCode: string;
  title?: string;
  createdAt?: string;
  stats?: {
    submissionsCount?: number;
  };
  isActive: boolean;
}

function History() {
  const user = auth.currentUser;
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    if (!user) return;
    const sessionsRef = collection(db, "sessions");
    const q = query(sessionsRef, where("lecturerId", "==", user.uid), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => {
        const docData = docSnap.data();
        return {
          id: docSnap.id,
          moduleCode: docData.moduleCode,
          title: docData.title,
          createdAt: docData.createdAt?.toDate ? docData.createdAt.toDate().toISOString() : "",
          stats: docData.stats,
          isActive: docData.isActive
        };
      });
      setSessions(data);
    });
    return () => unsubscribe();
  }, [user]);

  return (
    <div className="space-y-8">
      <PageHeader title="Attendance history" description="Review completed sessions and export records." showBack={false} />
      <section className="rounded-md border border-stroke-subtle bg-surface shadow-subtle">
        <ul className="divide-y divide-stroke-subtle">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  {session.moduleCode}{session.title ? ` • ${session.title}` : ""}
                </p>
                <p className="text-xs text-text-muted">{session.createdAt || "--"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-md border border-stroke-subtle px-3 py-1 text-xs text-text-muted">
                  {session.stats?.submissionsCount ?? 0} submissions
                </span>
                <span className={`rounded-md px-3 py-1 text-xs font-medium ${session.isActive ? "bg-accent-success/10 text-accent-success" : "bg-surfaceAlt text-text-muted"}`}>
                  {session.isActive ? "Active" : "Closed"}
                </span>
                <Link
                  to={`/history/${session.id}`}
                  className="text-sm font-semibold text-brand-primary hover:underline"
                >
                  View / Export
                </Link>
              </div>
            </li>
          ))}
          {sessions.length === 0 && (
            <li className="px-6 py-10 text-center text-sm text-text-muted">No sessions recorded yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

export default History;
