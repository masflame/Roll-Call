"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.nightlyAnalyticsRecompute = exports.exportModulePdf = exports.editAttendance = exports.recomputeModuleStatsNow = exports.uploadRoster = exports.exportSessionCsv = exports.extendSessionWindow = exports.renewSessionQr = exports.endSession = exports.submitAttendance = exports.getSessionPin = exports.scheduledAutoStart = exports.createSession = void 0;
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_2 = require("firebase-admin/firestore");
const hash_1 = require("./utils/hash");
const csv_1 = require("./utils/csv");
const pdf_1 = require("./utils/pdf");
const totp_1 = require("./utils/totp");
const rateLimit_1 = require("./utils/rateLimit");
const validators_1 = require("./utils/validators");
const analytics_1 = require("./utils/analytics");
function getCheckinBucket(mins) {
    if (mins <= 1)
        return "0-1";
    if (mins <= 3)
        return "1-3";
    if (mins <= 5)
        return "3-5";
    if (mins <= 10)
        return "5-10";
    return ">10";
}
function weekKey(d) {
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((+tmp - +yearStart) / 86400000 + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
admin.initializeApp();
const db = (0, firestore_2.getFirestore)();
const sessionsCollection = "sessions";
const sessionsPrivateCollection = "sessionsPrivate";
const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://roll-call-14e2f.web.app",
    "https://roll-call-14e2f.firebaseapp.com",
    // Vercel deployment origins (allow your preview/production domain)
    "https://roll-call-s43d-git-main-masflames-projects.vercel.app",
    "https://roll-call-s43d-7b58cg847-masflames-projects.vercel.app",
    "https://roll-call-s43d-f5a4847b2-masflames-projects.vercel.app",
    "https://roll-call-s43d.vercel.app",
    "https://roll-call.vercel.app"
];
const callableCors = allowedOrigins;
const applyCorsHeaders = (req, res) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
};
const QR_TOKEN_BYTES = 16;
const randomBytes = crypto.randomBytes;
const generateQrToken = () => randomBytes(QR_TOKEN_BYTES).toString("hex");
exports.createSession = (0, https_1.onCall)({ cors: callableCors }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Lecturer must be signed in.");
    const lecturerId = req.auth.uid;
    const payload = (0, validators_1.validateCreateSession)(req.data);
    const sessionRef = db.collection(sessionsCollection).doc();
    const privateRef = db.collection(sessionsPrivateCollection).doc(sessionRef.id);
    const now = Date.now();
    const expiresAt = new Date(now + payload.windowSeconds * 1000);
    const qrToken = generateQrToken();
    const qrTokenHash = (0, hash_1.hashCode)(qrToken);
    const classCode = payload.requireClassCode ? String(Math.floor(1000 + Math.random() * 9000)) : undefined;
    const classCodeHash = classCode ? (0, hash_1.hashCode)(classCode) : undefined;
    const classCodeRotationSeconds = payload.classCodeRotationSeconds || (payload.requireClassCode ? 30 : undefined);
    // generate a secret for rotating PINs (hex)
    const classCodeSecret = payload.requireClassCode ? randomBytes(10).toString("hex") : undefined;
    await db.runTransaction(async (tx) => {
        tx.set(sessionRef, {
            lecturerId,
            moduleId: payload.moduleId,
            moduleCode: payload.moduleCode,
            title: payload.title,
            requiredFields: payload.requiredFields,
            settings: {
                windowSeconds: payload.windowSeconds,
                blockDuplicates: true,
                requireClassCode: payload.requireClassCode
            },
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            expiresAt,
            isActive: true,
            endedAt: null,
            stats: {
                submissionsCount: 0
            },
            qr: {
                tokenHash: qrTokenHash,
                expiresAt,
                lastRotatedAt: firestore_1.FieldValue.serverTimestamp()
            }
        });
        const privateData = {
            lecturerId,
            classCodeHash: classCodeHash ?? null,
            classCodePlain: classCode ?? null,
            qrTokenPlain: qrToken,
            qrExpiresAt: expiresAt,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            lastRotatedAt: firestore_1.FieldValue.serverTimestamp()
        };
        if (classCodeSecret) {
            privateData.classCodeSecret = classCodeSecret;
            privateData.classCodeRotationSeconds = classCodeRotationSeconds;
            // don't persist plain code beyond first creation if rotation used
            delete privateData.classCodePlain;
        }
        tx.set(privateRef, privateData);
    });
    return {
        sessionId: sessionRef.id,
        expiresAt: expiresAt.toISOString(),
        classCode,
        qrToken
    };
});
// scheduled starter: runs every minute and starts queued schedules whose time has arrived
exports.scheduledAutoStart = (0, scheduler_1.onSchedule)("every 1 minutes", async (event) => {
    try {
        const now = new Date();
        const snaps = await db.collection("schedules").where("status", "==", "queued").where("scheduledAt", "<=", now).get();
        if (snaps.empty)
            return;
        for (const sDoc of snaps.docs) {
            const s = sDoc.data();
            try {
                const lecturerId = s.lecturerId;
                const moduleId = s.moduleId;
                let moduleCode = s.moduleCode || "";
                if (!moduleCode && moduleId) {
                    const modSnap = await db.collection("modules").doc(moduleId).get();
                    if (modSnap.exists)
                        moduleCode = modSnap.data().moduleCode || "";
                }
                const payload = {
                    moduleId: moduleId,
                    moduleCode,
                    title: s.title || "",
                    windowSeconds: s.windowSeconds || 60,
                    requiredFields: s.requiredFields || {},
                    requireClassCode: s.requireClassCode || false,
                    classCodeRotationSeconds: s.classCodeRotationSeconds
                };
                const sessionRef = db.collection(sessionsCollection).doc();
                const privateRef = db.collection(sessionsPrivateCollection).doc(sessionRef.id);
                const nowMs = Date.now();
                const expiresAt = new Date(nowMs + payload.windowSeconds * 1000);
                const qrToken = generateQrToken();
                const qrTokenHash = (0, hash_1.hashCode)(qrToken);
                const classCode = payload.requireClassCode ? String(Math.floor(1000 + Math.random() * 9000)) : undefined;
                const classCodeHash = classCode ? (0, hash_1.hashCode)(classCode) : undefined;
                const classCodeRotationSeconds = payload.classCodeRotationSeconds || (payload.requireClassCode ? 30 : undefined);
                const classCodeSecret = payload.requireClassCode ? randomBytes(10).toString("hex") : undefined;
                await db.runTransaction(async (tx) => {
                    tx.set(sessionRef, {
                        lecturerId,
                        moduleId: payload.moduleId,
                        moduleCode: payload.moduleCode,
                        title: payload.title,
                        requiredFields: payload.requiredFields,
                        settings: {
                            windowSeconds: payload.windowSeconds,
                            blockDuplicates: true,
                            requireClassCode: payload.requireClassCode
                        },
                        createdAt: firestore_1.FieldValue.serverTimestamp(),
                        expiresAt,
                        isActive: true,
                        endedAt: null,
                        stats: { submissionsCount: 0 },
                        qr: { tokenHash: qrTokenHash, expiresAt, lastRotatedAt: firestore_1.FieldValue.serverTimestamp() }
                    });
                    const privateData = {
                        lecturerId,
                        classCodeHash: classCodeHash ?? null,
                        classCodePlain: classCode ?? null,
                        qrTokenPlain: qrToken,
                        qrExpiresAt: expiresAt,
                        createdAt: firestore_1.FieldValue.serverTimestamp(),
                        lastRotatedAt: firestore_1.FieldValue.serverTimestamp()
                    };
                    if (classCodeSecret) {
                        privateData.classCodeSecret = classCodeSecret;
                        privateData.classCodeRotationSeconds = classCodeRotationSeconds;
                        delete privateData.classCodePlain;
                    }
                    tx.set(privateRef, privateData);
                });
                await db.collection("schedules").doc(sDoc.id).update({ status: "started", startedAt: firestore_1.FieldValue.serverTimestamp(), sessionId: sessionRef.id });
                console.log("scheduledAutoStart: started schedule", sDoc.id, "->", sessionRef.id);
            }
            catch (err) {
                console.error("scheduledAutoStart: failed for schedule", sDoc.id, err);
            }
        }
    }
    catch (err) {
        console.error("scheduledAutoStart: top-level error", err);
    }
});
// callable to return the current rotating class code (lecturer only)
exports.getSessionPin = (0, https_1.onCall)({ cors: callableCors }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Lecturer must be signed in.");
    const lecturerId = req.auth.uid;
    const sessionId = String(req.data?.sessionId || "").trim();
    if (!sessionId)
        throw new https_1.HttpsError("invalid-argument", "sessionId required");
    const sessionRef = db.collection(sessionsCollection).doc(sessionId);
    const privateRef = db.collection(sessionsPrivateCollection).doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists)
        throw new https_1.HttpsError("not-found", "Session not found");
    const session = sessionSnap.data();
    if (session.lecturerId !== lecturerId)
        throw new https_1.HttpsError("permission-denied", "Forbidden");
    const privateSnap = await privateRef.get();
    if (!privateSnap.exists)
        throw new https_1.HttpsError("not-found", "Session private config missing");
    const privateData = privateSnap.data();
    const secret = privateData.classCodeSecret;
    const rotation = Number(privateData.classCodeRotationSeconds || session.classCodeRotationSeconds || 30);
    if (!secret)
        throw new https_1.HttpsError("failed-precondition", "Rotating class code not enabled");
    const pin = (0, totp_1.generateTotp)(secret, rotation, 4);
    return { ok: true, pin, rotationSeconds: rotation };
});
exports.submitAttendance = (0, https_1.onRequest)(async (req, res) => {
    applyCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
    }
    try {
        if (req.method !== "POST") {
            res.status(405).json({ error: "Method not allowed" });
            return;
        }
        const ipHeader = req.headers["x-forwarded-for"];
        const ip = ipHeader?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
        const limited = await (0, rateLimit_1.rateLimitByIp)(db, ip, 60, 40);
        if (!limited.ok) {
            res.status(429).json({ error: "Too many requests" });
            return;
        }
        const payload = (0, validators_1.validateAttendancePayload)(req.body);
        const sessionRef = db.collection(sessionsCollection).doc(payload.sessionId);
        const privateRef = db.collection(sessionsPrivateCollection).doc(payload.sessionId);
        const attendanceRef = sessionRef.collection("attendance").doc(payload.studentNumber);
        // validate session and token outside transaction so we can persist integrity logs on failure
        const sessionSnap = await sessionRef.get();
        if (!sessionSnap.exists)
            throw new https_1.HttpsError("not-found", "Session not found");
        const session = sessionSnap.data();
        if (!session.isActive)
            throw new https_1.HttpsError("failed-precondition", "Session ended");
        const expiresAt = session.expiresAt?.toDate ? session.expiresAt.toDate() : new Date(session.expiresAt);
        if (Date.now() > expiresAt.getTime())
            throw new https_1.HttpsError("failed-precondition", "Session expired");
        if (!session.qr?.tokenHash)
            throw new https_1.HttpsError("failed-precondition", "QR code unavailable");
        const qrExpiresAt = session.qr.expiresAt?.toDate ? session.qr.expiresAt.toDate() : new Date(session.qr.expiresAt);
        if (Date.now() > qrExpiresAt.getTime()) {
            const integrityRef = sessionRef.collection("integrity").doc();
            await integrityRef.set({ type: "expired_qr", studentNumber: payload.studentNumber, createdAt: firestore_1.FieldValue.serverTimestamp() });
            const sessionStatsRef = db.collection("sessionStats").doc(payload.sessionId);
            await sessionStatsRef.set({ expiredAttempts: firestore_1.FieldValue.increment(1) }, { merge: true });
            const moduleIdTmp = session.moduleId || session.moduleCode || "unknown";
            const moduleStatsRef = db.collection("moduleStats").doc(moduleIdTmp);
            await moduleStatsRef.set({ expiredAttempts: firestore_1.FieldValue.increment(1) }, { merge: true });
            throw new https_1.HttpsError("failed-precondition", "QR code expired");
        }
        const tokenValid = (0, hash_1.safeEquals)(session.qr.tokenHash, payload.token);
        if (!tokenValid) {
            console.error("submitAttendance: invalid_token", { sessionId: payload.sessionId, studentNumber: payload.studentNumber, providedTokenPreview: String(payload.token || "").slice(0, 12), tokenHashPreview: String(session.qr.tokenHash || "").slice(0, 12) });
            const integrityRef = sessionRef.collection("integrity").doc();
            await integrityRef.set({ type: "invalid_token", studentNumber: payload.studentNumber, createdAt: firestore_1.FieldValue.serverTimestamp() });
            const sessionStatsRef = db.collection("sessionStats").doc(payload.sessionId);
            await sessionStatsRef.set({ wrongTokenAttempts: firestore_1.FieldValue.increment(1) }, { merge: true });
            const moduleIdTmp = session.moduleId || session.moduleCode || "unknown";
            const moduleStatsRef = db.collection("moduleStats").doc(moduleIdTmp);
            await moduleStatsRef.set({ wrongTokenAttempts: firestore_1.FieldValue.increment(1) }, { merge: true });
            throw new https_1.HttpsError("permission-denied", "Invalid token");
        }
        if (session.settings?.requireClassCode) {
            const privateSnap = await privateRef.get();
            if (!privateSnap.exists)
                throw new https_1.HttpsError("internal", "Session configuration missing");
            const privateData = privateSnap.data();
            // if rotating code is configured, validate TOTP-like PIN
            if (privateData.classCodeSecret && privateData.classCodeRotationSeconds) {
                // Accept current code and a single adjacent window to tolerate small clock skew
                const candidates = (0, totp_1.generateTotpWindows)(privateData.classCodeSecret, Number(privateData.classCodeRotationSeconds), 4, 1);
                const provided = String(payload.classCode || "");
                const ok = candidates.includes(provided);
                if (!ok) {
                    console.error("submitAttendance: wrong_pin", { sessionId: payload.sessionId, studentNumber: payload.studentNumber, provided, candidates });
                    const integrityRef = sessionRef.collection("integrity").doc();
                    await integrityRef.set({ type: "wrong_pin", studentNumber: payload.studentNumber, createdAt: firestore_1.FieldValue.serverTimestamp() });
                    const sessionStatsRef = db.collection("sessionStats").doc(payload.sessionId);
                    await sessionStatsRef.set({ wrongPinAttempts: firestore_1.FieldValue.increment(1) }, { merge: true });
                    const moduleIdTmp = session.moduleId || session.moduleCode || "unknown";
                    const moduleStatsRef = db.collection("moduleStats").doc(moduleIdTmp);
                    await moduleStatsRef.set({ wrongPinAttempts: firestore_1.FieldValue.increment(1) }, { merge: true });
                    throw new https_1.HttpsError("permission-denied", "Invalid class code");
                }
            }
            else {
                const ok = (0, hash_1.safeEquals)(privateData.classCodeHash || "", String(payload.classCode || ""));
                if (!ok) {
                    const integrityRef = sessionRef.collection("integrity").doc();
                    await integrityRef.set({ type: "wrong_pin", studentNumber: payload.studentNumber, createdAt: firestore_1.FieldValue.serverTimestamp() });
                    const sessionStatsRef = db.collection("sessionStats").doc(payload.sessionId);
                    await sessionStatsRef.set({ wrongPinAttempts: firestore_1.FieldValue.increment(1) }, { merge: true });
                    const moduleIdTmp = session.moduleId || session.moduleCode || "unknown";
                    const moduleStatsRef = db.collection("moduleStats").doc(moduleIdTmp);
                    await moduleStatsRef.set({ wrongPinAttempts: firestore_1.FieldValue.increment(1) }, { merge: true });
                    throw new https_1.HttpsError("permission-denied", "Invalid class code");
                }
            }
        }
        // check duplicate outside transaction to avoid interleaving reads/writes
        const existing = await attendanceRef.get();
        if (existing.exists) {
            const integrityRef = sessionRef.collection("integrity").doc();
            await integrityRef.set({ type: "duplicate", studentNumber: payload.studentNumber, createdAt: firestore_1.FieldValue.serverTimestamp() });
            const sessionStatsRef = db.collection("sessionStats").doc(payload.sessionId);
            await sessionStatsRef.set({ blockedDuplicates: firestore_1.FieldValue.increment(1) }, { merge: true });
            const moduleIdTmp = session.moduleId || session.moduleCode || "unknown";
            const moduleStatsRef = db.collection("moduleStats").doc(moduleIdTmp);
            await moduleStatsRef.set({ blockedDuplicates: firestore_1.FieldValue.increment(1) }, { merge: true });
            throw new https_1.HttpsError("already-exists", "Already submitted");
        }
        const allowedFields = session.requiredFields || {};
        const submittedAt = new Date();
        const record = { studentNumber: payload.studentNumber, status: "Present", submittedAt, audit: { ip, userAgent: req.headers["user-agent"] || "" } };
        ["name", "surname", "initials", "email", "group"].forEach((key) => { if (allowedFields[key] && payload[key])
            record[key] = payload[key]; });
        const createdAt = session.createdAt?.toDate ? session.createdAt.toDate() : new Date(session.createdAt);
        const mins = (submittedAt.getTime() - createdAt.getTime()) / 60000;
        const bucket = getCheckinBucket(mins);
        // now run a transaction that reads sessionStats/moduleStats/student before writing (all reads first)
        await db.runTransaction(async (tx) => {
            const sessionStatsRef = db.collection("sessionStats").doc(payload.sessionId);
            const ssSnap = await tx.get(sessionStatsRef);
            const ssData = ssSnap.exists ? ssSnap.data() : {};
            const moduleId = session.moduleId || session.moduleCode || "unknown";
            const moduleStatsRef = db.collection("moduleStats").doc(moduleId);
            const msSnap = await tx.get(moduleStatsRef);
            const msData = msSnap.exists ? msSnap.data() : {};
            const studentRef = db.collection("moduleStudents").doc(moduleId).collection("students").doc(payload.studentNumber);
            const studentSnap = await tx.get(studentRef);
            const sData = studentSnap.exists ? studentSnap.data() : {};
            // compute new sessionStats
            const currentBuckets = ssData?.checkinBuckets || { "0-1": 0, "1-3": 0, "3-5": 0, "5-10": 0, ">10": 0 };
            currentBuckets[bucket] = (currentBuckets[bucket] || 0) + 1;
            const newSessionStats = {
                sessionId: payload.sessionId,
                attendanceCount: (ssData?.attendanceCount || 0) + 1,
                checkinBuckets: currentBuckets,
                medianCheckinMinutes: ssData?.medianCheckinMinutes || null,
                lastUpdated: firestore_1.FieldValue.serverTimestamp()
            };
            // compute new moduleStats
            const msBuckets = msData?.latenessBuckets || { "0-1": 0, "1-3": 0, "3-5": 0, "5-10": 0, ">10": 0 };
            msBuckets[bucket] = (msBuckets[bucket] || 0) + 1;
            const day = createdAt.toLocaleString("en-US", { weekday: "short" });
            const hour = String(createdAt.getHours()).padStart(2, "0");
            const heatKey = `${day}_${hour}`;
            const week = weekKey(createdAt);
            const newHeatmap = Object.assign({}, msData?.heatmap || {});
            newHeatmap[heatKey] = newHeatmap[heatKey] || { sessions: 0, totalAttendance: 0 };
            newHeatmap[heatKey].totalAttendance = (newHeatmap[heatKey].totalAttendance || 0) + 1;
            const newWeekly = Object.assign({}, msData?.weekly || {});
            newWeekly[week] = newWeekly[week] || { sessions: 0, totalAttendance: 0 };
            newWeekly[week].totalAttendance = (newWeekly[week].totalAttendance || 0) + 1;
            const newModuleStats = {
                moduleId,
                computedAt: firestore_1.FieldValue.serverTimestamp(),
                windowDays: msData?.windowDays || 30,
                sessionsCount: msData?.sessionsCount || 0,
                avgAttendance: msData?.avgAttendance || null,
                totalAttendance: (msData?.totalAttendance || 0) + 1,
                medianCheckinMinutes: msData?.medianCheckinMinutes || null,
                checkinCurvePercent: msData?.checkinCurvePercent || null,
                latenessBuckets: msBuckets,
                heatmap: newHeatmap,
                weekly: newWeekly
            };
            const wasLate = mins * 60 > (session.settings?.windowSeconds || 60);
            const updatedStudent = {
                studentNumber: payload.studentNumber,
                attendedCount: (sData?.attendedCount || 0) + 1,
                lateCount: (sData?.lateCount || 0) + (wasLate ? 1 : 0),
                lastSeenAt: firestore_1.FieldValue.serverTimestamp()
            };
            // now perform writes (all reads already done)
            tx.set(attendanceRef, record);
            tx.update(sessionRef, { "stats.submissionsCount": firestore_1.FieldValue.increment(1) });
            tx.set(sessionStatsRef, newSessionStats, { merge: true });
            tx.set(moduleStatsRef, newModuleStats, { merge: true });
            tx.set(studentRef, updatedStudent, { merge: true });
        });
        res.status(200).json({ ok: true, message: "Attendance recorded" });
    }
    catch (error) {
        const code = error?.code;
        const message = error?.message || "Unknown error";
        switch (code) {
            case "already-exists":
                res.status(409).json({ error: "Already submitted" });
                break;
            case "permission-denied":
                res.status(403).json({ error: message });
                break;
            case "failed-precondition":
                res.status(400).json({ error: message });
                break;
            case "not-found":
                res.status(404).json({ error: message });
                break;
            default:
                applyCorsHeaders(req, res);
                res.status(500).json({ error: message });
                break;
        }
    }
});
exports.endSession = (0, https_1.onCall)({ cors: callableCors }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Lecturer must be signed in.");
    const lecturerId = req.auth.uid;
    const sessionId = String(req.data?.sessionId || "").trim();
    if (!sessionId)
        throw new https_1.HttpsError("invalid-argument", "sessionId required");
    const sessionRef = db.collection(sessionsCollection).doc(sessionId);
    const snapshot = await sessionRef.get();
    if (!snapshot.exists)
        throw new https_1.HttpsError("not-found", "Session not found");
    const session = snapshot.data();
    if (session.lecturerId !== lecturerId)
        throw new https_1.HttpsError("permission-denied", "Forbidden");
    await sessionRef.update({
        isActive: false,
        endedAt: firestore_1.FieldValue.serverTimestamp()
    });
    return { ok: true };
});
const clampWindowSeconds = (value, fallback) => {
    if (!Number.isFinite(value) || value <= 0)
        return fallback;
    const max = 30 * 60; // cap at 30 minutes for safety
    return Math.max(30, Math.min(Math.floor(value), max));
};
exports.renewSessionQr = (0, https_1.onCall)({ cors: callableCors }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Lecturer must be signed in.");
    const lecturerId = req.auth.uid;
    const sessionId = String(req.data?.sessionId || "").trim();
    const requestedWindow = Number(req.data?.windowSeconds ?? 0);
    if (!sessionId)
        throw new https_1.HttpsError("invalid-argument", "sessionId required");
    const sessionRef = db.collection(sessionsCollection).doc(sessionId);
    const privateRef = db.collection(sessionsPrivateCollection).doc(sessionId);
    const result = await db.runTransaction(async (tx) => {
        const sessionSnap = await tx.get(sessionRef);
        if (!sessionSnap.exists)
            throw new https_1.HttpsError("not-found", "Session not found");
        const session = sessionSnap.data();
        if (session.lecturerId !== lecturerId)
            throw new https_1.HttpsError("permission-denied", "Forbidden");
        if (!session.isActive)
            throw new https_1.HttpsError("failed-precondition", "Session ended");
        const baseWindow = Number(session.settings?.windowSeconds ?? 0) || 60;
        const windowSeconds = clampWindowSeconds(requestedWindow, baseWindow);
        const newExpiresAt = new Date(Date.now() + windowSeconds * 1000);
        const nextToken = generateQrToken();
        const nextHash = (0, hash_1.hashCode)(nextToken);
        tx.update(sessionRef, {
            expiresAt: newExpiresAt,
            qr: {
                tokenHash: nextHash,
                expiresAt: newExpiresAt,
                lastRotatedAt: firestore_1.FieldValue.serverTimestamp()
            }
        });
        tx.set(privateRef, {
            lecturerId,
            qrTokenPlain: nextToken,
            qrExpiresAt: newExpiresAt,
            lastRotatedAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
        return { expiresAt: newExpiresAt, token: nextToken };
    });
    return {
        ok: true,
        qrToken: result.token,
        expiresAt: result.expiresAt.toISOString()
    };
});
exports.extendSessionWindow = (0, https_1.onCall)({ cors: callableCors }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Lecturer must be signed in.");
    const lecturerId = req.auth.uid;
    const sessionId = String(req.data?.sessionId || "").trim();
    const extensionSeconds = Number(req.data?.extensionSeconds ?? 0);
    if (!sessionId)
        throw new https_1.HttpsError("invalid-argument", "sessionId required");
    if (!Number.isFinite(extensionSeconds) || extensionSeconds <= 0) {
        throw new https_1.HttpsError("invalid-argument", "extensionSeconds must be positive");
    }
    const sessionRef = db.collection(sessionsCollection).doc(sessionId);
    const privateRef = db.collection(sessionsPrivateCollection).doc(sessionId);
    const result = await db.runTransaction(async (tx) => {
        const sessionSnap = await tx.get(sessionRef);
        if (!sessionSnap.exists)
            throw new https_1.HttpsError("not-found", "Session not found");
        const session = sessionSnap.data();
        if (session.lecturerId !== lecturerId)
            throw new https_1.HttpsError("permission-denied", "Forbidden");
        if (!session.isActive)
            throw new https_1.HttpsError("failed-precondition", "Session ended");
        const currentExpiresAt = session.expiresAt?.toDate ? session.expiresAt.toDate() : new Date(session.expiresAt);
        const extraSeconds = clampWindowSeconds(extensionSeconds, extensionSeconds);
        const newExpiresAt = new Date(currentExpiresAt.getTime() + extraSeconds * 1000);
        tx.update(sessionRef, {
            expiresAt: newExpiresAt,
            "qr.expiresAt": newExpiresAt
        });
        tx.set(privateRef, {
            lecturerId,
            qrExpiresAt: newExpiresAt
        }, { merge: true });
        return newExpiresAt;
    });
    return {
        ok: true,
        expiresAt: result.toISOString()
    };
});
exports.exportSessionCsv = (0, https_1.onCall)({ cors: callableCors }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Lecturer must be signed in.");
    const lecturerId = req.auth.uid;
    const sessionId = String(req.data?.sessionId || "").trim();
    const templateValue = String(req.data?.template || "standard").trim().toLowerCase();
    const template = ["minimal", "standard", "pdf"].includes(templateValue)
        ? templateValue
        : "standard";
    if (!sessionId)
        throw new https_1.HttpsError("invalid-argument", "sessionId required");
    const sessionRef = db.collection(sessionsCollection).doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists)
        throw new https_1.HttpsError("not-found", "Session not found");
    const session = sessionSnap.data();
    if (session.lecturerId !== lecturerId)
        throw new https_1.HttpsError("permission-denied", "Forbidden");
    const attendanceSnap = await sessionRef.collection("attendance").get();
    const rows = [];
    attendanceSnap.forEach((doc) => rows.push(doc.data()));
    if (template === "pdf") {
        const buffer = await (0, pdf_1.toPdfBuffer)({ session, rows });
        return {
            ok: true,
            filename: `${session.moduleCode || sessionId}-${Date.now()}.pdf`,
            contentType: "application/pdf",
            fileContents: buffer.toString("base64")
        };
    }
    const buffer = (0, csv_1.toCsvBuffer)({ session, rows, template });
    return {
        ok: true,
        filename: `${session.moduleCode || sessionId}-${Date.now()}.csv`,
        contentType: "text/csv",
        fileContents: buffer.toString("base64")
    };
});
// Upload roster CSV for a module: expects { moduleId, csv }
exports.uploadRoster = (0, https_1.onCall)({ cors: callableCors }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Lecturer must be signed in.");
    const lecturerId = req.auth.uid;
    const moduleId = String(req.data?.moduleId || "").trim();
    const csv = String(req.data?.csv || "").trim();
    if (!moduleId)
        throw new https_1.HttpsError("invalid-argument", "moduleId required");
    if (!csv)
        throw new https_1.HttpsError("invalid-argument", "csv required");
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length)
        return { ok: true, imported: 0 };
    // assume header: studentNumber,name,surname,email
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((l) => l.split(",").map((c) => c.trim()));
    const batch = db.batch();
    let imported = 0;
    for (const row of rows) {
        const obj = {};
        header.forEach((col, idx) => (obj[col] = row[idx] || ""));
        const studentNumber = obj.studentnumber || obj.studentNumber || obj.id || obj.number;
        if (!studentNumber)
            continue;
        imported++;
        const docRef = db.collection("moduleRosters").doc(moduleId).collection("students").doc(String(studentNumber));
        batch.set(docRef, {
            studentNumber: String(studentNumber),
            name: obj.name || "",
            surname: obj.surname || "",
            email: obj.email || "",
            importedBy: lecturerId,
            importedAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
    }
    await batch.commit();
    return { ok: true, imported };
});
// Admin callable to trigger analytics recompute immediately
exports.recomputeModuleStatsNow = (0, https_1.onCall)({ cors: callableCors }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be signed in to run recompute");
    const days = Number(req.data?.days ?? 30);
    if (!Number.isFinite(days) || days <= 0)
        throw new https_1.HttpsError("invalid-argument", "days must be positive");
    try {
        const res = await (0, analytics_1.recomputeModuleStats)(db, Math.floor(days));
        return { ok: true, result: res };
    }
    catch (err) {
        console.error("recomputeModuleStatsNow failed:", err);
        throw new https_1.HttpsError("internal", "Recompute failed");
    }
});
// Edit attendance with audit logging
exports.editAttendance = (0, https_1.onCall)({ cors: callableCors }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be signed in");
    const actor = req.auth.uid;
    const sessionId = String(req.data?.sessionId || "").trim();
    const studentNumber = String(req.data?.studentNumber || "").trim();
    const action = String(req.data?.action || "").trim(); // 'markPresent' | 'remove' | 'edit'
    const fields = req.data?.fields || {};
    const reason = String(req.data?.reason || "").trim();
    if (!sessionId)
        throw new https_1.HttpsError("invalid-argument", "sessionId required");
    if (!studentNumber)
        throw new https_1.HttpsError("invalid-argument", "studentNumber required");
    if (!["markPresent", "remove", "edit"].includes(action))
        throw new https_1.HttpsError("invalid-argument", "invalid action");
    if (!reason)
        throw new https_1.HttpsError("invalid-argument", "reason required");
    const sessionRef = db.collection("sessions").doc(sessionId);
    const attendanceRef = sessionRef.collection("attendance").doc(studentNumber);
    const auditRef = sessionRef.collection("audit").doc();
    try {
        await db.runTransaction(async (tx) => {
            const sessSnap = await tx.get(sessionRef);
            if (!sessSnap.exists)
                throw new https_1.HttpsError("not-found", "Session not found");
            const sess = sessSnap.data();
            if (sess.lecturerId !== actor)
                throw new https_1.HttpsError("permission-denied", "Forbidden");
            const attSnap = await tx.get(attendanceRef);
            const before = attSnap.exists ? attSnap.data() : null;
            let after = before ? { ...before } : null;
            if (action === "remove") {
                if (!attSnap.exists)
                    throw new https_1.HttpsError("not-found", "Attendance not found");
                tx.delete(attendanceRef);
                // decrement counters if present
                tx.set(sessionRef, { "stats.submissionsCount": firestore_1.FieldValue.increment(-1) }, { merge: true });
                const moduleId = sess.moduleId || sess.moduleCode || "unknown";
                const studentDoc = db.collection("moduleStudents").doc(moduleId).collection("students").doc(studentNumber);
                tx.set(studentDoc, { attendedCount: firestore_1.FieldValue.increment(-1) }, { merge: true });
                after = null;
            }
            else if (action === "markPresent") {
                const now = new Date();
                const record = Object.assign({ studentNumber, status: "Present", submittedAt: now }, fields);
                tx.set(attendanceRef, record, { merge: true });
                if (!attSnap.exists) {
                    tx.set(sessionRef, { "stats.submissionsCount": firestore_1.FieldValue.increment(1) }, { merge: true });
                    const moduleId = sess.moduleId || sess.moduleCode || "unknown";
                    const studentDoc = db.collection("moduleStudents").doc(moduleId).collection("students").doc(studentNumber);
                    tx.set(studentDoc, { attendedCount: firestore_1.FieldValue.increment(1), lastSeenAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
                }
                after = record;
            }
            else if (action === "edit") {
                if (!attSnap.exists)
                    throw new https_1.HttpsError("not-found", "Attendance not found");
                const updated = { ...attSnap.data(), ...fields };
                tx.set(attendanceRef, updated, { merge: true });
                after = updated;
            }
            // write audit entry
            const entry = {
                actor,
                action,
                studentNumber,
                reason,
                before: before || null,
                after: after || null,
                createdAt: firestore_1.FieldValue.serverTimestamp()
            };
            tx.set(auditRef, entry);
        });
        return { ok: true };
    }
    catch (err) {
        console.error("editAttendance failed:", err);
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError("internal", "edit failed");
    }
});
// Export module summary PDF (callable)
exports.exportModulePdf = (0, https_1.onCall)({ cors: callableCors }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Lecturer must be signed in.");
    const lecturerId = req.auth.uid;
    const moduleId = String(req.data?.moduleId || "").trim();
    if (!moduleId)
        throw new https_1.HttpsError("invalid-argument", "moduleId required");
    const moduleStatsRef = db.collection("moduleStats").doc(moduleId);
    const msSnap = await moduleStatsRef.get();
    if (!msSnap.exists)
        throw new https_1.HttpsError("not-found", "Module stats not found");
    const moduleStats = msSnap.data();
    // fetch top absentees (lowest consistency)
    const studentsRef = db.collection("moduleStudents").doc(moduleId).collection("students").orderBy("consistencyPercent", "asc").limit(50);
    const studentsSnap = await studentsRef.get();
    const topAbsentees = [];
    studentsSnap.forEach((d) => topAbsentees.push(d.data()));
    // fetch recent sessions (for context)
    const sessionsSnap = await db.collection("sessions").where("moduleId", "==", moduleId).orderBy("createdAt", "desc").limit(50).get();
    const sessions = [];
    sessionsSnap.forEach((s) => sessions.push(Object.assign({ sessionId: s.id }, s.data())));
    const buffer = await (0, pdf_1.toModulePdfBuffer)({ moduleStats, topAbsentees, sessions });
    return {
        ok: true,
        filename: `${moduleId}-summary-${Date.now()}.pdf`,
        contentType: "application/pdf",
        fileContents: buffer.toString("base64")
    };
});
// Nightly scheduled analytics recompute (runs at 02:00 server time)
exports.nightlyAnalyticsRecompute = (0, scheduler_1.onSchedule)("0 2 * * *", async (event) => {
    try {
        const res = await (0, analytics_1.recomputeModuleStats)(db, 30);
        console.log("nightlyAnalyticsRecompute completed:", res);
    }
    catch (err) {
        console.error("nightlyAnalyticsRecompute failed:", err);
    }
});
