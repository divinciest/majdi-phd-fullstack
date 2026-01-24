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
import { Download, Trash2, FileSpreadsheet, RefreshCcw } from "lucide-react"
import { useEffect } from "react"
import { useAppDispatch, useAppSelector } from "@/hooks/store"
import { deleteExport, downloadExport, fetchExports } from "@/features/exports/exportsSlice"
import { toast } from "sonner"

export default function Exports() {
  const dispatch = useAppDispatch()
  const { items, loading, error, total } = useAppSelector((s) => s.exports)

  useEffect(() => {
    dispatch(fetchExports(undefined))
  }, [dispatch])

  const handleDownload = async (id: number) => {
    try {
      const res = await dispatch(downloadExport(String(id))).unwrap()
      if (res.url) {
        window.open(res.url, "_blank")
      } else {
        toast.error("Download URL not provided by server")
      }
    } catch (e: any) {
      toast.error("Failed to initiate download", { description: e?.message })
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await dispatch(deleteExport(String(id))).unwrap()
      toast.success("Export deleted")
    } catch (e: any) {
      toast.error("Failed to delete export", { description: e?.message })
    }
  }

  return (
    <div className="h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Export Files</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Download and manage exported Excel reports from your runs
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline">
              {total} export file{total !== 1 ? "s" : ""}
            </Badge>
            <Button size="sm" variant="ghost" onClick={() => dispatch(fetchExports())} disabled={loading}>
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
              <FileSpreadsheet className="h-5 w-5 mr-2" />
              Available Downloads
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Loading exports...</div>
            ) : error ? (
              <div className="p-8 text-center text-destructive">{error}</div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No exports found.</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Export File</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((exp) => (
                      <TableRow key={exp.id}>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <FileSpreadsheet className="h-4 w-4 text-success" />
                            <div>
                              <div className="font-medium">{exp.filePath.split("/").pop() || exp.filePath.split("\\").pop()}</div>
                              <div className="text-xs text-muted-foreground">ID: {exp.id}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{new Date(exp.createdAt).toLocaleDateString()}</div>
                          <div className="text-xs text-muted-foreground">{new Date(exp.createdAt).toLocaleTimeString()}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDownload(exp.id as unknown as number)}
                              title="Download"
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDelete(exp.id as unknown as number)}
                              className="text-destructive hover:text-destructive"
                              title="Delete"
                            >
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

            {/* Quick Stats */}
            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-muted rounded-md">
                <div className="text-2xl font-bold text-foreground">{items.length}</div>
                <div className="text-sm text-muted-foreground">Currently Listed</div>
              </div>
              <div className="text-center p-4 bg-success/10 rounded-md hidden">
                <div className="text-2xl font-bold text-success">0 MB</div>
                <div className="text-sm text-muted-foreground">Total File Size</div>
              </div>
              <div className="text-center p-4 bg-info/10 rounded-md">
                <div className="text-2xl font-bold text-info">{total}</div>
                <div className="text-sm text-muted-foreground">Total Available</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}