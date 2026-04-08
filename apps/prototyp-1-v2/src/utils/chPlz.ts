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

