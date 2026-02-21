// @ts-nocheck
import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { QRCodeCanvas } from "qrcode.react";
import { db, functions } from "../../firebase";
import { Clock, QrCode, Key, AlertCircle, CheckCircle, XCircle, Users } from "lucide-react";

interface SessionSnapshot {
  moduleCode?: string;
  title?: string;
  isActive?: boolean;
  qrExpiresAt?: Date | null;
  stats?: { submissionsCount?: number };
  settings?: { requireClassCode?: boolean };
}

interface PrivateSnapshot {
  classCode?: string | null;
  token?: string | null;
  expiresAt?: Date | null;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function getStatusBadge(isActive: boolean, isExpired: boolean, hasEnded: boolean) {
  if (hasEnded) {
    return {
      label: "Ended",
      color: "bg-gray-500/15 text-gray-200 border-gray-500/25",
      icon: XCircle,
    };
  }
  if (!isActive) {
    return {
      label: "Inactive",
      color: "bg-amber-500/15 text-amber-200 border-amber-500/25",
      icon: AlertCircle,
    };
  }
  if (isExpired) {
    return {
      label: "Expired",
      color: "bg-red-500/15 text-red-200 border-red-500/25",
      icon: AlertCircle,
    };
  }
  return {
    label: "Live",
    color: "bg-emerald-500/15 text-emerald-200 border-emerald-500/25",
    icon: CheckCircle,
  };
}

function SessionDisplay() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [privateData, setPrivateData] = useState<PrivateSnapshot>({});
  const [classCodePin, setClassCodePin] = useState<string | null>(null);
  const [pinRotationSeconds, setPinRotationSeconds] = useState<number>(30);
  const [tick, setTick] = useState(0);

  // timer tick
  useEffect(() => {
    const interval = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // session listener
  useEffect(() => {
    if (!sessionId) return;

    const ref = doc(db, "sessions", sessionId);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const data = snapshot.data();
      if (!data) return;

      const qrExp =
        data.qr?.expiresAt?.toDate
          ? data.qr.expiresAt.toDate()
          : data.expiresAt?.toDate
          ? data.expiresAt.toDate()
          : null;

      setSession({
        moduleCode: data.moduleCode,
        title: data.title,
        isActive: data.isActive,
        qrExpiresAt: qrExp,
        stats: data.stats,
        settings: data.settings || {},
      });
    });

    return () => unsubscribe();
  }, [sessionId]);

  // private listener
  useEffect(() => {
    if (!sessionId) return;

    const privateRef = doc(db, "sessionsPrivate", sessionId);
    const unsubscribe = onSnapshot(privateRef, (snapshot) => {
      const data = snapshot.data();
      if (!data) return;

      setPrivateData({
        classCode: data.classCodePlain || null,
        token: data.qrTokenPlain || null,
        expiresAt: data.qrExpiresAt?.toDate ? data.qrExpiresAt.toDate() : null,
      });
    });

    return () => unsubscribe();
  }, [sessionId]);

  // rotating PIN polling (only if class code is enabled AND session is active)
  useEffect(() => {
    let timer: number | null = null;
    let mounted = true;

    async function fetchPin() {
      if (!sessionId || !session?.isActive || !session?.settings?.requireClassCode) return;
      try {
        const callable = httpsCallable(functions, "getSessionPin");
        const res: any = await callable({ sessionId });
        if (!mounted) return;
        setClassCodePin(res.data?.pin || null);
        setPinRotationSeconds(Number(res.data?.rotationSeconds || 30));
      } catch (e) {
        console.error("getSessionPin error (display):", e);
      }
    }

    if (session?.isActive && session?.settings?.requireClassCode) {
      fetchPin();
      timer = window.setInterval(fetchPin, Math.max(1000, pinRotationSeconds * 1000));
    }

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, [sessionId, session?.isActive, session?.settings?.requireClassCode, pinRotationSeconds]);

  const expiresAt = privateData.expiresAt || session?.qrExpiresAt || null;

  const secondsRemaining = useMemo(() => {
    if (!expiresAt) return 0;
    return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  }, [expiresAt, tick]);

  const qrUrl = useMemo(() => {
    if (!sessionId || !privateData.token) return "";
    return `${window.location.origin}/s/${sessionId}?t=${privateData.token}`;
  }, [sessionId, privateData.token]);

  const hasEnded = session?.isActive === false;
  const isExpired = expiresAt ? expiresAt.getTime() <= Date.now() : false;
  const isLive = Boolean(session?.isActive) && !isExpired && !hasEnded;

  const showPin =
    isLive && Boolean(session?.settings?.requireClassCode) && Boolean(classCodePin || privateData.classCode);

  const canShowQr = isLive && Boolean(privateData.token);

  const statusBadge = getStatusBadge(Boolean(session?.isActive), isExpired, hasEnded);
  const StatusIcon = statusBadge.icon;

  const submissionsCount = session?.stats?.submissionsCount ?? 0;



  // progress bar (0..100) based on remaining time vs total window
  const progressPercentage = useMemo(() => {
    if (!expiresAt || !session?.qrExpiresAt) return 0;
    const totalMs = Math.max(1, session.qrExpiresAt.getTime() - Date.now());
    const remainMs = Math.max(0, expiresAt.getTime() - Date.now());
    return Math.max(0, Math.min(100, (remainMs / totalMs) * 100));
  }, [expiresAt, session?.qrExpiresAt, tick]);

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-gray-300">Loading display…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 text-white">
      {/* Background Pattern */}
      <div className="pointer-events-none absolute inset-0 bg-grid-white/[0.02] bg-[size:60px_60px]" />

      <div className="relative min-h-screen flex items-center justify-center p-6">
        <div className="max-w-6xl w-full">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            {/* LEFT: QR */}
            <div className="flex flex-col items-center w-full">
              <div className="relative">
                <div className="absolute -inset-5 bg-gradient-to-r from-blue-500/20 to-emerald-500/20 rounded-3xl blur-2xl" />

                <div className="relative bg-white rounded-2xl p-4 shadow-2xl w-full max-w-[380px]">
                  {canShowQr && qrUrl ? (
                    <div className="w-full">
                      <QRCodeCanvas value={qrUrl} size={380} includeMargin level="H" className="rounded-lg" style={{ width: '100%', height: 'auto' }} />
                    </div>
                  ) : (
                    <div className="w-full aspect-square flex flex-col items-center justify-center bg-gray-100 rounded-lg" style={{ maxWidth: 380 }}>
                      <QrCode className="h-16 w-16 text-gray-400 mb-3" />
                      <span className="text-gray-500 font-medium">
                        {hasEnded ? "Session ended" : isExpired ? "QR expired" : "Waiting for QR..."}
                      </span>
                    </div>
                  )}
                </div>

                {isLive ? (
                  <div className="absolute -top-2 -right-2 flex items-center gap-2 bg-emerald-500 text-white px-3 py-1.5 rounded-full text-sm font-semibold shadow-lg">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                    </span>
                    LIVE
                  </div>
                ) : null}
              </div>

              {/* Simple caption */}
              <div className="mt-5 w-full text-center">
                <p className="text-sm text-gray-300">Scan the QR code to submit attendance</p>
              </div>
            </div>

            {/* RIGHT: Info */}
            <div className="text-center lg:text-left">
              <div className="space-y-7">
                {/* Header */}
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold w-fit mx-auto lg:mx-0 border-white/10 bg-white/5">
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${statusBadge.color}`}>
                      <StatusIcon className="h-4 w-4" />
                      {statusBadge.label}
                    </span>

                    {/* subtle submissions chip (LIVE + ENDED) */}
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/85">
                      <Users className="h-4 w-4 opacity-80" />
                      <span className="tabular-nums">{submissionsCount}</span>
                      <span className="text-white/60">submissions</span>
                    </span>
                  </div>

                  <h1 className="text-4xl lg:text-5xl font-bold text-white">
                    {session?.moduleCode || "Session"}
                  </h1>
                  {session?.title ? (
                    <p className="text-lg text-gray-300">{session.title}</p>
                  ) : null}
                </div>

                {/* Timer */}
                {isLive ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center lg:justify-start gap-3">
                      <Clock className="h-6 w-6 text-gray-300" />
                      <span className="text-6xl lg:text-7xl font-bold text-white tabular-nums">
                        {formatCountdown(secondsRemaining)}
                      </span>
                    </div>

                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-1000"
                        style={{ width: `${progressPercentage}%` }}
                      />
                    </div>

                    <p className="text-sm text-gray-400">
                      Submit before the timer reaches zero.
                    </p>
                  </div>
                ) : null}

                {/* PIN */}
                {showPin ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                      Class entry code
                    </p>
                    <div className="inline-flex items-center gap-3 bg-white/10 border border-white/20 rounded-2xl px-8 py-4">
                      <Key className="h-6 w-6 text-gray-300" />
                      <span className="text-4xl lg:text-5xl font-mono font-bold text-white tracking-[0.25em]">
                        {classCodePin || privateData.classCode}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Code refreshes every {pinRotationSeconds} seconds
                    </p>
                  </div>
                ) : null}

                {/* End / Expired messaging */}
                {hasEnded ? (
                  <div className="mt-2 p-6 bg-white/5 border border-white/10 rounded-2xl">
                    <p className="text-lg text-gray-200 font-semibold">Session ended</p>
                    <p className="mt-2 text-sm text-gray-400">
                      Final submissions: <span className="text-white font-semibold">{submissionsCount}</span>
                    </p>
                  </div>
                ) : !hasEnded && isExpired ? (
                  <div className="mt-2 p-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                    <p className="text-lg text-amber-200 font-semibold">QR expired</p>
                    <p className="mt-2 text-sm text-amber-200/70">
                      Please wait for the instructor to renew it.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SessionDisplay;
