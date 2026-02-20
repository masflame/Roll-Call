"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionRef = getSessionRef;
const sessionsCollection = "sessions";
function getSessionRef(db, sessionId) {
    return db.collection(sessionsCollection).doc(sessionId);
}
