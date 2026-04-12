import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmt } from '../services/payroll';
import { formatIvCategoryForInlineDisplay } from './iv-assistance-categories';
import { PDF_THEME } from './pdf-theme';

interface TimesheetEntry {
  date: string;
  start_time: string;
  end_time: string;
  hours: number;
  is_night: boolean;
  category?: string;
}

interface TimesheetPdfData {
  /** Titel des Dokuments (Default: "Stundenzettel") */
  title?: string;
  month: string; // e.g. "März 2026"
  employer: { name: string; street?: string; plzCity?: string };
  employee: { name: string; street?: string; plzCity?: string };
  entries: TimesheetEntry[];
  totalHours: number;
  nightHours: number;
  /** Tätigkeiten-Spalte anzeigen (Default: true) */
  includeActivities?: boolean;
}

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAY_NAMES_FULL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function formatActivity(category?: string): string {
  const raw = (category || '').trim();
  if (!raw) return '–';

  // If already formatted (e.g. "2 · Haushaltsführung"), keep it.
  if (raw.includes('·')) return raw;

  return formatIvCategoryForInlineDisplay(raw);
}

export function generateTimesheetPdf(data: TimesheetPdfData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  const W = PDF_THEME.INNER_W;
  const LM = PDF_THEME.LM;
  let y = 15;
  const includeActivities = data.includeActivities !== false;

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(data.title || 'Stundenzettel', LM, y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(data.month, LM + W, y, { align: 'right' });
  y += 10;

  // AG / AN boxes (gleiche Gesamtbreite wie Tabellen: INNER_W)
  const gap = 4;
  const boxW = (W - gap) / 2;

  doc.setFillColor(...PDF_THEME.accentRgb);
  doc.rect(LM, y, boxW, 22, 'F');
  doc.setDrawColor(...PDF_THEME.borderRgb);
  doc.rect(LM, y, boxW, 22, 'S');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Arbeitgebender', LM + 3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(data.employer.name || '–', LM + 3, y + 10);
  if (data.employer.street) doc.text(data.employer.street, LM + 3, y + 14.5);
  if (data.employer.plzCity) doc.text(data.employer.plzCity, LM + 3, y + 19);

  const lm2 = LM + boxW + gap;
  doc.setFillColor(...PDF_THEME.accentRgb);
  doc.rect(lm2, y, boxW, 22, 'F');
  doc.setDrawColor(...PDF_THEME.borderRgb);
  doc.rect(lm2, y, boxW, 22, 'S');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Arbeitnehmender', lm2 + 3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(data.employee.name || '–', lm2 + 3, y + 10);
  if (data.employee.street) doc.text(data.employee.street, lm2 + 3, y + 14.5);
  if (data.employee.plzCity) doc.text(data.employee.plzCity, lm2 + 3, y + 19);

  y += 28;

  // Entries table
  const sorted = [...data.entries].sort((a, b) => a.date.localeCompare(b.date));
  const body = sorted.map(e => {
    const d = new Date(e.date + 'T00:00:00');
    const dayIdx = d.getDay();
    const dayName = DAY_NAMES[dayIdx] || '';
    const baseDate = `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;

    // If the end time is earlier than the start time, the shift crosses midnight (next day).
    const crossesMidnight =
      typeof e.start_time === 'string' &&
      typeof e.end_time === 'string' &&
      e.start_time.trim() !== '' &&
      e.end_time.trim() !== '' &&
      e.end_time < e.start_time;

    let dateStr = `${dayName} ${baseDate}`;
    if (crossesMidnight) {
      const d2 = new Date(e.date + 'T00:00:00');
      d2.setDate(d2.getDate() + 1);
      const day2 = DAY_NAMES_FULL[d2.getDay()] || '';
      const day1 = DAY_NAMES_FULL[dayIdx] || '';
      const baseDate2 = `${d2.getDate().toString().padStart(2, '0')}.${(d2.getMonth() + 1).toString().padStart(2, '0')}.${d2.getFullYear()}`;
      // Match user expectation: "Dienstag bis Mittwoch" + the date range.
      dateStr = `${day1} bis ${day2} ${baseDate}–${baseDate2}`;
    }
    return [
      dateStr,
      e.start_time,
      e.end_time,
      fmt(e.hours),
      e.is_night ? '🌙' : '',
      ...(includeActivities ? [formatActivity(e.category)] : []),
    ];
  });

  // Summary row
  body.push([
    { content: 'TOTAL', styles: { fontStyle: 'bold' as const } } as any,
    '', '',
    { content: fmt(data.totalHours), styles: { fontStyle: 'bold' as const } } as any,
    data.nightHours > 0 ? fmt(data.nightHours) : '',
    ...(includeActivities ? [''] : []),
  ]);

  const colVon = 22;
  const colBis = 22;
  const colStd = 24;
  const colNacht = 14;
  const colTatMin = 56;
  const colDateWithAct = W - colVon - colBis - colStd - colNacht - colTatMin;
  const colDateNoAct = W - colVon - colBis - colStd - colNacht;
  const colDate = includeActivities ? Math.max(40, colDateWithAct) : colDateNoAct;
  const colTat = includeActivities ? W - colDate - colVon - colBis - colStd - colNacht : 0;
  const columnStyles: Record<number, { cellWidth: number; halign?: 'left' | 'center' | 'right' }> = {
    0: { cellWidth: colDate },
    1: { cellWidth: colVon, halign: 'center' },
    2: { cellWidth: colBis, halign: 'center' },
    3: { cellWidth: colStd, halign: 'right' },
    4: { cellWidth: colNacht, halign: 'center' },
  };
  if (includeActivities) {
    columnStyles[5] = { cellWidth: colTat };
  }

  autoTable(doc, {
    startY: y,
    tableWidth: W,
    head: [[
      'Datum', 'Von', 'Bis', 'Stunden', 'Nacht',
      ...(includeActivities ? ['Tätigkeit'] : []),
    ]],
    body,
    theme: 'grid',
    headStyles: {
      fillColor: [...PDF_THEME.accentRgb],
      textColor: PDF_THEME.textDark,
      fontSize: 8,
      fontStyle: 'bold',
    },
    bodyStyles: { fontSize: 9 },
    columnStyles,
    margin: { left: LM, right: PDF_THEME.RM },
    styles: { lineColor: PDF_THEME.borderRgb, lineWidth: 0.1 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Summary box
  doc.setFillColor(...PDF_THEME.accentRgb);
  doc.rect(LM, y, W, 18, 'F');
  doc.setDrawColor(...PDF_THEME.borderRgb);
  doc.rect(LM, y, W, 18, 'S');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Stunden: ${fmt(data.totalHours)}`, LM + 5, y + 7);
  if (data.nightHours > 0) {
    doc.text(`davon Nacht: ${fmt(data.nightHours)}`, LM + 5, y + 13);
  }
  doc.text(`Einträge: ${data.entries.length}`, LM + W - 5, y + 7, { align: 'right' });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(PDF_THEME.textMuted);
  doc.text('Erstellt mit Asklepios – IV-Assistenzbeitrag', LM, 287);

  return doc;
}
