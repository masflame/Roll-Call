// lightweight ScrollReveal fallback component
import React from "react";

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  stagger?: number;
  duration?: number;
  delay?: number;
}

export default function ScrollReveal({ children, className, ...rest }: Props) {
  // No-op: simply render children. Props kept for compatibility with original usage.
  return (
    <div className={className} {...rest}>
      {children}
    </div>
  );
}
