/**
 * Zentrale OpenRouter-Modellwahl für die IDP-Pipeline.
 *
 * Env (Vite):
 * - VITE_OPENROUTER_MODEL — ein Modell für Extraktion + Judge (Override für beides)
 * - VITE_OPENROUTER_EXTRACTOR_MODEL — nur Agent 1 (Extraktion / Vision)
 * - VITE_OPENROUTER_JUDGE_MODEL — nur Agent 2 (Qualitätsprüfung)
 *
 * Tipp: Für maximale Geschwindigkeit bei akzeptabler Qualität Judge auf Haiku/Flash;
 * Extraktion mit Tool-Calls bleibt auf einem stärkeren Modell (z. B. Sonnet).
 */

/** Agent 1: Tool-Calling + komplexes JSON — Sonnet ist ein guter Kompromiss aus Speed und Zuverlässigkeit */
export const DEFAULT_EXTRACTOR_MODEL = 'anthropic/claude-sonnet-4.6';

/**
 * Agent 2: ein strukturierter JSON-Score pro Feld — deutlich schneller als Sonnet,
 * ohne die Extraktion zu beeinflussen.
 */
export const DEFAULT_JUDGE_MODEL = 'anthropic/claude-3.5-haiku';

/** Nur für Rückwärtskompatibilität in Kommentaren / Docs */
export const LEGACY_PREMIUM_MODEL = 'anthropic/claude-opus-4.6';

export function getExtractorModelName(): string {
  return (
    import.meta.env.VITE_OPENROUTER_EXTRACTOR_MODEL ||
    import.meta.env.VITE_OPENROUTER_MODEL ||
    DEFAULT_EXTRACTOR_MODEL
  );
}

export function getJudgeModelName(): string {
  return (
    import.meta.env.VITE_OPENROUTER_JUDGE_MODEL ||
    import.meta.env.VITE_OPENROUTER_MODEL ||
    DEFAULT_JUDGE_MODEL
  );
}
