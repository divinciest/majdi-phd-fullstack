import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Clock,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { http } from "@/lib/http";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";

interface WorkflowNode {
  id: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed";
  metadata?: Record<string, any>;
  startTime?: string;
  endTime?: string;
  error?: string;
}

interface WorkflowConnection {
  from: string;
  to: string;
}

interface WorkflowEvent {
  timestamp: string;
  event: string;
  nodeId?: string;
  data?: Record<string, any>;
}

interface WorkflowState {
  runId: string;
  timestamp: string;
  nodes: Record<string, WorkflowNode>;
  connections: WorkflowConnection[];
  executionLog: WorkflowEvent[];
}

interface WorkflowVisualizationProps {
  runId: string;
}

const statusColors: Record<string, { bg: string; border: string; text: string }> = {
  pending: { bg: "#374151", border: "#6b7280", text: "#9ca3af" },
  running: { bg: "#1e3a5f", border: "#3b82f6", text: "#60a5fa" },
  completed: { bg: "#14532d", border: "#22c55e", text: "#4ade80" },
  failed: { bg: "#7f1d1d", border: "#ef4444", text: "#f87171" },
};

// Helper component for node labels
const NodeLabel = ({ type, status, colors }: { type: string; status: string; colors: { text: string } }) => (
  <div style={{ textAlign: "center" }}>
    <div style={{ fontWeight: 600, fontSize: "11px", color: colors.text }}>{type}</div>
    <div style={{ fontSize: "9px", color: colors.text, opacity: 0.8, textTransform: "uppercase" }}>
      {status}
    </div>
  </div>
);

// Helper function for node styles
const nodeStyle = (colors: { bg: string; border: string }) => ({
  background: colors.bg,
  border: `2px solid ${colors.border}`,
  borderRadius: "8px",
  padding: "8px 12px",
  minWidth: "120px",
});

// Flyde-style DAG structure:
// Initialize → InitPool → LoopList → [HTTP→Strip→LLM→Parse→Normalize→Prune] → Collect → Report → Complete
function workflowStateToReactFlow(state: WorkflowState | null): { nodes: Node[]; edges: Edge[] } {
  if (!state || Object.keys(state.nodes).length === 0) {
    return { nodes: [], edges: [] };
  }

  const workflowNodes = Object.values(state.nodes);
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Group nodes by link
  const linkGroups: Record<string, WorkflowNode[]> = {};
  const orchestrationNodes: WorkflowNode[] = [];
  
  workflowNodes.forEach((node) => {
    const match = node.id.match(/link_(\d+)_/);
    if (match) {
      const linkId = match[1];
      if (!linkGroups[linkId]) linkGroups[linkId] = [];
      linkGroups[linkId].push(node);
    } else {
      orchestrationNodes.push(node);
    }
  });

  const linkIds = Object.keys(linkGroups).sort((a, b) => parseInt(a) - parseInt(b));
  const numLinks = linkIds.length;
  const pipelineSteps = ["http", "strip", "synthesize", "llm", "parse", "json", "normalize", "prune"];
  
  // Layout constants
  const nodeWidth = 140;
  const nodeHeight = 60;
  const hGap = 40;
  const vGap = 30;
  const loopPadding = 30;
  
  // Calculate loop box dimensions
  const loopContentWidth = pipelineSteps.length * (nodeWidth + hGap);
  const loopContentHeight = numLinks * (nodeHeight + vGap);
  
  // Starting positions
  const startX = 50;
  const loopStartX = startX + nodeWidth + hGap + 50;
  const loopStartY = 150;

  // Add orchestration nodes (before loop)
  const preLoopNodes = ["initialize", "init_pool"];
  preLoopNodes.forEach((nodeId, idx) => {
    const node = workflowNodes.find(n => n.id === nodeId);
    if (node) {
      const colors = statusColors[node.status] || statusColors.pending;
      nodes.push({
        id: node.id,
        position: { x: startX, y: 50 + idx * (nodeHeight + vGap) },
        data: { label: <NodeLabel type={node.type} status={node.status} colors={colors} /> },
        style: nodeStyle(colors),
      });
    }
  });

  // Add LoopList container node
  nodes.push({
    id: "loop_container",
    position: { x: loopStartX - loopPadding, y: loopStartY - loopPadding - 30 },
    data: { 
      label: (
        <div style={{ color: "#06b6d4", fontWeight: 600, fontSize: "14px" }}>
          LoopList (ForEach Link)
        </div>
      )
    },
    style: {
      background: "rgba(6, 182, 212, 0.1)",
      border: "2px dashed #06b6d4",
      borderRadius: "12px",
      width: loopContentWidth + loopPadding * 2,
      height: loopContentHeight + loopPadding * 2 + 30,
      padding: "10px",
    },
    selectable: false,
    draggable: false,
  });

  // Add pipeline nodes for each link inside the loop
  linkIds.forEach((linkId, linkIdx) => {
    const linkNodes = linkGroups[linkId];
    const y = loopStartY + linkIdx * (nodeHeight + vGap);

    // Sort by pipeline order
    const sorted = [...linkNodes].sort((a, b) => {
      const aType = a.id.split("_").pop() || "";
      const bType = b.id.split("_").pop() || "";
      return pipelineSteps.indexOf(aType) - pipelineSteps.indexOf(bType);
    });

    sorted.forEach((node, stepIdx) => {
      const x = loopStartX + stepIdx * (nodeWidth + hGap);
      const colors = statusColors[node.status] || statusColors.pending;

      nodes.push({
        id: node.id,
        position: { x, y },
        data: { label: <NodeLabel type={node.type} status={node.status} colors={colors} /> },
        style: nodeStyle(colors),
        parentNode: "loop_container",
        extent: "parent" as const,
      });

      // Add edge to next node in pipeline
      if (stepIdx < sorted.length - 1) {
        edges.push({
          id: `e-${node.id}-${sorted[stepIdx + 1].id}`,
          source: node.id,
          target: sorted[stepIdx + 1].id,
          animated: node.status === "running",
          style: { stroke: "#06b6d4", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#06b6d4", width: 20, height: 20 },
        });
      }
    });
  });

  // Add post-loop orchestration nodes
  const postLoopNodes = ["generate_report", "complete"];
  const postLoopX = loopStartX + loopContentWidth + loopPadding + 50;
  postLoopNodes.forEach((nodeId, idx) => {
    const node = workflowNodes.find(n => n.id === nodeId);
    if (node) {
      const colors = statusColors[node.status] || statusColors.pending;
      nodes.push({
        id: node.id,
        position: { x: postLoopX, y: 50 + idx * (nodeHeight + vGap) },
        data: { label: <NodeLabel type={node.type} status={node.status} colors={colors} /> },
        style: nodeStyle(colors),
      });
    }
  });

  // Add orchestration edges
  if (workflowNodes.find(n => n.id === "initialize") && workflowNodes.find(n => n.id === "init_pool")) {
    edges.push({
      id: "e-init-pool",
      source: "initialize",
      target: "init_pool",
      style: { stroke: "#06b6d4", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#06b6d4", width: 20, height: 20 },
    });
  }

  // Connect init_pool to loop (first node of first link)
  if (linkIds.length > 0 && linkGroups[linkIds[0]]?.length > 0) {
    const firstLinkNodes = linkGroups[linkIds[0]];
    const firstNode = firstLinkNodes.find(n => n.id.endsWith("_http"));
    if (firstNode && workflowNodes.find(n => n.id === "init_pool")) {
      edges.push({
        id: "e-pool-loop",
        source: "init_pool",
        target: firstNode.id,
        style: { stroke: "#06b6d4", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#06b6d4", width: 20, height: 20 },
      });
    }
  }

  // Connect last nodes of all links to generate_report
  linkIds.forEach((linkId) => {
    const linkNodes = linkGroups[linkId];
    const lastNode = linkNodes.find(n => n.id.endsWith("_prune")) || linkNodes[linkNodes.length - 1];
    if (lastNode && workflowNodes.find(n => n.id === "generate_report")) {
      edges.push({
        id: `e-${lastNode.id}-report`,
        source: lastNode.id,
        target: "generate_report",
        style: { stroke: "#06b6d4", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#06b6d4", width: 20, height: 20 },
      });
    }
  });

  // Connect generate_report to complete
  if (workflowNodes.find(n => n.id === "generate_report") && workflowNodes.find(n => n.id === "complete")) {
    edges.push({
      id: "e-report-complete",
      source: "generate_report",
      target: "complete",
      style: { stroke: "#06b6d4", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#06b6d4", width: 20, height: 20 },
    });
  }

  return { nodes, edges };
}

export const WorkflowVisualization = ({
  runId,
}: WorkflowVisualizationProps) => {
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWorkflowState = useCallback(async () => {
    try {
      const data = await http<WorkflowState>(`/workflow/${runId}/state`, { silent: true });
      setWorkflowState(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch workflow");
    } finally {
      setIsLoading(false);
    }
  }, [runId]);

  // Convert workflow state to ReactFlow format
  const { nodes: flowNodes, edges: flowEdges } = useMemo(
    () => workflowStateToReactFlow(workflowState),
    [workflowState]
  );

  useEffect(() => {
    fetchWorkflowState();
    const interval = setInterval(fetchWorkflowState, 2000);
    return () => clearInterval(interval);
  }, [fetchWorkflowState]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12 text-red-400">
          <AlertTriangle className="h-5 w-5 mr-2" />
          {error}
        </CardContent>
      </Card>
    );
  }

  const nodes = Object.values(workflowState?.nodes || {});
  const events = workflowState?.executionLog || [];

  // Calculate stats
  const stats = {
    total: nodes.length,
    pending: nodes.filter((n) => n.status === "pending").length,
    running: nodes.filter((n) => n.status === "running").length,
    completed: nodes.filter((n) => n.status === "completed").length,
    failed: nodes.filter((n) => n.status === "failed").length,
  };

  // Determine workflow status
  const workflowStatus =
    stats.failed === stats.total && stats.total > 0
      ? "failed"
      : stats.failed > 0 && stats.completed > 0
      ? "partial"
      : stats.completed === stats.total && stats.total > 0
      ? "completed"
      : stats.running > 0
      ? "running"
      : "pending";

  return (
    <div className="space-y-4">
      {/* Workflow Status Banner */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Badge
                variant={
                  workflowStatus === "completed"
                    ? "default"
                    : workflowStatus === "failed"
                    ? "destructive"
                    : workflowStatus === "partial"
                    ? "secondary"
                    : "outline"
                }
                className="text-sm px-3 py-1"
              >
                {workflowStatus === "partial" ? "Partial Success" : workflowStatus.toUpperCase()}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Run: {runId}
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-500" />
                <span>Pending: {stats.pending}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                <span>Running: {stats.running}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>Completed: {stats.completed}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span>Failed: {stats.failed}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        {/* ReactFlow DAG Visualization */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Workflow DAG</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[600px] w-full">
              {flowNodes.length > 0 ? (
                <ReactFlow
                  nodes={flowNodes}
                  edges={flowEdges}
                  fitView
                  attributionPosition="bottom-left"
                  style={{ background: "#1a1a2e" }}
                >
                  <Background color="#333" gap={20} />
                  <Controls />
                  <MiniMap
                    nodeColor={(node) => {
                      // Extract border color from node style
                      const style = node.style as { border?: string } | undefined;
                      if (style?.border) {
                        const match = style.border.match(/#[0-9a-fA-F]{6}/);
                        if (match) return match[0];
                      }
                      return "#6b7280";
                    }}
                    style={{ background: "#0f0f23" }}
                    maskColor="rgba(0, 0, 0, 0.8)"
                  />
                </ReactFlow>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <Clock className="h-5 w-5 mr-2" />
                  Waiting for workflow to start...
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Event Log */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Event Log</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[550px]">
              {events.length === 0 ? (
                <div className="text-sm text-muted-foreground">No events yet</div>
              ) : (
                <div className="space-y-2">
                  {[...events].reverse().slice(0, 50).map((event, idx) => (
                    <div
                      key={idx}
                      className={`text-xs p-2 rounded border-l-2 ${
                        event.event.includes("fail")
                          ? "border-l-red-500 bg-red-500/10"
                          : event.event.includes("complete")
                          ? "border-l-green-500 bg-green-500/10"
                          : event.event.includes("start")
                          ? "border-l-blue-500 bg-blue-500/10"
                          : "border-l-gray-500 bg-gray-500/10"
                      }`}
                    >
                      <div className="flex justify-between">
                        <span className="font-mono">{event.event}</span>
                        <span className="text-muted-foreground">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      {event.nodeId && (
                        <div className="text-muted-foreground mt-1">
                          Node: {event.nodeId}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default WorkflowVisualization;
