
import React from "react";
import Spinner from "./Spinner";

export function PrimaryButton({ children, onClick, disabled, className, loading }: any) {
	return (
		<button
			onClick={onClick}
			disabled={disabled || loading}
			className={`inline-flex items-center justify-center rounded-md bg-brand-primary px-3 py-1 text-sm font-semibold text-text-onBrand shadow-brand transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:bg-stroke-strong ${className || ""}`}
		>
			{loading && <Spinner size={18} className="mr-2" />}
			{children}
		</button>
	);
}

export function SecondaryButton({ children, onClick, disabled, className, loading }: any) {
	return (
		<button
			onClick={onClick}
			disabled={disabled || loading}
			className={`inline-flex items-center justify-center rounded-md border border-stroke-subtle bg-surface px-5 py-3 text-sm font-semibold text-text-primary transition hover:bg-surfaceAlt disabled:cursor-not-allowed disabled:opacity-60 ${className || ""}`}
		>
			{loading && <Spinner size={18} className="mr-2" />}
			{children}
		</button>
	);
}

export default PrimaryButton;
