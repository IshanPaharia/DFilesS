import React, { useEffect, useRef, useState } from "react";
import { Server, Activity, AlertTriangle, ShieldCheck, Database, Wrench } from "lucide-react";
import type { ClusterMetrics, StorageNodeRecord } from "@dfs/shared";
import { Card } from "./ui/Card";
import { Chip } from "./ui/Chip";
import { Alert } from "./ui/Alert";
import { fetchMetrics, fetchNodes } from "../api/client";

export const ClusterTab: React.FC = () => {
  const [nodes, setNodes] = useState<StorageNodeRecord[]>([]);
  const [metrics, setMetrics] = useState<ClusterMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousUnderReplicated = useRef<number | null>(null);

  const loadClusterData = async () => {
    try {
      const [nodesData, metricsData] = await Promise.all([fetchNodes(), fetchMetrics()]);
      setNodes(nodesData);
      setMetrics(metricsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to poll cluster health");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClusterData();
    const interval = setInterval(loadClusterData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Track degraded vs restored state for alert banners
  const isDegraded =
    metrics && (metrics.deadNodes > 0 || metrics.underReplicatedChunks > 0);
  const wasDegraded =
    previousUnderReplicated.current !== null && previousUnderReplicated.current > 0;

  useEffect(() => {
    if (metrics) {
      previousUnderReplicated.current = metrics.underReplicatedChunks;
    }
  }, [metrics]);

  return (
    <div className="space-y-6">
      {error && (
        <Alert type="error" title="Connection Error">
          {error}
        </Alert>
      )}

      {/* Cluster Status Alerts */}
      {isDegraded && (
        <Alert type="warning" title="Cluster State: Degraded">
          {metrics.deadNodes > 0 ? `${metrics.deadNodes} node(s) unresponsive.` : ""}{" "}
          {metrics.underReplicatedChunks > 0
            ? `${metrics.underReplicatedChunks} chunk(s) under-replicated. Background repair worker active.`
            : ""}
        </Alert>
      )}

      {!isDegraded && wasDegraded && (
        <Alert type="success" title="Cluster State: Healthy">
          Replication Factor RF=3 fully restored across all active storage nodes!
        </Alert>
      )}

      {!isDegraded && !wasDegraded && metrics && (
        <Alert type="info" title="Cluster State: Fully Operational">
          All nodes healthy with optimal RF=3 replica placement.
        </Alert>
      )}

      {/* Summary Metrics Grid */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white border border-[#DAD7D0] rounded-xl p-4 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between text-[#737373]">
              <span className="text-xs font-semibold uppercase">Files</span>
              <Database className="w-4 h-4 text-[#1E4B49]" />
            </div>
            <p className="text-2xl font-bold text-[#1A1A1A] mt-2">{metrics.files}</p>
          </div>

          <div className="bg-white border border-[#DAD7D0] rounded-xl p-4 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between text-[#737373]">
              <span className="text-xs font-semibold uppercase">Chunks</span>
              <Activity className="w-4 h-4 text-[#1E4B49]" />
            </div>
            <p className="text-2xl font-bold text-[#1A1A1A] mt-2">{metrics.chunks}</p>
          </div>

          <div className="bg-white border border-[#DAD7D0] rounded-xl p-4 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between text-[#737373]">
              <span className="text-xs font-semibold uppercase">Healthy</span>
              <ShieldCheck className="w-4 h-4 text-[#15803D]" />
            </div>
            <p className="text-2xl font-bold text-[#15803D] mt-2">{metrics.healthyNodes}</p>
          </div>

          <div className="bg-white border border-[#DAD7D0] rounded-xl p-4 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between text-[#737373]">
              <span className="text-xs font-semibold uppercase">Dead Nodes</span>
              <AlertTriangle className="w-4 h-4 text-[#B91C1C]" />
            </div>
            <p className="text-2xl font-bold text-[#B91C1C] mt-2">{metrics.deadNodes}</p>
          </div>

          <div className="bg-white border border-[#DAD7D0] rounded-xl p-4 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between text-[#737373]">
              <span className="text-xs font-semibold uppercase">Under-rep</span>
              <AlertTriangle className="w-4 h-4 text-[#B45309]" />
            </div>
            <p className="text-2xl font-bold text-[#B45309] mt-2">{metrics.underReplicatedChunks}</p>
          </div>

          <div className="bg-white border border-[#DAD7D0] rounded-xl p-4 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between text-[#737373]">
              <span className="text-xs font-semibold uppercase">Repairs</span>
              <Wrench className="w-4 h-4 text-[#1D4ED8]" />
            </div>
            <p className="text-2xl font-bold text-[#1A1A1A] mt-2">
              {metrics.repairJobsSucceeded}
              <span className="text-xs font-normal text-[#737373] ml-1">
                ({metrics.repairJobsQueued} Q)
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Storage Nodes Section */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#4A4A4A] mb-3">
          Storage Nodes Status
        </h3>
        {loading ? (
          <div className="py-8 text-center text-[#737373] text-sm">Polling storage nodes...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {nodes.map((node) => (
              <Card key={node.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`p-2 rounded-lg ${
                        node.status === "healthy" ? "bg-[#DCFCE7] text-[#15803D]" : "bg-[#FEE2E2] text-[#B91C1C]"
                      }`}
                    >
                      <Server className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-sm text-[#1A1A1A]">{node.id}</span>
                  </div>
                  <Chip
                    status={node.status === "healthy" ? "healthy" : "dead"}
                    label={node.status === "healthy" ? "Healthy" : "Dead"}
                  />
                </div>

                <div className="space-y-1 text-xs text-[#737373]">
                  <div className="flex justify-between">
                    <span>Address:</span>
                    <span className="font-mono text-[#1A1A1A]">{node.address}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Missed Heartbeats:</span>
                    <span className={node.missedHeartbeats > 0 ? "text-[#B91C1C] font-semibold" : ""}>
                      {node.missedHeartbeats}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Last Heartbeat:</span>
                    <span>
                      {node.lastHeartbeat ? new Date(node.lastHeartbeat).toLocaleTimeString() : "Never"}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
