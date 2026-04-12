export type PayslipAccountingMethod =
  | 'simplified'
  | 'ordinary'
  | 'ordinary_with_withholding';

export interface PayslipInput {
  canton: string; // 2-letter code
  accountingMethod: PayslipAccountingMethod;
  hourlyRate: number; // CHF
  hours: number; // month total
  vacationSurchargeRate: number; // decimal (e.g. 0.0833)
  ktvRateEmployee?: number; // decimal (e.g. 0.01 for 1%)
  // ── Nichtberufsunfallversicherung (NBU) ─────────────────────────────
  // Zweistufige Berechnung:
  //   1. Gesamtprämie = massgebender Lohn × nbuTotalRate
  //   2. Abzug AN     = round2(Gesamtprämie × nbuEmployeeShare)
  nbuTotalRate?: number;       // Gesamtprämiensatz (decimal, z.B. 0.015 = 1.5%)
  nbuEmployeeShare?: number;   // AN-Anteil an der Prämie (fraction 0–1)
  nbuEmployerShare?: number;   // AG-Anteil an der Prämie (fraction 0–1)
  nbuEligible?: boolean;
  nbuEmployerVoluntary?: boolean;
  withholdingTaxRate?: number; // decimal (only for ordinary_with_withholding)
}

export interface PayslipLine {
  label: string;
  rate: number | null; // decimal
  perHour: number;
  perMonth: number;
  enabled?: boolean;
}

export interface PayslipResult {
  wageLines: {
    workWage: PayslipLine;
    vacationSurcharge: PayslipLine;
    grossWage: PayslipLine;
  };
  deductionLines: PayslipLine[];
  totalDeductions: PayslipLine;
  netWage: PayslipLine;
  nbuDisplayNote?: string;
}

const RATES = {
  AHV_IV_EO: 0.053,
  ALV: 0.011,
  WITHHOLDING_SIMPLIFIED: 0.05,
  FAK_WALLIS_EMPLOYEE: 0.0017,
} as const;

const PAYSLIP_UVG_CAP = 12_350; // CHF 148'200 / 12

function round5(value: number): number {
  return Math.round(value * 20) / 20;
}

/** Kaufmännische Rundung auf 2 Dezimalstellen – für den NBU-Abzug, der
 *  nicht auf 5 Rappen, sondern exakt auf Rappen gerundet wird. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculatePayslip(input: PayslipInput): PayslipResult {
  const hours = Number.isFinite(input.hours) ? input.hours : 0;
  const hourlyRate = Number.isFinite(input.hourlyRate) ? input.hourlyRate : 0;
  const vacRate = Number.isFinite(input.vacationSurchargeRate) ? input.vacationSurchargeRate : 0;

  const workPerHour = hourlyRate;
  const workPerMonth = round5(hourlyRate * hours);

  const vacPerHour = workPerHour * vacRate;
  const vacPerMonth = round5(workPerMonth * vacRate);

  const grossPerHour = workPerHour + vacPerHour;
  const grossPerMonth = round5(workPerMonth + vacPerMonth);

  const wageLines = {
    workWage: { label: 'Arbeitslohn', rate: null, perHour: workPerHour, perMonth: workPerMonth },
    vacationSurcharge: { label: 'Ferienzuschlag', rate: vacRate || null, perHour: vacPerHour, perMonth: vacPerMonth },
    grossWage: { label: 'Bruttolohn', rate: null, perHour: grossPerHour, perMonth: grossPerMonth },
  } satisfies PayslipResult['wageLines'];

  const deductions: PayslipLine[] = [];

  deductions.push({
    label: 'AHV/IV/EO',
    rate: RATES.AHV_IV_EO,
    perHour: grossPerHour * RATES.AHV_IV_EO,
    perMonth: round5(grossPerMonth * RATES.AHV_IV_EO),
    enabled: true,
  });

  deductions.push({
    label: 'ALV',
    rate: RATES.ALV,
    perHour: grossPerHour * RATES.ALV,
    perMonth: round5(grossPerMonth * RATES.ALV),
    enabled: true,
  });

  const ktv = input.ktvRateEmployee;
  if (ktv != null && ktv > 0) {
    deductions.push({
      label: 'KTV',
      rate: ktv,
      perHour: grossPerHour * ktv,
      perMonth: round5(grossPerMonth * ktv),
      enabled: true,
    });
  }

  // ── NBU – zweistufige Berechnung ──
  // Schritt 1: Gesamtprämie = massgebender Lohn × Gesamtprämiensatz
  // Schritt 2: Abzug AN     = round2(Gesamtprämie × AN-Anteil)
  const nbuTotalRate = input.nbuTotalRate ?? 0;
  const nbuAnShare = input.nbuEmployeeShare ?? 0;
  const nbuEligible = input.nbuEligible;
  const nbuEmployerVoluntary = input.nbuEmployerVoluntary;
  let nbuDisplayNote: string | undefined;

  if (nbuEligible === false) {
    deductions.push({
      label: 'Nichtberufsunfallversicherung',
      rate: null,
      perHour: 0,
      perMonth: 0,
      enabled: true,
    });
    nbuDisplayNote = 'Nichtberufsunfallversicherung: Kein Abzug (Beschäftigung < 8h/Woche)';
  } else if (nbuTotalRate > 0 && nbuAnShare > 0) {
    const uvgBase = Math.min(grossPerMonth, PAYSLIP_UVG_CAP);
    const totalPremiumPerMonth = uvgBase * nbuTotalRate;
    const anPerMonth = round2(totalPremiumPerMonth * nbuAnShare);
    const anEffectiveRate = nbuTotalRate * nbuAnShare;
    const anPerHour = hours > 0 ? anPerMonth / hours : 0;
    deductions.push({
      label: 'Nichtberufsunfallversicherung',
      rate: anEffectiveRate,
      perHour: anPerHour,
      perMonth: anPerMonth,
      enabled: true,
    });
    nbuDisplayNote = `Nichtberufsunfallversicherung (NBU) ${(nbuTotalRate * 100).toFixed(2)}% – AN-Anteil ${(nbuAnShare * 100).toFixed(0)}%`;
    if (nbuEmployerVoluntary) {
      nbuDisplayNote += ' · auch bei Pensum unter 8h/Woche';
    }
  } else if (nbuTotalRate > 0 && nbuAnShare === 0) {
    // AG zahlt die gesamte Prämie – AN hat keinen Abzug
    deductions.push({
      label: 'Nichtberufsunfallversicherung',
      rate: null,
      perHour: 0,
      perMonth: 0,
      enabled: true,
    });
    nbuDisplayNote = 'Nichtberufsunfallversicherung vom Arbeitgeber getragen';
  }

  if (input.accountingMethod === 'simplified') {
    deductions.push({
      label: 'Quellensteuer',
      rate: RATES.WITHHOLDING_SIMPLIFIED,
      perHour: grossPerHour * RATES.WITHHOLDING_SIMPLIFIED,
      perMonth: round5(grossPerMonth * RATES.WITHHOLDING_SIMPLIFIED),
      enabled: true,
    });
  } else if (input.accountingMethod === 'ordinary_with_withholding') {
    const qst = input.withholdingTaxRate;
    const rate = qst != null && qst > 0 ? qst : 0;
    deductions.push({
      label: 'Quellensteuer',
      rate: rate || null,
      perHour: grossPerHour * rate,
      perMonth: round5(grossPerMonth * rate),
      enabled: rate > 0,
    });
  }

  const isWallis = String(input.canton || '').toUpperCase() === 'VS';
  if (isWallis) {
    deductions.push({
      label: 'FAK',
      rate: RATES.FAK_WALLIS_EMPLOYEE,
      perHour: grossPerHour * RATES.FAK_WALLIS_EMPLOYEE,
      perMonth: round5(grossPerMonth * RATES.FAK_WALLIS_EMPLOYEE),
      enabled: true,
    });
  }

  const totalDeductionsPerHour = deductions.reduce((s, l) => s + (l.perHour || 0), 0);
  const totalDeductionsPerMonth = round5(deductions.reduce((s, l) => s + (l.perMonth || 0), 0));
  const totalDeductions: PayslipLine = {
    label: 'Total Abzüge',
    rate: null,
    perHour: totalDeductionsPerHour,
    perMonth: totalDeductionsPerMonth,
    enabled: true,
  };

  const netPerMonth = round5(grossPerMonth - totalDeductionsPerMonth);
  const netPerHour = hours > 0 ? netPerMonth / hours : (grossPerHour - totalDeductionsPerHour);

  const netWage: PayslipLine = {
    label: 'Nettolohn',
    rate: null,
    perHour: netPerHour,
    perMonth: netPerMonth,
    enabled: true,
  };

  return {
    wageLines,
    deductionLines: deductions,
    totalDeductions,
    netWage,
    nbuDisplayNote,
  };
}

