import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@asklepios/backend';
import type { Assistant } from '@asklepios/backend';
import {
  Clock, XCircle, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  CheckCircle2, List, Pencil, Trash2, Moon, FileText, ShieldCheck, AlertCircle
} from 'lucide-react';
import { calculatePayroll, FAK_RATES, fmt, fmtPct, type PayrollInput } from '@asklepios/backend';

// Official IV-Assistenzbeitrag categories (Art. 39c IVG)
const CATEGORIES = [
  'Alltägliche Lebensverrichtungen',
  'Haushaltsführung',
  'Gesellschaftliche Teilhabe und Freizeit',
  'Erziehung und Kinderbetreuung',
  'Gemeinnützige / ehrenamtliche Tätigkeit',
  'Berufliche Aus- und Weiterbildung',
  'Erwerbstätigkeit im 1. Arbeitsmarkt',
  'Überwachung während des Tages',
];

interface TimeEntry {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  is_night: boolean;
  category?: string;
  confirmed: boolean;
}

function parseTimeToMinutes(t: string): number | null {
  const s = (t || '').trim();
  if (!s) return null;
  const [hhRaw, mmRaw] = s.split(':');
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh === 24 && mm === 0) return 24 * 60;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function diffHours(start: string, end: string): number {
  const s = parseTimeToMinutes(start);
  const e = parseTimeToMinutes(end);
  if (s == null || e == null) return 0;
  const raw = e - s;
  const minutes = raw >= 0 ? raw : raw + 24 * 60;
  return Math.max(0, minutes / 60);
}

function nextIsoDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function TokenLoginPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [employer, setEmployer] = useState<{ name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs
  const [tab, setTab] = useState<'erfassen' | 'protokoll' | 'lohn'>('erfassen');

  // Form state
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startH, setStartH] = useState(8);
  const [startM, setStartM] = useState(0);
  const [endH, setEndH] = useState(12);
  const [endM, setEndM] = useState(0);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [isNight, setIsNight] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Protocol state
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError('Kein Token angegeben.'); setLoading(false); return; }
    lookupAssistant(token);
  }, [token]);

  useEffect(() => {
    if (assistant) loadEntries();
  }, [assistant]);

  const lookupAssistant = async (tkn: string) => {
    try {
      let { data, error: err } = await supabase
        .from('assistant').select('*, employer:employer_id(name)')
        .eq('access_token', tkn).single();
      if (!data || err) {
        const fb = await supabase.from('assistant').select('*, employer:employer_id(name)').eq('id', tkn).single();
        data = fb.data; err = fb.error;
      }
      if (!data || err) { setError('Ungültiger Login-Link.'); setLoading(false); return; }
      setAssistant(data as Assistant);
      if ((data as any).employer) setEmployer((data as any).employer);
    } catch { setError('Verbindungsfehler.'); }
    finally { setLoading(false); }
  };

  const loadEntries = async () => {
    if (!assistant) return;
    const { data } = await supabase
      .from('time_entry').select('*')
      .eq('assistant_id', assistant.id)
      .order('date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(50);
    if (data) setEntries(data as TimeEntry[]);
  };

  const pad = (n: number) => n.toString().padStart(2, '0');
  const fmtTime = (h: number, m: number) => `${pad(h)}:${pad(m)}`;

  const shiftDate = (dir: number) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + dir);
    setDate(d.toISOString().slice(0, 10));
  };

  const formatDateLabel = (iso: string) => {
    const d = new Date(iso + 'T12:00:00');
    const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    return `${days[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  };

  const handleSave = async () => {
    if (!assistant) return;
    setSaving(true);
    const startTime = fmtTime(startH, startM);
    const endTime = fmtTime(endH, endM);

    if (editingId) {
      const sMin = parseTimeToMinutes(startTime);
      const eMin = parseTimeToMinutes(endTime);
      const crossesMidnight = sMin != null && eMin != null && eMin < sMin;
      if (crossesMidnight) {
        setSaving(false);
        return;
      }
      await supabase.from('time_entry').update({
        date, start_time: startTime, end_time: endTime, is_night: isNight,
      }).eq('id', editingId);
      setEditingId(null);
    } else {
      const sMin = parseTimeToMinutes(startTime);
      const eMin = parseTimeToMinutes(endTime);
      const crossesMidnight = sMin != null && eMin != null && eMin < sMin;

      if (!crossesMidnight) {
        await supabase.from('time_entry').insert({
          assistant_id: assistant.id, date,
          start_time: startTime, end_time: endTime,
          is_night: isNight, entered_by: 'assistant', confirmed: false,
        });
      } else {
        const nextDate = nextIsoDate(date);
        await supabase.from('time_entry').insert([
          {
            assistant_id: assistant.id,
            date,
            start_time: startTime,
            end_time: '24:00',
            is_night: true,
            entered_by: 'assistant',
            confirmed: false,
          },
          {
            assistant_id: assistant.id,
            date: nextDate,
            start_time: '00:00',
            end_time: endTime,
            is_night: true,
            entered_by: 'assistant',
            confirmed: false,
          },
        ]);
      }
    }

    setSaving(false);
    await loadEntries();

    // Show confetti, then switch to Protokoll
    setShowConfetti(true);
    setTimeout(() => {
      setShowConfetti(false);
      setTab('protokoll');
    }, 1500);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('time_entry').delete().eq('id', id);
    await loadEntries();
  };

  const startEdit = (e: TimeEntry) => {
    setDate(e.date);
    const parts = e.start_time.split(':');
    const endParts = e.end_time.split(':');
    setStartH(Number(parts[0]) || 0); setStartM(Number(parts[1]) || 0);
    setEndH(Number(endParts[0]) || 0); setEndM(Number(endParts[1]) || 0);
    setIsNight(e.is_night);
    setEditingId(e.id);
    setTab('erfassen');
  };

  // ─── Spinner for hours/minutes ───
  const Spinner = ({ value, onChange, max }: { value: number; onChange: (v: number) => void; max: number }) => (
    <div className="flex flex-col items-center">
      <button type="button" onClick={() => onChange((value + 1) % (max + 1))}
        className="w-full flex justify-center py-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition">
        <ChevronUp className="w-5 h-5 text-slate-500" />
      </button>
      <span className="text-4xl font-black tabular-nums py-2">{pad(value)}</span>
      <button type="button" onClick={() => onChange((value - 1 + max + 1) % (max + 1))}
        className="w-full flex justify-center py-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition">
        <ChevronDown className="w-5 h-5 text-slate-500" />
      </button>
    </div>
  );

  // ─── Loading ───
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );

  // ─── Error ───
  if (error || !assistant) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="text-center space-y-4 max-w-sm">
        <XCircle className="w-12 h-12 text-red-400 mx-auto" />
        <h1 className="text-xl font-bold">Link ungültig</h1>
        <p className="text-slate-500">{error || 'Nicht gefunden.'}</p>
        <button onClick={() => navigate('/login')} className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-medium">
          Zur Anmeldung
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative overflow-hidden">
      {/* Confetti overlay */}
      {showConfetti && (
        <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
          {Array.from({ length: 40 }).map((_, i) => {
            const left = Math.random() * 100;
            const delay = Math.random() * 0.5;
            const duration = 1 + Math.random() * 1;
            const size = 6 + Math.random() * 6;
            const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            const rotate = Math.random() * 360;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${left}%`,
                  top: '-10px',
                  width: `${size}px`,
                  height: `${size * 1.5}px`,
                  backgroundColor: color,
                  borderRadius: '2px',
                  transform: `rotate(${rotate}deg)`,
                  animation: `confetti-fall ${duration}s ease-in ${delay}s forwards`,
                }}
              />
            );
          })}
          <style>{`
            @keyframes confetti-fall {
              0% { transform: translateY(0) rotate(0deg); opacity: 1; }
              100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
            }
          `}</style>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-white/90 backdrop-blur rounded-2xl shadow-2xl px-8 py-6 text-center animate-bounce">
              <p className="text-3xl mb-1">🎉</p>
              <p className="text-lg font-bold text-slate-900">Gespeichert!</p>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-semibold text-sm">{assistant.name}</span>
          </div>
          {/* Tabs */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setTab('erfassen')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition
              ${tab === 'erfassen' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
              <Clock className="w-4 h-4" /> Erfassen
            </button>
            <button onClick={() => setTab('protokoll')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition
              ${tab === 'protokoll' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
              <List className="w-4 h-4" /> Protokoll
            </button>
            <button onClick={() => setTab('lohn')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition
              ${tab === 'lohn' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
              <FileText className="w-4 h-4" /> Lohn
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-6 space-y-5">
        {tab === 'erfassen' ? (
          /* ... existing erfassen content stays ... */
          <>
            {/* Date picker */}
            <div className="bg-white rounded-2xl shadow-sm border p-4 flex items-center justify-between">
              <button onClick={() => shiftDate(-1)} className="p-2 rounded-lg hover:bg-slate-100"><ChevronLeft className="w-5 h-5" /></button>
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Datum</p>
                <p className="text-lg font-bold">{formatDateLabel(date || new Date().toISOString().slice(0, 10))}</p>
              </div>
              <button onClick={() => shiftDate(1)} className="p-2 rounded-lg hover:bg-slate-100"><ChevronRight className="w-5 h-5" /></button>
            </div>

            {/* Time pickers */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl shadow-sm border p-4">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold text-center mb-2">Von</p>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
                  <Spinner value={startH} onChange={setStartH} max={23} />
                  <span className="text-2xl font-bold text-slate-300">:</span>
                  <Spinner value={startM} onChange={setStartM} max={59} />
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border p-4">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold text-center mb-2">Bis</p>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
                  <Spinner value={endH} onChange={setEndH} max={23} />
                  <span className="text-2xl font-bold text-slate-300">:</span>
                  <Spinner value={endM} onChange={setEndM} max={59} />
                </div>
              </div>
            </div>

            {/* Category */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2">Tätigkeit</p>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-primary/20 text-base font-medium bg-white focus:outline-none focus:border-primary">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Night shift toggle (MVP 1: intentionally disabled / out of scope) */}
            <div className="bg-white rounded-2xl shadow-sm border px-5 py-4 flex items-center justify-between opacity-60">
              <div className="flex items-center gap-3">
                <Moon className="w-5 h-5 text-slate-400" />
                <span className="font-semibold text-base">Nachtdienst</span>
              </div>
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="MVP 1: Nachtzuschläge sind noch out of scope"
                className="relative inline-flex h-7 w-14 shrink-0 items-center rounded-full transition-colors bg-slate-200 cursor-not-allowed"
              >
                <span className="inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 translate-x-1" />
              </button>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span className="font-semibold">Hinweis (MVP 1):</span> Nachtdienst / Nachtzuschläge sind aktuell out of scope. Bitte erfasse die Zeiten ohne Nachtdienst-Markierung.
            </div>

            {/* Save button */}
            <button onClick={handleSave} disabled={saving}
              className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-lg transition-all shadow-lg shadow-emerald-200 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50">
              <CheckCircle2 className="w-6 h-6" />
              {editingId ? 'AKTUALISIEREN' : 'SPEICHERN'}
            </button>

            {editingId && (
              <button onClick={() => { setEditingId(null); setTab('protokoll'); }}
                className="w-full py-3 text-slate-500 font-medium text-sm">
                Bearbeitung abbrechen
              </button>
            )}
          </>
        ) : tab === 'protokoll' ? (
          /* ─── Protocol tab ─── */
          <>
            {entries.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">Noch keine Einträge</p>
              </div>
            ) : (
              <div className="space-y-3">
                {entries.map(e => {
                  const d = new Date(e.date + 'T12:00:00');
                  const dayLabel = formatDateLabel(e.date);
                  
                  const hours = diffHours(e.start_time, e.end_time).toFixed(1);

                  return (
                    <div key={e.id} className="bg-white rounded-xl border shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-700">{dayLabel}</span>
                        <div className="flex items-center gap-1">
                          {e.is_night && <Moon className="w-4 h-4 text-indigo-400" />}
                          {e.confirmed
                            ? <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Bestätigt</span>
                            : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Offen</span>}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-lg font-bold tabular-nums">{e.start_time.slice(0,5)} – {e.end_time.slice(0,5)}</span>
                          <span className="text-sm text-slate-400 ml-2">({hours}h)</span>
                        </div>
                        {!e.confirmed && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEdit(e)}
                              className="p-2 rounded-lg hover:bg-blue-50 text-blue-500 transition">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(e.id)}
                              className="p-2 rounded-lg hover:bg-red-50 text-red-400 transition">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Weekly transfer info */}
            <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 text-center">
              <p className="text-sm text-blue-700 font-medium">
                📤 Deine Stunden werden wöchentlich automatisch an deinen Arbeitgeber übermittelt.
              </p>
            </div>
          </>
        ) : tab === 'lohn' ? (
          <LohnTab assistant={assistant} employerName={employer?.name || ''} entries={entries} />
        ) : null}
      </div>
    </div>
  );
}

// ─── Lohn Tab Component ───
function LohnTab({ assistant, employerName, entries }: { assistant: Assistant; employerName: string; entries: TimeEntry[] }) {
  const cd = assistant.contract_data as any;
  
  // Demo: current month
  const now = new Date();
  const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const currentMonth = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

  // Calculate actual logged hours for the current month
  const currentMonthEntries = entries.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const trackedHours = currentMonthEntries.reduce((sum, e) => {
    return sum + diffHours(e.start_time, e.end_time);
  }, 0);
  
  // Build payroll from assistant's contract data
  const stundenlohn = assistant.hourly_rate || (cd?.hourly_rate ? parseFloat(cd.hourly_rate) : 30);
  const stunden = Number(trackedHours.toFixed(2));
  const kanton = cd?.canton || 'ZH';
  const vacWeeks = assistant.vacation_weeks || 4;
  const ferienzuschlag = vacWeeks === 5 ? 0.1064 : vacWeeks === 6 ? 0.1304 : 0.0833;
  
  const result = calculatePayroll({
    stundenlohn,
    anzahlStunden: stunden,
    kanton,
    abrechnungsverfahren: 'ordentlich',
    ferienzuschlag,
    nbuAN: cd?.nbu_employee ? parseFloat(cd.nbu_employee) / 100 : undefined,
  });

  // Wait, I already moved demo current month above to calculate trackedHours.
  // I will just remove the old code for currentMonth here to avoid double declaration.

  // Demo confirmation status (in production this would come from DB)
  const [isConfirmed] = useState(false);

  const Row = ({ label, rate, perHour, perYear, bold }: {
    label: string; rate?: number | null; perHour: number; perYear: number; bold?: boolean;
  }) => (
    <div className={`flex items-center justify-between py-1.5 ${bold ? 'font-bold' : ''}`}>
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-4">
        {rate != null && <span className="text-xs text-slate-400 tabular-nums w-14 text-right">{fmtPct(rate)}</span>}
        {rate == null && <span className="w-14" />}
        <span className="text-sm tabular-nums w-20 text-right">{fmt(perYear)}</span>
      </div>
    </div>
  );

  return (
    <>
      {/* Month header */}
      <div className="bg-white rounded-2xl shadow-sm border p-4 text-center">
        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Lohnabrechnung</p>
        <p className="text-lg font-bold">{currentMonth}</p>
        <p className="text-xs text-slate-500">{stunden} Stunden · CHF {fmt(stundenlohn)}/Std</p>
      </div>

      {/* Confirmation status */}
      <div className={`rounded-xl border p-3 flex items-center gap-3 ${
        isConfirmed 
          ? 'bg-emerald-50 border-emerald-200' 
          : 'bg-amber-50 border-amber-200'
      }`}>
        {isConfirmed ? (
          <>
            <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Bestätigt durch {employerName}</p>
              <p className="text-xs text-emerald-600">Diese Abrechnung wurde vom Arbeitgeber freigegeben.</p>
            </div>
          </>
        ) : (
          <>
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Noch nicht bestätigt</p>
              <p className="text-xs text-amber-600">Warte auf Freigabe durch {employerName || 'deinen Arbeitgeber'}.</p>
            </div>
          </>
        )}
      </div>

      {/* Payslip card */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-50 border-b">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-slate-400 font-bold">
            <span>Position</span>
            <span>CHF / Monat</span>
          </div>
        </div>

        <div className="px-4 py-3 space-y-0.5">
          {/* Lohn */}
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold pt-1 pb-1">Lohn</p>
          <Row label="Arbeitslohn" perHour={result.arbeitslohn.perHour} perYear={result.arbeitslohn.perYear} />
          {result.ferienzuschlag.perYear > 0 && (
            <Row label="Ferienzuschlag" rate={result.ferienzuschlag.rate} perHour={result.ferienzuschlag.perHour} perYear={result.ferienzuschlag.perYear} />
          )}
          <div className="border-t my-1.5" />
          <Row label="Bruttolohn" perHour={result.bruttolohn.perHour} perYear={result.bruttolohn.perYear} bold />

          {/* AN deductions */}
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold pt-3 pb-1">Abzüge</p>
          {result.anLines.map((l, i) => (
            <Row key={i} label={l.label} rate={l.rate} perHour={l.perHour} perYear={l.perYear} />
          ))}
          <div className="border-t my-1.5" />
          <Row label="Total Abzüge" perHour={result.totalAN.perHour} perYear={result.totalAN.perYear} bold />
        </div>

        {/* Nettolohn highlight */}
        <div className="px-4 py-4 bg-emerald-50 border-t border-emerald-200">
          <div className="flex items-center justify-between">
            <span className="font-bold text-emerald-800">Nettolohn</span>
            <span className="text-xl font-black tabular-nums text-emerald-700">CHF {fmt(result.nettolohn.perYear)}</span>
          </div>
          <p className="text-xs text-emerald-600 mt-0.5">CHF {fmt(result.nettolohn.perHour)} pro Stunde</p>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 text-center">
        <p className="text-sm text-blue-700 font-medium">
          📄 Die offizielle Lohnabrechnung wird dir nach Bestätigung vom Arbeitgeber zugestellt.
        </p>
      </div>
    </>
  );
}
