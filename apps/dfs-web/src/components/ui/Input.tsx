import React from "react";
import { Search } from "lucide-react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  variant?: "text" | "search";
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  variant = "text",
  className = "",
  id,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold uppercase tracking-wider text-[#4A4A4A]">
          {label}
        </label>
      )}
      <div className="relative flex items-center w-full">
        {variant === "search" && (
          <div className="absolute left-3 text-[#737373] pointer-events-none">
            <Search className="w-4 h-4" />
          </div>
        )}
        <input
          id={inputId}
          className={`w-full rounded-lg border border-[#DAD7D0] bg-white px-3.5 py-2 text-sm text-[#1A1A1A] placeholder-[#737373] transition-colors focus:border-[#1E4B49] focus:outline-none focus:ring-1 focus:ring-[#1E4B49] ${
            variant === "search" ? "pl-9" : ""
          } ${error ? "border-[#B91C1C]" : ""} ${className}`}
          {...props}
        />
      </div>
      {error && <span className="text-xs text-[#B91C1C]">{error}</span>}
    </div>
  );
};
