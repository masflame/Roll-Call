// @ts-nocheck
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import Layout from "../../components/ui/Layout";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";

interface SessionConfig {
  moduleCode: string;
  title?: string;
  requiredFields: Record<string, boolean>;
  settings?: {
    requireClassCode?: boolean;
  };
  expiresAt?: any;
  isActive: boolean;
}

// Prefer environment override; fallback to known Cloud Functions URL so deployments
// without the env var still submit correctly.
const submitUrl = import.meta.env.VITE_SUBMIT_ATTENDANCE_URL || "https://us-central1-roll-call-14e2f.cloudfunctions.net/submitAttendance";

function ScanForm() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionConfig | null>(null);
  const [privateSession, setPrivateSession] = useState<{
    token?: string | null;
    qrExpiresAt?: Date | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({ studentNumber: "" });
  const [token, setToken] = useState<string>(() => searchParams.get("t") || "");
  const { showToast } = useToast();

  useEffect(() => {
    if (!sessionId) return;
    const ref = doc(db, "sessions", sessionId);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const data = snapshot.data();
      if (!data) {
        setError("Session not found");
        return;
      }
      setSession({
        moduleCode: data.moduleCode,
        title: data.title,
        requiredFields: data.requiredFields || {},
        settings: data.settings,
        expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate() : data.expiresAt || null,
        isActive: data.isActive
      });
    });
    return () => unsubscribe();
  }, [sessionId]);

  // Listen to private session data to validate QR token expiry
  useEffect(() => {
    if (!sessionId) return;
    const ref = doc(db, "sessionsPrivate", sessionId);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const data = snapshot.data();
      if (!data) {
        setPrivateSession(null);
        return;
      }
      setPrivateSession({
        token: data.qrTokenPlain || null,
        qrExpiresAt: data.qrExpiresAt?.toDate ? data.qrExpiresAt.toDate() : data.qrExpiresAt || null,
      });
    });
    return () => unsubscribe();
  }, [sessionId]);

  useEffect(() => {
    const value = searchParams.get("t") || "";
    setToken(value);
  }, [searchParams]);

  const requiredFields = useMemo(() => session?.requiredFields || {}, [session]);
  const classCodeRequired = Boolean(session?.settings?.requireClassCode);

  const handleChange = (key: string, value: string) => {
    setFormValues((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!sessionId || !submitUrl) {
      setError("Submission service not configured");
      return;
    }
    if (!token) {
      setError("QR token missing. Please rescan the code.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const payload: Record<string, string> = {
        sessionId,
        studentNumber: formValues.studentNumber || "",
        token
      };

      ["name", "surname", "initials", "email", "group"].forEach((key) => {
        if (requiredFields[key] && formValues[key]) {
          payload[key] = formValues[key];
        }
      });

      if (classCodeRequired) {
        payload.classCode = formValues.classCode || "";
      }

      const response = await fetch(submitUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: "Submission failed" }));
        throw new Error(errBody.error || "Submission failed");
      }

      showToast({ message: "Attendance recorded", variant: "success" });
      navigate(`/s/${sessionId}/success`, {
        state: {
          moduleCode: session?.moduleCode,
          title: session?.title
        }
      });
    } catch (err: any) {
      setError(err.message || "Submission failed");
      showToast({ message: err.message || "Submission failed", variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return (
      <Layout>
        <div className="flex min-h-[280px] items-center justify-center px-4 text-text-muted">
          <span>Loading session...</span>
        </div>
      </Layout>
    );
  }

  const now = Date.now();

  // If lecturer has closed the session or the session's expiry has passed, show closed message
  if (!session.isActive || (session.expiresAt && (new Date(session.expiresAt)).getTime() <= now)) {
    return (
      <Layout>
        <div className="flex min-h-[280px] items-center justify-center px-6 text-center text-text-primary">
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold">Session closed</h1>
            <p className="text-sm text-text-muted">This attendance session is no longer accepting submissions.</p>
          </div>
        </div>
      </Layout>
    );
  }

  // If the QR token in the URL is missing, ask to rescan
  if (!token) {
    return (
      <Layout>
        <div className="flex min-h-[280px] items-center justify-center px-6 text-center text-text-primary">
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold">Rescan required</h1>
            <p className="text-sm text-text-muted">The QR link is incomplete. Please scan the current code again.</p>
          </div>
        </div>
      </Layout>
    );
  }

  // If there is private session data and the QR has expired, show QR expired message
  if (privateSession?.qrExpiresAt && privateSession.qrExpiresAt.getTime() <= now) {
    return (
      <Layout>
        <div className="flex min-h-[280px] items-center justify-center px-6 text-center text-text-primary">
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold">QR expired</h1>
            <p className="text-sm text-text-muted">This QR code has expired. Please refresh the QR code and try again.</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen px-4 py-10 text-text-primary">
        <div className="mx-auto w-full max-w-md space-y-6">
        <div className="text-center">
          <span className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-primary">RollCall</span>
          <h1 className="mt-3 text-2xl font-semibold">{session.moduleCode}</h1>
          {session.title && <p className="text-sm text-text-muted">{session.title}</p>}
        </div>
        <div className="rounded-md border border-stroke-subtle bg-surface p-6 shadow-subtle">
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-muted">Student number</label>
            <input
              className="w-full rounded-md border border-stroke-subtle px-4 py-3 text-base sm:text-sm focus:border-brand-primary focus:outline-none"
              value={formValues.studentNumber || ""}
              onChange={(event) => handleChange("studentNumber", event.target.value)}
              required
            />
          </div>
          {Object.entries(requiredFields)
            .filter(([key, enabled]) => key !== "studentNumber" && enabled)
            .map(([key]) => (
              <div key={key}>
                <label className="mb-1 block text-sm font-medium text-text-muted capitalize">{key}</label>
                <input
                  className="w-full rounded-md border border-stroke-subtle px-4 py-3 text-base sm:text-sm focus:border-brand-primary focus:outline-none"
                  value={formValues[key] || ""}
                  onChange={(event) => handleChange(key, event.target.value)}
                  required
                />
              </div>
            ))}
          {classCodeRequired && (
            <div>
              <label className="mb-1 block text-sm font-medium text-text-muted">In-class code</label>
              <input
                className="w-full rounded-md border border-stroke-subtle px-4 py-3 text-base sm:text-sm focus:border-brand-primary focus:outline-none"
                value={formValues.classCode || ""}
                onChange={(event) => handleChange("classCode", event.target.value)}
                maxLength={4}
                required
              />
            </div>
          )}
          {error && (
            <div className="rounded-md border border-accent-error/30 bg-accent-error/5 px-3 py-2 text-sm text-accent-error">
              <strong className="block font-semibold">Submission error</strong>
              <div className="mt-1">
                {error.includes("Invalid class code") || error.includes("Invalid class code")
                  ? "The code you entered is incorrect or expired. Ask your lecturer for the current code and try again."
                  : error}
              </div>
            </div>
          )}
          <button
            type="submit"
            className="w-full rounded-lg bg-brand-primary px-4 py-3 text-base font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:bg-stroke-strong"
            disabled={loading}
          >
            {loading ? "Submitting..." : "Submit attendance"}
          </button>
        </form>
      </div>
      </div>
    </div>
    </Layout>
    );
}

export default ScanForm;
