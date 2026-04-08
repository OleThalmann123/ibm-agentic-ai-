import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmt } from '../backend/payroll';

export type IvInvoiceLine = {
  assistantName: string;
  /** Tätigkeit/Kategorie aus Zeiterfassung (z. B. "1) Alltägliche Lebensverrichtungen") */
  activityLabel: string;
  hours: number; // decimal hours, 2 decimals
  rateCHF: number; // CHF per hour
  amountCHF: number; // hours * rate
};

export interface IvInvoicePdfData {
  invoiceDateLabel: string; // z. B. "08.04.2026"
  monthLabel: string; // z. B. "April 2026"

  insuredPerson: {
    name: string;
    ahvNumber?: string;
    street?: string;
    plzCity?: string;
  };

  invoiceIssuer: {
    name: string;
    emailPhone?: string;
    street?: string;
    plzCity?: string;
  };

  billing: {
    gln?: string;
    referenceNumber?: string;
    iban?: string;
    accountHolderName?: string;
    accountHolderStreet?: string;
    accountHolderPlzCity?: string;
    paymentTermsDays?: number;
    bankName?: string;
  };

  lines: IvInvoiceLine[];
  totalCHF: number;
}

function money(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `CHF ${v.toFixed(2).replace('.', ',')}`;
}

export function generateIvInvoicePdf(data: IvInvoicePdfData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  const W = 190;
  const LM = 10;
  let y = 15;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Rechnung für Assistenzbeitrag (IV)', LM, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Rechnungsdatum: ${data.invoiceDateLabel}`, LM + W, y, { align: 'right' });
  doc.text(`Rechnungsperiode: ${data.monthLabel}`, LM + W, y + 6, { align: 'right' });
  y += 12;

  // Boxes (insured + issuer)
  autoTable(doc, {
    startY: y,
    head: [['Versicherte Person', '']],
    body: [
      ['Name, Vorname', data.insuredPerson.name || '–'],
      ['AHV-Nummer', data.insuredPerson.ahvNumber || ''],
      ['Strasse, Hausnummer', data.insuredPerson.street || ''],
      ['Postleitzahl, Ort', data.insuredPerson.plzCity || ''],
    ],
    theme: 'grid',
    headStyles: { fillColor: [230, 238, 250], textColor: 20, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 120 } },
    margin: { left: LM, right: LM },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  autoTable(doc, {
    startY: y,
    head: [['Rechnungssteller', '']],
    body: [
      ['Name, Vorname', data.invoiceIssuer.name || '–'],
      ['E-Mail, Telefon', data.invoiceIssuer.emailPhone || ''],
      ['Strasse, Hausnummer', data.invoiceIssuer.street || ''],
      ['Postleitzahl, Ort', data.invoiceIssuer.plzCity || ''],
    ],
    theme: 'grid',
    headStyles: { fillColor: [230, 238, 250], textColor: 20, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 120 } },
    margin: { left: LM, right: LM },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Billing section
  autoTable(doc, {
    startY: y,
    head: [['Abrechnung', '']],
    body: [
      ['GLN (falls vorhanden)', data.billing.gln || ''],
      ['Mitteilungs-/Verfügungsnummer', data.billing.referenceNumber || ''],
      ['IBAN', data.billing.iban || ''],
      ['Kontoinhaber:in', data.billing.accountHolderName || ''],
      ['Adresse Kontoinhaber:in', data.billing.accountHolderStreet || ''],
      ['PLZ/Ort Kontoinhaber:in', data.billing.accountHolderPlzCity || ''],
      ['Bankverbindung', data.billing.bankName || ''],
      ['Zahlungskondition', data.billing.paymentTermsDays ? `${data.billing.paymentTermsDays} Tage` : ''],
    ],
    theme: 'grid',
    headStyles: { fillColor: [230, 238, 250], textColor: 20, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 120 } },
    margin: { left: LM, right: LM },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Lines table
  const body = data.lines.map((l) => ([
    l.assistantName,
    l.activityLabel,
    fmt(l.hours),
    money(l.rateCHF),
    money(l.amountCHF),
  ]));

  body.push([
    { content: 'TOTAL', styles: { fontStyle: 'bold' as const } } as any,
    '',
    '',
    '',
    '',
    { content: money(data.totalCHF), styles: { fontStyle: 'bold' as const } } as any,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Leistungserbringer', 'Beschreibung', 'Std (dez.)', 'Ansatz', 'Betrag']],
    body,
    theme: 'grid',
    headStyles: { fillColor: [30, 64, 175], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 46 },
      1: { cellWidth: 76 },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
    },
    margin: { left: LM, right: LM },
  });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(128);
  doc.text('Erstellt mit Asklepios – IV-Assistenzbeitrag', LM, 287);

  return doc;
}

