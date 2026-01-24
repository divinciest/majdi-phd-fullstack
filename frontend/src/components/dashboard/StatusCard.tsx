import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface StatusCardProps {
  title: string
  value: number
  icon: LucideIcon
  trend?: {
    value: number
    isPositive: boolean
  }
  variant?: "default" | "success" | "warning" | "destructive" | "info"
  className?: string
}

const variantStyles = {
  default: "bg-card border-border",
  success: "bg-success/5 border-success/20",
  warning: "bg-warning/5 border-warning/20", 
  destructive: "bg-destructive/5 border-destructive/20",
  info: "bg-info/5 border-info/20"
}

const iconStyles = {
  default: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive", 
  info: "text-info"
}

export function StatusCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  variant = "default",
  className 
}: StatusCardProps) {
  return (
    <Card className={cn(variantStyles[variant], className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-card-foreground">
          {title}
        </CardTitle>
        <Icon className={cn("h-4 w-4", iconStyles[variant])} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-card-foreground">
          {value.toLocaleString()}
        </div>
        {trend && (
          <div className="flex items-center space-x-1 mt-1">
            <Badge 
              variant={trend.isPositive ? "default" : "destructive"}
              className="text-xs"
            >
              {trend.isPositive ? "+" : ""}{trend.value}%
            </Badge>
            <span className="text-xs text-muted-foreground">
              from last period
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}