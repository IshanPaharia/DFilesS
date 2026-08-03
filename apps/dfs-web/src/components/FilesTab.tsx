import React, { useEffect, useState } from "react";
import { Download, FileText, Loader2, RefreshCw } from "lucide-react";
import type { FileRecord } from "@dfs/shared";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Chip } from "./ui/Chip";
import { Input } from "./ui/Input";
import { Alert } from "./ui/Alert";
import { downloadChunkPayload, fetchFiles, getFileChunks, reportBadLocation } from "../api/client";
import { calculateSha256 } from "../utils/crypto";

export const FilesTab: React.FC = () => {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const data = await fetchFiles();
      setFiles(data);
    } catch (err) {
      setAlert({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to load files"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleDownload = async (file: FileRecord) => {
    setDownloadingId(file.id);
    setAlert(null);

    try {
      const response = await getFileChunks(file.id);
      if (response.chunks.length !== file.chunkCount) {
        throw new Error(`Metadata returned ${response.chunks.length}/${file.chunkCount} committed chunks`);
      }

      const chunkBuffers: ArrayBuffer[] = [];

      for (const chunk of response.chunks) {
        let chunkData: ArrayBuffer | null = null;

        for (const loc of chunk.locations) {
          try {
            const { buffer, checksum: serverChecksum } = await downloadChunkPayload(loc.nodeId, loc.address, chunk.id);
            const calculated = await calculateSha256(buffer);

            if (buffer.byteLength === chunk.size && calculated === chunk.checksum) {
              chunkData = buffer;
              break;
            }

            await reportBadLocation(loc.id);
          } catch {
            await reportBadLocation(loc.id);
          }
        }

        if (!chunkData) {
          throw new Error(`No healthy replica returned valid bytes for chunk ${chunk.chunkIndex + 1}`);
        }

        chunkBuffers.push(chunkData);
      }

      // Reassemble Blob & trigger download
      const blob = new Blob(chunkBuffers, { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setAlert({
        type: "success",
        message: `Downloaded "${file.name}" successfully (${formatBytes(file.size)})`
      });
    } catch (err) {
      setAlert({
        type: "error",
        message: err instanceof Error ? err.message : "Download failed"
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {alert && (
        <Alert type={alert.type} title={alert.type === "success" ? "Success" : "Error"} onClose={() => setAlert(null)}>
          {alert.message}
        </Alert>
      )}

      {/* Header controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-72">
          <Input
            variant="search"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={loadFiles} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Files Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-[#737373] gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#1E4B49]" /> Loading file catalog...
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="bg-white border border-[#DAD7D0] rounded-xl p-8 text-center text-[#737373]">
          No files found in the cluster.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFiles.map((file) => (
            <Card key={file.id} className="flex flex-col justify-between space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="p-2.5 rounded-lg bg-[#F7F5F0] text-[#1E4B49] shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="truncate">
                    <h3 className="text-sm font-semibold text-[#1A1A1A] truncate" title={file.name}>
                      {file.name}
                    </h3>
                    <p className="text-xs text-[#737373] mt-0.5">
                      {formatBytes(file.size)} • {file.chunkCount} chunk(s)
                    </p>
                  </div>
                </div>
                <Chip
                  status={file.status === "complete" ? "complete" : "uploading"}
                  label={file.status === "complete" ? "Complete" : "Uploading"}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#DAD7D0] text-xs text-[#737373]">
                <span>{new Date(file.createdAt).toLocaleString()}</span>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={file.status !== "complete" || downloadingId === file.id}
                  onClick={() => handleDownload(file)}
                >
                  {downloadingId === file.id ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching...
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" /> Download
                    </>
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
