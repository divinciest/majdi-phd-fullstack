import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import { Search, Filter, ExternalLink } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useAppDispatch, useAppSelector } from "@/hooks/store"
import { fetchSources, setQuery } from "@/features/sources/sourcesSlice"

export default function Sources() {
  const dispatch = useAppDispatch()
  const { items, loading, error, total, query } = useAppSelector((s) => s.sources)
  const [searchQuery, setSearchQuery] = useState(query.q || "")

  useEffect(() => {
    dispatch(fetchSources(undefined))
  }, [dispatch])

  useEffect(() => {
    const h = setTimeout(() => {
      dispatch(setQuery({ q: searchQuery, page: 1 }))
      dispatch(fetchSources({ q: searchQuery, page: 1 }))
    }, 400)
    return () => clearTimeout(h)
  }, [dispatch, searchQuery])

  const filteredSources = useMemo(() => items, [items])

  return (
    <div className="h-full bg-background">
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Sources</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Browse and manage extracted sources across all runs
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline">{total} total</Badge>
          </div>
        </div>
      </div>

      <div className="p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Sources Database</CardTitle>
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search sources..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-[300px] pl-8"
                  />
                </div>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-2" />
                  Filter
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground py-10 text-center">Loading sources...</div>
            ) : error ? (
              <div className="text-sm text-destructive py-10 text-center">{error}</div>
            ) : filteredSources.length === 0 ? (
              <div className="text-sm text-muted-foreground py-10 text-center">No sources found</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Run ID</TableHead>
                      <TableHead>Source ID</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSources.map((source) => (
                      <TableRow key={source.id}>
                        <TableCell>
                          <div className="max-w-[600px]">
                            <div className="text-xs text-muted-foreground truncate">
                              {(source.url || source.title || "") as string}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">{source.domain || ""}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{source.sourceType || "link"}</Badge>
                        </TableCell>
                        <TableCell>
                          {source.status ? (
                            <Badge
                              variant={
                                source.status === "READY"
                                  ? "success"
                                  : source.status === "FAILED"
                                    ? "destructive"
                                    : source.status === "PROCESSING"
                                      ? "info"
                                      : "warning"
                              }
                              className="text-xs"
                              title={source.status === "FAILED" ? (source.error || "Failed") : source.status}
                            >
                              {source.status}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground"></span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{source.runId}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">{source.id}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (source.url) window.open(source.url, "_blank")
                              }}
                              disabled={!source.url}
                            >
                              <ExternalLink className="h-3 w-3" />
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
