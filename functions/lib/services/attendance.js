"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAttendanceCollection = getAttendanceCollection;
function getAttendanceCollection(db, sessionId) {
    return db.collection("sessions").doc(sessionId).collection("attendance");
}
