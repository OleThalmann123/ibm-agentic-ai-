import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmt } from '../backend/payroll';
import { PDF_THEME, pdfValueColMm } from './pdf-theme';

const TABLE_WIDTH_MM = PDF_THEME.INNER_W;
const LABEL_COL_MM = PDF_THEME.labelColMm;
const VALUE_COL_MM = pdfValueColMm();

const TABLE_COMMON = {
  theme: 'grid' as const,
  margin: { left: PDF_THEME.LM, right: PDF_THEME.RM },
  styles: {
    lineColor: PDF_THEME.borderRgb as unknown as [number, number, number],
    lineWidth: 0.1,
    cellPadding: 2.2,
    valign: 'middle' as const,
  },
  headStyles: {
    fillColor: [...PDF_THEME.accentRgb] as any,
    textColor: PDF_THEME.textDark,
    fontSize: 9,
    fontStyle: 'bold' as const,
    cellPadding: 2.6,
  },
  bodyStyles: { fontSize: 9, cellPadding: 2.2 },
};

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
  let y = 18;

  const rateCHF = Number.isFinite(data.lines?.[0]?.rateCHF) ? data.lines[0].rateCHF : 35.3;

  // Header (briefartig, ohne Doppelungen)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`Rechnung für ${data.insuredPerson.name || '—'}`, LM, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(data.invoiceDateLabel, LM + W, y, { align: 'right' });
  doc.text(`Rechnungsperiode: ${data.monthLabel}`, LM + W, y + 5.5, { align: 'right' });
  y += 12;

  // Absender (links)
  const issuerLines = [
    String(data.invoiceIssuer.name || '').trim(),
    String(data.invoiceIssuer.street || '').trim(),
    String(data.invoiceIssuer.plzCity || '').trim(),
    String(data.invoiceIssuer.emailPhone || '').trim(),
  ].filter(Boolean);
  doc.text(issuerLines, LM, y);

  // Empfänger (rechts)
  const recipientLines = [
    String(data.invoiceRecipient?.authorityName || '').trim(),
    String(data.invoiceRecipient?.plzCity || '').trim(),
  ].filter(Boolean);
  if (recipientLines.length) {
    doc.text(recipientLines, LM + W, y, { align: 'right' });
  }
  y += Math.max(issuerLines.length, recipientLines.length || 0) * 4.6 + 8;

  // Betreffbox
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setDrawColor(...PDF_THEME.borderRgb);
  doc.rect(LM, y, W, 12);
  doc.text(`Rechnung für ${data.insuredPerson.name || '—'}`, LM + 2, y + 5.2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Rechnungsperiode: ${data.monthLabel}`, LM + 2, y + 10.2);
  y += 18;

  // Betreff + Anrede
  doc.text('Sehr geehrte Damen und Herren', LM, y);
  y += 6;
  doc.text('Ich stelle wie folgt in Rechnung:', LM, y);
  y += 8;

  // Stundensatz sichtbar machen (gemäss Vorgabe)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Stundensatz: ${money(rateCHF)} (fix)`, LM, y);
  y += 6;

  // Leistungstabelle – nach Assistenzpersonen/Kategorien aufgeschlüsselt
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
      l.activityLabel,
      fmt(l.hours),
      money(l.amountCHF),
    ]);
  }

  body.push([
    {
      content: 'Total',
      colSpan: 3,
      styles: { fontStyle: 'bold' as const, halign: 'right' as const },
    } as any,
    {
      content: money(data.totalCHF),
      styles: { fontStyle: 'bold' as const, halign: 'right' as const },
    } as any,
  ]);

  autoTable(doc, {
    startY: y,
    tableWidth: TABLE_WIDTH_MM,
    head: [[
      'Leistungserbringer',
      'Beschreibung der erbrachten Leistung',
      'Anz. Std. (Min. in 1/100h)',
      'Betrag Total (in CHF)',
    ]],
    body,
    ...TABLE_COMMON,
    headStyles: { ...TABLE_COMMON.headStyles, fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 44 },
      1: { cellWidth: 78 },
      2: { cellWidth: 28, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 12;

  // Grussformel + Zahlungsinformationen (an wen das Geld geht)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Freundliche Grüsse', LM, y);
  y += 6;
  doc.text(data.invoiceIssuer.name || '—', LM, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    tableWidth: TABLE_WIDTH_MM,
    head: [['Zahlungsinformationen', '']],
    body: [
      ['Kontoinhaber/in', data.billing.accountHolderName || data.invoiceIssuer.name || ''],
      ['Adresse, Ort', [data.billing.accountHolderStreet || '', data.billing.accountHolderPlzCity || ''].filter(Boolean).join(', ')],
      ['Bankverbindung', data.billing.bankName || ''],
      ['IBAN- / Konto-Nr.', data.billing.iban || ''],
      ['Zahlungskondition', data.billing.paymentTermsDays ? `${data.billing.paymentTermsDays} Tage` : ''],
    ],
    ...TABLE_COMMON,
    columnStyles: { 0: { cellWidth: LABEL_COL_MM }, 1: { cellWidth: VALUE_COL_MM } },
  });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(PDF_THEME.textMuted);
  doc.text('Erstellt mit Asklepios – IV-Assistenzbeitrag', LM, 287);

  return doc;
}

