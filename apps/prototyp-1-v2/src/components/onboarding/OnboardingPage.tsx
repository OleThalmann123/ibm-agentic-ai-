import { useState } from 'react';
import { supabase } from '@asklepios/backend';
import { useAuth } from '@/contexts/AuthContext';
import { EmployerOnboarding } from '@/components/onboarding/EmployerOnboarding';
import { RotateCcw, CheckCircle2, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';

export function OnboardingPage() {
  const { employer, employerAccess, refreshProfile } = useAuth();
  // Employer exists → show completed
  if (employer) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Arbeitgeber-Einrichtung</h1>
          <p className="text-muted-foreground text-sm mt-1">Konfiguration abgeschlossen</p>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold">Einrichtung abgeschlossen</h2>
          <p className="text-muted-foreground text-base max-w-md mx-auto">
            Arbeitgeber <strong>{employer.name}</strong> ist konfiguriert.
          </p>
        </div>

      </div>
    );
  }

  // No employer → show onboarding
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Arbeitgeber-Einrichtung</h1>
        <p className="text-muted-foreground text-sm mt-1">Erstmalige Konfiguration Ihrer Assistenz-Verwaltung</p>
      </div>
      <EmployerOnboarding onComplete={async () => {
        await refreshProfile();
      }} />
    </div>
  );
}
