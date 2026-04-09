import chPlzData from '@/data/ch-plz.json';

type ChPlzData = {
  validPlz: string[];
  plzToCity: Record<string, string>;
};

const DATA = chPlzData as unknown as ChPlzData;

const VALID_SET = new Set(DATA.validPlz);

export function normalizeChPlz(raw: string): string {
  return (raw ?? '').replace(/\D/g, '').slice(0, 4);
}

export function isValidChPlz(raw: string): boolean {
  const plz = normalizeChPlz(raw);
  return plz.length === 4 && VALID_SET.has(plz);
}

export function getCityFromChPlz(raw: string): string | null {
  const plz = normalizeChPlz(raw);
  if (plz.length !== 4) return null;
  return DATA.plzToCity[plz] || null;
}

// Coarse mapping PLZ → Kanton (für Onboarding/Settings; reicht für Demo-UX)
const PLZ_CANTON_MAP: Array<[number, number, string, string]> = [
  [1000, 1299, 'VD', 'Vaud'],
  [1300, 1499, 'VD', 'Vaud'],
  [1500, 1699, 'FR', 'Fribourg'],
  [1700, 1799, 'FR', 'Fribourg'],
  [1800, 1899, 'VD', 'Vaud'],
  [1900, 1999, 'VS', 'Valais'],
  [2000, 2199, 'NE', 'Neuchâtel'],
  [2200, 2299, 'NE', 'Neuchâtel'],
  [2300, 2399, 'JU', 'Jura'],
  [2400, 2499, 'JU', 'Jura'],
  [2500, 2599, 'BE', 'Bern'],
  [2600, 2699, 'BE', 'Bern'],
  [2700, 2799, 'BE', 'Bern'],
  [2800, 2899, 'JU', 'Jura'],
  [3000, 3999, 'BE', 'Bern'],
  [4000, 4099, 'BS', 'Basel-Stadt'],
  [4100, 4299, 'BL', 'Basel-Landschaft'],
  [4300, 4799, 'SO', 'Solothurn'],
  [4800, 4899, 'AG', 'Aargau'],
  [4900, 4999, 'BE', 'Bern'],
  [5000, 5799, 'AG', 'Aargau'],
  [6000, 6299, 'LU', 'Luzern'],
  [6300, 6399, 'ZG', 'Zug'],
  [6400, 6499, 'SZ', 'Schwyz'],
  [6500, 6999, 'TI', 'Tessin'],
  [7000, 7799, 'GR', 'Graubünden'],
  [8000, 8499, 'ZH', 'Zürich'],
  [8500, 8599, 'TG', 'Thurgau'],
  [8600, 8699, 'ZH', 'Zürich'],
  [8700, 8799, 'SG', 'St. Gallen'],
  [8800, 8899, 'SZ', 'Schwyz'],
  [8900, 8999, 'AG', 'Aargau'],
  [9000, 9099, 'SG', 'St. Gallen'],
  [9100, 9199, 'AR', 'Appenzell AR'],
  [9200, 9299, 'SG', 'St. Gallen'],
  [9300, 9399, 'SG', 'St. Gallen'],
  [9400, 9499, 'SG', 'St. Gallen'],
  [9500, 9599, 'TG', 'Thurgau'],
  [9600, 9699, 'SG', 'St. Gallen'],
];

export function getCantonFromPLZ(plzRaw: string): { code: string; name: string } | null {
  const plz = normalizeChPlz(plzRaw);
  const num = parseInt(plz, 10);
  if (!Number.isFinite(num)) return null;
  for (const [from, to, code, name] of PLZ_CANTON_MAP) {
    if (num >= from && num <= to) return { code, name };
  }
  return null;
}

