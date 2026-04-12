/**
 * Öffentliche Kontaktadressen der kantonalen IV-Stellen für die im MVP unterstützten Kantone
 * (LU, BE, ZH – vgl. `SUPPORTED_CANTONS` in agent/tools.ts).
 *
 * Quellen (Stand: Recherche April 2026):
 * - Informationsstelle AHV/IV – «IV-Stellen»: https://www.ahv-iv.ch/de/kontakte/iv-stellen
 * - Bundesamt für Sozialversicherungen – Regressportal «IV-Stellen»:
 *   https://www.regress.admin.ch/regress-ahviv/adressen/iv-stellen/
 *
 * Hinweis: Bei behördlichen Adressänderungen immer die Websites der Stellen prüfen.
 */

export const IV_STELLE_SUPPORTED_CANTONS = ['ZH', 'BE', 'LU'] as const;
export type IvStelleSupportedCanton = (typeof IV_STELLE_SUPPORTED_CANTONS)[number];

export interface IvStellePublicRecord {
  canton: IvStelleSupportedCanton;
  /** Anzeigename für Rechnung / Empfängerzeile */
  institutionNameDe: string;
  /** Strasse / Hausnr. (Besuchs-/Eingangspost) */
  streetLine: string;
  /** Optional: Postfachzeile */
  postBoxLine?: string;
  plz: string;
  city: string;
  phone: string;
  fax?: string;
  website: string;
  /** Kurzbeleg für interne Doku / Support */
  sourceHint: string;
}

export const IV_STELLEN_BY_CANTON: Record<IvStelleSupportedCanton, IvStellePublicRecord> = {
  ZH: {
    canton: 'ZH',
    institutionNameDe: 'SVA Zürich, IV-Stelle',
    streetLine: 'Röntgenstrasse 17',
    postBoxLine: 'Postfach 8087',
    plz: '8048',
    city: 'Zürich',
    phone: '+41 44 448 80 00',
    fax: '+41 44 448 55 55',
    website: 'https://www.svazurich.ch',
    sourceHint: 'AHV/IV IV-Stellen (ZH); Regressportal BSV IV-Stellen',
  },
  BE: {
    canton: 'BE',
    institutionNameDe: 'IV-Stelle Kanton Bern',
    streetLine: 'Scheibenstrasse 70',
    postBoxLine: 'Postfach 3001',
    plz: '3000',
    city: 'Bern',
    phone: '+41 58 219 71 11',
    fax: '+41 58 219 72 72',
    website: 'https://www.ivbe.ch',
    sourceHint: 'AHV/IV IV-Stellen (BE); Regressportal BSV IV-Stellen',
  },
  LU: {
    canton: 'LU',
    institutionNameDe: 'WAS Luzern, IV-Stelle',
    streetLine: 'Landenbergstrasse 35',
    postBoxLine: 'Postfach 6002',
    plz: '6005',
    city: 'Luzern',
    phone: '+41 41 209 00 02',
    fax: '+41 41 369 07 77',
    website: 'https://www.was-luzern.ch/iv',
    sourceHint: 'AHV/IV IV-Stellen (LU); Regressportal BSV IV-Stellen',
  },
};

export function isIvStelleSupportedCanton(c: string | undefined | null): c is IvStelleSupportedCanton {
  return !!c && (IV_STELLE_SUPPORTED_CANTONS as readonly string[]).includes(c);
}

/**
 * Liefert die IV-Stelle für einen Kantons-Code, falls im MVP abgedeckt.
 */
export function getIvStelleRecordForCanton(
  canton: string | undefined | null,
): IvStellePublicRecord | null {
  const code = (canton || '').toUpperCase().trim();
  if (!isIvStelleSupportedCanton(code)) return null;
  return IV_STELLEN_BY_CANTON[code];
}

/**
 * Formatiert mehrzeiligen Empfängernamen für PDF / Einstellungen (Behörde).
 */
export function formatIvStelleAuthorityBlock(rec: IvStellePublicRecord): string {
  const lines = [rec.institutionNameDe, rec.streetLine];
  if (rec.postBoxLine) lines.push(rec.postBoxLine);
  return lines.join('\n');
}

export function formatIvStellePlzCity(rec: IvStellePublicRecord): string {
  return `${rec.plz} ${rec.city}`.trim();
}

/**
 * Vorschlagswerte für `contact_data` / Rechnungsempfänger (wenn Nutzer noch nichts erfasst hat).
 */
export function getIvStelleInvoiceRecipientSuggestion(
  canton: string | undefined | null,
): { authorityName: string; plzCity: string; record: IvStellePublicRecord } | null {
  const rec = getIvStelleRecordForCanton(canton);
  if (!rec) return null;
  return {
    authorityName: formatIvStelleAuthorityBlock(rec),
    plzCity: formatIvStellePlzCity(rec),
    record: rec,
  };
}
