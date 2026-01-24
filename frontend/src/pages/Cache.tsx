import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { 
  Database, 
  Search, 
  Trash2, 
  Eye, 
  RefreshCw,
  FolderOpen,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useAppDispatch, useAppSelector } from "@/hooks/store"
import { clearAllCaches, clearCacheProvider, deleteCacheEntry, fetchCacheEntries, fetchCacheProviders, setEntriesQuery } from "@/features/cache/cacheSlice"
import { toast } from "sonner"
import type { CacheProvider, CacheEntry } from "@/features/cache/api"

export default function Cache() {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const dispatch = useAppDispatch()
  const { providers, providersLoading, providersError, entries, entriesLoading, entriesError, total, page, pageSize, q, providerId } = useAppSelector((s) => s.cache)

  useEffect(() => {
    dispatch(fetchCacheProviders())
  }, [dispatch])

  useEffect(() => {
    dispatch(fetchCacheEntries())
  }, [dispatch])

  const getTypeVariant = (type: CacheProvider["type"]) => {
    switch (type) {
      case "LLM": return "info"
      case "SEARCH": return "success"
      case "SCRAPING": return "warning"
      default: return "secondary"
    }
  }

  const getStatusVariant = (status: CacheEntry["status"]) => {
    switch (status) {
      case "ACTIVE": return "success"
      case "STALE": return "warning"
      case "EXPIRED": return "destructive"
      default: return "secondary"
    }
  }

  const getHitRateVariant = (hitRate: number) => {
    if (hitRate >= 80) return "success"
    if (hitRate >= 60) return "warning"
    return "destructive"
  }

  const handleClearCache = async (providerId: string) => {
    try {
      await dispatch(clearCacheProvider(providerId)).unwrap()
      toast.success("Provider cache cleared")
      dispatch(fetchCacheEntries())
      dispatch(fetchCacheProviders())
    } catch (e: any) {
      toast.error("Failed to clear provider cache", { description: e?.message })
    }
  }

  const handleClearAll = async () => {
    try {
      await dispatch(clearAllCaches()).unwrap()
      toast.success("All caches cleared")
      dispatch(fetchCacheEntries())
      dispatch(fetchCacheProviders())
    } catch (e: any) {
      toast.error("Failed to clear all caches", { description: e?.message })
    }
  }

  // keep local search/provider selection in sync with redux query
  useEffect(() => {
    dispatch(setEntriesQuery({ q: searchQuery || undefined, providerId: selectedProvider || undefined }))
  }, [dispatch, searchQuery, selectedProvider])

  useEffect(() => {
    dispatch(fetchCacheEntries())
  }, [dispatch, q, providerId, page, pageSize])

  const filteredEntries = useMemo(() => entries, [entries])

  return (
    <div className="h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cache Management</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Inspect and manage system caches across all providers
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => { dispatch(fetchCacheProviders()); dispatch(fetchCacheEntries()); }} disabled={providersLoading || entriesLoading}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh All
            </Button>
            <Button variant="destructive" size="sm" onClick={handleClearAll}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Cache Providers Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Database className="h-5 w-5 mr-2" />
              Cache Providers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {providersLoading ? (
              <div className="p-6 text-center text-muted-foreground">Loading providers...</div>
            ) : providersError ? (
              <div className="p-6 text-center text-destructive">{providersError}</div>
            ) : providers.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">No providers found.</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedProvider === provider.id 
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedProvider(
                    selectedProvider === provider.id ? null : provider.id
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <FolderOpen className="h-4 w-4" />
                      <span className="font-medium text-sm">{provider.name}</span>
                    </div>
                    <Badge variant={getTypeVariant(provider.type)}>
                      {provider.type}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Entries:</span>
                      <span className="font-medium">{provider.entriesCount?.toLocaleString?.() ?? provider.entriesCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Size:</span>
                      <span className="font-medium">{(provider.totalSizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Hit Rate:</span>
                      <Badge variant={getHitRateVariant(provider.hitRate)} className="text-xs">
                        {provider.hitRate}%
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-border">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full text-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleClearCache(provider.id)
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Clear Cache
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            )}
          </CardContent>
        </Card>

        {/* Cache Entries */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                Cache Entries
                {selectedProvider && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    - {providers.find(p => p.id === selectedProvider)?.name}
                  </span>
                )}
              </CardTitle>
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search cache entries..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-[300px] pl-8"
                  />
                </div>
                {selectedProvider && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedProvider(null)}
                  >
                    Show All
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {entriesLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading entries...</div>
            ) : entriesError ? (
              <div className="text-center py-8 text-destructive">{entriesError}</div>
            ) : filteredEntries.length === 0 ? (
              <div className="text-center py-8">
                <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No cache entries found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedProvider ? "Select a different provider or adjust your search" : "Select a provider to view entries"}
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cache Key</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Hit Count</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Last Accessed</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="max-w-[300px]">
                            <div className="font-mono text-xs truncate">{entry.key}</div>
                            <div className="text-xs text-muted-foreground mt-1">ID: {entry.id}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{providers.find(p => p.id === entry.providerId)?.name}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">{(entry.sizeBytes / 1024).toFixed(0)} KB</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{entry.hitCount}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(entry.status)}>{entry.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{new Date(entry.createdDate).toLocaleDateString()}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{new Date(entry.lastAccessed).toLocaleDateString()}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1">
                            <Button variant="ghost" size="sm" title="View">
                              <Eye className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" title="Delete" onClick={async () => {
                              try {
                                await dispatch(deleteCacheEntry(entry.id)).unwrap()
                                toast.success("Entry deleted")
                              } catch (e: any) {
                                toast.error("Failed to delete entry", { description: e?.message })
                              }
                            }}>
                              <Trash2 className="h-3 w-3" />
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
      </div>
    </div>
  )
}