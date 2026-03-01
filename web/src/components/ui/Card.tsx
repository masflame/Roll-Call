
import React from "react";

/**
 * Card component for unified surface and panel styling.
 *
 * Props:
 * - children: ReactNode
 * - className: string (optional)
 * - variant: 'default' | 'panel' (optional, default 'default')
 *
 * Usage:
 * <Card>...</Card>
 * <Card variant="panel">...</Card>
 */
export default function Card({ children, className = "", variant = "default", rounded = true }: { children: React.ReactNode; className?: string; variant?: "default" | "panel"; rounded?: boolean }) {
	// Unified card/panel style with optional rounding
	const baseRounded = variant === "panel" ? "rounded-xl" : "rounded-2xl";
	const base = `${rounded ? baseRounded + ' ' : ''}border border-stroke-subtle ${variant === 'panel' ? 'bg-surfaceAlt p-5' : 'bg-surface p-6'} shadow-subtle`;
	return (
		<div className={`${base} ${className}`}>
			{children}
		</div>
	);
}
