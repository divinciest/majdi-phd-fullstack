import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { useEffect, useMemo } from "react"
import { useAppDispatch, useAppSelector } from "@/hooks/store"
import { fetchRuns } from "@/features/runs/runsSlice"

interface StatusData {
  name: string
  value: number
  color: string
  variant: "default" | "success" | "warning" | "destructive" | "info" | "secondary"
}

const STATUS_COLORS: Record<string, { color: string; variant: StatusData["variant"] }> = {
  COMPLETED: { color: "hsl(var(--success))", variant: "success" },
  PROCESSING: { color: "hsl(var(--info))", variant: "info" },
  PENDING: { color: "hsl(var(--warning))", variant: "warning" },
  FAILED: { color: "hsl(var(--destructive))", variant: "destructive" },
  ENGINE_CRASHED: { color: "hsl(var(--destructive))", variant: "destructive" },
  PAUSED: { color: "hsl(var(--muted-foreground))", variant: "secondary" },
  INITIALIZING: { color: "hsl(var(--secondary))", variant: "secondary" },
}

const RADIAN = Math.PI / 180
const renderCustomizedLabel = ({
  cx, cy, midAngle, innerRadius, outerRadius, percent
}: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  return (
    <text 
      x={x} 
      y={y} 
      fill="white" 
      textAnchor={x > cx ? 'start' : 'end'} 
      dominantBaseline="central"
      className="text-xs font-medium"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

export function StatusBreakdown() {
  const dispatch = useAppDispatch()
  const { items, total, loading, error } = useAppSelector((s) => s.runs)

  useEffect(() => {
    if (!items || items.length === 0) {
      dispatch(fetchRuns(undefined))
    }
  }, [dispatch])

  const statusData: StatusData[] = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of items) {
      counts[r.status] = (counts[r.status] || 0) + 1
    }
    const entries: StatusData[] = Object.entries(counts).map(([name, value]) => {
      const meta = STATUS_COLORS[name] || { color: "hsl(var(--muted))", variant: "default" as const }
      return { name, value, color: meta.color, variant: meta.variant }
    })
    // Keep a stable order
    const order = ["COMPLETED", "PROCESSING", "PENDING", "PAUSED", "FAILED", "ENGINE_CRASHED", "INITIALIZING"]
    entries.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
    return entries
  }, [items])

  const pageTotal = items.length
  
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Run Status Overview</CardTitle>
        {loading && (
          <p className="text-sm text-muted-foreground">Loading status breakdown…</p>
        )}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        {!loading && !error && (
          <p className="text-sm text-muted-foreground">
            Showing current page: {pageTotal} runs • Total runs: {total}
          </p>
        )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row lg:items-center lg:space-x-6">
            {/* Chart */}
            <div className="flex-1 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                  data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomizedLabel}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                  formatter={(value: number) => [value, "Runs"]}
                  labelFormatter={(label) => `Status: ${label}`}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="space-y-3 lg:w-48">
              {statusData.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: item.color }}
                    />
                  <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  <Badge variant={item.variant} className="text-xs">
                    {item.value}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }