import { Firestore, FieldValue, Transaction } from "firebase-admin/firestore";
import { RATE_LIMIT_COLLECTION } from "../config";

export async function rateLimitByIp(
  db: Firestore,
  ip: string,
  windowSeconds: number,
  maxRequests: number
): Promise<{ ok: boolean }> {
  const sanitized = ip.replace(/[^a-zA-Z0-9.:-]/g, "_");
  const ref = db.collection(RATE_LIMIT_COLLECTION).doc(sanitized);
  const now = Date.now();

  return db.runTransaction(async (tx: Transaction) => {
    const snapshot = await tx.get(ref);

    if (!snapshot.exists) {
      tx.set(ref, {
        count: 1,
        resetAt: now + windowSeconds * 1000,
        updatedAt: FieldValue.serverTimestamp()
      });
      return { ok: true };
    }

    const data = snapshot.data() || {};
    const resetAt = Number(data.resetAt || 0);

    if (now > resetAt) {
      tx.set(ref, {
        count: 1,
        resetAt: now + windowSeconds * 1000,
        updatedAt: FieldValue.serverTimestamp()
      });
      return { ok: true };
    }

    const count = Number(data.count || 0) + 1;
    if (count > maxRequests) {
      return { ok: false };
    }

    tx.update(ref, {
      count,
      updatedAt: FieldValue.serverTimestamp()
    });

    return { ok: true };
  });
}
