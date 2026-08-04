import React from "react";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange }) => {
  return (
    <div className="flex justify-center items-center gap-2 sm:gap-6">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors focus:outline-none ${
              isActive
                ? "border-[#1E4B49] text-[#1E4B49]"
                : "border-transparent text-[#4A4A4A] hover:text-[#1A1A1A] hover:border-[#DAD7D0]"
            }`}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span
                className={`px-2 py-0.5 text-xs rounded-full ${
                  isActive ? "bg-[#1E4B49] text-white" : "bg-[#E5E5E5] text-[#4A4A4A]"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
