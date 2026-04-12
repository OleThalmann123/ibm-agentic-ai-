import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@asklepios/core';
import { formatCHF } from '@asklepios/core';
import type { Assistant } from '@asklepios/core';
import { Users, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LohnbudgetRechner } from './LohnbudgetRechner';

export function DashboardPage() {
  const { employer, employerAccess } = useAuth();
  const [assistantCount, setAssistantCount] = useState(0);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAssistants = async () => {
    if (!employerAccess?.employer_id) { setLoading(false); return; }
    const { data, count, error } = await supabase
      .from('assistant')
      .select('*', { count: 'exact' })
      .eq('employer_id', employerAccess.employer_id)
      .eq('is_active', true);
    // Bug C4: Fehler aus Supabase (Netzwerk / RLS) sichtbar machen, statt
    // stillschweigend "0 Assistenzpersonen" anzuzeigen.
    if (error) {
      console.error('[dashboard] loadAssistants', error);
      setAssistantCount(0);
      setAssistants([]);
    } else {
      setAssistantCount(count ?? 0);
      setAssistants(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (employerAccess?.employer_id) {
      loadAssistants();
    } else {
      // Bug C3: Beim Mandantenwechsel auf null/undefined die alten Daten
      // verwerfen – sonst sieht der User kurz die Assistenzen des vorigen
      // Arbeitgebers.
      setAssistants([]);
      setAssistantCount(0);
      setLoading(false);
    }
  }, [employerAccess?.employer_id]);

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="flex items-center justify-center h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  // No employer yet → the onboarding overlay in AppShell handles this
  if (!employer || !employerAccess) {
    return (
      <div className="h-full overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">IV Assistenz</p>
        </div>
        <div className="rounded-2xl border bg-card shadow-sm p-8 text-center space-y-4">
          <p className="text-lg font-semibold">Willkommen!</p>
          <p className="text-muted-foreground">Bitte schliessen Sie die Einrichtung ab.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">{employer.name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl border bg-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">Aktive Assistenzpersonen</span>
            <Users className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{assistantCount}</p>
          <Link to="/assistants" className="text-sm text-primary hover:underline">Verwalten →</Link>
        </div>

        <div className="p-5 rounded-xl border bg-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">Zeiteinträge</span>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">–</p>
          <p className="text-sm text-muted-foreground">Noch keine Einträge</p>
        </div>

        <div className="p-5 rounded-xl border bg-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">Letzter Rapport</span>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">–</p>
          <p className="text-sm text-muted-foreground">Noch kein Rapport erstellt</p>
        </div>
      </div>

      {assistants.length > 0 && (
        <div className="p-5 rounded-xl border bg-card">
          <h2 className="text-sm font-semibold mb-4">Assistenzpersonen</h2>
          <div className="space-y-3">
            {assistants.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-primary text-xs font-semibold">{a.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{a.name}</p>
                    {a.email && <p className="text-xs text-muted-foreground">{a.email}</p>}
                  </div>
                </div>
                {!!a.hourly_rate && (
                  <span className="text-sm text-muted-foreground">{formatCHF(a.hourly_rate)}/h</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <LohnbudgetRechner />
    </div>
  );
}
