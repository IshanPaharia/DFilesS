import React from "react";

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = "", onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white border border-[#DAD7D0] rounded-xl p-5 shadow-xs transition-shadow hover:shadow-md ${
        onClick ? "cursor-pointer" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
};
