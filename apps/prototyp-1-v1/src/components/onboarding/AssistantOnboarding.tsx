import { useState } from 'react';
import { supabase } from '@asklepios/backend';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { UploadCloud, CheckCircle2, FileText, ArrowRight, AlertCircle, HelpCircle, User, ArrowLeft, Loader2, Share2, Copy, Check } from 'lucide-react';
import { extractContractData, extractContractFromImages, reviewMessage, type ExtractionField, type ExtractionResult } from '@asklepios/backend';
import { readFileContent } from '@asklepios/backend';

// Swiss PLZ → City mapping (minimal prototype set)
const PLZ_CITY_MAP: Record<string, string> = {
  '3000': 'Bern',
  '8000': 'Zürich',
  '4000': 'Basel',
  '6000': 'Luzern',
  '9000': 'St. Gallen',
  '1200': 'Genève',
};

function getCityFromPLZ(plz: string): string | null {
  const zip = plz.trim();
  if (zip.length !== 4) return null;
  return PLZ_CITY_MAP[zip] ?? null;
}

function parseLooseNumber(input: string): number | null {
  const s = input.trim().replace('%', '').replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function holidayPctToUiPercentString(value: unknown): string {
  if (value === null || value === undefined) return '';
  const n = typeof value === 'number' ? value : parseLooseNumber(String(value));
  if (n === null) return String(value).trim();
  const pct = n <= 1 ? n * 100 : n;
  return String(Number(pct.toFixed(2)));
}

function uiPercentStringToHolidayFractionString(value: string): string {
  const n = parseLooseNumber(value);
  if (n === null) return value.trim();
  const fraction = n / 100;
  return String(Number(fraction.toFixed(4)));
}

interface AssistantOnboardingProps {
  onComplete: () => void;
  onClose: () => void;
}

function MiniField({ 
  status, 
  title, 
  message, 
  children,
  className = "" 
}: { 
  status: 'success' | 'warning' | 'error', 
  title: string, 
  message?: string, 
  children: React.ReactNode,
  className?: string
}) {
  const styles = {
    success: {
      wrapper: "border-emerald-200 bg-white",
      text: "text-emerald-700",
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
    },
    warning: {
      wrapper: "border-amber-200 bg-amber-50/60",
      text: "text-amber-700",
      icon: <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
    },
    error: {
      wrapper: "border-red-200 bg-red-50/60",
      text: "text-red-700",
      icon: <AlertCircle className="w-3.5 h-3.5 text-red-500" />
    }
  }[status];

  return (
    <div className={`p-3 rounded-xl border ${styles.wrapper} transition-colors flex flex-col shadow-sm ${className}`}>
      <div className="flex items-center gap-1.5 mb-2">
        {styles.icon}
        <span className={`text-[10px] font-bold uppercase tracking-widest ${styles.text}`}>{title}</span>
      </div>
      <div className="w-full">{children}</div>
      {message && (
        <p className={`text-[10px] font-semibold mt-1.5 ${styles.text}`}>{message}</p>
      )}
    </div>
  );
}

// readFileContent from pdf-extractor handles PDF, images, and text files

export function AssistantOnboarding({ onComplete, onClose }: AssistantOnboardingProps) {
  const { employerAccess } = useAuth();
  
  const [step, setStep] = useState<'upload' | 'extracting' | 'review' | 'success'>('upload');
  const [tab, setTab] = useState<'stammdaten' | 'abrechnungsdaten'>('stammdaten');
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [savedAssistantId, setSavedAssistantId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Editable fields — populated from extraction or manually
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [street, setStreet] = useState('');
  const [plz, setPlz] = useState('');
  const [city, setCity] = useState('');
  const [cityAutofill, setCityAutofill] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const [ahvNumber, setAhvNumber] = useState('');
  const [civilStatus, setCivilStatus] = useState('');
  const [residencePermit, setResidencePermit] = useState('');
  const [email, setEmail] = useState('');

  const [contractStart, setContractStart] = useState('');
  const [contractEnd, setContractEnd] = useState('');
  const [hoursPerWeek, setHoursPerWeek] = useState('');
  const [hoursPerMonth, setHoursPerMonth] = useState('');
  const [wageType, setWageType] = useState('hourly');
  const [hourlyRate, setHourlyRate] = useState('');
  const [vacationWeeks, setVacationWeeks] = useState('4');
  const [vacationSurcharge, setVacationSurcharge] = useState('');
  const [iban, setIban] = useState('');
  const [billingMethod, setBillingMethod] = useState('simplified');
  const [canton, setCanton] = useState('');
  const [nbuEmployer, setNbuEmployer] = useState('');
  const [nbuEmployee, setNbuEmployee] = useState('');
  
  const [saving, setSaving] = useState(false);

  // Confidence maps — tracks what the AI was sure about
  const [confidenceMap, setConfidenceMap] = useState<Record<string, ExtractionField>>({});

  const populateFromExtraction = (result: ExtractionResult) => {
    const a = result.contracts.assistant;
    const ct = result.contracts.contract_terms;
    const w = result.contracts.wage;
    const si = result.contracts.social_insurance;

    // Build confidence map
    const cMap: Record<string, ExtractionField> = {};
    const setField = (key: string, field: ExtractionField | undefined, setter: (v: string) => void) => {
      if (!field) return;
      cMap[key] = field;
      if (field.value !== null && field.value !== undefined) {
        setter(String(field.value));
      }
    };

    setField('firstName', a.first_name, setFirstName);
    setField('lastName', a.last_name, setLastName);
    setField('street', a.street, setStreet);
    setField('plz', a.zip, setPlz);
    setField('city', a.city, setCity);
    setField('birthDate', a.birth_date, setBirthDate);
    setField('ahvNumber', a.ahv_number, setAhvNumber);
    setField('civilStatus', a.civil_status, setCivilStatus);
    setField('residencePermit', a.residence_permit, setResidencePermit);

    if (ct) {
      setField('contractStart', ct.start_date, setContractStart);
      setField('contractEnd', ct.end_date, setContractEnd);
      setField('hoursPerWeek', ct.hours_per_week, setHoursPerWeek);
    }

    if (w) {
      setField('wageType', w.wage_type, setWageType);
      setField('hourlyRate', w.hourly_rate, setHourlyRate);
      setField('vacationWeeks', w.vacation_weeks, setVacationWeeks);
      // UI arbeitet mit Prozentwerten, Extraktion liefert typischerweise Dezimalwerte.
      if (w.holiday_supplement_pct) cMap.vacationSurcharge = w.holiday_supplement_pct;
      setVacationSurcharge(holidayPctToUiPercentString(w.holiday_supplement_pct?.value));
      setField('iban', w.payment_iban, setIban);
    }

    if (si) {
      setField('billingMethod', si.accounting_method, setBillingMethod);
      setField('canton', si.canton, setCanton);
      setField('nbuEmployer', si.nbu_employer_pct, setNbuEmployer);
      setField('nbuEmployee', si.nbu_employee_pct, setNbuEmployee);
    }

    setConfidenceMap(cMap);
  };

  // Demo mode removed: contracts are always evaluated live from upload.

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    
    setStep('extracting');
    setExtractionError(null);

    try {
      // Smart file reading: PDF → pdfjs text extraction, images → base64 for vision
      const { text, images } = await readFileContent(file);
      
      let result: ExtractionResult;
      if (images && images.length > 0) {
        // Scanned PDF or image → use vision-capable model
        toast.info('Bild-basiertes Dokument erkannt — verwende Vision-Analyse...');
        result = await extractContractFromImages(images);
      } else if (text && text.trim().length >= 20) {
        // Text-based PDF or plain text → use text model
        result = await extractContractData(text);
      } else {
        throw new Error('Datei scheint leer zu sein. Bitte eine andere Datei versuchen.');
      }
      
      setExtraction(result);
      populateFromExtraction(result);
      setStep('review');
      setTab('stammdaten');
      
      const meta = result.extraction_metadata;
      toast.success(`${meta.fields_extracted} Felder extrahiert (Konfidenz: ${Math.round(meta.overall_confidence * 100)}%)`);
      
      if (meta.warnings.length > 0) {
        toast.warning(`Hinweise: ${meta.warnings.join(', ')}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setExtractionError(msg);
      toast.error('Extraktion fehlgeschlagen: ' + msg);
      setStep('upload');
    }
  };

  const handlePasteText = async () => {
    const text = await navigator.clipboard.readText().catch(() => '');
    if (!text.trim()) {
      toast.error('Kein Text in der Zwischenablage');
      return;
    }

    setStep('extracting');
    setExtractionError(null);

    try {
      const result = await extractContractData(text);
      setExtraction(result);
      populateFromExtraction(result);
      setStep('review');
      setTab('stammdaten');
      
      const meta = result.extraction_metadata;
      toast.success(`${meta.fields_extracted} Felder extrahiert (Konfidenz: ${Math.round(meta.overall_confidence * 100)}%)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setExtractionError(msg);
      toast.error('Extraktion fehlgeschlagen: ' + msg);
      setStep('upload');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employerAccess?.employer_id) return;
    
    setSaving(true);
    const fullName = `${firstName} ${lastName}`.trim();
    
    const { error } = await supabase.from('assistant').insert({
      employer_id: employerAccess.employer_id,
      name: fullName || 'Unbenannt',
      email: email.trim() || null,
      date_of_birth: birthDate.trim() || null,
      hourly_rate: parseFloat(hourlyRate) || null,
      vacation_weeks: parseInt(vacationWeeks, 10) || null,
      has_bvg: false,
      time_entry_mode: 'manual' as const,
      is_active: true,
      contract_data: {
        first_name: firstName, last_name: lastName,
        street, plz, city, ahv_number: ahvNumber,
        civil_status: civilStatus, residence_permit: residencePermit,
        contract_start: contractStart, contract_end: contractEnd,
        hours_per_week: hoursPerWeek, hours_per_month: hoursPerMonth,
        wage_type: wageType,
        vacation_surcharge: uiPercentStringToHolidayFractionString(vacationSurcharge),
        iban, billing_method: billingMethod,
        canton, nbu_employer: nbuEmployer, nbu_employee: nbuEmployee,
        extraction_metadata: extraction?.extraction_metadata ?? null,
      }
    });

    setSaving(false);
    if (error) {
      toast.error('Fehler beim Anlegen: ' + error.message);
    } else {
      // Get the inserted assistant ID for link generation
      const { data: newAssistant } = await supabase
        .from('assistant')
        .select('id')
        .eq('employer_id', employerAccess.employer_id)
        .eq('name', fullName || 'Unbenannt')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (newAssistant) {
        setSavedAssistantId(newAssistant.id);
      }
      
      // Show confetti + success screen
      setShowConfetti(true);
      setStep('success');
      setTimeout(() => setShowConfetti(false), 3000);
    }
  };

  // Get field status from confidence map, fallback to value check
  const getStatus = (key: string, value: string): 'success' | 'warning' | 'error' => {
    const f = confidenceMap[key];
    if (!f) return value ? 'success' : 'error';
    if (f.value === null || f.value === undefined || String(f.value).trim() === '') return 'error';
    return f.status === 'ok' ? 'success' : 'warning';
  };

  const getMessage = (key: string, value: string): string | undefined => {
    const f = confidenceMap[key];
    if (f) return reviewMessage(f);
    return value ? undefined : 'Bitte ergänzen';
  };

  const inputStyle = "w-full px-3 py-2 rounded-lg border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors";
  const selectStyle = "w-full px-3 py-2 rounded-lg border bg-white text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Zurück zur Übersicht
        </button>
        <h1 className="text-2xl font-bold">Assistenzperson erfassen</h1>
        <p className="text-muted-foreground">
          Laden Sie einen Arbeitsvertrag hoch — unser KI-Agent liest die Stammdaten automatisch aus.
        </p>
      </div>

      {/* Upload */}
      {step === 'upload' && (
        <div className="bg-card rounded-2xl border p-10">
          <div className="text-center max-w-lg mx-auto">
            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-5">
              <UploadCloud className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-lg font-bold mb-1.5">Arbeitsvertrag hochladen</h3>
            <p className="text-muted-foreground text-sm mb-6">
              Laden Sie ein JPG, PNG, PDF oder Word-Dokument hoch, oder fügen Sie den Vertragstext ein.
            </p>

            {extractionError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
                {extractionError}
              </div>
            )}

            <div className="flex flex-col items-center gap-3">
              <label className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-foreground text-background font-bold text-sm hover:bg-foreground/90 transition-colors cursor-pointer">
                <input 
                  type="file" 
                  accept=".pdf,.doc,.docx,.txt,image/*,application/pdf"
                  onChange={handleUpload}
                  className="hidden"
                />
                Datei auswählen
              </label>

              <button 
                type="button" 
                onClick={handlePasteText}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" /> Vertragstext aus Zwischenablage einfügen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extracting */}
      {step === 'extracting' && (
        <div className="bg-card rounded-2xl border p-10">
          <div className="text-center py-12">
            <Loader2 className="w-14 h-14 text-primary mx-auto mb-5 animate-spin" />
            <h3 className="text-lg font-bold mb-1">KI analysiert den Vertrag...</h3>
            <p className="text-muted-foreground text-sm">
              Stammdaten und Abrechnungsdaten werden via OpenRouter extrahiert
            </p>
          </div>
        </div>
      )}

      {/* Review */}
      {step === 'review' && (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Metadata badge */}
          {extraction && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                extraction.extraction_metadata.overall_confidence >= 0.8 ? 'bg-emerald-100 text-emerald-700' :
                extraction.extraction_metadata.overall_confidence >= 0.5 ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
              }`}>
                Gesamtkonfidenz: {Math.round(extraction.extraction_metadata.overall_confidence * 100)}%
              </span>
              <span className="text-xs text-muted-foreground">
                {extraction.extraction_metadata.fields_extracted} extrahiert · {extraction.extraction_metadata.fields_missing} fehlend
              </span>
              {extraction.extraction_metadata.warnings.map((w, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {w}
                </span>
              ))}
            </div>
          )}

          {/* Tab switcher */}
          <div className="flex justify-center">
            <div className="inline-flex rounded-full bg-muted/50 p-1">
              <button 
                type="button"
                onClick={() => setTab('stammdaten')}
                className={`px-5 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${tab === 'stammdaten' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <User className="w-4 h-4 opacity-50" /> Stammdaten
              </button>
              <button 
                type="button"
                onClick={() => setTab('abrechnungsdaten')}
                className={`px-5 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${tab === 'abrechnungsdaten' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <FileText className="w-4 h-4 opacity-50" /> Abrechnungsdaten
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="bg-card rounded-2xl border p-8">
            {tab === 'stammdaten' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <h4 className="text-sm font-bold">Assistenzperson</h4>
                
                <div className="grid grid-cols-4 gap-4">
                  <MiniField status={getStatus('firstName', firstName)} title="Vorname" message={getMessage('firstName', firstName)}>
                    <input type="text" placeholder="Bitte ergänzen..." value={firstName} onChange={e => setFirstName(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField status={getStatus('lastName', lastName)} title="Nachname" message={getMessage('lastName', lastName)}>
                    <input type="text" placeholder="Bitte ergänzen..." value={lastName} onChange={e => setLastName(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField status={getStatus('street', street)} title="Strasse" message={getMessage('street', street)}>
                    <input type="text" placeholder="Bitte ergänzen..." value={street} onChange={e => setStreet(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField status={getStatus('plz', plz)} title="PLZ" message={getMessage('plz', plz)}>
                    <input
                      type="text"
                      placeholder="z.B. 3000"
                      maxLength={4}
                      value={plz}
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setPlz(v);
                        const inferred = getCityFromPLZ(v);
                        if (inferred && (!city || cityAutofill)) {
                          setCity(inferred);
                          setCityAutofill(true);
                        }
                      }}
                      className={inputStyle}
                    />
                  </MiniField>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <MiniField status={getStatus('city', city)} title="Ort" message={getMessage('city', city)}>
                    <input
                      type="text"
                      placeholder="Bitte ergänzen..."
                      value={city}
                      onChange={e => {
                        setCity(e.target.value);
                        setCityAutofill(false);
                      }}
                      className={inputStyle}
                    />
                  </MiniField>
                  <MiniField status={getStatus('birthDate', birthDate)} title="Geburtsdatum" message={getMessage('birthDate', birthDate)}>
                    <input type="text" placeholder="YYYY-MM-DD" value={birthDate} onChange={e => setBirthDate(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField status={getStatus('ahvNumber', ahvNumber)} title="AHV-Nummer" message={getMessage('ahvNumber', ahvNumber)}>
                    <input type="text" placeholder="756.xxxx.xxxx.xx" value={ahvNumber} onChange={e => setAhvNumber(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField status={getStatus('civilStatus', civilStatus)} title="Zivilstand" message={getMessage('civilStatus', civilStatus)}>
                    <select value={civilStatus} onChange={e => setCivilStatus(e.target.value)} className={selectStyle}>
                      <option value="">Bitte wählen...</option>
                      <option value="ledig">Ledig</option>
                      <option value="verheiratet">Verheiratet</option>
                      <option value="geschieden">Geschieden</option>
                      <option value="verwitwet">Verwitwet</option>
                      <option value="eingetragene Partnerschaft">Eingetragene Partnerschaft</option>
                    </select>
                  </MiniField>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <MiniField status={getStatus('residencePermit', residencePermit)} title="Aufenthaltsstatus" message={getMessage('residencePermit', residencePermit)}>
                    <select value={residencePermit} onChange={e => setResidencePermit(e.target.value)} className={selectStyle}>
                      <option value="">Bitte wählen...</option>
                      <option value="CH">Schweizer/in</option>
                      <option value="C">Ausweis C (Niederlassung)</option>
                    </select>
                  </MiniField>
                  <MiniField status={email ? 'success' : 'warning'} title="E-Mail" message={email ? undefined : 'Optional'}>
                    <input type="email" placeholder="Optional" value={email} onChange={e => setEmail(e.target.value)} className={inputStyle} />
                  </MiniField>
                </div>
              </div>
            )}

            {tab === 'abrechnungsdaten' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <h4 className="text-sm font-bold">Vertragsdetails & Pensum</h4>
                <div className="grid grid-cols-4 gap-4">
                  <MiniField status={getStatus('contractStart', contractStart)} title="Vertragsbeginn" message={getMessage('contractStart', contractStart)}>
                    <input type="text" placeholder="YYYY-MM-DD" value={contractStart} onChange={e => setContractStart(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField status={getStatus('contractEnd', contractEnd)} title="Vertragsende" message={getMessage('contractEnd', contractEnd)}>
                    <input type="text" placeholder="Unbefristet" value={contractEnd} onChange={e => setContractEnd(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField status={getStatus('hoursPerWeek', hoursPerWeek)} title="Stunden/Woche" message={getMessage('hoursPerWeek', hoursPerWeek)}>
                    <input type="text" value={hoursPerWeek} onChange={e => setHoursPerWeek(e.target.value)} className={inputStyle} />
                  </MiniField>
                </div>

                <h4 className="text-sm font-bold">Lohn</h4>
                <div className="grid grid-cols-4 gap-4">
                  <MiniField status={getStatus('wageType', wageType)} title="Lohnart" message={getMessage('wageType', wageType)}>
                    <select value={wageType} onChange={e => setWageType(e.target.value)} className={selectStyle}>
                      <option value="hourly">Stundenlohn</option>
                    </select>
                  </MiniField>
                  <MiniField status={getStatus('hourlyRate', hourlyRate)} title="Stundenlohn (CHF)" message={getMessage('hourlyRate', hourlyRate)}>
                    <input type="number" step="0.01" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField status={getStatus('vacationWeeks', vacationWeeks)} title="Ferien (Wochen)" message={getMessage('vacationWeeks', vacationWeeks)}>
                    <select value={vacationWeeks} onChange={e => setVacationWeeks(e.target.value)} className={selectStyle}>
                      <option value="4">4</option>
                      <option value="5">5</option>
                      <option value="6">6</option>
                      <option value="7">7</option>
                    </select>
                  </MiniField>
                </div>

                <h4 className="text-sm font-bold">Versicherung & Konto</h4>
                <div className="grid grid-cols-4 gap-4">
                  <MiniField status={getStatus('vacationSurcharge', vacationSurcharge)} title="Ferienzuschlag %" message={getMessage('vacationSurcharge', vacationSurcharge)}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="z.B. 8.33"
                      value={vacationSurcharge}
                      onChange={e => setVacationSurcharge(e.target.value)}
                      className={inputStyle}
                    />
                  </MiniField>
                  <MiniField status={getStatus('iban', iban)} title="Lohnkonto (IBAN)" message={getMessage('iban', iban)}>
                    <input type="text" value={iban} onChange={e => setIban(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField status={getStatus('billingMethod', billingMethod)} title="Abrechnungsverfahren" message={getMessage('billingMethod', billingMethod)}>
                    <select value={billingMethod} onChange={e => setBillingMethod(e.target.value)} className={selectStyle}>
                      <option value="standard">Ordentlich</option>
                    </select>
                  </MiniField>
                  <MiniField status={getStatus('canton', canton)} title="Kanton" message={getMessage('canton', canton)}>
                    <select value={canton} onChange={e => setCanton(e.target.value)} className={selectStyle}>
                      <option value="">Bitte wählen...</option>
                      <option value="AG">Aargau</option>
                      <option value="AI">Appenzell Innerrhoden</option>
                      <option value="AR">Appenzell Ausserrhoden</option>
                      <option value="BE">Bern</option>
                      <option value="BL">Basel-Landschaft</option>
                      <option value="BS">Basel-Stadt</option>
                      <option value="FR">Freiburg</option>
                      <option value="GE">Genf</option>
                      <option value="GL">Glarus</option>
                      <option value="GR">Graubünden</option>
                      <option value="JU">Jura</option>
                      <option value="LU">Luzern</option>
                      <option value="NE">Neuenburg</option>
                      <option value="NW">Nidwalden</option>
                      <option value="OW">Obwalden</option>
                      <option value="SG">St. Gallen</option>
                      <option value="SH">Schaffhausen</option>
                      <option value="SO">Solothurn</option>
                      <option value="SZ">Schwyz</option>
                      <option value="TG">Thurgau</option>
                      <option value="TI">Tessin</option>
                      <option value="UR">Uri</option>
                      <option value="VD">Waadt</option>
                      <option value="VS">Wallis</option>
                      <option value="ZG">Zug</option>
                      <option value="ZH">Zürich</option>
                    </select>
                  </MiniField>
                  <MiniField status={getStatus('nbuEmployer', nbuEmployer)} title="Nichtberufsunfallvers. AG-Anteil (%)" message={getMessage('nbuEmployer', nbuEmployer)}>
                    <input type="text" value={nbuEmployer} onChange={e => setNbuEmployer(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField status={getStatus('nbuEmployee', nbuEmployee)} title="Nichtberufsunfallvers. AN-Anteil (%)" message={getMessage('nbuEmployee', nbuEmployee)}>
                    <input type="text" value={nbuEmployee} onChange={e => setNbuEmployee(e.target.value)} className={inputStyle} />
                  </MiniField>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Schritt {tab === 'stammdaten' ? '1' : '2'} von 2
            </span>
            <div className="flex gap-3">
              {tab === 'abrechnungsdaten' && (
                <button type="button" onClick={() => setTab('stammdaten')}
                  className="px-5 py-2.5 rounded-full border text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> Zurück
                </button>
              )}
              {tab === 'stammdaten' ? (
                <button type="button" onClick={() => setTab('abrechnungsdaten')}
                  className="px-6 py-2.5 rounded-full bg-foreground text-background font-bold text-sm hover:bg-foreground/90 transition-colors flex items-center gap-2">
                  Weiter zu Abrechnungsdaten <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button type="submit" disabled={saving || !firstName || !lastName}
                  className="px-6 py-2.5 rounded-full bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> Speichern & Beenden</>}
                </button>
              )}
            </div>
          </div>
        </form>
      )}
      {/* Success */}
      {step === 'success' && (
        <div className="relative">
          {/* Confetti */}
          {showConfetti && (
            <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
              {Array.from({ length: 50 }).map((_, i) => {
                const left = Math.random() * 100;
                const delay = Math.random() * 0.5;
                const duration = 1.2 + Math.random() * 1.5;
                const size = 6 + Math.random() * 8;
                const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
                const color = colors[Math.floor(Math.random() * colors.length)];
                const rotate = Math.random() * 360;
                return (
                  <div key={i} style={{
                    position: 'absolute', left: `${left}%`, top: '-10px',
                    width: `${size}px`, height: `${size * 1.5}px`,
                    backgroundColor: color, borderRadius: '2px',
                    transform: `rotate(${rotate}deg)`,
                    animation: `confetti-fall ${duration}s ease-in ${delay}s forwards`,
                  }} />
                );
              })}
              <style>{`
                @keyframes confetti-fall {
                  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
                  100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
                }
              `}</style>
            </div>
          )}

          <div className="bg-card rounded-2xl border p-10 text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-bold mb-2">
              {firstName} {lastName} wurde angelegt! 🎉
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Teilen Sie jetzt den persönlichen Zugangslink, damit {firstName} ihre Arbeitszeiten selbst erfassen kann.
            </p>

            {savedAssistantId && (
              <div className="max-w-md mx-auto space-y-4 mb-8">
                {/* Link preview */}
                <div className="bg-muted/40 rounded-xl border p-4">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Persönlicher Zugangslink</p>
                  <code className="text-sm text-foreground break-all">{window.location.origin}/t/{savedAssistantId}</code>
                </div>

                {/* Share buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const link = `${window.location.origin}/t/${savedAssistantId}`;
                      const text = `Hallo ${firstName}!\n\nHier ist dein persönlicher Link zur Arbeitszeiterfassung:\n${link}\n\nSpeichere diesen Link als Favorit oder auf deinem Homescreen.`;
                      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                    }}
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm transition-colors"
                  >
                    <Share2 className="w-4 h-4" /> Per WhatsApp senden
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/t/${savedAssistantId}`);
                      setCopiedLink(true);
                      toast.success('Link kopiert!');
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-primary/20 hover:border-primary/40 font-bold text-sm transition-colors"
                  >
                    {copiedLink ? <><Check className="w-4 h-4 text-emerald-500" /> Kopiert!</> : <><Copy className="w-4 h-4" /> Link kopieren</>}
                  </button>
                </div>

                {/* Info box */}
                <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 text-left">
                  <p className="text-sm font-semibold text-blue-800 mb-2">💡 So funktioniert's:</p>
                  <ul className="text-sm text-blue-700 space-y-1.5">
                    <li>1. Senden Sie den Link per WhatsApp an {firstName}</li>
                    <li>2. {firstName} öffnet den Link auf dem Handy</li>
                    <li>3. Arbeitszeiten werden direkt in der App erfasst</li>
                    <li>4. Sie sehen alle Einträge hier in der Übersicht</li>
                  </ul>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onComplete}
              className="px-8 py-3 rounded-full bg-foreground text-background font-bold text-sm hover:bg-foreground/90 transition-colors"
            >
              Zur Übersicht →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
