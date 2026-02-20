"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCsvBuffer = toCsvBuffer;
const sync_1 = require("csv-stringify/sync");
function toCsvBuffer({ session, rows, template }) {
    const columns = template === "minimal"
        ? ["studentNumber", "status"]
        : [
            "moduleCode",
            "title",
            "studentNumber",
            "name",
            "surname",
            "initials",
            "email",
            "group",
            "status",
            "submittedAt"
        ];
    const records = rows.map((row) => ({
        moduleCode: session.moduleCode ?? "",
        title: session.title ?? "",
        studentNumber: row.studentNumber ?? "",
        name: row.name ?? "",
        surname: row.surname ?? "",
        initials: row.initials ?? "",
        email: row.email ?? "",
        group: row.group ?? "",
        status: row.status ?? "Present",
        submittedAt: row.submittedAt?.toDate ? row.submittedAt.toDate().toISOString() : row.submittedAt ?? ""
    }));
    const csv = (0, sync_1.stringify)(records, { header: true, columns });
    // prepend UTF-8 BOM so Excel on Windows recognises UTF-8 and splits columns correctly
    const bom = "\uFEFF";
    return Buffer.from(bom + csv, "utf-8");
}
