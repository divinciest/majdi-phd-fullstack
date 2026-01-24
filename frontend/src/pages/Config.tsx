import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
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
  Save, 
  RefreshCw,
  Eye,
  EyeOff,
  AlertTriangle
} from "lucide-react"
import { useEffect, useState } from "react"
import { useAppDispatch, useAppSelector } from "@/hooks/store"
import { fetchConfig, importConfig as importConfigThunk, removeConfig, upsertConfig } from "@/features/config/configSlice"
import type { ConfigEntry } from "@/features/config/api"
import { toast } from "sonner"

export default function Config() {
  const dispatch = useAppDispatch()
  const { items: config, loading, saving, importing, error } = useAppSelector((s) => s.config)
  const [dirty, setDirty] = useState(false)
  const [newKey, setNewKey] = useState("")
  const [newValue, setNewValue] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set())
  const [importData, setImportData] = useState("")


  useEffect(() => {
    dispatch(fetchConfig())
  }, [dispatch])

  const getTypeVariant = (type: ConfigEntry["type"]) => {
    switch (type) {
      case "API_KEY": return "destructive"
      case "TOGGLE": return "info"
      case "PREFERENCE": return "warning"
      case "URL": return "success"
      default: return "secondary"
    }
  }

  const toggleVisibility = (key: string) => {
    const newHidden = new Set(hiddenKeys)
    if (newHidden.has(key)) {
      newHidden.delete(key)
    } else {
      newHidden.add(key)
    }
    setHiddenKeys(newHidden)
  }

  const handleSaveConfig = async () => {
    try {
      // Save all entries currently in list (dirty tracking is superficial here)
      await Promise.all(
        config.map((entry) => dispatch(upsertConfig(entry)).unwrap())
      )
      setDirty(false)
      toast.success("Configuration saved")
      dispatch(fetchConfig())
    } catch (e: any) {
      toast.error("Failed to save configuration", { description: e?.message })
    }
  }

  const handleAddEntry = () => {
    if (!newKey || !newValue) return
    
    const newEntry: ConfigEntry = {
      key: newKey,
      value: newValue,
      type: newKey.includes("API") ? "API_KEY" : "PREFERENCE",
      description: newDescription || "User-defined configuration",
      sensitive: newKey.includes("API") || newKey.includes("KEY"),
      lastModified: new Date().toISOString()
    }
    
    dispatch(upsertConfig(newEntry))
    setDirty(true)
    setNewKey("")
    setNewValue("")
    setNewDescription("")
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
              Manage global settings, API keys, and system preferences
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => dispatch(fetchConfig())} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reload
            </Button>
            <Button size="sm" onClick={handleSaveConfig} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <Tabs defaultValue="settings" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="settings">Configuration</TabsTrigger>
            <TabsTrigger value="import-export">Import/Export</TabsTrigger>
            <TabsTrigger value="add-new">Add New</TabsTrigger>
          </TabsList>

          {/* Configuration Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="h-5 w-5 mr-2" />
                  Global Configuration Registry
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline">{config.length} entries</Badge>
                  <Badge variant="destructive">
                    {config.filter(c => c.sensitive).length} sensitive
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="p-6 text-center text-muted-foreground">Loading configuration...</div>
                ) : error ? (
                  <div className="p-6 text-center text-destructive">{error}</div>
                ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Key</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Last Modified</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {config.map((entry) => (
                        <TableRow key={entry.key}>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              {entry.sensitive && <Key className="h-3 w-3 text-destructive" />}
                              <span className="font-mono text-sm">{entry.key}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2 max-w-[200px]">
                              {entry.type === "TOGGLE" ? (
                                <Switch 
                                  checked={entry.value === "true"}
                                  onCheckedChange={async (checked) => {
                                    await dispatch(upsertConfig({ ...entry, value: checked.toString(), lastModified: new Date().toISOString() }))
                                  }}
                                />
                              ) : (
                                <div className="flex items-center space-x-1 flex-1">
                                  <span className="font-mono text-xs truncate">
                                    {entry.sensitive && !hiddenKeys.has(entry.key)
                                      ? entry.value.replace(/./g, '•')
                                      : entry.value}
                                  </span>
                                  {entry.sensitive && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => toggleVisibility(entry.key)}
                                    >
                                      {hiddenKeys.has(entry.key) ? (
                                        <Eye className="h-3 w-3" />
                                      ) : (
                                        <EyeOff className="h-3 w-3" />
                                      )}
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getTypeVariant(entry.type)}>
                              {entry.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {entry.description}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {new Date(entry.lastModified).toLocaleDateString()}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  const newVal = prompt(`Update value for ${entry.key}`, entry.value)
                                  if (newVal == null) return
                                  await dispatch(upsertConfig({ ...entry, value: newVal, lastModified: new Date().toISOString() }))
                                  toast.success("Entry updated")
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  if (!confirm(`Delete ${entry.key}?`)) return
                                  await dispatch(removeConfig(entry.key))
                                  toast.success("Entry removed")
                                }}
                              >
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Import/Export Tab */}
          <TabsContent value="import-export">
            <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Upload className="h-5 w-5 mr-2" />
                  Import Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Configuration Data (JSON or ENV format)</Label>
                  <Textarea
                    placeholder="Paste your configuration here..."
                    value={importData}
                    onChange={(e) => setImportData(e.target.value)}
                    rows={8}
                  />
                </div>
                
                <div className="flex items-center space-x-2 p-3 bg-warning/10 rounded-md">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span className="text-sm text-warning-foreground">
                    Import will merge with existing configuration
                  </span>
                </div>
                
                <Button onClick={handleImport} className="w-full" disabled={importing}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Configuration
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Download className="h-5 w-5 mr-2" />
                  Export Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Export current configuration as JSON file. Sensitive values will be included.
                </p>
                
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="font-medium">Current entries:</span> {config.length}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">Sensitive entries:</span> {config.filter(c => c.sensitive).length}
                  </div>
                </div>
                
                <Button onClick={handleExport} variant="outline" className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  Export as JSON
                </Button>
              </CardContent>
            </Card>
            </div>
          </TabsContent>

          {/* Add New Tab */}
          <TabsContent value="add-new">
            <Card>
              <CardHeader>
                <CardTitle>Add New Configuration Entry</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="new-key">Configuration Key</Label>
                    <Input
                      id="new-key"
                      placeholder="e.g., NEW_API_KEY"
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="new-value">Value</Label>
                    <Input
                      id="new-value"
                      placeholder="Configuration value"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="new-description">Description (Optional)</Label>
                  <Input
                    id="new-description"
                    placeholder="Brief description of this configuration"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
                
                <Button onClick={handleAddEntry} disabled={!newKey || !newValue}>
                  Add Configuration Entry
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}