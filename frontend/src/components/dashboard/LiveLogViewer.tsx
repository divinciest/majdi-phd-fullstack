import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { 
  Search, 
  Pause, 
  Play, 
  Trash2, 
  Wifi, 
  Copy,
  RotateCcw,
  Filter
} from "lucide-react"
import { useState, useEffect, useRef } from "react"
import type { LogEntry } from "@/features/telemetry/api"
import { http, API_BASE_URL } from "@/lib/http"

export function LiveLogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [paused, setPaused] = useState(false)
  const [localSearch, setLocalSearch] = useState("")
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [autoscroll, setAutoscroll] = useState(true)
  const [isConnected, setIsConnected] = useState(true)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Initialize with tail and connect SSE stream
  useEffect(() => {
    let es: EventSource | null = null
    let cancelled = false
    const start = async () => {
      try {
        setLoading(true)
        const tail = await http<{ items: { id: number; createdAt: string; message: string; level: LogEntry["level"] }[] }>(
          `/server-logs/tail?maxLines=200`,
          { silent: true }
        )
        if (!cancelled) {
          const initial = tail.items.map((i) => ({ id: i.id, createdAt: i.createdAt, level: i.level, message: i.message }))
          setLogs(initial)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }

      try {
        es = new EventSource(`${API_BASE_URL}/server-logs/stream`)
        setIsConnected(true)
        es.onmessage = (ev) => {
          if (paused) return
          const line = ev.data as string
          const sp = line.indexOf(" ")
          const createdAt = sp > 0 ? line.slice(0, sp) : ""
          const message = sp > 0 ? line.slice(sp + 1) : line
          setLogs((prev) => {
            const next = [...prev, { id: (prev.at(-1)?.id ?? 0) + 1, createdAt, level: "INFO", message } as LogEntry]
            return next.length > 1000 ? next.slice(-1000) : next
          })
        }
        es.onerror = () => {
          setIsConnected(false)
        }
      } catch (_) {
        setIsConnected(false)
      }
    }
    start()
    return () => {
      cancelled = true
      if (es) es.close()
    }
  }, [paused])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoscroll && scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: "smooth",
      })
    }
  }, [logs, autoscroll])

  const filteredLogs = logs.filter(log => {
    const query = localSearch
    if (!query) return true
    const searchTerm = caseSensitive ? query : query.toLowerCase()
    const messageText = caseSensitive ? log.message : log.message.toLowerCase()
    return messageText.includes(searchTerm)
  })

  const handleClearLogs = () => {
    setLogs([])
  }

  const handleCopyLogs = () => {
    const logText = filteredLogs.map(log => {
      const ts = new Date(log.createdAt).toLocaleTimeString()
      const rid = log.runId ? `[${log.runId}]` : ""
      return `[${ts}] ${log.level} ${rid} ${log.message}`
    }).join('\n')
    navigator.clipboard.writeText(logText)
  }

  const handleReconnect = () => {
    setIsConnected(false)
    setTimeout(() => setIsConnected(true), 2000)
  }

  const getLevelColor = (level: LogEntry["level"]) => {
    switch (level) {
      case "ERROR": return "text-destructive"
      case "WARN": return "text-warning"
      case "INFO": return "text-info"
      case "DEBUG": return "text-muted-foreground"
      default: return "text-foreground"
    }
  }

  const getLevelBadgeVariant = (level: LogEntry["level"]) => {
    switch (level) {
      case "ERROR": return "destructive"
      case "WARN": return "warning" as any
      case "INFO": return "default"
      case "DEBUG": return "secondary"
      default: return "outline"
    }
  }

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Live Logs</CardTitle>
          <div className="flex items-center space-x-2">
            <Badge variant={isConnected ? "success" : "destructive"} className="text-xs">
              <Wifi className="h-3 w-3 mr-1" />
              {isConnected ? "Connected" : "Disconnected"}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {filteredLogs.length} lines
            </Badge>
          </div>
        </div>
        
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <div className="flex items-center space-x-2 flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="h-8"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="case-sensitive"
              checked={caseSensitive}
              onCheckedChange={setCaseSensitive}
            />
            <Label htmlFor="case-sensitive" className="text-xs">Case sensitive</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="autoscroll"
              checked={autoscroll}
              onCheckedChange={setAutoscroll}
            />
            <Label htmlFor="autoscroll" className="text-xs">Auto-scroll</Label>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearLogs}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyLogs}
          >
            <Copy className="h-3 w-3" />
          </Button>
          
          {!isConnected && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReconnect}
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
          <div className="hidden">
            <Button variant="outline" size="sm" title="Apply search"><Filter className="h-3 w-3" /></Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 p-0">
        <div ref={scrollAreaRef} className="h-full px-6 pb-6 overflow-y-auto">
          <div className="space-y-1 font-mono text-xs">
            {filteredLogs.map((log) => (
              <div key={log.id} className="flex items-start space-x-3 p-2 rounded hover:bg-muted/50">
                <span className="text-muted-foreground shrink-0 w-20">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
                <Badge variant={getLevelBadgeVariant(log.level)} className="shrink-0 text-xs">
                  {log.level}
                </Badge>
                {log.runId && (
                  <span className="text-muted-foreground shrink-0 text-xs">
                    [{log.runId}]
                  </span>
                )}
                <span className={`flex-1 ${getLevelColor(log.level)}`}>
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}