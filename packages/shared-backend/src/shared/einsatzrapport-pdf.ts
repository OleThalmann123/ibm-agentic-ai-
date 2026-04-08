import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type ActivityCode = string; // "2".."10"

export interface EinsatzrapportRow {
  date: string; // YYYY-MM-DD
  time1_from?: string;
  time1_to?: string;
  time1_hours?: number;
  time1_activity?: ActivityCode | null;
  time2_from?: string;
  time2_to?: string;
  time2_hours?: number;
  time2_activity?: ActivityCode | null;
  day_hours?: number;
  night_hours?: number;
}

export interface EinsatzrapportPdfData {
  monthLabel: string; // e.g. "März 2026"
  assistantName: string;
  employerName: string;
  includeActivities: boolean;
  rows: EinsatzrapportRow[]; // one per day
  totalHours: number;
  totalNights: number;
  vacationBalanceLabel?: string;
  vacationTakenLabel?: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function dayLabel(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.`;
}

export function generateEinsatzrapportPdf(data: EinsatzrapportPdfData): jsPDF {
  const doc = new jsPDF('l', 'mm', 'a4');
  const LM = 10;
  const W = 277;
  let y = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(
    `Einsatzrapport für geleistete persönliche Assistenz für die Lohnabrechnung für ${data.monthLabel}`,
    LM,
    y,
  );
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`AssistentIn: ${data.assistantName || '—'}`, LM, y);
  doc.text(`ArbeitgeberIn: ${data.employerName || '—'}`, LM + 140, y);
  y += 8;

  const head = data.includeActivities
    ? [[
        'Datum',
        'Zeit 1 von bis Uhr',
        'Zeit 1 Stunden',
        'Tätigkeit (Ref.)',
        'Zeit 2 von bis Uhr',
        'Zeit 2 Stunden',
        'Tätigkeit (Ref.)',
        'Stunden pro Tag',
        'Nachtdienst (Einsatzzeit)',
      ]]
    : [[
        'Datum',
        'Zeit 1 von bis Uhr',
        'Zeit 1 Stunden',
        'Zeit 2 von bis Uhr',
        'Zeit 2 Stunden',
        'Stunden pro Tag',
        'Nachtdienst (Einsatzzeit)',
      ]];

  const body = data.rows.map((r) => {
    const t1 = [r.time1_from || '', r.time1_to || ''].filter(Boolean).join('\n');
    const t2 = [r.time2_from || '', r.time2_to || ''].filter(Boolean).join('\n');
    if (data.includeActivities) {
      return [
        dayLabel(r.date),
        t1,
        r.time1_hours != null ? String(r.time1_hours.toFixed(2)) : '',
        r.time1_activity || '',
        t2,
        r.time2_hours != null ? String(r.time2_hours.toFixed(2)) : '',
        r.time2_activity || '',
        r.day_hours != null ? String(r.day_hours.toFixed(2)) : '',
        r.night_hours != null ? String(r.night_hours.toFixed(2)) : '',
      ];
    }
    return [
      dayLabel(r.date),
      t1,
      r.time1_hours != null ? String(r.time1_hours.toFixed(2)) : '',
      t2,
      r.time2_hours != null ? String(r.time2_hours.toFixed(2)) : '',
      r.day_hours != null ? String(r.day_hours.toFixed(2)) : '',
      r.night_hours != null ? String(r.night_hours.toFixed(2)) : '',
    ];
  });

  // Totals row
  if (data.includeActivities) {
    body.push([
      'Stunden pro Monat',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      data.totalHours.toFixed(2),
      data.totalNights ? String(data.totalNights) : '',
    ]);
  } else {
    body.push([
      'Stunden pro Monat',
      '',
      '',
      '',
      '',
      '',
      '',
      data.totalHours.toFixed(2),
      data.totalNights ? String(data.totalNights) : '',
    ]);
  }

  autoTable(doc, {
    startY: y,
    head,
    body,
    theme: 'grid',
    headStyles: { fillColor: [245, 245, 245], textColor: 20, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: LM, right: LM },
    tableWidth: W,
  });

  y = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('=Summe der Spalte', LM, y);
  doc.text('Summe (Anzahl Nächte)', LM + 120, y);
  y += 10;

  doc.text('Ferienguthaben:', LM, y);
  y += 8;
  doc.text('Bezogene Ferien', LM, y);
  y += 14;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Ort, Datum: ____________________`, LM, y);
  doc.text(`Unterschrift AssistentIn: ____________________`, LM + 110, y);
  y += 10;

  if (data.includeActivities) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Tätigkeiten – Legende:', LM, y);
    doc.setFont('helvetica', 'normal');
    y += 5;

    const legend = [
      '2) Alltägliche Lebensverrichtungen',
      '3) Haushaltsführung',
      '4) Gesellschaftliche Teilhabe und Freizeitgestaltung',
      '5) Erziehung und Kinderbetreuung',
      '6) Ausübung einer gemeinnützigen oder ehrenamtlichen Tätigkeit',
      '7) Berufliche Aus- und Weiterbildung',
      '8) Ausübung einer Erwerbstätigkeit im ersten Arbeitsmarkt',
      '9) Überwachung während des Tages',
      '10) Nachtdienst',
    ];
    doc.text(legend.join('\n'), LM, y);
  }

  return doc;
}

