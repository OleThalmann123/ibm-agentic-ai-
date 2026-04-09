import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PayslipAccountingMethod, PayslipResult } from '../backend/payslip';
import { PDF_THEME, pdfValueColMm } from './pdf-theme';

const TW = PDF_THEME.INNER_W;
const LABEL = PDF_THEME.labelColMm;
const VALUE = pdfValueColMm();
/** Vier Spalten (Lohn / Abzüge): Summe = INNER_W */
const L0 = 58;
const L1 = 28;
const L2 = 52;
const L3 = TW - L0 - L1 - L2;

export interface PayslipPdfData {
  monthYearLabel?: string; // e.g. "[Monat, Jahr]" or "März 2026"
  placeDateLabel?: string; // e.g. "[Ort, Datum]"
  employer: { name: string; street?: string; plzCity?: string };
  employee: { name: string; street?: string; plzCity?: string; ahvNumber?: string };
  grundlagen: {
    cantonLabel: string;
    accountingMethodLabel: string;
    hourlyRate: number;
    hours: number;
    vacationSurchargeLabel: string;
  };
  accountingMethod: PayslipAccountingMethod;
  result: PayslipResult;
}

function fmtMoney(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  return `Fr. ${value.toFixed(2).replace('.', ',')}`;
}

function fmtPct(n: number | null): string {
  if (n == null) return '';
  return `${(n * 100).toFixed(2).replace('.', ',')}%`;
}

export function generatePayslipPdf(data: PayslipPdfData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  const W = TW;
  const LM = PDF_THEME.LM;
  let y = 15;

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Lohnabrechnung', LM, y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(data.monthYearLabel || '[Monat, Jahr]', LM + W, y, { align: 'right' });
  doc.text(data.placeDateLabel || '[Ort, Datum]', LM + W, y + 6, { align: 'right' });
  y += 12;

  const headFill = { fillColor: [...PDF_THEME.accentRgb] as [number, number, number], textColor: PDF_THEME.textDark, fontSize: 9, fontStyle: 'bold' as const };
  const gridStyles = { lineColor: PDF_THEME.borderRgb, lineWidth: 0.1 };

  // Arbeitgebender
  autoTable(doc, {
    startY: y,
    tableWidth: TW,
    head: [['Arbeitgebender', '']],
    body: [
      ['Vorname, Name', data.employer.name || ''],
      ['Strasse', data.employer.street || ''],
      ['PLZ, Wohnort', data.employer.plzCity || ''],
    ],
    theme: 'grid',
    headStyles: headFill,
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: LABEL }, 1: { cellWidth: VALUE } },
    margin: { left: LM, right: PDF_THEME.RM },
    styles: gridStyles,
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Arbeitnehmender
  autoTable(doc, {
    startY: y,
    tableWidth: TW,
    head: [['Arbeitnehmender', '']],
    body: [
      ['Vorname, Name', data.employee.name || ''],
      ['Strasse', data.employee.street || ''],
      ['PLZ, Wohnort', data.employee.plzCity || ''],
      ['AHV-Nummer', data.employee.ahvNumber || ''],
    ],
    theme: 'grid',
    headStyles: headFill,
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: LABEL }, 1: { cellWidth: VALUE } },
    margin: { left: LM, right: PDF_THEME.RM },
    styles: gridStyles,
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Grundlagen
  autoTable(doc, {
    startY: y,
    tableWidth: TW,
    head: [['Grundlagen', '']],
    body: [
      ['Kanton', data.grundlagen.cantonLabel || 'Auswählen'],
      ['Abrechnungsverfahren', data.grundlagen.accountingMethodLabel || 'Auswählen'],
      ['Stundenlohn', fmtMoney(data.grundlagen.hourlyRate)],
      ['Anzahl Stunden', String(data.grundlagen.hours ?? 0)],
    ],
    theme: 'grid',
    headStyles: headFill,
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: LABEL }, 1: { cellWidth: VALUE, halign: 'right' } },
    margin: { left: LM, right: PDF_THEME.RM },
    styles: gridStyles,
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Lohn
  const lohnBody: any[][] = [
    ['Arbeitslohn', '', fmtMoney(data.result.wageLines.workWage.perHour), fmtMoney(data.result.wageLines.workWage.perMonth)],
    ['Ferienzuschlag', data.grundlagen.vacationSurchargeLabel || 'Auswählen', fmtMoney(data.result.wageLines.vacationSurcharge.perHour), fmtMoney(data.result.wageLines.vacationSurcharge.perMonth)],
    [{ content: 'Bruttolohn', styles: { fontStyle: 'bold' } }, '', { content: fmtMoney(data.result.wageLines.grossWage.perHour), styles: { fontStyle: 'bold' } }, { content: fmtMoney(data.result.wageLines.grossWage.perMonth), styles: { fontStyle: 'bold' } }],
  ];

  autoTable(doc, {
    startY: y,
    tableWidth: TW,
    head: [['Lohn', 'Sätze', 'Pro Stunde', 'Pro Monat']],
    body: lohnBody,
    theme: 'grid',
    headStyles: headFill,
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: L0 },
      1: { halign: 'right', cellWidth: L1 },
      2: { halign: 'right', cellWidth: L2 },
      3: { halign: 'right', cellWidth: L3 },
    },
    margin: { left: LM, right: PDF_THEME.RM },
    styles: gridStyles,
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Abzüge (immer gleiche Struktur)
  const byLabel = new Map(data.result.deductionLines.map(l => [l.label, l]));
  const row = (label: string) => {
    const l = byLabel.get(label);
    if (!l || l.enabled === false) return [label, '', '', ''];
    return [label, l.rate != null ? fmtPct(l.rate) : '', fmtMoney(l.perHour), fmtMoney(l.perMonth)];
  };

  const abzuegeBody: any[][] = [
    row('AHV/IV/EO'),
    row('ALV'),
    row('KTV'),
    row('NBU'),
    row('Quellensteuer'),
    row('FAK'),
    [
      { content: 'Total Abzüge', styles: { fontStyle: 'bold' } },
      { content: '', styles: { fontStyle: 'bold' } },
      { content: fmtMoney(data.result.totalDeductions.perHour), styles: { fontStyle: 'bold' } },
      { content: fmtMoney(data.result.totalDeductions.perMonth), styles: { fontStyle: 'bold' } },
    ],
    [
      { content: 'Nettolohn', styles: { fontStyle: 'bold', fillColor: [...PDF_THEME.accentRgb] } },
      { content: '', styles: { fontStyle: 'bold', fillColor: [...PDF_THEME.accentRgb] } },
      { content: fmtMoney(data.result.netWage.perHour), styles: { fontStyle: 'bold', fillColor: [...PDF_THEME.accentRgb] } },
      { content: fmtMoney(data.result.netWage.perMonth), styles: { fontStyle: 'bold', fillColor: [...PDF_THEME.accentRgb] } },
    ],
  ];

  autoTable(doc, {
    startY: y,
    tableWidth: TW,
    head: [['Abzüge', 'Sätze', 'Pro Stunde', 'Pro Monat']],
    body: abzuegeBody,
    theme: 'grid',
    headStyles: headFill,
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: L0 },
      1: { halign: 'right', cellWidth: L1 },
      2: { halign: 'right', cellWidth: L2 },
      3: { halign: 'right', cellWidth: L3 },
    },
    margin: { left: LM, right: PDF_THEME.RM },
    styles: gridStyles,
  });

  // NBU-Vermerk (wenn vorhanden)
  if (data.result.nbuDisplayNote) {
    y = (doc as any).lastAutoTable.finalY + 4;
    doc.setFontSize(8);
    doc.setTextColor(PDF_THEME.textMuted);
    doc.text(data.result.nbuDisplayNote, LM, y);
  }

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(PDF_THEME.textMuted);
  doc.text('Erstellt mit Asklepios – IV-Assistenzbeitrag', LM, 287);

  return doc;
}
