import React from "react";

export default function Card({ children, className }: any) {
	return <div className={`rounded-2xl border border-stroke-subtle bg-surface p-4 shadow-subtle ${className || ""}`}>{children}</div>;
}
