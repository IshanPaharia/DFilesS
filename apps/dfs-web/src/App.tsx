import React, { useState } from "react";
import { HardDrive, UploadCloud, Files, Server } from "lucide-react";
import { Tabs } from "./components/ui/Tabs";
import { UploadTab } from "./components/UploadTab";
import { FilesTab } from "./components/FilesTab";
import { ClusterTab } from "./components/ClusterTab";

export function App() {
  const [activeTab, setActiveTab] = useState("upload");

  const tabs = [
    { id: "upload", label: "Upload" },
    { id: "files", label: "Files" },
    { id: "cluster", label: "Cluster" }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F5F0]">
      {/* Top Navbar */}
      <header className="bg-white border-b border-[#DAD7D0] sticky top-0 z-10 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1E4B49] text-white flex items-center justify-center shadow-xs">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#1A1A1A]">DFilesS</h1>
              <p className="text-xs text-[#737373] hidden sm:block">
                Distributed Fault-Tolerant File Store
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#DCFCE7] text-[#15803D]">
              <span className="w-2 h-2 rounded-full bg-[#15803D]" /> Active
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Navigation Tabs */}
        <div className="bg-white rounded-xl border border-[#DAD7D0] p-2 shadow-xs">
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        </div>

        {/* View Container */}
        <div className="pt-2">
          {activeTab === "upload" && (
            <UploadTab onUploadSuccess={() => setActiveTab("files")} />
          )}
          {activeTab === "files" && <FilesTab />}
          {activeTab === "cluster" && <ClusterTab />}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#DAD7D0] bg-white py-4 text-center text-xs text-[#737373] mt-auto">
        DFilesS Dashboard • React + TypeScript + Vite + Tailwind CSS
      </footer>
    </div>
  );
}

export default App;
