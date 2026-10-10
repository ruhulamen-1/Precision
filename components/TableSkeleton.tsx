import React from "react";

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={`animate-pulse bg-slate-200 rounded ${className}`} />
);

export const SkeletonRow = ({ cols }: { cols: number }) => (
  <tr className="border-b border-slate-100">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="px-6 py-6">
        <Skeleton className="h-4 w-full" />
      </td>
    ))}
  </tr>
);
