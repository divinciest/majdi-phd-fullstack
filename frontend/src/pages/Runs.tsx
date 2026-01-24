import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  Play, 
  Pause, 
  Square, 
  Download, 
  Eye, 
  Search,
  Filter,
  Plus
} from "lucide-react"
import { useEffect, useState } from "react"
import { useAppDispatch, useAppSelector } from "@/hooks/store"
import { fetchRuns, pauseRun, resumeRun, stopRun, exportRun, setPage, setPageSize, setQuery } from "@/features/runs/runsSlice"
import { useNavigate } from "react-router-dom"
import { toast } from "@/hooks/use-toast"

type Run = {
  id: string
  name: string
  status: "INITIALIZING" | "PENDING" | "PROCESSING" | "PAUSED" | "COMPLETED" | "FAILED" | "ENGINE_CRASHED"
  startDate: string
  articlesCount: number
  dataEntriesCount: number
  llmProvider: string
  searchMethods: string[]
  searchQueries: string[]
}

export default function Runs() {
  const [selectedRuns, setSelectedRuns] = useState<string[]>([])
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { items: runs, loading, page, pageSize, total, q } = useAppSelector((s) => s.runs)

  useEffect(() => {
    dispatch(fetchRuns()).unwrap().catch((err) => {
      toast({ title: "Failed to load runs", description: err?.message || String(err), variant: "destructive" })
    })
  }, [dispatch])

  // Reload on query/page changes
  useEffect(() => {
    dispatch(fetchRuns({ page, pageSize, q }))
  }, [dispatch, page, pageSize, q])

  const getStatusVariant = (status: Run["status"]) => {
    switch (status) {
      case "PROCESSING": return "info"
      case "COMPLETED": return "success"
      case "PAUSED": return "warning"
      case "FAILED": return "destructive"
      case "ENGINE_CRASHED": return "destructive"
      default: return "secondary"
    }
  }

  const onPause = async (id: string) => {
    try { await dispatch(pauseRun(id)).unwrap(); toast({ title: "Run paused" }) } 
    catch (err: any) { toast({ title: "Pause failed", description: err?.message || String(err), variant: "destructive" }) }
  }
  const onResume = async (id: string) => {
    try { await dispatch(resumeRun(id)).unwrap(); toast({ title: "Run resumed" }) } 
    catch (err: any) { toast({ title: "Resume failed", description: err?.message || String(err), variant: "destructive" }) }
  }
  const onStop = async (id: string) => {
    try { await dispatch(stopRun(id)).unwrap(); toast({ title: "Run stopped" }) } 
    catch (err: any) { toast({ title: "Stop failed", description: err?.message || String(err), variant: "destructive" }) }
  }
  const onExport = async (id: string) => {
    try { const url = await dispatch(exportRun(id)).unwrap(); toast({ title: "Export ready", description: "Downloading..." }); window.open(url, "_blank") }
    catch (err: any) { toast({ title: "Export failed", description: err?.message || String(err), variant: "destructive" }) }
  }

  return (
    <div className="h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Data Collection Runs</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage and monitor your data collection runs
            </p>
          </div>
          <Button onClick={() => navigate("/runs/create")}>
            <Plus className="h-4 w-4 mr-2" />
            Start New Run
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Active Runs</CardTitle>
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search runs..."
                    value={q}
                    onChange={(e) => dispatch(setQuery(e.target.value))}
                    className="w-[300px] pl-8"
                  />
                </div>
                <Button variant="outline" size="sm" disabled>
                  <Filter className="h-4 w-4 mr-2" />
                  Filter
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <input type="checkbox" className="rounded" />
                    </TableHead>
                    <TableHead>Run Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Articles</TableHead>
                    <TableHead>Data Entries</TableHead>
                    <TableHead>LLM Provider</TableHead>
                    <TableHead>Search Methods</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">Loading runs...</TableCell>
                    </TableRow>
                  ) : runs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">No runs found</TableCell>
                    </TableRow>
                  ) : runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        <input 
                          type="checkbox" 
                          className="rounded"
                          checked={selectedRuns.includes(run.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRuns([...selectedRuns, run.id])
                            } else {
                              setSelectedRuns(selectedRuns.filter(id => id !== run.id))
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>
                          <div>{run.name}</div>
                          <div className="text-xs text-muted-foreground">ID: {run.id}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(run.status)}>
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(run.startDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>{run.articlesCount.toLocaleString()}</TableCell>
                      <TableCell>{run.dataEntriesCount.toLocaleString()}</TableCell>
                      <TableCell>{run.llmProvider}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {run.searchMethods.map((method) => (
                            <Badge key={method} variant="outline" className="text-xs">
                              {method}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/runs/${run.id}`)}>
                            <Eye className="h-3 w-3" />
                          </Button>
                          {run.status === "PROCESSING" && (
                            <Button variant="ghost" size="sm" onClick={() => onPause(run.id)}>
                              <Pause className="h-3 w-3" />
                            </Button>
                          )}
                          {run.status === "PAUSED" && (
                            <Button variant="ghost" size="sm" onClick={() => onResume(run.id)}>
                              <Play className="h-3 w-3" />
                            </Button>
                          )}
                          {run.status !== "COMPLETED" && (
                            <Button variant="ghost" size="sm" onClick={() => onStop(run.id)}>
                              <Square className="h-3 w-3" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => onExport(run.id)}>
                            <Download className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Page {page} of {Math.max(1, Math.ceil(total / (pageSize || 1)))} • {total.toLocaleString()} total
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => dispatch(setPage(Math.max(1, page - 1)))}
                  disabled={page <= 1 || loading}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => dispatch(setPage(page + 1))}
                  disabled={page >= Math.ceil(total / pageSize) || loading}
                >
                  Next
                </Button>
                <div className="flex items-center gap-1 text-sm">
                  <span>Rows:</span>
                  <select
                    className="h-8 rounded border px-2 bg-background"
                    value={pageSize}
                    onChange={(e) => dispatch(setPageSize(parseInt(e.target.value) || 10))}
                    disabled={loading}
                  >
                    {[10, 20, 50].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedRuns.length > 0 && (
              <div className="mt-4 p-3 bg-muted rounded-md">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {selectedRuns.length} run(s) selected
                  </span>
                  <div className="flex items-center space-x-2">
                    <Button variant="outline" size="sm" onClick={() => Promise.all(selectedRuns.map(onPause))}>
                      <Pause className="h-3 w-3 mr-1" />
                      Bulk Pause
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => Promise.all(selectedRuns.map(onStop))}>
                      <Square className="h-3 w-3 mr-1" />
                      Bulk Stop
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => selectedRuns.forEach(onExport)}>
                      <Download className="h-3 w-3 mr-1" />
                      Bulk Export
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}