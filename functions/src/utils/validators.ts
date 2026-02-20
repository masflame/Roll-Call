import { HttpsError } from "firebase-functions/v2/https";

const allowedWindows = [30, 60, 120, 300];

export interface CreateSessionPayload {
  moduleId: string;
  moduleCode: string;
  title?: string;
  windowSeconds: number;
  requiredFields: Record<string, boolean>;
  requireClassCode: boolean;
  classCodeRotationSeconds?: number;
}

export interface AttendancePayload {
  sessionId: string;
  studentNumber: string;
  classCode?: string;
  token: string;
  [key: string]: unknown;
}

export function validateCreateSession(data: any): CreateSessionPayload {
  const moduleId = String(data?.moduleId || "").trim();
  const moduleCode = String(data?.moduleCode || "").trim();
  const title = data?.title ? String(data.title).trim() : "";
  const windowSeconds = Number(data?.windowSeconds || 0);
  const requireClassCode = Boolean(data?.requireClassCode);
  const classCodeRotationSeconds = Number(data?.classCodeRotationSeconds || 30);

  if (!moduleId) throw new HttpsError("invalid-argument", "moduleId required");
  if (!moduleCode) throw new HttpsError("invalid-argument", "moduleCode required");
  if (!allowedWindows.includes(windowSeconds)) {
    throw new HttpsError("invalid-argument", "windowSeconds must be 30, 60, 120, or 300");
  }

  const requiredFields: Record<string, boolean> = {
    studentNumber: true,
    name: Boolean(data?.requiredFields?.name),
    surname: Boolean(data?.requiredFields?.surname),
    initials: Boolean(data?.requiredFields?.initials),
    email: Boolean(data?.requiredFields?.email),
    group: Boolean(data?.requiredFields?.group)
  };

  // allow only 30 or 60 for rotating class code
  if (requireClassCode && ![30, 60].includes(classCodeRotationSeconds)) {
    throw new HttpsError("invalid-argument", "classCodeRotationSeconds must be 30 or 60");
  }

  return { moduleId, moduleCode, title, windowSeconds, requiredFields, requireClassCode, classCodeRotationSeconds };
}

export function validateAttendancePayload(body: any): AttendancePayload {
  const sessionId = String(body?.sessionId || "").trim();
  const studentNumber = String(body?.studentNumber || "").trim();
  const classCode = body?.classCode ? String(body.classCode).trim() : undefined;
  const token = body?.token ? String(body.token).trim() : undefined;

  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId required");
  if (!studentNumber) throw new HttpsError("invalid-argument", "studentNumber required");
  if (studentNumber.length < 4 || studentNumber.length > 20) {
    throw new HttpsError("invalid-argument", "studentNumber length invalid");
  }
  if (!token) throw new HttpsError("invalid-argument", "token required");

  const payload: AttendancePayload = { sessionId, studentNumber, token };
  if (classCode) payload.classCode = classCode;

  ["name", "surname", "initials", "email", "group"].forEach((key) => {
    if (body?.[key]) {
      payload[key] = String(body[key]).trim();
    }
  });

  return payload;
}
