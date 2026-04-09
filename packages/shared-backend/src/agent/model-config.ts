/**
 * Zentrale OpenRouter-Modellwahl für die IDP-Pipeline.
 *
 * Env (Vite):
 * - VITE_OPENROUTER_MODEL            — Override für Extraktion + Judge
 * - VITE_OPENROUTER_EXTRACTOR_MODEL  — nur Agent 1 (Extraktion / Vision)
 * - VITE_OPENROUTER_JUDGE_MODEL      — nur Agent 2 (Qualitätsprüfung)
 *
 * Agent 1 (Haiku 4.5): schnellstes Claude-Modell, zuverlässig bei CH-Vertragsextraktion
 *   – 80–120 tok/s, $1 / $5 pro M Tokens
 *   – 73 % SWE-bench, tool-calling + vision
 *   – Trennt Arbeitgeber/Arbeitnehmer sauber (Gemini verwechselt die Parteien)
 *
 * Agent 2 (Sonnet 4.6): höchste Qualität für den Qualitätscheck
 *   – Frontier-Reasoning für präzise Konfidenz-Bewertung
 */

/**
 * Agent 1 — Extraktion mit Tool-Calls.
 * Haiku 4.5: schnell + zuverlässig bei Schweizer Arbeitsverträgen.
 */
export const DEFAULT_EXTRACTOR_MODEL = 'anthropic/claude-haiku-4.5';

/**
 * Agent 2 — LLM-as-a-Judge (strukturierter JSON-Score pro Feld).
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
