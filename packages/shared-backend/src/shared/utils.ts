import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, differenceInMinutes } from 'date-fns';
import { de } from 'date-fns/locale';

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format CHF amount Swiss style: 5'030.25 */
export function formatCHF(amount: number): string {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: 'CHF',
    minimumFractionDigits: 2,
  }).format(amount);
}

/** Format a date in German locale */
export function formatDate(date: string | Date, formatStr: string = 'dd.MM.yyyy'): string {
  return format(new Date(date), formatStr, { locale: de });
}

/** Format time HH:mm */
export function formatTime(date: string | Date): string {
  return format(new Date(date), 'HH:mm');
}

/** Calculate duration in minutes between two dates */
export function calcDurationMinutes(start: string | Date, end: string | Date): number {
  return differenceInMinutes(new Date(end), new Date(start));
}

/** Format minutes to hours string: "8.5" */
export function minutesToHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

/** Format minutes to hours display: "8h 30min" */
export function minutesToDisplay(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

/** Get German month name */
export function getMonthName(month: number): string {
  const months = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
  ];
  return months[month - 1] ?? '';
}

/** Get short German weekday */
export function getWeekdayShort(date: Date): string {
  return format(date, 'EEE', { locale: de });
}
