"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPdfBuffer = toPdfBuffer;
exports.toModulePdfBuffer = toModulePdfBuffer;
const pdfkit_1 = __importDefault(require("pdfkit"));
async function toPdfBuffer({ session, rows }) {
    return new Promise((resolve, reject) => {
        const doc = new pdfkit_1.default({ margin: 48, size: "A4" });
        const chunks = [];
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", (error) => reject(error));
        const moduleCode = session.moduleCode || "Session";
        const title = session.title || "Attendance Report";
        const generatedAt = new Date().toLocaleString();
        doc.fontSize(20).font("Helvetica-Bold").text(moduleCode, { align: "left" });
        if (title) {
            doc.moveDown(0.3);
            doc.fontSize(14).font("Helvetica").text(title, { align: "left" });
        }
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor("#666666").text(`Generated: ${generatedAt}`);
        doc.fillColor("#000000");
        doc.moveDown(1);
        doc.fontSize(12).font("Helvetica-Bold").text("Attendance", { underline: true });
        doc.moveDown(0.5);
        if (rows.length === 0) {
            doc.fontSize(12).font("Helvetica").text("No submissions recorded.");
            doc.end();
            return;
        }
        const header = ["#", "Student Number", "Name", "Surname", "Status", "Submitted At"];
        const columnWidths = [30, 120, 120, 120, 80, 120];
        const drawRow = (values, bold = false) => {
            values.forEach((value, index) => {
                const options = { continued: index < values.length - 1, width: columnWidths[index] };
                if (bold) {
                    doc.font("Helvetica-Bold").text(value, options);
                }
                else {
                    doc.font("Helvetica").text(value, options);
                }
            });
            doc.moveDown(0.2);
        };
        drawRow(header, true);
        doc.moveDown(0.2);
        rows.forEach((row, idx) => {
            const submittedAt = row.submittedAt?.toDate ? row.submittedAt.toDate().toISOString() : row.submittedAt || "";
            drawRow([
                String(idx + 1),
                row.studentNumber || "",
                row.name || "",
                row.surname || "",
                row.status || "Present",
                submittedAt
            ]);
            if (doc.y > doc.page.height - 72) {
                doc.addPage();
                drawRow(header, true);
                doc.moveDown(0.2);
            }
        });
        doc.end();
    });
}
async function toModulePdfBuffer({ moduleStats, topAbsentees = [], sessions = [] }) {
    return new Promise((resolve, reject) => {
        const doc = new pdfkit_1.default({ margin: 48, size: "A4" });
        const chunks = [];
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", (error) => reject(error));
        const moduleId = moduleStats.moduleId || "Module";
        const generatedAt = new Date().toLocaleString();
        doc.fontSize(20).font("Helvetica-Bold").text(String(moduleId), { align: "left" });
        doc.moveDown(0.3);
        doc.fontSize(12).font("Helvetica").text(`Generated: ${generatedAt}`);
        doc.moveDown(0.6);
        doc.fontSize(14).font("Helvetica-Bold").text("Summary");
        doc.moveDown(0.3);
        const lines = [
            `Sessions (windowDays): ${moduleStats.sessionsCount || 0} (${moduleStats.windowDays || 0})`,
            `Average attendance: ${Math.round((moduleStats.avgAttendance || 0) * 100) / 100}`,
            `Total attendance: ${moduleStats.totalAttendance || 0}`,
            `Median check-in minutes: ${moduleStats.medianCheckinMinutes ?? "-"}`,
            `Students tracked: ${moduleStats.studentCount ?? "-"}`
        ];
        lines.forEach((l) => { doc.fontSize(10).text(l); });
        doc.moveDown(0.6);
        doc.fontSize(14).font("Helvetica-Bold").text("Top Absentees");
        doc.moveDown(0.3);
        if (!topAbsentees.length) {
            doc.fontSize(10).text("No absentee data available.");
        }
        else {
            const header = ["#", "Student", "Attended", "Consistency%", "Risk"];
            header.forEach((h, i) => {
                doc.fontSize(10).font("Helvetica-Bold").text(h, { continued: i < header.length - 1, width: i === 0 ? 30 : 120 });
            });
            doc.moveDown(0.2);
            topAbsentees.forEach((s, idx) => {
                const row = [String(idx + 1), s.studentNumber || "", String(s.attendedCount || 0), String(s.consistencyPercent ?? "0"), s.riskBand || ""];
                row.forEach((c, i) => {
                    doc.fontSize(10).font("Helvetica").text(c, { continued: i < row.length - 1, width: i === 0 ? 30 : 120 });
                });
                doc.moveDown(0.2);
                if (doc.y > doc.page.height - 72) {
                    doc.addPage();
                }
            });
        }
        doc.moveDown(0.8);
        doc.fontSize(14).font("Helvetica-Bold").text("Recent Sessions");
        doc.moveDown(0.3);
        if (!sessions.length) {
            doc.fontSize(10).text("No sessions available.");
        }
        else {
            sessions.forEach((s) => {
                const date = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleString() : s.createdAt || "";
                doc.fontSize(10).font("Helvetica-Bold").text(`${s.moduleId || ""} - ${s.sessionId || ""}`, { continued: false });
                doc.fontSize(9).font("Helvetica").text(`  Date: ${date}  Attendance: ${s.attendanceCount || 0}  Median: ${s.medianCheckinMinutes ?? "-"}`);
                doc.moveDown(0.2);
                if (doc.y > doc.page.height - 72) {
                    doc.addPage();
                }
            });
        }
        doc.end();
    });
}
