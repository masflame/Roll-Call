import React from "react";

export function PrimaryButton({ children, onClick, disabled, className }: any) {
	return (
		<button
			onClick={onClick}
			disabled={disabled}
			className={`inline-flex items-center justify-center rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-text-onBrand transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60 ${className || ""}`}
		>
			{children}
		</button>
	);
}

export function SecondaryButton({ children, onClick, disabled, className }: any) {
	return (
		<button
			onClick={onClick}
			disabled={disabled}
			className={`inline-flex items-center justify-center rounded-md border border-stroke-subtle bg-white px-3 py-1.5 text-sm font-medium text-text-primary transition hover:bg-surfaceAlt disabled:cursor-not-allowed disabled:opacity-60 ${className || ""}`}
		>
			{children}
		</button>
	);
}

export default PrimaryButton;
