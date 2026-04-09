import { useState } from 'react';
import { supabase } from '@asklepios/backend';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  ArrowRight, ArrowLeft, HeartHandshake, User, CheckCircle2,
  ClipboardList, ShieldCheck, UserX, MapPin
} from 'lucide-react';
import { getCantonFromPLZ, getCityFromChPlz, normalizeChPlz } from '@/utils/chPlz';

function getCityFromPLZ(plz: string): string | null {
  return getCityFromChPlz(plz);
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

function Radio({ active, onClick, label, icon: Icon, disabled }: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ComponentType<{className?: string}>;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`w-full text-left px-5 py-4 rounded-xl border-2 text-base font-medium transition-all
        ${disabled ? 'opacity-50 cursor-not-allowed bg-muted/30 border-border' : ''}
        ${!disabled && active ? 'border-primary bg-primary/5' : ''}
        ${!disabled && !active ? 'border-border hover:border-primary/30' : ''}`}
    >
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
  const [cCityAutofill, setCCityAutofill] = useState(false);
  const [cPhone, setCPhone] = useState('');

  // Affected person
  const [aFirst, setAFirst] = useState('');
  const [aLast, setALast] = useState('');
  const [aStreet, setAStreet] = useState('');
  const [aZip, setAZip] = useState('');
  const [aCity, setACity] = useState('');
  const [aCityAutofill, setACityAutofill] = useState(false);
  const [aEmail, setAEmail] = useState('');
  const [insuredAhvNumber, setInsuredAhvNumber] = useState('');

  // IV invoice / billing (stored in employer.contact_data)
  const [billingIban, setBillingIban] = useState('');
  const [billingAccountHolderName, setBillingAccountHolderName] = useState('');
  const [billingAccountHolderStreet, setBillingAccountHolderStreet] = useState('');
  const [billingAccountHolderPlz, setBillingAccountHolderPlz] = useState('');
  const [billingAccountHolderCity, setBillingAccountHolderCity] = useState('');
  const [billingReferenceNumber, setBillingReferenceNumber] = useState('');

  // Setup
  const [tracker, setTracker] = useState('');
  const [approvalNeeded, setApprovalNeeded] = useState('');
  const [activitiesInDayShifts, setActivitiesInDayShifts] = useState<'yes' | 'no' | ''>('');
  const [loading, setLoading] = useState(false);
  const [detectedCanton, setDetectedCanton] = useState<{ code: string; name: string } | null>(null);

  // Auto-detect canton when PLZ changes
  const handleZipChange = (zip: string) => {
    const normalized = normalizeChPlz(zip);
    setCZip(normalized);
    if (normalized.length >= 4) {
      setDetectedCanton(getCantonFromPLZ(normalized));
      const city = getCityFromPLZ(normalized);
      if (city && (!cCity || cCityAutofill)) {
        setCCity(city);
        setCCityAutofill(true);
      }
    } else {
      setDetectedCanton(null);
    }
  };

  const handleAffectedZipChange = (zip: string) => {
    const normalized = normalizeChPlz(zip);
    setAZip(normalized);
    const city = getCityFromPLZ(normalized);
    if (city && (!aCity || aCityAutofill)) {
      setACity(city);
      setACityAutofill(true);
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
    if (step === 3) return tracker !== '' && (tracker === 'employer' || (approvalNeeded !== '' && activitiesInDayShifts !== ''));
    return false;
  };

  const isFinal = step === 3;
  const progress = Math.round((step / TOTAL_STEPS) * 100);

  const submit = async () => {
    if (!user || !canNext()) return;
    setLoading(true);

    const isSupporter = role === 'supporter';
    const name = isSupporter ? `${aFirst} ${aLast}`.trim() : `${cFirst} ${cLast}`.trim();
    const timeEntryRequiresActivityBreakdown = tracker === 'assistant' ? activitiesInDayShifts === 'yes' : false;

    const { data: emp, error: e1 } = await supabase
      .from('employer')
      .insert({
        name,
        canton: detectedCanton?.code || 'ZH',
        representation: isSupporter ? 'guardian' : 'self',
        iv_hours_day: 8, iv_hours_night: 0, iv_rate: 35.3,
        contact_data: {
          first_name: cFirst,
          last_name: cLast,
          street: cStreet,
          plz: cZip,
          city: cCity,
          phone: cPhone,
          insured_ahv_number: insuredAhvNumber.trim() || null,
          billing_iban: billingIban.trim() || null,
          billing_reference_number: billingReferenceNumber.trim() || null,
          billing_account_holder_name: billingAccountHolderName.trim() || null,
          billing_account_holder_street: billingAccountHolderStreet.trim() || null,
          billing_account_holder_plz: billingAccountHolderPlz.trim() || null,
          billing_account_holder_city: billingAccountHolderCity.trim() || null,
          payment_terms_days: 30,
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
      {
        employer_id: emp.id,
        name: 'Max Mustermann (Demo)',
        email: 'max@example.com',
        date_of_birth: '1990-01-15',
        hourly_rate: 35.3,
        vacation_weeks: 4,
        has_bvg: false,
        is_active: true,
        time_entry_mode: tracker === 'employer' ? 'manual' : 'self',
        contract_data: { time_entry_requires_activity_breakdown: timeEntryRequiresActivityBreakdown },
      },
      {
        employer_id: emp.id,
        name: 'Anna Schmidt (Demo)',
        email: 'anna@example.com',
        date_of_birth: '1985-06-20',
        hourly_rate: 42.00,
        vacation_weeks: 5,
        has_bvg: true,
        is_active: true,
        time_entry_mode: tracker === 'employer' ? 'manual' : 'self',
        contract_data: { time_entry_requires_activity_breakdown: timeEntryRequiresActivityBreakdown },
      },
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
          <Field
            label="Ort"
            value={cCity}
            onChange={(v) => {
              setCCity(v);
              setCCityAutofill(false);
            }}
          />
        </div>
        {detectedCanton && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="text-sm"><span className="font-semibold">{detectedCanton.code}</span> - {detectedCanton.name}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="E-Mail" value={user?.email ?? ''} disabled />
          <Field label="Telefon (für Rückfragen)" value={cPhone} onChange={setCPhone} placeholder="+41 ..." />
        </div>

        <Field label="AHV-Nummer (versicherte Person)" value={insuredAhvNumber} onChange={setInsuredAhvNumber} placeholder="756.xxxx.xxxx.xx" />

        <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
          <p className="text-sm font-semibold">IV-Abrechnung (Ansatz & Auszahlung)</p>
          <Field label="IV-Ansatz (CHF/Std)" value="35.30" disabled />
          <Field label="IBAN (Auszahlung)" value={billingIban} onChange={setBillingIban} placeholder="CH.." />
          <Field label="Mitteilungs-/Verfügungsnummer (optional)" value={billingReferenceNumber} onChange={setBillingReferenceNumber} placeholder="…" />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Kontoinhaber:in" value={billingAccountHolderName} onChange={setBillingAccountHolderName} placeholder="Vorname Name" />
            <Field label="Adresse Kontoinhaber:in" value={billingAccountHolderStreet} onChange={setBillingAccountHolderStreet} placeholder="Strasse Nr." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="PLZ" value={billingAccountHolderPlz} onChange={setBillingAccountHolderPlz} placeholder="8000" />
            <Field label="Ort" value={billingAccountHolderCity} onChange={setBillingAccountHolderCity} placeholder="Zürich" />
          </div>
          <p className="text-xs text-muted-foreground">
            Diese Angaben werden für das IV-Deckblatt / die monatliche Rechnung verwendet.
          </p>
        </div>
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
          <Field label="PLZ" value={aZip} onChange={handleAffectedZipChange} />
          <Field
            label="Ort"
            value={aCity}
            onChange={(v) => {
              setACity(v);
              setACityAutofill(false);
            }}
          />
        </div>
        <Field label="E-Mail (optional)" value={aEmail} onChange={setAEmail} type="email" placeholder="name@beispiel.ch" />
      </div>
    );

    // 3: Who tracks hours
    if (step === 3) return (
      <div className="space-y-3">
        <h3 className="text-xl font-bold flex items-center gap-2"><ClipboardList className="w-6 h-6 text-primary" />Wer erfasst die Stunden?</h3>
        <Radio
          active={tracker === 'employer'}
          onClick={() => { setTracker('employer'); setApprovalNeeded(''); setActivitiesInDayShifts(''); }}
          label={role === 'affected' ? 'Ich selbst (Betroffene Person) – MVP 1: out of scope' : 'Ich selbst (Arbeitgeber)'}
          icon={User}
          disabled={role === 'affected'}
        />
        {role === 'affected' && (
          <p className="text-sm text-muted-foreground -mt-2">
            In <span className="font-medium">MVP 1</span> wird die Zeiterfassung durch die betroffene Person selbst noch nicht unterstützt.
            Bitte wählen Sie dafür „Die Assistenzperson“.
          </p>
        )}
        <Radio active={tracker === 'assistant'} onClick={() => setTracker('assistant')} label="Die Assistenzperson" icon={UserX} />

        {tracker === 'assistant' && (
          <div className="ml-6 space-y-3 pt-2 border-l-2 border-primary/20 pl-4">
            <p className="text-base font-medium flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" />Müssen die Stunden genehmigt werden?</p>
            <div className="grid grid-cols-2 gap-3">
              <Radio active={approvalNeeded === 'yes'} onClick={() => setApprovalNeeded('yes')} label="Ja, ich genehmige" />
              <Radio active={approvalNeeded === 'no'} onClick={() => setApprovalNeeded('no')} label="Nein, direkt übernehmen" />
            </div>

            <div className="pt-3">
              <p className="text-base font-medium">Soll die Assistenzperson bei Tagdiensten zusätzlich Tätigkeiten erfassen?</p>
              <p className="text-sm text-muted-foreground mt-1">
                Wenn Sie <span className="font-medium">Ja</span> wählen, erscheint bei <span className="font-medium">Tagdiensten</span> beim Erfassen der Stunden
                ein zusätzliches Feld „Tätigkeitsbereich“. Bei Nachtdiensten wird dieses Feld nicht angezeigt.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Radio active={activitiesInDayShifts === 'yes'} onClick={() => setActivitiesInDayShifts('yes')} label="Ja, Tätigkeiten mit erfassen" />
                <Radio active={activitiesInDayShifts === 'no'} onClick={() => setActivitiesInDayShifts('no')} label="Nein, nur Zeiten erfassen" />
              </div>
            </div>
          </div>
        )}
      </div>
    );

    return null;
  };

  return (
    <div className="w-full max-w-3xl mx-auto rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="h-1.5 bg-muted">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="p-6">
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
