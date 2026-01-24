import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Runs from "./pages/Runs";
import RunDetails from "./pages/RunDetails";
import Articles from "./pages/Articles";
import Exports from "./pages/Exports";
import Domains from "./pages/Domains";
import Cache from "./pages/Cache";
import Config from "./pages/Config";
import NotFound from "./pages/NotFound";
import RunCreate from "./pages/RunCreate";
import Signin from "./pages/Signin";
import Signup from "./pages/Signup";

const queryClient = new QueryClient();

const App = () => {
  
  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="signin" element={<Signin />} />
          <Route path="signup" element={<Signup />} />
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="runs" element={<Runs />} />
            <Route path="runs/create" element={<RunCreate />} />
            <Route path="runs/:id" element={<RunDetails />} />
            <Route path="articles" element={<Articles />} />
            <Route path="exports" element={<Exports />} />
            <Route path="domains" element={<Domains />} />
            <Route path="cache" element={<Cache />} />
            <Route path="config" element={<Config />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);
}

export default App;