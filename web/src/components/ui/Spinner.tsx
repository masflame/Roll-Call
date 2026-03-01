import React from "react";

/**
 * Spinner loader with unified color and animation.
 * Uses text-brand-primary and animate-spin for consistency.
 */
export default function Spinner({ size = 24, className = "" }) {
  return (
    <svg
      className={`animate-spin text-brand-primary ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        className="opacity-20 stroke-surfaceAlt"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-70 stroke-brand-primary"
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
