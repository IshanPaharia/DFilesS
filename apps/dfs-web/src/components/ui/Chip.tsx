import React from "react";

export type ChipStatus =
  | "healthy"
  | "active"
  | "dead"
  | "under-replicated"
  | "complete"
  | "uploading"
  | "info"
  | "warning";

export interface ChipProps {
  status: ChipStatus;
  label?: string;
  className?: string;
}

export const Chip: React.FC<ChipProps> = ({ status, label, className = "" }) => {
  const styles: Record<ChipStatus, { bg: string; text: string; dot: string; defaultLabel: string }> = {
    healthy: { bg: "bg-[#DCFCE7]", text: "text-[#15803D]", dot: "bg-[#15803D]", defaultLabel: "Healthy" },
    active: { bg: "bg-[#DCFCE7]", text: "text-[#15803D]", dot: "bg-[#15803D]", defaultLabel: "Active" },
    complete: { bg: "bg-[#DCFCE7]", text: "text-[#15803D]", dot: "bg-[#15803D]", defaultLabel: "Complete" },
    dead: { bg: "bg-[#FEE2E2]", text: "text-[#B91C1C]", dot: "bg-[#B91C1C]", defaultLabel: "Dead" },
    "under-replicated": {
      bg: "bg-[#FEF3C7]",
      text: "text-[#B45309]",
      dot: "bg-[#B45309]",
      defaultLabel: "Under-replicated"
    },
    uploading: { bg: "bg-[#DBEAFE]", text: "text-[#1D4ED8]", dot: "bg-[#1D4ED8]", defaultLabel: "Uploading" },
    warning: { bg: "bg-[#FEF3C7]", text: "text-[#B45309]", dot: "bg-[#B45309]", defaultLabel: "Warning" },
    info: { bg: "bg-[#E5E7EB]", text: "text-[#374151]", dot: "bg-[#4B5563]", defaultLabel: "Info" }
  };

  const style = styles[status] || styles.info;
  const displayLabel = label || style.defaultLabel;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.text} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {displayLabel}
    </span>
  );
};
