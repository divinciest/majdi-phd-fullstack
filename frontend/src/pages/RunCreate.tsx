import { useState, useRef, DragEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { RunsAPI } from "@/features/runs/api";
import { toast } from "sonner";
import { Upload, FileArchive, FileSpreadsheet, X, Play, Loader2, Search, Globe, Link, CheckCircle2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PromptFileUpload } from "@/components/ui/prompt-file-upload";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

interface FileDropZoneProps {
  accept: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  file: File | null;
  onFileSelect: (file: File | null) => void;
}

function FileDropZone({ accept, label, description, icon, file, onFileSelect }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      onFileSelect(droppedFile);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer
        ${isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
        ${file ? "bg-primary/5 border-primary/50" : ""}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFileSelect(e.target.files?.[0] || null)}
      />

      {file ? (
        <div className="flex items-center justify-center gap-3">
          {icon}
          <div className="text-left">
            <p className="font-medium text-foreground">{file.name}</p>
            <p className="text-sm text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-2"
            onClick={(e) => {
              e.stopPropagation();
              onFileSelect(null);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <div className="flex justify-center mb-3">
            {icon}
          </div>
          <p className="font-medium text-foreground">{label}</p>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </>
      )}
    </div>
  );
}

export default function RunCreate() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sourceType, setSourceType] = useState<"pdf" | "search" | "links">("pdf");

  const [name, setName] = useState("");
  const [llmProvider, setLlmProvider] = useState("openai");
  const [pdfsZip, setPdfsZip] = useState<File | null>(null);
  const [excelSchema, setExcelSchema] = useState<File | null>(null);
  const [enableRowCounting, setEnableRowCounting] = useState(false);
  
  // Prompt files (replaces textarea)
  const [extractionPromptFile, setExtractionPromptFile] = useState<File | null>(null);
  const [validationPromptFile, setValidationPromptFile] = useState<File | null>(null);
  const [validationMaxRetries, setValidationMaxRetries] = useState(3);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  
  // Deep Research (search) mode state
  const [searchQueryFile, setSearchQueryFile] = useState<File | null>(null);
  const [searchExcelSchema, setSearchExcelSchema] = useState<File | null>(null);
  
  // Manual Links mode state
  const [linksText, setLinksText] = useState("");
  const [linksExcelSchema, setLinksExcelSchema] = useState<File | null>(null);

  const onSubmitPdf = async (e: React.FormEvent, autoStart: boolean = false) => {
    e.preventDefault();

    if (!pdfsZip) {
      toast.error("Please upload a ZIP file containing PDF documents");
      return;
    }

    if (!excelSchema) {
      toast.error("Please upload an Excel schema file");
      return;
    }

    setCreating(true);
    try {
      const run = await RunsAPI.create({
        pdfsZip,
        excelSchema,
        name: name || "Untitled Run",
        llmProvider,
        extractionPrompt: extractionPromptFile || undefined,
        validationPrompt: validationPromptFile || undefined,
        validationEnabled: !!validationPromptFile,
        validationMaxRetries,
        enableRowCounting,
      });

      toast.success(`Run created: ${run.name} (${run.sourcesCount} sources)`);

      if (autoStart) {
        setStarting(true);
        try {
          await RunsAPI.start(run.id);
          toast.success("Extraction started!");
        } catch (err: any) {
          toast.error("Failed to start extraction: " + (err?.message || String(err)));
        }
        setStarting(false);
      }

      navigate(`/runs/${run.id}`);
    } catch (err: any) {
      toast.error("Failed to create run: " + (err?.message || String(err)));
    } finally {
      setCreating(false);
    }
  };

  const onSubmitSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!searchQueryFile) {
      toast.error("Please upload a search query file");
      return;
    }

    if (!searchExcelSchema) {
      toast.error("Please upload an Excel schema file");
      return;
    }

    setCreating(true);
    try {
      const queryText = await searchQueryFile.text();
      const run = await RunsAPI.createFromSearch({
        name: name || "Deep Research Run",
        query: queryText,
        excelSchema: searchExcelSchema,
        llmProvider,
        extractionPrompt: extractionPromptFile || undefined,
        validationPrompt: validationPromptFile || undefined,
        validationEnabled: !!validationPromptFile,
        validationMaxRetries,
      });

      toast.success(`Deep Research started: ${run.name}`);
      navigate(`/runs/${run.id}`);
    } catch (err: any) {
      toast.error("Failed to create run: " + (err?.message || String(err)));
    } finally {
      setCreating(false);
    }
  };

  const onSubmitLinks = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!linksText.trim()) {
      toast.error("Please enter at least one URL");
      return;
    }

    if (!linksExcelSchema) {
      toast.error("Please upload an Excel schema file");
      return;
    }

    setCreating(true);
    try {
      const run = await RunsAPI.createFromLinks({
        name: name || "Manual Links Run",
        links: linksText,
        excelSchema: linksExcelSchema,
        llmProvider,
        extractionPrompt: extractionPromptFile || undefined,
        validationPrompt: validationPromptFile || undefined,
        validationEnabled: !!validationPromptFile,
        validationMaxRetries,
      });

      toast.success(`Manual Links run created: ${run.name} (${run.sourcesCount} sources)`);
      navigate(`/runs/${run.id}`);
    } catch (err: any) {
      toast.error("Failed to create run: " + (err?.message || String(err)));
    } finally {
      setCreating(false);
    }
  };

  const isPdfValid = pdfsZip && excelSchema;
  const isSearchValid = searchQueryFile && searchExcelSchema;
  const isLinksValid = linksText.trim().length > 0 && linksExcelSchema;

  return (
    <div className="min-h-full bg-background p-6">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Create New Extraction Run
          </CardTitle>
          <CardDescription>
            Choose a source for your extraction: upload PDFs or search the web using AI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={sourceType} onValueChange={(v) => setSourceType(v as "pdf" | "search" | "links")} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pdf" className="flex items-center gap-2">
                <FileArchive className="h-4 w-4" />
                PDF Upload
              </TabsTrigger>
              <TabsTrigger value="search" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Web Search (AI)
              </TabsTrigger>
              <TabsTrigger value="links" className="flex items-center gap-2">
                <Link className="h-4 w-4" />
                Manual Links
              </TabsTrigger>
            </TabsList>

            {/* PDF Upload Mode */}
            <TabsContent value="pdf">
              <form onSubmit={(e) => onSubmitPdf(e, false)} className="space-y-6">
                {/* File Upload Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>PDF Documents (ZIP)</Label>
                    <FileDropZone
                      accept=".zip"
                      label="Drop ZIP file here"
                      description="Contains PDF files to extract"
                      icon={<FileArchive className="h-10 w-10 text-primary/70" />}
                      file={pdfsZip}
                      onFileSelect={setPdfsZip}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Excel Schema</Label>
                    <FileDropZone
                      accept=".xlsx,.xls"
                      label="Drop Excel file here"
                      description="Defines extraction columns"
                      icon={<FileSpreadsheet className="h-10 w-10 text-green-500/70" />}
                      file={excelSchema}
                      onFileSelect={setExcelSchema}
                    />
                  </div>
                </div>

                {/* Run Configuration */}
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Run Name</Label>
                      <Input
                        id="name"
                        placeholder="My Extraction Run"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="llm">LLM Provider</Label>
                      <select
                        id="llm"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={llmProvider}
                        onChange={(e) => setLlmProvider(e.target.value)}
                      >
                        <option value="openai">OpenAI GPT-4</option>
                        <option value="gemini">Google Gemini</option>
                        <option value="anthropic">Anthropic Claude</option>
                        <option value="deepseek">DeepSeek</option>
                      </select>
                    </div>
                  </div>

                  {/* Prompt Files Section */}
                  <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                        <span className="text-sm font-medium">Prompts & Validation (Optional)</span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-4">
                      <PromptFileUpload
                        label="Extraction Prompt"
                        description="Instructions for the LLM on what data to extract (.txt file)"
                        value={extractionPromptFile}
                        onChange={setExtractionPromptFile}
                      />

                      <PromptFileUpload
                        label="Validation Prompt"
                        description="Upload a validation prompt to enable validation. Validation will automatically run when a prompt is provided."
                        value={validationPromptFile}
                        onChange={setValidationPromptFile}
                      />

                      {validationPromptFile && (
                        <div className="space-y-2">
                          <Label htmlFor="maxRetries">Max Validation Retries</Label>
                          <select
                            id="maxRetries"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={validationMaxRetries}
                            onChange={(e) => setValidationMaxRetries(Number(e.target.value))}
                          >
                            <option value="1">1 retry</option>
                            <option value="2">2 retries</option>
                            <option value="3">3 retries</option>
                            <option value="5">5 retries</option>
                            <option value="10">10 retries</option>
                          </select>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Row Counting Toggle */}
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="rowCounting" className="text-base">Enable Row Counting</Label>
                      <p className="text-sm text-muted-foreground">
                        Pre-analyze PDFs to count expected rows before extraction. Improves accuracy but takes longer.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        id="rowCounting"
                        className="sr-only peer"
                        checked={enableRowCounting}
                        onChange={(e) => setEnableRowCounting(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="secondary" disabled={!isPdfValid || creating}>
                    {creating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Run"
                    )}
                  </Button>
                  <Button
                    type="button"
                    disabled={!isPdfValid || creating || starting}
                    onClick={(e) => onSubmitPdf(e as any, true)}
                  >
                    {starting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Create & Start
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </TabsContent>

            {/* Web Search Mode */}
            <TabsContent value="search">
              <form onSubmit={onSubmitSearch} className="space-y-6">
                <div className="space-y-4">
                  <div className="rounded-lg border p-4 bg-muted/30">
                    <div className="flex items-start gap-3">
                      <Search className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium">AI-Powered Web Search</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Enter a research query and Gemini will search the web, find relevant sources, 
                          and the Chrome extension will crawl the content for extraction.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Search Query (.txt file)</Label>
                    <PromptFileUpload
                      label="Search Query"
                      description="Text file containing your research query for Gemini"
                      value={searchQueryFile}
                      onChange={setSearchQueryFile}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Excel Schema (Required)</Label>
                    <FileDropZone
                      accept=".xlsx,.xls"
                      label="Drop Excel file here"
                      description="Defines extraction columns"
                      icon={<FileSpreadsheet className="h-10 w-10 text-green-500/70" />}
                      file={searchExcelSchema}
                      onFileSelect={setSearchExcelSchema}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="searchName">Run Name</Label>
                      <Input
                        id="searchName"
                        placeholder="Deep Research Run"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="searchLlm">LLM Provider (for extraction)</Label>
                      <select
                        id="searchLlm"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={llmProvider}
                        onChange={(e) => setLlmProvider(e.target.value)}
                      >
                        <option value="openai">OpenAI GPT-4</option>
                        <option value="gemini">Google Gemini</option>
                        <option value="anthropic">Anthropic Claude</option>
                        <option value="deepseek">DeepSeek</option>
                      </select>
                    </div>
                  </div>

                  {/* Prompt Files Section */}
                  <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                        <span className="text-sm font-medium">Prompts & Validation (Optional)</span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-4">
                      <PromptFileUpload
                        label="Extraction Prompt"
                        description="Instructions for the LLM on what data to extract (.txt file)"
                        value={extractionPromptFile}
                        onChange={setExtractionPromptFile}
                      />

                      <PromptFileUpload
                        label="Validation Prompt"
                        description="Upload a validation prompt to enable validation. Validation will automatically run when a prompt is provided."
                        value={validationPromptFile}
                        onChange={setValidationPromptFile}
                      />

                      {validationPromptFile && (
                        <div className="space-y-2">
                          <Label htmlFor="maxRetriesSearch">Max Validation Retries</Label>
                          <select
                            id="maxRetriesSearch"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={validationMaxRetries}
                            onChange={(e) => setValidationMaxRetries(Number(e.target.value))}
                          >
                            <option value="1">1 retry</option>
                            <option value="2">2 retries</option>
                            <option value="3">3 retries</option>
                            <option value="5">5 retries</option>
                            <option value="10">10 retries</option>
                          </select>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!isSearchValid || creating}>
                    {creating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="mr-2 h-4 w-4" />
                        Start Deep Research
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </TabsContent>

            {/* Manual Links Mode */}
            <TabsContent value="links">
              <form onSubmit={onSubmitLinks} className="space-y-6">
                <div className="space-y-4">
                  <div className="rounded-lg border p-4 bg-muted/30">
                    <div className="flex items-start gap-3">
                      <Link className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium">Manual URL Input</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Paste URLs (one per line) and the Chrome extension will crawl the content for extraction.
                          Supports both HTML pages and PDF links.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="linksText">URLs (one per line)</Label>
                    <Textarea
                      id="linksText"
                      rows={6}
                      placeholder="https://example.com/source1&#10;https://example.com/source2&#10;https://example.com/paper.pdf"
                      value={linksText}
                      onChange={(e) => setLinksText(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      {linksText.split('\n').filter(l => l.trim()).length} URL(s) entered
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Excel Schema (Required)</Label>
                    <FileDropZone
                      accept=".xlsx,.xls"
                      label="Drop Excel file here"
                      description="Defines extraction columns"
                      icon={<FileSpreadsheet className="h-10 w-10 text-green-500/70" />}
                      file={linksExcelSchema}
                      onFileSelect={setLinksExcelSchema}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="linksName">Run Name</Label>
                      <Input
                        id="linksName"
                        placeholder="Manual Links Run"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="linksLlm">LLM Provider (for extraction)</Label>
                      <select
                        id="linksLlm"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={llmProvider}
                        onChange={(e) => setLlmProvider(e.target.value)}
                      >
                        <option value="openai">OpenAI GPT-4</option>
                        <option value="gemini">Google Gemini</option>
                        <option value="anthropic">Anthropic Claude</option>
                        <option value="deepseek">DeepSeek</option>
                      </select>
                    </div>
                  </div>

                  {/* Prompt Files Section */}
                  <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                        <span className="text-sm font-medium">Prompts & Validation (Optional)</span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-4">
                      <PromptFileUpload
                        label="Extraction Prompt"
                        description="Instructions for the LLM on what data to extract (.txt file)"
                        value={extractionPromptFile}
                        onChange={setExtractionPromptFile}
                      />

                      <PromptFileUpload
                        label="Validation Prompt"
                        description="Upload a validation prompt to enable validation. Validation will automatically run when a prompt is provided."
                        value={validationPromptFile}
                        onChange={setValidationPromptFile}
                      />

                      {validationPromptFile && (
                        <div className="space-y-2">
                          <Label htmlFor="maxRetriesLinks">Max Validation Retries</Label>
                          <select
                            id="maxRetriesLinks"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={validationMaxRetries}
                            onChange={(e) => setValidationMaxRetries(Number(e.target.value))}
                          >
                            <option value="1">1 retry</option>
                            <option value="2">2 retries</option>
                            <option value="3">3 retries</option>
                            <option value="5">5 retries</option>
                            <option value="10">10 retries</option>
                          </select>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!isLinksValid || creating}>
                    {creating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Link className="mr-2 h-4 w-4" />
                        Create & Crawl
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
