import { useState, useEffect } from 'react';
import { supabase } from '@asklepios/backend';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const formatAIWarning = (code: string) => {
  const map: Record<string, string> = {
    'FEHLENDE_AHV_NUMMER': 'AHV-Nummer fehlt im Dokument',
    'KANTON_ABGELEITET': 'Kanton wurde automatisch anhand der PLZ abgeleitet',
    'FEHLENDE_SOZIALVERSICHERUNGSANGABEN': 'Sozialversicherungsabzüge konnten nicht gefunden werden',
    'UNVOLLSTAENDIGE_ADRESSE': 'Adresse der Assistenzperson ist unvollständig',
    'LOHN_NICHT_ERKANNT': 'Bruttolohn konnte nicht eindeutig bestimmt werden'
  };
  return map[code] || code.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
};
import { UploadCloud, CheckCircle2, FileText, ArrowRight, AlertCircle, HelpCircle, User, ArrowLeft, Loader2, Share2, Copy, Check } from 'lucide-react';
import { readFileContent } from '@asklepios/backend';
import { runDocumentPipeline } from '@asklepios/backend';
import { ContractExtractionResult, IDPField, ConfidenceLevel } from '@asklepios/backend';

// Check if field was AI-extracted
function isAiExtracted(confidence: string): boolean {
  return confidence === 'high' || confidence === 'medium';
}

function confidenceLabel(confidence: string): string {
  return 'KI';
}

// Required fields
const REQUIRED_FIELDS = ['firstName', 'lastName', 'birthDate', 'ahvNumber', 'contractStart', 'hoursPerWeek', 'hourlyRate'];

function confidenceMessage(field: IDPField<any>): string | undefined {
  if (field.confidence === 'high' && field.value !== null) return undefined;
  if (field.confidence === 'medium') return field.note || 'Unsicher, bitte prüfen';
  if (field.value === null) return field.note || 'Nicht im Vertrag gefunden';
  return field.note || 'Bitte ergänzen';
}

// ─── Validation & Formatting Helpers ─────────────────────

/** Format AHV number as 756.XXXX.XXXX.XX while typing */
function formatAhvNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 11) return `${digits.slice(0, 3)}.${digits.slice(3, 7)}.${digits.slice(7)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 7)}.${digits.slice(7, 11)}.${digits.slice(11)}`;
}

/** Validate AHV number: must be 756.XXXX.XXXX.XX (13 digits) */
function validateAhvNumber(value: string): string | null {
  if (!value) return null; // empty = no error (handled by required check)
  const digits = value.replace(/\D/g, '');
  if (digits.length > 0 && !digits.startsWith('756')) return 'Muss mit 756 beginnen';
  if (digits.length > 0 && digits.length < 13) return `${13 - digits.length} Ziffern fehlen`;
  if (digits.length === 13) return null;
  return 'Ungültiges Format';
}

/** Validate Swiss PLZ: 4 digits, 1000-9699 */
function validatePlz(value: string): string | null {
  if (!value) return null;
  const num = parseInt(value.trim(), 10);
  if (isNaN(num) || value.trim().length !== 4) return 'PLZ muss 4 Ziffern haben';
  if (num < 1000 || num > 9699) return 'Ungültige Schweizer PLZ';
  return null;
}

/** Format IBAN with spaces: CHxx xxxx xxxx xxxx xxxx x */
function formatIban(raw: string): string {
  const clean = raw.replace(/\s/g, '').toUpperCase().slice(0, 21);
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

/** Validate Swiss IBAN */
function validateIban(value: string): string | null {
  if (!value) return null;
  const clean = value.replace(/\s/g, '').toUpperCase();
  if (clean.length > 0 && !clean.startsWith('CH')) return 'Muss mit CH beginnen';
  if (clean.length > 2 && clean.length < 21) return `${21 - clean.length} Zeichen fehlen`;
  if (clean.length === 21) return null;
  if (clean.length > 21) return 'Zu viele Zeichen';
  return null;
}

/** Validate positive number */
function validatePositiveNumber(value: string, label: string): string | null {
  if (!value) return null;
  const num = parseFloat(value);
  if (isNaN(num)) return `${label} muss eine Zahl sein`;
  if (num <= 0) return `${label} muss grösser als 0 sein`;
  return null;
}

interface AssistantOnboardingProps {
  onComplete: () => void;
  onClose: () => void;
  initialUploadFile?: File;
  editAssistant?: any; // To avoid circular imports, just use any or import from types
}

function MiniField({ 
  title, 
  children,
  aiDetected = false,
  required = false,
  hasValue = false,
  error,
  hint,
  className = "" 
}: { 
  title: string, 
  children: React.ReactNode,
  aiDetected?: boolean,
  required?: boolean,
  hasValue?: boolean,
  error?: string | null,
  hint?: string,
  className?: string
}) {
  return (
    <div className={`p-2.5 rounded-xl border flex flex-col justify-between ${error ? 'border-red-300 bg-red-50/30' : 'border-slate-200 bg-white'} transition-colors shadow-sm ${className}`}>
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{title}</span>
          {aiDetected && hasValue && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 flex items-center gap-0.5">
              <CheckCircle2 className="w-2.5 h-2.5" />
              KI
            </span>
          )}
        </div>
        <div className="w-full">{children}</div>
      </div>
      <div className="min-h-[20px]">
        {error ? (
          <p className="text-[10px] mt-1.5 text-red-500 font-medium">{error}</p>
        ) : hint && hasValue ? (
          <p className="text-[10px] mt-1.5 text-emerald-500 font-medium">✓ {hint}</p>
        ) : !hasValue ? (
          <p className="text-[10px] mt-1.5 text-slate-400">
            {required ? 'Pflichtfeld' : 'Optional'}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// readFileContent from pdf-extractor handles PDF, images, and text files

export function AssistantOnboarding({ onComplete, onClose, initialUploadFile, editAssistant }: AssistantOnboardingProps) {
  const { employerAccess } = useAuth();
  
  const [step, setStep] = useState<'upload' | 'extracting' | 'review' | 'success'>(
    editAssistant ? 'review' : (initialUploadFile ? 'extracting' : 'upload')
  );
  const [tab, setTab] = useState<'stammdaten' | 'abrechnungsdaten'>('stammdaten');
  const [extraction, setExtraction] = useState<ContractExtractionResult | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [savedAssistantId, setSavedAssistantId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Editable fields - populated from extraction or manually
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [street, setStreet] = useState('');
  const [plz, setPlz] = useState('');
  const [city, setCity] = useState('');
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
  const [monthlyRate, setMonthlyRate] = useState('');
  const [vacationWeeks, setVacationWeeks] = useState('4');
  const [vacationSurcharge, setVacationSurcharge] = useState('');
  const [iban, setIban] = useState('');
  const [billingMethod, setBillingMethod] = useState('simplified');
  const [canton, setCanton] = useState('');
  const [nbuEmployer, setNbuEmployer] = useState('');
  const [nbuEmployee, setNbuEmployee] = useState('');
  
  const [saving, setSaving] = useState(false);
  const [isProcessingInitial, setIsProcessingInitial] = useState(false);

  // Trigger extraction immediately if initialUploadFile is provided
  useEffect(() => {
    if (initialUploadFile && step === 'extracting' && !isProcessingInitial) {
      setIsProcessingInitial(true);
      processFile(initialUploadFile);
    }
  }, [initialUploadFile, step, isProcessingInitial]);

  // Pre-fill form if editing an existing assistant
  useEffect(() => {
    if (editAssistant) {
      setSavedAssistantId(editAssistant.id);
      const data = editAssistant.contract_data || {};
      setFirstName(data.first_name || editAssistant.name?.split(' ')[0] || '');
      setLastName(data.last_name || editAssistant.name?.split(' ').slice(1).join(' ') || '');
      setStreet(data.street || '');
      setPlz(data.plz || '');
      setCity(data.city || '');
      setBirthDate(editAssistant.date_of_birth || data.birth_date || '');
      setAhvNumber(data.ahv_number || '');
      setCivilStatus(data.civil_status || '');
      setResidencePermit(data.residence_permit || '');
      setEmail(editAssistant.email || '');
      setContractStart(data.contract_start || '');
      setContractEnd(data.contract_end || '');
      setHoursPerWeek(data.hours_per_week?.toString() || '');
      setHoursPerMonth(data.hours_per_month?.toString() || '');
      setWageType(data.wage_type || 'hourly');
      setHourlyRate(editAssistant.hourly_rate?.toString() || data.hourly_rate?.toString() || '');
      setMonthlyRate(data.monthly_rate?.toString() || '');
      setVacationWeeks(editAssistant.vacation_weeks?.toString() || data.vacation_weeks?.toString() || '4');
      setVacationSurcharge(data.vacation_surcharge || '');
      setIban(data.iban || data.payment_iban || '');
      setBillingMethod(data.billing_method || 'simplified');
      setCanton(data.canton || '');
      setNbuEmployer(data.nbu_employer || data.nbu_employer_pct || '');
      setNbuEmployee(data.nbu_employee || data.nbu_employee_pct || '');
    }
  }, [editAssistant]);

  // Confidence maps - tracks what the AI was sure about
  const [confidenceMap, setConfidenceMap] = useState<Record<string, IDPField<any>>>({});

  const populateFromExtraction = (result: ContractExtractionResult) => {
    const a = result.contracts.assistant;
    const ct = result.contracts.contract_terms;
    const w = result.contracts.wage;
    const si = result.contracts.social_insurance;

    // Build confidence map
    const cMap: Record<string, IDPField<any>> = {};
    const setField = (key: string, field: IDPField<any> | undefined, setter: (v: string) => void) => {
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
      setField('hoursPerMonth', ct.hours_per_month, setHoursPerMonth);
    }

    if (w) {
      setField('wageType', w.wage_type, setWageType);
      setField('hourlyRate', w.hourly_rate, setHourlyRate);
      setField('monthlyRate', w.monthly_rate, setMonthlyRate);
      setField('vacationWeeks', w.vacation_weeks, setVacationWeeks);
      setField('vacationSurcharge', w.holiday_supplement_pct, setVacationSurcharge);
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

  const loadDemoData = () => {
    const demoResult: ContractExtractionResult = {
      extraction_metadata: {
        document_language: 'de',
        overall_confidence: 0.82,
        fields_extracted: 18,
        fields_missing: 3,
        warnings: ['FEHLENDE_AHV_NUMMER', 'KANTON_ABGELEITET'],
      },
      contracts: {
        employer: {
          first_name: { value: 'Anna', confidence: 'high', confidence_score: 0.95, source_text: 'Name: Anna Meier', note: '' },
          last_name: { value: 'Meier', confidence: 'high', confidence_score: 0.95, source_text: 'Name: Anna Meier', note: '' },
          street: { value: 'Musterstrasse 12', confidence: 'high', confidence_score: 0.95, source_text: '', note: '' },
          zip: { value: '4051', confidence: 'high', confidence_score: 0.95, source_text: '', note: '' },
          city: { value: 'Basel', confidence: 'high', confidence_score: 0.95, source_text: '', note: '' },
        },
        assistant: {
          first_name: { value: 'Sara', confidence: 'high', confidence_score: 0.97, source_text: 'Name: Sara Keller', note: '' },
          last_name: { value: 'Keller', confidence: 'high', confidence_score: 0.97, source_text: 'Name: Sara Keller', note: '' },
          street: { value: 'Lindenweg 5', confidence: 'high', confidence_score: 0.95, source_text: 'Adresse: Lindenweg 5, 4058 Basel', note: '' },
          zip: { value: '4058', confidence: 'high', confidence_score: 0.95, source_text: '', note: '' },
          city: { value: 'Basel', confidence: 'high', confidence_score: 0.95, source_text: '', note: '' },
          birth_date: { value: '1990-03-14', confidence: 'high', confidence_score: 0.95, source_text: 'Geburtsdatum: 14.03.1990', note: '' },
          ahv_number: { value: null, confidence: 'low', confidence_score: 0.0, source_text: '', note: 'Nicht im Vertrag' },
          civil_status: { value: 'ledig', confidence: 'high', confidence_score: 0.95, source_text: 'Zivilstand: ledig', note: '' },
          nationality: { value: 'CH', confidence: 'high', confidence_score: 0.9, source_text: 'Staatsangehörigkeit: Schweiz', note: '' },
          residence_permit: { value: 'CH', confidence: 'high', confidence_score: 0.9, source_text: 'Schweizer Bürgerin', note: '' },
        },
        contract_terms: {
          start_date: { value: '2026-03-01', confidence: 'high', confidence_score: 0.97, source_text: 'Vertragsbeginn: 01.03.2026', note: '' },
          end_date: { value: null, confidence: 'high', confidence_score: 0.95, source_text: 'unbefristet', note: 'Unbefristet' },
          is_indefinite: { value: true, confidence: 'high', confidence_score: 0.95, source_text: 'unbefristet', note: '' },
          hours_per_week: { value: 20, confidence: 'high', confidence_score: 0.97, source_text: 'Stunden pro Woche: 20 Stunden', note: '' },
          hours_per_month: { value: 86, confidence: 'high', confidence_score: 0.95, source_text: 'ca. 86 Stunden', note: '' },
          notice_period_days: { value: 30, confidence: 'medium', confidence_score: 0.7, source_text: 'Kündigungsfrist von einem Monat', note: 'Als 30 Tage interpretiert' },
        },
        wage: {
          wage_type: { value: 'hourly', confidence: 'high', confidence_score: 0.97, source_text: 'Stundenlohn: CHF 30.00 brutto', note: '' },
          hourly_rate: { value: 30.00, confidence: 'high', confidence_score: 0.98, source_text: 'Stundenlohn: CHF 30.00 brutto', note: '' },
          monthly_rate: { value: 2580.00, confidence: 'medium', confidence_score: 0.75, source_text: 'Monatslohn (ca.): CHF 2\'580.00', note: 'Ca.-Angabe' },
          vacation_weeks: { value: 4, confidence: 'high', confidence_score: 0.95, source_text: '4 Wochen bezahlte Ferien', note: '' },
          holiday_supplement_pct: { value: 0.0833, confidence: 'high', confidence_score: 0.95, source_text: 'Ferienzuschlag: 8.33 %', note: '' },
          payment_iban: { value: 'CH93 0076 2011 6238 5295 7', confidence: 'high', confidence_score: 0.97, source_text: 'IBAN: CH93 0076 2011 6238 5295 7', note: '' },
        },
        social_insurance: {
          accounting_method: { value: null, confidence: 'low', confidence_score: 0.1, source_text: '', note: 'Nicht im Vertrag' },
          canton: { value: 'BS', confidence: 'medium', confidence_score: 0.7, source_text: '4051 Basel', note: 'Aus PLZ abgeleitet' },
          nbu_employer_pct: { value: null, confidence: 'low', confidence_score: 0.0, source_text: '', note: 'Nicht angegeben' },
          nbu_employee_pct: { value: null, confidence: 'low', confidence_score: 0.0, source_text: '', note: 'Nicht angegeben' },
        },
      },
    };
    setExtraction(demoResult);
    populateFromExtraction(demoResult);
    setStep('review');
    setTab('stammdaten');
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    processFile(file);
  };

  const processFile = async (file: File) => {
    setStep('extracting');
    setExtractionError(null);

    try {
      const { text } = await readFileContent(file);
      toast.info('Dokument wird analysiert', { 
        description: 'Bitte warten Sie, unser KI-Agent liest die Daten aus.' 
      });
      
      const pipelineResult = await runDocumentPipeline(file, text);
      
      if (pipelineResult.classification !== 'contract') {
        throw new Error('Das hochgeladene Dokument wurde nicht als gültiger Schweizer Arbeitsvertrag erkannt. Bitte überprüfen Sie die Datei.');
      }
      
      if (!pipelineResult.extraction?.contracts) {
        throw new Error('Konnte keine Vertragsdaten extrahieren.');
      }
      
      const result = pipelineResult.extraction;
      
      setExtraction(result);
      populateFromExtraction(result);
      
      if (pipelineResult.assistant_id) {
        setSavedAssistantId(pipelineResult.assistant_id);
      }
      
      setStep('review');
      setTab('stammdaten');
      
      const meta = result.extraction_metadata;
      toast.success('Extraktion erfolgreich', {
        description: `${meta.fields_extracted} Felder erkannt (Sicherheit: ${Math.round(meta.overall_confidence * 100)}%)`
      });
      
      if (meta.warnings.length > 0) {
        const warningDesc = meta.warnings.map(formatAIWarning).join(' • ');
        toast.warning('Hinweise zur Extraktion', {
          description: warningDesc,
          duration: 8000
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setExtractionError(msg);
      toast.error('Extraktion fehlgeschlagen', {
        description: msg
      });
      setStep('upload');
    }
  };



  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employerAccess?.employer_id) return;
    
    setSaving(true);
    const fullName = `${firstName} ${lastName}`.trim();
    
    const payload = {
      employer_id: employerAccess.employer_id,
      name: fullName || 'Unbenannt',
      email: email.trim() || null,
      date_of_birth: birthDate.trim() || null,
      hourly_rate: parseFloat(hourlyRate) || null,
      vacation_weeks: parseInt(vacationWeeks, 10) || null,
      has_withholding_tax: false,
      has_bvg: false,
      time_entry_mode: 'manual' as const,
      is_active: true,
      contract_data: {
        first_name: firstName, last_name: lastName,
        street, plz, city, ahv_number: ahvNumber,
        civil_status: civilStatus, residence_permit: residencePermit,
        contract_start: contractStart, contract_end: contractEnd,
        hours_per_week: hoursPerWeek, hours_per_month: hoursPerMonth,
        wage_type: wageType, monthly_rate: monthlyRate,
        vacation_surcharge: vacationSurcharge,
        iban, billing_method: billingMethod,
        canton, nbu_employer: nbuEmployer, nbu_employee: nbuEmployee,
        extraction_metadata: extraction?.extraction_metadata ?? null,
      }
    };
    
    let error;
    if (savedAssistantId) {
      // Watsonx IDP has already inserted a draft in Supabase, update it
      const { error: updateError } = await supabase
        .from('assistant')
        .update(payload)
        .eq('id', savedAssistantId);
      error = updateError;
    } else {
      // Fallback for manual or legacy creation
      const { data, error: insertError } = await supabase
        .from('assistant')
        .insert(payload)
        .select('id')
        .single();
      error = insertError;
      if (data) {
        setSavedAssistantId(data.id);
      }
    }

    setSaving(false);
    if (error) {
      toast.error('Speichern fehlgeschlagen', {
        description: error.message || 'Es ist ein unbekannter Fehler aufgetreten.'
      });
    } else {
      // Show confetti + success screen
      setShowConfetti(true);
      setStep('success');
      setTimeout(() => setShowConfetti(false), 3000);
    }
  };

  // Helper to check if field was AI-extracted
  const isFieldAi = (key: string): boolean => {
    return !!confidenceMap[key];
  };

  const isRequired = (key: string): boolean => REQUIRED_FIELDS.includes(key);

  const inputStyle = "w-full px-2.5 py-1.5 rounded-lg border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors";
  const selectStyle = "w-full px-2.5 py-1.5 rounded-lg border bg-white text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Zurück zur Übersicht
        </button>
        <h1 className="text-2xl font-bold">{editAssistant ? 'Assistenzperson bearbeiten' : 'Assistenzperson erfassen'}</h1>
        <p className="text-muted-foreground">
          {editAssistant ? 'Überprüfen und ändern Sie die Stammdaten und Abrechnungsdetails.' : 'Laden Sie einen Arbeitsvertrag hoch. Unser KI-Agent liest die Stammdaten automatisch aus.'}
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
              Laden Sie ein JPG, PNG, PDF oder Word-Dokument hoch.
            </p>

            {extractionError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-left flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-red-800 mb-1">Upload fehlgeschlagen</h4>
                  <p className="text-sm text-red-700">{extractionError}</p>
                </div>
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



              <div className="w-12 border-t my-2" />

              <button type="button" onClick={loadDemoData} className="text-primary hover:underline font-medium text-sm">
                Demo-Modus: Mustervertrag laden
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
              Stammdaten und Abrechnungsdaten werden automatisch extrahiert
            </p>
          </div>
        </div>
      )}

      {/* Review */}
      {step === 'review' && (
        <form onSubmit={handleSave} className="space-y-3">
          {/* AI Review Banner */}
          {Object.keys(confidenceMap).length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
              <p className="text-xs text-blue-700">
                <span className="font-bold">KI-Daten bitte überprüfen</span> – Felder mit <span className="inline-flex items-center gap-0.5 px-1 py-px rounded-full bg-blue-100 text-blue-700 text-[9px] font-semibold mx-0.5"><CheckCircle2 className="w-2.5 h-2.5" />KI</span> wurden automatisch befüllt.
              </p>
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
          <div className="bg-card rounded-2xl border p-5">
            {tab === 'stammdaten' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <h4 className="text-sm font-bold">Assistenzperson</h4>
                
                <div className="grid grid-cols-4 gap-3">
                  <MiniField title="Vorname" aiDetected={isFieldAi('firstName')} required={isRequired('firstName')} hasValue={!!firstName}>
                    <input type="text" placeholder="Bitte ergänzen..." value={firstName} onChange={e => setFirstName(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField title="Nachname" aiDetected={isFieldAi('lastName')} required={isRequired('lastName')} hasValue={!!lastName}>
                    <input type="text" placeholder="Bitte ergänzen..." value={lastName} onChange={e => setLastName(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField title="Strasse" aiDetected={isFieldAi('street')} required={isRequired('street')} hasValue={!!street}>
                    <input type="text" placeholder="Bitte ergänzen..." value={street} onChange={e => setStreet(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField title="PLZ" aiDetected={isFieldAi('plz')} required={isRequired('plz')} hasValue={!!plz} error={validatePlz(plz)} hint="Gültige PLZ">
                    <input type="text" placeholder="z.B. 8000" maxLength={4} value={plz} onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setPlz(v); }} className={inputStyle} />
                  </MiniField>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <MiniField title="Ort" aiDetected={isFieldAi('city')} required={isRequired('city')} hasValue={!!city}>
                    <input type="text" placeholder="Bitte ergänzen..." value={city} onChange={e => setCity(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField title="Geburtsdatum" aiDetected={isFieldAi('birthDate')} required={isRequired('birthDate')} hasValue={!!birthDate}>
                    <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField title="AHV-Nummer" aiDetected={isFieldAi('ahvNumber')} required={isRequired('ahvNumber')} hasValue={!!ahvNumber} error={validateAhvNumber(ahvNumber)} hint="Format korrekt">
                    <input type="text" placeholder="756.xxxx.xxxx.xx" value={ahvNumber} onChange={e => setAhvNumber(formatAhvNumber(e.target.value))} className={inputStyle} />
                  </MiniField>
                  <MiniField title="Zivilstand" aiDetected={isFieldAi('civilStatus')} required={isRequired('civilStatus')} hasValue={!!civilStatus}>
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

                <div className="grid grid-cols-4 gap-3">
                  <MiniField title="Aufenthaltsstatus" aiDetected={isFieldAi('residencePermit')} required={isRequired('residencePermit')} hasValue={!!residencePermit}>
                    <select value={residencePermit} onChange={e => setResidencePermit(e.target.value)} className={selectStyle}>
                      <option value="">Bitte wählen...</option>
                      <option value="CH">Schweizer/in</option>
                      <option value="B">Ausweis B (Aufenthalt)</option>
                      <option value="C">Ausweis C (Niederlassung)</option>
                      <option value="G">Ausweis G (Grenzgänger)</option>
                      <option value="L">Ausweis L (Kurzaufenthalt)</option>
                      <option value="N">Ausweis N (Asylsuchende)</option>
                      <option value="F">Ausweis F (Vorläufig Aufgenommene)</option>
                    </select>
                  </MiniField>
                  <MiniField title="E-Mail" hasValue={!!email}>
                    <input type="text" placeholder="Optional" value={email} onChange={e => setEmail(e.target.value)} className={inputStyle} />
                  </MiniField>
                </div>
              </div>
            )}

            {tab === 'abrechnungsdaten' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <h4 className="text-sm font-bold">Vertragsdetails & Pensum</h4>
                <div className="grid grid-cols-4 gap-4">
                  <MiniField title="Vertragsbeginn" aiDetected={isFieldAi('contractStart')} required={isRequired('contractStart')} hasValue={!!contractStart}>
                    <input type="date" value={contractStart} onChange={e => setContractStart(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField title="Vertragsende" aiDetected={isFieldAi('contractEnd')} required={isRequired('contractEnd')} hasValue={!!contractEnd}>
                    <input type="date" placeholder="Unbefristet" value={contractEnd} onChange={e => setContractEnd(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField title="Stunden/Woche" aiDetected={isFieldAi('hoursPerWeek')} required={isRequired('hoursPerWeek')} hasValue={!!hoursPerWeek} error={validatePositiveNumber(hoursPerWeek, 'Stunden')}>
                    <input type="number" min="0" max="168" step="0.5" placeholder="z.B. 20" value={hoursPerWeek} onChange={e => setHoursPerWeek(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField title="Stunden/Monat" aiDetected={isFieldAi('hoursPerMonth')} required={isRequired('hoursPerMonth')} hasValue={!!hoursPerMonth} error={validatePositiveNumber(hoursPerMonth, 'Stunden')}>
                    <input type="number" min="0" max="744" step="0.5" placeholder="z.B. 86" value={hoursPerMonth} onChange={e => setHoursPerMonth(e.target.value)} className={inputStyle} />
                  </MiniField>
                </div>

                <h4 className="text-sm font-bold">Lohn</h4>
                <div className="grid grid-cols-4 gap-4">
                  <MiniField title="Lohnart" aiDetected={isFieldAi('wageType')} required={isRequired('wageType')} hasValue={!!wageType}>
                    <select value={wageType} onChange={e => setWageType(e.target.value)} className={selectStyle}>
                      <option value="hourly">Stundenlohn</option>
                      <option value="monthly">Monatslohn</option>
                    </select>
                  </MiniField>
                  <MiniField title="Stundenlohn (CHF)" aiDetected={isFieldAi('hourlyRate')} required={isRequired('hourlyRate')} hasValue={!!hourlyRate} error={validatePositiveNumber(hourlyRate, 'Stundenlohn')}>
                    <input type="number" step="0.05" min="0" placeholder="z.B. 30.00" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField title="Monatslohn (ca.)" aiDetected={isFieldAi('monthlyRate')} required={isRequired('monthlyRate')} hasValue={!!monthlyRate} error={validatePositiveNumber(monthlyRate, 'Monatslohn')}>
                    <input type="number" step="1" min="0" placeholder="z.B. 2600" value={monthlyRate} onChange={e => setMonthlyRate(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField title="Ferien (Wochen)" aiDetected={isFieldAi('vacationWeeks')} required={isRequired('vacationWeeks')} hasValue={!!vacationWeeks}>
                    <select value={vacationWeeks} onChange={e => setVacationWeeks(e.target.value)} className={selectStyle}>
                      <option value="4">4</option>
                      <option value="5">5</option>
                      <option value="6">6</option>
                    </select>
                  </MiniField>
                </div>

                <h4 className="text-sm font-bold">Versicherung & Konto</h4>
                <div className="grid grid-cols-4 gap-4">
                  <MiniField title="Ferienzuschlag %" aiDetected={isFieldAi('vacationSurcharge')} required={isRequired('vacationSurcharge')} hasValue={!!vacationSurcharge}>
                    <input type="text" value={vacationSurcharge} onChange={e => setVacationSurcharge(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField title="Lohnkonto (IBAN)" aiDetected={isFieldAi('iban')} required={isRequired('iban')} hasValue={!!iban} error={validateIban(iban)} hint="Gültige IBAN">
                    <input type="text" placeholder="CH93 0076 2011 6238 5295 7" value={iban} onChange={e => setIban(formatIban(e.target.value))} className={inputStyle} />
                  </MiniField>
                  <MiniField title="Abrechnungsverfahren" aiDetected={isFieldAi('billingMethod')} required={isRequired('billingMethod')} hasValue={!!billingMethod}>
                    <select value={billingMethod} onChange={e => setBillingMethod(e.target.value)} className={selectStyle}>
                      <option value="simplified">Vereinfacht</option>
                      <option value="standard">Standard</option>
                    </select>
                  </MiniField>
                  <MiniField title="Kanton" aiDetected={isFieldAi('canton')} required={isRequired('canton')} hasValue={!!canton}>
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
                  <MiniField title="NBU AG %" aiDetected={isFieldAi('nbuEmployer')} required={isRequired('nbuEmployer')} hasValue={!!nbuEmployer}>
                    <input type="text" value={nbuEmployer} onChange={e => setNbuEmployer(e.target.value)} className={inputStyle} />
                  </MiniField>
                  <MiniField title="NBU AN %" aiDetected={isFieldAi('nbuEmployee')} required={isRequired('nbuEmployee')} hasValue={!!nbuEmployee}>
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
              {firstName} {lastName} wurde {editAssistant ? 'aktualisiert' : 'angelegt'}! 🎉
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Teilen Sie {editAssistant ? 'bei Bedarf erneut' : 'jetzt'} den persönlichen Zugangslink, damit {firstName} ihre Arbeitszeiten selbst erfassen kann.
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
