"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitByIp = rateLimitByIp;
const firestore_1 = require("firebase-admin/firestore");
const config_1 = require("../config");
async function rateLimitByIp(db, ip, windowSeconds, maxRequests) {
    const sanitized = ip.replace(/[^a-zA-Z0-9.:-]/g, "_");
    const ref = db.collection(config_1.RATE_LIMIT_COLLECTION).doc(sanitized);
    const now = Date.now();
    return db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) {
            tx.set(ref, {
                count: 1,
                resetAt: now + windowSeconds * 1000,
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            });
            return { ok: true };
        }
        const data = snapshot.data() || {};
        const resetAt = Number(data.resetAt || 0);
        if (now > resetAt) {
            tx.set(ref, {
                count: 1,
                resetAt: now + windowSeconds * 1000,
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            });
            return { ok: true };
        }
        const count = Number(data.count || 0) + 1;
        if (count > maxRequests) {
            return { ok: false };
        }
        tx.update(ref, {
            count,
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        });
        return { ok: true };
    });
}
