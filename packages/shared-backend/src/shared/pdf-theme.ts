/**
 * Einheitliche PDF-Optik für IV-Rechnung, Lohnabrechnung und Stundenzettel.
 * Akzentflächen: #F2F5F9
 */
export const PDF_THEME = {
  LM: 10,
  RM: 10,
  /** Nutzbare Breite für alle Tabellen (A4 210 − Ränder) */
  INNER_W: 190,

  /** Akzent-Hintergrund #F2F5F9 */
  accentRgb: [242, 245, 249] as [number, number, number],
  /** Kopfzeilen-Band / Sektionen (gleicher Ton) */
  headerBandRgb: [242, 245, 249] as [number, number, number],
  /** Dezente Gitterlinien */
  borderRgb: [214, 223, 234] as [number, number, number],

  textDark: 33,
  textMuted: 120,

  /** Label-Spalte in Zwei-Spalten-Blöcken (Versicherte Person, AG/AN, …) */
  labelColMm: 55,
} as const;

export function pdfValueColMm(): number {
  return PDF_THEME.INNER_W - PDF_THEME.labelColMm;
}
