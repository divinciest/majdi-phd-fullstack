import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Runs from "./pages/Runs";
import RunDetails from "./pages/RunDetails";
import Sources from "./pages/Sources";
import Exports from "./pages/Exports";
import Domains from "./pages/Domains";
import Cache from "./pages/Cache";
import Config from "./pages/Config";
import NotFound from "./pages/NotFound";
import RunCreate from "./pages/RunCreate";
import Signin from "./pages/Signin";
import Signup from "./pages/Signup";
import DeepResearch from "./pages/DeepResearch";

const queryClient = new QueryClient();

const App = () => {
  
  return (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="signin" element={<Signin />} />
            <Route path="signup" element={<Signup />} />
            <Route path="/" element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Dashboard />} />
              <Route path="runs" element={<Runs />} />
              <Route path="runs/create" element={<RunCreate />} />
              <Route path="runs/:id" element={<RunDetails />} />
              <Route path="sources" element={<Sources />} />
              <Route path="exports" element={<Exports />} />
              <Route path="domains" element={<Domains />} />
              <Route path="cache" element={<Cache />} />
              <Route path="config" element={<Config />} />
              <Route path="deep-research" element={<DeepResearch />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);
}

export default App;