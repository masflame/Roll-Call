import React from "react";

/**
 * Skeleton loader with unified color and animation.
 * Uses bg-surfaceAlt and animate-pulse for consistency.
 */
export default function Skeleton({ className = "", style = {} }) {
  return (
    <div
      className={`animate-pulse bg-surfaceAlt rounded-xl ${className}`}
      style={style}
    />
  );
}
