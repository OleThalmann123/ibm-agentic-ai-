import { useState } from 'react';
import { supabase } from '@asklepios/backend';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  ArrowRight, ArrowLeft, HeartHandshake, User, CheckCircle2,
  ClipboardList, ShieldCheck, UserX, MapPin
} from 'lucide-react';

// Swiss PLZ → Canton mapping (simplified ranges for prototype)
const PLZ_CANTON_MAP: [number, number, string, string][] = [
  [1000, 1299, 'VD', 'Waadt'],
  [1300, 1399, 'VD', 'Waadt'],
  [1400, 1499, 'VD', 'Waadt'],
  [1500, 1599, 'FR', 'Freiburg'],
  [1600, 1699, 'FR', 'Freiburg'],
  [1700, 1799, 'FR', 'Freiburg'],
  [1800, 1899, 'VD', 'Waadt'],
  [1900, 1999, 'VS', 'Wallis'],
  [2000, 2099, 'NE', 'Neuenburg'],
  [2300, 2399, 'NE', 'Neuenburg'],
  [2500, 2599, 'BE', 'Bern'],
  [2800, 2899, 'JU', 'Jura'],
  [3000, 3199, 'BE', 'Bern'],
  [3200, 3299, 'FR', 'Freiburg'],
  [3300, 3399, 'BE', 'Bern'],
  [3400, 3499, 'BE', 'Bern'],
  [3500, 3599, 'BE', 'Bern'],
  [3600, 3699, 'BE', 'Bern'],
  [3700, 3999, 'BE', 'Bern'],
  [4000, 4099, 'BS', 'Basel-Stadt'],
  [4100, 4199, 'BL', 'Basel-Landschaft'],
  [4200, 4299, 'BL', 'Basel-Landschaft'],
  [4300, 4499, 'SO', 'Solothurn'],
  [4500, 4599, 'SO', 'Solothurn'],
  [4600, 4699, 'SO', 'Solothurn'],
  [4700, 4799, 'SO', 'Solothurn'],
  [4800, 4899, 'AG', 'Aargau'],
  [4900, 4999, 'BE', 'Bern'],
  [5000, 5099, 'AG', 'Aargau'],
  [5100, 5199, 'AG', 'Aargau'],
  [5200, 5299, 'AG', 'Aargau'],
  [5300, 5399, 'AG', 'Aargau'],
  [5400, 5499, 'AG', 'Aargau'],
  [5500, 5599, 'AG', 'Aargau'],
  [5600, 5699, 'AG', 'Aargau'],
  [5700, 5799, 'AG', 'Aargau'],
  [6000, 6099, 'LU', 'Luzern'],
  [6100, 6199, 'LU', 'Luzern'],
  [6200, 6299, 'LU', 'Luzern'],
  [6300, 6399, 'ZG', 'Zug'],
  [6400, 6499, 'SZ', 'Schwyz'],
  [6500, 6599, 'TI', 'Tessin'],
  [6600, 6699, 'TI', 'Tessin'],
  [6700, 6799, 'TI', 'Tessin'],
  [6800, 6899, 'TI', 'Tessin'],
  [6900, 6999, 'TI', 'Tessin'],
  [7000, 7099, 'GR', 'Graubünden'],
  [7100, 7199, 'GR', 'Graubünden'],
  [7200, 7299, 'GR', 'Graubünden'],
  [7300, 7399, 'GR', 'Graubünden'],
  [7400, 7499, 'GR', 'Graubünden'],
  [7500, 7599, 'GR', 'Graubünden'],
  [7700, 7799, 'GR', 'Graubünden'],
  [8000, 8099, 'ZH', 'Zürich'],
  [8100, 8199, 'ZH', 'Zürich'],
  [8200, 8299, 'ZH', 'Zürich'],
  [8300, 8399, 'ZH', 'Zürich'],
  [8400, 8499, 'ZH', 'Zürich'],
  [8500, 8599, 'TG', 'Thurgau'],
  [8600, 8699, 'ZH', 'Zürich'],
  [8700, 8799, 'SG', 'St. Gallen'],
  [8800, 8899, 'SZ', 'Schwyz'],
  [8900, 8999, 'AG', 'Aargau'],
  [9000, 9099, 'SG', 'St. Gallen'],
  [9100, 9199, 'AR', 'Appenzell AR'],
  [9200, 9299, 'SG', 'St. Gallen'],
  [9300, 9399, 'SG', 'St. Gallen'],
  [9400, 9499, 'SG', 'St. Gallen'],
  [9500, 9599, 'TG', 'Thurgau'],
  [9600, 9699, 'SG', 'St. Gallen'],
];

function getCantonFromPLZ(plz: string): { code: string; name: string } | null {
  const num = parseInt(plz.trim(), 10);
  if (isNaN(num)) return null;
  for (const [from, to, code, name] of PLZ_CANTON_MAP) {
    if (num >= from && num <= to) return { code, name };
  }
  return null;
}

// ─── Stable sub-components ───

const inputCls = "w-full px-4 py-3 rounded-lg border bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

function Field({ label, value, onChange, disabled, placeholder, type = 'text' }: {
  label: string; value: string; onChange?: (v: string) => void; disabled?: boolean; placeholder?: string; type?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-muted-foreground">{label}</label>
      <input type={type} value={value} onChange={e => onChange?.(e.target.value)}
        disabled={disabled} placeholder={placeholder}
        className={`${inputCls} ${disabled ? 'bg-muted/40 text-muted-foreground' : ''}`} />
    </div>
  );
}

function Radio({ active, onClick, label, icon: Icon }: { active: boolean; onClick: () => void; label: string; icon?: React.ComponentType<{className?: string}> }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left px-5 py-4 rounded-xl border-2 text-base font-medium transition-all
        ${active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
      <span className="flex items-center gap-3">
        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0
          ${active ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`}>
          {active && <span className="w-2 h-2 rounded-full bg-white" />}
        </span>
        {Icon && <Icon className="w-5 h-5 text-muted-foreground" />}
        {label}
      </span>
    </button>
  );
}

interface Props { onComplete: () => void; }
type RoleType = 'affected' | 'supporter' | null;

/*  Steps:
 *  0 = Role (affected / supporter)
 *  1 = Your contact data
 *  2 = Affected person data (supporter only, else skip)
 *  3 = Who tracks hours (employer / assistant)
 *     → if assistant: sub-question "approval required?"
 */

export function EmployerOnboarding({ onComplete }: Props) {
  const { user, refreshProfile } = useAuth();
  const [role, setRole] = useState<RoleType>(null);
  const [step, setStep] = useState(0);

  // Contact
  const [cFirst, setCFirst] = useState('');
  const [cLast, setCLast] = useState('');
  const [cStreet, setCStreet] = useState('');
  const [cZip, setCZip] = useState('');
  const [cCity, setCCity] = useState('');

  // Affected person
  const [aFirst, setAFirst] = useState('');
  const [aLast, setALast] = useState('');
  const [aStreet, setAStreet] = useState('');
  const [aZip, setAZip] = useState('');
  const [aCity, setACity] = useState('');
  const [aEmail, setAEmail] = useState('');

  // Setup
  const [tracker, setTracker] = useState('');
  const [approvalNeeded, setApprovalNeeded] = useState('');
  const [loading, setLoading] = useState(false);
  const [detectedCanton, setDetectedCanton] = useState<{ code: string; name: string } | null>(null);

  // Auto-detect canton when PLZ changes
  const handleZipChange = (zip: string) => {
    setCZip(zip);
    if (zip.length >= 4) {
      setDetectedCanton(getCantonFromPLZ(zip));
    } else {
      setDetectedCanton(null);
    }
  };

  const TOTAL_STEPS = 3;

  const next = () => {
    let n = step + 1;
    if (n === 2 && role === 'affected') n = 3;
    setStep(n);
  };
  const back = () => {
    let p = step - 1;
    if (p === 2 && role === 'affected') p = 1;
    setStep(p);
  };

  const canNext = () => {
    if (step === 1) return cFirst.trim() !== '' && cLast.trim() !== '';
    if (step === 2) return aFirst.trim() !== '' && aLast.trim() !== '';
    if (step === 3) return tracker !== '' && (tracker === 'employer' || approvalNeeded !== '');
    return false;
  };

  const isFinal = step === 3;
  const progress = Math.round((step / TOTAL_STEPS) * 100);

  const submit = async () => {
    if (!user || !canNext()) return;
    setLoading(true);

    const isSupporter = role === 'supporter';
    const name = isSupporter ? `${aFirst} ${aLast}`.trim() : `${cFirst} ${cLast}`.trim();

    const { data: emp, error: e1 } = await supabase
      .from('employer')
      .insert({
        name,
        canton: detectedCanton?.code || 'ZH',
        representation: isSupporter ? 'guardian' : 'self',
        iv_hours_day: 8, iv_hours_night: 0, iv_rate: 35.30,
        contact_data: {
          first_name: cFirst,
          last_name: cLast,
          street: cStreet,
          plz: cZip,
          city: cCity,
          ...(isSupporter ? {
            affected_first_name: aFirst,
            affected_last_name: aLast,
            affected_street: aStreet,
            affected_plz: aZip,
            affected_city: aCity,
          } : {})
        }
      })
      .select().single();

    if (e1) { toast.error('Fehler: ' + e1.message); setLoading(false); return; }

    const { error: e2 } = await supabase
      .from('employer_access')
      .insert({ employer_id: emp.id, user_id: user.id, role: 'admin_full', invited_email: user.email || '' });

    if (e2) { toast.error('Fehler: ' + e2.message); setLoading(false); return; }

    await supabase.from('assistant').insert([
      { employer_id: emp.id, name: 'Max Mustermann (Demo)', email: 'max@example.com', date_of_birth: '1990-01-15', hourly_rate: 35.30, vacation_weeks: 4, has_withholding_tax: false, has_bvg: false, is_active: true, time_entry_mode: tracker === 'employer' ? 'manual' : 'self' },
      { employer_id: emp.id, name: 'Anna Schmidt (Demo)', email: 'anna@example.com', date_of_birth: '1985-06-20', hourly_rate: 42.00, vacation_weeks: 5, has_withholding_tax: false, has_bvg: true, is_active: true, time_entry_mode: tracker === 'employer' ? 'manual' : 'self' },
    ]);

    toast.success('Einrichtung abgeschlossen!');
    await refreshProfile();
    setLoading(false);
    onComplete();
  };

  // ─── Steps ───
  const renderStep = () => {
    // 0: Role
    if (step === 0) return (
      <div className="space-y-5">
        <h3 className="text-xl font-bold text-center">Wer nutzt die App?</h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { r: 'affected' as const, icon: User, t: 'Betroffene Person', sub: 'Ich selbst' },
            { r: 'supporter' as const, icon: HeartHandshake, t: 'Unterstützende Person', sub: 'Für jemand anderen' },
          ].map(({ r, icon: Icon, t, sub }) => (
            <button key={r} type="button" onClick={() => { setRole(r); next(); }}
              className="p-6 rounded-xl border-2 border-transparent bg-muted/40 hover:border-primary/20 transition-all text-center">
              <Icon className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-base font-semibold">{t}</p>
              <p className="text-sm text-muted-foreground">{sub}</p>
            </button>
          ))}
        </div>
      </div>
    );

    // 1: Your data
    if (step === 1) return (
      <div className="space-y-4">
        <h3 className="text-xl font-bold flex items-center gap-2"><MapPin className="w-6 h-6 text-primary" />{role === 'affected' ? 'Ihre Angaben' : 'Ihre Kontaktdaten'}</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Vorname" value={cFirst} onChange={setCFirst} />
          <Field label="Nachname" value={cLast} onChange={setCLast} />
        </div>
        <Field label="Strasse & Nr." value={cStreet} onChange={setCStreet} />
        <div className="grid grid-cols-[120px_1fr] gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">PLZ</label>
            <div className="relative">
              <input type="text" value={cZip} onChange={e => handleZipChange(e.target.value)}
                placeholder="z.B. 8000" maxLength={4}
                className={inputCls} />
            </div>
          </div>
          <Field label="Ort" value={cCity} onChange={setCCity} />
        </div>
        {detectedCanton && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="text-sm"><span className="font-semibold">{detectedCanton.code}</span> - {detectedCanton.name}</span>
          </div>
        )}
        <Field label="E-Mail" value={user?.email ?? ''} disabled />
      </div>
    );

    // 2: Affected person (supporter only)
    if (step === 2) return (
      <div className="space-y-4">
        <h3 className="text-xl font-bold flex items-center gap-2"><User className="w-6 h-6 text-primary" />Betroffene Person</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Vorname" value={aFirst} onChange={setAFirst} />
          <Field label="Nachname" value={aLast} onChange={setALast} />
        </div>
        <Field label="Strasse & Nr." value={aStreet} onChange={setAStreet} />
        <div className="grid grid-cols-[120px_1fr] gap-4">
          <Field label="PLZ" value={aZip} onChange={setAZip} />
          <Field label="Ort" value={aCity} onChange={setACity} />
        </div>
        <Field label="E-Mail (optional)" value={aEmail} onChange={setAEmail} type="email" placeholder="name@beispiel.ch" />
      </div>
    );

    // 3: Who tracks hours
    if (step === 3) return (
      <div className="space-y-4">
        <h3 className="text-xl font-bold flex items-center gap-2"><ClipboardList className="w-6 h-6 text-primary" />Wer erfasst die Stunden?</h3>
        <Radio active={tracker === 'employer'} onClick={() => { setTracker('employer'); setApprovalNeeded(''); }} label="Ich selbst (Arbeitgeber)" icon={User} />
        <Radio active={tracker === 'assistant'} onClick={() => setTracker('assistant')} label="Die Assistenzperson" icon={UserX} />

        {tracker === 'assistant' && (
          <div className="ml-8 space-y-3 pt-2 border-l-2 border-primary/20 pl-5">
            <p className="text-base font-medium flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" />Müssen die Stunden genehmigt werden?</p>
            <Radio active={approvalNeeded === 'yes'} onClick={() => setApprovalNeeded('yes')} label="Ja, ich genehmige" />
            <Radio active={approvalNeeded === 'no'} onClick={() => setApprovalNeeded('no')} label="Nein, direkt übernehmen" />
          </div>
        )}
      </div>
    );

    return null;
  };

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="h-1.5 bg-muted">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="p-8">
        {renderStep()}

        {step > 0 && (
          <div className="flex items-center justify-between mt-6 pt-5 border-t">
            <button type="button" onClick={back}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-base text-muted-foreground hover:text-foreground transition">
              <ArrowLeft className="w-5 h-5" /> Zurück
            </button>

            {isFinal ? (
              <button type="button" onClick={submit} disabled={!canNext() || loading}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold bg-primary text-white disabled:opacity-40 transition">
                {loading ? <span className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white" />
                  : <><CheckCircle2 className="w-5 h-5" /> Abschliessen</>}
              </button>
            ) : (
              <button type="button" onClick={next} disabled={!canNext()}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold bg-primary text-white disabled:opacity-40 transition">
                Weiter <ArrowRight className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
