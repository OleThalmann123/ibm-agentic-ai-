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
  nbuRateEmployee?: number; // decimal
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
}

const RATES = {
  AHV_IV_EO: 0.053,
  ALV: 0.011,
  WITHHOLDING_SIMPLIFIED: 0.05,
  FAK_WALLIS_EMPLOYEE: 0.0017,
} as const;

function round5(value: number): number {
  return Math.round(value * 20) / 20;
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

  const nbu = input.nbuRateEmployee;
  if (nbu != null && nbu > 0) {
    deductions.push({
      label: 'NBU',
      rate: nbu,
      perHour: grossPerHour * nbu,
      perMonth: round5(grossPerMonth * nbu),
      enabled: true,
    });
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
  };
}

