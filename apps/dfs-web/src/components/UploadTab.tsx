import React, { useState } from "react";
import { UploadCloud, File, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "./ui/Button";
import { Chip } from "./ui/Chip";
import { Alert } from "./ui/Alert";
import { calculateSha256 } from "../utils/crypto";
import { commitChunk, createFile, completeFile, planChunk, uploadChunkPayload } from "../api/client";

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB

interface ChunkStatus {
  index: number;
  status: "pending" | "uploading" | "committed" | "failed";
  error?: string;
  replicas?: string[];
}

export interface UploadTabProps {
  onUploadSuccess?: () => void;
}

export const UploadTab: React.FC<UploadTabProps> = ({ onUploadSuccess }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [chunksStatus, setChunksStatus] = useState<ChunkStatus[]>([]);
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAlert(null);
    setChunksStatus([]);
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setAlert(null);

    const totalSize = selectedFile.size;
    const chunkCount = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));

    const initialChunks: ChunkStatus[] = Array.from({ length: chunkCount }, (_, i) => ({
      index: i,
      status: "pending"
    }));
    setChunksStatus(initialChunks);

    try {
      // Step 1: Create file record in metadata service
      const fileRecord = await createFile(selectedFile.name, totalSize, chunkCount);

      // Step 2: Chunk and upload sequentially/parallel
      for (let i = 0; i < chunkCount; i++) {
        setChunksStatus((prev) =>
          prev.map((c) => (c.index === i ? { ...c, status: "uploading" } : c))
        );

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const slice = selectedFile.slice(start, end);
        const buffer = await slice.arrayBuffer();
        const checksum = await calculateSha256(buffer);
        const size = buffer.byteLength;

        // Plan chunk
        const plan = await planChunk(fileRecord.id, i, checksum, size);

        // Upload to targets
        const successfulReplicas: Array<{ nodeId: string; address: string }> = [];
        const uploadPromises = plan.targets.map(async (target: { nodeId: string; address: string }) => {
          await uploadChunkPayload(target.nodeId, target.address, plan.chunkId, buffer, checksum);
          return target;
        });

        const results = await Promise.allSettled(uploadPromises);
        for (const res of results) {
          if (res.status === "fulfilled") {
            successfulReplicas.push(res.value);
          }
        }

        if (successfulReplicas.length < 2) {
          throw new Error(`Chunk ${i + 1}/${chunkCount} failed write quorum (2 replicas required)`);
        }

        // Commit chunk
        await commitChunk(fileRecord.id, i, checksum, size, successfulReplicas);

        setChunksStatus((prev) =>
          prev.map((c) =>
            c.index === i
              ? {
                  ...c,
                  status: "committed",
                  replicas: successfulReplicas.map((r) => r.nodeId)
                }
              : c
          )
        );
      }

      // Step 3: Complete file
      await completeFile(fileRecord.id);

      setAlert({
        type: "success",
        message: `File "${selectedFile.name}" successfully uploaded and committed across replicas!`
      });
      setSelectedFile(null);
      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err) {
      setAlert({
        type: "error",
        message: err instanceof Error ? err.message : "Upload failed"
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {alert && (
        <Alert type={alert.type} title={alert.type === "success" ? "Upload Complete" : "Upload Error"}>
          {alert.message}
        </Alert>
      )}

      {/* File Dropzone / Picker */}
      <div className="bg-white border-2 border-dashed border-[#DAD7D0] rounded-xl p-8 text-center hover:border-[#1E4B49] transition-colors">
        <input
          type="file"
          id="file-upload-input"
          onChange={handleFileChange}
          disabled={isUploading}
          className="hidden"
        />
        <label htmlFor="file-upload-input" className="cursor-pointer flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#F7F5F0] flex items-center justify-center text-[#1E4B49]">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1A1A1A]">
              Click to select a file for distributed storage
            </p>
            <p className="text-xs text-[#737373] mt-1">Automatic 4 MB chunking & SHA-[#256] verification</p>
          </div>
        </label>
      </div>

      {/* Selected File Card */}
      {selectedFile && (
        <div className="bg-white border border-[#DAD7D0] rounded-xl p-5 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#F7F5F0] text-[#1E4B49]">
              <File className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1A1A1A]">{selectedFile.name}</p>
              <p className="text-xs text-[#737373]">
                {formatBytes(selectedFile.size)} •{" "}
                {Math.max(1, Math.ceil(selectedFile.size / CHUNK_SIZE))} chunk(s)
              </p>
            </div>
          </div>
          <Button onClick={handleUpload} disabled={isUploading} size="md">
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
              </>
            ) : (
              "Start Upload"
            )}
          </Button>
        </div>
      )}

      {/* Chunk Progress Section */}
      {chunksStatus.length > 0 && (
        <div className="bg-white border border-[#DAD7D0] rounded-xl p-5 space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#4A4A4A]">
            Chunk Upload Progress
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {chunksStatus.map((chunk) => (
              <div
                key={chunk.index}
                className="flex items-center justify-between p-3 rounded-lg border border-[#DAD7D0] bg-[#F7F5F0]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[#1A1A1A]">Chunk {chunk.index + 1}</span>
                  {chunk.status === "uploading" && <Loader2 className="w-3.5 h-3.5 text-[#1D4ED8] animate-spin" />}
                  {chunk.status === "committed" && <CheckCircle className="w-3.5 h-3.5 text-[#15803D]" />}
                  {chunk.status === "failed" && <AlertCircle className="w-3.5 h-3.5 text-[#B91C1C]" />}
                </div>
                <div>
                  {chunk.status === "committed" && (
                    <Chip
                      status="complete"
                      label={`Committed (${chunk.replicas?.join(", ")})`}
                    />
                  )}
                  {chunk.status === "uploading" && <Chip status="uploading" label="Uploading..." />}
                  {chunk.status === "pending" && <Chip status="info" label="Pending" />}
                  {chunk.status === "failed" && <Chip status="dead" label="Failed" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
