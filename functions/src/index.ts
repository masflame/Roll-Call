import * as admin from "firebase-admin";
import { getAuth } from "firebase-admin/auth";
import * as crypto from "crypto";
const nodemailer: any = require("nodemailer");
import { FieldValue, Firestore, Transaction, QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import { onCall, onRequest, HttpsError, CallableRequest, Request, Response } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";

import { hashCode, safeEquals } from "./utils/hash";
import { toCsvBuffer } from "./utils/csv";
import { stringify } from "csv-stringify/sync";
import { toPdfBuffer, toModulePdfBuffer } from "./utils/pdf";
import { generateTotpWindows, generateTotp } from "./utils/totp";
import { rateLimitByIp } from "./utils/rateLimit";
import { validateAttendancePayload, validateCreateSession } from "./utils/validators";
import { recomputeModuleStats } from "./utils/analytics";
// import JSZip via require to avoid runtime interop issues in Cloud Functions
let JSZip: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  JSZip = require("jszip");
} catch (e: any) {
  console.warn("JSZip not available:", (e as any)?.stack || (e as any)?.message || e);
}

// haversine distance (meters)
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000; // earth radius meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getCheckinBucket(mins: number) {
  if (mins <= 1) return "0-1";
  if (mins <= 3) return "1-3";
  if (mins <= 5) return "3-5";
  if (mins <= 10) return "5-10";
  return ">10";
}

function weekKey(d: Date) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+tmp - +yearStart) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

admin.initializeApp();

const db: Firestore = getFirestore();

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

const applyCorsHeaders = (req: Request, res: Response) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
};

const QR_TOKEN_BYTES = 16;

const randomBytes = crypto.randomBytes as unknown as (size: number) => Buffer;

const generateQrToken = (): string => randomBytes(QR_TOKEN_BYTES).toString("hex");

// Email transporter (optional) — configure via env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, FRONTEND_ORIGIN
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
let emailTransporter: any = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER) {
  try {
    emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE) === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } catch (e) {
    console.warn("Failed to create email transporter:", (e as any)?.stack || (e as any)?.message || e);
    emailTransporter = null;
  }
}

export const createSession = onCall({ cors: callableCors }, async (req: CallableRequest<Record<string, unknown>>) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Lecturer must be signed in.");

  const lecturerId = req.auth.uid;
  const payload = validateCreateSession(req.data);

  const sessionRef = db.collection(sessionsCollection).doc();
  const privateRef = db.collection(sessionsPrivateCollection).doc(sessionRef.id);

  const now = Date.now();
  const expiresAt = new Date(now + payload.windowSeconds * 1000);
  const qrToken = generateQrToken();
  const qrTokenHash = hashCode(qrToken);
  const classCode = payload.requireClassCode ? String(Math.floor(1000 + Math.random() * 9000)) : undefined;
  const classCodeHash = classCode ? hashCode(classCode) : undefined;
  const classCodeRotationSeconds = payload.classCodeRotationSeconds || (payload.requireClassCode ? 30 : undefined);
  // generate a secret for rotating PINs (hex)
  const classCodeSecret = payload.requireClassCode ? randomBytes(10).toString("hex") : undefined;

  await db.runTransaction(async (tx: Transaction) => {
    tx.set(sessionRef, {
      lecturerId,
      moduleId: payload.moduleId,
      offeringId: payload.offeringId || null,
      groupId: payload.groupId || null,
      moduleCode: payload.moduleCode,
      title: payload.title,
      requiredFields: payload.requiredFields,
      settings: {
        windowSeconds: payload.windowSeconds,
        blockDuplicates: true,
        requireClassCode: payload.requireClassCode
      },
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
      isActive: true,
      endedAt: null,
      stats: {
        submissionsCount: 0
      },
      qr: {
        tokenHash: qrTokenHash,
        expiresAt,
        lastRotatedAt: FieldValue.serverTimestamp()
      }
    });

    const privateData: Record<string, any> = {
      lecturerId,
      classCodeHash: classCodeHash ?? null,
      classCodePlain: classCode ?? null,
      qrTokenPlain: qrToken,
      qrExpiresAt: expiresAt,
      createdAt: FieldValue.serverTimestamp(),
      lastRotatedAt: FieldValue.serverTimestamp()
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

// Callable: create session on behalf of owner using active moduleAccess
export const createSessionAsOwner = onCall({ cors: callableCors }, async (req: CallableRequest<Record<string, any>>) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in to create delegated sessions");
  const actorUid = req.auth.uid;
  const params = req.data || {};
  const accessId = String(params.accessId || "").trim();
  if (!accessId) throw new HttpsError("invalid-argument", "accessId required");

  // validate session payload using same validator used by createSession
  const payload = validateCreateSession(req.data);

  // load access
  const accessRef = db.collection("moduleAccess").doc(accessId);
  const aSnap = await accessRef.get();
  if (!aSnap.exists) throw new HttpsError("not-found", "Access record not found");
  const access = aSnap.data() as any;

  // check active and not expired
  if (access.status !== "ACTIVE") throw new HttpsError("permission-denied", "Access not active");
  if (access.expiresAt && access.expiresAt.toDate && access.expiresAt.toDate() < new Date()) throw new HttpsError("permission-denied", "Access expired");

  // role-based permission: only allow roles that can create sessions
  const allowedRoles = ["CO_LECTURER", "TA", "OWNER", "LECTURER"];
  if (!access.role || !allowedRoles.includes(String(access.role))) throw new HttpsError("permission-denied", "Insufficient delegate role to create sessions");

  // owner must exist
  const ownerUid = access.ownerUid;
  if (!ownerUid) throw new HttpsError("not-found", "Owner not found for access");

  // create session as owner (lecturerId set to ownerUid) and annotate delegate metadata
  const sessionRef = db.collection(sessionsCollection).doc();
  const privateRef = db.collection(sessionsPrivateCollection).doc(sessionRef.id);

  const now = Date.now();
  const expiresAt = new Date(now + payload.windowSeconds * 1000);
  const qrToken = generateQrToken();
  const qrTokenHash = hashCode(qrToken);
  const classCode = payload.requireClassCode ? String(Math.floor(1000 + Math.random() * 9000)) : undefined;
  const classCodeHash = classCode ? hashCode(classCode) : undefined;
  const classCodeRotationSeconds = payload.classCodeRotationSeconds || (payload.requireClassCode ? 30 : undefined);
  const classCodeSecret = payload.requireClassCode ? randomBytes(10).toString("hex") : undefined;

  await db.runTransaction(async (tx: Transaction) => {
    tx.set(sessionRef, {
      lecturerId: ownerUid,
      moduleId: payload.moduleId,
      offeringId: payload.offeringId || null,
      groupId: payload.groupId || null,
      moduleCode: payload.moduleCode,
      title: payload.title,
      requiredFields: payload.requiredFields,
      settings: {
        windowSeconds: payload.windowSeconds,
        blockDuplicates: true,
        requireClassCode: payload.requireClassCode
      },
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
      isActive: true,
      endedAt: null,
      stats: { submissionsCount: 0 },
      qr: { tokenHash: qrTokenHash, expiresAt, lastRotatedAt: FieldValue.serverTimestamp() },
      // delegated metadata
      delegated: {
        actorUid,
        accessId,
        role: access.role || null,
        actedAt: FieldValue.serverTimestamp()
      }
    });

    const privateData: Record<string, any> = {
      lecturerId: ownerUid,
      classCodeHash: classCodeHash ?? null,
      classCodePlain: classCode ?? null,
      qrTokenPlain: qrToken,
      qrExpiresAt: expiresAt,
      createdAt: FieldValue.serverTimestamp(),
      lastRotatedAt: FieldValue.serverTimestamp()
    };
    if (classCodeSecret) {
      privateData.classCodeSecret = classCodeSecret;
      privateData.classCodeRotationSeconds = classCodeRotationSeconds;
      delete privateData.classCodePlain;
    }

    tx.set(privateRef, privateData);

    // audit log
    const auditRef = db.collection("auditLogs").doc();
    tx.set(auditRef, {
      actorUid,
      actorRole: access.role || null,
      ownerUid: ownerUid,
      moduleId: payload.moduleId || null,
      action: "CREATE_SESSION_DELEGATED",
      targetId: sessionRef.id,
      createdAt: FieldValue.serverTimestamp(),
      meta: { accessId }
    });
  });

  return { sessionId: sessionRef.id, expiresAt: expiresAt.toISOString(), classCode, qrToken };
});

// Callable: update module configuration on behalf of owner (delegated edit)
export const updateModuleAsOwner = onCall({ cors: callableCors }, async (req: CallableRequest<Record<string, any>>) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in to update module as owner");
  const actorUid = req.auth.uid;
  const data = req.data || {};
  const accessId = String(data.accessId || "").trim();
  const moduleId = String(data.moduleId || "").trim();
  const updates = data.updates || {};
  if (!accessId || !moduleId) throw new HttpsError("invalid-argument", "accessId and moduleId required");

  const accessRef = db.collection("moduleAccess").doc(accessId);
  const aSnap = await accessRef.get();
  if (!aSnap.exists) throw new HttpsError("not-found", "Access record not found");
  const access = aSnap.data() as any;
  if (access.status !== "ACTIVE") throw new HttpsError("permission-denied", "Access not active");
  if (access.expiresAt && access.expiresAt.toDate && access.expiresAt.toDate() < new Date()) throw new HttpsError("permission-denied", "Access expired");

  // only co-lecturer or owner-level roles can edit module config
  const editRoles = ["CO_LECTURER", "OWNER", "LECTURER", "FULL"];
  if (!access.role || !editRoles.includes(String(access.role))) throw new HttpsError("permission-denied", "Insufficient delegate role to edit module");

  const moduleRef = db.collection("modules").doc(moduleId);
  const modSnap = await moduleRef.get();
  if (!modSnap.exists) throw new HttpsError("not-found", "Module not found");

  // owner check
  const ownerUid = access.ownerUid;
  if (!ownerUid) throw new HttpsError("not-found", "Owner not found for access");

  // Apply updates in a transaction and add audit log
  await db.runTransaction(async (tx: Transaction) => {
    tx.update(moduleRef, updates);
    const auditRef = db.collection("auditLogs").doc();
    tx.set(auditRef, {
      actorUid,
      actorRole: access.role || null,
      ownerUid,
      moduleId,
      action: "EDIT_MODULE_DELEGATED",
      targetId: moduleId,
      createdAt: FieldValue.serverTimestamp(),
      meta: { accessId, updates }
    });
  });

  return { success: true };
});

// Callable: delegate leaves access (grantee action)
export const leaveAccess = onCall({ cors: callableCors }, async (req: CallableRequest<Record<string, any>>) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in to leave access");
  const actorUid = req.auth.uid;
  const data = req.data || {};
  const accessId = String(data.accessId || "").trim();
  if (!accessId) throw new HttpsError("invalid-argument", "accessId required");

  const accessRef = db.collection("moduleAccess").doc(accessId);
  const aSnap = await accessRef.get();
  if (!aSnap.exists) throw new HttpsError("not-found", "Access not found");
  const access = aSnap.data() as any;

  // only grantee can leave via this callable
  if (!access.granteeUid || String(access.granteeUid) !== actorUid) {
    throw new HttpsError("permission-denied", "Only the grantee may leave this access");
  }

  await db.runTransaction(async (tx: Transaction) => {
    tx.update(accessRef, { status: 'LEFT', lastUsedAt: FieldValue.serverTimestamp() });
    const auditRef = db.collection('auditLogs').doc();
    tx.set(auditRef, {
      actorUid,
      actorRole: access.role || null,
      ownerUid: access.ownerUid || null,
      moduleId: access.moduleId || null,
      action: 'DELEGATE_LEFT',
      targetId: accessId,
      createdAt: FieldValue.serverTimestamp(),
      meta: {}
    });
  });

  // notify owner
  try {
    if (access.ownerUid) {
      await db.collection('notifications').add({
        userId: access.ownerUid,
        sender: 'system',
        type: 'DELEGATE_LEFT',
        message: `${(req.auth as any).token?.name || actorUid} left delegated access`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  } catch (e) { console.warn('notify owner failed', e); }

  return { success: true };
});

// Callable: owner revokes access (owner action)
export const revokeAccessAsOwner = onCall({ cors: callableCors }, async (req: CallableRequest<Record<string, any>>) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in to revoke access");
  const actorUid = req.auth.uid;
  const data = req.data || {};
  const accessId = String(data.accessId || "").trim();
  if (!accessId) throw new HttpsError("invalid-argument", "accessId required");

  const accessRef = db.collection('moduleAccess').doc(accessId);
  const aSnap = await accessRef.get();
  if (!aSnap.exists) throw new HttpsError('not-found', 'Access not found');
  const access = aSnap.data() as any;

  // only owner/creator can revoke
  if (String(access.ownerUid) !== actorUid && String(access.createdByUid) !== actorUid) {
    throw new HttpsError('permission-denied', 'Not authorized to revoke this access');
  }

  await db.runTransaction(async (tx: Transaction) => {
    tx.update(accessRef, { status: 'REVOKED', lastUsedAt: FieldValue.serverTimestamp() });
    const auditRef = db.collection('auditLogs').doc();
    tx.set(auditRef, {
      actorUid,
      actorRole: access.role || null,
      ownerUid: access.ownerUid || null,
      moduleId: access.moduleId || null,
      action: 'ACCESS_REVOKED',
      targetId: accessId,
      createdAt: FieldValue.serverTimestamp(),
      meta: {}
    });
  });

  // notify grantee
  try {
    if (access.granteeUid) {
      await db.collection('notifications').add({
        userId: access.granteeUid,
        sender: 'system',
        type: 'ACCESS_REVOKED',
        message: `${(req.auth as any).token?.name || actorUid} revoked delegated access`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  } catch (e) { console.warn('notify grantee failed', e); }

  return { success: true };
});

// Callable: generate export bundle (CSV files). Returns base64-encoded CSVs in response.
export const generateExportBundle = onCall({ cors: callableCors }, async (req: CallableRequest<Record<string, unknown>>) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in to generate exports");
  const userId = req.auth.uid;
  const params = req.data || {};
  // support both single moduleId and array of moduleIds
  const moduleId = params.moduleId ? String(params.moduleId) : null;
  const moduleIds = Array.isArray(params.moduleIds) && params.moduleIds.length ? params.moduleIds.map((x: any) => String(x)) : null;
  const offeringId = params.offeringId ? String(params.offeringId) : null;
  const groupId = params.groupId ? String(params.groupId) : null;
  const dateFrom = params.startDate ? new Date(String(params.startDate)) : params.dateFrom ? new Date(String(params.dateFrom)) : null;
  const dateTo = params.endDate ? new Date(String(params.endDate)) : params.dateTo ? new Date(String(params.dateTo)) : null;
  const studentNumber = params.studentNumber ? String(params.studentNumber) : null;
  const scope = params.scope ? String(params.scope) : (moduleIds ? `modules:${moduleIds.join(",")}` : moduleId ? `module:${moduleId}` : `date_range:${dateFrom?.toISOString() || ''}..${dateTo?.toISOString() || ''}`);

  const exportId = crypto.randomUUID();
  const generatedAt = new Date().toISOString();
  const systemVersion = "1.0.0";

  console.log("generateExportBundle called by", userId, "params:", JSON.stringify(params));

  // helper: CSV encode and base64
  const csvFromRows = (columns: string[], rows: any[]) => {
    const csv = stringify(rows, { header: true, columns });
    const bom = "\uFEFF";
    return Buffer.from(bom + csv, "utf-8").toString("base64");
  };

  try {
    // 1) Query sessions based on params
    let sessionsQuery = db.collection(sessionsCollection) as FirebaseFirestore.Query;
    if (moduleIds && moduleIds.length > 0) {
      // Firestore 'in' supports up to 10 values
      const slice = moduleIds.slice(0, 10);
      sessionsQuery = sessionsQuery.where("moduleId", "in", slice as any);
    } else if (moduleId) {
      sessionsQuery = sessionsQuery.where("moduleId", "==", moduleId);
    }
    if (offeringId) sessionsQuery = sessionsQuery.where("offeringId", "==", offeringId);
    if (groupId) sessionsQuery = sessionsQuery.where("groupId", "==", groupId);
    if (dateFrom) sessionsQuery = sessionsQuery.where("scheduledAt", ">=", dateFrom);
    if (dateTo) sessionsQuery = sessionsQuery.where("scheduledAt", "<=", dateTo);

    const sessionsSnap = await sessionsQuery.get();
    const sessions: any[] = [];
    sessionsSnap.forEach((s) => sessions.push({ id: s.id, ...(s.data() as any) }));

    // Build sessions.csv rows
    const sessionsColumns = [
      "export_id",
      "export_generated_at",
      "export_generated_by_user_id",
      "export_scope",
      "system_version",
      "session_id",
      "module_code",
      "session_title",
      "lecturer_id",
      "scheduled_start_at",
      "started_at",
      "ended_at",
      "is_active",
      "status",
      "window_seconds",
      "expected_roster_count",
      "submissions_count",
      "unique_students_count",
      "absent_count",
      "attendance_rate_pct",
      "last_submission_at"
    ];

    const sessionsRows: any[] = [];
    for (const s of sessions) {
      const stats = s.stats || {};
      const expected = s.expectedRosterCount || null;
      const submissions = Number(stats.submissionsCount || 0);
      const unique = Number(stats.uniqueStudentsCount || submissions);
      const absent = expected !== null ? Math.max(0, (expected - submissions)) : "";
      const rate = expected ? (submissions / Math.max(1, expected)) * 100 : "";

      sessionsRows.push({
        export_id: exportId,
        export_generated_at: generatedAt,
        export_generated_by_user_id: userId,
        export_scope: scope,
        system_version: systemVersion,
        session_id: s.id,
        module_code: s.moduleCode || s.moduleId || "",
        session_title: s.title || "",
        lecturer_id: s.lecturerId || "",
        scheduled_start_at: s.scheduledAt ? (s.scheduledAt.toDate ? s.scheduledAt.toDate().toISOString() : new Date(s.scheduledAt).toISOString()) : "",
        started_at: s.startedAt ? (s.startedAt.toDate ? s.startedAt.toDate().toISOString() : new Date(s.startedAt).toISOString()) : "",
        ended_at: s.endedAt ? (s.endedAt.toDate ? s.endedAt.toDate().toISOString() : new Date(s.endedAt).toISOString()) : "",
        is_active: Boolean(s.isActive),
        status: s.status || (s.isActive ? "live" : "ended"),
        window_seconds: s.settings?.windowSeconds ?? "",
        expected_roster_count: expected ?? "",
        submissions_count: submissions,
        unique_students_count: unique,
        absent_count: absent,
        attendance_rate_pct: typeof rate === "number" ? Number(rate.toFixed(2)) : "",
        last_submission_at: s.stats?.lastSubmissionAt ? (s.stats.lastSubmissionAt.toDate ? s.stats.lastSubmissionAt.toDate().toISOString() : new Date(s.stats.lastSubmissionAt).toISOString()) : ""
      });
    }

    const sessionsCsv = csvFromRows(sessionsColumns, sessionsRows);

    // 2) attendance_events.csv (event-level)
    const attendanceColumns = [
      "export_id",
      "export_generated_at",
      "export_generated_by_user_id",
      "export_scope",
      "system_version",
      "session_id",
      "attendance_event_id",
      "submitted_at",
      "student_number",
      "name",
      "surname",
      "initials",
      "email",
      "group",
      "status",
      "captured_via",
      "pin_required",
      "pin_validated",
      "device_fingerprint_hash",
      "user_agent",
      "ip_hash",
      "approx_geo",
      "integrity_flags"
    ];

    const attendanceRows: any[] = [];
    for (const s of sessions) {
      const attSnap = await db.collection(sessionsCollection).doc(s.id).collection("attendance").get();
      attSnap.forEach((d: QueryDocumentSnapshot<DocumentData>) => {
        const dat: any = d.data();
        if (studentNumber && String(dat.studentNumber) !== studentNumber) return;
        const audit = dat.audit || {};
        attendanceRows.push({
          export_id: exportId,
          export_generated_at: generatedAt,
          export_generated_by_user_id: userId,
          export_scope: scope,
          system_version: systemVersion,
          session_id: s.id,
          attendance_event_id: d.id,
          submitted_at: dat.submittedAt ? (dat.submittedAt.toDate ? dat.submittedAt.toDate().toISOString() : new Date(dat.submittedAt).toISOString()) : "",
          student_number: dat.studentNumber || "",
          name: dat.name || "",
          surname: dat.surname || "",
          initials: dat.initials || "",
          email: dat.email || "",
          group: dat.group || "",
          status: dat.status || "Present",
          captured_via: dat.capturedVia || "",
          pin_required: !!s.settings?.requireClassCode,
          pin_validated: !!dat.pinValidated,
          device_fingerprint_hash: (audit.fingerprintHash || ""),
          user_agent: String(audit.userAgent || "").slice(0, 1024),
          ip_hash: audit.ip ? hashCode(String(audit.ip)) : "",
          approx_geo: audit.approxGeo || "",
          integrity_flags: JSON.stringify(dat.integrity || dat.integrityFlags || [])
        });
      });
    }

    const attendanceCsv = csvFromRows(attendanceColumns, attendanceRows);

    // 3) attendance_matrix_long.csv
    const matrixColumns = [
      "export_id",
      "export_generated_at",
      "export_generated_by_user_id",
      "export_scope",
      "system_version",
      "module_code",
      "class_label",
      "group_label",
      "student_number",
      "session_id",
      "session_title",
      "session_date",
      "submitted_at",
      "status"
    ];

    const matrixRows: any[] = [];
    for (const row of attendanceRows) {
      const sMeta = sessions.find((x) => x.id === row.session_id) || {};
      matrixRows.push({
        export_id: exportId,
        export_generated_at: generatedAt,
        export_generated_by_user_id: userId,
        export_scope: scope,
        system_version: systemVersion,
        module_code: sMeta.moduleCode || sMeta.moduleId || "",
        class_label: sMeta.classLabel || "",
        group_label: sMeta.groupLabel || "",
        student_number: row.student_number,
        session_id: row.session_id,
        session_title: sMeta.title || "",
        session_date: sMeta.scheduledAt ? (sMeta.scheduledAt.toDate ? sMeta.scheduledAt.toDate().toISOString().slice(0,10) : new Date(sMeta.scheduledAt).toISOString().slice(0,10)) : "",
        submitted_at: row.submitted_at,
        status: row.status
      });
    }

    const matrixCsv = csvFromRows(matrixColumns, matrixRows);

    // 4) module_delivery_summary.csv (aggregate per module)
    const deliveryColumns = ["export_id","export_generated_at","export_generated_by_user_id","export_scope","system_version","module_code","planned_sessions_count","delivered_sessions_count","avg_attendance_pct"];
    const deliveryRows: any[] = [];
    if (moduleId) {
      const planned = (sessions || []).length;
      const delivered = sessions.filter((s) => !!s.startedAt).length;
      const avg = sessions.reduce((acc, s) => acc + (s.stats?.submissionsCount || 0), 0) / Math.max(1, delivered || 1);
      deliveryRows.push({ export_id: exportId, export_generated_at: generatedAt, export_generated_by_user_id: userId, export_scope: scope, system_version: systemVersion, module_code: moduleId, planned_sessions_count: planned, delivered_sessions_count: delivered, avg_attendance_pct: Number((avg || 0).toFixed(2)) });
    }
    const deliveryCsv = csvFromRows(deliveryColumns, deliveryRows);

    // 5) lecturer_activity.csv (aggregate by lecturer across sessions set)
    const lectColumns = ["export_id","export_generated_at","export_generated_by_user_id","export_scope","system_version","lecturer_user_id","sessions_delivered","avg_attendance_pct","total_submissions"];
    const lectRows: any[] = [];
    const lecturersMap: Record<string, any> = {};
    sessions.forEach((s) => {
      const lid = s.lecturerId || "unknown";
      lecturersMap[lid] = lecturersMap[lid] || { sessions: 0, submissions: 0 };
      lecturersMap[lid].sessions += 1;
      lecturersMap[lid].submissions += Number(s.stats?.submissionsCount || 0);
    });
    Object.entries(lecturersMap).forEach(([lid, data]) => {
      const avg = data.sessions ? data.submissions / data.sessions : 0;
      lectRows.push({ export_id: exportId, export_generated_at: generatedAt, export_generated_by_user_id: userId, export_scope: scope, system_version: systemVersion, lecturer_user_id: lid, sessions_delivered: data.sessions, avg_attendance_pct: Number(avg.toFixed(2)), total_submissions: data.submissions });
    });
    const lectCsv = csvFromRows(lectColumns, lectRows);

    // 6) anomalies.csv from integrity docs
    const anomaliesColumns = ["export_id","export_generated_at","export_generated_by_user_id","export_scope","system_version","session_id","student_number","anomaly_type","severity","detected_at","evidence"];
    const anomaliesRows: any[] = [];
    for (const s of sessions) {
      const intSnap = await db.collection(sessionsCollection).doc(s.id).collection("integrity").get();
      intSnap.forEach((d: QueryDocumentSnapshot<DocumentData>) => {
        const it = d.data() as any;
        anomaliesRows.push({ export_id: exportId, export_generated_at: generatedAt, export_generated_by_user_id: userId, export_scope: scope, system_version: systemVersion, session_id: s.id, student_number: it.studentNumber || "", anomaly_type: it.type || "", severity: it.severity || "", detected_at: it.createdAt ? (it.createdAt.toDate ? it.createdAt.toDate().toISOString() : new Date(it.createdAt).toISOString()) : "", evidence: JSON.stringify(it) });
      });
    }
    const anomaliesCsv = csvFromRows(anomaliesColumns, anomaliesRows);

    // README.txt
    const readme = `RollCall_Audit Export\nexport_id: ${exportId}\ngenerated_at: ${generatedAt}\nexported_by: ${userId}\nscope: ${scope}\nsystem_version: ${systemVersion}\n\nFiles included:\n- sessions.csv\n- attendance_events.csv\n- attendance_matrix_long.csv\n- module_delivery_summary.csv\n- lecturer_activity.csv\n- anomalies.csv\n`;

    // build files array as buffers
    const files = [
      { name: "sessions.csv", buf: Buffer.from(sessionsCsv, "base64") },
      { name: "attendance_events.csv", buf: Buffer.from(attendanceCsv, "base64") },
      { name: "attendance_matrix_long.csv", buf: Buffer.from(matrixCsv, "base64") },
      { name: "module_delivery_summary.csv", buf: Buffer.from(deliveryCsv, "base64") },
      { name: "lecturer_activity.csv", buf: Buffer.from(lectCsv, "base64") },
      { name: "anomalies.csv", buf: Buffer.from(anomaliesCsv, "base64") },
      { name: "README.txt", buf: Buffer.from(readme, "utf-8") }
    ];

    // create zip with JSZip (wrap for clearer errors)
    try {
      const zip = new JSZip();
      for (const f of files) {
        zip.file(f.name, f.buf);
      }
      const zipBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      const zipBase64 = zipBuf.toString("base64");

      return {
        exportId,
        generatedAt,
        zip: { name: `rollcall_export_${exportId}.zip`, contentBase64: zipBase64 },
        files: files.map((f) => ({ name: f.name }))
      };
    } catch (zipErr: any) {
      console.error("generateExportBundle: ZIP creation failed", zipErr && (zipErr.stack || zipErr.message || zipErr));
      throw new HttpsError("internal", `Failed to create ZIP: ${zipErr?.message || String(zipErr)}`);
    }
  } catch (err: any) {
    console.error("generateExportBundle error", err && (err.stack || err.message || err));
    const msg = err?.message || String(err) || "unknown error";
    throw new HttpsError("internal", `Failed to generate export bundle: ${msg}`);
  }
});

// Create invite (callable) - generates secure token, stores tokenHash, creates moduleAccess+invite, sends email
export const createInvite = onCall({ cors: callableCors }, async (req: CallableRequest<Record<string, any>>) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in to create invites");
  const uid = req.auth.uid;
  const authName = ((req.auth as any)?.token?.name) || req.auth.uid;
  const data = req.data || {};
  const granteeEmail = String(data.granteeEmail || "").trim().toLowerCase();
  const role = String(data.role || "TA");
  const moduleIds = Array.isArray(data.moduleIds) ? data.moduleIds.map(String) : [];
  const expiresInDays = Number(data.expiresInDays || 90);

  if (!granteeEmail) throw new HttpsError("invalid-argument", "granteeEmail is required");

  // Authorization: verify requester owns the listed modules (if provided)
  if (moduleIds.length > 0) {
    for (const mId of moduleIds) {
      const mDoc = await db.collection("modules").doc(mId).get();
      if (!mDoc.exists) throw new HttpsError("not-found", `Module ${mId} not found`);
      const m = mDoc.data() || {};
      const owner = m.lecturerId || m.ownerUid || null;
      if (owner !== uid) throw new HttpsError("permission-denied", "Not authorized for one or more modules");
    }
  }

  // Generate token and tokenHash
  const token = randomBytes(24).toString("hex");
  const tokenHash = hashCode(token);

  // compute expiresAt timestamp
  const expiresAt = new Date(Date.now() + Math.max(1, expiresInDays) * 24 * 60 * 60 * 1000);

  // create moduleAccess doc
  const accessRef = await db.collection("moduleAccess").add({
    moduleId: moduleIds.length === 1 ? moduleIds[0] : null,
    ownerUid: uid,
    granteeUid: null,
    granteeEmail,
    granteeName: null,
    role,
    scope: moduleIds.length ? { modules: moduleIds } : { ALL: true },
    status: "PENDING",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    createdByUid: uid,
    lastUsedAt: null,
  });

  // create invite with tokenHash
  const inviteRef = await db.collection("invites").add({
    accessId: accessRef.id,
    tokenHash,
    granteeEmail,
    expiresAt,
    createdAt: FieldValue.serverTimestamp(),
    acceptedAt: null,
    acceptedByUid: null,
  });

  // create notification for existing user account if present
  try {
    let targetUid: string | null = null;
    try {
      const userRecord = await getAuth().getUserByEmail(granteeEmail);
      targetUid = userRecord.uid;
    } catch (authErr) {
      // not found in Auth — fall back to users collection lookup
      try {
        const usersQ = await db.collection("users").where("email", "==", granteeEmail).limit(1).get();
        if (!usersQ.empty) targetUid = usersQ.docs[0].id;
      } catch (e) {
        console.warn("users collection lookup failed", e);
      }
    }

    if (targetUid) {
      await db.collection("notifications").add({
        userId: targetUid,
        sender: "system",
        type: "INVITE",
        message: `${authName} invited you to access modules as ${role}`,
        read: false,
        meta: { inviteId: inviteRef.id },
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  } catch (e) {
    console.warn("notify creation failed", (e as any)?.stack || (e as any)?.message || e);
  }

  // send email with link if transporter available
  try {
    if (emailTransporter) {
      const acceptLink = `${FRONTEND_ORIGIN}/accept-invite?inviteId=${inviteRef.id}&token=${token}`;
      const mail = {
        from: process.env.EMAIL_FROM || process.env.SMTP_USER,
        to: granteeEmail,
        subject: `You've been invited to access modules on RollCall`,
        text: `${authName} invited you to access modules as ${role}. Accept: ${acceptLink}`,
        html: `<p>${authName} invited you to access modules as <strong>${role}</strong>.</p><p><a href="${acceptLink}">Accept invite</a></p>`,
      };
      await emailTransporter.sendMail(mail);
    }
  } catch (e) {
    console.warn("send invite email failed", (e as any)?.stack || (e as any)?.message || e);
  }

  return { inviteId: inviteRef.id };
});

// Accept invite (callable) - verify token, attach granteeUid, create audit log
export const acceptInvite = onCall({ cors: callableCors }, async (req: CallableRequest<Record<string, any>>) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in to accept invites");
  const uid = req.auth.uid;
  const data = req.data || {};
  const inviteId = String(data.inviteId || "");
  const token = data.token ? String(data.token) : null;
  if (!inviteId) throw new HttpsError("invalid-argument", "inviteId required");

  const invRef = db.collection("invites").doc(inviteId);
  const invSnap = await invRef.get();
  if (!invSnap.exists) throw new HttpsError("not-found", "Invite not found");
  const inv = invSnap.data() as any;

  // check expiry
  if (inv.expiresAt && inv.expiresAt.toDate && inv.expiresAt.toDate() < new Date()) {
    throw new HttpsError("failed-precondition", "Invite expired");
  }

  // verify token OR allow if authenticated user's email matches granteeEmail
  const authEmail = ((req.auth as any)?.token?.email) ? String((req.auth as any).token.email).toLowerCase() : null;
  if (inv.tokenHash) {
    if (!token) {
      // allow acceptance when signed-in user email matches invite email
      if (!authEmail || authEmail !== String(inv.granteeEmail || "").toLowerCase()) {
        throw new HttpsError("permission-denied", "Token required to accept this invite");
      }
    } else {
      if (!safeEquals(inv.tokenHash, token)) {
        throw new HttpsError("permission-denied", "Invalid token");
      }
    }
  } else {
    // legacy invites may store plain token field or no hash; allow accept if email matches
    if (inv.token) {
      if (!token || token !== inv.token) {
        if (!authEmail || authEmail !== String(inv.granteeEmail || "").toLowerCase()) {
          throw new HttpsError("permission-denied", "Invalid invite token");
        }
      }
    } else {
      // no token present: allow only if email matches
      if (!authEmail || authEmail !== String(inv.granteeEmail || "").toLowerCase()) {
        throw new HttpsError("permission-denied", "Invite requires email verification or token");
      }
    }
  }

  // load moduleAccess
  const accessRef = db.collection("moduleAccess").doc(inv.accessId);
  const aSnap = await accessRef.get();
  if (!aSnap.exists) throw new HttpsError("not-found", "Access record not found");
  const access = aSnap.data() as any;

  // perform updates in transaction
  await db.runTransaction(async (tx: Transaction) => {
    tx.update(accessRef, {
      granteeUid: uid,
      granteeName: ((req.auth as any)?.token?.name) || null,
      status: "ACTIVE",
      lastUsedAt: FieldValue.serverTimestamp(),
    });
    tx.update(invRef, {
      acceptedAt: FieldValue.serverTimestamp(),
      acceptedByUid: uid,
    });
    // audit log
    const auditRef = db.collection("auditLogs").doc();
    tx.set(auditRef, {
      actorUid: uid,
      actorRole: access.role || null,
      ownerUid: access.ownerUid || null,
      moduleId: access.moduleId || null,
      action: "INVITE_ACCEPT",
      targetId: accessRef.id,
      createdAt: FieldValue.serverTimestamp(),
      meta: {},
    });
  });

  // notify owner
  try {
    if (access.ownerUid) {
      await db.collection("notifications").add({
        userId: access.ownerUid,
        sender: "system",
        type: "INVITE_ACCEPTED",
        message: `${((req.auth as any)?.token?.name) || req.auth.uid} accepted your delegate invite`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  } catch (e) {
    console.warn('notify owner failed', e);
  }

  return { success: true, accessId: accessRef.id };
});

// scheduled starter: runs every minute and starts queued schedules whose time has arrived
export const scheduledAutoStart = onSchedule("every 1 minutes", async (event: any) => {
  try {
    const now = new Date();
    const snaps = await db.collection("schedules").where("status", "==", "queued").where("scheduledAt", "<=", now).get();
    if (snaps.empty) return;
    for (const sDoc of snaps.docs) {
      const s = sDoc.data() as any;
      try {
        const lecturerId = s.lecturerId;
        const moduleId = s.moduleId;
        let moduleCode = s.moduleCode || "";
        if (!moduleCode && moduleId) {
          const modSnap = await db.collection("modules").doc(moduleId).get();
          if (modSnap.exists) moduleCode = (modSnap.data() as any).moduleCode || "";
        }

        const payload: any = {
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
        const qrTokenHash = hashCode(qrToken);

        const classCode = payload.requireClassCode ? String(Math.floor(1000 + Math.random() * 9000)) : undefined;
        const classCodeHash = classCode ? hashCode(classCode) : undefined;
        const classCodeRotationSeconds = payload.classCodeRotationSeconds || (payload.requireClassCode ? 30 : undefined);
        const classCodeSecret = payload.requireClassCode ? randomBytes(10).toString("hex") : undefined;

        await db.runTransaction(async (tx: Transaction) => {
          tx.set(sessionRef, {
            lecturerId,
            moduleId: payload.moduleId,
            offeringId: payload.offeringId || null,
            groupId: payload.groupId || null,
            moduleCode: payload.moduleCode,
            title: payload.title,
            requiredFields: payload.requiredFields,
            settings: {
              windowSeconds: payload.windowSeconds,
              blockDuplicates: true,
              requireClassCode: payload.requireClassCode
            },
            createdAt: FieldValue.serverTimestamp(),
            expiresAt,
            isActive: true,
            endedAt: null,
            stats: { submissionsCount: 0 },
            qr: { tokenHash: qrTokenHash, expiresAt, lastRotatedAt: FieldValue.serverTimestamp() }
          });

          const privateData: Record<string, any> = {
            lecturerId,
            classCodeHash: classCodeHash ?? null,
            classCodePlain: classCode ?? null,
            qrTokenPlain: qrToken,
            qrExpiresAt: expiresAt,
            createdAt: FieldValue.serverTimestamp(),
            lastRotatedAt: FieldValue.serverTimestamp()
          };
          if (classCodeSecret) {
            privateData.classCodeSecret = classCodeSecret;
            privateData.classCodeRotationSeconds = classCodeRotationSeconds;
            delete privateData.classCodePlain;
          }

          tx.set(privateRef, privateData);
        });

        await db.collection("schedules").doc(sDoc.id).update({ status: "started", startedAt: FieldValue.serverTimestamp(), sessionId: sessionRef.id });
        console.log("scheduledAutoStart: started schedule", sDoc.id, "->", sessionRef.id);
      } catch (err) {
        console.error("scheduledAutoStart: failed for schedule", sDoc.id, err);
      }
    }
  } catch (err) {
    console.error("scheduledAutoStart: top-level error", err);
  }
});

// callable to return the current rotating class code (lecturer only)
export const getSessionPin = onCall({ cors: callableCors }, async (req: CallableRequest<Record<string, unknown>>) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Lecturer must be signed in.");
  const lecturerId = req.auth.uid;
  const sessionId = String(req.data?.sessionId || "").trim();
  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId required");

  const sessionRef = db.collection(sessionsCollection).doc(sessionId);
  const privateRef = db.collection(sessionsPrivateCollection).doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) throw new HttpsError("not-found", "Session not found");
  const session = sessionSnap.data() as any;
  let accessUsed: any = null;
  if (session.lecturerId !== lecturerId) {
    // allow active delegate with access
    accessUsed = await ensureOwnerOrActiveDelegate(req, session);
  }

  const privateSnap = await privateRef.get();
  if (!privateSnap.exists) throw new HttpsError("not-found", "Session private config missing");
  const privateData = privateSnap.data() as any;
  const secret = privateData.classCodeSecret;
  const rotation = Number(privateData.classCodeRotationSeconds || session.classCodeRotationSeconds || 30);
  if (!secret) throw new HttpsError("failed-precondition", "Rotating class code not enabled");

  const pin = generateTotp(secret, rotation, 4);

  // audit when delegate fetched pin
  try {
    if (accessUsed) {
      await db.collection('auditLogs').add({
        actorUid: req.auth!.uid,
        actorRole: accessUsed.role || null,
        ownerUid: accessUsed.ownerUid || session.lecturerId || null,
        moduleId: session.moduleId || null,
        action: 'GET_PIN_DELEGATED',
        targetId: sessionId,
        createdAt: FieldValue.serverTimestamp(),
        meta: { accessId: accessUsed.id }
      });
    }
  } catch (e) { console.warn('audit log failed for getSessionPin', e); }

  return { ok: true, pin, rotationSeconds: rotation };
});

export const submitAttendance = onRequest(async (req: Request, res: Response) => {
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

    const ipHeader = req.headers["x-forwarded-for"] as string | undefined;
    const ip = ipHeader?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";

    const limited = await rateLimitByIp(db, ip, 60, 40);
    if (!limited.ok) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    const payload = validateAttendancePayload(req.body);

    const sessionRef = db.collection(sessionsCollection).doc(payload.sessionId);
    const privateRef = db.collection(sessionsPrivateCollection).doc(payload.sessionId);
    const attendanceRef = sessionRef.collection("attendance").doc(payload.studentNumber);

    // validate session and token outside transaction so we can persist integrity logs on failure
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) throw new HttpsError("not-found", "Session not found");
    const session = sessionSnap.data() as Record<string, any>;
    if (!session.isActive) throw new HttpsError("failed-precondition", "Session ended");

    const expiresAt = session.expiresAt?.toDate ? session.expiresAt.toDate() : new Date(session.expiresAt);
    if (Date.now() > expiresAt.getTime()) throw new HttpsError("failed-precondition", "Session expired");

    if (!session.qr?.tokenHash) throw new HttpsError("failed-precondition", "QR code unavailable");

    const qrExpiresAt = session.qr.expiresAt?.toDate ? session.qr.expiresAt.toDate() : new Date(session.qr.expiresAt);
    if (Date.now() > qrExpiresAt.getTime()) {
      const integrityRef = sessionRef.collection("integrity").doc();
      await integrityRef.set({ type: "expired_qr", studentNumber: payload.studentNumber, createdAt: FieldValue.serverTimestamp() });
      const sessionStatsRef = db.collection("sessionStats").doc(payload.sessionId);
      await sessionStatsRef.set({ expiredAttempts: FieldValue.increment(1) }, { merge: true });
      const moduleIdTmp = session.moduleId || session.moduleCode || "unknown";
      const moduleStatsRef = db.collection("moduleStats").doc(moduleIdTmp);
      await moduleStatsRef.set({ expiredAttempts: FieldValue.increment(1) }, { merge: true });
      throw new HttpsError("failed-precondition", "QR code expired");
    }

    const tokenValid = safeEquals(session.qr.tokenHash, payload.token);
    if (!tokenValid) {
      console.error("submitAttendance: invalid_token", { sessionId: payload.sessionId, studentNumber: payload.studentNumber, providedTokenPreview: String(payload.token || "").slice(0, 12), tokenHashPreview: String(session.qr.tokenHash || "").slice(0, 12) });
      const integrityRef = sessionRef.collection("integrity").doc();
      await integrityRef.set({ type: "invalid_token", studentNumber: payload.studentNumber, createdAt: FieldValue.serverTimestamp() });
      const sessionStatsRef = db.collection("sessionStats").doc(payload.sessionId);
      await sessionStatsRef.set({ wrongTokenAttempts: FieldValue.increment(1) }, { merge: true });
      const moduleIdTmp = session.moduleId || session.moduleCode || "unknown";
      const moduleStatsRef = db.collection("moduleStats").doc(moduleIdTmp);
      await moduleStatsRef.set({ wrongTokenAttempts: FieldValue.increment(1) }, { merge: true });
      throw new HttpsError("permission-denied", "Invalid token");
    }

    if (session.settings?.requireClassCode) {
      const privateSnap = await privateRef.get();
      if (!privateSnap.exists) throw new HttpsError("internal", "Session configuration missing");
      const privateData = privateSnap.data() as Record<string, any>;
      // if rotating code is configured, validate TOTP-like PIN
      if (privateData.classCodeSecret && privateData.classCodeRotationSeconds) {
        // Accept current code and a single adjacent window to tolerate small clock skew
        const candidates = generateTotpWindows(privateData.classCodeSecret, Number(privateData.classCodeRotationSeconds), 4, 1);
        const provided = String(payload.classCode || "");
        const ok = candidates.includes(provided);
        if (!ok) {
          console.error("submitAttendance: wrong_pin", { sessionId: payload.sessionId, studentNumber: payload.studentNumber, provided, candidates });
          const integrityRef = sessionRef.collection("integrity").doc();
          await integrityRef.set({ type: "wrong_pin", studentNumber: payload.studentNumber, createdAt: FieldValue.serverTimestamp() });
          const sessionStatsRef = db.collection("sessionStats").doc(payload.sessionId);
          await sessionStatsRef.set({ wrongPinAttempts: FieldValue.increment(1) }, { merge: true });
          const moduleIdTmp = session.moduleId || session.moduleCode || "unknown";
          const moduleStatsRef = db.collection("moduleStats").doc(moduleIdTmp);
          await moduleStatsRef.set({ wrongPinAttempts: FieldValue.increment(1) }, { merge: true });
          throw new HttpsError("permission-denied", "Invalid class code");
        }
      } else {
        const ok = safeEquals(privateData.classCodeHash || "", String(payload.classCode || ""));
        if (!ok) {
        const integrityRef = sessionRef.collection("integrity").doc();
        await integrityRef.set({ type: "wrong_pin", studentNumber: payload.studentNumber, createdAt: FieldValue.serverTimestamp() });
        const sessionStatsRef = db.collection("sessionStats").doc(payload.sessionId);
        await sessionStatsRef.set({ wrongPinAttempts: FieldValue.increment(1) }, { merge: true });
        const moduleIdTmp = session.moduleId || session.moduleCode || "unknown";
        const moduleStatsRef = db.collection("moduleStats").doc(moduleIdTmp);
        await moduleStatsRef.set({ wrongPinAttempts: FieldValue.increment(1) }, { merge: true });
        throw new HttpsError("permission-denied", "Invalid class code");
      }
      }
    }

    // check duplicate outside transaction to avoid interleaving reads/writes
    const existing = await attendanceRef.get();
    if (existing.exists) {
      const integrityRef = sessionRef.collection("integrity").doc();
      await integrityRef.set({ type: "duplicate", studentNumber: payload.studentNumber, createdAt: FieldValue.serverTimestamp() });
      const sessionStatsRef = db.collection("sessionStats").doc(payload.sessionId);
      await sessionStatsRef.set({ blockedDuplicates: FieldValue.increment(1) }, { merge: true });
      const moduleIdTmp = session.moduleId || session.moduleCode || "unknown";
      const moduleStatsRef = db.collection("moduleStats").doc(moduleIdTmp);
      await moduleStatsRef.set({ blockedDuplicates: FieldValue.increment(1) }, { merge: true });
      throw new HttpsError("already-exists", "Already submitted");
    }

    const allowedFields = session.requiredFields || {};
    const submittedAt = new Date();

    // build a lightweight device fingerprint from UA + optional client metadata
    const ua = String(req.headers["user-agent"] || "");
    const sw = payload.screenWidth ? Number(payload.screenWidth) : undefined;
    const sh = payload.screenHeight ? Number(payload.screenHeight) : undefined;
    const tz = payload.timezone ? String(payload.timezone) : undefined;
    const fpRaw = `${ua}|${sw || ""}x${sh || ""}|${tz || ""}`;
    const fingerprintHash = hashCode(fpRaw);

    const record: Record<string, unknown> = {
      studentNumber: payload.studentNumber,
      status: "Present",
      submittedAt,
      audit: {
        ip,
        userAgent: ua,
        fingerprintHash,
        fingerprintPreview: {
          ua: ua.slice(0, 120),
          screen: sw && sh ? `${sw}x${sh}` : undefined,
          timezone: tz || undefined
        }
      }
    };

    // geolocation / geofence evaluation (if client sent coords)
    let geoMismatch = false;
    let geoEvidence: Record<string, any> | null = null;
    try {
      const loc: any = payload.location;
      if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
        // attach approx geo string
        (record.audit as any).approxGeo = `${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}±${Number(loc.accuracy || 0).toFixed(1)}m`;

        // determine configured geofence (session -> offering)
        let geofence = session.geofence || null;
        if (!geofence && session.offeringId) {
          try {
            const offSnap = await db.collection("offerings").doc(String(session.offeringId)).get();
            if (offSnap.exists) geofence = (offSnap.data() as any).geofence || null;
          } catch (e) {
            // ignore offering lookup errors
          }
        }

        if (geofence && geofence.lat && geofence.lng && geofence.radiusMeters) {
          const distance = haversineMeters(Number(loc.lat), Number(loc.lng), Number(geofence.lat), Number(geofence.lng));
          const buffer = Math.max(Number(loc.accuracy || 0), 25);
          const inside = distance <= (Number(geofence.radiusMeters) + buffer);
          (record.audit as any).geo = { inside, distanceMeters: Number(distance.toFixed(1)), radiusMeters: Number(geofence.radiusMeters), source: session.geofence ? 'session' : 'offering' };
          // if outside geofence, mark for integrity logging after write
          if (!inside) {
            geoMismatch = true;
            geoEvidence = { distanceMeters: Number(distance.toFixed(1)), radiusMeters: Number(geofence.radiusMeters), accuracy: Number(loc.accuracy || 0) };
          }
        }
      }
    } catch (e: any) {
      console.error("submitAttendance: geofence evaluation failed", e && (e.stack || e.message || e));
    }
    ["name", "surname", "initials", "email", "group"].forEach((key) => { if (allowedFields[key] && payload[key]) record[key] = payload[key]; });

    const createdAt = session.createdAt?.toDate ? session.createdAt.toDate() : new Date(session.createdAt);
    const mins = (submittedAt.getTime() - createdAt.getTime()) / 60000;
    const bucket = getCheckinBucket(mins);

    // now run a transaction that reads sessionStats/moduleStats/student before writing (all reads first)
    await db.runTransaction(async (tx: Transaction) => {
      const sessionStatsRef = db.collection("sessionStats").doc(payload.sessionId);
      const ssSnap = await tx.get(sessionStatsRef);
      const ssData = ssSnap.exists ? (ssSnap.data() as any) : {};

      const moduleId = session.moduleId || session.moduleCode || "unknown";
      const moduleStatsRef = db.collection("moduleStats").doc(moduleId);
      const msSnap = await tx.get(moduleStatsRef);
      const msData = msSnap.exists ? (msSnap.data() as any) : {};

      const studentRef = db.collection("moduleStudents").doc(moduleId).collection("students").doc(payload.studentNumber);
      const studentSnap = await tx.get(studentRef);
      const sData = studentSnap.exists ? (studentSnap.data() as any) : {};

      // compute new sessionStats
      const currentBuckets = ssData?.checkinBuckets || { "0-1": 0, "1-3": 0, "3-5": 0, "5-10": 0, ">10": 0 } as any;
      currentBuckets[bucket] = (currentBuckets[bucket] || 0) + 1;
      const newSessionStats: any = {
        sessionId: payload.sessionId,
        attendanceCount: (ssData?.attendanceCount || 0) + 1,
        checkinBuckets: currentBuckets,
        medianCheckinMinutes: ssData?.medianCheckinMinutes || null,
        lastUpdated: FieldValue.serverTimestamp()
      };

      // compute new moduleStats
      const msBuckets = msData?.latenessBuckets || { "0-1": 0, "1-3": 0, "3-5": 0, "5-10": 0, ">10": 0 } as any;
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
      const newModuleStats: any = {
        moduleId,
        computedAt: FieldValue.serverTimestamp(),
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
        lastSeenAt: FieldValue.serverTimestamp()
      } as any;

      // now perform writes (all reads already done)
      tx.set(attendanceRef, record);
      tx.update(sessionRef, { "stats.submissionsCount": FieldValue.increment(1) });
      tx.set(sessionStatsRef, newSessionStats, { merge: true });
      tx.set(moduleStatsRef, newModuleStats, { merge: true });
      tx.set(studentRef, updatedStudent, { merge: true });
    });

    // post-write: detect repeated submissions from same device/IP (flag if more than one submission)
    try {
      const byFp = fingerprintHash
        ? await sessionRef.collection("attendance").where("audit.fingerprintHash", "==", fingerprintHash).get()
        : null;
      const byIp = await sessionRef.collection("attendance").where("audit.ip", "==", ip).get();

      const fpCount = byFp ? byFp.size : 0;
      const ipCount = byIp.size;

      // flag when the same fingerprint or IP has more than one distinct submission
      if ((fingerprintHash && fpCount > 1) || ipCount > 1) {
        const integrityRef = sessionRef.collection("integrity").doc();
        await integrityRef.set({
          type: "proxy",
          reason: fingerprintHash && fpCount > 1 ? "fingerprint" : "ip",
          count: Math.max(fpCount, ipCount),
          fingerprintHash: fingerprintHash || null,
          ip: ip || null,
          createdAt: FieldValue.serverTimestamp()
        });
        const sessionStatsRef = db.collection("sessionStats").doc(payload.sessionId);
        await sessionStatsRef.set({ proxyFlags: FieldValue.increment(1) }, { merge: true });
      }
    } catch (err) {
      console.error("submitAttendance: proxy detection failed", err);
    }

    // if geofence check earlier flagged a mismatch, record integrity entry
    try {
      if ((geoMismatch || false) && geoEvidence) {
        const integrityRef = sessionRef.collection("integrity").doc();
        await integrityRef.set({
          type: "geo_mismatch",
          studentNumber: payload.studentNumber,
          evidence: geoEvidence,
          createdAt: FieldValue.serverTimestamp(),
          severity: "high"
        });
        const sessionStatsRef = db.collection("sessionStats").doc(payload.sessionId);
        await sessionStatsRef.set({ geoFlags: FieldValue.increment(1) }, { merge: true });
      }
    } catch (err: any) {
      console.error("submitAttendance: geo mismatch logging failed", err && (err.stack || err.message || err));
    }

    res.status(200).json({ ok: true, message: "Attendance recorded" });
  } catch (error: any) {
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

export const endSession = onCall({ cors: callableCors }, async (req: CallableRequest<Record<string, unknown>>) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Lecturer must be signed in.");

  const lecturerId = req.auth.uid;
  const sessionId = String(req.data?.sessionId || "").trim();
  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId required");

  const sessionRef = db.collection(sessionsCollection).doc(sessionId);
  const snapshot = await sessionRef.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Session not found");

  const session = snapshot.data() as Record<string, any>;
  let accessUsed: any = null;
  if (session.lecturerId !== lecturerId) {
    // allow active delegate with access
    accessUsed = await ensureOwnerOrActiveDelegate(req, session);
  }

  await sessionRef.update({
    isActive: false,
    endedAt: FieldValue.serverTimestamp()
  });

  // audit end session when delegated
  try {
    if (accessUsed) {
      await db.collection('auditLogs').add({
        actorUid: req.auth.uid,
        actorRole: accessUsed.role || null,
        ownerUid: accessUsed.ownerUid || session.lecturerId || null,
        moduleId: session.moduleId || null,
        action: 'END_SESSION_DELEGATED',
        targetId: sessionRef.id,
        createdAt: FieldValue.serverTimestamp(),
        meta: { accessId: accessUsed.id }
      });
    }
  } catch (e) { console.warn('audit log failed for endSession', e); }

  return { ok: true };
});

const clampWindowSeconds = (value: number, fallback: number): number => {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  const max = 30 * 60; // cap at 30 minutes for safety
  return Math.max(30, Math.min(Math.floor(value), max));
};

// Helper: allow action by session owner or an active delegate with valid access
async function ensureOwnerOrActiveDelegate(req: CallableRequest<Record<string, any>> | any, session: any) {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Must be signed in.");
  // owner shortcut
  if (session.lecturerId === uid) return null;

  // check provided accessId (prefer explicit request param, fallback to session.delegated.accessId)
  const accessId = String(req.data?.accessId || (session.delegated && session.delegated.accessId) || "").trim();
  console.log("ensureOwnerOrActiveDelegate: uid=", uid, "sessionLecturer=", session.lecturerId, "accessId=", accessId);
  if (!accessId) {
    console.warn("ensureOwnerOrActiveDelegate: no accessId provided and session not owned by caller");
    throw new HttpsError("permission-denied", "Forbidden");
  }

  const accessRef = db.collection('moduleAccess').doc(accessId);
  const aSnap = await accessRef.get();
  if (!aSnap.exists) {
    console.warn("ensureOwnerOrActiveDelegate: access record not found", accessId);
    throw new HttpsError('not-found', 'Access record not found');
  }
  const access = aSnap.data() as any;
  access.id = accessId;
  console.log("ensureOwnerOrActiveDelegate: access=", { id: accessId, status: access.status, ownerUid: access.ownerUid, granteeUid: access.granteeUid, role: access.role });

  if (access.status !== 'ACTIVE') {
    console.warn("ensureOwnerOrActiveDelegate: access not active", access.status);
    throw new HttpsError('permission-denied', 'Access not active');
  }
  if (access.expiresAt && access.expiresAt.toDate && access.expiresAt.toDate() < new Date()) {
    console.warn("ensureOwnerOrActiveDelegate: access expired", access.expiresAt.toDate());
    throw new HttpsError('permission-denied', 'Access expired');
  }

  // must be the grantee
  if (!access.granteeUid || String(access.granteeUid) !== String(uid)) {
    console.warn("ensureOwnerOrActiveDelegate: caller is not grantee", { caller: uid, granteeUid: access.granteeUid });
    throw new HttpsError('permission-denied', 'Forbidden');
  }

  // owner must match session owner
  if (access.ownerUid && String(access.ownerUid) !== String(session.lecturerId)) {
    console.warn("ensureOwnerOrActiveDelegate: access.ownerUid does not match session owner", { accessOwner: access.ownerUid, sessionOwner: session.lecturerId });
    throw new HttpsError('permission-denied', 'Forbidden');
  }

  // role check: allow typical delegate roles
  const allowedRoles = ["CO_LECTURER", "TA", "OWNER", "LECTURER", "FULL"];
  if (!access.role || !allowedRoles.includes(String(access.role))) {
    console.warn("ensureOwnerOrActiveDelegate: insufficient role", access.role);
    throw new HttpsError('permission-denied', 'Insufficient delegate role');
  }

  return access;
}

export const renewSessionQr = onCall({ cors: callableCors }, async (req: CallableRequest<Record<string, unknown>>) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Lecturer must be signed in.");

  const lecturerId = req.auth.uid;
  const sessionId = String(req.data?.sessionId || "").trim();
  const requestedWindow = Number(req.data?.windowSeconds ?? 0);
  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId required");

  const sessionRef = db.collection(sessionsCollection).doc(sessionId);
  const privateRef = db.collection(sessionsPrivateCollection).doc(sessionId);

  const result = await db.runTransaction(async (tx: Transaction) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) throw new HttpsError("not-found", "Session not found");

    const session = sessionSnap.data() as Record<string, any>;
    let accessUsed: any = null;
    if (session.lecturerId !== lecturerId) {
      // allow active delegate with access
      accessUsed = await ensureOwnerOrActiveDelegate(req, session);
    }
    if (!session.isActive) throw new HttpsError("failed-precondition", "Session ended");

    const baseWindow = Number(session.settings?.windowSeconds ?? 0) || 60;
    const windowSeconds = clampWindowSeconds(requestedWindow, baseWindow);

    const newExpiresAt = new Date(Date.now() + windowSeconds * 1000);
    const nextToken = generateQrToken();
    const nextHash = hashCode(nextToken);

    tx.update(sessionRef, {
      expiresAt: newExpiresAt,
      qr: {
        tokenHash: nextHash,
        expiresAt: newExpiresAt,
        lastRotatedAt: FieldValue.serverTimestamp()
      }
    });

    tx.set(
      privateRef,
      {
        lecturerId,
        qrTokenPlain: nextToken,
        qrExpiresAt: newExpiresAt,
        lastRotatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    // audit log for delegated renew
    try {
      if (accessUsed) {
        const auditRef = db.collection('auditLogs').doc();
        tx.set(auditRef, {
          actorUid: req.auth!.uid,
          actorRole: accessUsed.role || null,
          ownerUid: accessUsed.ownerUid || session.lecturerId || null,
          moduleId: session.moduleId || null,
          action: 'RENEW_QR_DELEGATED',
          targetId: sessionRef.id,
          createdAt: FieldValue.serverTimestamp(),
          meta: { accessId: accessUsed.id }
        });
      }
    } catch (e) { console.warn('audit log failed for renewSessionQr', e); }

    return { expiresAt: newExpiresAt, token: nextToken };
  });

  return {
    ok: true,
    qrToken: result.token,
    expiresAt: result.expiresAt.toISOString()
  };
});

export const extendSessionWindow = onCall({ cors: callableCors }, async (req: CallableRequest<Record<string, unknown>>) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Lecturer must be signed in.");

  const lecturerId = req.auth.uid;
  const sessionId = String(req.data?.sessionId || "").trim();
  const extensionSeconds = Number(req.data?.extensionSeconds ?? 0);

  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId required");
  if (!Number.isFinite(extensionSeconds) || extensionSeconds <= 0) {
    throw new HttpsError("invalid-argument", "extensionSeconds must be positive");
  }

  const sessionRef = db.collection(sessionsCollection).doc(sessionId);
  const privateRef = db.collection(sessionsPrivateCollection).doc(sessionId);

  const result = await db.runTransaction(async (tx: Transaction) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) throw new HttpsError("not-found", "Session not found");

    const session = sessionSnap.data() as Record<string, any>;
    let accessUsed: any = null;
    if (session.lecturerId !== lecturerId) {
      // allow active delegate with access
      accessUsed = await ensureOwnerOrActiveDelegate(req, session);
    }
    if (!session.isActive) throw new HttpsError("failed-precondition", "Session ended");

    const currentExpiresAt = session.expiresAt?.toDate ? session.expiresAt.toDate() : new Date(session.expiresAt);
    const extraSeconds = clampWindowSeconds(extensionSeconds, extensionSeconds);
    const newExpiresAt = new Date(currentExpiresAt.getTime() + extraSeconds * 1000);

    tx.update(sessionRef, {
      expiresAt: newExpiresAt,
      "qr.expiresAt": newExpiresAt
    });

    tx.set(
      privateRef,
      {
        lecturerId,
        qrExpiresAt: newExpiresAt
      },
      { merge: true }
    );

    // audit log for delegated extend
    try {
      if (accessUsed) {
        const auditRef = db.collection('auditLogs').doc();
        tx.set(auditRef, {
          actorUid: req.auth!.uid,
          actorRole: accessUsed.role || null,
          ownerUid: accessUsed.ownerUid || session.lecturerId || null,
          moduleId: session.moduleId || null,
          action: 'EXTEND_WINDOW_DELEGATED',
          targetId: sessionRef.id,
          createdAt: FieldValue.serverTimestamp(),
          meta: { accessId: accessUsed.id, extensionSeconds }
        });
      }
    } catch (e) { console.warn('audit log failed for extendSessionWindow', e); }

    return newExpiresAt;
  });

  return {
    ok: true,
    expiresAt: result.toISOString()
  };
});

type ExportTemplate = "minimal" | "standard" | "pdf";

export const exportSessionCsv = onCall({ cors: callableCors }, async (req: CallableRequest<Record<string, unknown>>) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Lecturer must be signed in.");

  const lecturerId = req.auth.uid;
  const sessionId = String(req.data?.sessionId || "").trim();
  const templateValue = String(req.data?.template || "standard").trim().toLowerCase();
  const template = ["minimal", "standard", "pdf"].includes(templateValue)
    ? (templateValue as ExportTemplate)
    : "standard";

  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId required");

  const sessionRef = db.collection(sessionsCollection).doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) throw new HttpsError("not-found", "Session not found");

  const session = sessionSnap.data() as Record<string, any>;
  if (session.lecturerId !== lecturerId) throw new HttpsError("permission-denied", "Forbidden");

  const attendanceSnap = await sessionRef.collection("attendance").get();
  const rows: Record<string, any>[] = [];
  attendanceSnap.forEach((doc: QueryDocumentSnapshot<DocumentData>) => rows.push(doc.data()));

  if (template === "pdf") {
    const buffer = await toPdfBuffer({ session, rows });
    return {
      ok: true,
      filename: `${session.moduleCode || sessionId}-${Date.now()}.pdf`,
      contentType: "application/pdf",
      fileContents: buffer.toString("base64")
    };
  }

  const buffer = toCsvBuffer({ session, rows, template });

  return {
    ok: true,
    filename: `${session.moduleCode || sessionId}-${Date.now()}.csv`,
    contentType: "text/csv",
    fileContents: buffer.toString("base64")
  };
});

// Upload roster CSV for a module: expects { moduleId, csv }
export const uploadRoster = onCall({ cors: callableCors }, async (req: CallableRequest<Record<string, unknown>>) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Lecturer must be signed in.");
  const lecturerId = req.auth.uid;
  const moduleId = String(req.data?.moduleId || "").trim();
  const csv = String(req.data?.csv || "").trim();
  if (!moduleId) throw new HttpsError("invalid-argument", "moduleId required");
  if (!csv) throw new HttpsError("invalid-argument", "csv required");

  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { ok: true, imported: 0 };

  // assume header: studentNumber,name,surname,email
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((l) => l.split(",").map((c) => c.trim()));

  const batch = db.batch();
  let imported = 0;
  for (const row of rows) {
    const obj: any = {};
    header.forEach((col, idx) => (obj[col] = row[idx] || ""));
    const studentNumber = obj.studentnumber || obj.studentNumber || obj.id || obj.number;
    if (!studentNumber) continue;
    imported++;
    const docRef = db.collection("moduleRosters").doc(moduleId).collection("students").doc(String(studentNumber));
    batch.set(docRef, {
      studentNumber: String(studentNumber),
      name: obj.name || "",
      surname: obj.surname || "",
      email: obj.email || "",
      importedBy: lecturerId,
      importedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  await batch.commit();
  return { ok: true, imported };
});

// Admin callable to trigger analytics recompute immediately
export const recomputeModuleStatsNow = onCall({ cors: callableCors }, async (req: CallableRequest<Record<string, unknown>>) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in to run recompute");
  const days = Number(req.data?.days ?? 30);
  if (!Number.isFinite(days) || days <= 0) throw new HttpsError("invalid-argument", "days must be positive");

  try {
    const res = await recomputeModuleStats(db, Math.floor(days));
    return { ok: true, result: res };
  } catch (err: any) {
    console.error("recomputeModuleStatsNow failed:", err);
    throw new HttpsError("internal", "Recompute failed");
  }
});

// Edit attendance with audit logging
export const editAttendance = onCall({ cors: callableCors }, async (req: CallableRequest<Record<string, unknown>>) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in");
  const actor = req.auth.uid;
  const sessionId = String(req.data?.sessionId || "").trim();
  const studentNumber = String(req.data?.studentNumber || "").trim();
  const action = String(req.data?.action || "").trim(); // 'markPresent' | 'remove' | 'edit'
  const fields = req.data?.fields || {};
  const reason = String(req.data?.reason || "").trim();

  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId required");
  if (!studentNumber) throw new HttpsError("invalid-argument", "studentNumber required");
  if (!["markPresent", "remove", "edit"].includes(action)) throw new HttpsError("invalid-argument", "invalid action");
  if (!reason) throw new HttpsError("invalid-argument", "reason required");

  const sessionRef = db.collection("sessions").doc(sessionId);
  const attendanceRef = sessionRef.collection("attendance").doc(studentNumber);
  const auditRef = sessionRef.collection("audit").doc();

  try {
    await db.runTransaction(async (tx: Transaction) => {
      const sessSnap = await tx.get(sessionRef);
      if (!sessSnap.exists) throw new HttpsError("not-found", "Session not found");
      const sess = sessSnap.data() as any;
      if (sess.lecturerId !== actor) throw new HttpsError("permission-denied", "Forbidden");

      const attSnap = await tx.get(attendanceRef);
      const before = attSnap.exists ? attSnap.data() : null;

      let after: Record<string, any> | null = before ? { ...before } : null;

      if (action === "remove") {
        if (!attSnap.exists) throw new HttpsError("not-found", "Attendance not found");
        tx.delete(attendanceRef);
        // decrement counters if present
        tx.set(sessionRef, { "stats.submissionsCount": FieldValue.increment(-1) }, { merge: true });
        const moduleId = sess.moduleId || sess.moduleCode || "unknown";
        const studentDoc = db.collection("moduleStudents").doc(moduleId).collection("students").doc(studentNumber);
        tx.set(studentDoc, { attendedCount: FieldValue.increment(-1) }, { merge: true });
        after = null;
      } else if (action === "markPresent") {
        const now = new Date();
        const record: any = Object.assign({ studentNumber, status: "Present", submittedAt: now }, fields);
        tx.set(attendanceRef, record, { merge: true });
        if (!attSnap.exists) {
          tx.set(sessionRef, { "stats.submissionsCount": FieldValue.increment(1) }, { merge: true });
          const moduleId = sess.moduleId || sess.moduleCode || "unknown";
          const studentDoc = db.collection("moduleStudents").doc(moduleId).collection("students").doc(studentNumber);
          tx.set(studentDoc, { attendedCount: FieldValue.increment(1), lastSeenAt: FieldValue.serverTimestamp() }, { merge: true });
        }
        after = record;
      } else if (action === "edit") {
        if (!attSnap.exists) throw new HttpsError("not-found", "Attendance not found");
        const updated = { ...(attSnap.data() as any), ...fields };
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
        createdAt: FieldValue.serverTimestamp()
      };
      tx.set(auditRef, entry);
    });

    return { ok: true };
  } catch (err: any) {
    console.error("editAttendance failed:", err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError("internal", "edit failed");
  }
});

// Export module summary PDF (callable)
export const exportModulePdf = onCall({ cors: callableCors }, async (req: CallableRequest<Record<string, unknown>>) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Lecturer must be signed in.");
  const lecturerId = req.auth.uid;
  const moduleId = String(req.data?.moduleId || "").trim();
  const offeringId = req.data?.offeringId ? String(req.data?.offeringId).trim() : undefined;
  const groupId = req.data?.groupId ? String(req.data?.groupId).trim() : undefined;
  if (!moduleId) throw new HttpsError("invalid-argument", "moduleId required");

  const moduleStatsRef = db.collection("moduleStats").doc(moduleId);
  const msSnap = await moduleStatsRef.get();
  if (!msSnap.exists) throw new HttpsError("not-found", "Module stats not found");
  const moduleStats = msSnap.data() as Record<string, any>;

  // fetch top absentees (lowest consistency)
  const studentsRef = db.collection("moduleStudents").doc(moduleId).collection("students").orderBy("consistencyPercent", "asc").limit(50);
  const studentsSnap = await studentsRef.get();
  const topAbsentees: Record<string, any>[] = [];
  studentsSnap.forEach((d: QueryDocumentSnapshot) => topAbsentees.push(d.data()));

  // fetch recent sessions (for context) — apply optional offering/group filters
  let sessionsQuery: any = db.collection("sessions").where("moduleId", "==", moduleId);
  if (offeringId && groupId) {
    sessionsQuery = sessionsQuery.where("offeringId", "==", offeringId).where("groupId", "==", groupId);
  } else if (offeringId) {
    sessionsQuery = sessionsQuery.where("offeringId", "==", offeringId);
  } else if (groupId) {
    sessionsQuery = sessionsQuery.where("groupId", "==", groupId);
  }
  const sessionsSnap = await sessionsQuery.orderBy("createdAt", "desc").limit(50).get();
  const sessions: any[] = [];
  sessionsSnap.forEach((s: QueryDocumentSnapshot) => sessions.push(Object.assign({ sessionId: s.id }, s.data())));

  const buffer = await toModulePdfBuffer({ moduleStats, topAbsentees, sessions });

  return {
    ok: true,
    filename: `${moduleId}-summary-${Date.now()}.pdf`,
    contentType: "application/pdf",
    fileContents: buffer.toString("base64")
  };
});

// Nightly scheduled analytics recompute (runs at 02:00 server time)
export const nightlyAnalyticsRecompute = onSchedule("0 2 * * *", async (event: any) => {
  try {
    const res = await recomputeModuleStats(db, 30);
    console.log("nightlyAnalyticsRecompute completed:", res);
  } catch (err) {
    console.error("nightlyAnalyticsRecompute failed:", err);
  }
});
