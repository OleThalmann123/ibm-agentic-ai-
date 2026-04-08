import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PayrollResult } from '../backend/payroll';
import { fmt, fmtPct } from '../backend/payroll';

interface PayslipPdfData {
  month: string; // e.g. "März 2026"
  employer: { name: string; street?: string; plzCity?: string };
  employee: { name: string; street?: string; plzCity?: string };
  grundlagen: { kanton: string; verfahren: string; stundenlohn: number; stunden: number };
  result: PayrollResult;
}

export function generatePayslipPdf(data: PayslipPdfData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  const W = 190;
  const LM = 10;
  let y = 15;
  const money = (n: number) => `CHF ${fmt(n)}`;

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Lohnabrechnung', LM, y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(data.month, LM + W, y, { align: 'right' });
  y += 10;

  // Arbeitgebender / Arbeitnehmender boxes
  const boxW = W / 2 - 3;

  // Arbeitgebender
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

  // Arbeitnehmender
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

  // Grundlagen
  autoTable(doc, {
    startY: y,
    head: [['Grundlagen', '']],
    body: [
      ['Kanton', data.grundlagen.kanton],
      ['Abrechnungsverfahren', data.grundlagen.verfahren],
      ['Stundenlohn', money(data.grundlagen.stundenlohn)],
      ['Anzahl Stunden', fmt(data.grundlagen.stunden)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [30, 64, 175], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 80 }, 1: { halign: 'right' } },
    margin: { left: LM, right: LM },
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  const r = data.result;

  // Lohn table
  const lohnBody: any[][] = [
    ['Arbeitslohn', '—', money(r.arbeitslohn.perHour), money(r.arbeitslohn.perYear)],
    // Immer anzeigen, damit die Tabelle immer gleich aussieht (auch wenn 0.00).
    ['Ferienzuschlag', r.ferienzuschlag.rate != null ? fmtPct(r.ferienzuschlag.rate) : '—', money(r.ferienzuschlag.perHour), money(r.ferienzuschlag.perYear)],
    [{ content: 'Bruttolohn Arbeitnehmender', styles: { fontStyle: 'bold' } }, '', { content: money(r.bruttolohn.perHour), styles: { fontStyle: 'bold' } }, { content: money(r.bruttolohn.perYear), styles: { fontStyle: 'bold' } }],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Lohn', 'Sätze', 'Pro Stunde', 'Pro Monat']],
    body: lohnBody,
    theme: 'grid',
    headStyles: { fillColor: [30, 64, 175], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 80 }, 1: { halign: 'right', cellWidth: 25 }, 2: { halign: 'right', cellWidth: 35 }, 3: { halign: 'right', cellWidth: 35 } },
    margin: { left: LM, right: LM },
  });
  y = (doc as any).lastAutoTable.finalY + 3;

  // Abzüge Arbeitnehmender (keine arbeitgeberseitigen Beiträge anzeigen)
  const anBody: any[][] = r.anLines.map(l => [l.label, l.rate != null ? fmtPct(l.rate) : '—', money(l.perHour), money(l.perYear)]);
  anBody.push([{ content: 'Total Abzüge Arbeitnehmender', styles: { fontStyle: 'bold' } }, { content: r.totalAN.rate != null ? fmtPct(r.totalAN.rate) : '—', styles: { fontStyle: 'bold' } }, { content: money(r.totalAN.perHour), styles: { fontStyle: 'bold' } }, { content: money(r.totalAN.perYear), styles: { fontStyle: 'bold' } }]);
  anBody.push([{ content: 'Nettolohn Arbeitnehmender', styles: { fontStyle: 'bold', fillColor: [240, 245, 255] } }, '', { content: money(r.nettolohn.perHour), styles: { fontStyle: 'bold', fillColor: [240, 245, 255] } }, { content: money(r.nettolohn.perYear), styles: { fontStyle: 'bold', fillColor: [240, 245, 255] } }]);

  autoTable(doc, {
    startY: y,
    head: [['Beiträge Arbeitnehmender', 'Sätze', 'Pro Stunde', 'Pro Monat']],
    body: anBody,
    theme: 'grid',
    headStyles: { fillColor: [30, 64, 175], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 80 }, 1: { halign: 'right', cellWidth: 25 }, 2: { halign: 'right', cellWidth: 35 }, 3: { halign: 'right', cellWidth: 35 } },
    margin: { left: LM, right: LM },
  });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(128);
  doc.text('Erstellt mit Asklepios – IV-Assistenzbeitrag', LM, 287);

  return doc;
}
