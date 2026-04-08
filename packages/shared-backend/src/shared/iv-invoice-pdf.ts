import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmt } from '../backend/payroll';
import { PDF_THEME, pdfValueColMm } from './pdf-theme';

const TABLE_WIDTH_MM = PDF_THEME.INNER_W;
const LABEL_COL_MM = PDF_THEME.labelColMm;
const VALUE_COL_MM = pdfValueColMm();

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
  /** Optionales Logo (DataURL), wird im Deckblatt verwendet. */
  logoDataUrl?: string;

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

  /**
   * Empfängerblock (Behörde) – Datenmodell für künftiges Brief-Layout;
   * aktuelles PDF nutzt die Felder noch nicht vollständig.
   */
  invoiceRecipient?: {
    authorityName?: string;
    plzCity?: string;
  };

  /** Zusätzliche Rückfragen-Zeile in der Fusszeile (neben Standard-Footer). */
  invoiceInquiriesFooter?: {
    name?: string;
    email?: string;
    phone?: string;
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
  const W = PDF_THEME.INNER_W;
  const LM = PDF_THEME.LM;
  let y = 15;

  doc.setFillColor(...PDF_THEME.headerBandRgb);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setDrawColor(...PDF_THEME.borderRgb);
  doc.line(0, 32, 210, 32);

  if (data.logoDataUrl) {
    try {
      doc.addImage(data.logoDataUrl, 'PNG', LM, 8, 18, 18);
    } catch {
      // ignore
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Rechnung für Assistenzbeitrag (IV)', LM + (data.logoDataUrl ? 22 : 0), y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Rechnungsdatum: ${data.invoiceDateLabel}`, LM + W, y, { align: 'right' });
  doc.text(`Rechnungsperiode: ${data.monthLabel}`, LM + W, y + 6, { align: 'right' });
  y += 12;

  // Boxes (insured + issuer)
  autoTable(doc, {
    startY: y,
    tableWidth: TABLE_WIDTH_MM,
    head: [['Versicherte Person', '']],
    body: [
      ['Name, Vorname', data.insuredPerson.name || '–'],
      ['AHV-Nummer', data.insuredPerson.ahvNumber || ''],
      ['Strasse, Hausnummer', data.insuredPerson.street || ''],
      ['Postleitzahl, Ort', data.insuredPerson.plzCity || ''],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [...PDF_THEME.accentRgb],
      textColor: PDF_THEME.textDark,
      fontSize: 9,
      fontStyle: 'bold',
    },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: LABEL_COL_MM }, 1: { cellWidth: VALUE_COL_MM } },
    margin: { left: LM, right: PDF_THEME.RM },
    styles: { lineColor: PDF_THEME.borderRgb, lineWidth: 0.1 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  autoTable(doc, {
    startY: y,
    tableWidth: TABLE_WIDTH_MM,
    head: [['Rechnungssteller', '']],
    body: [
      ['Name, Vorname', data.invoiceIssuer.name || '–'],
      ['E-Mail, Telefon', data.invoiceIssuer.emailPhone || ''],
      ['Strasse, Hausnummer', data.invoiceIssuer.street || ''],
      ['Postleitzahl, Ort', data.invoiceIssuer.plzCity || ''],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [...PDF_THEME.accentRgb],
      textColor: PDF_THEME.textDark,
      fontSize: 9,
      fontStyle: 'bold',
    },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: LABEL_COL_MM }, 1: { cellWidth: VALUE_COL_MM } },
    margin: { left: LM, right: PDF_THEME.RM },
    styles: { lineColor: PDF_THEME.borderRgb, lineWidth: 0.1 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Billing section
  autoTable(doc, {
    startY: y,
    tableWidth: TABLE_WIDTH_MM,
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
    headStyles: {
      fillColor: [...PDF_THEME.accentRgb],
      textColor: PDF_THEME.textDark,
      fontSize: 9,
      fontStyle: 'bold',
    },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: LABEL_COL_MM }, 1: { cellWidth: VALUE_COL_MM } },
    margin: { left: LM, right: PDF_THEME.RM },
    styles: { lineColor: PDF_THEME.borderRgb, lineWidth: 0.1 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Lines table – nach Assistenzpersonen aufgeschlüsselt
  const sortedLines = [...data.lines].sort((a, b) =>
    (a.assistantName + a.activityLabel).localeCompare(b.assistantName + b.activityLabel),
  );
  const body: any[] = [];
  let lastAssistant = '';
  for (const l of sortedLines) {
    const firstRowForAssistant = l.assistantName !== lastAssistant;
    lastAssistant = l.assistantName;
    body.push([
      firstRowForAssistant ? l.assistantName : '',
      'Assistenzleistung Wohnen',
      l.activityLabel,
      fmt(l.hours),
      money(l.amountCHF),
      '',
    ]);
  }

  body.push([
    {
      content: 'TOTAL',
      colSpan: 4,
      styles: { fontStyle: 'bold' as const, halign: 'right' as const },
    } as any,
    {
      content: money(data.totalCHF),
      styles: { fontStyle: 'bold' as const, halign: 'right' as const },
    } as any,
    '',
  ]);

  autoTable(doc, {
    startY: y,
    tableWidth: TABLE_WIDTH_MM,
    head: [[
      'Leistungserbringer',
      'Leistung',
      'Beschreibung der erbrachten Leistung',
      'Anz. Std. (Min. in 1/100h)',
      'Betrag Total (in CHF)',
      'Beilagen',
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
    columnStyles: {
      0: { cellWidth: 34 },
      1: { cellWidth: 26 },
      2: { cellWidth: 58 },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 24 },
    },
    margin: { left: LM, right: PDF_THEME.RM },
    styles: { lineColor: PDF_THEME.borderRgb, lineWidth: 0.1 },
  });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(PDF_THEME.textMuted);
  doc.text('Erstellt mit Asklepios – IV-Assistenzbeitrag', LM, 287);

  return doc;
}

