/**
 * Agent 1 – Contract Data Extractor (with Tools)
 * 
 * Extracts structured data from Swiss employment contracts using LangChain
 * with tool-calling capabilities. This qualifies the system as a proper agent.
 * 
 * Architecture:
 *   Agent 1 (this) → extracts raw data as JSON
 *   Agent 2 (judge.ts) → reviews extraction, assigns confidence scores
 *   
 * Binary confidence display (Meeting Decision #2):
 *   Internal scores 0.0–1.0 remain, but UI maps to:
 *   ✅ "ok" (>= 0.8) – field is correct, auto-stored (HOOTL)
 *   ⚠️ "review_required" (< 0.8) – flagged or empty, human must check (HOTL/HITL)
 */

import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { agentTools } from './tools';
import { getLangSmithInvokeConfig } from './langsmith';
import type { JudgeFieldResult } from './judge';
import {
  DEFAULT_EXTRACTOR_MODEL,
  getExtractorModelName,
} from './model-config';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

// ─── Types ──────────────────────────────────────────────

export interface ExtractionField {
  value: string | number | boolean | null;
  confidence: 'high' | 'medium' | 'low';
  confidence_score: number;
  status: 'ok' | 'review_required';
  source_text: string;
  note: string;
  judge_justification?: string;
}

export interface ExtractionResult {
  extraction_metadata: {
    document_language: string;
    overall_confidence: number;
    overall_status: 'ok' | 'review_required';
    fields_extracted: number;
    fields_missing: number;
    fields_requiring_review: number;
    warnings: string[];
    review_required_fields: string[];
  };
  contracts: {
    employer: Record<string, ExtractionField>;
    assistant: Record<string, ExtractionField>;
    contract_terms: Record<string, ExtractionField>;
    wage: Record<string, ExtractionField>;
    social_insurance: Record<string, ExtractionField>;
  };
}

interface RawExtractionField {
  value: string | number | boolean | null;
  source_text: string;
  note: string;
}

interface RawExtractionResult {
  extraction_metadata: {
    document_language: string;
    fields_extracted: number;
    fields_missing: number;
    warnings: string[];
  };
  contracts: {
    employer: Record<string, RawExtractionField>;
    assistant: Record<string, RawExtractionField>;
    contract_terms: Record<string, RawExtractionField>;
    wage: Record<string, RawExtractionField>;
    social_insurance: Record<string, RawExtractionField>;
  };
}

// ─── Prompts ────────────────────────────────────────────

const SYSTEM_PROMPT = `Du bist ein erfahrener HR-Sachbearbeiter in der Schweiz, spezialisiert auf IV-Assistenzbeitrags-Arbeitsverträge. Du erhältst einen Arbeitsvertrag als Dokument. Deine Aufgabe: Extrahiere alle Stamm- und Vertragsdaten der ASSISTENZPERSON und gib sie als strukturiertes JSON aus.

Kontext: Im Vertrag gibt es ZWEI Parteien – verwechsle sie NICHT:
- Arbeitgeberin = assistenznehmende Person (Person MIT Behinderung)
- Arbeitnehmerin = Assistenzperson (Person, die Assistenz LEISTET)
Du extrahierst ausschliesslich die Daten der Arbeitnehmerin (Assistenzperson).

Schritte:
1. Rufe document_classification auf – prüfe ob es ein Schweizer Arbeitsvertrag ist.
2. Wenn kein Arbeitsvertrag: gib ein leeres JSON mit warnings=["KEIN_ARBEITSVERTRAG"] zurück.
3. Lies den gesamten Vertrag durch und extrahiere alle unten gelisteten Felder.
4. Rufe contract_data_submission auf – validiert AHV-Nummer, IBAN und leitet Kanton aus PLZ ab.
5. Markiere fehlende oder nicht auffindbare Felder mit value: null und einer note.

Regeln:
- NUR extrahieren was im Vertrag steht. Niemals erfinden.
- Wenn ein Feld nicht im Vertrag vorkommt: value MUSS null sein. KEINE Standardwerte oder gesetzliche Minima einsetzen.
- Besonders bei Ferien/vacation_weeks: NUR setzen wenn explizit im Vertrag (z.B. "4 Wochen Ferien", "Ferienanspruch: 5 Wochen"). Das gesetzliche Minimum von 4 Wochen ist KEIN Grund, einen Wert einzutragen. Wenn nichts zu Ferien im Vertrag steht → null.
- holiday_supplement_pct: NUR setzen wenn explizit als Prozentsatz im Vertrag angegeben. Wird sonst automatisch aus vacation_weeks berechnet – daher vacation_weeks NIEMALS halluzinieren.
- Geschlecht: niemals aus Name oder Zivilstand ableiten. Null ist korrekt.
- IBAN: nur setzen wenn klar lesbar.
- Kanton: wird aus PLZ der Assistenzperson abgeleitet (via Tool).
- Prozentsätze immer als Dezimal: 5.3% = 0.053. NBU-Sätze liegen typisch bei 0.005–0.03.
- NBU-Aufteilung: AG+AN muss Gesamtsatz ergeben. "Je hälftig" = Gesamt/2. Ohne Angabe: AN = Gesamt.
- source_text MUSS ein wörtliches Zitat aus dem Vertrag sein. Wenn kein Zitat möglich → value = null.
- Arbeitszeit: nur hours_per_week (Stunden pro Woche) extrahieren. Kein Feld für Stunden/Monat – Monatswerte werden nicht erfasst.

Format: Nur valides JSON. Keine Erklärungen. Kein Text vor oder nach dem JSON.`;

const USER_PROMPT_TEMPLATE = (contractText: string) => `Hier ist der Arbeitsvertrag:

---
${contractText}
---

Extrahiere die Daten der ASSISTENZPERSON (Arbeitnehmerin) – NICHT der Arbeitgeberin.
Jedes Feld hat drei Attribute: value, source_text (Zitat aus dem Vertrag), note.
Fehlende Felder: value = null, note = Grund.

Format: Nur valides JSON. Sprache der Keys: Englisch.

{ "extraction_metadata": { "document_language": "", "fields_extracted": 0, "fields_missing": 0, "warnings": [] },
  "contracts": {
    "employer": {
      "first_name": { "value": "", "source_text": "", "note": "" },
      "last_name": { "value": "", "source_text": "", "note": "" },
      "street": { "value": "", "source_text": "", "note": "" },
      "zip": { "value": "", "source_text": "", "note": "" },
      "city": { "value": "", "source_text": "", "note": "" } },
    "assistant": {
      "first_name": { "value": "", "source_text": "", "note": "" },
      "last_name": { "value": "", "source_text": "", "note": "" },
      "street": { "value": "", "source_text": "", "note": "Strasse + Hausnummer" },
      "zip": { "value": "", "source_text": "", "note": "4-stellig CH" },
      "city": { "value": "", "source_text": "", "note": "" },
      "country": { "value": "", "source_text": "", "note": "Nationalität/Staatsangehörigkeit als ISO-2, z.B. CH, DE, IT" },
      "phone": { "value": "", "source_text": "", "note": "+41..." },
      "email": { "value": "", "source_text": "", "note": "" },
      "birth_date": { "value": "", "source_text": "", "note": "YYYY-MM-DD" },
      "gender": { "value": "", "source_text": "", "note": "male|female|diverse, nur wenn explizit" },
      "civil_status": { "value": "", "source_text": "", "note": "ledig|verheiratet|geschieden|verwitwet|eingetragene Partnerschaft" },
      "residence_permit": { "value": "", "source_text": "", "note": "CH|C|B|G|L|N|F (Schweizer Bürger = CH)" },
      "ahv_number": { "value": "", "source_text": "", "note": "756.XXXX.XXXX.XX" } },
    "contract_terms": {
      "start_date": { "value": "", "source_text": "", "note": "YYYY-MM-DD" },
      "end_date": { "value": null, "source_text": "", "note": "null wenn unbefristet" },
      "is_indefinite": { "value": null, "source_text": "", "note": "true|false" },
      "hours_per_week": { "value": null, "source_text": "", "note": "" },
      "notice_period_days": { "value": null, "source_text": "", "note": "in Tagen" } },
    "wage": {
      "wage_type": { "value": "hourly", "source_text": "", "note": "" },
      "hourly_rate": { "value": null, "source_text": "", "note": "CHF brutto, nur Zahl" },
      "vacation_weeks": { "value": null, "source_text": "", "note": "null wenn nicht explizit im Vertrag. NUR setzen wenn Ferienanspruch wörtlich angegeben." },
      "holiday_supplement_pct": { "value": null, "source_text": "", "note": "null wenn nicht explizit im Vertrag. Wird automatisch berechnet falls vacation_weeks gesetzt." },
      "payment_iban": { "value": "", "source_text": "", "note": "CH/LI IBAN. NUR setzen wenn wörtlich im Vertrag. source_text MUSS die IBAN enthalten. Sonst null." } },
    "social_insurance": {
      "accounting_method": { "value": "ordinary", "source_text": "", "note": "" },
      "canton": { "value": "", "source_text": "", "note": "2-stellig, aus PLZ ableiten" },
      "nbu_total_rate_pct": { "value": null, "source_text": "", "note": "Dezimal, 0.015=1.5%, typ. 0.005-0.03" },
      "nbu_employer_pct": { "value": null, "source_text": "", "note": "Dezimal, AG-Anteil" },
      "nbu_employee_pct": { "value": null, "source_text": "", "note": "Dezimal, AN-Anteil, Standard=Gesamt" },
      "nbu_employer_voluntary": { "value": null, "source_text": "", "note": "true wenn AG freiwillig zahlt" },
      "nbu_insurer_name": { "value": "", "source_text": "", "note": "SUVA, Helvetia, etc." },
      "nbu_policy_number": { "value": "", "source_text": "", "note": "" } }
  } }`;

// ─── API ────────────────────────────────────────────────

function getApiKey(): string | null {
  return import.meta.env.VITE_OPENROUTER_API_KEY || null;
}

function getModel(apiKey: string, modelName: string = DEFAULT_EXTRACTOR_MODEL): ChatOpenAI {
  return new ChatOpenAI({
    apiKey,
    configuration: {
      baseURL: OPENROUTER_API_URL,
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        'HTTP-Referer': window.location.origin,
        'X-Title': 'IV-Assistenzbeitrag Vertragsextraktion',
      },
    },
    modelName,
    temperature: 0.1,
    maxRetries: 1,
    timeout: 300_000,
    modelKwargs: {
      response_format: { type: 'json_object' },
      provider: {
        order: ['Anthropic'],
        allow_fallbacks: true,
      },
    },
  });
}

function parseResponse(content: unknown): RawExtractionResult {
  if (typeof content === 'object' && content !== null && !Array.isArray(content)) {
    return content as RawExtractionResult;
  }

  const rawText =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((part) => {
              if (typeof part === 'string') return part;
              if (part && typeof part === 'object' && 'text' in (part as any)) {
                const t = (part as any).text;
                return typeof t === 'string' ? t : JSON.stringify(t);
              }
              return JSON.stringify(part);
            })
            .join('\n')
        : String(content ?? '');

  const cleanedText = rawText
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .replace(/^\uFEFF/, '') // BOM
    .trim();

  if (!cleanedText) {
    throw new Error('Leere KI-Antwort erhalten. Bitte erneut versuchen.');
  }

  const looksLikeHtml = /^<!doctype html|^<html\b/i.test(cleanedText);
  if (looksLikeHtml) {
    throw new Error(
      'Unerwartete HTML-Antwort erhalten (wahrscheinlich API-Fehler/Rate-Limit/Auth). Bitte erneut versuchen.',
    );
  }

  const tryParse = (candidate: string): RawExtractionResult | null => {
    try {
      return JSON.parse(candidate) as RawExtractionResult;
    } catch {
      return null;
    }
  };

  const ensureShape = (parsed: any): RawExtractionResult => {
    // Surface OpenRouter-ish error payloads cleanly (they are valid JSON but not our schema)
    if (parsed && typeof parsed === 'object' && ('error' in parsed || 'message' in parsed) && !('contracts' in parsed)) {
      const msg = typeof parsed.message === 'string'
        ? parsed.message
        : typeof (parsed.error as any)?.message === 'string'
          ? (parsed.error as any).message
          : 'Unerwartete API-Antwort erhalten.';
      throw new Error(msg);
    }

    if (!parsed || typeof parsed !== 'object' || !('contracts' in parsed) || !('extraction_metadata' in parsed)) {
      throw new Error('Unerwartetes Antwortformat der KI. Bitte erneut versuchen.');
    }
    return parsed as RawExtractionResult;
  };

  // 1) Direct parse
  const direct = tryParse(cleanedText);
  if (direct) return ensureShape(direct as any);

  // 2) Extract the first balanced JSON object from the text
  const extracted = extractFirstJsonObject(cleanedText);
  if (extracted) {
    const parsed = tryParse(extracted);
    if (parsed) return ensureShape(parsed as any);
  }

  // 3) Legacy: from first "{" to last "}"
  const startIdx = cleanedText.indexOf('{');
  const endIdx = cleanedText.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const sliced = cleanedText.substring(startIdx, endIdx + 1);
    const parsed = tryParse(sliced);
    if (parsed) return ensureShape(parsed as any);
  }

  const snippet = cleanedText.slice(0, 400);
  throw new Error(
    `KI-Antwort konnte nicht als JSON geparsed werden. Bitte erneut versuchen. (Antwortanfang: ${JSON.stringify(snippet)})`,
  );
}

/**
 * Extract the first JSON object from a string by finding the first balanced { ... }.
 * This tolerates extra text before/after and braces inside JSON strings.
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    if (ch === '}') depth--;

    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }

  return null;
}

/**
 * Run tool calls if the model requests them, then collect the final text response.
 */
async function runAgentWithTools(
  model: ChatOpenAI,
  messages: Array<SystemMessage | HumanMessage>,
): Promise<{ raw: RawExtractionResult; toolCalls: string[] }> {
  const toolCalls: string[] = [];
  const MAX_TOOL_ROUNDS = 3;

  const modelWithTools = model.bindTools(agentTools);

  let response = await modelWithTools.invoke(
    messages,
    await getLangSmithInvokeConfig('agent-1-extractor', { mode: 'text-with-tools' }),
  );
  const allMessages = [...messages, response];
  let round = 0;

  while (response.tool_calls && response.tool_calls.length > 0 && round < MAX_TOOL_ROUNDS) {
    round++;
    for (const call of response.tool_calls) {
      toolCalls.push(call.name);
      const selectedTool = agentTools.find((t) => t.name === call.name);
      if (!selectedTool) {
        throw new Error(`Unknown tool: ${call.name}`);
      }
      const toolResult = await (selectedTool as any).invoke(call.args);
      allMessages.push({
        role: 'tool',
        content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
        tool_call_id: call.id!,
      } as any);
    }

    response = await modelWithTools.invoke(
      allMessages,
      await getLangSmithInvokeConfig('agent-1-extractor', { mode: `tool-round-${round}` }),
    );
    allMessages.push(response);
  }

  if (round >= MAX_TOOL_ROUNDS && response.tool_calls && response.tool_calls.length > 0) {
    console.warn(`[Agent 1] Tool-calling limit reached (${MAX_TOOL_ROUNDS} rounds). Forcing final response.`);
    const forceModel = getModel(
      import.meta.env.VITE_OPENROUTER_API_KEY!,
      getExtractorModelName(),
    );
    response = await forceModel.invoke(
      allMessages,
      await getLangSmithInvokeConfig('agent-1-extractor', { mode: 'forced-final' }),
    );
  }

  return { raw: parseResponse(response.content as string), toolCalls };
}

/**
 * Extract contract data from TEXT content (Agent 1).
 */
export async function extractContractData(
  contractText: string,
): Promise<{ raw: RawExtractionResult; toolCalls: string[] }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('VITE_OPENROUTER_API_KEY ist nicht konfiguriert.');
  }

  const model = getModel(apiKey, getExtractorModelName());

  return runAgentWithTools(model, [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(USER_PROMPT_TEMPLATE(contractText)),
  ]);
}

/**
 * Extract contract data from IMAGES (Agent 1, vision path).
 * Uses the same tool-calling loop as the text path so that
 * document_classification + contract_data_submission (AHV/IBAN/Kanton
 * normalisierung) auch bei Vision-Extraktion durchlaufen werden.
 */
export async function extractContractFromImages(
  images: string[],
): Promise<{ raw: RawExtractionResult; toolCalls: string[] }> {
  const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    {
      type: 'text',
      text: USER_PROMPT_TEMPLATE('[Siehe beigefügte Bilder des Arbeitsvertrags]'),
    },
  ];

  for (const img of images) {
    userContent.push({ type: 'image_url', image_url: { url: img } });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('VITE_OPENROUTER_API_KEY ist nicht konfiguriert.');
  }

  const model = getModel(apiKey, getExtractorModelName());

  return runAgentWithTools(model, [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage({ content: userContent }),
  ]);
}

// ─── Binary Status Helpers ──────────────────────────────

/** Map confidence_score → binary status */
export function confidenceToStatus(
  confidenceScore: number,
): 'ok' | 'review_required' {
  return confidenceScore >= 0.8 ? 'ok' : 'review_required';
}

/** Get human-readable message for review fields */
export function reviewMessage(field: ExtractionField): string | undefined {
  if (field.status === 'ok' && field.value !== null) return undefined;
  if (field.status === 'review_required') {
    if (field.value === null) {
      const hasSource = typeof field.source_text === 'string' && field.source_text.trim().length > 0;
      return hasSource
        ? 'Im Vertrag vorhanden, aber nicht automatisch extrahierbar. Bitte manuell eintragen.'
        : 'Nicht im Vertrag gefunden – bitte ergänzen.';
    }
    return 'Unsicherer Wert – bitte prüfen.';
  }
  if (field.value === null) return 'Nicht im Vertrag gefunden';
  return undefined;
}

/** Get a tooltip with the source text quote */
export function fieldSourceTooltip(field: ExtractionField): string | undefined {
  if (!field.source_text) return undefined;
  return `Quelle: «${field.source_text}» (${Math.round(field.confidence_score * 100)}%)`;
}

/**
 * Merge raw extraction with judge results into final ExtractionResult.
 */
export function mergeWithJudgeResult(
  raw: RawExtractionResult,
  judgeResult: import('./judge').JudgeResult,
): ExtractionResult {
  const contracts: ExtractionResult['contracts'] = {} as any;
  let fieldsRequiringReview = 0;
  const reviewRequiredFields: string[] = [];

  for (const [sectionName, sectionFields] of Object.entries(raw.contracts)) {
    const judgeSection = judgeResult.fields?.[sectionName] || {};
    const mergedSection: Record<string, ExtractionField> = {};

    for (const [fieldName, rawField] of Object.entries(
      sectionFields as Record<string, RawExtractionField>,
    )) {
      if (sectionName === 'contract_terms' && fieldName === 'hours_per_month') continue;
      const judgeField = judgeSection[fieldName] as JudgeFieldResult | undefined;

      const confidenceScore = judgeField?.confidence_score ?? 0.5;
      const status = confidenceScore >= 0.8 ? 'ok' : 'review_required';

      if (status === 'review_required') {
        fieldsRequiringReview++;
        reviewRequiredFields.push(`${sectionName}.${fieldName}`);
      }

      const safeRawField: RawExtractionField =
        rawField && typeof rawField === 'object'
          ? (rawField as RawExtractionField)
          : ({ value: null, source_text: '', note: '' } as RawExtractionField);

      mergedSection[fieldName] = {
        value: safeRawField.value,
        confidence: judgeField?.confidence ?? 'medium',
        confidence_score: confidenceScore,
        status,
        source_text: judgeField?.source_quote || safeRawField.source_text || '',
        note: safeRawField.note,
        judge_justification: judgeField?.justification,
      };
    }

    (contracts as any)[sectionName] = mergedSection;
  }

  return {
    extraction_metadata: {
      document_language: raw.extraction_metadata.document_language,
      overall_confidence: judgeResult.overall_confidence,
      overall_status: judgeResult.overall_confidence >= 0.8 ? 'ok' : 'review_required',
      fields_extracted: raw.extraction_metadata.fields_extracted,
      fields_missing: raw.extraction_metadata.fields_missing,
      fields_requiring_review: fieldsRequiringReview,
      warnings: raw.extraction_metadata.warnings,
      review_required_fields: reviewRequiredFields,
    },
    contracts,
  };
}
