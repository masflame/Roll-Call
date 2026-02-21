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
  allowedFields?: Record<string, boolean> | null;
}

function AttendanceTable({ data, globalFilter, onGlobalFilterChange, onEdit, allowedFields }: AttendanceTableProps) {
  const columns = useMemo<ColumnDef<AttendanceRow>[]>(() => {
    const cols: ColumnDef<AttendanceRow>[] = [];
    cols.push({ accessorKey: "studentNumber", header: "Student #" });

    const order = ["surname", "name", "initials", "email", "group"];
    if (!allowedFields) {
      order.forEach((k) => cols.push({ accessorKey: k as any, header: k.charAt(0).toUpperCase() + k.slice(1) }));
    } else {
      order.forEach((k) => {
        if (allowedFields[k]) cols.push({ accessorKey: k as any, header: k.charAt(0).toUpperCase() + k.slice(1) });
      });
    }

    cols.push({ accessorKey: "status", header: "Status" });
    cols.push({ accessorKey: "submittedAt", header: "Submitted" });

    cols.push({
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div>
          <button onClick={() => onEdit && onEdit(row.original)} className="text-xs text-brand-primary">Edit</button>
        </div>
      )
    });

    return cols;
  }, [onEdit, allowedFields]);

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
      {/* Desktop table (scrollable horizontally) */}
      <div className="hidden sm:block overflow-x-auto rounded-md border border-stroke-subtle">
        <table className="min-w-max divide-y divide-stroke-subtle text-sm">
          <thead className="sticky top-0 bg-surfaceAlt text-xs uppercase tracking-wide text-gray-700">
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
                  <td key={cell.id} className="px-4 py-3 text-sm text-gray-800">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}

            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-gray-600">
                  No attendance yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: horizontally-scrollable table that shows only allowed fields */}
      <div className="sm:hidden overflow-x-auto rounded-md border border-stroke-subtle">
        <table className="min-w-max divide-y divide-stroke-subtle text-sm">
          <thead className="sticky top-0 bg-surfaceAlt text-xs uppercase tracking-wide text-gray-700">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-3 py-2 text-left">
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
                  <td key={cell.id} className="px-3 py-2 text-sm text-gray-800">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}

            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-gray-600">
                  No attendance yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AttendanceTable;
