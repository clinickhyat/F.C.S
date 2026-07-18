import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import SettingsPage from "./pages/SettingsPage";
import AppointmentsPage from "./pages/AppointmentsPage";
import PatientsPage from "./pages/PatientsPage";
import SuperAdminPage from "./pages/SuperAdminPage";
import SuperAdminPortal from "./pages/SuperAdminPortal";
import E2ETestPage from "./pages/E2ETestPage";
import ConversationLogsPage from "./pages/ConversationLogsPage";
import ReceptionPage from "./pages/ReceptionPage";
import CashierPage from "./pages/CashierPage";
import NotFound from "./pages/NotFound";

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
              <Route path="/" element={<LandingPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/appointments" element={<AppointmentsPage />} />
              <Route path="/patients" element={<PatientsPage />} />
              <Route path="/reception" element={<ReceptionPage />} />
              <Route path="/cashier" element={<CashierPage />} />
              <Route path="/super-admin-yemen" element={<SuperAdminPage />} />
              <Route path="/super-admin-portal" element={<SuperAdminPortal />} />
              <Route path="/e2e-test" element={<E2ETestPage />} />
              <Route path="/conversation-logs" element={<ConversationLogsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
