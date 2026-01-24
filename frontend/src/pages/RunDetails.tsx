import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  Download,
  RefreshCw,
  Copy,
  AlertCircle,
  CheckCircle,
  Clock,
  Activity,
  FileText,
  Database,
  Terminal,
  Settings,
  Link,
  ExternalLink,
  ChevronDown,
  GitGraph,
} from "lucide-react";
import { WorkflowVisualization } from "@/components/workflow/WorkflowVisualization";
import { RunsAPI, Run, LogsResponse, EngineStatus, IPCMetadata } from "@/features/runs/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// Interactive JSON Viewer Component with collapsible fields
const JsonViewer = ({ data, title }: { data: any; title?: string }) => {
  const jsonString = JSON.stringify(data, null, 2);
  const lineCount = jsonString.split('\n').length;
  const sizeKB = (new Blob([jsonString]).size / 1024).toFixed(2);
  
  const copyJson = () => {
    navigator.clipboard.writeText(jsonString);
    toast({ title: "JSON copied to clipboard" });
  };

  const downloadJson = () => {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extracted-data-${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "JSON file downloaded" });
  };

  return (
    <div className="border rounded-lg">
      <div className="flex items-center justify-between p-3 bg-muted/50 border-b">
        <div className="flex items-center gap-3">
          <Database className="h-4 w-4" />
          <div>
            <div className="text-sm font-semibold">{title || "Extracted Data"}</div>
            <div className="text-xs text-muted-foreground">
              {lineCount.toLocaleString()} lines • {sizeKB} KB
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={downloadJson}
            className="h-8"
          >
            <Download className="h-3 w-3 mr-2" />
            Download JSON
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyJson}
            className="h-8"
          >
            <Copy className="h-3 w-3 mr-2" />
            Copy JSON
          </Button>
        </div>
      </div>
      <ScrollArea className="h-[calc(100vh-400px)] min-h-[400px] w-full">
        <div className="p-4">
          <JsonNode data={data} name="root" level={0} />
        </div>
      </ScrollArea>
    </div>
  );
};

// Recursive JSON Node component for tree view
const JsonNode = ({ data, name, level }: { data: any; name: string; level: number }) => {
  const [isExpanded, setIsExpanded] = useState(level < 2); // Auto-expand first 2 levels
  
  const indent = level * 20;
  const isObject = data !== null && typeof data === "object";
  const isArray = Array.isArray(data);
  const isPrimitive = !isObject;

  const getValuePreview = (val: any): string => {
    if (val === null) return "null";
    if (val === undefined) return "undefined";
    if (typeof val === "string") return `"${val.length > 50 ? val.substring(0, 50) + "..." : val}"`;
    if (typeof val === "number" || typeof val === "boolean") return String(val);
    if (Array.isArray(val)) return `Array[${val.length}]`;
    if (typeof val === "object") return `Object{${Object.keys(val).length}}`;
    return String(val);
  };

  const getTypeColor = (val: any): string => {
    if (val === null) return "text-muted-foreground";
    if (typeof val === "string") return "text-green-600 dark:text-green-400";
    if (typeof val === "number") return "text-blue-600 dark:text-blue-400";
    if (typeof val === "boolean") return "text-purple-600 dark:text-purple-400";
    return "text-foreground";
  };

  if (isPrimitive) {
    return (
      <div className="flex items-start gap-2 py-0.5 hover:bg-muted/50 rounded px-2" style={{ marginLeft: `${indent}px` }}>
        <span className="text-sm font-medium text-foreground">{name}:</span>
        <span className={`text-sm font-mono ${getTypeColor(data)}`}>
          {getValuePreview(data)}
        </span>
      </div>
    );
  }

  const entries = isArray
    ? data.map((item: any, idx: number) => [idx, item])
    : Object.entries(data);

  return (
    <div style={{ marginLeft: `${indent}px` }}>
      <div
        className="flex items-center gap-2 py-0.5 hover:bg-muted/50 rounded px-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform flex-shrink-0 ${
            isExpanded ? "" : "-rotate-90"
          }`}
        />
        <span className="text-sm font-medium text-foreground">{name}:</span>
        <span className="text-sm text-muted-foreground">
          {isArray ? `Array[${data.length}]` : `Object{${Object.keys(data).length}}`}
        </span>
      </div>
      {isExpanded && (
        <div className="ml-2 border-l border-border/50">
          {entries.map(([key, value]) => (
            <JsonNode key={String(key)} data={value} name={String(key)} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

// Helper function to render nested data in a user-friendly way
const renderValue = (value: any): string => {
  if (value === null || value === undefined) return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    return value.length <= 3 ? value.join(", ") : `${value.length} items`;
  }
  if (typeof value === "object") return `${Object.keys(value).length} properties`;
  return String(value);
};

// Helper component to display object data as cards
const DataDisplay = ({ data, title, onCopy }: { data: any; title?: string; onCopy?: (text: string, label: string) => void }) => {
  if (!data || typeof data !== "object") {
    return (
      <div className="text-sm text-muted-foreground p-4 border rounded">
        No data available
      </div>
    );
  }

  const entries = Array.isArray(data) ? data.map((item, i) => [`Item ${i + 1}`, item]) : Object.entries(data);
  
  return (
    <div className="space-y-2">
      {title && <h4 className="text-sm font-semibold mb-3">{title}</h4>}
      <div className="grid gap-3">
        {entries.map(([key, value]) => {
          const isComplex = typeof value === "object" && value !== null;
          
          return (
            <div key={key} className="border rounded-lg p-3 bg-card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground mb-1">
                    {key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {isComplex ? (
                      Array.isArray(value) ? (
                        value.length === 0 ? (
                          <span className="italic">Empty list</span>
                        ) : (
                          <div className="mt-2 space-y-1">
                            {value.slice(0, 5).map((item, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {typeof item === "object" ? `${Object.keys(item).length} fields` : String(item)}
                                </Badge>
                              </div>
                            ))}
                            {value.length > 5 && (
                              <span className="text-xs italic">
                                ... and {value.length - 5} more
                              </span>
                            )}
                          </div>
                        )
                      ) : (
                        <DataDisplay data={value} onCopy={onCopy} />
                      )
                    ) : (
                      <span className="font-mono">{renderValue(value)}</span>
                    )}
                  </div>
                </div>
                {!isComplex && typeof value === "string" && value.length > 50 && onCopy && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => onCopy(String(value), key)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function RunDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [run, setRun] = useState<Run | null>(null);
  const [logs, setLogs] = useState<LogsResponse | null>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [ipcMetadata, setIpcMetadata] = useState<IPCMetadata | null>(null);
  const [engineData, setEngineData] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [logFilter, setLogFilter] = useState({ source: "all", level: "all" });

  const fetchRun = async () => {
    if (!id) return;
    try {
      const data = await RunsAPI.get(id);
      setRun(data);
    } catch (err: any) {
      console.error("Failed to fetch run:", err);
      toast({
        title: "Failed to load run",
        description: err?.message || String(err),
        variant: "destructive",
      });
    }
  };

  const fetchLogs = async () => {
    if (!id) return;
    setLogsLoading(true);
    try {
      const data = await RunsAPI.getLogs(id, 1000);
      setLogs(data);
    } catch (err: any) {
      console.error("Failed to fetch logs:", err);
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchEngineStatus = async () => {
    if (!id) return;
    setStatusLoading(true);
    try {
      const data = await RunsAPI.getEngineStatus(id);
      setEngineStatus(data);
    } catch (err: any) {
      console.error("Failed to fetch engine status:", err);
      setEngineStatus(null);
    } finally {
      setStatusLoading(false);
    }
  };

  const fetchIpcMetadata = async () => {
    if (!id) return;
    try {
      const data = await RunsAPI.getIpc(id);
      setIpcMetadata(data);
    } catch (err: any) {
      console.error("Failed to fetch IPC metadata:", err);
    }
  };

  const fetchEngineData = async () => {
    if (!id) return;
    try {
      const data = await RunsAPI.getEngineData(id);
      setEngineData(data);
    } catch (err: any) {
      console.error("Failed to fetch engine data:", err);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([
      fetchRun(),
      fetchLogs(),
      fetchEngineStatus(),
      fetchIpcMetadata(),
      fetchEngineData(),
    ]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, [id]);

  useEffect(() => {
    if (!autoRefresh || !id) return;
    const interval = setInterval(() => {
      fetchEngineStatus();
      fetchLogs();
      fetchRun();
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, id]);

  const onPause = async () => {
    if (!id) return;
    try {
      await RunsAPI.pause(id);
      toast({ title: "Run paused" });
      await fetchRun();
      await fetchEngineStatus();
    } catch (err: any) {
      toast({
        title: "Pause failed",
        description: err?.message || String(err),
        variant: "destructive",
      });
    }
  };

  const onResume = async () => {
    if (!id) return;
    try {
      await RunsAPI.resume(id);
      toast({ title: "Run resumed" });
      await fetchRun();
      await fetchEngineStatus();
    } catch (err: any) {
      toast({
        title: "Resume failed",
        description: err?.message || String(err),
        variant: "destructive",
      });
    }
  };

  const onStop = async () => {
    if (!id) return;
    try {
      await RunsAPI.stop(id);
      toast({ title: "Run stopped" });
      await fetchRun();
      await fetchEngineStatus();
    } catch (err: any) {
      toast({
        title: "Stop failed",
        description: err?.message || String(err),
        variant: "destructive",
      });
    }
  };

  const onExport = async () => {
    if (!id) return;
    try {
      const result = await RunsAPI.export(id);
      toast({ title: "Export ready", description: "Downloading..." });
      window.open(result.url, "_blank");
    } catch (err: any) {
      toast({
        title: "Export failed",
        description: err?.message || String(err),
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "PROCESSING":
        return "info";
      case "COMPLETED":
        return "success";
      case "PAUSED":
        return "warning";
      case "FAILED":
      case "ENGINE_CRASHED":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "PROCESSING":
        return <Activity className="h-4 w-4 animate-pulse" />;
      case "COMPLETED":
        return <CheckCircle className="h-4 w-4" />;
      case "PAUSED":
        return <Clock className="h-4 w-4" />;
      case "FAILED":
      case "ENGINE_CRASHED":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const filteredLogs = logs?.lines.filter((log) => {
    if (logFilter.source !== "all" && log.source !== logFilter.source) return false;
    if (logFilter.level !== "all" && log.level !== logFilter.level) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="h-full bg-background flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading run details...</p>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="h-full bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 mx-auto mb-4 text-destructive" />
          <p className="text-lg font-semibold mb-2">Run not found</p>
          <Button onClick={() => navigate("/runs")}>Back to Runs</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/runs")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-foreground">{run.name}</h1>
                <Badge variant={getStatusVariant(run.status)} className="flex items-center gap-1">
                  {getStatusIcon(run.status)}
                  {run.status}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span className="font-medium">ID:</span>
                  <code className="px-1 py-0.5 bg-muted rounded text-xs">{run.id}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(run.id, "Run ID")}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <div>Started: {new Date(run.startDate).toLocaleString()}</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAutoRefresh(!autoRefresh);
                toast({
                  title: autoRefresh ? "Auto-refresh disabled" : "Auto-refresh enabled",
                });
              }}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? "animate-spin" : ""}`} />
              {autoRefresh ? "Refreshing..." : "Auto-refresh"}
            </Button>
            {run.status === "PROCESSING" && (
              <Button variant="outline" size="sm" onClick={onPause}>
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </Button>
            )}
            {run.status === "PAUSED" && (
              <Button variant="outline" size="sm" onClick={onResume}>
                <Play className="h-4 w-4 mr-2" />
                Resume
              </Button>
            )}
            {run.status !== "COMPLETED" && run.status !== "FAILED" && (
              <Button variant="outline" size="sm" onClick={onStop}>
                <Square className="h-4 w-4 mr-2" />
                Stop
              </Button>
            )}
            <Button variant="default" size="sm" onClick={onExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Articles Collected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{run.articlesCount.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Data Entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{run.dataEntriesCount.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              LLM Provider
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">{run.llmProvider}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Search Methods
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {run.searchMethods.map((method) => (
                <Badge key={method} variant="outline" className="text-xs">
                  {method}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="px-6 pb-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="overview">
              <Settings className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="workflow">
              <GitGraph className="h-4 w-4 mr-2" />
              Workflow
            </TabsTrigger>
            <TabsTrigger value="status">
              <Activity className="h-4 w-4 mr-2" />
              Engine Status
            </TabsTrigger>
            <TabsTrigger value="logs">
              <FileText className="h-4 w-4 mr-2" />
              Logs
            </TabsTrigger>
            <TabsTrigger value="articles">
              <Link className="h-4 w-4 mr-2" />
              Articles
            </TabsTrigger>
            <TabsTrigger value="data">
              <Database className="h-4 w-4 mr-2" />
              Extracted Data
            </TabsTrigger>
            <TabsTrigger value="metadata">
              <Terminal className="h-4 w-4 mr-2" />
              Metadata
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Run Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold mb-2">Search Queries</h3>
                  <div className="flex flex-wrap gap-2">
                    {run.searchQueries.length > 0 ? (
                      run.searchQueries.map((query, i) => (
                        <Badge key={i} variant="secondary">
                          {query}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">No search queries</span>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2">Search Methods</h3>
                  <div className="flex flex-wrap gap-2">
                    {run.searchMethods.map((method) => (
                      <Badge key={method} variant="outline">
                        {method}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2">LLM Provider</h3>
                  <Badge variant="secondary" className="text-sm">
                    {run.llmProvider}
                  </Badge>
                </div>
                {ipcMetadata?.metadata && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3">Advanced Configuration</h3>
                    <ScrollArea className="h-[400px] w-full">
                      <DataDisplay data={ipcMetadata.metadata} onCopy={copyToClipboard} />
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Workflow Tab */}
          <TabsContent value="workflow" className="mt-4">
            <WorkflowVisualization runId={id!} />
          </TabsContent>

          {/* Engine Status Tab */}
          <TabsContent value="status" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Engine Status</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchEngineStatus}
                    disabled={statusLoading}
                  >
                    <RefreshCw className={`h-4 w-4 ${statusLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {engineStatus ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">State:</span>
                      <Badge variant={engineStatus.crashed ? "destructive" : "success"}>
                        {engineStatus.state}
                      </Badge>
                    </div>
                    {engineStatus.crashed && engineStatus.crashes && (
                      <div>
                        <h3 className="text-sm font-semibold mb-2 text-destructive">
                          Crashes Detected ({engineStatus.crashCount})
                        </h3>
                        <div className="space-y-2">
                          {engineStatus.crashes.map((crash, i) => (
                            <Card key={i} className="border-destructive">
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm">Worker: {crash.worker}</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <ScrollArea className="h-[200px] w-full">
                                  <pre className="text-xs text-destructive">
                                    {crash.content}
                                  </pre>
                                </ScrollArea>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                    {engineStatus.message && (
                      <div className="p-3 border rounded-lg bg-muted/50">
                        <div className="text-sm font-medium mb-1">Status Message</div>
                        <div className="text-sm text-muted-foreground">{engineStatus.message}</div>
                      </div>
                    )}
                    <div>
                      <h3 className="text-sm font-semibold mb-3">Detailed Status Information</h3>
                      <ScrollArea className="h-[400px] w-full">
                        <DataDisplay data={engineStatus} onCopy={copyToClipboard} />
                      </ScrollArea>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                    <p>Engine status not available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Unified Logs</CardTitle>
                  <div className="flex items-center gap-2">
                    <select
                      className="h-8 rounded border px-2 text-sm bg-background"
                      value={logFilter.source}
                      onChange={(e) =>
                        setLogFilter({ ...logFilter, source: e.target.value })
                      }
                    >
                      <option value="all">All Sources</option>
                      <option value="engine">Engine</option>
                      <option value="server">Server</option>
                      <option value="extension">Extension</option>
                    </select>
                    <select
                      className="h-8 rounded border px-2 text-sm bg-background"
                      value={logFilter.level}
                      onChange={(e) => setLogFilter({ ...logFilter, level: e.target.value })}
                    >
                      <option value="all">All Levels</option>
                      <option value="DEBUG">DEBUG</option>
                      <option value="INFO">INFO</option>
                      <option value="WARN">WARN</option>
                      <option value="ERROR">ERROR</option>
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchLogs}
                      disabled={logsLoading}
                    >
                      <RefreshCw className={`h-4 w-4 ${logsLoading ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {logs ? (
                  <ScrollArea className="h-[600px] w-full rounded border p-4 bg-muted/30">
                    <div className="font-mono text-xs space-y-1">
                      {filteredLogs && filteredLogs.length > 0 ? (
                        filteredLogs.map((log, i) => (
                          <div key={i} className="flex gap-2">
                            <span className="text-muted-foreground whitespace-nowrap">
                              {log.timestamp}
                            </span>
                            <Badge
                              variant={
                                log.level === "ERROR"
                                  ? "destructive"
                                  : log.level === "WARN"
                                  ? "warning"
                                  : "secondary"
                              }
                              className="text-xs h-5"
                            >
                              {log.source}
                            </Badge>
                            <Badge
                              variant={
                                log.level === "ERROR"
                                  ? "destructive"
                                  : log.level === "WARN"
                                  ? "warning"
                                  : "outline"
                              }
                              className="text-xs h-5"
                            >
                              {log.level}
                            </Badge>
                            <span className="flex-1">{log.message}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">
                          No logs match the current filters
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2" />
                    <p>No logs available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Articles Tab */}
          <TabsContent value="articles" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Articles Collected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="text-2xl font-bold">{run.articlesCount.toLocaleString()}</div>
                      <div className="text-sm text-muted-foreground">
                        Total articles collected for this run
                      </div>
                    </div>
                    <Button onClick={() => navigate("/articles")} variant="outline">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View All Articles
                    </Button>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p className="mb-2">Articles are stored in the run's IPC directory:</p>
                    {ipcMetadata && (
                      <code className="block bg-muted p-2 rounded text-xs">
                        {ipcMetadata.ipcDir}/articles/
                      </code>
                    )}
                  </div>
                  {run.articlesCount === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Link className="h-8 w-8 mx-auto mb-2" />
                      <p>No articles collected yet</p>
                      <p className="text-xs mt-2">Articles will appear here as the run progresses</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Extracted Data Tab */}
          <TabsContent value="data" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Extracted Data</CardTitle>
              </CardHeader>
              <CardContent>
                {engineData ? (
                  <JsonViewer data={engineData} title="Extracted Data" />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Database className="h-8 w-8 mx-auto mb-2" />
                    <p>No extracted data available yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Metadata Tab */}
          <TabsContent value="metadata" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>IPC Metadata</CardTitle>
              </CardHeader>
              <CardContent>
                {ipcMetadata ? (
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4 bg-muted/50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="text-sm font-semibold mb-2">IPC Directory</div>
                          <code className="text-xs bg-background px-3 py-2 rounded block break-all">
                            {ipcMetadata.ipcDir}
                          </code>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(ipcMetadata.ipcDir, "IPC Directory")
                          }
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="border rounded-lg p-4 bg-muted/50">
                      <div className="text-sm font-semibold mb-2">Run ID</div>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-background px-3 py-2 rounded">
                          {ipcMetadata.runId}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7"
                          onClick={() =>
                            copyToClipboard(ipcMetadata.runId, "Run ID")
                          }
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold mb-3">Configuration Details</h3>
                      <ScrollArea className="h-[500px] w-full">
                        <DataDisplay data={ipcMetadata.metadata} onCopy={copyToClipboard} />
                      </ScrollArea>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2" />
                    <p>No metadata available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
