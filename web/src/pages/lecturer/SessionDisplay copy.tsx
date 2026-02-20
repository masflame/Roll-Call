// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";
import { QRCodeCanvas } from "qrcode.react";
import { db } from "../../firebase";

interface SessionSnapshot {
  moduleCode?: string;
  title?: string;
  isActive?: boolean;
  qrExpiresAt?: Date | null;
  stats?: {
    submissionsCount?: number;
  };
}

interface PrivateSnapshot {
  classCode?: string | null;
  token?: string | null;
  expiresAt?: Date | null;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "Expired";
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function SessionDisplay() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [privateData, setPrivateData] = useState<PrivateSnapshot>({});
  const [classCodePin, setClassCodePin] = useState<string | null>(null);
  const [pinRotationSeconds, setPinRotationSeconds] = useState<number>(30);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const ref = doc(db, "sessions", sessionId);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const data = snapshot.data();
      if (!data) return;
      setSession({
        moduleCode: data.moduleCode,
        title: data.title,
        isActive: data.isActive,
        qrExpiresAt: data.qr?.expiresAt?.toDate ? data.qr.expiresAt.toDate() : data.expiresAt?.toDate ? data.expiresAt.toDate() : null,
        stats: data.stats
      });
    });
    return () => unsubscribe();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const privateRef = doc(db, "sessionsPrivate", sessionId);
    const unsubscribe = onSnapshot(privateRef, (snapshot) => {
      const data = snapshot.data();
      if (!data) return;
      setPrivateData({
        classCode: data.classCodePlain || null,
        token: data.qrTokenPlain || null,
        expiresAt: data.qrExpiresAt?.toDate ? data.qrExpiresAt.toDate() : null
      });
    });
    return () => unsubscribe();
  }, [sessionId]);

  // fetch rotating PIN from server when enabled
  useEffect(() => {
    let timer: number | null = null;
    let mounted = true;
    async function fetchPin() {
      if (!sessionId) return;
      try {
        const callable = httpsCallable(functions, "getSessionPin");
        const res: any = await callable({ sessionId });
        console.debug("getSessionPin response (display):", res);
        if (!mounted) return;
        setClassCodePin(res.data?.pin || null);
        setPinRotationSeconds(Number(res.data?.rotationSeconds || 30));
      } catch (e) {
        console.error("getSessionPin error (display):", e);
      }
    }

    fetchPin();
    timer = window.setInterval(fetchPin, Math.max(1000, pinRotationSeconds * 1000));
    return () => { mounted = false; if (timer) clearInterval(timer); };
  }, [sessionId, pinRotationSeconds]);

  const expiresAt = privateData.expiresAt || session?.qrExpiresAt || null;
  const secondsRemaining = useMemo(() => {
    if (!expiresAt) return 0;
    return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  }, [expiresAt, tick]);

  const qrUrl = sessionId && privateData.token ? `${window.location.origin}/s/${sessionId}?t=${privateData.token}` : "";
  const fallbackUrl = sessionId ? `${window.location.origin}/s/${sessionId}` : "";

  const ended = session?.isActive === false;

  const isExpired = expiresAt ? expiresAt.getTime() <= Date.now() : false;
  const showPin = !ended && !isExpired && (classCodePin || privateData.classCode);
  const displayQr = !ended && !isExpired && Boolean(privateData.token);

  return (
    <div className="flex h-screen w-screen items-center bg-[#0B1220] text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-8 py-12 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col items-center lg:items-start">
          <div className="rounded-2xl border border-white/10 bg-white/10 p-8 shadow-2xl">
            {displayQr && qrUrl ? (
              <QRCodeCanvas value={qrUrl} size={380} includeMargin level="H" />
            ) : (
              <div className="flex h-[380px] w-[380px] items-center justify-center bg-black/40">
                <span className="text-lg text-slate-300">Waiting for QR...</span>
              </div>
            )}
          </div>
          <div className="mt-6 text-sm text-slate-300">
            Scan the QR or visit <span className="font-semibold text-white">{fallbackUrl}</span>
          </div>
        </div>

        <div className="flex w-full max-w-sm flex-col gap-6 text-right lg:text-left">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{session?.moduleCode || "Session"}</h1>
          </div>
          <div className="text-6xl font-bold tracking-wide text-white">
            {formatCountdown(secondsRemaining)}
          </div>
          {showPin && (
            <div className="rounded-lg border border-white/20 bg-white/10 px-6 py-4 text-3xl font-bold tracking-[0.35em]">
              {classCodePin || privateData.classCode}
            </div>
          )}
          {ended && (
            <div className="rounded-lg border border-white/20 bg-white/10 px-5 py-4 text-lg">
              Session ended • Attendance captured: {session?.stats?.submissionsCount ?? 0}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SessionDisplay;
