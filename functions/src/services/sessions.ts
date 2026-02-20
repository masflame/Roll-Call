import { Firestore } from "firebase-admin/firestore";

const sessionsCollection = "sessions";

export function getSessionRef(db: Firestore, sessionId: string) {
  return db.collection(sessionsCollection).doc(sessionId);
}
