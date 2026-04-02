import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/components/auth/LoginPage';
import { RegisterPage } from '@/components/auth/RegisterPage';
import { DashboardPage } from '@/components/dashboard/DashboardPage';
import { AssistantsPage } from '@/components/assistants/AssistantsPage';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { TokenLoginPage } from '@/components/auth/TokenLoginPage';
import { PayrollPage } from '@/components/payroll/PayrollPage';
import { OnboardingPage } from '@/components/onboarding/OnboardingPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
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
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">Laden...</p>
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
      <Route path="/t/:token" element={<TokenLoginPage />} />

      {/* Protected routes inside AppShell */}
      <Route element={
        <ProtectedRoute>
          <AppShell />
        </ProtectedRoute>
      }>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/assistants" element={<AssistantsPage />} />
        <Route path="/payroll" element={<PayrollPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to={user ? '/assistants' : '/login'} replace />} />
    </Routes>
  );
}
