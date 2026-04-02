import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@asklepios/backend';
import { toast } from 'sonner';
import {
  Settings as SettingsIcon, User, Save, MapPin, CreditCard,
  Users, Moon, ClipboardCheck, ChevronRight, Shield, RotateCcw
} from 'lucide-react';

export function SettingsPage() {
  const { user, employer, employerAccess, refreshProfile } = useAuth();
  const [employerName, setEmployerName] = useState(employer?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const resetOnboarding = async () => {
    if (!employer || !employerAccess) return;
    if (!confirm('Onboarding wirklich zurücksetzen? Alle Daten (Assistenzpersonen, Einstellungen) werden gelöscht.')) return;
    setResetting(true);

    try {
      // 1. Get all assistant IDs for this employer
      const { data: assistants, error: getAssErr } = await supabase
        .from('assistant')
        .select('id')
        .eq('employer_id', employer.id);
      if (getAssErr) console.error("get assistants err", getAssErr);
      const assistantIds = (assistants || []).map(a => a.id);

      // 2. Delete dependent tables first (FK constraints)
      if (assistantIds.length > 0) {
        const { error: e1 } = await supabase.from('time_entry').delete().in('assistant_id', assistantIds).select();
        if (e1) console.error("time_entry err", e1);
        const { error: e2 } = await supabase.from('payroll').delete().in('assistant_id', assistantIds).select();
        if (e2) console.error("payroll err", e2);
        const { error: e3 } = await supabase.from('weekly_schedule').delete().in('assistant_id', assistantIds).select();
        if (e3) console.error("schedule err", e3);
      }

      // 3. Delete assistants
      const { error: asstErr } = await supabase.from('assistant').delete().eq('employer_id', employer.id).select();
      if (asstErr) console.error("assistant del err", asstErr);

      // 4. Delete employer_access
      const { error: accessError } = await supabase.from('employer_access').delete().eq('id', employerAccess.id).select();
      if (accessError) console.error('Failed to delete employer_access:', accessError);

      // 5. Delete employer (might fail due to RLS, but orphan is fine for a reset)
      const { error: empErr } = await supabase.from('employer').delete().eq('id', employer.id).select();
      if (empErr) console.error("employer del err", empErr);

      // SIGN OUT IMMEDIATELY to invalidate session, then redirect
      toast.success('Onboarding zurückgesetzt – Sie werden abgemeldet...');
      await supabase.auth.signOut();
      
      // Force reload the app so the auth state clears reliably
      setTimeout(() => { window.location.replace('/login'); }, 500);
    } catch (e) {
      console.error('Reset error:', e);
      toast.error('Unerwarteter Fehler beim Zurücksetzen');
      setResetting(false);
    }
  };

  useEffect(() => {
    if (employer) setEmployerName(employer.name ?? '');
  }, [employer]);

  const saveEmployer = async () => {
    if (!employer) return;
    setSaving(true);
    const { error } = await supabase
      .from('employer')
      .update({ name: employerName })
      .eq('id', employer.id);
    if (error) {
      toast.error('Fehler beim Speichern: ' + error.message);
    } else {
      toast.success('Einstellungen gespeichert');
      await refreshProfile();
    }
    setSaving(false);
  };

  const SettingsCard = ({
    icon: Icon,
    iconColor = 'text-primary',
    iconBg = 'bg-primary/10',
    title,
    description,
    children,
  }: {
    icon: typeof User;
    iconColor?: string;
    iconBg?: string;
    title: string;
    description?: string;
    children: React.ReactNode;
  }) => (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b bg-muted/20">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
            <Icon className={`w-4.5 h-4.5 ${iconColor}`} />
          </div>
          <div>
            <h2 className="font-semibold text-sm">{title}</h2>
            {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
          </div>
        </div>
      </div>
      <div className="px-6 py-5 space-y-4">
        {children}
      </div>
    </div>
  );

  const ReadOnlyField = ({ label, value }: { label: string; value: string }) => (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <div className="px-3.5 py-2.5 rounded-xl border bg-muted/40 text-sm text-muted-foreground font-medium">
        {value || '–'}
      </div>
    </div>
  );

  const InfoRow = ({
    icon: Icon,
    label,
    value,
    iconColor = 'text-muted-foreground',
  }: {
    icon: typeof User;
    label: string;
    value: string;
    iconColor?: string;
  }) => (
    <div className="flex items-center justify-between py-3 px-1 border-b last:border-b-0">
      <div className="flex items-center gap-3">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
          <p className="text-muted-foreground text-sm mt-1">Konto- und Profil-Einstellungen verwalten</p>
        </div>
      </div>

      {/* Account Card */}
      <SettingsCard
        icon={Shield}
        iconColor="text-blue-600"
        iconBg="bg-blue-500/10"
        title="Konto"
        description="Ihre Anmeldedaten und Zugriffsrechte"
      >
        <ReadOnlyField label="E-Mail" value={user?.email ?? ''} />
        <ReadOnlyField
          label="Rolle"
          value={employerAccess?.role === 'admin_full' ? 'Administrator (Vollzugriff)' : 'Administrator (Eingeschränkt)'}
        />
      </SettingsCard>

      {/* Employer Details Card */}
      {employer && (
        <SettingsCard
          icon={User}
          iconColor="text-violet-600"
          iconBg="bg-violet-500/10"
          title="Versicherte Person"
          description="Stammdaten der betroffenen Person"
        >
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={employerName}
              onChange={e => setEmployerName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border bg-background text-sm font-medium
                focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          <div className="rounded-xl border bg-muted/20 overflow-hidden">
            <InfoRow icon={MapPin} label="Kanton" value={employer.canton ?? '–'} iconColor="text-emerald-500" />
            <InfoRow icon={CreditCard} label="IV-Ansatz" value={employer.iv_rate ? `CHF ${employer.iv_rate}` : '–'} iconColor="text-amber-500" />
            <InfoRow icon={Moon} label="Stunden Tag" value={employer.iv_hours_day ? `${employer.iv_hours_day}h` : '–'} iconColor="text-blue-500" />
            <InfoRow icon={Moon} label="Stunden Nacht" value={employer.iv_hours_night ? `${employer.iv_hours_night}h` : '–'} iconColor="text-indigo-500" />
          </div>

          <button
            onClick={saveEmployer}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50
              bg-gradient-to-r from-primary to-[hsl(240_70%_55%)] text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:translate-y-[-1px]"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
            ) : (
              <>
                <Save className="w-4 h-4" />
                Speichern
              </>
            )}
          </button>
        </SettingsCard>
      )}

      {/* Danger Zone */}
      <SettingsCard
        icon={RotateCcw}
        iconColor="text-red-600"
        iconBg="bg-red-500/10"
        title="Entwickler-Optionen"
        description="Onboarding erneut durchlaufen (löscht aktuelle Daten)"
      >
        <button
          onClick={resetOnboarding}
          disabled={resetting}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50
            bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-200"
        >
          {resetting ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-red-400/30 border-t-red-500" />
          ) : (
            <>
              <RotateCcw className="w-4 h-4" />
              Onboarding zurücksetzen
            </>
          )}
        </button>
      </SettingsCard>
    </div>
  );
}
