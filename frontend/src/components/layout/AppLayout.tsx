import { AppSidebar } from "./AppSidebar"
import { Outlet } from "react-router-dom"

export function AppLayout() {
  return (
    <div className="h-screen flex bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}