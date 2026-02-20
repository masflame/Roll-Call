import { Firestore } from "firebase-admin/firestore";

export function getAttendanceCollection(db: Firestore, sessionId: string) {
  return db.collection("sessions").doc(sessionId).collection("attendance");
}
