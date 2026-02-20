// @ts-nocheck
import { useMemo } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  ColumnDef
} from "@tanstack/react-table";

export interface AttendanceRow {
  studentNumber: string;
  name?: string;
  surname?: string;
  initials?: string;
  email?: string;
  group?: string;
  status: string;
  submittedAt: string;
}

interface AttendanceTableProps {
  data: AttendanceRow[];
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  onEdit?: (row: AttendanceRow) => void;
}

function AttendanceTable({ data, globalFilter, onGlobalFilterChange, onEdit }: AttendanceTableProps) {
  const columns = useMemo<ColumnDef<AttendanceRow>[]>(
    () => [
      { accessorKey: "studentNumber", header: "Student #" },
      { accessorKey: "surname", header: "Surname" },
      { accessorKey: "name", header: "Name" },
      { accessorKey: "group", header: "Group" },
      { accessorKey: "status", header: "Status" },
      { accessorKey: "submittedAt", header: "Submitted" },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div>
            <button onClick={() => onEdit && onEdit(row.original)} className="text-xs text-brand-primary">Edit</button>
          </div>
        )
      }
    ],
    [onEdit]
  );

  const table = useReactTable<AttendanceRow>({
    data,
    columns,
    state: { globalFilter },
    onGlobalFilterChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel()
  });

  return (
    <div>
      <div className="hidden sm:block overflow-hidden rounded-md border border-stroke-subtle">
        <table className="min-w-full divide-y divide-stroke-subtle text-sm">
          <thead className="sticky top-0 bg-surfaceAlt text-xs uppercase tracking-wide text-text-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 text-left">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-stroke-subtle bg-surface">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="transition hover:bg-surfaceAlt/70">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-sm text-text-primary">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-text-muted">
                  No attendance yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-3">
        {table.getRowModel().rows.length === 0 && (
          <div className="rounded-md border border-stroke-subtle bg-surface p-4 text-sm text-text-muted">No attendance yet.</div>
        )}
        {table.getRowModel().rows.map((row) => {
          const data = row.original;
          return (
            <div key={row.id} className="rounded-md border border-stroke-subtle bg-surface p-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{data.studentNumber}</div>
                <div className="text-sm text-text-muted">{data.status}</div>
              </div>
              <div className="mt-1 text-sm text-text-muted">{[data.surname, data.name].filter(Boolean).join(" ")}</div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-text-muted">{data.group}</div>
                <div>
                  <button onClick={() => onEdit && onEdit(data)} className="text-xs text-brand-primary">Edit</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AttendanceTable;
