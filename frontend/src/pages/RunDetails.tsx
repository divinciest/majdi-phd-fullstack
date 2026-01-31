import { useEffect, useRef, useState } from "react";
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
  RotateCcw,
  FastForward,
  Search,
  Globe,
  Archive,
} from "lucide-react";
import { WorkflowVisualization } from "@/components/workflow/WorkflowVisualization";
import { RunsAPI, Run, LogsResponse, EngineStatus, IPCMetadata, EngineLogsResponse, RunProgress, SchemaMapping, RunExtractedDataResponse, RunInspectionResponse, ValidationResult, CacheStatsResponse, ApiAnalyticsResponse, CacheEvent, ApiCall } from "@/features/runs/api";
import { SourcesAPI, type Source, type SourcePreview } from "@/features/sources/api";
import { API_BASE_URL } from "@/lib/http";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { normalizeRetryName } from "@/lib/utils";

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
          className={`h-4 w-4 transition-transform flex-shrink-0 ${isExpanded ? "" : "-rotate-90"
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

// Validation Results Tab Component
const ValidationResultsTab = ({ runId }: { runId: string }) => {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [runningValidation, setRunningValidation] = useState(false);
  const [rerunningValidation, setRerunningValidation] = useState(false);
  const [validationPromptFile, setValidationPromptFile] = useState<File | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchValidation = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await RunsAPI.getValidation(runId);
      setValidation(result);
    } catch (err: any) {
      setError(err?.message || "Failed to load validation results");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchValidation();
  }, [runId]);

  const handleUploadAndRunValidation = async () => {
    if (!validationPromptFile) {
      toast({ title: "Error", description: "Please select a validation prompt file", variant: "destructive" });
      return;
    }
    
    setUploading(true);
    setRunningValidation(true);
    try {
      // Step 1: Upload the validation prompt
      await RunsAPI.uploadValidationPrompt(runId, validationPromptFile);
      toast({ title: "Prompt Uploaded", description: "Validation prompt uploaded. Starting validation process..." });
      
      // Step 2: Run validation (spawns extract.py --validation-only)
      await RunsAPI.runValidation(runId);
      toast({ title: "Validation Started", description: "Validation process started. Check Logs tab for progress." });
      
      setValidationPromptFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      
      // Poll for results more aggressively since it's a subprocess
      const pollInterval = setInterval(() => {
        fetchValidation().then(() => {
          // Stop polling if we have results
          if (validation && validation.summary) {
            clearInterval(pollInterval);
          }
        });
      }, 5000);
      
      // Stop polling after 2 minutes max
      setTimeout(() => clearInterval(pollInterval), 120000);
      
    } catch (err: any) {
      toast({ title: "Validation Failed", description: err?.message || "Failed to run validation", variant: "destructive" });
    } finally {
      setUploading(false);
      setRunningValidation(false);
    }
  };

  const handleRerunValidation = async () => {
    setRerunningValidation(true);
    try {
      const result = await RunsAPI.rerunValidation(runId);
      toast({ title: "Success", description: result.message });
      await fetchValidation();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to re-run validation", variant: "destructive" });
    } finally {
      setRerunningValidation(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Loading validation results...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-6 w-6 text-destructive mx-auto mb-2" />
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!validation?.exists) {
    return (
      <Card>
        <CardContent className="py-8 space-y-6">
          <div className="text-center">
            <CheckCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">{validation?.message || "Validation was not enabled for this run"}</p>
          </div>
          
          {/* Post-extraction validation upload */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-medium mb-3">Run Validation Post-Extraction</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Upload a validation prompt to enable validation on the extracted data.
            </p>
            
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt"
                  onChange={(e) => setValidationPromptFile(e.target.files?.[0] || null)}
                  className="flex-1 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                />
              </div>
              
              <Button 
                onClick={handleUploadAndRunValidation} 
                disabled={!validationPromptFile || uploading || runningValidation}
                size="sm"
              >
                {(uploading || runningValidation) ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                {uploading ? "Uploading..." : runningValidation ? "Running..." : "Upload & Run Validation"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const passRate = validation.summary?.overallPassRate ?? 0;
  const passRatePercent = Math.round(passRate * 100);

  const handleDownloadValidationReport = (format: 'pdf' | 'excel') => {
    window.open(`${API_BASE_URL}/runs/${runId}/validation/report?format=${format}`, '_blank');
    setShowDownloadModal(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5" />
          Validation Results
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRerunValidation} disabled={rerunningValidation}>
            {rerunningValidation ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Re-run
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowDownloadModal(true)}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </CardHeader>
      
      {/* Download Format Modal */}
      <Dialog open={showDownloadModal} onOpenChange={setShowDownloadModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Download Validation Report</DialogTitle>
            <DialogDescription>
              Choose the format for your validation report. PDF includes formatted tables, Excel allows further analysis.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <Button 
              variant="outline" 
              className="h-24 flex flex-col items-center justify-center gap-2"
              onClick={() => handleDownloadValidationReport('pdf')}
            >
              <FileText className="h-8 w-8" />
              <span className="font-medium">PDF Report</span>
              <span className="text-xs text-muted-foreground">Formatted document</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-24 flex flex-col items-center justify-center gap-2"
              onClick={() => handleDownloadValidationReport('excel')}
            >
              <Database className="h-8 w-8" />
              <span className="font-medium">Excel Report</span>
              <span className="text-xs text-muted-foreground">Multiple sheets</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <CardContent className="space-y-6">
        {/* Summary Section */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border rounded-lg p-4 bg-muted/50">
            <div className="text-xs text-muted-foreground mb-1">Pass Rate</div>
            <div className="text-2xl font-bold">
              <span className={passRatePercent >= 80 ? "text-green-600" : passRatePercent >= 50 ? "text-yellow-600" : "text-red-600"}>
                {passRatePercent}%
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mt-2">
              <div 
                className={`h-2 rounded-full ${passRatePercent >= 80 ? "bg-green-500" : passRatePercent >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                style={{ width: `${passRatePercent}%` }}
              />
            </div>
          </div>
          <div className="border rounded-lg p-4 bg-muted/50">
            <div className="text-xs text-muted-foreground mb-1">Total Rows</div>
            <div className="text-2xl font-bold">{validation.summary?.totalRows ?? 0}</div>
          </div>
          <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/20">
            <div className="text-xs text-muted-foreground mb-1">Accepted</div>
            <div className="text-2xl font-bold text-green-600">{validation.summary?.acceptedRows ?? "—"}</div>
          </div>
          <div className="border rounded-lg p-4 bg-red-50 dark:bg-red-950/20">
            <div className="text-xs text-muted-foreground mb-1">Rejected</div>
            <div className="text-2xl font-bold text-red-600">{validation.summary?.rejectedRows ?? "—"}</div>
          </div>
        </div>

        {/* Column-Centric Constraints View */}
        {validation.rules && validation.rules.length > 0 && (() => {
          // Build column -> rules mapping
          const columnToRules: Record<string, typeof validation.rules> = {};
          validation.rules.forEach((rule) => {
            (rule.columns || []).forEach((col) => {
              if (!columnToRules[col]) columnToRules[col] = [];
              columnToRules[col].push(rule);
            });
          });
          const sortedColumns = Object.keys(columnToRules).sort();
          
          return (
            <div className="border rounded-lg">
              <div className="px-4 py-3 border-b bg-muted/50">
                <h3 className="font-semibold text-sm">Constraints by Column ({sortedColumns.length} columns)</h3>
                <p className="text-xs text-muted-foreground mt-1">View which validation rules apply to each column</p>
              </div>
              <ScrollArea className="max-h-[500px]">
                <div className="divide-y">
                  {sortedColumns.map((column) => {
                    const rules = columnToRules[column];
                    // Only errors that fail are true failures
                    const errorFailCount = rules.filter(r => r.severity === "error" && !r.rawPassed).length;
                    const warningCount = rules.filter(r => r.severity === "warning" && !r.rawPassed).length;
                    
                    return (
                      <Collapsible key={column}>
                        <CollapsibleTrigger className="w-full">
                          <div className={`p-3 flex items-center justify-between hover:bg-muted/50 transition-colors ${errorFailCount > 0 ? "bg-red-50/30 dark:bg-red-950/10" : ""}`}>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="font-mono text-xs">{column}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {rules.length} rule{rules.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {errorFailCount > 0 && (
                                <Badge variant="destructive" className="text-xs">{errorFailCount} error{errorFailCount !== 1 ? "s" : ""}</Badge>
                              )}
                              {warningCount > 0 && (
                                <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-400">{warningCount} warning{warningCount !== 1 ? "s" : ""}</Badge>
                              )}
                              {errorFailCount === 0 && warningCount === 0 && (
                                <Badge variant="default" className="text-xs bg-green-600">All passed</Badge>
                              )}
                              {errorFailCount === 0 && warningCount > 0 && (
                                <Badge variant="default" className="text-xs bg-green-600">Passed</Badge>
                              )}
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="border-t bg-muted/20">
                            {rules.map((rule) => {
                              const isError = rule.severity === "error";
                              const isFailed = !rule.rawPassed;
                              const affectedCount = rule.affectedRows?.length || 0;
                              
                              return (
                                <div key={rule.ruleId} className={`px-4 py-2 border-b last:border-b-0 ${isError && isFailed ? "bg-red-50/50 dark:bg-red-950/10" : isFailed ? "bg-yellow-50/50 dark:bg-yellow-950/10" : ""}`}>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-mono text-xs text-muted-foreground">{rule.ruleId}</span>
                                    {isError ? (
                                      <Badge variant={rule.rawPassed ? "default" : "destructive"} className="text-xs">
                                        {rule.rawPassed ? "PASS" : "FAIL"}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className={`text-xs ${rule.rawPassed ? "" : "text-yellow-600 border-yellow-400"}`}>
                                        {rule.rawPassed ? "OK" : "WARN"}
                                      </Badge>
                                    )}
                                    <Badge variant="outline" className="text-xs">
                                      {rule.severity}
                                    </Badge>
                                    {affectedCount > 0 && (
                                      <span className="text-xs text-muted-foreground">
                                        ({affectedCount} row{affectedCount !== 1 ? "s" : ""})
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs font-medium">{rule.name}</p>
                                  {rule.description && (
                                    <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
                                  )}
                                  {rule.columns && rule.columns.length > 1 && (
                                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                                      <span className="text-xs text-muted-foreground">Also involves:</span>
                                      {rule.columns.filter(c => c !== column).map((col) => (
                                        <Badge key={col} variant="outline" className="text-xs font-mono">{col}</Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          );
        })()}

        {/* Rules Summary (by Rule) */}
        {validation.rules && validation.rules.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full">
                <ChevronDown className="h-4 w-4 mr-2" />
                View All Rules ({validation.rules.length})
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <div className="border rounded-lg">
                <ScrollArea className="max-h-[500px]">
                  <div className="divide-y">
                    {validation.rules.map((rule) => {
                      const isError = rule.severity === "error";
                      const isFailed = !rule.rawPassed;
                      const affectedCount = rule.affectedRows?.length || 0;
                      
                      return (
                        <div key={rule.ruleId} className={`p-4 ${isError && isFailed ? "bg-red-50/50 dark:bg-red-950/10" : isFailed ? "bg-yellow-50/30 dark:bg-yellow-950/10" : ""}`}>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-mono text-xs text-muted-foreground">{rule.ruleId}</span>
                                {isError ? (
                                  <Badge variant={rule.rawPassed ? "default" : "destructive"} className="text-xs">
                                    {rule.rawPassed ? "PASS" : "FAIL"}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className={`text-xs ${rule.rawPassed ? "" : "text-yellow-600 border-yellow-400"}`}>
                                    {rule.rawPassed ? "OK" : "WARN"}
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  {rule.severity}
                                </Badge>
                                {affectedCount > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    ({affectedCount} row{affectedCount !== 1 ? "s" : ""} affected)
                                  </span>
                                )}
                              </div>
                              <h4 className="font-medium text-sm">{rule.name}</h4>
                              {rule.description && (
                                <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
                              )}
                              {rule.columns && rule.columns.length > 0 && (
                                <div className="flex items-center gap-1 mt-2 flex-wrap">
                                  <span className="text-xs text-muted-foreground">Columns:</span>
                                  {rule.columns.map((col) => (
                                    <Badge key={col} variant="secondary" className="text-xs font-mono">
                                      {col}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {rule.constraint && (
                                <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono overflow-x-auto">
                                  <span className="text-muted-foreground">Expression: </span>
                                  <code className="break-all">{rule.constraint}</code>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Row Flags Preview */}
        {validation.rowFlags && validation.rowFlags.length > 0 && (() => {
          // Get all flag columns (boolean columns that aren't row_index)
          const flagColumns = Object.keys(validation.rowFlags[0] || {}).filter(k => 
            k !== "row_index" && typeof validation.rowFlags![0][k] === "boolean"
          );
          
          return (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full">
                  <ChevronDown className="h-4 w-4 mr-2" />
                  View Row-Level Flags ({validation.rowFlagsTotal} rows)
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <div className="border rounded-lg">
                  <ScrollArea className="max-h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[60px]">Row</TableHead>
                          <TableHead className="w-[100px]">Status</TableHead>
                          {flagColumns.slice(0, 5).map((key) => (
                            <TableHead key={key} className="text-xs">{key.replace(/_/g, ' ')}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {validation.rowFlags.slice(0, 50).map((row, idx) => {
                          // Count passed/failed flags for this row
                          const passedCount = flagColumns.filter(k => row[k] === true).length;
                          const failedCount = flagColumns.filter(k => row[k] === false).length;
                          const totalFlags = flagColumns.length;
                          
                          return (
                            <TableRow key={idx}>
                              <TableCell className="font-mono text-xs">{row.row_index ?? idx + 1}</TableCell>
                              <TableCell className="text-xs">
                                <div className="flex items-center gap-1">
                                  <span className="text-green-600 font-medium">{passedCount}</span>
                                  <span className="text-muted-foreground">/</span>
                                  <span className={failedCount > 0 ? "text-red-600 font-medium" : "text-muted-foreground"}>{totalFlags}</span>
                                  {failedCount === 0 && <CheckCircle className="h-3 w-3 text-green-600 ml-1" />}
                                </div>
                              </TableCell>
                              {flagColumns.slice(0, 5).map((key) => (
                                <TableCell key={key} className="text-xs">
                                  {typeof row[key] === "boolean" ? (
                                    <Badge variant={row[key] ? "default" : "destructive"} className="text-xs">
                                      {row[key] ? "✓" : "✗"}
                                    </Badge>
                                  ) : (
                                    String(row[key]).substring(0, 30)
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                  {(validation.rowFlagsTotal ?? 0) > 50 && (
                    <div className="px-4 py-2 border-t text-xs text-muted-foreground text-center">
                      Showing first 50 of {validation.rowFlagsTotal} rows
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })()}

        {/* Validation Prompt Review */}
        {validation.validationPrompt && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full">
                <ChevronDown className="h-4 w-4 mr-2" />
                View Validation Prompt
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <div className="border rounded-lg p-4 bg-muted/50">
                <pre className="text-sm whitespace-pre-wrap font-mono">
                  {validation.validationPrompt}
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Generated Config */}
        {validation.generatedConfig && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full">
                <ChevronDown className="h-4 w-4 mr-2" />
                View Generated Validation Config
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <div className="border rounded-lg p-4 bg-muted/50">
                <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(validation.generatedConfig, null, 2)}
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
};

// Cache Statistics Tab Component
const CacheStatsTab = ({ runId }: { runId: string }) => {
  const [cacheStats, setCacheStats] = useState<CacheStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCacheEvent, setSelectedCacheEvent] = useState<CacheEvent | null>(null);

  const fetchCacheStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await RunsAPI.getCacheStats(runId);
      setCacheStats(result);
    } catch (err: any) {
      setError(err?.message || "Failed to load cache statistics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCacheStats();
  }, [runId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Loading cache statistics...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-6 w-6 text-destructive mx-auto mb-2" />
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!cacheStats || cacheStats.total === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Archive className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">No cache events recorded for this run</p>
          <p className="text-xs text-muted-foreground mt-2">Cache events will appear here as extraction progresses</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={fetchCacheStats}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { summary, events } = cacheStats;
  const providers = Object.entries(summary.byProvider);
  const totalOps = summary.totalHits + summary.totalMisses + summary.totalSkips;
  const overallHitRate = totalOps > 0 ? Math.round((summary.totalHits / totalOps) * 100) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Archive className="h-5 w-5" />
          Cache Statistics
        </CardTitle>
        <Button variant="outline" size="sm" onClick={fetchCacheStats}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border rounded-lg p-4 bg-muted/50">
            <div className="text-xs text-muted-foreground mb-1">Overall Hit Rate</div>
            <div className="text-2xl font-bold">
              <span className={overallHitRate >= 80 ? "text-green-600" : overallHitRate >= 50 ? "text-yellow-600" : "text-red-600"}>
                {overallHitRate}%
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mt-2">
              <div 
                className={`h-2 rounded-full ${overallHitRate >= 80 ? "bg-green-500" : overallHitRate >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                style={{ width: `${overallHitRate}%` }}
              />
            </div>
          </div>
          <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/20">
            <div className="text-xs text-muted-foreground mb-1">Cache Hits</div>
            <div className="text-2xl font-bold text-green-600">{summary.totalHits}</div>
          </div>
          <div className="border rounded-lg p-4 bg-red-50 dark:bg-red-950/20">
            <div className="text-xs text-muted-foreground mb-1">Cache Misses</div>
            <div className="text-2xl font-bold text-red-600">{summary.totalMisses}</div>
          </div>
          <div className="border rounded-lg p-4 bg-yellow-50 dark:bg-yellow-950/20">
            <div className="text-xs text-muted-foreground mb-1">Cache Skips</div>
            <div className="text-2xl font-bold text-yellow-600">{summary.totalSkips}</div>
          </div>
        </div>

        {/* Per-Provider Stats */}
        {providers.length > 0 && (
          <div className="border rounded-lg">
            <div className="px-4 py-3 border-b bg-muted/50">
              <h3 className="font-semibold text-sm">Cache by Provider ({providers.length} providers)</h3>
            </div>
            <div className="divide-y">
              {providers.map(([provider, stats]) => (
                <div key={provider} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="font-mono text-xs">{provider}</Badge>
                    <span className="text-sm text-muted-foreground">{stats.total} operations</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Hits:</span>
                      <Badge variant="default" className="bg-green-600 text-xs">{stats.hits}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Misses:</span>
                      <Badge variant="destructive" className="text-xs">{stats.misses}</Badge>
                    </div>
                    {stats.skips > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Skips:</span>
                        <Badge variant="outline" className="text-yellow-600 border-yellow-400 text-xs">{stats.skips}</Badge>
                      </div>
                    )}
                    <div className="w-20 text-right">
                      <span className={`text-sm font-medium ${stats.hitRate >= 80 ? "text-green-600" : stats.hitRate >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                        {stats.hitRate}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Event Log */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full">
              <ChevronDown className="h-4 w-4 mr-2" />
              View All Cache Events ({events.length})
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <div className="border rounded-lg overflow-hidden">
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">#</TableHead>
                      <TableHead className="w-[80px]">Type</TableHead>
                      <TableHead className="w-[100px]">Provider</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event, idx) => (
                      <TableRow 
                        key={idx} 
                        className={`cursor-pointer hover:bg-muted/50 ${
                          event.type === "hit" ? "bg-green-50/30 dark:bg-green-950/10" :
                          event.type === "miss" ? "bg-red-50/30 dark:bg-red-950/10" :
                          "bg-yellow-50/30 dark:bg-yellow-950/10"
                        }`}
                        onClick={() => setSelectedCacheEvent(event)}
                      >
                        <TableCell className="font-mono text-xs">{idx + 1}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={event.type === "hit" ? "default" : event.type === "miss" ? "destructive" : "outline"}
                            className={`text-xs ${event.type === "hit" ? "bg-green-600" : event.type === "skip" ? "text-yellow-600 border-yellow-400" : ""}`}
                          >
                            {event.type.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-xs">{event.provider}</Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono truncate max-w-[400px]" title={event.details}>
                          {event.details}
                        </TableCell>
                        <TableCell className="w-[60px]">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <Search className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Cache Event Inspection Dialog */}
        <Dialog open={!!selectedCacheEvent} onOpenChange={(open) => !open && setSelectedCacheEvent(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Archive className="h-5 w-5" />
                Cache Event Details
              </DialogTitle>
              <DialogDescription>
                Inspect the cache event details and raw log entry
              </DialogDescription>
            </DialogHeader>
            {selectedCacheEvent && (
              <div className="space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="border rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-1">Type</div>
                    <Badge 
                      variant={selectedCacheEvent.type === "hit" ? "default" : selectedCacheEvent.type === "miss" ? "destructive" : "outline"}
                      className={selectedCacheEvent.type === "hit" ? "bg-green-600" : selectedCacheEvent.type === "skip" ? "text-yellow-600 border-yellow-400" : ""}
                    >
                      {selectedCacheEvent.type.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-1">Provider</div>
                    <Badge variant="secondary" className="font-mono">{selectedCacheEvent.provider}</Badge>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-1">Source File</div>
                    <span className="text-sm font-mono">{selectedCacheEvent.source}</span>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-1">Line Number</div>
                    <span className="text-sm font-mono">{selectedCacheEvent.line}</span>
                  </div>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1">Details</div>
                  <p className="text-sm font-mono break-all">{selectedCacheEvent.details}</p>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1">Raw Log Entry</div>
                  <ScrollArea className="h-[120px]">
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/50 p-2 rounded">{selectedCacheEvent.raw}</pre>
                  </ScrollArea>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
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

  const dataTableTopScrollRef = useRef<HTMLDivElement | null>(null);
  const dataTableScrollRef = useRef<HTMLDivElement | null>(null);
  const dataTableInnerRef = useRef<HTMLTableElement | null>(null);
  const [dataTableScrollWidth, setDataTableScrollWidth] = useState<number>(0);

  const [run, setRun] = useState<Run | null>(null);
  const [logs, setLogs] = useState<LogsResponse | null>(null);
  const [engineLogs, setEngineLogs] = useState<EngineLogsResponse | null>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [ipcMetadata, setIpcMetadata] = useState<IPCMetadata | null>(null);
  const [extractedData, setExtractedData] = useState<RunExtractedDataResponse | null>(null);
  const [inspection, setInspection] = useState<RunInspectionResponse | null>(null);
  const [apiAnalytics, setApiAnalytics] = useState<ApiAnalyticsResponse | null>(null);
  const [apiAnalyticsLoading, setApiAnalyticsLoading] = useState(false);
  const [selectedApiCall, setSelectedApiCall] = useState<ApiCall | null>(null);

  const [runSources, setRunSources] = useState<Source[]>([]);
  const [runSourcesLoading, setRunSourcesLoading] = useState(false);
  const [selectedSource, setSelectedSource] = useState<SourcePreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [schemaMapping, setSchemaMapping] = useState<SchemaMapping | null>(null);
  const [progress, setProgress] = useState<RunProgress | null>(null);

  const fetchRunSources = async () => {
    if (!id) return;
    setRunSourcesLoading(true);
    try {
      const res = await SourcesAPI.listByRun(id, { page: 1, pageSize: 200 });
      setRunSources(res.items || []);
    } catch (err: any) {
      toast({
        title: "Failed to load sources",
        description: err?.message || String(err),
        variant: "destructive",
      });
    } finally {
      setRunSourcesLoading(false);
    }
  };

  const openPreview = async (sourceId: string) => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const p = await SourcesAPI.preview(sourceId);
      setSelectedSource(p);
    } catch (err: any) {
      setSelectedSource(null);
      toast({
        title: "Failed to load preview",
        description: err?.message || String(err),
        variant: "destructive",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const [extractedDataPage, setExtractedDataPage] = useState(1);
  const [extractedDataPageSize, setExtractedDataPageSize] = useState(100);
  const [extractedDataSort, setExtractedDataSort] = useState<string | undefined>(undefined);

  const [validatedData, setValidatedData] = useState<RunExtractedDataResponse | null>(null);
  const [validatedDataPage, setValidatedDataPage] = useState(1);
  const [validatedDataPageSize, setValidatedDataPageSize] = useState(100);

  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [engineLogsLoading, setEngineLogsLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [logFilter, setLogFilter] = useState({ source: "all", level: "all" });
  const [engineLogFilter, setEngineLogFilter] = useState({ source: "all", level: "all" });

  const fetchRun = async () => {
    if (!id) return;
    try {
      const data = await RunsAPI.get(id);
      setRun(data);
    } catch (err: any) {
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
      setEngineStatus(null);
    } finally {
      setStatusLoading(false);
    }
  };

  const fetchApiAnalytics = async () => {
    if (!id) return;
    setApiAnalyticsLoading(true);
    try {
      const data = await RunsAPI.getApiAnalytics(id);
      setApiAnalytics(data);
    } catch (err: any) {
      setApiAnalytics(null);
    } finally {
      setApiAnalyticsLoading(false);
    }
  };

  const fetchIpcMetadata = async () => {
    if (!id) return;
    try {
      const data = await RunsAPI.getIpc(id);
      setIpcMetadata(data);
    } catch (err: any) {
    }
  };

  const fetchEngineLogs = async () => {
    if (!id) return;
    setEngineLogsLoading(true);
    try {
      const data = await RunsAPI.getEngineLogs(id);
      setEngineLogs(data);
    } catch (err: any) {
    } finally {
      setEngineLogsLoading(false);
    }
  };

  const fetchExtractedData = async () => {
    if (!id) return;
    try {
      const data = await RunsAPI.getExtractedData(id, { page: extractedDataPage, pageSize: extractedDataPageSize, sort: extractedDataSort });
      setExtractedData(data);
    } catch (err: any) {
    }
  };

  const fetchValidatedData = async () => {
    if (!id) return;
    try {
      const data = await RunsAPI.getValidatedData(id, { page: validatedDataPage, pageSize: validatedDataPageSize });
      setValidatedData(data);
    } catch (err: any) {
    }
  };

  const fetchInspection = async () => {
    if (!id) return;
    try {
      const data = await RunsAPI.getInspection(id);
      setInspection(data);
    } catch (err: any) {
      setInspection(null);
    }
  };

  const fetchSchemaMapping = async () => {
    if (!id) return;
    try {
      const res = await RunsAPI.getSchemaMapping(id);
      setSchemaMapping(res.exists ? (res.mapping as any) : null);
    } catch (err: any) {
      setSchemaMapping(null);
    }
  };

  const fetchProgress = async () => {
    if (!id) return;
    try {
      const data = await RunsAPI.getProgress(id);
      setProgress(data);
    } catch (err: any) {
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([
      fetchRun(),
      fetchRunSources(),
      fetchLogs(),
      fetchEngineLogs(),
      fetchEngineStatus(),
      fetchIpcMetadata(),
      fetchExtractedData(),
      fetchValidatedData(),
      fetchSchemaMapping(),
      fetchProgress(),
    ]);
    setLoading(false);
  };

  const resolvedSchemaFields = (() => {
    const defs = schemaMapping?.fieldDefs;
    if (Array.isArray(defs) && defs.length > 0) {
      return defs.map((d) => d?.name).filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    }
    const names = schemaMapping?.fields;
    if (Array.isArray(names) && names.length > 0) {
      return names.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    }
    if (Array.isArray(extractedData?.fields) && extractedData!.fields!.length > 0) {
      return extractedData!.fields!.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    }
    if (extractedData?.exists && extractedData.data.length > 0) {
      const keys = new Set<string>();
      for (const row of extractedData.data) {
        if (row && typeof row === "object" && !Array.isArray(row)) {
          Object.keys(row).forEach((k) => {
            if (k !== "__source" && k !== "__url") keys.add(k);
          });
        }
      }
      return Array.from(keys);
    }
    return [] as string[];
  })();

  const toggleExtractedDataSort = (field: string) => {
    const current = extractedDataSort || "";
    const [curField, curDir] = current.split(":");
    if (curField === field) {
      const nextDir = (curDir || "desc").toLowerCase() === "desc" ? "asc" : "desc";
      setExtractedDataSort(`${field}:${nextDir}`);
      setExtractedDataPage(1);
      return;
    }
    setExtractedDataSort(`${field}:desc`);
    setExtractedDataPage(1);
  };

  useEffect(() => {
    const tableEl = dataTableInnerRef.current;
    const containerEl = dataTableScrollRef.current;
    if (!tableEl || !containerEl) return;

    const update = () => {
      const w = tableEl.scrollWidth;
      setDataTableScrollWidth(w);
    };

    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(tableEl);
    ro.observe(containerEl);
    return () => ro.disconnect();
  }, [resolvedSchemaFields.length, extractedData?.count]);

  const resolvedSchemaFieldDefs = (() => {
    const defs = schemaMapping?.fieldDefs;
    if (Array.isArray(defs) && defs.length > 0) {
      return defs
        .map((d) => ({
          name: typeof d?.name === "string" ? d.name : "",
          description: typeof d?.description === "string" ? d.description : "",
        }))
        .filter((d) => d.name.trim().length > 0);
    }
    return resolvedSchemaFields.map((name) => ({ name, description: "" }));
  })();

  useEffect(() => {
    loadAll();
  }, [id]);

  useEffect(() => {
    fetchExtractedData();
  }, [id, extractedDataPage, extractedDataPageSize, extractedDataSort]);

  useEffect(() => {
    fetchValidatedData();
  }, [id, validatedDataPage, validatedDataPageSize]);

  useEffect(() => {
    fetchInspection();
  }, [id]);

  useEffect(() => {
    fetchApiAnalytics();
  }, [id]);

  useEffect(() => {
    if (!autoRefresh || !id) return;
    const interval = setInterval(() => {
      fetchEngineStatus();
      fetchLogs();
      fetchEngineLogs();
      fetchExtractedData();
      fetchProgress();
      fetchRun();
      fetchApiAnalytics();
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

  const onSkipCrawling = async () => {
    if (!id) return;
    try {
      const result = await RunsAPI.skipCrawling(id);
      toast({ 
        title: "Crawling skipped", 
        description: `${result.skippedJobs} jobs skipped. Ready for extraction.` 
      });
      await fetchRun();
    } catch (err: any) {
      toast({
        title: "Skip failed",
        description: err?.message || String(err),
        variant: "destructive",
      });
    }
  };

  const onStart = async () => {
    if (!id) return;
    try {
      await RunsAPI.start(id);
      toast({ title: "Extraction started", description: "Processing PDFs..." });
      setAutoRefresh(true);
      await fetchRun();
      await fetchEngineStatus();
    } catch (err: any) {
      toast({
        title: "Start failed",
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

  const onExportPdf = async () => {
    if (!id) return;
    try {
      toast({ title: "Generating PDF report...", description: "This may take a moment" });
      const result = await RunsAPI.exportPdf(id);
      toast({ title: "PDF Report ready", description: result.filename });
      window.open(`${API_BASE_URL}${result.url}`, "_blank");
    } catch (err: any) {
      toast({
        title: "PDF Export failed",
        description: err?.message || String(err),
        variant: "destructive",
      });
    }
  };

  const onExportZip = async () => {
    if (!id) return;
    try {
      toast({ title: "Generating ZIP package...", description: "This may take a moment" });
      const result = await RunsAPI.exportZip(id);
      toast({ title: "ZIP package ready", description: result.filename });
      window.open(`${API_BASE_URL}${result.url}`, "_blank");
    } catch (err: any) {
      toast({
        title: "ZIP Export failed",
        description: err?.message || String(err),
        variant: "destructive",
      });
    }
  };

  const onRetry = async () => {
    if (!id) return;
    try {
      const newRun = await RunsAPI.retry(id, true);
      toast({ title: "Run retried", description: `New run created: ${newRun.name}` });
      navigate(`/runs/${newRun.id}`);
    } catch (err: any) {
      toast({
        title: "Retry failed",
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
      case "running":
        return "info";
      case "completed":
        return "success";
      case "failed":
        return "destructive";
      case "aborted":
        return "destructive";
      case "waiting":
        return "warning";
      case "searching":
      case "researching":
        return "info";
      case "crawling":
        return "warning";
      case "paused":
        return "secondary";
      default:
        return "secondary";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Activity className="h-4 w-4 animate-pulse" />;
      case "completed":
        return <CheckCircle className="h-4 w-4" />;
      case "waiting":
        return <Clock className="h-4 w-4" />;
      case "failed":
        return <AlertCircle className="h-4 w-4" />;
      case "aborted":
        return <AlertCircle className="h-4 w-4" />;
      case "searching":
        return <Search className="h-4 w-4 animate-pulse" />;
      case "researching":
        return <Globe className="h-4 w-4 animate-pulse" />;
      case "crawling":
        return <Download className="h-4 w-4 animate-pulse" />;
      case "paused":
        return <Pause className="h-4 w-4" />;
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
                <h1 className="text-2xl font-bold text-foreground">{normalizeRetryName(run.name)}</h1>
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
            {run.status === "waiting" && (
              <Button variant="default" size="sm" onClick={onStart}>
                <Play className="h-4 w-4 mr-2" />
                Start Extraction
              </Button>
            )}
            {run.status === "running" && (
              <Button variant="outline" size="sm" onClick={onPause}>
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </Button>
            )}
            {run.status === "paused" && (
              <Button variant="outline" size="sm" onClick={onResume}>
                <Play className="h-4 w-4 mr-2" />
                Resume
              </Button>
            )}
            {run.status !== "completed" && run.status !== "failed" && run.status !== "aborted" && (
              <Button variant="outline" size="sm" onClick={onStop}>
                <Square className="h-4 w-4 mr-2" />
                Stop
              </Button>
            )}
            {run.status === "crawling" && (
              <Button variant="outline" size="sm" onClick={onSkipCrawling}>
                <FastForward className="h-4 w-4 mr-2" />
                Skip Crawling
              </Button>
            )}
            <Button variant="default" size="sm" onClick={onExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={onExportPdf}>
              <FileText className="h-4 w-4 mr-2" />
              PDF Report
            </Button>
            <Button variant="outline" size="sm" onClick={onExportZip}>
              <Archive className="h-4 w-4 mr-2" />
              Download All
            </Button>
            {(run.status === "failed" || run.status === "completed" || run.status === "aborted") && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Progress Bar - shown when running */}
      {run.status === "running" && progress && (
        <div className="px-6 pt-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">
                  Processing: {progress.currentFile || "Starting..."}
                </div>
                <div className="text-sm text-muted-foreground">
                  {progress.processed}/{progress.total} PDFs ({progress.percentComplete}%)
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-3">
                <div 
                  className="bg-primary h-3 rounded-full transition-all duration-500"
                  style={{ width: `${progress.percentComplete}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <span>{progress.entriesExtracted} entries extracted so far</span>
                {progress.updatedAt && (
                  <span>Updated: {new Date(progress.updatedAt).toLocaleTimeString()}</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Deep Research Status - shown during searching/researching/crawling */}
      {(run.status === "searching" || run.status === "researching" || run.status === "crawling") && (
        <div className="px-6 pt-4">
          <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3 mb-3">
                {run.status === "searching" && (
                  <>
                    <Search className="h-5 w-5 text-blue-600 animate-pulse" />
                    <div>
                      <div className="font-medium text-blue-900 dark:text-blue-100">Searching...</div>
                      <div className="text-sm text-blue-700 dark:text-blue-300">Querying Gemini Deep Research API</div>
                    </div>
                  </>
                )}
                {run.status === "researching" && (
                  <>
                    <Globe className="h-5 w-5 text-blue-600 animate-pulse" />
                    <div>
                      <div className="font-medium text-blue-900 dark:text-blue-100">Researching...</div>
                      <div className="text-sm text-blue-700 dark:text-blue-300">Analyzing search results and extracting links</div>
                    </div>
                  </>
                )}
                {run.status === "crawling" && (
                  <>
                    <Download className="h-5 w-5 text-amber-600 animate-pulse" />
                    <div>
                      <div className="font-medium text-amber-900 dark:text-amber-100">Crawling Web Pages...</div>
                      <div className="text-sm text-amber-700 dark:text-amber-300">
                        Extension is fetching content from {run.sourcesCount || 0} sources
                      </div>
                    </div>
                  </>
                )}
              </div>
              {run.status === "crawling" && run.sourcesCount && run.sourcesCount > 0 && (
                <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800">
                  <div className="text-xs text-amber-700 dark:text-amber-300">
                    Tip: Make sure the Chrome extension is running and connected to fetch web pages.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stats Cards */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              PDFs Uploaded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Number(run.sourcesCount ?? 0).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Extracted Entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {progress?.entriesExtracted ?? run.dataEntriesCount}
            </div>
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
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={getStatusVariant(run.status)} className="text-lg px-3 py-1">
              {run.status}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="px-6 pb-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-10 lg:grid-cols-10">
            <TabsTrigger value="overview">
              <Settings className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="status">
              <Activity className="h-4 w-4 mr-2" />
              Engine Status
            </TabsTrigger>
            <TabsTrigger value="logs">
              <FileText className="h-4 w-4 mr-2" />
              Server Logs
            </TabsTrigger>
            <TabsTrigger value="extraction-logs">
              <Terminal className="h-4 w-4 mr-2" />
              Extraction Logs
            </TabsTrigger>
            <TabsTrigger value="sources">
              <Link className="h-4 w-4 mr-2" />
              Sources
            </TabsTrigger>
            <TabsTrigger value="schema">
              <FileText className="h-4 w-4 mr-2" />
              Schema
            </TabsTrigger>
            <TabsTrigger value="data">
              <Database className="h-4 w-4 mr-2" />
              Extracted Data
            </TabsTrigger>
            <TabsTrigger value="validated-data">
              <CheckCircle className="h-4 w-4 mr-2" />
              Validated Data
            </TabsTrigger>
            <TabsTrigger value="validation">
              <CheckCircle className="h-4 w-4 mr-2" />
              Validation
            </TabsTrigger>
            <TabsTrigger value="cache">
              <Archive className="h-4 w-4 mr-2" />
              Cache
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-4">
            <ScrollArea className="h-[calc(100vh-400px)] pr-4">
              <div className="space-y-4">
                {/* Run Identity */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Run Identity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground font-medium">Run ID</div>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{run.id}</code>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyToClipboard(run.id, "Run ID")}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground font-medium">Name</div>
                        <div className="text-sm font-medium">{normalizeRetryName(run.name)}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground font-medium">Source Type</div>
                        <Badge variant="outline">{run.sourceType || "pdf"}</Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground font-medium">Started</div>
                        <div className="text-sm">{new Date(run.startDate).toLocaleString()}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Source Configuration */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Source Configuration</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {run.sourceType === "deep_research" && run.deepResearchQuery && (
                        <div className="col-span-2 space-y-1">
                          <div className="text-xs text-muted-foreground font-medium">Deep Research Query</div>
                          <div className="text-sm bg-muted/50 p-3 rounded-lg whitespace-pre-wrap">{run.deepResearchQuery}</div>
                        </div>
                      )}
                      {run.sourceType === "links" && run.links && run.links.length > 0 && (
                        <div className="col-span-2 space-y-1">
                          <div className="text-xs text-muted-foreground font-medium">Links ({run.links.length})</div>
                          <ScrollArea className="h-[150px] w-full">
                            <div className="space-y-1">
                              {run.links.map((link, i) => (
                                <div key={i} className="text-xs font-mono bg-muted/50 p-2 rounded truncate">
                                  {link.url}
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                      )}
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground font-medium">Sources Count</div>
                        <div className="text-sm font-medium">{run.sourcesCount}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground font-medium">Extracted Entries</div>
                        <div className="text-sm font-medium">{run.dataEntriesCount}</div>
                      </div>
                      {run.pdfsDir && (
                        <div className="col-span-2 space-y-1">
                          <div className="text-xs text-muted-foreground font-medium">PDFs Directory</div>
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono block break-all">{run.pdfsDir}</code>
                        </div>
                      )}
                      {run.excelPath && (
                        <div className="col-span-2 space-y-1">
                          <div className="text-xs text-muted-foreground font-medium">Excel Schema</div>
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono block break-all">{run.excelPath}</code>
                        </div>
                      )}
                      {run.outputDir && (
                        <div className="col-span-2 space-y-1">
                          <div className="text-xs text-muted-foreground font-medium">Output Directory</div>
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono block break-all">{run.outputDir}</code>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* LLM & Processing Config */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">LLM & Processing Configuration</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground font-medium">LLM Provider</div>
                        <Badge variant="secondary">{run.llmProvider}</Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground font-medium">Row Counting</div>
                        <Badge variant={run.enableRowCounting ? "default" : "outline"}>
                          {run.enableRowCounting ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      {run.schemaFileId && (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground font-medium">Schema File ID</div>
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{run.schemaFileId.slice(0, 8)}...</code>
                        </div>
                      )}
                      {run.zipFileId && (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground font-medium">Zip File ID</div>
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{run.zipFileId.slice(0, 8)}...</code>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Extraction Instructions */}
                {run.prompt && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Extraction Instructions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[200px] w-full">
                        <div className="text-sm whitespace-pre-wrap bg-muted/50 p-4 rounded-lg">
                          {run.prompt}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                {/* Deep Research Result */}
                {run.deepResearchResult && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Deep Research Result</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[200px] w-full">
                        <div className="text-sm whitespace-pre-wrap bg-muted/50 p-4 rounded-lg">
                          {run.deepResearchResult}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                {/* Search Configuration */}
                {(run.searchMethods?.length > 0 || run.searchQueries?.length > 0) && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Search Configuration</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {run.searchMethods?.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground font-medium">Search Methods</div>
                            <div className="flex flex-wrap gap-2">
                              {run.searchMethods.map((method, i) => (
                                <Badge key={i} variant="outline">{method}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {run.searchQueries?.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground font-medium">Search Queries</div>
                            <div className="space-y-1">
                              {run.searchQueries.map((query, i) => (
                                <div key={i} className="text-xs bg-muted/50 p-2 rounded">{query}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Advanced Metadata */}
                {ipcMetadata?.metadata && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Advanced Metadata</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[300px] w-full">
                        <DataDisplay data={ipcMetadata.metadata} onCopy={copyToClipboard} />
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </div>
            </ScrollArea>
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

            {/* API Analytics Section */}
            <Card className="mt-4">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    API Call Analytics
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchApiAnalytics}
                    disabled={apiAnalyticsLoading}
                  >
                    <RefreshCw className={`h-4 w-4 ${apiAnalyticsLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {apiAnalytics && apiAnalytics.total > 0 ? (
                  <div className="space-y-4">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="border rounded-lg p-4 bg-muted/50">
                        <div className="text-xs text-muted-foreground mb-1">Total API Calls</div>
                        <div className="text-2xl font-bold">{apiAnalytics.summary.totalCalls}</div>
                      </div>
                      <div className="border rounded-lg p-4 bg-muted/50">
                        <div className="text-xs text-muted-foreground mb-1">Total Time</div>
                        <div className="text-2xl font-bold">
                          {apiAnalytics.summary.totalTimeMs >= 60000 
                            ? `${(apiAnalytics.summary.totalTimeMs / 60000).toFixed(1)}m`
                            : apiAnalytics.summary.totalTimeMs >= 1000
                            ? `${(apiAnalytics.summary.totalTimeMs / 1000).toFixed(1)}s`
                            : `${apiAnalytics.summary.totalTimeMs}ms`}
                        </div>
                      </div>
                      <div className="border rounded-lg p-4 bg-muted/50">
                        <div className="text-xs text-muted-foreground mb-1">Avg Response Time</div>
                        <div className="text-2xl font-bold">
                          {apiAnalytics.summary.avgTimeMs >= 1000
                            ? `${(apiAnalytics.summary.avgTimeMs / 1000).toFixed(1)}s`
                            : `${apiAnalytics.summary.avgTimeMs}ms`}
                        </div>
                      </div>
                      <div className="border rounded-lg p-4 bg-muted/50">
                        <div className="text-xs text-muted-foreground mb-1">Providers Used</div>
                        <div className="text-2xl font-bold">{Object.keys(apiAnalytics.summary.byProvider).length}</div>
                      </div>
                    </div>

                    {/* Per-Provider Stats */}
                    {Object.entries(apiAnalytics.summary.byProvider).length > 0 && (
                      <div className="border rounded-lg">
                        <div className="px-4 py-3 border-b bg-muted/50">
                          <h3 className="font-semibold text-sm">Performance by Provider</h3>
                        </div>
                        <div className="divide-y">
                          {Object.entries(apiAnalytics.summary.byProvider).map(([provider, stats]) => (
                            <div key={provider} className="p-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <Badge variant="secondary" className="font-mono text-xs">{provider}</Badge>
                                  <span className="text-sm text-muted-foreground">{stats.calls} calls</span>
                                </div>
                                <div className="flex items-center gap-4 text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Avg:</span>
                                    <span className="font-medium">{stats.avgTimeMs >= 1000 ? `${(stats.avgTimeMs / 1000).toFixed(1)}s` : `${stats.avgTimeMs}ms`}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Min:</span>
                                    <span className="text-green-600">{stats.minTimeMs >= 1000 ? `${(stats.minTimeMs / 1000).toFixed(1)}s` : `${stats.minTimeMs}ms`}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Max:</span>
                                    <span className="text-red-600">{stats.maxTimeMs >= 1000 ? `${(stats.maxTimeMs / 1000).toFixed(1)}s` : `${stats.maxTimeMs}ms`}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Total:</span>
                                    <span className="font-medium">
                                      {stats.totalTimeMs >= 60000 
                                        ? `${(stats.totalTimeMs / 60000).toFixed(1)}m`
                                        : stats.totalTimeMs >= 1000
                                        ? `${(stats.totalTimeMs / 1000).toFixed(1)}s`
                                        : `${stats.totalTimeMs}ms`}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              {/* Model breakdown */}
                              {Object.keys(stats.models).length > 0 && (
                                <div className="mt-2 pl-4 border-l-2 border-muted">
                                  <div className="flex flex-wrap gap-2">
                                    {Object.entries(stats.models).map(([model, modelStats]) => (
                                      <Badge key={model} variant="outline" className="text-xs">
                                        {model}: {modelStats.calls} calls, avg {modelStats.avgTimeMs >= 1000 ? `${(modelStats.avgTimeMs / 1000).toFixed(1)}s` : `${modelStats.avgTimeMs}ms`}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Individual API Calls List */}
                    {apiAnalytics.calls && apiAnalytics.calls.length > 0 && (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" className="w-full">
                            <ChevronDown className="h-4 w-4 mr-2" />
                            View All API Calls ({apiAnalytics.calls.length})
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-4">
                          <div className="border rounded-lg overflow-hidden">
                            <ScrollArea className="h-[400px]">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-[60px]">#</TableHead>
                                    <TableHead className="w-[100px]">Provider</TableHead>
                                    <TableHead className="w-[180px]">Model</TableHead>
                                    <TableHead className="w-[100px]">Duration</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead className="w-[60px]"></TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {apiAnalytics.calls.map((call, idx) => (
                                    <TableRow 
                                      key={idx} 
                                      className="cursor-pointer hover:bg-muted/50"
                                      onClick={() => setSelectedApiCall(call)}
                                    >
                                      <TableCell className="font-mono text-xs">{idx + 1}</TableCell>
                                      <TableCell>
                                        <Badge variant="secondary" className="font-mono text-xs">{call.provider}</Badge>
                                      </TableCell>
                                      <TableCell className="text-xs font-mono">{call.model}</TableCell>
                                      <TableCell className="text-xs">
                                        <span className={call.durationMs >= 5000 ? "text-red-600" : call.durationMs >= 2000 ? "text-yellow-600" : "text-green-600"}>
                                          {call.durationMs >= 1000 ? `${(call.durationMs / 1000).toFixed(1)}s` : `${call.durationMs}ms`}
                                        </span>
                                      </TableCell>
                                      <TableCell className="text-xs font-mono truncate max-w-[200px]" title={`${call.source}:${call.line}`}>
                                        {call.source}:{call.line}
                                      </TableCell>
                                      <TableCell className="w-[60px]">
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                          <Search className="h-3 w-3" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </ScrollArea>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No API calls recorded yet</p>
                    <p className="text-xs mt-2">API call timing will appear here as extraction progresses</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* API Call Inspection Dialog */}
            <Dialog open={!!selectedApiCall} onOpenChange={(open) => !open && setSelectedApiCall(null)}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    API Call Details
                  </DialogTitle>
                  <DialogDescription>
                    Inspect the API call timing and metadata
                  </DialogDescription>
                </DialogHeader>
                {selectedApiCall && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="border rounded-lg p-3">
                        <div className="text-xs text-muted-foreground mb-1">Provider</div>
                        <Badge variant="secondary" className="font-mono">{selectedApiCall.provider}</Badge>
                      </div>
                      <div className="border rounded-lg p-3">
                        <div className="text-xs text-muted-foreground mb-1">Model</div>
                        <span className="text-sm font-mono">{selectedApiCall.model}</span>
                      </div>
                      <div className="border rounded-lg p-3">
                        <div className="text-xs text-muted-foreground mb-1">Duration</div>
                        <span className={`text-lg font-bold ${selectedApiCall.durationMs >= 5000 ? "text-red-600" : selectedApiCall.durationMs >= 2000 ? "text-yellow-600" : "text-green-600"}`}>
                          {selectedApiCall.durationMs >= 1000 ? `${(selectedApiCall.durationMs / 1000).toFixed(2)}s` : `${selectedApiCall.durationMs}ms`}
                        </span>
                      </div>
                      <div className="border rounded-lg p-3">
                        <div className="text-xs text-muted-foreground mb-1">Source Location</div>
                        <span className="text-sm font-mono">{selectedApiCall.source}:{selectedApiCall.line}</span>
                      </div>
                    </div>
                    <div className="border rounded-lg p-3 bg-muted/30">
                      <div className="text-xs text-muted-foreground mb-2">Note</div>
                      <p className="text-sm text-muted-foreground">
                        API call input/response data is not currently logged. To enable full request/response inspection, 
                        the extraction engine would need to be configured to log this data.
                      </p>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
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

          {/* Extraction Logs Tab - Run-specific process logs */}
          <TabsContent value="extraction-logs" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Extraction Process Logs</CardTitle>
                  <div className="flex items-center gap-2">
                    <select
                      className="h-8 rounded border px-2 text-sm bg-background"
                      value={engineLogFilter.source}
                      onChange={(e) =>
                        setEngineLogFilter({ ...engineLogFilter, source: e.target.value })
                      }
                    >
                      <option value="all">All Sources</option>
                      <option value="extraction">Extraction</option>
                      <option value="stdout">Stdout</option>
                      <option value="stderr">Stderr</option>
                    </select>
                    <select
                      className="h-8 rounded border px-2 text-sm bg-background"
                      value={engineLogFilter.level}
                      onChange={(e) => setEngineLogFilter({ ...engineLogFilter, level: e.target.value })}
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
                      onClick={fetchEngineLogs}
                      disabled={engineLogsLoading}
                    >
                      <RefreshCw className={`h-4 w-4 ${engineLogsLoading ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {engineLogs && engineLogs.entries && engineLogs.entries.length > 0 ? (
                  <ScrollArea className="h-[600px] w-full rounded border p-4 bg-muted/30">
                    <div className="font-mono text-xs space-y-1">
                      {engineLogs.entries
                        .filter((log) => {
                          if (engineLogFilter.source !== "all" && log.source !== engineLogFilter.source) return false;
                          if (engineLogFilter.level !== "all" && log.level !== engineLogFilter.level) return false;
                          return true;
                        })
                        .map((log, i) => (
                          <div key={i} className="flex gap-2">
                            {log.timestamp && (
                              <span className="text-muted-foreground whitespace-nowrap">
                                {log.timestamp}
                              </span>
                            )}
                            <Badge
                              variant={
                                log.source === "stderr"
                                  ? "destructive"
                                  : log.source === "extraction"
                                    ? "default"
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
                            <span className="flex-1 break-all">{log.message}</span>
                          </div>
                        ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Terminal className="h-8 w-8 mx-auto mb-2" />
                    <p>No extraction logs available yet</p>
                    <p className="text-xs mt-2">Logs will appear once the extraction process starts</p>
                  </div>
                )}
                {engineLogs && (
                  <div className="mt-4 text-xs text-muted-foreground">
                    Total entries: {engineLogs.total}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sources Tab */}
          <TabsContent value="sources" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Sources Collected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="text-2xl font-bold">{Number(run.sourcesCount ?? 0).toLocaleString()}</div>
                      <div className="text-sm text-muted-foreground">
                        Total sources collected for this run
                      </div>
                    </div>
                    <Button onClick={() => navigate("/sources")} variant="outline">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View All Sources
                    </Button>
                  </div>
                  {Number(run.sourcesCount ?? 0) === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Link className="h-8 w-8 mx-auto mb-2" />
                      <p>No sources collected yet</p>
                      <p className="text-xs mt-2">Sources will appear here as the run progresses</p>
                    </div>
                  )}

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Source</TableHead>
                          <TableHead>Row Count</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {runSourcesLoading ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                              Loading sources...
                            </TableCell>
                          </TableRow>
                        ) : runSources.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                              No sources found for this run
                            </TableCell>
                          </TableRow>
                        ) : (
                          runSources.map((s) => (
                            <TableRow 
                              key={s.id} 
                              className={`hover:!bg-transparent hover:ring-2 hover:ring-inset hover:ring-primary/50 ${
                                s.rejectionReason 
                                  ? "bg-red-50 dark:bg-red-950/20" 
                                  : s.extractedRows != null && s.extractedRows > 0
                                    ? "bg-green-50 dark:bg-green-950/20" 
                                    : s.extractedRows === 0
                                      ? "bg-yellow-50 dark:bg-yellow-950/20" 
                                      : ""
                              }`}
                            >
                              <TableCell className="max-w-[400px]">
                                <div className="space-y-1">
                                  <div className="font-medium truncate" title={(s.url || s.title || "") as string}>
                                    {(s.title || s.url || "Untitled") as string}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-xs">
                                      {s.sourceType || "link"}
                                    </Badge>
                                    {s.domain && (
                                      <span className="text-xs text-muted-foreground font-mono">{s.domain}</span>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  {s.rowCount != null ? (
                                    <>
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-lg">{s.rowCount}</span>
                                        <span className="text-xs text-muted-foreground">expected</span>
                                        {s.extractedRows != null && (
                                          <Badge 
                                            variant={s.extractedRows === s.rowCount ? "success" : "warning"}
                                            className="text-xs"
                                          >
                                            {s.extractedRows} extracted
                                          </Badge>
                                        )}
                                      </div>
                                      {s.rowCountLogic && (
                                        <Collapsible>
                                          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-blue-600 hover:underline cursor-pointer">
                                            <ChevronDown className="h-3 w-3" />
                                            View logic
                                          </CollapsibleTrigger>
                                          <CollapsibleContent className="mt-2 p-2 bg-muted/50 rounded text-xs">
                                            <div className="space-y-2">
                                              <div>
                                                <span className="font-medium">Logic: </span>
                                                {s.rowCountLogic}
                                              </div>
                                              {s.rowCountReasoning && (
                                                <div>
                                                  <span className="font-medium">Reasoning: </span>
                                                  {s.rowCountReasoning}
                                                </div>
                                              )}
                                              {s.rowCountCandidates && Object.keys(s.rowCountCandidates).length > 1 && (
                                                <div>
                                                  <span className="font-medium">Other candidates: </span>
                                                  <div className="mt-1 space-y-1">
                                                    {Object.entries(s.rowCountCandidates).map(([id, c]) => (
                                                      <div key={id} className="text-xs text-muted-foreground">
                                                        {id}: {c.count} rows - {c.logic}
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          </CollapsibleContent>
                                        </Collapsible>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    {s.status && (
                                      <Badge
                                        variant={
                                          s.status === "READY"
                                            ? "success"
                                            : s.status === "FAILED"
                                              ? "destructive"
                                              : s.status === "PROCESSING"
                                                ? "info"
                                                : "warning"
                                        }
                                        className="text-xs"
                                        title={s.status === "FAILED" ? (s.error || "Failed") : s.status}
                                      >
                                        {s.status}
                                      </Badge>
                                    )}
                                    {s.rejectionReason && (
                                      <Badge variant="destructive" className="text-xs">
                                        Rejected
                                      </Badge>
                                    )}
                                    {s.rowCountMismatch && (
                                      <Badge variant="warning" className="text-xs" title={`Expected ${s.expectedRowCount} rows, got ${s.extractedRows}`}>
                                        Row Mismatch
                                      </Badge>
                                    )}
                                  </div>
                                  {s.rejectionReason && (
                                    <Collapsible>
                                      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-red-600 hover:underline cursor-pointer">
                                        <AlertCircle className="h-3 w-3" />
                                        View rejection reason
                                      </CollapsibleTrigger>
                                      <CollapsibleContent className="mt-2 p-2 bg-red-50 dark:bg-red-950/30 rounded text-xs text-red-800 dark:text-red-200 max-w-md whitespace-pre-wrap">
                                        {s.rejectionReason}
                                      </CollapsibleContent>
                                    </Collapsible>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openPreview(s.id)}
                                    disabled={s.status !== "READY"}
                                  >
                                    Preview
                                  </Button>
                                  {s.pdfDownloadUrl && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => window.open(`${API_BASE_URL}${s.pdfDownloadUrl}`, "_blank")}
                                      title="Download PDF"
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {s.url && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => window.open(s.url, "_blank")}
                                      title="Open URL"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Schema Tab */}
          <TabsContent value="schema" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Schema Definition</span>
                  {inspection?.exists && inspection?.overall && (
                    <span className="text-sm font-normal text-muted-foreground">
                      Overall Extraction: {Math.round((inspection.overall.ratio || 0) * 100)}% ({inspection.overall.applicable}/{inspection.overall.total})
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {resolvedSchemaFieldDefs.length > 0 ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Column</TableHead>
                          <TableHead className="whitespace-nowrap">Description</TableHead>
                          <TableHead className="whitespace-nowrap">Extraction Rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {resolvedSchemaFieldDefs.map((col) => {
                          const fieldInspection = inspection?.exists && inspection?.perField?.[col.name];
                          const ratio = fieldInspection ? Math.round((fieldInspection.ratio || 0) * 100) : null;
                          return (
                            <TableRow key={col.name} className="align-top">
                              <TableCell className="text-sm font-mono whitespace-nowrap font-medium">
                                {col.name}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {col.description || <span className="italic text-muted-foreground/50">No description</span>}
                              </TableCell>
                              <TableCell className="text-sm font-mono whitespace-nowrap">
                                {fieldInspection ? (
                                  <div className="flex items-center gap-2">
                                    <div className="w-20 bg-muted rounded-full h-2">
                                      <div 
                                        className={`h-2 rounded-full ${ratio && ratio >= 80 ? "bg-green-500" : ratio && ratio >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                                        style={{ width: `${ratio}%` }}
                                      />
                                    </div>
                                    <span className={ratio && ratio >= 80 ? "text-green-600" : ratio && ratio >= 50 ? "text-yellow-600" : "text-red-600"}>
                                      {ratio}%
                                    </span>
                                    <span className="text-muted-foreground text-xs">
                                      ({fieldInspection.applicable}/{fieldInspection.total})
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground/50 italic">Not extracted yet</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2" />
                    <p>No schema defined for this run</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Source Preview</DialogTitle>
                <DialogDescription>
                  {selectedSource?.url || ""}
                </DialogDescription>
              </DialogHeader>
              {previewLoading ? (
                <div className="text-sm text-muted-foreground">Loading preview...</div>
              ) : !selectedSource ? (
                <div className="text-sm text-muted-foreground">No preview available</div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {selectedSource.contentType && (
                      <Badge variant="secondary" className="text-xs">{selectedSource.contentType}</Badge>
                    )}
                    {selectedSource.domain && (
                      <Badge variant="outline" className="font-mono text-xs">{selectedSource.domain}</Badge>
                    )}
                    {selectedSource.pdfDownloadUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`${API_BASE_URL}${selectedSource.pdfDownloadUrl}`, "_blank")}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download PDF
                      </Button>
                    )}
                    {selectedSource.url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(selectedSource.url as string, "_blank")}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <ScrollArea className="h-[520px] w-full rounded border p-4 bg-muted/30">
                    <pre className="text-xs whitespace-pre-wrap break-words">
                      {selectedSource.htmlContent || ""}
                    </pre>
                  </ScrollArea>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Extracted Data Tab */}
          <TabsContent value="data" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Extracted Data</span>
                  {extractedData?.exists && extractedData.count > 0 && (
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-normal text-muted-foreground">
                        {extractedData.count} entries
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`http://localhost:5007/runs/${id}/data/download?format=json`, "_blank")}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          JSON
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`http://localhost:5007/runs/${id}/data/download?format=csv`, "_blank")}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          CSV
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`http://localhost:5007/runs/${id}/data/download?format=excel`, "_blank")}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Excel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {extractedData?.exists && extractedData.data.length > 0 ? (
                  <div className="space-y-4">
                    {/* Table View of Entries */}
                    <div className="rounded-md border">
                      <div className="px-3 py-2 border-b text-sm font-medium bg-muted/30">
                        Data Entries ({extractedData.count} rows)
                      </div>
                      <div
                        ref={dataTableTopScrollRef}
                        className="overflow-x-auto border-b h-4"
                        onScroll={() => {
                          const top = dataTableTopScrollRef.current;
                          const body = dataTableScrollRef.current;
                          if (!top || !body) return;
                          if (Math.abs(body.scrollLeft - top.scrollLeft) > 1) {
                            body.scrollLeft = top.scrollLeft;
                          }
                        }}
                      >
                        <div style={{ width: dataTableScrollWidth || 0, height: 1 }} />
                      </div>
                      <div
                        ref={dataTableScrollRef}
                        className="overflow-x-auto"
                        onScroll={() => {
                          const top = dataTableTopScrollRef.current;
                          const body = dataTableScrollRef.current;
                          if (!top || !body) return;
                          if (Math.abs(top.scrollLeft - body.scrollLeft) > 1) {
                            top.scrollLeft = body.scrollLeft;
                          }
                        }}
                      >
                        <div className="h-[500px] overflow-y-auto">
                          <table ref={dataTableInnerRef} className="w-max caption-bottom text-sm">
                            <thead className="sticky top-0 z-10 bg-background border-b">
                              <tr>
                                <th className="w-12 whitespace-nowrap px-4 py-3 text-left text-sm font-medium text-muted-foreground">#</th>
                                <th 
                                  className="whitespace-nowrap min-w-[220px] cursor-pointer select-none px-4 py-3 text-left text-sm font-medium text-muted-foreground hover:bg-muted/50" 
                                  onClick={() => toggleExtractedDataSort("__source")}
                                >
                                  Source
                                </th>
                                {resolvedSchemaFields.map((col) => {
                                  const fieldInspection = inspection?.exists && inspection?.perField?.[col];
                                  const ratio = fieldInspection ? Math.round((fieldInspection.ratio || 0) * 100) : null;
                                  const colDef = resolvedSchemaFieldDefs.find(f => f.name === col);
                                  return (
                                    <th 
                                      key={col} 
                                      className="whitespace-nowrap min-w-[260px] cursor-pointer select-none px-4 py-3 text-left text-sm font-medium text-muted-foreground hover:bg-muted/50 group"
                                      onClick={() => toggleExtractedDataSort(col)}
                                      title={colDef?.description || col}
                                    >
                                      <div className="flex items-center gap-2">
                                        <span>{col}</span>
                                        {ratio !== null && (
                                          <span className={`text-xs px-1.5 py-0.5 rounded ${ratio >= 80 ? "bg-green-100 text-green-700" : ratio >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                                            {ratio}%
                                          </span>
                                        )}
                                        {colDef?.description && (
                                          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/60" title="Hover for description">
                                            ℹ️
                                          </span>
                                        )}
                                      </div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <TableBody>
                              {extractedData.data.map((entry: any, idx: number) => (
                                <TableRow key={idx} className="align-top">
                                  <TableCell className="font-mono text-xs whitespace-nowrap">{(extractedDataPage - 1) * extractedDataPageSize + idx + 1}</TableCell>
                                  <TableCell
                                    className="max-w-[220px] min-w-[220px] truncate text-xs whitespace-nowrap"
                                    title={entry.__source || entry["__source"]}
                                  >
                                    {entry.__source || entry["__source"] || ""}
                                  </TableCell>
                                  {resolvedSchemaFields.map((col) => (
                                    <TableCell
                                      key={col}
                                      className="max-w-[260px] min-w-[260px] truncate text-xs font-mono whitespace-nowrap"
                                    >
                                      {entry?.[col] ?? ""}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </table>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Page {extractedDataPage} of {Math.max(1, Math.ceil((extractedData.count || 0) / (extractedDataPageSize || 1)))} • {Number(extractedData.count || 0).toLocaleString()} total
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExtractedDataPage(Math.max(1, extractedDataPage - 1))}
                          disabled={extractedDataPage <= 1}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExtractedDataPage(extractedDataPage + 1)}
                          disabled={extractedDataPage >= Math.ceil((extractedData.count || 0) / (extractedDataPageSize || 1))}
                        >
                          Next
                        </Button>
                        <div className="flex items-center gap-1 text-sm">
                          <span>Rows:</span>
                          <select
                            className="h-8 rounded border px-2 bg-background"
                            value={extractedDataPageSize}
                            onChange={(e) => {
                              setExtractedDataPageSize(parseInt(e.target.value) || 100);
                              setExtractedDataPage(1);
                            }}
                          >
                            {[50, 100, 200, 500].map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                    
                    {/* Collapsible JSON View */}
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" className="w-full">
                          <ChevronDown className="h-4 w-4 mr-2" />
                          View Raw JSON Data
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-4">
                        <JsonViewer data={extractedData.data} title={`Extracted Data (${extractedData.count} entries)`} />
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Database className="h-8 w-8 mx-auto mb-2" />
                    <p>No extracted data available yet</p>
                    <p className="text-xs mt-2">Data will appear here as extraction progresses</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-4"
                      onClick={fetchExtractedData}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh Data
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Validated Data Tab */}
          <TabsContent value="validated-data" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Validated Data (Accepted Rows)</span>
                  {validatedData?.exists && validatedData.count > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {validatedData.count} accepted entries
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!validatedData?.exists ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>{validatedData?.message || "Validated data not available"}</p>
                    <p className="text-xs mt-2">Validation must be enabled and completed to see filtered data</p>
                  </div>
                ) : validatedData.data.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No rows passed validation</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-md border overflow-x-auto">
                      <div className="h-[500px] overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12 whitespace-nowrap">#</TableHead>
                              <TableHead className="whitespace-nowrap min-w-[220px]">Source</TableHead>
                              {resolvedSchemaFields.map((col) => (
                                <TableHead key={col} className="whitespace-nowrap min-w-[200px]">
                                  {col}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {validatedData.data.map((entry: any, idx: number) => (
                              <TableRow key={idx} className="align-top">
                                <TableCell className="font-mono text-xs whitespace-nowrap">
                                  {(validatedDataPage - 1) * validatedDataPageSize + idx + 1}
                                </TableCell>
                                <TableCell className="max-w-[220px] truncate text-xs whitespace-nowrap" title={entry.__source}>
                                  {entry.__source || ""}
                                </TableCell>
                                {resolvedSchemaFields.map((col) => (
                                  <TableCell key={col} className="max-w-[200px] truncate text-xs font-mono whitespace-nowrap">
                                    {entry?.[col] ?? ""}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Page {validatedDataPage} of {Math.max(1, Math.ceil((validatedData.count || 0) / validatedDataPageSize))} • {validatedData.count} total
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setValidatedDataPage(Math.max(1, validatedDataPage - 1))}
                          disabled={validatedDataPage <= 1}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setValidatedDataPage(validatedDataPage + 1)}
                          disabled={validatedDataPage >= Math.ceil((validatedData.count || 0) / validatedDataPageSize)}
                        >
                          Next
                        </Button>
                        <select
                          className="h-8 rounded border px-2 bg-background text-sm"
                          value={validatedDataPageSize}
                          onChange={(e) => {
                            setValidatedDataPageSize(parseInt(e.target.value) || 100);
                            setValidatedDataPage(1);
                          }}
                        >
                          {[50, 100, 200, 500].map((s) => (
                            <option key={s} value={s}>{s} rows</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Validation Tab */}
          <TabsContent value="validation" className="mt-4">
            <ValidationResultsTab runId={run.id} />
          </TabsContent>

          {/* Cache Tab */}
          <TabsContent value="cache" className="mt-4">
            <CacheStatsTab runId={run.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
