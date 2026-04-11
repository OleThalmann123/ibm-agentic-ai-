/**
 * Swiss Payroll Calculator (Lohnbudget)
 * Hourly-wage-based payroll engine for IV-Assistenzbeitrag
 *
 * Calculates:
 * - Gross pay (Bruttolohn) with optional vacation surcharge
 * - Employer contributions (AG-Beiträge): AHV/IV/EO, ALV, FAK, VK, KTV, BU
 * - Employee deductions (AN-Beiträge): AHV/IV/EO, ALV, KTV, Nichtberufsunfallversicherung, QSt, FAK (Wallis)
 * - Total employer cost (Totalaufwand AG)
 * - Net pay (Nettolohn AN)
 * - Payment recipients breakdown (Adressaten)
 */

// ─── Fixed rates (Bundesvorgaben) ───
export const RATES = {
  AHV_IV_EO: 0.053,    // 5.30%
  ALV: 0.011,           // 1.10%
  VK: 0.05 * 0.1055,   // 0.5275% (Verwaltungskosten)
} as const;

// ─── Plafonds / Caps (jährlich anpassbar) ─────────────────
// In dieser Engine sind Beträge "perYear" faktisch pro Abrechnungsmonat (Monatssumme).
// Für ALV/UVG plafonds verwenden wir deshalb den Monatscap.
const MONTHLY_ALV_CAP = 12350; // CHF 148'200 / 12
const MONTHLY_UVG_CAP = 12350; // CHF 148'200 / 12 (UVG/Nichtberufsunfallversicherung)

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
  { label: '15.56% (7 Wochen)', value: 0.1556 },
] as const;

/**
 * Ferienzuschlag-Satz für eine gegebene Wochenzahl (4–7).
 *
 * Gibt `null` zurück, wenn `vacWeeks` null/undefined ist oder ausserhalb des
 * gültigen Bereichs liegt. Aufrufer müssen in diesem Fall den User prompten
 * oder einen expliziten Default setzen – ein stilles 4-Wochen-Fallback ist
 * nicht mehr erlaubt (Bug A4).
 */
export function getFerienzuschlagRate(vacWeeks: number | null | undefined): number | null {
  if (vacWeeks == null || !Number.isFinite(vacWeeks)) return null;
  switch (vacWeeks) {
    case 4: return 0.0833;
    case 5: return 0.1064;
    case 6: return 0.1304;
    case 7: return 0.1556;
    default: return null;
  }
}

/** Label für einen Ferienzuschlag-Satz, passend zu {@link getFerienzuschlagRate}. */
export function getFerienzuschlagLabel(vacWeeks: number | null | undefined): string {
  const rate = getFerienzuschlagRate(vacWeeks);
  if (rate == null) return '—';
  return (rate * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
}

// ─── Billing method enum ───
export type BillingMethod = 'ordentlich';

export const BILLING_OPTIONS: { label: string; value: BillingMethod }[] = [
  { label: 'Ordentliches Abrechnungsverfahren', value: 'ordentlich' },
];

// ─── Input types ───
export interface PayrollInput {
  stundenlohn: number;
  anzahlStunden: number;
  kanton: string;
  abrechnungsverfahren: BillingMethod;
  ferienzuschlag: number; // 0, 0.0833, 0.1064, 0.1304, or 0.1556

  // Optional employer contributions
  ktvAG?: number;  // KTV rate (decimal)
  buAG?: number;   // BU rate (decimal)

  // Optional employee deductions
  ktvAN?: number;  // KTV rate (decimal)

  // ── Nichtberufsunfallversicherung (NBU) ─────────────────────────────
  // Zweistufige Berechnung:
  //   1. Gesamtprämie = massgebenderLohn × nbuTotalRate
  //   2. Abzug AN     = round2(Gesamtprämie × nbuEmployeeShare)
  //      Beitrag AG   = round2(Gesamtprämie × nbuEmployerShare)
  nbuTotalRate?: number;       // Gesamtprämiensatz (Dezimal, z.B. 0.015 = 1.5%)
  nbuEmployerShare?: number;   // AG-Anteil an der Prämie (Fraktion 0–1)
  nbuEmployeeShare?: number;   // AN-Anteil an der Prämie (Fraktion 0–1)
  nbuEligible?: boolean;
  // Flag aus dem Onboarding: "AG schliesst NBU freiwillig auch bei Pensum
  // unter 8h/Woche ein". Wird nur für die Kennzeichnung der AG-Zeile verwendet
  // ("freiwillig"), beeinflusst die Aufteilung der Prämie nicht.
  nbuEmployerVoluntary?: boolean;

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

/** Kaufmännische Rundung auf 2 Dezimalstellen (Rappen). Wird für die
 *  NBU-Beträge verwendet, damit die feine Prämie (z.B. CHF 0.913) nicht
 *  auf 5 Rappen verzerrt wird, sondern sauber auf CHF 0.91 gerundet bleibt. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculatePayroll(input: PayrollInput): PayrollResult {
  const { stundenlohn, anzahlStunden, kanton, abrechnungsverfahren, ferienzuschlag } = input;
  void abrechnungsverfahren; // MVP: aktuell nur 'ordentlich' unterstützt

  // ── Stage 1: Gross ──
  const arbeitslohnH = stundenlohn;
  const arbeitslohnY = stundenlohn * anzahlStunden;

  const ferienzuschlagH = arbeitslohnH * ferienzuschlag;
  const ferienzuschlagY = round5(arbeitslohnY * ferienzuschlag);

  const bruttoH = arbeitslohnH + ferienzuschlagH;
  const bruttoY = arbeitslohnY + ferienzuschlagY;

  // Base amounts for capped contributions
  const alvBaseY = Math.min(bruttoY, MONTHLY_ALV_CAP);
  const uvgBaseY = Math.min(bruttoY, MONTHLY_UVG_CAP);

  // ── Stage 2: Employer contributions ──
  // FAK ist kantonal obligatorisch – bei unbekanntem Kanton hart abbrechen,
  // statt stillschweigend 0 zu verrechnen (Bug A3).
  const fakEntry = FAK_RATES[kanton];
  if (!fakEntry) {
    throw new Error(
      `FAK-Satz für Kanton "${kanton}" unbekannt. Bitte gültigen Kanton-Kürzel (z.B. ZH, BE, …) angeben.`,
    );
  }
  const fakRate = fakEntry.rate;

  const agLines: PayrollLine[] = [
    { label: 'AHV/IV/EO', rate: RATES.AHV_IV_EO, perHour: bruttoH * RATES.AHV_IV_EO, perYear: round5(bruttoY * RATES.AHV_IV_EO) },
    {
      label: 'ALV',
      rate: RATES.ALV,
      perHour: anzahlStunden > 0 ? round5(alvBaseY * RATES.ALV) / anzahlStunden : 0,
      perYear: round5(alvBaseY * RATES.ALV),
    },
    { label: `FAK (${kanton})`, rate: fakRate, perHour: bruttoH * fakRate, perYear: round5(bruttoY * fakRate) },
    { label: 'VK', rate: RATES.VK, perHour: bruttoH * RATES.VK, perYear: round5(bruttoY * RATES.VK) },
  ];

  if (input.ktvAG != null && input.ktvAG > 0) {
    agLines.push({ label: 'KTV (AG)', rate: input.ktvAG, perHour: bruttoH * input.ktvAG, perYear: round5(bruttoY * input.ktvAG) });
  }
  if (input.buAG != null && input.buAG > 0) {
    agLines.push({ label: 'BU (AG)', rate: input.buAG, perHour: bruttoH * input.buAG, perYear: round5(bruttoY * input.buAG) });
  }

  // ── NBU – zweistufige Berechnung ──
  // Schritt 1: Gesamtprämie = massgebender Lohn × Gesamtprämiensatz
  // Schritt 2: AG-/AN-Anteil = Gesamtprämie × jeweiliger Anteil (Fraktion 0–1)
  //
  // Bug A2: NBU-Abzug nur, wenn `nbuEligible` explizit true ist (oder der AG
  // die Prämie freiwillig übernimmt). Ein fehlendes / noch nicht berechnetes
  // Flag darf nicht zum stillen Default "pflichtig" führen.
  const nbuEligibleEff =
    input.nbuEligible === true || input.nbuEmployerVoluntary === true;
  const nbuTotalRate = input.nbuTotalRate ?? 0;
  const nbuTotalPremiumY = nbuEligibleEff && nbuTotalRate > 0 ? uvgBaseY * nbuTotalRate : 0;
  const nbuAgShare = input.nbuEmployerShare ?? 0;
  const nbuAnShare = input.nbuEmployeeShare ?? 0;

  if (nbuTotalPremiumY > 0 && nbuAgShare > 0) {
    const agPortionY = round2(nbuTotalPremiumY * nbuAgShare);
    const agEffectiveRate = nbuTotalRate * nbuAgShare;
    agLines.push({
      label: input.nbuEmployerVoluntary
        ? 'Nichtberufsunfallversicherung (AG freiwillig)'
        : 'Nichtberufsunfallversicherung (AG)',
      rate: agEffectiveRate,
      // Bug A6: NBU-perHour auf Rappen runden (kein 0.14130952 in der UI).
      perHour: anzahlStunden > 0 ? round2(agPortionY / anzahlStunden) : 0,
      perYear: agPortionY,
    });
  }

  const totalAGH = agLines.reduce((s, l) => s + l.perHour, 0);
  const totalAGY = agLines.reduce((s, l) => s + l.perYear, 0);

  // ── Stage 3: Total employer cost ──
  const totalaufwandAGH = bruttoH + totalAGH;
  const totalaufwandAGY = bruttoY + totalAGY;

  // ── Stage 4: Employee deductions ──
  const anLines: PayrollLine[] = [
    { label: 'AHV/IV/EO', rate: RATES.AHV_IV_EO, perHour: bruttoH * RATES.AHV_IV_EO, perYear: round5(bruttoY * RATES.AHV_IV_EO) },
    {
      label: 'ALV',
      rate: RATES.ALV,
      perHour: anzahlStunden > 0 ? round5(alvBaseY * RATES.ALV) / anzahlStunden : 0,
      perYear: round5(alvBaseY * RATES.ALV),
    },
  ];

  if (input.ktvAN != null && input.ktvAN > 0) {
    anLines.push({ label: 'KTV (AN)', rate: input.ktvAN, perHour: bruttoH * input.ktvAN, perYear: round5(bruttoY * input.ktvAN) });
  }
  if (nbuTotalPremiumY > 0 && nbuAnShare > 0) {
    // Zweistufig: Abzug AN = Gesamtprämie × AN-Anteil (kaufmännisch auf 2 Dezimalstellen gerundet)
    const anPortionY = round2(nbuTotalPremiumY * nbuAnShare);
    const anEffectiveRate = nbuTotalRate * nbuAnShare;
    anLines.push({
      label: 'Nichtberufsunfallversicherung (AN)',
      rate: anEffectiveRate,
      // Bug A6: NBU-perHour auf Rappen runden (kein 0.14130952 in der UI).
      perHour: anzahlStunden > 0 ? round2(anPortionY / anzahlStunden) : 0,
      perYear: anPortionY,
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

  const akBeitraege = round5(ahvIvEoAg + alvAg + vkAg + ahvIvEoAn + alvAn);

  adressaten.push({
    label: 'Ausgleichskasse',
    perYear: akBeitraege,
    details: 'AHV/IV/EO + ALV + VK (AG+AN)',
  });

  // 2. FAK
  const fakAg = findPerYear(agLines, ['FAK']);
  const fakAn = findPerYear(anLines, ['FAK']);
  const fakTotal = round5(fakAg + fakAn);
  adressaten.push({
    label: 'Familienausgleichskasse (FAK)',
    perYear: fakTotal,
    details: `FAK ${kanton}`,
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

  // 4. Unfallversicherer (if any BU/Nichtberufsunfallversicherung)
  const uvTotal = round5(findPerYear(agLines, ['BU']) + findPerYear(anLines, ['Nichtberufsunfallversicherung']));
  if (uvTotal > 0) {
    adressaten.push({
      label: 'Unfallversicherer',
      perYear: uvTotal,
      details: 'BU (AG) + Nichtberufsunfallversicherung (AN)',
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
