"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCreateSession = validateCreateSession;
exports.validateAttendancePayload = validateAttendancePayload;
const https_1 = require("firebase-functions/v2/https");
const allowedWindows = [30, 60, 120, 300];
function validateCreateSession(data) {
    const moduleId = String(data?.moduleId || "").trim();
    const moduleCode = String(data?.moduleCode || "").trim();
    const title = data?.title ? String(data.title).trim() : "";
    const windowSeconds = Number(data?.windowSeconds || 0);
    const requireClassCode = Boolean(data?.requireClassCode);
    const classCodeRotationSeconds = Number(data?.classCodeRotationSeconds || 30);
    if (!moduleId)
        throw new https_1.HttpsError("invalid-argument", "moduleId required");
    if (!moduleCode)
        throw new https_1.HttpsError("invalid-argument", "moduleCode required");
    if (!allowedWindows.includes(windowSeconds)) {
        throw new https_1.HttpsError("invalid-argument", "windowSeconds must be 30, 60, 120, or 300");
    }
    const requiredFields = {
        studentNumber: true,
        name: Boolean(data?.requiredFields?.name),
        surname: Boolean(data?.requiredFields?.surname),
        initials: Boolean(data?.requiredFields?.initials),
        email: Boolean(data?.requiredFields?.email),
        group: Boolean(data?.requiredFields?.group)
    };
    // allow only 30 or 60 for rotating class code
    if (requireClassCode && ![30, 60].includes(classCodeRotationSeconds)) {
        throw new https_1.HttpsError("invalid-argument", "classCodeRotationSeconds must be 30 or 60");
    }
    return { moduleId, moduleCode, title, windowSeconds, requiredFields, requireClassCode, classCodeRotationSeconds };
}
function validateAttendancePayload(body) {
    const sessionId = String(body?.sessionId || "").trim();
    const studentNumber = String(body?.studentNumber || "").trim();
    const classCode = body?.classCode ? String(body.classCode).trim() : undefined;
    const token = body?.token ? String(body.token).trim() : undefined;
    if (!sessionId)
        throw new https_1.HttpsError("invalid-argument", "sessionId required");
    if (!studentNumber)
        throw new https_1.HttpsError("invalid-argument", "studentNumber required");
    if (studentNumber.length < 4 || studentNumber.length > 20) {
        throw new https_1.HttpsError("invalid-argument", "studentNumber length invalid");
    }
    if (!token)
        throw new https_1.HttpsError("invalid-argument", "token required");
    const payload = { sessionId, studentNumber, token };
    if (classCode)
        payload.classCode = classCode;
    ["name", "surname", "initials", "email", "group"].forEach((key) => {
        if (body?.[key]) {
            payload[key] = String(body[key]).trim();
        }
    });
    return payload;
}
