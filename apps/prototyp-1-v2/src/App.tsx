import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { AsklepiosLogo } from '@/components/brand/AsklepiosLogo';
import { LoginPage } from '@/components/auth/LoginPage';
import { RegisterPage } from '@/components/auth/RegisterPage';
import { ForgotPasswordPage } from '@/components/auth/ForgotPasswordPage';
import { DashboardPage } from '@/components/dashboard/DashboardPage';
import { AssistantsPage } from '@/components/assistants/AssistantsPage';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { TokenLoginPage } from '@/components/auth/TokenLoginPage';
import { PayrollPage } from '@/components/payroll/PayrollPage';


function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="w-14 h-14 rounded-2xl bg-white border border-border shadow-md flex items-center justify-center overflow-hidden">
          <AsklepiosLogo className="w-full h-full object-contain p-1.5" />
        </div>
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-5">
        <div className="w-16 h-16 rounded-3xl bg-white border border-border shadow-lg flex items-center justify-center overflow-hidden">
          <AsklepiosLogo className="w-full h-full object-contain p-2" />
        </div>
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground text-sm">Laden...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={
        user ? <Navigate to="/assistants" replace /> : <LoginPage />
      } />
      <Route path="/register" element={
        user ? <Navigate to="/assistants" replace /> : <RegisterPage />
      } />
      <Route path="/forgot-password" element={
        user ? <Navigate to="/assistants" replace /> : <ForgotPasswordPage />
      } />
      <Route path="/t/:token" element={<TokenLoginPage />} />

      {/* Protected routes inside AppShell */}
      <Route element={
        <ProtectedRoute>
          <AppShell />
        </ProtectedRoute>
      }>
        <Route path="/dashboard" element={<DashboardPage />} />

        <Route path="/assistants" element={<AssistantsPage />} />
        <Route path="/payroll" element={<PayrollPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to={user ? '/assistants' : '/login'} replace />} />
    </Routes>
  );
}
