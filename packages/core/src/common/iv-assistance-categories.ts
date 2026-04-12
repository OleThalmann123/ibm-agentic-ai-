/**
 * Offizielle IV-Assistenzbeitrag-Kategorien (Art. 39c IVG).
 *
 * In `time_entry.category` werden historisch die String-Codes **"2"–"9"** gespeichert;
 * die sichtbare Nummerierung in UI und PDF ist **1–8** (Code minus 1).
 *
 * „Nachtdienst“ (Code "10") ist keine IV-Leistungskategorie – separat in der Zeiterfassung.
 */

export const IV_ASSISTANCE_CATEGORY_CODES = ['2', '3', '4', '5', '6', '7', '8', '9'] as const;
export type IvAssistanceCategoryCode = (typeof IV_ASSISTANCE_CATEGORY_CODES)[number];

export interface IvAssistanceCategoryDefinition {
  /** Persistierter Wert in der DB (`time_entry.category`) */
  code: IvAssistanceCategoryCode;
  /** Anzeige-Index 1–8 (für PDF / Legende) */
  displayOrder: number;
  /** Kurzname ohne Nummer (z. B. Rechnungstabelle) */
  labelDe: string;
  /** Text wie im Assistenz-Dropdown */
  labelDropdownDe: string;
}

/**
 * Die acht Kategorien in fester Reihenfolge (Anzeige 1–8).
 */
export const IV_ASSISTANCE_CATEGORIES: readonly IvAssistanceCategoryDefinition[] = [
  {
    code: '2',
    displayOrder: 1,
    labelDe: 'Alltägliche Lebensverrichtungen',
    labelDropdownDe: '1) Alltägliche Lebensverrichtungen',
  },
  {
    code: '3',
    displayOrder: 2,
    labelDe: 'Haushaltsführung',
    labelDropdownDe: '2) Haushaltsführung',
  },
  {
    code: '4',
    displayOrder: 3,
    labelDe: 'Gesellschaftliche Teilhabe und Freizeitgestaltung',
    labelDropdownDe: '3) Gesellschaftliche Teilhabe und Freizeitgestaltung',
  },
  {
    code: '5',
    displayOrder: 4,
    labelDe: 'Erziehung und Kinderbetreuung',
    labelDropdownDe: '4) Erziehung und Kinderbetreuung',
  },
  {
    code: '6',
    displayOrder: 5,
    labelDe: 'Gemeinnützig/ehrenamtlich',
    labelDropdownDe: '5) Gemeinnützig/ehrenamtlich',
  },
  {
    code: '7',
    displayOrder: 6,
    labelDe: 'Berufliche Aus- und Weiterbildung',
    labelDropdownDe: '6) Berufliche Aus- und Weiterbildung',
  },
  {
    code: '8',
    displayOrder: 7,
    labelDe: 'Erwerbstätigkeit (1. Arbeitsmarkt)',
    labelDropdownDe: '7) Erwerbstätigkeit (1. Arbeitsmarkt)',
  },
  {
    code: '9',
    displayOrder: 8,
    labelDe: 'Überwachung während des Tages',
    labelDropdownDe: '8) Überwachung während des Tages',
  },
] as const;

const BY_CODE = new Map<string, IvAssistanceCategoryDefinition>(
  IV_ASSISTANCE_CATEGORIES.map((c) => [c.code, c]),
);

/** Map Anzeige-Index 1–8 → Kurzlabel (für Stundenzettel-PDF etc.) */
export const IV_CATEGORY_LABEL_BY_DISPLAY_ORDER: Record<number, string> = Object.fromEntries(
  IV_ASSISTANCE_CATEGORIES.map((c) => [c.displayOrder, c.labelDe]),
) as Record<number, string>;

export function isIvAssistanceCategoryCode(s: string): s is IvAssistanceCategoryCode {
  return (IV_ASSISTANCE_CATEGORY_CODES as readonly string[]).includes(s);
}

export function getIvAssistanceCategoryByCode(code: string): IvAssistanceCategoryDefinition | undefined {
  return BY_CODE.get(code.trim());
}

/** Dropdown-Optionen für TokenLogin / Zeiterfassung */
export function getIvAssistanceActivityOptions(): Array<{ value: string; label: string }> {
  return IV_ASSISTANCE_CATEGORIES.map((c) => ({
    value: c.code,
    label: c.labelDropdownDe,
  }));
}

/** Voller Dropdown-Text wie „1) Alltägliche …“ oder Rohtext / „Ohne Kategorie“. */
export function activityLabelFromStoredCode(code?: string | null): string {
  const c = (code || '').trim();
  if (!c) return 'Ohne Kategorie';
  if (c === '10') return 'Nachtdienst';
  const def = getIvAssistanceCategoryByCode(c);
  if (def) return def.labelDropdownDe;
  return c;
}

/**
 * Kompakte Darstellung: `1 · Alltägliche Lebensverrichtungen`
 * (Codes 2–9 → Display 1–8). Sonderfall Nacht: Code "10".
 */
export function formatIvCategoryForInlineDisplay(code?: string | null): string {
  const raw = (code || '').trim();
  if (!raw) return 'Ohne Kategorie';

  if (raw === '10') return 'Nachtdienst';

  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;

  if (n >= 2 && n <= 9) {
    const def = getIvAssistanceCategoryByCode(String(n));
    if (!def) return raw;
    return `${def.displayOrder} · ${def.labelDe}`;
  }

  if (n >= 1 && n <= 8) {
    const def = IV_ASSISTANCE_CATEGORIES.find((c) => c.displayOrder === n);
    return def ? `${def.displayOrder} · ${def.labelDe}` : String(n);
  }

  return raw;
}

/** Standard-IV-Ansatz CHF/Std. für Rechnung (kann pro Arbeitgeber überschrieben werden). */
export const IV_INVOICE_DEFAULT_RATE_CHF = 35.3;
