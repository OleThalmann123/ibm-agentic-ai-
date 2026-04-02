import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@asklepios/backend';
import { toast } from 'sonner';
import {
  Settings as SettingsIcon, User, Save, MapPin, CreditCard,
  Users, Moon, Shield, RotateCcw, HeartHandshake, Mail, Home
} from 'lucide-react';

// Swiss PLZ → Canton mapping
const PLZ_CANTON_MAP: [number, number, string, string][] = [
  [1000, 1299, 'VD', 'Waadt'], [1300, 1499, 'VD', 'Waadt'],
  [1500, 1799, 'FR', 'Freiburg'], [1800, 1899, 'VD', 'Waadt'],
  [1900, 1999, 'VS', 'Wallis'], [2000, 2099, 'NE', 'Neuenburg'],
  [2300, 2399, 'NE', 'Neuenburg'], [2500, 2599, 'BE', 'Bern'],
  [2800, 2899, 'JU', 'Jura'], [3000, 3999, 'BE', 'Bern'],
  [4000, 4099, 'BS', 'Basel-Stadt'], [4100, 4299, 'BL', 'Basel-Landschaft'],
  [4300, 4799, 'SO', 'Solothurn'], [4800, 4899, 'AG', 'Aargau'],
  [4900, 4999, 'BE', 'Bern'], [5000, 5799, 'AG', 'Aargau'],
  [6000, 6299, 'LU', 'Luzern'], [6300, 6399, 'ZG', 'Zug'],
  [6400, 6499, 'SZ', 'Schwyz'], [6500, 6999, 'TI', 'Tessin'],
  [7000, 7799, 'GR', 'Graubünden'], [8000, 8499, 'ZH', 'Zürich'],
  [8500, 8599, 'TG', 'Thurgau'], [8600, 8699, 'ZH', 'Zürich'],
  [8700, 8799, 'SG', 'St. Gallen'], [8800, 8899, 'SZ', 'Schwyz'],
  [8900, 8999, 'AG', 'Aargau'], [9000, 9099, 'SG', 'St. Gallen'],
  [9100, 9199, 'AR', 'Appenzell AR'], [9200, 9499, 'SG', 'St. Gallen'],
  [9500, 9599, 'TG', 'Thurgau'], [9600, 9699, 'SG', 'St. Gallen'],
];

function getCantonFromPLZ(plz: string): { code: string; name: string } | null {
  const num = parseInt(plz.trim(), 10);
  if (isNaN(num)) return null;
  for (const [from, to, code, name] of PLZ_CANTON_MAP) {
    if (num >= from && num <= to) return { code, name };
  }
  return null;
}

export function SettingsPage() {
  const { user, employer, employerAccess, refreshProfile } = useAuth();
  const [employerName, setEmployerName] = useState(employer?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Contact data fields
  const contact = (employer?.contact_data as Record<string, string>) || {};
  const [firstName, setFirstName] = useState(contact.first_name ?? '');
  const [lastName, setLastName] = useState(contact.last_name ?? '');
  const [street, setStreet] = useState(contact.street ?? '');
  const [plz, setPlz] = useState(contact.plz ?? '');
  const [city, setCity] = useState(contact.city ?? '');
  const [representation, setRepresentation] = useState(employer?.representation ?? 'self');

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
    if (employer) {
      setEmployerName(employer.name ?? '');
      setRepresentation(employer.representation ?? 'self');
      const c = (employer.contact_data as Record<string, string>) || {};
      setFirstName(c.first_name ?? '');
      setLastName(c.last_name ?? '');
      setStreet(c.street ?? '');
      setPlz(c.plz ?? '');
      setCity(c.city ?? '');
    }
  }, [employer]);

  const saveEmployer = async () => {
    if (!employer) return;
    setSaving(true);

    // Auto-detect canton from PLZ
    const detected = getCantonFromPLZ(plz);

    const { error } = await supabase
      .from('employer')
      .update({
        name: employerName,
        representation,
        canton: detected?.code || employer.canton,
        contact_data: {
          ...((employer.contact_data as object) || {}),
          first_name: firstName,
          last_name: lastName,
          street,
          plz,
          city,
        }
      })
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

  const EditableField = ({ label, value, onChange, placeholder, type = 'text' }: {
    label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
  }) => (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3.5 py-2.5 rounded-xl border bg-background text-sm font-medium
          focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
      />
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
    <div className="flex items-center justify-between py-3 px-4 border-b border-border/50 last:border-b-0 bg-background/50">
      <div className="flex items-center gap-3">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <span className="text-sm font-bold text-foreground">{value}</span>
    </div>
  );

  const detectedCanton = getCantonFromPLZ(plz);

  // Guard: don't render if employer was deleted (e.g. after reset)
  if (!employer || !employerAccess) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8' }}>
        <p>Lade...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
          <p className="text-muted-foreground text-sm mt-1">Konto- und Profil-Einstellungen verwalten</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column */}
        <div className="lg:col-span-5 space-y-6">
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

        {/* Right Column */}
        <div className="lg:col-span-7 space-y-6">
          {employer && (
            <SettingsCard
              icon={Home}
              iconColor="text-violet-600"
              iconBg="bg-violet-500/10"
              title="Kontaktdaten"
              description="Ihre Adresse und persönlichen Angaben"
            >
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Nutzungsart
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { val: 'self' as const, label: 'Betroffene Person', icon: User },
                    { val: 'guardian' as const, label: 'Unterstützende Person', icon: HeartHandshake },
                  ].map(({ val, label, icon: Icon }) => (
                    <button key={val} type="button" onClick={() => setRepresentation(val)}
                      className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all flex items-center gap-2
                        ${representation === val ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <EditableField label="Name (Versicherte Person)" value={employerName} onChange={setEmployerName} placeholder="Name eingeben" />

              <div className="grid grid-cols-2 gap-3">
                <EditableField label="Vorname" value={firstName} onChange={setFirstName} />
                <EditableField label="Nachname" value={lastName} onChange={setLastName} />
              </div>

              <EditableField label="Strasse & Nr." value={street} onChange={setStreet} placeholder="z.B. Bahnhofstrasse 12" />

              <div className="grid grid-cols-[120px_1fr] gap-3">
                <EditableField label="PLZ" value={plz} onChange={setPlz} placeholder="8000" />
                <EditableField label="Ort" value={city} onChange={setCity} placeholder="Zürich" />
              </div>

              {detectedCanton && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/5 border border-blue-500/10 text-blue-700">
                  <MapPin className="w-5 h-5" />
                  <span className="text-sm font-medium">Kanton: <span className="font-bold">{detectedCanton.code}</span> – {detectedCanton.name}</span>
                </div>
              )}

              <div className="rounded-xl border border-border/50 bg-muted/10 overflow-hidden shadow-sm">
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
        </div>
      </div>
    </div>
  );
}
