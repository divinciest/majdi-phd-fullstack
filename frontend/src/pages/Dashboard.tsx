import { StatusCard } from "@/components/dashboard/StatusCard"
import { EngineControls } from "@/components/dashboard/EngineControls"
import { LiveLogViewer } from "@/components/dashboard/LiveLogViewer"
import { StatusBreakdown } from "@/components/dashboard/StatusBreakdown"
import { 
  PlayCircle, 
  FileText, 
  Download, 
  TrendingUp,
  Clock
} from "lucide-react"
import { useEffect } from "react"
import { useAppDispatch, useAppSelector } from "@/hooks/store"
import { fetchDashboard } from "@/features/dashboard/dashboardSlice"

export default function Dashboard() {
  const dispatch = useAppDispatch()
  const { counts, loading, error } = useAppSelector((s) => s.dashboard)

  useEffect(() => {
    dispatch(fetchDashboard())
  }, [dispatch])
  return (
    <div className="h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Data Collection Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor and control your data collection operations
            </p>
          </div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Last updated: {new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatusCard
            title="Active Runs"
            value={counts.runsActive}
            icon={PlayCircle}
            variant="info"
            trend={{ value: 15, isPositive: true }}
          />
          <StatusCard
            title="Sources Processed"
            icon={FileText}
            value={counts.sourcesProcessed}
            description="Total sources crawled and processed"
            trend={{ value: 0, isPositive: true }}
            trendLabel="sources"
          />
          <StatusCard
            title="Export Files"
            value={counts.exportFiles}
            icon={Download}
            variant="default"
            trend={{ value: 8, isPositive: true }}
          />
        </div>

        {/* Controls and Breakdown */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <EngineControls />
          </div>
          <div className="lg:col-span-2">
            <StatusBreakdown />
          </div>
        </div>

        {/* Live Logs */}
        <div className="w-full">
          <LiveLogViewer />
        </div>
      </div>
    </div>
  )
}