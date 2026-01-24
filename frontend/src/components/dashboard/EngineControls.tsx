import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Play, Pause, Square, RotateCcw } from "lucide-react"
import { useMemo } from "react"
import { useAppSelector } from "@/hooks/store"
import { useNavigate } from "react-router-dom"

type RunStatus = "IDLE" | "INITIALIZING" | "PROCESSING" | "PAUSED" | "COMPLETED" | "FAILED" | "ENGINE_CRASHED"

export function EngineControls() {
  const navigate = useNavigate()
  const runs = useAppSelector((s) => s.runs.items)

  // Derive a high-level engine status from runs on the current page
  const runStatus: RunStatus = useMemo(() => {
    if (runs.some((r) => r.status === "PROCESSING" || r.status === "INITIALIZING")) return "PROCESSING"
    if (runs.some((r) => r.status === "PAUSED")) return "PAUSED"
    if (runs.some((r) => r.status === "ENGINE_CRASHED")) return "ENGINE_CRASHED"
    if (runs.some((r) => r.status === "FAILED")) return "FAILED"
    if (runs.some((r) => r.status === "COMPLETED")) return "COMPLETED"
    return "IDLE"
  }, [runs])

  const getStatusVariant = (status: RunStatus) => {
    switch (status) {
      case "PROCESSING":
        return "success"
      case "PAUSED":
        return "warning"
      case "ENGINE_CRASHED":
        return "destructive"
      case "FAILED":
        return "destructive"
      case "COMPLETED":
        return "default"
      default:
        return "secondary"
    }
  }

  const isRunning = runStatus === "PROCESSING"
  const isPaused = runStatus === "PAUSED"
  const canStart = runStatus === "IDLE" || runStatus === "COMPLETED" || runStatus === "FAILED" || runStatus === "ENGINE_CRASHED"
  const canPause = runStatus === "PROCESSING"
  const canResume = runStatus === "PAUSED"
  const canStop = runStatus !== "IDLE"

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Engine Control</CardTitle>
          <Badge variant={getStatusVariant(runStatus)}>
            {runStatus}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Status derived from current runs. Manage specific runs from the Runs page.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={() => navigate("/runs/create")}
            disabled={!canStart}
            variant="default"
            size="sm"
            className="flex-1 min-w-[100px]"
          >
            <Play className="h-4 w-4 mr-2" />
            Start
          </Button>
          
          <Button
            onClick={() => navigate("/runs")}
            disabled={!canPause}
            variant="warning"
            size="sm"
            className="flex-1 min-w-[100px]"
          >
            <Pause className="h-4 w-4 mr-2" />
            Pause
          </Button>
          
          <Button
            onClick={() => navigate("/runs")}
            disabled={!canResume}
            variant="success"
            size="sm"
            className="flex-1 min-w-[100px]"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Resume
          </Button>
          
          <Button
            onClick={() => navigate("/runs")}
            disabled={!canStop}
            variant="destructive"
            size="sm"
            className="flex-1 min-w-[100px]"
          >
            <Square className="h-4 w-4 mr-2" />
            Stop
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}