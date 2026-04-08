import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  AlignmentType,
} from 'docx';

export interface EinsatzrapportDocxRow {
  dateLabel: string; // "01.04."
  time1_from?: string;
  time1_to?: string;
  time1_hours?: string;
  time1_activity?: string;
  time2_from?: string;
  time2_to?: string;
  time2_hours?: string;
  time2_activity?: string;
  day_hours?: string;
  night_hours?: string;
}

export interface EinsatzrapportDocxData {
  title: string;
  assistantName: string;
  employerName: string;
  includeActivities: boolean;
  rows: EinsatzrapportDocxRow[];
  totalHoursLabel: string;
  totalNightsLabel: string;
}

const cell = (t: string, bold = false) =>
  new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text: t, bold })],
      }),
    ],
  });

export async function generateEinsatzrapportDocx(data: EinsatzrapportDocxData): Promise<Blob> {
  const headCells = data.includeActivities
    ? [
        'Datum',
        'Zeit 1 von bis Uhr',
        'Zeit 1 Stunden',
        'Tätigkeiten (gem. Referenztabelle)',
        'Zeit 2 von bis Uhr',
        'Zeit 2 Stunden',
        'Tätigkeiten (gem. Referenztabelle)',
        'Stunden pro Tag',
        'Nachtdienst (Einsatzzeit in Stunden)',
      ]
    : [
        'Datum',
        'Zeit 1 von bis Uhr',
        'Zeit 1 Stunden',
        'Zeit 2 von bis Uhr',
        'Zeit 2 Stunden',
        'Stunden pro Tag',
        'Nachtdienst (Einsatzzeit in Stunden)',
      ];

  const header = new TableRow({
    children: headCells.map((h) => cell(h, true)),
  });

  const bodyRows = data.rows.map((r) => {
    const time1 = [r.time1_from || '', r.time1_to || ''].filter(Boolean).join('\n');
    const time2 = [r.time2_from || '', r.time2_to || ''].filter(Boolean).join('\n');
    if (data.includeActivities) {
      return new TableRow({
        children: [
          cell(r.dateLabel),
          cell(time1),
          cell(r.time1_hours || ''),
          cell(r.time1_activity || ''),
          cell(time2),
          cell(r.time2_hours || ''),
          cell(r.time2_activity || ''),
          cell(r.day_hours || ''),
          cell(r.night_hours || ''),
        ],
      });
    }
    return new TableRow({
      children: [
        cell(r.dateLabel),
        cell(time1),
        cell(r.time1_hours || ''),
        cell(time2),
        cell(r.time2_hours || ''),
        cell(r.day_hours || ''),
        cell(r.night_hours || ''),
      ],
    });
  });

  const totalsRow = data.includeActivities
    ? new TableRow({
        children: [
          cell('Stunden pro Monat', true),
          cell(''),
          cell(''),
          cell(''),
          cell(''),
          cell(''),
          cell(''),
          cell(data.totalHoursLabel, true),
          cell(data.totalNightsLabel, true),
        ],
      })
    : new TableRow({
        children: [
          cell('Stunden pro Monat', true),
          cell(''),
          cell(''),
          cell(''),
          cell(''),
          cell(data.totalHoursLabel, true),
          cell(data.totalNightsLabel, true),
        ],
      });

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...bodyRows, totalsRow],
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: data.title, bold: true })],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `AssistentIn: ${data.assistantName || '—'}    ` }),
              new TextRun({ text: `ArbeitgeberIn: ${data.employerName || '—'}` }),
            ],
          }),
          new Paragraph({ text: '' }),
          table,
          new Paragraph({ text: '' }),
          new Paragraph({ text: '=Summe der Spalte    Summe (Anzahl Nächte)' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Ferienguthaben:' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Bezogene Ferien' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Ort, Datum: ____________________    Unterschrift AssistentIn: ____________________' }),
          ...(data.includeActivities
            ? [
                new Paragraph({ text: '' }),
                new Paragraph({ children: [new TextRun({ text: 'Tätigkeiten – Legende:', bold: true })] }),
                new Paragraph({
                  children: [
                    new TextRun(
                      [
                        '1) Alltägliche Lebensverrichtungen',
                        '2) Haushaltsführung',
                        '3) Gesellschaftliche Teilhabe und Freizeitgestaltung',
                        '4) Erziehung und Kinderbetreuung',
                        '5) Ausübung einer gemeinnützigen oder ehrenamtlichen Tätigkeit',
                        '6) Berufliche Aus- und Weiterbildung',
                        '7) Ausübung einer Erwerbstätigkeit im ersten Arbeitsmarkt',
                        '8) Überwachung während des Tages',
                        'Nachtdienst',
                      ].join('\n'),
                    ),
                  ],
                }),
              ]
            : []),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

