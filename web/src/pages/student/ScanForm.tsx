// @ts-nocheck
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import Layout from "../../components/ui/Layout";
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { db, auth } from "../../firebase";
import { signInAnonymously } from "firebase/auth";

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

  // Onboarding/profile states
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => !Boolean(localStorage.getItem("studentProfile")));
  const [onboardValues, setOnboardValues] = useState<Record<string, string>>({
    studentNumber: "",
    name: "",
    surname: "",
    initials: "",
    email: "",
    group: "",
  });

  useEffect(() => {
    // load local profile if present
    try {
      const raw = localStorage.getItem("studentProfile");
      if (raw) {
        const p = JSON.parse(raw);
        setFormValues((prev) => ({ ...prev, ...p }));
        setProfileLoaded(true);
        setShowOnboarding(false);
      }
    } catch (e) {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    // load Firestore-stored profile if user already has anonymous auth
    const u = auth.currentUser;
    if (u && (u as any).isAnonymous) {
      const ref = doc(db, "students", u.uid);
      getDoc(ref).then((snap) => {
        if (snap.exists()) {
          const data = snap.data() as any;
          setFormValues((prev) => ({ ...prev, ...data }));
          try { localStorage.setItem("studentProfile", JSON.stringify(data)); } catch {}
          setProfileLoaded(true);
          setShowOnboarding(false);
        }
      }).catch(() => {});
    }
  }, []);

  const saveLocalProfile = (profile: Record<string, string>) => {
    try {
      localStorage.setItem("studentProfile", JSON.stringify(profile));
      setFormValues((prev) => ({ ...prev, ...profile }));
      setProfileLoaded(true);
      setShowOnboarding(false);
      showToast({ message: "Profile saved locally", variant: "success" });
    } catch (err: any) {
      showToast({ message: "Failed to save profile locally", variant: "error" });
    }
  };

  const handleOnboardingSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const profile = { ...onboardValues };
    setLoading(true);
    setError(null);
    try {
      // save locally first
      let localSaved = false;
      try {
        localStorage.setItem("studentProfile", JSON.stringify(profile));
        setFormValues((prev) => ({ ...prev, ...profile }));
        setProfileLoaded(true);
        setShowOnboarding(false);
        localSaved = true;
        showToast({ message: "Profile saved locally", variant: "success" });
      } catch (err) {
        localSaved = false;
        showToast({ message: "Failed to save profile locally", variant: "error" });
      }
      // If local save failed, stop and show error
      if (!localSaved) {
        showToast({ message: "Failed to save profile locally — cannot continue.", variant: "error" });
        return;
      }

      // attempt to save to Firestore (will use anonymous auth). If it fails, we still continue.
      try {
        await saveProfileToFirestore(profile);
      } catch (err) {
        // saveProfileToFirestore shows toasts on failure; ignore here
      }

      // submit attendance using the newly saved profile (local data)
      // submit using the freshly saved profile directly to avoid race on state updates
      try {
        await submitWithValues(profile);
        showToast({ message: "Attendance recorded", variant: "success" });
        navigate(`/s/${sessionId}/success`, {
          state: {
            moduleCode: session?.moduleCode,
            title: session?.title
          }
        });
        return;
      } catch (err: any) {
        // if auto-submit failed, fall back to showing the form so the user can retry
        setError(err?.message || "Submission failed");
        showToast({ message: err?.message || "Submission failed", variant: "error" });
        setShowOnboarding(false);
      }
    } finally {
      setLoading(false);
    }
  };

  // helper to submit attendance using an explicit values object
  async function submitWithValues(values: Record<string, string>) {
    if (!sessionId || !submitUrl) {
      throw new Error("Submission service not configured");
    }
    if (!token) {
      throw new Error("QR token missing. Please rescan the code.");
    }

    const payload: Record<string, any> = {
      sessionId,
      studentNumber: values.studentNumber || "",
      token
    };

    // attempt to attach geolocation (best-effort)
    try {
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        const pos = await new Promise<GeolocationPosition | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (p) => resolve(p),
            () => resolve(null),
            { maximumAge: 30000, timeout: 5000 }
          );
        });
        if (pos && pos.coords) {
          payload.location = {
            lat: Number(pos.coords.latitude),
            lng: Number(pos.coords.longitude),
            accuracy: Number(pos.coords.accuracy || 0)
          };
        }
      }
    } catch (e) {
      // ignore geolocation failures — submission still allowed
    }

    ["name", "surname", "initials", "email", "group"].forEach((key) => {
      if (requiredFields[key] && values[key]) {
        payload[key] = values[key];
      }
    });

    if (classCodeRequired) {
      payload.classCode = values.classCode || "";
    }

    // attach lightweight client fingerprint metadata where available
    try {
      if (typeof window !== "undefined") {
        if (window.screen) {
          payload.screenWidth = String(window.screen.width || "");
          payload.screenHeight = String(window.screen.height || "");
        }
        try {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (tz) payload.timezone = String(tz);
        } catch (e) {}
      }
    } catch (e) {}

    const response = await fetch(submitUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({ error: "Submission failed" }));
      throw new Error(errBody.error || "Submission failed");
    }

    return true;
  }

  const saveProfileToFirestore = async (profile: Record<string, string>) => {
    try {
      // ensure anonymous auth
      let user = auth.currentUser;
      if (!user || !(user as any).isAnonymous) {
        const res = await signInAnonymously(auth);
        user = res.user;
      }
      if (!user) throw new Error("Failed to sign in");
      await setDoc(doc(db, "students", user.uid), { ...profile, updatedAt: new Date() }, { merge: true });
      try { localStorage.setItem("studentProfile", JSON.stringify(profile)); } catch {}
      setFormValues((prev) => ({ ...prev, ...profile }));
      setProfileLoaded(true);
      setShowOnboarding(false);
      showToast({ message: "Profile saved and linked to this device", variant: "success" });
    } catch (err: any) {
      // If anonymous auth is disabled in the Firebase project, signInAnonymously
      // will throw an admin-restricted-operation error. Fall back to local-only.
      const code = err?.code || "";
      if (code === "auth/admin-restricted-operation" || (err?.message || "").includes("admin-restricted-operation")) {
        showToast({ message: "Anonymous auth disabled in backend — profile saved locally only.", variant: "info" });
        return;
      }
      showToast({ message: err?.message || "Failed to save profile", variant: "error" });
    }
  };

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
      // use helper to submit using current formValues
      await submitWithValues(formValues);

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

        {/* Onboarding: show full profile form if no profile exists */}
        {showOnboarding ? (
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Quick profile setup</h2>
            <p className="text-sm text-text-muted">Save your details once and we will autofill future attendance forms.</p>
            <form onSubmit={handleOnboardingSubmit} className="mt-3 space-y-3">
              <input placeholder="Student number" value={onboardValues.studentNumber} onChange={(e) => setOnboardValues((p) => ({ ...p, studentNumber: e.target.value }))} className="w-full rounded-md border border-stroke-subtle px-4 py-3" />
              <input placeholder="First name" value={onboardValues.name} onChange={(e) => setOnboardValues((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-md border border-stroke-subtle px-4 py-3" />
              <input placeholder="Surname" value={onboardValues.surname} onChange={(e) => setOnboardValues((p) => ({ ...p, surname: e.target.value }))} className="w-full rounded-md border border-stroke-subtle px-4 py-3" />
              <input placeholder="Initials" value={onboardValues.initials} onChange={(e) => setOnboardValues((p) => ({ ...p, initials: e.target.value }))} className="w-full rounded-md border border-stroke-subtle px-4 py-3" />
              <input placeholder="Email" value={onboardValues.email} onChange={(e) => setOnboardValues((p) => ({ ...p, email: e.target.value }))} className="w-full rounded-md border border-stroke-subtle px-4 py-3" />
              <input placeholder="Group" value={onboardValues.group} onChange={(e) => setOnboardValues((p) => ({ ...p, group: e.target.value }))} className="w-full rounded-md border border-stroke-subtle px-4 py-3" />
              <div className="flex gap-2">
                <button type="submit" className="rounded-lg bg-brand-primary px-4 py-2 text-white" disabled={loading}>{loading ? 'Saving...' : 'Save & submit'}</button>
                <button type="button" onClick={() => { setShowOnboarding(false); showToast({ message: 'Onboarding skipped — you can set up later', variant: 'info' }); }} className="ml-auto text-sm text-text-muted">Skip for now</button>
              </div>
            </form>
          </div>
        ) : null}

        {!showOnboarding && (
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
          {/* Render required fields in a deterministic order */}
          {(() => {
            const ordered = ["name", "surname", "initials", "email"];
            return (
              <>
                {ordered
                  .filter((k) => requiredFields[k])
                  .map((key) => (
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

                {requiredFields.group && (
                  <div key="group">
                    <label className="mb-1 block text-sm font-medium text-text-muted capitalize">group</label>
                    <input
                      className="w-full rounded-md border border-stroke-subtle px-4 py-3 text-base sm:text-sm focus:border-brand-primary focus:outline-none"
                      value={formValues.group || ""}
                      onChange={(event) => handleChange("group", event.target.value)}
                      required
                    />
                  </div>
                )}
              </>
            );
          })()}
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
        )}
      </div>
      </div>
    </div>
    </Layout>
    );
}

export default ScanForm;
