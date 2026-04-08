import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@asklepios/backend';
import { useAuth } from '@/contexts/AuthContext';
import {
  calculatePayroll, FAK_RATES, fmt, fmtPct, type PayrollResult
} from '@asklepios/backend';
import { calculatePayslip, generatePayslipPdf, type PayslipAccountingMethod } from '@asklepios/backend';
import { generateTimesheetPdf } from '@asklepios/backend';
import { generateEinsatzrapportPdf } from '@asklepios/backend';
import { generateIvInvoicePdf, type IvInvoiceLine } from '@asklepios/backend';
import {
  Calculator, FileText, ChevronLeft, ChevronRight, Users,
  ShieldCheck, Clock, Eye, Download, Pencil, Save, X,
  ChevronDown, TrendingUp, Banknote, ArrowRight, ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';
import type { Assistant } from '@asklepios/backend';
import { generateEinsatzrapportDocx } from '@/utils/einsatzrapport-docx';

// ─── Types ───
interface MonthlyHours {
  totalHours: number;
  nightHours: number;
  entryCount: number;
  entries: {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    is_night: boolean;
    category?: string;
    hours: number;
  }[];
}

// ─── Helpers ───
const MONTH_NAMES = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

const ACTIVITY_LABELS: Record<string, string> = {
  // Gespeicherte Codes bleiben (2–10); UI-Legende soll 1–8 sein.
  '2': '1) Alltägliche Lebensverrichtungen',
  '3': '2) Haushaltsführung',
  '4': '3) Gesellschaftliche Teilhabe und Freizeitgestaltung',
  '5': '4) Erziehung und Kinderbetreuung',
  '6': '5) Gemeinnützig/ehrenamtlich',
  '7': '6) Berufliche Aus- und Weiterbildung',
  '8': '7) Erwerbstätigkeit (1. Arbeitsmarkt)',
  '9': '8) Überwachung während des Tages',
  '10': 'Nachtdienst',
};

function activityLabelFromCode(code?: string | null): string {
  const c = (code || '').trim();
  if (!c) return 'Ohne Kategorie';
  return ACTIVITY_LABELS[c] || c;
}

function formatActivityForInlineDisplay(code?: string | null): string {
  const raw = (code || '').trim();
  if (!raw) return 'Ohne Kategorie';
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;

  // Stored: 2..9 map to display 1..8
  if (n >= 2 && n <= 9) {
    const display = n - 1;
    const label = ACTIVITY_LABELS[String(n)];
    const clean = label ? label.replace(/^\d+\)\s*/, '') : '';
    return clean ? `${display} · ${clean}` : String(display);
  }

  // Allow already-display numbering 1..8
  if (n >= 1 && n <= 8) {
    const label = Object.entries(ACTIVITY_LABELS).find(([, v]) => v.startsWith(`${n})`))?.[1];
    const clean = label ? label.replace(/^\d+\)\s*/, '') : '';
    return clean ? `${n} · ${clean}` : String(n);
  }

  return raw;
}

function parseHours(start: string, end: string): number {
  const toMin = (t: string) => {
    const [hhRaw, mmRaw] = (t || '').split(':');
    const hh = Number(hhRaw);
    const mm = Number(mmRaw);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh === 24 && mm === 0) return 24 * 60;
    if (hh < 0 || hh > 23) return null;
    if (mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  };
  const s = toMin(start);
  const e = toMin(end);
  if (s == null || e == null) return 0;
  const raw = e - s;
  const minutes = raw >= 0 ? raw : raw + 24 * 60;
  return Math.max(0, minutes / 60);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const parts = key.split('-');
  const y = parts[0] ?? '';
  const m = parts[1] ?? '01';
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

// ─── Flow Steps (3-step linear flow) ───
type FlowStep = 'stunden' | 'abrechnung' | 'dokumente';

export function PayrollPage() {
  const { employerAccess, employer } = useAuth();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);

  // Current month navigation
  const [currentMonth, setCurrentMonth] = useState(() => monthKey(new Date()));

  // Expanded card & flow step
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [flowStep, setFlowStep] = useState<FlowStep>('stunden');
  const [confirmedMap, setConfirmedMap] = useState<Record<string, boolean>>({});

  // Time entries for the month
  const [timeEntries, setTimeEntries] = useState<Record<string, MonthlyHours>>({});

  // Editing state
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  // Ref for scroll-into-view
  const expandedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (employerAccess?.employer_id) {
      loadData();
    }
  }, [employerAccess, currentMonth]);

  // Scroll expanded card into view
  useEffect(() => {
    if (expandedId && expandedRef.current) {
      setTimeout(() => {
        expandedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [expandedId]);

  const loadData = async () => {
    setLoading(true);
    const eid = employerAccess!.employer_id;

    const { data: aData } = await supabase
      .from('assistant')
      .select('*')
      .eq('employer_id', eid)
      .eq('is_active', true);

    if (aData) setAssistants(aData);

    const parts = currentMonth.split('-').map(Number);
    const year = parts[0] ?? 2026;
    const month = parts[1] ?? 1;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const { data: entries } = await supabase
      .from('time_entry')
      .select('*')
      .gte('date', startDate)
      .lt('date', endDate)
      .in('assistant_id', (aData || []).map(a => a.id));

    const grouped: Record<string, MonthlyHours> = {};
    for (const a of (aData || [])) {
      grouped[a.id] = { totalHours: 0, nightHours: 0, entryCount: 0, entries: [] };
    }

    for (const e of (entries || [])) {
      if (!grouped[e.assistant_id]) continue;
      const hours = parseHours(e.start_time || '00:00', e.end_time || '00:00');
      const g = grouped[e.assistant_id];
      if (!g) continue;
      g.totalHours += hours;
      if (e.is_night) g.nightHours += hours;
      g.entryCount++;
      g.entries.push({
        id: e.id, date: e.date, start_time: e.start_time,
        end_time: e.end_time, is_night: e.is_night,
        category: e.category, hours,
      });
    }

    setTimeEntries(grouped);
    setLoading(false);
  };

  const shiftMonth = (dir: number) => {
    const parts = currentMonth.split('-').map(Number);
    const y = parts[0] ?? 2026, m = parts[1] ?? 1;
    const d = new Date(y, m - 1 + dir, 1);
    setCurrentMonth(monthKey(d));
    setExpandedId(null);
    setFlowStep('stunden');
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setFlowStep('stunden');
    } else {
      setExpandedId(id);
      setFlowStep('stunden');
    }
  };

  // Generate payslip for an assistant
  const generatePayslip = (assistant: Assistant, hours: MonthlyHours): PayrollResult | null => {
    const cd = assistant.contract_data as any;
    const stundenlohn = assistant.hourly_rate || (cd?.hourly_rate ? parseFloat(cd.hourly_rate) : 0);
    if (!stundenlohn || hours.totalHours === 0) return null;

    const kanton = cd?.canton || employer?.canton || 'ZH';
    const vacWeeks = assistant.vacation_weeks || 4;
    const ferienzuschlag = vacWeeks === 5 ? 0.1064 : vacWeeks === 6 ? 0.1304 : 0.0833;

    return calculatePayroll({
      stundenlohn,
      anzahlStunden: hours.totalHours,
      kanton,
      abrechnungsverfahren: 'ordentlich',
      ferienzuschlag,
      nbuAN: cd?.nbu_employee ? parseFloat(cd.nbu_employee) / 100 : undefined,
      agName: employer?.name,
      anName: assistant.name,
    });
  };

  const handleConfirm = async (assistantId: string, name: string) => {
    const parts = currentMonth.split('-').map(Number);
    const year = parts[0] ?? 2026;
    const month = parts[1] ?? 1;

    await supabase.from('payroll_confirmation').upsert({
      assistant_id: assistantId,
      month: `${year}-${String(month).padStart(2, '0')}-01`,
      confirmed: true,
      confirmed_at: new Date().toISOString(),
    }, { onConflict: 'assistant_id,month' });

    setConfirmedMap(prev => ({ ...prev, [`${assistantId}-${currentMonth}`]: true }));
    toast.success(`Lohnabrechnung für ${name} bestätigt!`);
    setFlowStep('dokumente');
  };

  // Edit entry
  const startEditing = (entry: { id: string; start_time: string; end_time: string }) => {
    setEditingEntryId(entry.id);
    setEditStart(entry.start_time);
    setEditEnd(entry.end_time);
  };

  const cancelEditing = () => {
    setEditingEntryId(null);
    setEditStart('');
    setEditEnd('');
  };

  const saveEdit = async (entryId: string) => {
    const { error } = await supabase
      .from('time_entry')
      .update({ start_time: editStart, end_time: editEnd })
      .eq('id', entryId);

    if (error) {
      toast.error('Fehler: ' + error.message);
    } else {
      toast.success('Eintrag aktualisiert');
      cancelEditing();
      loadData();
    }
  };

  // Helper: get AG/AN address data
  const getEmployerAddress = () => {
    const cd = employer?.contact_data as any;
    return {
      name: employer?.name || '–',
      street: cd?.street || '',
      plzCity: cd?.plz && cd?.city ? `${cd.plz} ${cd.city}` : (cd?.city || ''),
    };
  };

  const getEmployeeAddress = (assistant: Assistant) => {
    const cd = assistant.contract_data as any;
    return {
      name: assistant.name || '–',
      street: cd?.street || '',
      plzCity: cd?.plz && cd?.city ? `${cd.plz} ${cd.city}` : (cd?.city || ''),
    };
  };

  const downloadIvInvoicePdf = () => {
    const cd = employer?.contact_data as any;
    const insuredName = employer?.name || `${cd?.first_name || ''} ${cd?.last_name || ''}`.trim() || '–';
    const issuerName =
      employer?.representation === 'guardian'
        ? `${cd?.first_name || ''} ${cd?.last_name || ''}`.trim() || insuredName
        : insuredName;

    const invoiceIssuerEmailPhone = [
      cd?.email || '',
      cd?.phone || '',
    ].filter(Boolean).join(' · ');

    const rate = Number(String(employer?.iv_rate ?? 35.30).replace(',', '.')) || 35.30;

    const lines: IvInvoiceLine[] = [];
    for (const a of assistants) {
      const hours = timeEntries[a.id];
      if (!hours || hours.totalHours <= 0) continue;

      const byCat = new Map<string, number>();
      for (const e of hours.entries) {
        const cat = (e.category || '').trim() || 'Ohne Kategorie';
        byCat.set(cat, (byCat.get(cat) || 0) + (e.hours || 0));
      }
      for (const [cat, h] of byCat.entries()) {
        const rounded = Number(h.toFixed(2));
        if (rounded <= 0) continue;
        const amount = Number((rounded * rate).toFixed(2));
        lines.push({
          assistantName: a.name || '—',
          activityLabel: cat === 'Ohne Kategorie' ? cat : activityLabelFromCode(cat),
          hours: rounded,
          rateCHF: rate,
          amountCHF: amount,
        });
      }
    }

    lines.sort((x, y) => (x.assistantName + x.activityLabel).localeCompare(y.assistantName + y.activityLabel));
    const totalCHF = Number(lines.reduce((s, l) => s + (l.amountCHF || 0), 0).toFixed(2));

    const monthParts = currentMonth.split('-').map(Number);
    const invoiceDateLabel = new Date().toLocaleDateString('de-CH');
    const monthLabelStr = monthLabel(currentMonth);

    const doc = generateIvInvoicePdf({
      invoiceDateLabel,
      monthLabel: monthLabelStr,
      insuredPerson: {
        name: insuredName,
        ahvNumber: cd?.insured_ahv_number || '',
        street: cd?.affected_street || cd?.street || '',
        plzCity: (cd?.affected_plz && cd?.affected_city)
          ? `${cd.affected_plz} ${cd.affected_city}`
          : (cd?.plz && cd?.city ? `${cd.plz} ${cd.city}` : ''),
      },
      invoiceIssuer: {
        name: issuerName,
        emailPhone: invoiceIssuerEmailPhone,
        street: cd?.street || '',
        plzCity: cd?.plz && cd?.city ? `${cd.plz} ${cd.city}` : '',
      },
      billing: {
        gln: cd?.billing_gln || '',
        referenceNumber: cd?.billing_reference_number || '',
        iban: cd?.billing_iban || '',
        accountHolderName: cd?.billing_account_holder_name || '',
        accountHolderStreet: cd?.billing_account_holder_street || '',
        accountHolderPlzCity: (cd?.billing_account_holder_plz && cd?.billing_account_holder_city)
          ? `${cd.billing_account_holder_plz} ${cd.billing_account_holder_city}`
          : '',
        paymentTermsDays: Number(cd?.payment_terms_days) || 30,
        bankName: cd?.bank_name || '',
      },
      lines,
      totalCHF,
    });

    doc.save(`IV_Rechnung_Assistenzbeitrag_${currentMonth}.pdf`);
    toast.success('IV-Rechnung (Deckblatt) heruntergeladen');
  };

  const formatPlaceDateLabel = () => {
    const cd = employer?.contact_data as any;
    const place = (cd?.city || '').trim();
    const date = new Date().toLocaleDateString('de-CH');
    return place ? `${place}, ${date}` : date;
  };

  // PDF handlers
  const downloadPayslipPdf = (assistant: Assistant, _result: PayrollResult, hours: MonthlyHours) => {
    const cd = assistant.contract_data as any;
    const kanton = employer?.canton || cd?.canton || 'ZH';
    const kantonName = FAK_RATES[kanton]?.name || kanton;
    const stundenlohn = assistant.hourly_rate || 0;
    const vacWeeks = assistant.vacation_weeks || 4;
    const ferienzuschlagRate = vacWeeks === 5 ? 0.1064 : vacWeeks === 6 ? 0.1304 : 0.0833;
    const ferienzuschlagLabel = vacWeeks === 5 ? '10.64%' : vacWeeks === 6 ? '13.04%' : '8.33%';

    const bm = String(cd?.billing_method || 'ordinary').toLowerCase();
    const accountingMethod: PayslipAccountingMethod =
      bm === 'simplified' || bm === 'vereinfacht' ? 'simplified'
        : (bm === 'ordinary_with_withholding' || bm === 'ordinary_quellensteuer') ? 'ordinary_with_withholding'
          : 'ordinary';
    const accountingMethodLabel =
      accountingMethod === 'simplified'
        ? 'Vereinfachtes'
        : accountingMethod === 'ordinary_with_withholding'
          ? 'Ordentliches mit Quellensteuer'
          : 'Ordentliches';

    const nbuRateEmployee = cd?.nbu_employee ? (parseFloat(cd.nbu_employee) / 100) : undefined;
    const payslip = calculatePayslip({
      canton: kanton,
      accountingMethod,
      hourlyRate: stundenlohn,
      hours: hours.totalHours,
      vacationSurchargeRate: ferienzuschlagRate,
      nbuRateEmployee,
    });

    const doc = generatePayslipPdf({
      monthYearLabel: monthLabel(currentMonth),
      placeDateLabel: formatPlaceDateLabel(),
      employer: getEmployerAddress(),
      employee: { ...getEmployeeAddress(assistant), ahvNumber: cd?.ahv_number || '' },
      grundlagen: {
        cantonLabel: `${kantonName}`,
        accountingMethodLabel,
        hourlyRate: stundenlohn,
        hours: hours.totalHours,
        vacationSurchargeLabel: ferienzuschlagLabel,
      },
      accountingMethod,
      result: payslip,
    });

    doc.save(`Lohnabrechnung_${assistant.name.replace(/\s/g, '_')}_${currentMonth}.pdf`);
    toast.success('Lohnabrechnung PDF heruntergeladen');
  };

  const downloadTimesheetPdf = (assistant: Assistant, hours: MonthlyHours) => {
    const doc = generateTimesheetPdf({
      month: monthLabel(currentMonth),
      employer: getEmployerAddress(),
      employee: getEmployeeAddress(assistant),
      entries: hours.entries,
      totalHours: hours.totalHours,
      nightHours: hours.nightHours,
    });

    doc.save(`Stundenzettel_${assistant.name.replace(/\s/g, '_')}_${currentMonth}.pdf`);
    toast.success('Stundenzettel PDF heruntergeladen');
  };

  const buildEinsatzrapportRows = (hours: MonthlyHours) => {
    const parts = currentMonth.split('-').map(Number);
    const year = parts[0] ?? new Date().getFullYear();
    const month = parts[1] ?? new Date().getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();

    // group entries by day (YYYY-MM-DD)
    const byDay: Record<string, MonthlyHours['entries']> = {};
    for (const e of hours.entries) {
      (byDay[e.date] ||= []).push(e);
    }
    for (const d of Object.keys(byDay)) {
      byDay[d]!.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }

    const rows = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const list = byDay[iso] || [];
      const t1 = list[0];
      const t2 = list[1];
      const nightHours = list.filter(e => e.is_night).reduce((s, e) => s + (e.hours || 0), 0);
      const dayHours = list.reduce((s, e) => s + (e.hours || 0), 0);
      rows.push({
        date: iso,
        time1_from: t1?.start_time?.slice(0, 5) || '',
        time1_to: t1?.end_time?.slice(0, 5) || '',
        time1_hours: t1 ? Number((t1.hours || 0).toFixed(2)) : undefined,
        time1_activity: t1?.is_night ? '' : (t1?.category || ''),
        time2_from: t2?.start_time?.slice(0, 5) || '',
        time2_to: t2?.end_time?.slice(0, 5) || '',
        time2_hours: t2 ? Number((t2.hours || 0).toFixed(2)) : undefined,
        time2_activity: t2?.is_night ? '' : (t2?.category || ''),
        day_hours: Number(dayHours.toFixed(2)),
        night_hours: Number(nightHours.toFixed(2)),
      });
    }
    return rows;
  };

  const downloadEinsatzrapportPdf = async (assistant: Assistant, hours: MonthlyHours, includeActivities: boolean) => {
    const cd = (assistant.contract_data as any) || {};
    // persist preference for assistant time entry UI
    await supabase
      .from('assistant')
      .update({ contract_data: { ...cd, time_entry_requires_activity_breakdown: includeActivities } })
      .eq('id', assistant.id);

    const doc = generateEinsatzrapportPdf({
      monthLabel: monthLabel(currentMonth),
      assistantName: assistant.name || '—',
      employerName: employer?.name || '—',
      includeActivities,
      rows: buildEinsatzrapportRows(hours),
      totalHours: Number(hours.totalHours.toFixed(2)),
      totalNights: Math.round(hours.nightHours),
    });
    doc.save(`Einsatzrapport_${assistant.name.replace(/\\s/g, '_')}_${currentMonth}.pdf`);
    toast.success('Einsatzrapport PDF heruntergeladen');
  };

  const downloadEinsatzrapportDocx = async (assistant: Assistant, hours: MonthlyHours, includeActivities: boolean) => {
    const cd = (assistant.contract_data as any) || {};
    await supabase
      .from('assistant')
      .update({ contract_data: { ...cd, time_entry_requires_activity_breakdown: includeActivities } })
      .eq('id', assistant.id);

    const parts = currentMonth.split('-').map(Number);
    const year = parts[0] ?? new Date().getFullYear();
    const month = parts[1] ?? new Date().getMonth() + 1;
    const rows = buildEinsatzrapportRows(hours).map((r: any) => ({
      dateLabel: `${String(new Date(r.date + 'T00:00:00').getDate()).padStart(2, '0')}.${String(month).padStart(2, '0')}.`,
      time1_from: r.time1_from,
      time1_to: r.time1_to,
      time1_hours: r.time1_hours != null ? String(r.time1_hours.toFixed(2)) : '',
      time1_activity: r.time1_activity ? (ACTIVITY_LABELS[r.time1_activity] || r.time1_activity) : '',
      time2_from: r.time2_from,
      time2_to: r.time2_to,
      time2_hours: r.time2_hours != null ? String(r.time2_hours.toFixed(2)) : '',
      time2_activity: r.time2_activity ? (ACTIVITY_LABELS[r.time2_activity] || r.time2_activity) : '',
      day_hours: r.day_hours != null ? String(r.day_hours.toFixed(2)) : '',
      night_hours: r.night_hours != null ? String(r.night_hours.toFixed(2)) : '',
    }));

    const blob = await generateEinsatzrapportDocx({
      title: `Einsatzrapport für geleistete persönliche Assistenz für die Lohnabrechnung für ${MONTH_NAMES[month - 1]} ${year}`,
      assistantName: assistant.name || '—',
      employerName: employer?.name || '—',
      includeActivities,
      rows,
      totalHoursLabel: Number(hours.totalHours.toFixed(2)).toFixed(2),
      totalNightsLabel: String(Math.round(hours.nightHours)),
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Einsatzrapport_${assistant.name.replace(/\\s/g, '_')}_${currentMonth}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('Einsatzrapport DOCX heruntergeladen');
  };

  // Stats
  const totalHoursAll = Object.values(timeEntries).reduce((s, h) => s + h.totalHours, 0);
  const confirmedCount = assistants.filter(a => confirmedMap[`${a.id}-${currentMonth}`]).length;

  const payrollResults = useMemo(() => {
    const results: Record<string, PayrollResult | null> = {};
    for (const a of assistants) {
      const hours = timeEntries[a.id];
      if (hours) {
        results[a.id] = generatePayslip(a, hours);
      } else {
        results[a.id] = null;
      }
    }
    return results;
  }, [assistants, timeEntries, currentMonth, employer]);

  const totalNettoAll = assistants.reduce((s, a) => {
    return s + (payrollResults[a.id]?.nettolohn.perYear || 0);
  }, 0);

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto' }}>
      {/* ── HERO HEADER ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%)',
        borderRadius: 20,
        padding: '32px 36px 28px',
        marginBottom: 28,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: 160, height: 160, borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
        }} />
        <div style={{
          position: 'absolute', bottom: -20, right: 80,
          width: 100, height: 100, borderRadius: '50%',
          background: 'rgba(255,255,255,0.03)',
        }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Calculator style={{ width: 20, height: 20, color: '#fff' }} />
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
                Lohnabrechnung
              </h1>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: 0 }}>
              Automatisch berechnet aus Vertragsdaten und erfassten Stunden
            </p>
          </div>

          {/* Month selector */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 12, padding: '6px 6px',
            backdropFilter: 'blur(10px)',
          }}>
            <button
              onClick={() => shiftMonth(-1)}
              style={{
                width: 34, height: 34, borderRadius: 8, border: 'none',
                background: 'rgba(255,255,255,0.08)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(255,255,255,0.7)', transition: 'all 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            >
              <ChevronLeft style={{ width: 18, height: 18 }} />
            </button>
            <span style={{
              fontSize: 14, fontWeight: 700, color: '#fff',
              minWidth: 140, textAlign: 'center',
              letterSpacing: '-0.01em',
            }}>
              {monthLabel(currentMonth)}
            </span>
            <button
              onClick={() => shiftMonth(1)}
              style={{
                width: 34, height: 34, borderRadius: 8, border: 'none',
                background: 'rgba(255,255,255,0.08)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(255,255,255,0.7)', transition: 'all 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            >
              <ChevronRight style={{ width: 18, height: 18 }} />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 24, position: 'relative', zIndex: 1 }}>
          <StatCard icon={<Users style={{ width: 16, height: 16 }} />} label="Personen" value={String(assistants.length)} />
          <StatCard icon={<Clock style={{ width: 16, height: 16 }} />} label="Stunden" value={fmt(totalHoursAll)} />
          <StatCard icon={<ShieldCheck style={{ width: 16, height: 16 }} />} label="Bestätigt" value={`${confirmedCount}/${assistants.length}`} />
        </div>
      </div>

      {/* ── ASSISTANT CARDS (Flow) ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
          <div style={{
            width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#3b82f6',
            borderRadius: '50%', margin: '0 auto 12px',
            animation: 'spin 0.8s linear infinite',
          }} />
          Lade Daten...
        </div>
      ) : assistants.length === 0 ? (
        <div style={{
          background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
          padding: '48px 32px', textAlign: 'center',
        }}>
          <Users style={{ width: 40, height: 40, color: '#cbd5e1', margin: '0 auto 12px', display: 'block' }} />
          <p style={{ color: '#94a3b8', fontSize: 15 }}>Noch keine Assistenzpersonen erfasst.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {assistants.map(a => {
            const hours = timeEntries[a.id] || { totalHours: 0, nightHours: 0, entryCount: 0, entries: [] };
            const result = payrollResults[a.id];
            const confirmed = confirmedMap[`${a.id}-${currentMonth}`] || false;
            const isExpanded = expandedId === a.id;

            return (
              <div
                key={a.id}
                ref={isExpanded ? expandedRef : undefined}
                style={{
                  background: '#fff',
                  borderRadius: 16,
                  border: isExpanded ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                  overflow: 'hidden',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: isExpanded
                    ? '0 8px 30px rgba(59, 130, 246, 0.12), 0 2px 8px rgba(0,0,0,0.04)'
                    : '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                {/* ── Card header (always visible) ── */}
                <button
                  onClick={() => toggleExpand(a.id)}
                  style={{
                    width: '100%', border: 'none', background: 'transparent',
                    cursor: 'pointer', padding: '18px 22px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: confirmed
                        ? 'linear-gradient(135deg, #d1fae5, #a7f3d0)'
                        : 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {confirmed
                        ? <ShieldCheck style={{ width: 22, height: 22, color: '#059669' }} />
                        : <span style={{ fontSize: 18, fontWeight: 700, color: '#3b82f6' }}>{a.name.charAt(0)}</span>
                      }
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: 0 }}>{a.name}</p>
                      <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>
                        {hours.entryCount} Einträge · {fmt(hours.totalHours)} Std
                        {hours.nightHours > 0 && ` · ${fmt(hours.nightHours)} Nacht`}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {result ? (
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                          CHF {fmt(result.totalaufwandAG.perYear)}
                        </p>
                        <p style={{ fontSize: 11, color: '#94a3b8', margin: '1px 0 0' }}>
                          Auszuzahlender Nettolohn: CHF {fmt(result.nettolohn.perYear)}
                        </p>
                      </div>
                    ) : (
                      <p style={{ fontSize: 12, color: '#cbd5e1', fontStyle: 'italic' }}>Keine Stunden</p>
                    )}
                    <div style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: isExpanded ? '#3b82f6' : '#f1f5f9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.3s',
                    }}>
                      <ChevronDown style={{
                        width: 16, height: 16,
                        color: isExpanded ? '#fff' : '#94a3b8',
                        transition: 'transform 0.3s',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      }} />
                    </div>
                  </div>
                </button>

                {/* ── Expanded content ── */}
                {isExpanded && (
                  <div style={{
                    borderTop: '1px solid #e2e8f0',
                    animation: 'slideDown 0.3s ease-out',
                  }}>
                    {/* Step indicator */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 0, padding: '12px 22px',
                      background: '#f8fafc', borderBottom: '1px solid #f1f5f9',
                      flexWrap: 'wrap',
                    }}>
                      <button
                        onClick={() => setFlowStep('stunden')}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '7px 14px', borderRadius: 8 ,
                          border: 'none', cursor: 'pointer',
                          fontSize: 12, fontWeight: flowStep === 'stunden' ? 600 : 500,
                          background: flowStep === 'stunden' ? '#fff' : 'transparent',
                          color: flowStep === 'stunden' ? '#1e293b' : '#94a3b8',
                          boxShadow: flowStep === 'stunden' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{
                          width: 18, height: 18, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          background: flowStep === 'stunden' ? '#1e293b' : '#cbd5e1',
                          color: '#fff',
                        }}>1</span>
                        Stunden prüfen ({hours.entryCount})
                      </button>
                      <ArrowRight style={{ width: 14, height: 14, color: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />
                      <button
                        onClick={() => setFlowStep('abrechnung')}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '7px 14px', borderRadius: 8,
                          border: 'none', cursor: 'pointer',
                          fontSize: 12, fontWeight: flowStep === 'abrechnung' ? 600 : 500,
                          background: flowStep === 'abrechnung' ? '#fff' : 'transparent',
                          color: flowStep === 'abrechnung' ? '#1e293b' : '#94a3b8',
                          boxShadow: flowStep === 'abrechnung' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{
                          width: 18, height: 18, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          background: flowStep === 'abrechnung' ? '#1e293b' : '#cbd5e1',
                          color: '#fff',
                        }}>2</span>
                        Lohnabrechnung
                      </button>
                      <ArrowRight style={{ width: 14, height: 14, color: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />
                      <button
                        onClick={() => setFlowStep('dokumente')}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '7px 14px', borderRadius: 8,
                          border: 'none', cursor: 'pointer',
                          fontSize: 12, fontWeight: flowStep === 'dokumente' ? 600 : 500,
                          background: flowStep === 'dokumente' ? '#fff' : 'transparent',
                          color: flowStep === 'dokumente' ? '#1e293b' : '#94a3b8',
                          boxShadow: flowStep === 'dokumente' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{
                          width: 18, height: 18, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          background: flowStep === 'dokumente' ? '#1e293b' : '#cbd5e1',
                          color: '#fff',
                        }}>3</span>
                        Dokumente (IV)
                      </button>
                    </div>

                    <div style={{ padding: '20px 22px 22px' }}>

                      {/* ── STEP 1: Stunden prüfen ── */}
                      {flowStep === 'stunden' && (
                        <div>
                          {/* Quick summary row */}
                          {result && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                                <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', margin: '0 0 4px' }}>Gesamtkosten Arbeitgebender</p>
                                <p style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: 0, fontVariantNumeric: 'tabular-nums' }}>CHF {fmt(result.totalaufwandAG.perYear)}</p>
                                <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>
                                  Sozialversicherungsbeiträge Arbeitgebender + Bruttolohn
                                </p>
                              </div>
                              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                                <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', margin: '0 0 4px' }}>Bruttolohn</p>
                                <p style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: 0, fontVariantNumeric: 'tabular-nums' }}>CHF {fmt(result.bruttolohn.perYear)}</p>
                                <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{fmt(hours.totalHours)} Std × CHF {fmt(a.hourly_rate || 0)}</p>
                              </div>
                              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                                <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', margin: '0 0 4px' }}>Auszuzahlender Nettolohn</p>
                                <p style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: 0, fontVariantNumeric: 'tabular-nums' }}>CHF {fmt(result.nettolohn.perYear)}</p>
                                <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>CHF {fmt(result.nettolohn.perHour)}/Std</p>
                              </div>
                              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                                <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', margin: '0 0 4px' }}>Status</p>
                                <p style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: 0 }}>{confirmed ? '✓ Bestätigt' : 'Offen'}</p>
                                <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>Einträge: {hours.entryCount}</p>
                              </div>
                            </div>
                          )}

                          {hours.entries.length === 0 ? (
                            <div style={{
                              padding: '32px 20px', textAlign: 'center',
                              background: '#f8fafc', borderRadius: 12,
                            }}>
                              <Clock style={{ width: 32, height: 32, color: '#cbd5e1', margin: '0 auto 8px', display: 'block' }} />
                              <p style={{ color: '#94a3b8', fontSize: 14 }}>Keine Einträge für {monthLabel(currentMonth)}.</p>
                            </div>
                          ) : (
                            <>
                              <div style={{
                                borderRadius: 12, border: '1px solid #e2e8f0',
                                overflow: 'hidden', marginBottom: 14,
                              }}>
                                {hours.entries
                                  .sort((a, b) => a.date.localeCompare(b.date))
                                  .map((e, idx) => {
                                    const d = new Date(e.date + 'T00:00:00');
                                    const dayName = d.toLocaleDateString('de-CH', { weekday: 'short' });
                                    const dayNum = d.getDate();
                                    const isEditing = editingEntryId === e.id;

                                    return (
                                      <div key={e.id} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '10px 16px',
                                        borderBottom: idx < hours.entries.length - 1 ? '1px solid #f1f5f9' : 'none',
                                        background: isEditing ? '#f8fafc' : 'transparent',
                                        transition: 'background 0.15s',
                                      }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                          <div style={{
                                            width: 38, height: 38, borderRadius: 8,
                                            background: '#f1f5f9',
                                            display: 'flex', flexDirection: 'column',
                                            alignItems: 'center', justifyContent: 'center',
                                          }}>
                                            <span style={{ fontSize: 9, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, lineHeight: 1 }}>{dayName}</span>
                                            <span style={{ fontSize: 14, fontWeight: 700, color: '#334155', lineHeight: 1 }}>{dayNum}</span>
                                          </div>
                                          <div>
                                            {isEditing ? (
                                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <input
                                                  type="time"
                                                  value={editStart}
                                                  onChange={ev => setEditStart(ev.target.value)}
                                                  style={{
                                                    padding: '3px 8px', border: '1px solid #cbd5e1',
                                                    borderRadius: 6, fontSize: 13, width: 85,
                                                  }}
                                                />
                                                <span style={{ color: '#94a3b8', fontSize: 13 }}>–</span>
                                                <input
                                                  type="time"
                                                  value={editEnd}
                                                  onChange={ev => setEditEnd(ev.target.value)}
                                                  style={{
                                                    padding: '3px 8px', border: '1px solid #cbd5e1',
                                                    borderRadius: 6, fontSize: 13, width: 85,
                                                  }}
                                                />
                                              </div>
                                            ) : (
                                              <p style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', margin: 0 }}>{e.start_time} – {e.end_time}</p>
                                            )}
                                            <p style={{ fontSize: 11, color: '#94a3b8', margin: '1px 0 0' }}>
                                              {formatActivityForInlineDisplay(e.category)}{e.is_night && ' 🌙'}
                                            </p>
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <span style={{ fontSize: 13, fontWeight: 700, color: '#334155', fontVariantNumeric: 'tabular-nums' }}>
                                            {isEditing ? fmt(parseHours(editStart, editEnd)) : fmt(e.hours)} Std
                                          </span>
                                          {isEditing ? (
                                            <div style={{ display: 'flex', gap: 4 }}>
                                              <button
                                                onClick={() => saveEdit(e.id)}
                                                style={{
                                                  width: 28, height: 28, borderRadius: 6, border: 'none',
                                                  background: '#e2e8f0', color: '#334155', cursor: 'pointer',
                                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}
                                              >
                                                <Save style={{ width: 14, height: 14 }} />
                                              </button>
                                              <button
                                                onClick={cancelEditing}
                                                style={{
                                                  width: 28, height: 28, borderRadius: 6, border: 'none',
                                                  background: '#f1f5f9', color: '#64748b', cursor: 'pointer',
                                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}
                                              >
                                                <X style={{ width: 14, height: 14 }} />
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() => startEditing(e)}
                                              style={{
                                                width: 28, height: 28, borderRadius: 6, border: 'none',
                                                background: 'transparent', color: '#94a3b8', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                transition: 'all 0.15s',
                                              }}
                                              onMouseEnter={ev => { ev.currentTarget.style.background = '#f1f5f9'; ev.currentTarget.style.color = '#475569'; }}
                                              onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.color = '#94a3b8'; }}
                                            >
                                              <Pencil style={{ width: 13, height: 13 }} />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>

                              {/* Total */}
                              <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '12px 16px', background: '#f8fafc', borderRadius: 10,
                                marginBottom: 14,
                              }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Total</span>
                                <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                                  {fmt(hours.totalHours)} Std
                                </span>
                              </div>
                            </>
                          )}

                          {/* Navigation buttons */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: 12,
                            alignItems: 'stretch',
                          }}>
                            {result && (
                              <ActionButton
                                onClick={() => setFlowStep('abrechnung')}
                                icon={<ArrowRight style={{ width: 15, height: 15 }} />}
                                label="Weiter zur Lohnabrechnung"
                                variant="primary"
                              />
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── STEP 2: Lohnabrechnung erstellen ── */}
                      {flowStep === 'abrechnung' && (
                        <div>
                          {result ? (
                            <>
                              {(() => {
                                const cd = (a.contract_data as any) || {};
                                // Kanton kommt vom Arbeitgeber-Profil (betroffene Person), nicht aus den Assistenzperson-Daten.
                                const kanton = employer?.canton || cd?.canton || 'ZH';
                                const kantonName = FAK_RATES[kanton]?.name || kanton;
                                const stundenlohn = a.hourly_rate || 0;
                                const vacWeeks = a.vacation_weeks || 4;
                                const ferienzuschlagRate = vacWeeks === 5 ? 0.1064 : vacWeeks === 6 ? 0.1304 : 0.0833;
                                const ferienzuschlagLabel = vacWeeks === 5 ? '10.64%' : vacWeeks === 6 ? '13.04%' : '8.33%';

                                const bm = String(cd?.billing_method || 'ordinary').toLowerCase();
                                const accountingMethod: PayslipAccountingMethod =
                                  bm === 'simplified' || bm === 'vereinfacht' ? 'simplified'
                                    : (bm === 'ordinary_with_withholding' || bm === 'ordinary_quellensteuer') ? 'ordinary_with_withholding'
                                      : 'ordinary';
                                const accountingMethodLabel =
                                  accountingMethod === 'simplified'
                                    ? 'Vereinfachtes'
                                    : accountingMethod === 'ordinary_with_withholding'
                                      ? 'Ordentliches mit Quellensteuer'
                                      : 'Ordentliches';

                                const ktvRateEmployee = cd?.ktv_employee ? (parseFloat(cd.ktv_employee) / 100) : undefined;
                                const nbuRateEmployee = cd?.nbu_employee ? (parseFloat(cd.nbu_employee) / 100) : undefined;
                                const withholdingTaxRate = cd?.withholding_tax_rate ? (parseFloat(cd.withholding_tax_rate) / 100) : undefined;

                                const payslip = calculatePayslip({
                                  canton: kanton,
                                  accountingMethod,
                                  hourlyRate: stundenlohn,
                                  hours: hours.totalHours,
                                  vacationSurchargeRate: ferienzuschlagRate,
                                  ktvRateEmployee,
                                  nbuRateEmployee,
                                  withholdingTaxRate,
                                });

                                const findDeduction = (label: string) => payslip.deductionLines.find(l => l.label === label && l.enabled !== false) || null;
                                const dAhv = findDeduction('AHV/IV/EO');
                                const dAlv = findDeduction('ALV');
                                const dKtv = findDeduction('KTV');
                                const dNbu = findDeduction('NBU');
                                const dQst = findDeduction('Quellensteuer');
                                const dFak = findDeduction('FAK');

                                return (
                                  <>
                                    {/* Grundlagen (template-like) */}
                                    <div style={{
                                      borderRadius: 10, border: '1px solid #e2e8f0',
                                      overflow: 'hidden', marginBottom: 16,
                                    }}>
                                      <div style={{ background: '#f8fafc', padding: '8px 14px', borderBottom: '1px solid #e2e8f0' }}>
                                        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', margin: 0 }}>
                                          Grundlagen
                                        </p>
                                      </div>
                                      <div style={{ fontSize: 13 }}>
                                        <InfoRow label="Kanton" value={`${kantonName} (${kanton})`} />
                                        <InfoRow label="Abrechnungsverfahren" value={accountingMethodLabel} alt />
                                        <InfoRow label="Stundenlohn" value={`Fr. ${fmt(stundenlohn)}`} />
                                        <InfoRow label="Anzahl Stunden" value={fmt(hours.totalHours)} alt />
                                      </div>
                                    </div>

                                    {/* Lohn (template rows, always same structure) */}
                                    <PaySection title="Lohn">
                                      <PayRow label="Arbeitslohn" perH={payslip.wageLines.workWage.perHour} perM={payslip.wageLines.workWage.perMonth} />
                                      <PayRow label="Ferienzuschlag" rate={payslip.wageLines.vacationSurcharge.rate} perH={payslip.wageLines.vacationSurcharge.perHour} perM={payslip.wageLines.vacationSurcharge.perMonth} />
                                      <PayRow label="Bruttolohn" perH={payslip.wageLines.grossWage.perHour} perM={payslip.wageLines.grossWage.perMonth} bold />
                                    </PaySection>

                                    {/* Abzüge (template rows, only employee-side) */}
                                    <PaySection title="Abzüge">
                                      <PayRow label="AHV/IV/EO" rate={dAhv?.rate ?? null} perH={dAhv?.perHour} perM={dAhv?.perMonth ?? 0} />
                                      <PayRow label="ALV" rate={dAlv?.rate ?? null} perH={dAlv?.perHour} perM={dAlv?.perMonth ?? 0} />
                                      <PayRow label="KTV" rate={dKtv?.rate ?? null} perH={dKtv?.perHour} perM={dKtv?.perMonth ?? 0} />
                                      <PayRow label="NBU" rate={dNbu?.rate ?? null} perH={dNbu?.perHour} perM={dNbu?.perMonth ?? 0} />
                                      <PayRow label="Quellensteuer" rate={dQst?.rate ?? null} perH={dQst?.perHour} perM={dQst?.perMonth ?? 0} />
                                      {dFak && (
                                        <PayRow label="FAK (nur Wallis)" rate={dFak.rate ?? null} perH={dFak.perHour} perM={dFak.perMonth ?? 0} />
                                      )}
                                      <PayRow label="Total Abzüge" perH={payslip.totalDeductions.perHour} perM={payslip.totalDeductions.perMonth} bold />
                                      <PayRow label="Nettolohn" perH={payslip.netWage.perHour} perM={payslip.netWage.perMonth} bold highlight />
                                    </PaySection>
                                  </>
                                );
                              })()}

                              {/* Action buttons */}
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                                gap: 10,
                                marginBottom: 12,
                                alignItems: 'stretch',
                              }}>
                                <ActionButton
                                  onClick={() => setFlowStep('stunden')}
                                  icon={<ArrowLeft style={{ width: 15, height: 15 }} />}
                                  label="Zurück zu den Stunden"
                                  variant="outline"
                                />
                              </div>

                              {/* Confirm */}
                              {!confirmed ? (
                                <div>
                                  <div style={{
                                    display: 'flex',
                                    gap: 10,
                                    alignItems: 'flex-start',
                                    padding: '12px 14px',
                                    borderRadius: 12,
                                    border: '1px solid #e2e8f0',
                                    background: '#f8fafc',
                                    marginBottom: 10,
                                  }}>
                                    <ShieldCheck style={{ width: 18, height: 18, color: '#0f172a', flexShrink: 0, marginTop: 1 }} />
                                    <div>
                                      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                                        Hinweis
                                      </p>
                                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.35 }}>
                                        Wenn Sie bestätigen, erscheint die Lohnabrechnung automatisch im Dashboard und die relevanten Dokumente für diese Assistenzperson werden generiert.
                                        Anschliessend gelangen Sie automatisch zu <span style={{ fontWeight: 700, color: '#334155' }}>„Dokumente (IV)“</span>.
                                      </p>
                                    </div>
                                  </div>

                                  <button
                                    onClick={() => handleConfirm(a.id, a.name)}
                                    style={{
                                      width: '100%', padding: '14px 20px', borderRadius: 12,
                                      border: 'none', cursor: 'pointer',
                                      background: 'linear-gradient(135deg, #059669, #047857)',
                                      color: '#fff', fontWeight: 700, fontSize: 14,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                      transition: 'all 0.2s',
                                      boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(5, 150, 105, 0.4)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(5, 150, 105, 0.3)'; }}
                                  >
                                    <ShieldCheck style={{ width: 18, height: 18 }} />
                                    Abrechnung bestätigen & freigeben
                                  </button>
                                </div>
                              ) : (
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: 12,
                                  padding: '14px 16px', borderRadius: 12,
                                  background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
                                  border: '1px solid #a7f3d0',
                                }}>
                                  <ShieldCheck style={{ width: 20, height: 20, color: '#059669' }} />
                                  <div>
                                    <p style={{ fontSize: 14, fontWeight: 700, color: '#065f46', margin: 0 }}>✅ Abrechnung bestätigt</p>
                                    <p style={{ fontSize: 12, color: '#059669', margin: '2px 0 0' }}>{a.name} sieht diese Abrechnung jetzt im Zugangslink.</p>
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <div style={{
                              padding: '32px 20px', textAlign: 'center',
                              background: '#f8fafc', borderRadius: 12,
                            }}>
                              <Clock style={{ width: 32, height: 32, color: '#cbd5e1', margin: '0 auto 8px', display: 'block' }} />
                              <p style={{ color: '#94a3b8', fontSize: 14 }}>
                                Keine Stunden erfasst – kein Lohnbudget möglich.
                              </p>
                              <button
                                onClick={() => setFlowStep('stunden')}
                                style={{
                                  marginTop: 12, padding: '8px 16px', borderRadius: 8,
                                  border: '1px solid #e2e8f0', background: '#fff',
                                  fontSize: 13, fontWeight: 500, color: '#3b82f6',
                                  cursor: 'pointer',
                                }}
                              >
                                Zu den Stunden
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── STEP 3: Dokumente (IV) ── */}
                      {flowStep === 'dokumente' && (
                        <div>
                          <div style={{
                            borderRadius: 14,
                            border: '1px solid #e2e8f0',
                            background: '#fff',
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              padding: '10px 14px',
                              background: '#f8fafc',
                              borderBottom: '1px solid #e2e8f0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                            }}>
                              <div>
                                <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>
                                  Dokumente für IV / Ablage
                                </p>
                                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>
                                  Optional – nach dem Freigeben exportieren
                                </p>
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <ActionButton
                                  onClick={() => setFlowStep('abrechnung')}
                                  icon={<ArrowLeft style={{ width: 15, height: 15 }} />}
                                  label="Zurück"
                                  variant="outline"
                                />
                              </div>
                            </div>
                            <div style={{ padding: 12 }}>
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                gap: 12,
                                alignItems: 'stretch',
                              }}>
                                <DocCard
                                  title="IV-Rechnung (Deckblatt)"
                                  subtitle="Monatliche Rechnung über alle Assistenzpersonen"
                                  fileType="PDF"
                                  icon={<Download style={{ width: 18, height: 18 }} />}
                                  tone="primary"
                                  disabled={assistants.length === 0 || totalHoursAll === 0}
                                  onClick={downloadIvInvoicePdf}
                                />
                                {result && (
                                  <DocCard
                                    title="Lohnabrechnung"
                                    subtitle="Für Lohnlauf & Ablage"
                                    fileType="PDF"
                                    icon={<Download style={{ width: 18, height: 18 }} />}
                                    tone="primary"
                                    onClick={() => downloadPayslipPdf(a, result, hours)}
                                  />
                                )}
                                <DocCard
                                  title="Stundenzettel"
                                  subtitle="Monatliche Stundenübersicht"
                                  fileType="PDF"
                                  icon={<FileText style={{ width: 18, height: 18 }} />}
                                  disabled={hours.totalHours === 0}
                                  onClick={() => downloadTimesheetPdf(a, hours)}
                                />
                                <DocCardMulti
                                  title="Einsatzrapport"
                                  subtitle="Mit Tätigkeiten"
                                  badge="Tätigkeiten"
                                  icon={<Download style={{ width: 18, height: 18 }} />}
                                  disabled={hours.totalHours === 0}
                                  primaryAction={() => downloadEinsatzrapportPdf(a, hours, true)}
                                  actions={[
                                    { kind: 'PDF', onClick: () => downloadEinsatzrapportPdf(a, hours, true) },
                                    { kind: 'DOCX', onClick: () => downloadEinsatzrapportDocx(a, hours, true) },
                                  ]}
                                />
                                <DocCardMulti
                                  title="Einsatzrapport"
                                  subtitle="Standard"
                                  icon={<Download style={{ width: 18, height: 18 }} />}
                                  disabled={hours.totalHours === 0}
                                  primaryAction={() => downloadEinsatzrapportPdf(a, hours, false)}
                                  actions={[
                                    { kind: 'PDF', onClick: () => downloadEinsatzrapportPdf(a, hours, false) },
                                    { kind: 'DOCX', onClick: () => downloadEinsatzrapportDocx(a, hours, false) },
                                  ]}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Animation keyframes */}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 2000px; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ──

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.07)',
      borderRadius: 12, padding: '14px 16px',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, color: 'rgba(255,255,255,0.45)' }}>
        {icon}
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <p style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  );
}

function FlowTab({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', borderRadius: 8,
        border: 'none', cursor: 'pointer',
        fontSize: 12, fontWeight: active ? 600 : 500,
        background: active ? '#fff' : 'transparent',
        color: active ? '#1e293b' : '#94a3b8',
        boxShadow: active ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
        transition: 'all 0.2s',
      }}
    >
      {icon} {label}
    </button>
  );
}

function SummaryBox({ label, value, sublabel, color, bg }: {
  label: string; value: string; sublabel: string; color: string; bg: string;
}) {
  return (
    <div style={{
      background: bg, borderRadius: 12, padding: '14px 16px',
    }}>
      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color, margin: '0 0 4px', opacity: 0.7 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 800, color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      <p style={{ fontSize: 11, color, margin: '2px 0 0', opacity: 0.6 }}>{sublabel}</p>
    </div>
  );
}

function ActionButton({ onClick, icon, label, variant, disabled }: {
  onClick: () => void; icon: React.ReactNode; label: string;
  variant: 'primary' | 'outline'; disabled?: boolean;
}) {
  const isPrimary = variant === 'primary';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 14,
        border: isPrimary ? 'none' : '1px solid #e2e8f0',
        background: isPrimary ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : '#f8fafc',
        color: isPrimary ? '#fff' : '#475569',
        fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'all 0.2s',
        boxShadow: isPrimary ? '0 6px 18px rgba(37, 99, 235, 0.22)' : '0 1px 2px rgba(15, 23, 42, 0.06)',
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = isPrimary
          ? '0 10px 24px rgba(37, 99, 235, 0.28)'
          : '0 8px 22px rgba(15, 23, 42, 0.08)';
        if (!isPrimary) e.currentTarget.style.background = '#fff';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = isPrimary
          ? '0 6px 18px rgba(37, 99, 235, 0.22)'
          : '0 1px 2px rgba(15, 23, 42, 0.06)';
        if (!isPrimary) e.currentTarget.style.background = '#f8fafc';
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isPrimary ? 'rgba(255,255,255,0.18)' : '#eef2ff',
          color: isPrimary ? '#fff' : '#1d4ed8',
          flexShrink: 0,
        }}>
          {icon}
        </span>
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      </span>
      <span style={{
        width: 28,
        height: 28,
        borderRadius: 10,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isPrimary ? 'rgba(255,255,255,0.14)' : '#eef2ff',
        color: isPrimary ? 'rgba(255,255,255,0.95)' : '#1d4ed8',
        flexShrink: 0,
      }}>
        <ArrowRight style={{ width: 14, height: 14 }} />
      </span>
    </button>
  );
}

function DocCard({
  title,
  subtitle,
  fileType,
  badge,
  icon,
  disabled,
  tone,
  onClick,
}: {
  title: string;
  subtitle: string;
  fileType: 'PDF' | 'DOCX';
  badge?: string;
  icon: React.ReactNode;
  disabled?: boolean;
  tone?: 'default' | 'primary';
  onClick: () => void;
}) {
  const isPrimary = tone === 'primary';
  const typeColor = fileType === 'PDF' ? { fg: '#1d4ed8', bg: '#eef2ff', border: '#c7d2fe' } : { fg: '#0f766e', bg: '#ecfeff', border: '#a5f3fc' };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        borderRadius: 16,
        border: isPrimary ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid #e2e8f0',
        background: isPrimary ? 'linear-gradient(135deg, rgba(59,130,246,0.16), rgba(37,99,235,0.08))' : '#fff',
        padding: 14,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        textAlign: 'left',
        transition: 'transform 0.18s, box-shadow 0.18s, background 0.18s',
        boxShadow: isPrimary ? '0 10px 28px rgba(37, 99, 235, 0.12)' : '0 1px 2px rgba(15, 23, 42, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 170,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = isPrimary
          ? '0 16px 34px rgba(37, 99, 235, 0.18)'
          : '0 14px 30px rgba(15, 23, 42, 0.10)';
        if (!isPrimary) e.currentTarget.style.background = '#f8fafc';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = isPrimary
          ? '0 10px 28px rgba(37, 99, 235, 0.12)'
          : '0 1px 2px rgba(15, 23, 42, 0.06)';
        if (!isPrimary) e.currentTarget.style.background = '#fff';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: isPrimary ? 'rgba(59,130,246,0.18)' : '#f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isPrimary ? '#2563eb' : '#334155',
            flexShrink: 0,
          }}>
            {icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>{title}</span>
              <span style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.08em',
                padding: '4px 8px',
                borderRadius: 999,
                border: `1px solid ${typeColor.border}`,
                background: typeColor.bg,
                color: typeColor.fg,
              }}>
                {fileType}
              </span>
              {badge && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  padding: '4px 8px',
                  borderRadius: 999,
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  color: '#475569',
                }}>
                  {badge}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {subtitle}
            </div>
          </div>
        </div>

        <div style={{
          width: 32,
          height: 32,
          borderRadius: 12,
          background: isPrimary ? 'rgba(37,99,235,0.12)' : '#eef2ff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isPrimary ? '#1d4ed8' : '#1d4ed8',
          flexShrink: 0,
        }}>
          <ArrowRight style={{ width: 16, height: 16 }} />
        </div>
      </div>

      {/* Document preview */}
      <div style={{
        flex: 1,
        borderRadius: 14,
        border: isPrimary ? '1px solid rgba(59,130,246,0.22)' : '1px solid #e2e8f0',
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(120px 80px at 25% 20%, rgba(59,130,246,0.10), transparent 60%), radial-gradient(140px 90px at 80% 60%, rgba(99,102,241,0.08), transparent 60%)',
          pointerEvents: 'none',
        }} />
        <div style={{ padding: 12, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{
              height: 10,
              width: '44%',
              borderRadius: 999,
              background: '#e2e8f0',
            }} />
            <div style={{
              height: 10,
              width: 54,
              borderRadius: 999,
              background: isPrimary ? 'rgba(37,99,235,0.18)' : '#e2e8f0',
            }} />
          </div>
          <div style={{ display: 'grid', gap: 7 }}>
            <div style={{ height: 9, width: '92%', borderRadius: 999, background: '#e2e8f0' }} />
            <div style={{ height: 9, width: '86%', borderRadius: 999, background: '#e2e8f0' }} />
            <div style={{ height: 9, width: '90%', borderRadius: 999, background: '#e2e8f0' }} />
            <div style={{ height: 9, width: '78%', borderRadius: 999, background: '#e2e8f0' }} />
          </div>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ height: 32, borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe' }} />
            <div style={{ height: 32, borderRadius: 12, background: '#f1f5f9', border: '1px solid #e2e8f0' }} />
          </div>
        </div>
      </div>
    </button>
  );
}

function DocCardMulti({
  title,
  subtitle,
  badge,
  icon,
  disabled,
  tone,
  primaryAction,
  actions,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  icon: React.ReactNode;
  disabled?: boolean;
  tone?: 'default' | 'primary';
  primaryAction: () => void;
  actions: Array<{ kind: 'PDF' | 'DOCX'; onClick: () => void }>;
}) {
  const isPrimary = tone === 'primary';
  const btnBase: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.08em',
    padding: '4px 8px',
    borderRadius: 999,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: '1px solid #e2e8f0',
    background: '#fff',
    color: '#475569',
    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
  };

  const typeStyles = (kind: 'PDF' | 'DOCX') => {
    return kind === 'PDF'
      ? { fg: '#1d4ed8', bg: '#eef2ff', border: '#c7d2fe' }
      : { fg: '#0f766e', bg: '#ecfeff', border: '#a5f3fc' };
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => { if (!disabled) primaryAction(); }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          primaryAction();
        }
      }}
      style={{
        width: '100%',
        borderRadius: 16,
        border: isPrimary ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid #e2e8f0',
        background: isPrimary ? 'linear-gradient(135deg, rgba(59,130,246,0.16), rgba(37,99,235,0.08))' : '#fff',
        padding: 14,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        textAlign: 'left',
        transition: 'transform 0.18s, box-shadow 0.18s, background 0.18s',
        boxShadow: isPrimary ? '0 10px 28px rgba(37, 99, 235, 0.12)' : '0 1px 2px rgba(15, 23, 42, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 170,
        userSelect: 'none',
        outline: 'none',
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = isPrimary
          ? '0 16px 34px rgba(37, 99, 235, 0.18)'
          : '0 14px 30px rgba(15, 23, 42, 0.10)';
        if (!isPrimary) e.currentTarget.style.background = '#f8fafc';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = isPrimary
          ? '0 10px 28px rgba(37, 99, 235, 0.12)'
          : '0 1px 2px rgba(15, 23, 42, 0.06)';
        if (!isPrimary) e.currentTarget.style.background = '#fff';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: isPrimary ? 'rgba(59,130,246,0.18)' : '#f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isPrimary ? '#2563eb' : '#334155',
            flexShrink: 0,
          }}>
            {icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>{title}</span>
              {badge && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  padding: '4px 8px',
                  borderRadius: 999,
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  color: '#475569',
                }}>
                  {badge}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {subtitle}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {actions.map((a) => {
            const s = typeStyles(a.kind);
            return (
              <button
                key={a.kind}
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!disabled) a.onClick();
                }}
                style={{
                  ...btnBase,
                  border: `1px solid ${s.border}`,
                  background: s.bg,
                  color: s.fg,
                }}
              >
                {a.kind}
              </button>
            );
          })}
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 12,
            background: isPrimary ? 'rgba(37,99,235,0.12)' : '#eef2ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#1d4ed8',
            flexShrink: 0,
          }}>
            <ArrowRight style={{ width: 16, height: 16 }} />
          </div>
        </div>
      </div>

      {/* Document preview (same visual language as DocCard) */}
      <div style={{
        flex: 1,
        borderRadius: 14,
        border: isPrimary ? '1px solid rgba(59,130,246,0.22)' : '1px solid #e2e8f0',
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(120px 80px at 25% 20%, rgba(59,130,246,0.10), transparent 60%), radial-gradient(140px 90px at 80% 60%, rgba(99,102,241,0.08), transparent 60%)',
          pointerEvents: 'none',
        }} />
        <div style={{ padding: 12, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{
              height: 10,
              width: '44%',
              borderRadius: 999,
              background: '#e2e8f0',
            }} />
            <div style={{
              height: 10,
              width: 54,
              borderRadius: 999,
              background: isPrimary ? 'rgba(37,99,235,0.18)' : '#e2e8f0',
            }} />
          </div>
          <div style={{ display: 'grid', gap: 7 }}>
            <div style={{ height: 9, width: '92%', borderRadius: 999, background: '#e2e8f0' }} />
            <div style={{ height: 9, width: '86%', borderRadius: 999, background: '#e2e8f0' }} />
            <div style={{ height: 9, width: '90%', borderRadius: 999, background: '#e2e8f0' }} />
            <div style={{ height: 9, width: '78%', borderRadius: 999, background: '#e2e8f0' }} />
          </div>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ height: 32, borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe' }} />
            <div style={{ height: 32, borderRadius: 12, background: '#f1f5f9', border: '1px solid #e2e8f0' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, alt }: { label: string; value: string; alt?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '6px 14px',
      background: alt ? '#f8fafc' : 'transparent',
    }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: '#1e293b' }}>{value}</span>
    </div>
  );
}

function PaySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: 10, border: '1px solid #e2e8f0',
      overflow: 'hidden', marginBottom: 12,
    }}>
      <div style={{ background: '#f8fafc', padding: '8px 14px', borderBottom: '1px solid #e2e8f0' }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', margin: 0 }}>
          {title}
        </p>
      </div>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <th style={{ textAlign: 'left', padding: '6px 14px', fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}></th>
            <th style={{ textAlign: 'right', padding: '6px 14px', fontSize: 10, fontWeight: 600, color: '#94a3b8', width: 70 }}>Satz</th>
            <th style={{ textAlign: 'right', padding: '6px 14px', fontSize: 10, fontWeight: 600, color: '#94a3b8', width: 95 }}>Pro Std</th>
            <th style={{ textAlign: 'right', padding: '6px 14px', fontSize: 10, fontWeight: 600, color: '#94a3b8', width: 95 }}>Total</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function PayRow({ label, rate, perH, perM, bold, highlight }: {
  label: string; rate?: number | null; perH?: number; perM: number;
  bold?: boolean; highlight?: boolean;
}) {
  return (
    <tr style={{
      borderBottom: '1px solid #f1f5f9',
      fontWeight: bold ? 600 : 400,
      background: highlight ? '#eff6ff' : 'transparent',
    }}>
      <td style={{ padding: '6px 14px', color: '#334155' }}>{label}</td>
      <td style={{ padding: '6px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>
        {rate != null ? fmtPct(rate) : ''}
      </td>
      <td style={{ padding: '6px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#475569' }}>
        {perH != null ? `Fr. ${fmt(perH)}` : ''}
      </td>
      <td style={{ padding: '6px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: bold ? '#0f172a' : '#475569' }}>
        Fr. {fmt(perM)}
      </td>
    </tr>
  );
}
