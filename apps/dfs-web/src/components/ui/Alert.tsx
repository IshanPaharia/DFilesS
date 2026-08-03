import React from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info } from "lucide-react";

export type AlertType = "success" | "warning" | "error" | "info";

export interface AlertProps {
  type: AlertType;
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({ type, title, children, onClose, className = "" }) => {
  const config: Record<
    AlertType,
    { bg: string; border: string; text: string; icon: React.ReactNode }
  > = {
    success: {
      bg: "bg-[#DCFCE7]",
      border: "border-[#86EFAC]",
      text: "text-[#15803D]",
      icon: <CheckCircle2 className="w-5 h-5 text-[#15803D] shrink-0" />
    },
    warning: {
      bg: "bg-[#FEF3C7]",
      border: "border-[#FDE68A]",
      text: "text-[#B45309]",
      icon: <AlertTriangle className="w-5 h-5 text-[#B45309] shrink-0" />
    },
    error: {
      bg: "bg-[#FEE2E2]",
      border: "border-[#FCA5A5]",
      text: "text-[#B91C1C]",
      icon: <AlertCircle className="w-5 h-5 text-[#B91C1C] shrink-0" />
    },
    info: {
      bg: "bg-[#DBEAFE]",
      border: "border-[#93C5FD]",
      text: "text-[#1D4ED8]",
      icon: <Info className="w-5 h-5 text-[#1D4ED8] shrink-0" />
    }
  };

  const style = config[type];

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl border ${style.bg} ${style.border} ${style.text} ${className}`}
    >
      {style.icon}
      <div className="flex-1 text-sm">
        {title && <div className="font-semibold mb-0.5">{title}</div>}
        <div>{children}</div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-xs font-semibold opacity-70 hover:opacity-100 transition-opacity ml-2"
        >
          ✕
        </button>
      )}
    </div>
  );
};
