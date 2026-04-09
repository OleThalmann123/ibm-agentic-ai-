/**
 * NBU (Nichtberufsunfallversicherung) Eligibility Calculator
 *
 * Determines whether an assistant is NBU-eligible based on Art. 8 Abs. 2 UVG
 * and Art. 13 UVV. Uses two methods (Ad-hoc-Kommission Schaden UVG, Empfehlung
 * Nr. 7/87) with 3- and 12-month windows, taking the result more favourable
 * to the employee.
 *
 * UVG monthly salary cap for NBU premium calculation.
 */

import type { NbuStatus, TimeEntry } from '../shared/types';

export const MONTHLY_UVG_CAP = 12_350; // CHF 148'200 / 12

export interface NbuCalcInput {
  timeEntries: Pick<TimeEntry, 'date' | 'start_time' | 'end_time' | 'confirmed'>[];
  contractStartDate?: string;
  hoursPerWeek?: number;
  referenceDate?: Date;
}

interface WeekBucket {
  isoWeek: string;
  hours: number;
}

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const dayOfWeek = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function parseHoursFromEntry(entry: Pick<TimeEntry, 'start_time' | 'end_time'>): number {
  const [sh, sm] = entry.start_time.split(':').map(Number);
  const [eh, em] = entry.end_time.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60; // overnight
  return diff / 60;
}

function bucketByWeek(
  entries: Pick<TimeEntry, 'date' | 'start_time' | 'end_time'>[],
): WeekBucket[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    const key = isoWeekKey(e.date);
    map.set(key, (map.get(key) ?? 0) + parseHoursFromEntry(e));
  }
  return Array.from(map.entries())
    .map(([isoWeek, hours]) => ({ isoWeek, hours }))
    .sort((a, b) => a.isoWeek.localeCompare(b.isoWeek));
}

function filterEntriesByWindow(
  entries: Pick<TimeEntry, 'date' | 'start_time' | 'end_time' | 'confirmed'>[],
  months: number,
  referenceDate: Date,
): Pick<TimeEntry, 'date' | 'start_time' | 'end_time'>[] {
  const windowStart = new Date(referenceDate);
  windowStart.setMonth(windowStart.getMonth() - months);
  const startStr = windowStart.toISOString().slice(0, 10);
  const endStr = referenceDate.toISOString().slice(0, 10);

  return entries.filter((e) => e.confirmed !== false && e.date >= startStr && e.date <= endStr);
}

interface MethodResult {
  method1: boolean;
  method2: boolean;
  avgHours: number | null;
  weeksAbove8hRatio: number | null;
}

function evaluateWindow(buckets: WeekBucket[]): MethodResult {
  const workWeeks = buckets.filter((b) => b.hours > 0);
  if (workWeeks.length === 0) {
    return { method1: false, method2: false, avgHours: null, weeksAbove8hRatio: null };
  }

  const totalHours = workWeeks.reduce((s, w) => s + w.hours, 0);
  const avgHours = totalHours / workWeeks.length;

  const weeksAbove8 = workWeeks.filter((w) => w.hours >= 8).length;
  const weeksBelow8 = workWeeks.length - weeksAbove8;

  const method1 = avgHours >= 8.0;
  const method2 = weeksAbove8 > weeksBelow8;
  const weeksAbove8hRatio = workWeeks.length > 0 ? weeksAbove8 / workWeeks.length : 0;

  return { method1, method2, avgHours, weeksAbove8hRatio };
}

/**
 * Calculate NBU eligibility for a given assistant based on their time entries.
 * Implements both methods (average hours + majority rule) with 3- and 12-month
 * windows. Returns the status more favourable to the employee.
 */
export function calculateNbuEligibility(input: NbuCalcInput): NbuStatus {
  const refDate = input.referenceDate ?? new Date();
  const today = refDate.toISOString().slice(0, 10);

  const confirmedEntries = input.timeEntries.filter((e) => e.confirmed !== false);

  if (confirmedEntries.length === 0 && input.hoursPerWeek != null) {
    const eligible = input.hoursPerWeek >= 8;
    const borderline = input.hoursPerWeek >= 7 && input.hoursPerWeek < 8;
    return {
      nbu_eligible: eligible && !borderline,
      nbu_calculated_date: today,
      nbu_avg_hours_3m: null,
      nbu_avg_hours_12m: null,
      nbu_weeks_above_8h_ratio: null,
      nbu_borderline_warning: borderline,
      nbu_method1_fulfilled: eligible,
      nbu_method2_fulfilled: false,
    };
  }

  const entries3m = filterEntriesByWindow(confirmedEntries, 3, refDate);
  const buckets3m = bucketByWeek(entries3m);
  const result3m = evaluateWindow(buckets3m);

  const entries12m = filterEntriesByWindow(confirmedEntries, 12, refDate);
  const buckets12m = bucketByWeek(entries12m);
  const result12m = evaluateWindow(buckets12m);

  const eligible3m = result3m.method1 || result3m.method2;
  const eligible12m = result12m.method1 || result12m.method2;

  // The result more favourable for the employee applies
  const eligible = eligible3m || eligible12m;

  const avgHours = result3m.avgHours ?? result12m.avgHours ?? (input.hoursPerWeek || null);
  const borderline = avgHours != null && avgHours >= 7.0 && avgHours < 8.0;

  return {
    nbu_eligible: eligible && !borderline,
    nbu_calculated_date: today,
    nbu_avg_hours_3m: result3m.avgHours != null ? Math.round(result3m.avgHours * 100) / 100 : null,
    nbu_avg_hours_12m: result12m.avgHours != null ? Math.round(result12m.avgHours * 100) / 100 : null,
    nbu_weeks_above_8h_ratio: result3m.weeksAbove8hRatio ?? result12m.weeksAbove8hRatio ?? null,
    nbu_borderline_warning: borderline,
    nbu_method1_fulfilled: result3m.method1 || result12m.method1,
    nbu_method2_fulfilled: result3m.method2 || result12m.method2,
  };
}

export interface NbuDeductionInput {
  grossMonthly: number;
  nbuEligible: boolean;
  nbuTotalRatePct: number;
  nbuEmployeePct: number;
  nbuEmployerPct: number;
  nbuEmployerVoluntary: boolean;
  nbuBorderlineWarning: boolean;
  nbuManuallyConfirmed?: boolean;
}

export interface NbuDeductionResult {
  massgebenderLohn: number;
  employeeDeduction: number;
  employerCost: number;
  displayCase: 'A' | 'B' | 'C' | 'D';
  displayLabel: string;
  blocked: boolean;
  blockReason?: string;
}

/**
 * Calculate the NBU deduction amounts for a payslip.
 *
 * Cases:
 *   A – NBU-pflichtig, AN zahlt
 *   B – NBU-pflichtig, AG zahlt freiwillig
 *   C – Nicht NBU-pflichtig (< 8h/Woche)
 *   D – Grenzfall (Lohnlauf blockiert bis manuelle Bestätigung)
 */
export function calculateNbuDeduction(input: NbuDeductionInput): NbuDeductionResult {
  const massgebenderLohn = Math.min(input.grossMonthly, MONTHLY_UVG_CAP);

  if (input.nbuBorderlineWarning && !input.nbuManuallyConfirmed) {
    return {
      massgebenderLohn,
      employeeDeduction: 0,
      employerCost: 0,
      displayCase: 'D',
      displayLabel: `NBU-Status unklar (Grenzfall). Bitte mit Versicherer klären und manuell bestätigen.`,
      blocked: true,
      blockReason: 'NBU-Grenzfall: Durchschnittliche Wochenstunden zwischen 7 und 8. Manuelle Freigabe erforderlich.',
    };
  }

  if (!input.nbuEligible) {
    return {
      massgebenderLohn,
      employeeDeduction: 0,
      employerCost: 0,
      displayCase: 'C',
      displayLabel: 'NBU: Kein Abzug (Beschäftigung < 8h/Woche)',
      blocked: false,
    };
  }

  const totalPremium = Math.round(massgebenderLohn * (input.nbuTotalRatePct / 100) * 100) / 100;

  if (input.nbuEmployerVoluntary) {
    return {
      massgebenderLohn,
      employeeDeduction: 0,
      employerCost: totalPremium,
      displayCase: 'B',
      displayLabel: 'NBU vom Arbeitgeber freiwillig übernommen',
      blocked: false,
    };
  }

  const employeeDeduction = Math.round(massgebenderLohn * (input.nbuEmployeePct / 100) * 100) / 100;
  const employerCost = Math.round(massgebenderLohn * (input.nbuEmployerPct / 100) * 100) / 100;

  return {
    massgebenderLohn,
    employeeDeduction,
    employerCost,
    displayCase: 'A',
    displayLabel: `Nichtberufsunfallversicherung (NBU) ${input.nbuEmployeePct}%`,
    blocked: false,
  };
}

/**
 * Pre-payroll validation checks (§9 of the NBU spec).
 */
export interface NbuValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateNbuForPayroll(opts: {
  nbuEligible: boolean;
  nbuCalculatedDate: string | null;
  nbuTotalRatePct: number | null;
  nbuEmployeePct: number | null;
  nbuEmployerPct: number | null;
  nbuBorderlineWarning: boolean;
  nbuManuallyConfirmed: boolean;
  grossMonthly: number;
  currentMonth: string; // YYYY-MM
}): NbuValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // CHECK 1: NBU calculated this month
  if (opts.nbuCalculatedDate) {
    const calcMonth = opts.nbuCalculatedDate.slice(0, 7);
    if (calcMonth < opts.currentMonth) {
      errors.push('NBU-Status wurde im laufenden Monat nicht neu berechnet. Bitte zuerst NBU-Berechnung durchführen.');
    }
  } else {
    errors.push('NBU-Status wurde noch nie berechnet. Bitte zuerst NBU-Berechnung durchführen.');
  }

  // CHECK 2: Rate present when eligible
  if (opts.nbuEligible && (!opts.nbuTotalRatePct || opts.nbuTotalRatePct <= 0)) {
    errors.push('NBU-Prämiensatz fehlt oder ist 0, obwohl NBU-Pflicht besteht. Lohnlauf nicht möglich.');
  }

  // CHECK 3: Split sums to total
  if (opts.nbuTotalRatePct && opts.nbuEmployeePct != null && opts.nbuEmployerPct != null) {
    const sum = Math.round((opts.nbuEmployeePct + opts.nbuEmployerPct) * 10000) / 10000;
    const total = Math.round(opts.nbuTotalRatePct * 10000) / 10000;
    if (Math.abs(sum - total) > 0.001) {
      errors.push(`NBU-Aufteilung stimmt nicht: AN (${opts.nbuEmployeePct}%) + AG (${opts.nbuEmployerPct}%) = ${sum}% ≠ Gesamt (${total}%)`);
    }
  }

  // CHECK 4: Salary above UVG cap
  if (opts.grossMonthly > MONTHLY_UVG_CAP) {
    warnings.push(`Bruttolohn über UVG-Plafond: NBU wird nur auf CHF ${MONTHLY_UVG_CAP.toLocaleString('de-CH')} berechnet.`);
  }

  // CHECK 5: Borderline without confirmation
  if (opts.nbuBorderlineWarning && !opts.nbuManuallyConfirmed) {
    errors.push('NBU-Grenzfall: Ø-Wochenstunden zwischen 7 und 8. Manuelle Freigabe erforderlich, bevor der Lohnlauf fortgesetzt werden kann.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
