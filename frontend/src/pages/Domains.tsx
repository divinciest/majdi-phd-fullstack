import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Globe, ExternalLink, TrendingUp, TrendingDown, RefreshCcw } from "lucide-react"
import { useEffect } from "react"
import { useAppDispatch, useAppSelector } from "@/hooks/store"
import { fetchDomains } from "@/features/domains/domainsSlice"

export default function Domains() {
  const getSuccessRate = (success: number, total: number) => {
    const denom = total || 1
    return ((success / denom) * 100).toFixed(1)
  }

  const getSuccessRateVariant = (successRate: number) => {
    if (successRate >= 95) return "success"
    if (successRate >= 85) return "warning"
    return "destructive"
  }

  const dispatch = useAppDispatch()
  const { items, loading, error, total } = useAppSelector((s) => s.domains)

  useEffect(() => {
    dispatch(fetchDomains(undefined))
  }, [dispatch])

  return (
    <div className="h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Domain Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor crawling performance and statistics across all domains
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline">{total} domain{total !== 1 ? "s" : ""} tracked</Badge>
            <Button size="sm" variant="ghost" onClick={() => dispatch(fetchDomains(undefined))} disabled={loading}>
              <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Globe className="h-5 w-5 mr-2" />
              Domain Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Loading domains...</div>
            ) : error ? (
              <div className="p-8 text-center text-destructive">{error}</div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No domains found.</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>Visited</TableHead>
                      <TableHead>Success Rate</TableHead>
                      <TableHead>Failures</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((domain) => {
                      const successRate = parseFloat(getSuccessRate(domain.successCount, domain.visitedCount))
                      return (
                        <TableRow key={domain.id}>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <Globe className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <div className="font-medium">{domain.name}</div>
                                <div className="text-xs text-muted-foreground">ID: {domain.id}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{domain.visitedCount}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <Badge variant={getSuccessRateVariant(successRate)}>{successRate}%</Badge>
                              {successRate >= 95 ? (
                                <TrendingUp className="h-3 w-3 text-success" />
                              ) : (
                                <TrendingDown className="h-3 w-3 text-destructive" />
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {domain.successCount} / {domain.visitedCount}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={domain.failedCount === 0 ? "success" : "destructive"}>{domain.failedCount}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-1">
                              <Button variant="ghost" size="sm" title="Open domain">
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Summary Statistics */}
            <div className="mt-6 grid grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted rounded-md">
                <div className="text-2xl font-bold text-foreground">{items.reduce((sum, d) => sum + d.visitedCount, 0)}</div>
                <div className="text-sm text-muted-foreground">Total Crawls</div>
              </div>
              <div className="text-center p-4 bg-success/10 rounded-md">
                <div className="text-2xl font-bold text-success">{items.reduce((sum, d) => sum + d.successCount, 0)}</div>
                <div className="text-sm text-muted-foreground">Successful</div>
              </div>
              <div className="text-center p-4 bg-destructive/10 rounded-md">
                <div className="text-2xl font-bold text-destructive">{items.reduce((sum, d) => sum + d.failedCount, 0)}</div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
              <div className="text-center p-4 bg-info/10 rounded-md hidden">
                <div className="text-2xl font-bold text-info">0s</div>
                <div className="text-sm text-muted-foreground">Avg Response</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}