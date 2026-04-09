/**
 * Zentrale OpenRouter-Modellwahl für die IDP-Pipeline.
 *
 * Env (Vite):
 * - VITE_OPENROUTER_MODEL            — Override für Extraktion + Judge
 * - VITE_OPENROUTER_EXTRACTOR_MODEL  — nur Agent 1 (Extraktion / Vision)
 * - VITE_OPENROUTER_JUDGE_MODEL      — nur Agent 2 (Qualitätsprüfung)
 *
 * Agent 1 (Gemini 2.5 Flash): schnellstes Tool-Calling-Modell auf OpenRouter
 *   – ~200 tok/s, $0.30 / $2.50 pro M Tokens
 *   – #2 Health, #2 Legal — top Qualität für Datenextraktion
 *
 * Agent 2 (Sonnet 4.6): höchste Qualität für den Qualitätscheck
 *   – Frontier-Reasoning für präzise Konfidenz-Bewertung
 */

/**
 * Agent 1 — Extraktion mit Tool-Calls.
 * Gemini 2.5 Flash: extrem schnell, tool-calling + vision + structured JSON.
 */
export const DEFAULT_EXTRACTOR_MODEL = 'google/gemini-2.5-flash';

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
