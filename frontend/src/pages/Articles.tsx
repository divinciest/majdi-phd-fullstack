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
import { fetchArticles, setQuery } from "@/features/articles/articlesSlice"
import type { Article } from "@/features/articles/api"

export default function Articles() {
  const dispatch = useAppDispatch()
  const { items, loading, error, total, query } = useAppSelector((s) => s.articles)
  const [searchQuery, setSearchQuery] = useState(query.q || "")

  // Fetch on mount and when query changes
  useEffect(() => {
    dispatch(fetchArticles(undefined))
  }, [dispatch])

  // Debounce search input and dispatch query update
  useEffect(() => {
    const h = setTimeout(() => {
      dispatch(setQuery({ q: searchQuery, page: 1 }))
      dispatch(fetchArticles({ q: searchQuery, page: 1 }))
    }, 400)
    return () => clearTimeout(h)
  }, [dispatch, searchQuery])

  const filteredArticles = useMemo(() => items, [items])

  return (
    <div className="h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Articles</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Browse and manage extracted articles across all runs
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline">
              {total} total
            </Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Article Database</CardTitle>
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search articles..."
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
              <div className="text-sm text-muted-foreground py-10 text-center">Loading articles...</div>
            ) : error ? (
              <div className="text-sm text-destructive py-10 text-center">{error}</div>
            ) : filteredArticles.length === 0 ? (
              <div className="text-sm text-muted-foreground py-10 text-center">No articles found</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead>Run ID</TableHead>
                      <TableHead>Article ID</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredArticles.map((article) => (
                      <TableRow key={article.id}>
                        <TableCell>
                          <div className="max-w-[600px]">
                            <div className="text-xs text-muted-foreground truncate">
                              {article.url}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {article.domain}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{article.runId}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">{article.id}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => window.open(article.url, '_blank')}
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