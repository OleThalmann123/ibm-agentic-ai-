import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmt } from '../backend/payroll';

interface TimesheetEntry {
  date: string;
  start_time: string;
  end_time: string;
  hours: number;
  is_night: boolean;
  category?: string;
}

interface TimesheetPdfData {
  month: string; // e.g. "März 2026"
  employer: { name: string; street?: string; plzCity?: string };
  employee: { name: string; street?: string; plzCity?: string };
  entries: TimesheetEntry[];
  totalHours: number;
  nightHours: number;
}

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAY_NAMES_FULL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

const ACTIVITY_BY_DISPLAY_NUMBER: Record<number, string> = {
  1: 'Alltägliche Lebensverrichtungen',
  2: 'Haushaltsführung',
  3: 'Gesellschaftliche Teilhabe und Freizeitgestaltung',
  4: 'Erziehung und Kinderbetreuung',
  5: 'Gemeinnützig/ehrenamtlich',
  6: 'Berufliche Aus- und Weiterbildung',
  7: 'Erwerbstätigkeit (1. Arbeitsmarkt)',
  8: 'Überwachung während des Tages',
};

function formatActivity(category?: string): string {
  const raw = (category || '').trim();
  if (!raw) return '–';

  // If already formatted (e.g. "2 · Haushaltsführung"), keep it.
  if (raw.includes('·')) return raw;

  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;

  // Stored codes are 2–9, but the displayed numbering is 1–8.
  const display = n >= 2 && n <= 9 ? (n - 1) : (n >= 1 && n <= 8 ? n : null);
  if (!display) return raw;

  const label = ACTIVITY_BY_DISPLAY_NUMBER[display];
  return label ? `${display} · ${label}` : String(display);
}

export function generateTimesheetPdf(data: TimesheetPdfData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  const W = 190;
  const LM = 10;
  let y = 15;

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Stundenzettel', LM, y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(data.month, LM + W, y, { align: 'right' });
  y += 10;

  // AG / AN boxes
  const boxW = W / 2 - 3;

  doc.setFillColor(240, 245, 255);
  doc.rect(LM, y, boxW, 22, 'F');
  doc.setDrawColor(30, 64, 175);
  doc.rect(LM, y, boxW, 22, 'S');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Arbeitgebender', LM + 3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(data.employer.name || '–', LM + 3, y + 10);
  if (data.employer.street) doc.text(data.employer.street, LM + 3, y + 14.5);
  if (data.employer.plzCity) doc.text(data.employer.plzCity, LM + 3, y + 19);

  const lm2 = LM + boxW + 6;
  doc.setFillColor(240, 245, 255);
  doc.rect(lm2, y, boxW, 22, 'F');
  doc.setDrawColor(30, 64, 175);
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
      formatActivity(e.category),
    ];
  });

  // Summary row
  body.push([
    { content: 'TOTAL', styles: { fontStyle: 'bold' as const } } as any,
    '', '',
    { content: fmt(data.totalHours), styles: { fontStyle: 'bold' as const } } as any,
    data.nightHours > 0 ? fmt(data.nightHours) : '',
    '',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Datum', 'Von', 'Bis', 'Stunden', 'Nacht', 'Tätigkeit']],
    body,
    theme: 'grid',
    headStyles: { fillColor: [30, 64, 175], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 15, halign: 'center' },
      5: { cellWidth: 60 },
    },
    margin: { left: LM, right: LM },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Summary box
  doc.setFillColor(245, 250, 255);
  doc.rect(LM, y, W, 18, 'F');
  doc.setDrawColor(30, 64, 175);
  doc.rect(LM, y, W, 18, 'S');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Stunden: ${fmt(data.totalHours)}`, LM + 5, y + 7);
  if (data.nightHours > 0) {
    doc.text(`davon Nacht: ${fmt(data.nightHours)}`, LM + 5, y + 13);
  }
  doc.text(`Einträge: ${data.entries.length}`, LM + W - 5, y + 7, { align: 'right' });

  // Signature lines
  y += 30;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setDrawColor(0);
  
  doc.text('Unterschrift Arbeitgebender:', LM, y);
  doc.line(LM, y + 15, LM + boxW, y + 15);
  doc.setFontSize(7);
  doc.text('Datum / Unterschrift', LM, y + 19);

  doc.setFontSize(9);
  doc.text('Unterschrift Arbeitnehmender:', lm2, y);
  doc.line(lm2, y + 15, lm2 + boxW, y + 15);
  doc.setFontSize(7);
  doc.text('Datum / Unterschrift', lm2, y + 19);

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(128);
  doc.text('Erstellt mit Asklepios – IV-Assistenzbeitrag', LM, 287);

  return doc;
}
