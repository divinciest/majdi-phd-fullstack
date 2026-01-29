import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Search,
  Plus,
  Eye,
  Trash2,
  Link,
  FileText,
  RefreshCw,
  Loader2,
  ExternalLink,
  Globe
} from "lucide-react"
import { useEffect, useState } from "react"
import { useAppDispatch, useAppSelector } from "@/hooks/store"
import {
  fetchDeepResearchRuns,
  createDeepResearchRun,
  deleteDeepResearchRun,
  fetchDeepResearchRun,
  fetchExtractedLinks,
  fetchCrawlJobs,
  fetchReport,
  clearCurrentRun,
  resetAllCrawlJobs,
} from "@/features/deepResearch/deepResearchSlice"
import { toast } from "@/hooks/use-toast"
import { Label } from "@/components/ui/label"

export default function DeepResearch() {
  const dispatch = useAppDispatch()
  const { runs, currentRun, extractedLinks, crawlJobs, report, loading, error } = useAppSelector((s) => s.deepResearch)
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [newResearch, setNewResearch] = useState({ name: '', query: '' })

  useEffect(() => {
    dispatch(fetchDeepResearchRuns({}))
  }, [dispatch])

  useEffect(() => {
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" })
    }
  }, [error])

  const handleCreate = async () => {
    if (!newResearch.name.trim() || !newResearch.query.trim()) {
      toast({ title: "Validation Error", description: "Name and query are required", variant: "destructive" })
      return
    }
    try {
      await dispatch(createDeepResearchRun(newResearch)).unwrap()
      toast({ title: "Success", description: "Deep Research started" })
      setCreateDialogOpen(false)
      setNewResearch({ name: '', query: '' })
    } catch (err: any) {
      toast({ title: "Failed to create", description: err?.message || String(err), variant: "destructive" })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this research run?")) return
    try {
      await dispatch(deleteDeepResearchRun(id)).unwrap()
      toast({ title: "Deleted", description: "Research run deleted" })
    } catch (err: any) {
      toast({ title: "Failed to delete", description: err?.message || String(err), variant: "destructive" })
    }
  }

  const handleViewDetails = async (id: string) => {
    await dispatch(fetchDeepResearchRun(id))
    await dispatch(fetchExtractedLinks(id))
    await dispatch(fetchCrawlJobs(id))
    setDetailDialogOpen(true)
  }

  const handleViewReport = async (id: string) => {
    await dispatch(fetchReport(id))
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      running: "default",
      completed: "outline",
      failed: "destructive",
      timeout: "destructive",
    }
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>
  }

  const getCrawlStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      PENDING: "secondary",
      CLAIMED: "default",
      DONE: "outline",
      FAILED: "destructive",
    }
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>
  }

  const pendingJobs = crawlJobs.filter(j => j.status === 'PENDING').length
  const doneJobs = crawlJobs.filter(j => j.status === 'DONE').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deep Research</h1>
          <p className="text-muted-foreground">
            AI-powered research with automatic link extraction and crawling
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => dispatch(fetchDeepResearchRuns({}))}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Research
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
              <DialogHeader>
                <DialogTitle>Start Deep Research</DialogTitle>
                <DialogDescription>
                  Enter a research query. Gemini will search and compile a comprehensive report.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Research Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Machine Learning in Healthcare"
                    value={newResearch.name}
                    onChange={(e) => setNewResearch({ ...newResearch, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="query">Research Query</Label>
                  <Textarea
                    id="query"
                    placeholder="e.g., Find recent papers on applying machine learning to medical diagnosis, focusing on deep learning approaches published after 2022"
                    rows={4}
                    value={newResearch.query}
                    onChange={(e) => setNewResearch({ ...newResearch, query: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Start Research
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Research Runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && runs.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : runs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No research runs yet. Click "New Research" to start.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Query</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">{run.name}</TableCell>
                    <TableCell>{getStatusBadge(run.status)}</TableCell>
                    <TableCell className="max-w-[300px] truncate">{run.query}</TableCell>
                    <TableCell>{new Date(run.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewDetails(run.id)}
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(run.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailDialogOpen} onOpenChange={(open) => {
        setDetailDialogOpen(open)
        if (!open) dispatch(clearCurrentRun())
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{currentRun?.name || 'Research Details'}</DialogTitle>
            <DialogDescription>
              {currentRun?.query}
            </DialogDescription>
          </DialogHeader>
          
          {currentRun && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                {getStatusBadge(currentRun.status)}
                <span className="text-sm text-muted-foreground">
                  Created: {new Date(currentRun.createdAt).toLocaleString()}
                </span>
                {currentRun.completedAt && (
                  <span className="text-sm text-muted-foreground">
                    Completed: {new Date(currentRun.completedAt).toLocaleString()}
                  </span>
                )}
              </div>

              {currentRun.error && (
                <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
                  <strong>Error:</strong> {currentRun.error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Link className="h-4 w-4" />
                      Extracted Links ({extractedLinks.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[200px] overflow-y-auto">
                    {extractedLinks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No links extracted yet</p>
                    ) : (
                      <ul className="space-y-2">
                        {extractedLinks.slice(0, 10).map((link, i) => (
                          <li key={i} className="text-sm">
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {link.title || link.url}
                            </a>
                          </li>
                        ))}
                        {extractedLinks.length > 10 && (
                          <li className="text-sm text-muted-foreground">
                            ... and {extractedLinks.length - 10} more
                          </li>
                        )}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        Crawl Jobs ({doneJobs}/{crawlJobs.length})
                      </span>
                      {crawlJobs.some(j => j.status === 'CLAIMED' || j.status === 'FAILED') && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={async () => {
                            await dispatch(resetAllCrawlJobs(currentRun!.id))
                            toast({ title: "Jobs Reset", description: "All stuck jobs reset to PENDING" })
                            dispatch(fetchCrawlJobs(currentRun!.id))
                          }}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Reset Stuck
                        </Button>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[400px] overflow-y-auto">
                    {crawlJobs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No crawl jobs created yet</p>
                    ) : (
                      <ul className="space-y-1">
                        {crawlJobs.map((job) => (
                          <li key={job.id} className="text-xs flex items-center justify-between gap-2 py-1 border-b border-border/50">
                            <a 
                              href={job.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="truncate flex-1 text-blue-500 hover:underline"
                              title={job.url}
                            >
                              {job.title || job.url}
                            </a>
                            <div className="flex items-center gap-1 shrink-0">
                              {getCrawlStatusBadge(job.status)}
                              {job.error && (
                                <span className="text-red-500 text-xs" title={job.error}>⚠</span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>

              {currentRun.status === 'completed' && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Research Report
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {report ? (
                      <div className="prose prose-sm max-h-[300px] overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-sm">{report}</pre>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => handleViewReport(currentRun.id)}>
                        Load Report
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
