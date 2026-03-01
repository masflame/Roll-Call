import React from "react";

export default function Input({ value, onChange, type = "text", placeholder, className, ...rest }: any) {
  return (
    <input
      value={value}
      onChange={onChange}
      type={type}
      placeholder={placeholder}
      className={`w-full rounded-xl border border-stroke-subtle bg-surface px-4 py-3 text-sm text-text-primary outline-none transition focus:border-brand-primary ${className || ""}`}
      {...rest}
    />
  );
}
