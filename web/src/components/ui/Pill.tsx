// Shared Pill component for consistent small badges
import React from "react";
type Tone = "neutral" | "success" | "warning" | "danger";

export default function Pill({ children, tone = "neutral", ...rest }: { children: React.ReactNode; tone?: Tone } & React.HTMLAttributes<HTMLSpanElement>) {
  const cls =
    tone === "success"
      ? "bg-green-50 text-green-800 border border-green-100"
      : tone === "warning"
      ? "bg-amber-50 text-amber-800 border border-amber-100"
      : tone === "danger"
      ? "bg-red-50 text-red-800 border border-red-100"
      : "bg-gray-100 text-gray-700 border border-gray-200";

  return (
    <span {...rest} className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-sm font-medium ${cls}`}>
      {children}
    </span>
  );
}
