import { useState, useEffect } from 'react';
import { supabase } from '@asklepios/backend';
import { useAuth } from '@/contexts/AuthContext';
import {
  calculatePayroll, FAK_RATES, fmt, fmtPct, type PayrollResult
} from '@asklepios/backend';
import { calculatePayslip, generatePayslipPdf, type PayslipAccountingMethod } from '@asklepios/backend';
import { generateTimesheetPdf } from '@asklepios/backend';
import {
  Calculator, FileText, ChevronLeft, ChevronRight, Users,
  ShieldCheck, Clock, Eye, Download, Pencil, Save, X
} from 'lucide-react';
import { toast } from 'sonner';
import type { Assistant } from '@asklepios/backend';

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

export function PayrollPage() {
  const { employerAccess, employer } = useAuth();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);

  // Current month navigation
  const [currentMonth, setCurrentMonth] = useState(() => monthKey(new Date()));

  // Selected assistant for detail view
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmedMap, setConfirmedMap] = useState<Record<string, boolean>>({});

  // Time entries for the month
  const [timeEntries, setTimeEntries] = useState<Record<string, MonthlyHours>>({});

  // Editing state
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  useEffect(() => {
    if (employerAccess?.employer_id) {
      loadData();
    }
  }, [employerAccess, currentMonth]);

  const loadData = async () => {
    setLoading(true);
    const eid = employerAccess!.employer_id;

    // Load assistants
    const { data: aData } = await supabase
      .from('assistant')
      .select('*')
      .eq('employer_id', eid)
      .eq('is_active', true);

    if (aData) setAssistants(aData);

    // Load time entries for the month
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

    // Group by assistant
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
    setSelectedId(null);
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
    // Persist confirmation to DB
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

  // PDF handlers
  const downloadPayslipPdf = () => {
    if (!selectedAssistant || !selectedResult || !selectedHours) return;
    const cd = selectedAssistant.contract_data as any;
    const kanton = employer?.canton || cd?.canton || 'ZH';
    const kantonName = FAK_RATES[kanton]?.name || kanton;
    const stundenlohn = selectedAssistant.hourly_rate || 0;
    const vacWeeks = selectedAssistant.vacation_weeks || 4;
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
      canton,
      accountingMethod,
      hourlyRate: stundenlohn,
      hours: selectedHours.totalHours,
      vacationSurchargeRate: ferienzuschlagRate,
      nbuRateEmployee,
    });

    const doc = generatePayslipPdf({
      monthYearLabel: monthLabel(currentMonth),
      placeDateLabel: '[Ort, Datum]',
      employer: getEmployerAddress(),
      employee: { ...getEmployeeAddress(selectedAssistant), ahvNumber: cd?.ahv_number || '' },
      grundlagen: {
        cantonLabel: `${kantonName}`,
        accountingMethodLabel,
        hourlyRate: stundenlohn,
        hours: selectedHours.totalHours,
        vacationSurchargeLabel: ferienzuschlagLabel,
      },
      accountingMethod,
      result: payslip,
    });

    doc.save(`Lohnabrechnung_${selectedAssistant.name.replace(/\s/g, '_')}_${currentMonth}.pdf`);
    toast.success('Lohnabrechnung PDF heruntergeladen');
  };

  const downloadTimesheetPdf = () => {
    if (!selectedAssistant || !selectedHours) return;

    const doc = generateTimesheetPdf({
      month: monthLabel(currentMonth),
      employer: getEmployerAddress(),
      employee: getEmployeeAddress(selectedAssistant),
      entries: selectedHours.entries,
      totalHours: selectedHours.totalHours,
      nightHours: selectedHours.nightHours,
    });

    doc.save(`Stundenzettel_${selectedAssistant.name.replace(/\s/g, '_')}_${currentMonth}.pdf`);
    toast.success('Stundenzettel PDF heruntergeladen');
  };

  const selectedAssistant = assistants.find(a => a.id === selectedId);
  const selectedHours = selectedId ? timeEntries[selectedId] : null;
  const selectedResult = selectedAssistant && selectedHours ? generatePayslip(selectedAssistant, selectedHours) : null;
  const isSelectedConfirmed = selectedId ? confirmedMap[`${selectedId}-${currentMonth}`] || false : false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calculator className="w-6 h-6 text-primary" /> Lohnabrechnung
        </h1>
        <p className="text-muted-foreground text-sm">Automatisch erstellt aus Vertragsdaten und erfassten Stunden</p>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={() => shiftMonth(-1)} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center min-w-[200px]">
          <p className="text-xl font-bold">{monthLabel(currentMonth)}</p>
        </div>
        <button onClick={() => shiftMonth(1)} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Lade Daten...</div>
      ) : !selectedId ? (
        /* ── OVERVIEW: All assistants ── */
        <div className="space-y-3">
          {assistants.length === 0 ? (
            <div className="bg-card rounded-xl border p-8 text-center">
              <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Noch keine Assistenzpersonen erfasst.</p>
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-card rounded-xl border p-4 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Assistenzpersonen</p>
                  <p className="text-2xl font-black mt-1">{assistants.length}</p>
                </div>
                <div className="bg-card rounded-xl border p-4 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Stunden total</p>
                  <p className="text-2xl font-black mt-1 tabular-nums">
                    {fmt(Object.values(timeEntries).reduce((s, h) => s + h.totalHours, 0))}
                  </p>
                </div>
                <div className="bg-card rounded-xl border p-4 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Bestätigt</p>
                  <p className="text-2xl font-black mt-1">
                    {assistants.filter(a => confirmedMap[`${a.id}-${currentMonth}`]).length}/{assistants.length}
                  </p>
                </div>
              </div>

              {/* Assistant rows */}
              <div className="bg-card rounded-xl border overflow-hidden divide-y">
                {assistants.map(a => {
                  const hours = timeEntries[a.id] || { totalHours: 0, nightHours: 0, entryCount: 0, entries: [] };
                  const result = generatePayslip(a, hours);
                  const confirmed = confirmedMap[`${a.id}-${currentMonth}`] || false;

                  return (
                    <div key={a.id} className="flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                          confirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
                        }`}>
                          {confirmed ? <ShieldCheck className="w-5 h-5" /> : a.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{a.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {hours.entryCount} Einträge · {fmt(hours.totalHours)} Std
                            {hours.nightHours > 0 && ` · ${fmt(hours.nightHours)} Nacht`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {result ? (
                          <div className="text-right">
                            <p className="text-sm font-bold tabular-nums">CHF {fmt(result.nettolohn.perYear)}</p>
                            <p className="text-[10px] text-muted-foreground">Netto | AG-Aufwand: CHF {fmt(result.totalaufwandAG.perYear)}</p>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">Keine Stunden</p>
                        )}

                        <button
                          onClick={() => setSelectedId(a.id)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium transition-colors"
                        >
                          <Eye className="w-4 h-4" /> Details
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        /* ── DETAIL: Single assistant payslip ── */
        <div className="space-y-4">
          <button onClick={() => setSelectedId(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" /> Zurück zur Übersicht
          </button>

          <div className="grid grid-cols-[1fr_340px] gap-6">
            {/* LEFT: Formal payslip document */}
            <div className="space-y-4">
              {/* ── LOHNBUDGET DOCUMENT ── */}
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                {/* Document header */}
                <div className="px-6 py-4 border-b bg-slate-50 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-black">Lohnbudget</h2>
                    <p className="text-xs text-muted-foreground">{monthLabel(currentMonth)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSelectedConfirmed && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                        <ShieldCheck className="w-3.5 h-3.5" /> Bestätigt
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* AG + AN side by side — full address display */}
                  <div className="grid grid-cols-2 gap-6">
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-blue-900 px-3 py-1.5">
                        <p className="text-[10px] uppercase tracking-widest font-bold text-white">Arbeitgebender</p>
                      </div>
                      <div className="divide-y text-sm">
                        <div className="flex justify-between px-3 py-1.5 bg-blue-50/30">
                          <span className="text-muted-foreground">Vorname, Name</span>
                          <span className="font-medium">{employer?.name || '–'}</span>
                        </div>
                        <div className="flex justify-between px-3 py-1.5">
                          <span className="text-muted-foreground">Strasse</span>
                          <span className="font-medium">{(employer?.contact_data as any)?.street || '–'}</span>
                        </div>
                        <div className="flex justify-between px-3 py-1.5 bg-blue-50/30">
                          <span className="text-muted-foreground">PLZ, Wohnort</span>
                          <span className="font-medium">
                            {(employer?.contact_data as any)?.plz && (employer?.contact_data as any)?.city
                              ? `${(employer?.contact_data as any).plz} ${(employer?.contact_data as any).city}`
                              : '–'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-blue-900 px-3 py-1.5">
                        <p className="text-[10px] uppercase tracking-widest font-bold text-white">Arbeitnehmender</p>
                      </div>
                      <div className="divide-y text-sm">
                        <div className="flex justify-between px-3 py-1.5 bg-blue-50/30">
                          <span className="text-muted-foreground">Vorname, Name</span>
                          <span className="font-medium">{selectedAssistant?.name || '–'}</span>
                        </div>
                        <div className="flex justify-between px-3 py-1.5">
                          <span className="text-muted-foreground">Strasse</span>
                          <span className="font-medium">{(selectedAssistant?.contract_data as any)?.street || '–'}</span>
                        </div>
                        <div className="flex justify-between px-3 py-1.5 bg-blue-50/30">
                          <span className="text-muted-foreground">PLZ, Wohnort</span>
                          <span className="font-medium">
                            {(selectedAssistant?.contract_data as any)?.plz && (selectedAssistant?.contract_data as any)?.city
                              ? `${(selectedAssistant?.contract_data as any).plz} ${(selectedAssistant?.contract_data as any).city}`
                              : '–'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Grundlagen */}
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-blue-50/60 px-3 py-1.5 border-b">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-blue-900">Grundlagen</p>
                    </div>
                    <div className="divide-y text-sm">
                      {(() => {
                        const cd = (selectedAssistant?.contract_data as any) || {};
                        // Kanton kommt vom Arbeitgeber-Profil (betroffene Person), nicht aus den Assistenzperson-Daten.
                        const kanton = employer?.canton || cd?.canton || 'ZH';
                        const kantonName = FAK_RATES[kanton]?.name || kanton;
                        const stundenlohn = selectedAssistant?.hourly_rate || 0;
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
                        return (
                          <>
                            <div className="flex justify-between px-3 py-1.5">
                              <span>Kanton</span><span className="font-medium">{kantonName} ({kanton})</span>
                            </div>
                            <div className="flex justify-between px-3 py-1.5">
                              <span>Abrechnungsverfahren</span><span className="font-medium">{accountingMethodLabel}</span>
                            </div>
                            <div className="flex justify-between px-3 py-1.5">
                              <span>Stundenlohn</span><span className="font-medium tabular-nums">Fr. {fmt(stundenlohn)}</span>
                            </div>
                            <div className="flex justify-between px-3 py-1.5">
                              <span>Anzahl Stunden</span><span className="font-medium tabular-nums">{fmt(selectedHours?.totalHours || 0)}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {selectedAssistant && selectedHours ? (
                    <>
                      {(() => {
                        const cd = (selectedAssistant.contract_data as any) || {};
                        const kanton = employer?.canton || cd?.canton || 'ZH';

                        const stundenlohn = selectedAssistant.hourly_rate || 0;
                        const vacWeeks = selectedAssistant.vacation_weeks || 4;
                        const ferienzuschlagRate = vacWeeks === 5 ? 0.1064 : vacWeeks === 6 ? 0.1304 : 0.0833;

                        const bm = String(cd?.billing_method || 'ordinary').toLowerCase();
                        const accountingMethod: PayslipAccountingMethod =
                          bm === 'simplified' || bm === 'vereinfacht' ? 'simplified'
                            : (bm === 'ordinary_with_withholding' || bm === 'ordinary_quellensteuer') ? 'ordinary_with_withholding'
                              : 'ordinary';

                        const ktvRateEmployee = cd?.ktv_employee ? (parseFloat(cd.ktv_employee) / 100) : undefined;
                        const nbuRateEmployee = cd?.nbu_employee ? (parseFloat(cd.nbu_employee) / 100) : undefined;
                        const withholdingTaxRate = cd?.withholding_tax_rate ? (parseFloat(cd.withholding_tax_rate) / 100) : undefined;

                        const payslip = calculatePayslip({
                          canton: kanton,
                          accountingMethod,
                          hourlyRate: stundenlohn,
                          hours: selectedHours.totalHours,
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
                            {/* ── LOHN TABLE ── */}
                            <table className="w-full text-sm border-collapse">
                              <thead>
                                <tr className="bg-blue-50/60 border-y">
                                  <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-blue-900">Lohn</th>
                                  <th className="text-right px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-blue-900 w-20">Sätze</th>
                                  <th className="text-right px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-blue-900 w-28">Pro Stunde</th>
                                  <th className="text-right px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-blue-900 w-28">Pro Monat</th>
                                </tr>
                              </thead>
                              <tbody>
                                <PayTr label="Arbeitslohn" perH={payslip.wageLines.workWage.perHour} perM={payslip.wageLines.workWage.perMonth} />
                                <PayTr label="Ferienzuschlag" rate={payslip.wageLines.vacationSurcharge.rate} perH={payslip.wageLines.vacationSurcharge.perHour} perM={payslip.wageLines.vacationSurcharge.perMonth} />
                                <PayTr label="Bruttolohn" perH={payslip.wageLines.grossWage.perHour} perM={payslip.wageLines.grossWage.perMonth} bold border />
                              </tbody>
                            </table>

                            {/* ── ABZÜGE TABLE (nur Arbeitnehmender) ── */}
                            <table className="w-full text-sm border-collapse">
                              <thead>
                                <tr className="bg-blue-50/60 border-y">
                                  <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-blue-900">Abzüge</th>
                                  <th className="text-right px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-blue-900 w-20">Sätze</th>
                                  <th className="text-right px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-blue-900 w-28">Pro Stunde</th>
                                  <th className="text-right px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-blue-900 w-28">Pro Monat</th>
                                </tr>
                              </thead>
                              <tbody>
                                <PayTr label="AHV/IV/EO" rate={dAhv?.rate ?? null} perH={dAhv?.perHour || 0} perM={dAhv?.perMonth || 0} />
                                <PayTr label="ALV" rate={dAlv?.rate ?? null} perH={dAlv?.perHour || 0} perM={dAlv?.perMonth || 0} />
                                <PayTr label="KTV" rate={dKtv?.rate ?? null} perH={dKtv?.perHour || 0} perM={dKtv?.perMonth || 0} />
                                <PayTr label="NBU" rate={dNbu?.rate ?? null} perH={dNbu?.perHour || 0} perM={dNbu?.perMonth || 0} />
                                <PayTr label="Quellensteuer" rate={dQst?.rate ?? null} perH={dQst?.perHour || 0} perM={dQst?.perMonth || 0} />
                                {dFak && (
                                  <PayTr label="FAK (nur Wallis)" rate={dFak.rate ?? null} perH={dFak.perHour || 0} perM={dFak.perMonth || 0} />
                                )}
                                <PayTr label="Total Abzüge" perH={payslip.totalDeductions.perHour} perM={payslip.totalDeductions.perMonth} bold border />
                                <tr className="h-1" />
                                <PayTr label="Nettolohn" perH={payslip.netWage.perHour} perM={payslip.netWage.perMonth} bold border highlight />
                              </tbody>
                            </table>
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    <div className="py-10 text-center">
                      <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground font-medium">Keine Stunden erfasst in {monthLabel(currentMonth)}.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* PDF Download buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={downloadPayslipPdf}
                  disabled={!selectedResult}
                  className="group flex items-center justify-between gap-3 px-4 py-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 font-bold text-sm transition-all shadow-sm hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 flex-shrink-0">
                      <Download className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">Lohnabrechnung PDF</span>
                      <span className="block text-[11px] font-semibold text-slate-500">Offizielles Dokument</span>
                    </span>
                  </span>
                  <span className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors flex-shrink-0">
                    <ChevronRight className="w-4 h-4" />
                  </span>
                </button>
                <button
                  onClick={downloadTimesheetPdf}
                  disabled={!selectedHours || selectedHours.totalHours === 0}
                  className="group flex items-center justify-between gap-3 px-4 py-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 font-bold text-sm transition-all shadow-sm hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 flex-shrink-0">
                      <FileText className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">Stundenzettel PDF</span>
                      <span className="block text-[11px] font-semibold text-slate-500">Für Ablage & Prüfung</span>
                    </span>
                  </span>
                  <span className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors flex-shrink-0">
                    <ChevronRight className="w-4 h-4" />
                  </span>
                </button>
              </div>

              {/* Confirm button */}
              {selectedResult && (
                !isSelectedConfirmed ? (
                  <button
                    onClick={() => handleConfirm(selectedId!, selectedAssistant!.name)}
                    className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4" /> Abrechnung bestätigen & freigeben
                  </button>
                ) : (
                  <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <div>
                      <p className="text-sm font-bold text-emerald-800">✅ Abrechnung bestätigt</p>
                      <p className="text-xs text-emerald-600">{selectedAssistant?.name} sieht diese Abrechnung jetzt im Zugangslink.</p>
                    </div>
                  </div>
                )
              )}
            </div>

            {/* RIGHT: Time entries list — editable */}
            <div className="space-y-3">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary" /> Erfasste Stunden ({selectedHours?.entryCount || 0})
              </p>

              {(selectedHours?.entries || []).length === 0 ? (
                <div className="bg-card rounded-xl border p-6 text-center text-sm text-muted-foreground">
                  Keine Einträge für diesen Monat.
                </div>
              ) : (
                <div className="bg-card rounded-xl border overflow-hidden divide-y max-h-[600px] overflow-y-auto">
                  {(selectedHours?.entries || [])
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map(e => {
                      const d = new Date(e.date + 'T00:00:00');
                      const dayName = d.toLocaleDateString('de-CH', { weekday: 'short' });
                      const dayNum = d.getDate();
                      const isEditing = editingEntryId === e.id;

                      return (
                        <div key={e.id} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-muted flex flex-col items-center justify-center">
                                <span className="text-[9px] uppercase text-muted-foreground font-bold leading-none">{dayName}</span>
                                <span className="text-sm font-bold leading-none">{dayNum}</span>
                              </div>
                              <div>
                                {isEditing ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="time"
                                      value={editStart}
                                      onChange={ev => setEditStart(ev.target.value)}
                                      className="px-1.5 py-0.5 border rounded text-sm w-[80px]"
                                    />
                                    <span className="text-muted-foreground text-sm">–</span>
                                    <input
                                      type="time"
                                      value={editEnd}
                                      onChange={ev => setEditEnd(ev.target.value)}
                                      className="px-1.5 py-0.5 border rounded text-sm w-[80px]"
                                    />
                                  </div>
                                ) : (
                                  <p className="text-sm font-medium">{e.start_time} – {e.end_time}</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  {e.category || 'Ohne Kategorie'}
                                  {e.is_night && ' 🌙'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold tabular-nums">
                                {isEditing ? fmt(parseHours(editStart, editEnd)) : fmt(e.hours)} Std
                              </span>
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => saveEdit(e.id)}
                                    className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                                    title="Speichern"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={cancelEditing}
                                    className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                                    title="Abbrechen"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => startEditing(e)}
                                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                  title="Bearbeiten"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {(selectedHours?.totalHours || 0) > 0 && (
                <div className="bg-muted/50 rounded-xl p-4 flex items-center justify-between">
                  <span className="text-sm font-bold">Total</span>
                  <span className="text-lg font-black tabular-nums">{fmt(selectedHours!.totalHours)} Std</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Table row component matching Excel layout ──
function PayTr({ label, rate, perH, perM, bold, border, highlight }: {
  label: string; rate?: number | null; perH?: number; perM: number;
  bold?: boolean; border?: boolean; highlight?: boolean;
}) {
  const cls = [
    bold ? 'font-bold' : '',
    border ? 'border-t border-slate-300' : 'border-b border-slate-100',
    highlight ? 'bg-blue-50/60' : '',
  ].filter(Boolean).join(' ');

  return (
    <tr className={cls}>
      <td className="px-3 py-1.5">{label}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{rate != null ? fmtPct(rate) : ''}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{perH != null ? `Fr. ${fmt(perH)}` : ''}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">Fr. {fmt(perM)}</td>
    </tr>
  );
}
