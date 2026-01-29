import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Settings, 
  Key, 
  Upload, 
  Download, 
  RefreshCw,
  AlertTriangle,
  Cpu,
  FileText,
  Cog,
  User
} from "lucide-react"
import { useEffect, useState, useMemo } from "react"
import { useAppDispatch, useAppSelector } from "@/hooks/store"
import { fetchConfig, importConfig as importConfigThunk, removeConfig, upsertConfig, resetConfig } from "@/features/config/configSlice"
import type { ConfigEntry, ConfigCategory } from "@/features/config/api"
import { ConfigInput } from "@/components/config/ConfigInput"
import { toast } from "sonner"

const CATEGORY_INFO: Record<ConfigCategory, { label: string; icon: React.ElementType; description: string }> = {
  general: { label: "General", icon: Settings, description: "General application settings" },
  llm: { label: "LLM", icon: Cpu, description: "Language model configuration" },
  extraction: { label: "Extraction", icon: FileText, description: "PDF extraction settings" },
  api_keys: { label: "API Keys", icon: Key, description: "API keys and secrets" },
  advanced: { label: "Advanced", icon: Cog, description: "Advanced settings" },
};

export default function Config() {
  const dispatch = useAppDispatch()
  const { items: config, loading, saving, importing, error } = useAppSelector((s) => s.config)
  const [activeCategory, setActiveCategory] = useState<ConfigCategory>("llm")
  const [importData, setImportData] = useState("")

  useEffect(() => {
    dispatch(fetchConfig())
  }, [dispatch])

  const configByCategory = useMemo(() => {
    const grouped: Record<ConfigCategory, ConfigEntry[]> = {
      general: [],
      llm: [],
      extraction: [],
      api_keys: [],
      advanced: [],
    };
    config.forEach((entry) => {
      const cat = entry.category || "general";
      if (grouped[cat]) grouped[cat].push(entry);
      else grouped.general.push(entry);
    });
    return grouped;
  }, [config]);

  const categories = Object.keys(configByCategory).filter(
    (cat) => configByCategory[cat as ConfigCategory].length > 0
  ) as ConfigCategory[];

  const handleValueChange = async (entry: ConfigEntry, newValue: string) => {
    try {
      await dispatch(upsertConfig({ key: entry.key, value: newValue })).unwrap()
      toast.success(`${entry.key} updated`)
    } catch (e: any) {
      toast.error("Failed to update", { description: e?.message })
    }
  }

  const handleReset = async (key: string) => {
    try {
      await dispatch(resetConfig(key)).unwrap()
      toast.success(`${key} reset to default`)
    } catch (e: any) {
      toast.error("Failed to reset", { description: e?.message })
    }
  }

  const handleImport = async () => {
    try {
      const parsed = (() => {
        try { return JSON.parse(importData) as Record<string, string> } catch { return undefined }
      })()
      if (!parsed) {
        toast.error("Invalid JSON. Please paste a JSON object of key/value pairs.")
        return
      }
      await dispatch(importConfigThunk(parsed)).unwrap()
      toast.success("Configuration imported")
      setImportData("")
      dispatch(fetchConfig())
    } catch (e: any) {
      toast.error("Failed to import configuration", { description: e?.message })
    }
  }

  const handleExport = () => {
    const exportData = config.reduce((acc, entry) => {
      acc[entry.key] = entry.value
      return acc
    }, {} as Record<string, string>)
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'config-export.json'
    a.click()
  }

  return (
    <div className="h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">System Configuration</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your settings, API keys, and preferences
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => dispatch(fetchConfig())} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reload
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="flex gap-6">
          {/* Category Sidebar */}
          <div className="w-48 shrink-0 space-y-1">
            {(Object.keys(CATEGORY_INFO) as ConfigCategory[]).map((cat) => {
              const info = CATEGORY_INFO[cat];
              const count = configByCategory[cat]?.length || 0;
              if (count === 0) return null;
              const Icon = info.icon;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    activeCategory === cat
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1 text-left">{info.label}</span>
                  <Badge variant="secondary" className="text-xs">{count}</Badge>
                </button>
              );
            })}
          </div>

          {/* Config Entries */}
          <div className="flex-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {(() => {
                    const Icon = CATEGORY_INFO[activeCategory].icon;
                    return <Icon className="h-5 w-5" />;
                  })()}
                  {CATEGORY_INFO[activeCategory].label}
                </CardTitle>
                <CardDescription>{CATEGORY_INFO[activeCategory].description}</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="p-6 text-center text-muted-foreground">Loading configuration...</div>
                ) : error ? (
                  <div className="p-6 text-center text-destructive">{error}</div>
                ) : (
                  <div className="space-y-6">
                    {configByCategory[activeCategory]?.map((entry) => (
                      <div key={entry.key} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="flex items-center gap-2">
                            {entry.sensitive && <Key className="h-3 w-3 text-destructive" />}
                            <span className="font-mono">{entry.key}</span>
                            {entry.isUserOverride && (
                              <Badge variant="outline" className="text-xs">
                                <User className="h-3 w-3 mr-1" />
                                Custom
                              </Badge>
                            )}
                          </Label>
                          {entry.required && <Badge variant="destructive">Required</Badge>}
                        </div>
                        <ConfigInput
                          entry={entry}
                          onChange={(value) => handleValueChange(entry, value)}
                          onReset={() => handleReset(entry.key)}
                          disabled={saving}
                        />
                        <p className="text-xs text-muted-foreground">{entry.description}</p>
                      </div>
                    ))}
                    {(!configByCategory[activeCategory] || configByCategory[activeCategory].length === 0) && (
                      <div className="text-center text-muted-foreground py-8">
                        No configuration entries in this category
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Import Section */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Import Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder='Paste JSON config, e.g. {"LLM_PROVIDER": "openai", "MAX_RETRIES": "5"}'
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  rows={4}
                  className="font-mono text-sm"
                />
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span className="text-sm text-muted-foreground">Import will merge with existing configuration</span>
                </div>
                <Button onClick={handleImport} disabled={importing || !importData.trim()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}