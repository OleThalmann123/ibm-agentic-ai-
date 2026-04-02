/**
 * Swiss Payroll Calculator (Lohnbudget)
 * Hourly-wage-based payroll engine for IV-Assistenzbeitrag
 *
 * Calculates:
 * - Gross pay (Bruttolohn) with optional vacation surcharge
 * - Employer contributions (AG-Beiträge): AHV/IV/EO, ALV, FAK, VK, KTV, BU
 * - Employee deductions (AN-Beiträge): AHV/IV/EO, ALV, KTV, NBU, QSt, FAK (Wallis)
 * - Total employer cost (Totalaufwand AG)
 * - Net pay (Nettolohn AN)
 * - Payment recipients breakdown (Adressaten)
 */

// ─── Fixed rates (Bundesvorgaben) ───
export const RATES = {
  AHV_IV_EO: 0.053,    // 5.30%
  ALV: 0.011,           // 1.10%
  VK: 0.05 * 0.1055,   // 0.5275% (Verwaltungskosten)
  QST_VEREINFACHT: 0.05, // 5.00% (Quellensteuer bei vereinfachtem Verfahren)
  FAK_AN_WALLIS: 0.0017, // 0.17% (AN-FAK nur Kanton Wallis)
} as const;

// ─── FAK rates by canton ───
export const FAK_RATES: Record<string, { name: string; rate: number }> = {
  AG: { name: 'Aargau', rate: 0.0145 },
  AR: { name: 'Appenzell AR', rate: 0.016 },
  AI: { name: 'Appenzell AI', rate: 0.016 },
  BL: { name: 'Basel-Landschaft', rate: 0.013 },
  BS: { name: 'Basel-Stadt', rate: 0.0165 },
  BE: { name: 'Bern', rate: 0.015 },
  FR: { name: 'Freiburg', rate: 0.0227 },
  GE: { name: 'Genf', rate: 0.0222 },
  GL: { name: 'Glarus', rate: 0.014 },
  GR: { name: 'Graubünden', rate: 0.015 },
  JU: { name: 'Jura', rate: 0.0275 },
  LU: { name: 'Luzern', rate: 0.0135 },
  NE: { name: 'Neuenburg', rate: 0.018 },
  NW: { name: 'Nidwalden', rate: 0.015 },
  OW: { name: 'Obwalden', rate: 0.014 },
  SG: { name: 'St. Gallen', rate: 0.018 },
  SH: { name: 'Schaffhausen', rate: 0.013 },
  SO: { name: 'Solothurn', rate: 0.0125 },
  SZ: { name: 'Schwyz', rate: 0.013 },
  TG: { name: 'Thurgau', rate: 0.014 },
  TI: { name: 'Tessin', rate: 0.016 },
  UR: { name: 'Uri', rate: 0.017 },
  VD: { name: 'Waadt', rate: 0.0237 },
  VS: { name: 'Wallis', rate: 0.025 },
  ZG: { name: 'Zug', rate: 0.0135 },
  ZH: { name: 'Zürich', rate: 0.01025 },
};

// ─── Vacation surcharge options ───
export const VACATION_OPTIONS = [
  { label: 'Kein Ferienzuschlag', value: 0 },
  { label: '8.33% (4 Wochen)', value: 0.0833 },
  { label: '10.64% (5 Wochen)', value: 0.1064 },
  { label: '13.04% (6 Wochen)', value: 0.1304 },
] as const;

// ─── Billing method enum ───
export type BillingMethod = 'vereinfacht' | 'ordentlich' | 'ordentlich_quellensteuer';

export const BILLING_OPTIONS: { label: string; value: BillingMethod }[] = [
  { label: 'Vereinfachtes Abrechnungsverfahren', value: 'vereinfacht' },
  { label: 'Ordentliches Abrechnungsverfahren', value: 'ordentlich' },
  { label: 'Ordentliches mit Quellensteuer', value: 'ordentlich_quellensteuer' },
];

// ─── Input types ───
export interface PayrollInput {
  stundenlohn: number;
  anzahlStunden: number;
  kanton: string;
  abrechnungsverfahren: BillingMethod;
  ferienzuschlag: number; // 0, 0.0833, 0.1064, or 0.1304

  // Optional employer contributions
  ktvAG?: number;  // KTV rate (decimal)
  buAG?: number;   // BU rate (decimal)

  // Optional employee deductions
  ktvAN?: number;  // KTV rate (decimal)
  nbuAN?: number;  // NBU rate (decimal)
  quellensteuerSatz?: number; // only for ordentlich_quellensteuer

  // Metadata (for payslip document)
  jahr?: string;
  ortDatum?: string;
  agName?: string;
  agStrasse?: string;
  agPlzOrt?: string;
  anName?: string;
  anStrasse?: string;
  anPlzOrt?: string;
}

// ─── Output types ───
export interface PayrollLine {
  label: string;
  rate: number | null;
  perHour: number;
  perYear: number;
}

export interface PayrollResult {
  // Stage 1: Gross
  arbeitslohn: PayrollLine;
  ferienzuschlag: PayrollLine;
  bruttolohn: PayrollLine;

  // Stage 2: Employer contributions
  agLines: PayrollLine[];
  totalAG: PayrollLine;

  // Stage 3: Total employer cost
  totalaufwandAG: PayrollLine;

  // Stage 4: Employee deductions
  anLines: PayrollLine[];
  totalAN: PayrollLine;

  // Stage 5: Net pay
  nettolohn: PayrollLine;

  // Payment recipients
  adressaten: {
    label: string;
    perYear: number;
    details: string;
  }[];
}

// ─── Main calculation ───
export function round5(value: number): number {
  return Math.round(value * 20) / 20;
}

export function calculatePayroll(input: PayrollInput): PayrollResult {
  const { stundenlohn, anzahlStunden, kanton, abrechnungsverfahren, ferienzuschlag } = input;

  // ── Stage 1: Gross ──
  const arbeitslohnH = stundenlohn;
  const arbeitslohnY = stundenlohn * anzahlStunden;

  const ferienzuschlagH = arbeitslohnH * ferienzuschlag;
  const ferienzuschlagY = round5(arbeitslohnY * ferienzuschlag);

  const bruttoH = arbeitslohnH + ferienzuschlagH;
  const bruttoY = arbeitslohnY + ferienzuschlagY;

  // ── Stage 2: Employer contributions ──
  const fakRate = FAK_RATES[kanton]?.rate ?? 0;

  const agLines: PayrollLine[] = [
    { label: 'AHV/IV/EO', rate: RATES.AHV_IV_EO, perHour: bruttoH * RATES.AHV_IV_EO, perYear: round5(bruttoY * RATES.AHV_IV_EO) },
    { label: 'ALV', rate: RATES.ALV, perHour: bruttoH * RATES.ALV, perYear: round5(bruttoY * RATES.ALV) },
    { label: `FAK (${kanton})`, rate: fakRate, perHour: bruttoH * fakRate, perYear: round5(bruttoY * fakRate) },
    { label: 'VK', rate: RATES.VK, perHour: bruttoH * RATES.VK, perYear: round5(bruttoY * RATES.VK) },
  ];

  if (input.ktvAG != null && input.ktvAG > 0) {
    agLines.push({ label: 'KTV (AG)', rate: input.ktvAG, perHour: bruttoH * input.ktvAG, perYear: round5(bruttoY * input.ktvAG) });
  }
  if (input.buAG != null && input.buAG > 0) {
    agLines.push({ label: 'BU (AG)', rate: input.buAG, perHour: bruttoH * input.buAG, perYear: round5(bruttoY * input.buAG) });
  }

  const totalAGH = agLines.reduce((s, l) => s + l.perHour, 0);
  const totalAGY = agLines.reduce((s, l) => s + l.perYear, 0);

  // ── Stage 3: Total employer cost ──
  const totalaufwandAGH = bruttoH + totalAGH;
  const totalaufwandAGY = bruttoY + totalAGY;

  // ── Stage 4: Employee deductions ──
  const anLines: PayrollLine[] = [
    { label: 'AHV/IV/EO', rate: RATES.AHV_IV_EO, perHour: bruttoH * RATES.AHV_IV_EO, perYear: round5(bruttoY * RATES.AHV_IV_EO) },
    { label: 'ALV', rate: RATES.ALV, perHour: bruttoH * RATES.ALV, perYear: round5(bruttoY * RATES.ALV) },
  ];

  if (input.ktvAN != null && input.ktvAN > 0) {
    anLines.push({ label: 'KTV (AN)', rate: input.ktvAN, perHour: bruttoH * input.ktvAN, perYear: round5(bruttoY * input.ktvAN) });
  }
  if (input.nbuAN != null && input.nbuAN > 0) {
    anLines.push({ label: 'NBU (AN)', rate: input.nbuAN, perHour: bruttoH * input.nbuAN, perYear: round5(bruttoY * input.nbuAN) });
  }

  // Quellensteuer
  if (abrechnungsverfahren === 'vereinfacht') {
    anLines.push({
      label: 'Quellensteuer',
      rate: RATES.QST_VEREINFACHT,
      perHour: bruttoH * RATES.QST_VEREINFACHT,
      perYear: round5(bruttoY * RATES.QST_VEREINFACHT),
    });
  } else if (abrechnungsverfahren === 'ordentlich_quellensteuer' && input.quellensteuerSatz) {
    anLines.push({
      label: 'Quellensteuer',
      rate: input.quellensteuerSatz,
      perHour: bruttoH * input.quellensteuerSatz,
      perYear: round5(bruttoY * input.quellensteuerSatz),
    });
  }

  // FAK AN (only Wallis)
  if (kanton === 'VS') {
    anLines.push({
      label: 'FAK (Wallis AN)',
      rate: RATES.FAK_AN_WALLIS,
      perHour: bruttoH * RATES.FAK_AN_WALLIS,
      perYear: round5(bruttoY * RATES.FAK_AN_WALLIS),
    });
  }

  const totalANH = anLines.reduce((s, l) => s + l.perHour, 0);
  const totalANY = anLines.reduce((s, l) => s + l.perYear, 0);

  // ── Stage 5: Net pay ──
  // Use exact division from the rounded total to display the mathematically correct hourly average
  const nettoY = bruttoY - totalANY;
  const nettoH = anzahlStunden > 0 ? nettoY / anzahlStunden : 0;

  // ── Payment recipients (Adressaten) ──
  const adressaten: PayrollResult['adressaten'] = [];

  // Helper to safely sum lines that are already rounded to 5 Rappen
  const findPerYear = (lines: PayrollLine[], labels: string[]) => 
    lines.filter(l => labels.some(lbl => l.label.includes(lbl))).reduce((s, l) => s + l.perYear, 0);

  // 1. Ausgleichskasse
  const ahvIvEoAg = findPerYear(agLines, ['AHV/IV/EO']);
  const alvAg = findPerYear(agLines, ['ALV']);
  const vkAg = findPerYear(agLines, ['VK']);
  const ahvIvEoAn = findPerYear(anLines, ['AHV/IV/EO']);
  const alvAn = findPerYear(anLines, ['ALV']);
  const qstVereinfacht = abrechnungsverfahren === 'vereinfacht' ? findPerYear(anLines, ['Quellensteuer']) : 0;

  const akBeitraege = round5(ahvIvEoAg + alvAg + vkAg + ahvIvEoAn + alvAn + qstVereinfacht);

  adressaten.push({
    label: 'Ausgleichskasse',
    perYear: akBeitraege,
    details: 'AHV/IV/EO + ALV + VK (AG+AN)' + (abrechnungsverfahren === 'vereinfacht' ? ' + Quellensteuer' : ''),
  });

  // 2. FAK
  const fakAg = findPerYear(agLines, ['FAK']);
  const fakAn = findPerYear(anLines, ['FAK']);
  const fakTotal = round5(fakAg + fakAn);
  adressaten.push({
    label: 'Familienausgleichskasse (FAK)',
    perYear: fakTotal,
    details: `FAK ${kanton}` + (kanton === 'VS' ? ' + AN-Beitrag 0.17%' : ''),
  });

  // 3. KT-Versicherer (if any KTV)
  const ktvTotal = round5(findPerYear(agLines, ['KTV']) + findPerYear(anLines, ['KTV']));
  if (ktvTotal > 0) {
    adressaten.push({
      label: 'Krankentaggeld-Versicherer',
      perYear: ktvTotal,
      details: 'KTV AG + AN',
    });
  }

  // 4. Unfallversicherer (if any BU/NBU)
  const uvTotal = round5(findPerYear(agLines, ['BU']) + findPerYear(anLines, ['NBU']));
  if (uvTotal > 0) {
    adressaten.push({
      label: 'Unfallversicherer',
      perYear: uvTotal,
      details: 'BU (AG) + NBU (AN)',
    });
  }

  // 5. Quellensteuer Steueramt (only ordentlich_quellensteuer)
  if (abrechnungsverfahren === 'ordentlich_quellensteuer' && input.quellensteuerSatz) {
    const qstOrdentlich = findPerYear(anLines, ['Quellensteuer']);
    adressaten.push({
      label: 'Steueramt (Quellensteuer)',
      perYear: qstOrdentlich,
      details: `Quellensteuer ${(input.quellensteuerSatz * 100).toFixed(2)}%`,
    });
  }

  return {
    arbeitslohn: { label: 'Arbeitslohn', rate: null, perHour: arbeitslohnH, perYear: arbeitslohnY },
    ferienzuschlag: { label: 'Ferienzuschlag', rate: ferienzuschlag || null, perHour: ferienzuschlagH, perYear: ferienzuschlagY },
    bruttolohn: { label: 'Bruttolohn AN', rate: null, perHour: bruttoH, perYear: bruttoY },
    agLines,
    totalAG: { label: 'Total AG-Beiträge', rate: null, perHour: totalAGH, perYear: totalAGY },
    totalaufwandAG: { label: 'Totalaufwand Arbeitgebender', rate: null, perHour: totalaufwandAGH, perYear: totalaufwandAGY },
    anLines,
    totalAN: { label: 'Total AN-Abzüge', rate: null, perHour: totalANH, perYear: totalANY },
    nettolohn: { label: 'Nettolohn AN', rate: null, perHour: nettoH, perYear: nettoY },
    adressaten,
  };
}

// ─── Format helpers ───
export const fmt = (n: number) => n.toFixed(2);
export const fmtPct = (n: number | null) => n != null ? `${(n * 100).toFixed(2)}%` : '–';
