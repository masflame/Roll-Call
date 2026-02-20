import { stringify } from "csv-stringify/sync";

interface CsvInput {
  session: Record<string, any>;
  rows: Record<string, any>[];
  template: "minimal" | "standard";
}

export function toCsvBuffer({ session, rows, template }: CsvInput): any {
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

  const csv = stringify(records, { header: true, columns });
  // prepend UTF-8 BOM so Excel on Windows recognises UTF-8 and splits columns correctly
  const bom = "\uFEFF";
  return Buffer.from(bom + csv, "utf-8");
}
