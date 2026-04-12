/**
 * Zentrale OpenRouter-Modellwahl für die IDP-Pipeline.
 *
 * Env (Vite):
 * - VITE_OPENROUTER_MODEL            — Override für Extraktion + Judge
 * - VITE_OPENROUTER_EXTRACTOR_MODEL  — nur Asklepios Extractor (Extraktion / Vision)
 * - VITE_OPENROUTER_JUDGE_MODEL      — nur Asklepios Control (Qualitätsprüfung)
 *
 * Asklepios Extractor (Sonnet 4.6): Frontier-Qualität für präzise Vertragsextraktion
 *   – Tool-calling + Vision
 *   – Trennt Arbeitgeber/Arbeitnehmer sauber
 *   – Tool-Output ist das autoritative Ergebnis
 *
 * Asklepios Control (Sonnet 4.6): Frontier-Qualität für den Qualitätscheck
 *   – Vision-basierte Verifikation gegen Originaldokument
 *   – Frontier-Reasoning für präzise Konfidenz-Bewertung
 */

/**
 * Asklepios Extractor — Extraktion mit Tool-Calls + Vision.
 * Sonnet 4.6: Frontier-Qualität für Schweizer Arbeitsverträge.
 */
export const DEFAULT_EXTRACTOR_MODEL = 'anthropic/claude-sonnet-4.6';

/**
 * Asklepios Control — LLM-as-a-Judge (strukturierter JSON-Score pro Feld).
 * Sonnet 4.6: Frontier-Qualität für die Konfidenz-Bewertung.
 */
export const DEFAULT_JUDGE_MODEL = 'anthropic/claude-sonnet-4.6';

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
