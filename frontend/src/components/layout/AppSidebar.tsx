import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  LayoutDashboard, 
  PlayCircle, 
  FileText, 
  Download, 
  Globe, 
  Database, 
  Settings,
  Wifi,
  WifiOff
} from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import { http } from "@/lib/http"

interface AppSidebarProps {
  className?: string
}

const navigation = [
  {
    name: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    description: "System overview & live monitoring"
  },
  {
    name: "Runs",
    href: "/runs",
    icon: PlayCircle,
    description: "Manage data collection runs"
  },
  {
    name: "Articles",
    href: "/articles", 
    icon: FileText,
    description: "Browse extracted articles"
  },
  {
    name: "Exports",
    href: "/exports",
    icon: Download,
    description: "Download generated reports"
  },
  {
    name: "Domains",
    href: "/domains",
    icon: Globe,
    description: "Domain analytics & statistics"
  },
  {
    name: "Cache",
    href: "/cache",
    icon: Database,
    description: "Inspect system caches"
  },
  {
    name: "Config",
    href: "/config",
    icon: Settings,
    description: "System configuration"
  }
]

export function AppSidebar({ className }: AppSidebarProps) {
  const location = useLocation()
  const [isConnected, setIsConnected] = useState(true)

  useEffect(() => {
    let active = true
    const ping = async () => {
      try {
        await http<{ status: string }>(`/health`, { silent: true })
        if (active) setIsConnected(true)
      } catch (_) {
        if (active) setIsConnected(false)
      }
    }
    ping()
    const id = setInterval(ping, 5000)
    return () => { active = false; clearInterval(id) }
  }, [])

  return (
    <div className={cn("flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border", className)}>
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-6 border-b border-sidebar-border">
        <div className="flex items-center space-x-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center">
            <Database className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-sidebar-foreground">CreteXtract</h1>
            <p className="text-xs text-sidebar-foreground/60">Production Platform</p>
          </div>
        </div>
      </div>

      {/* Connection Status */}
      <div className="px-6 py-3 border-b border-sidebar-border">
        <div className="flex items-center space-x-2">
          {isConnected ? (
            <>
              <Wifi className="h-4 w-4 text-success" />
              <span className="text-xs text-sidebar-foreground">Connected to localhost:5007</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-destructive" />
              <span className="text-xs text-sidebar-foreground">Disconnected</span>
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = item.href === "/" ? location.pathname === "/" : location.pathname.startsWith(item.href)
          
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={cn(
                "group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "mr-3 h-4 w-4 flex-shrink-0",
                  isActive ? "text-sidebar-primary" : "text-sidebar-foreground/60"
                )}
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span>{item.name}</span>
                </div>
                <p className="text-xs text-sidebar-foreground/50 mt-0.5">
                  {item.description}
                </p>
              </div>
            </NavLink>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-full bg-gradient-primary flex items-center justify-center">
            <span className="text-xs font-medium text-primary-foreground">AD</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">Administrator</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">System Operator</p>
          </div>
        </div>
      </div>
    </div>
  )
}