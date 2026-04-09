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

const SYSTEM_PROMPT = `Du bist ein spezialisierter Datenextraktions-Agent für Schweizer Assistenzbeitrag-Arbeitsverträge. 

Deine Aufgabe ist es, aus einem Arbeitsvertrag alle relevanten Felder zu extrahieren und strukturiert als JSON zurückzugeben.

WICHTIG: Du bist NUR für die Extraktion zuständig. Du vergibst KEINE Konfidenz-Scores – das übernimmt ein separater Qualitätsprüfer.

Du hast Zugriff auf folgende Tools:

1. **document_classification**: Prüft, ob das Dokument ein relevanter Schweizer Arbeitsvertrag ist. Verwende dieses Tool ZUERST, bevor du mit der Extraktion beginnst. Übergib den vollständigen Dokumenttext.

2. **contract_data_submission**: Überträgt alle extrahierten Vertragsdaten in strukturierter Form ans Backend. Validiert dabei automatisch AHV-Nummern, IBANs, Kantonskürzel, PLZ und berechnet fehlende Felder (Kanton aus PLZ, Ferienzuschlag aus Ferienwochen). Verwende dieses Tool NACH der Extraktion, um die Daten zu validieren und zu übermitteln.

Workflow:
1. Verwende document_classification um das Dokument zu klassifizieren
2. Wenn is_relevant=false → sofort abbrechen und ein JSON mit leeren contracts zurückgeben (alle Felder null, fields_extracted=0, warnings=["KEIN_ARBEITSVERTRAG"])
3. Extrahiere die Daten aus dem Vertrag
4. Verwende contract_data_submission um die Daten zu validieren und zu übermitteln

Extraktionsregeln:
- Extrahiere nur was explizit im Vertrag steht. Erfinde niemals Werte.
- Wenn ein Wert nicht vorhanden ist, gib null zurück und begründe dies in note.
- **Geschlecht**: nur setzen, wenn es im Vertrag explizit genannt ist (z. B. "Herr/Frau", "männlich/weiblich/divers"). Niemals aus Zivilstand ableiten. Wenn unsicher → null.
- **IBAN (CH/LI)**: nur setzen, wenn eine IBAN explizit im Vertrag steht. Normalisiere auf Grossbuchstaben und entferne Trennzeichen. Wenn du dir unsicher bist oder die IBAN nicht sauber erkennbar ist → null (nicht raten).
- Daten immer als YYYY-MM-DD formatieren.
- Prozentsätze als Dezimal: 5.3% → 0.053
- Kantonskürzel: Grossbuchstaben, 2-stellig (ZH, BE, BS, etc.)
- is_indefinite: true wenn «unbefristet», false wenn end_date vorhanden
- accounting_method: «ordinary» (aktuell nur ordentlich unterstützt)
- Arbeitszeit: Wenn nur Stunden/Woche im Vertrag stehen, setze hours_per_week und lasse hours_per_month null (wird im Tool aus weekly × 4 abgeleitet).

Warnungen (warnings) einfügen wenn zutreffend:
- "FEHLENDE_AHV_NUMMER": ahv_number nicht vorhanden
- "KANTON_ABGELEITET": canton wurde aus PLZ abgeleitet
- "FEHLENDE_SOZIALVERSICHERUNGSANGABEN": NBU/KTV/BU fehlen
- "KEIN_LOHN_ANGEGEBEN": hourly_rate fehlt
- "MUSTERVERTRAG_NICHT_AUSGEFUELLT": Mustervertrag ohne ausgefüllte Werte

Du gibst ausschliesslich ein JSON-Objekt zurück. Kein erklärender Text davor oder danach.`;

const USER_PROMPT_TEMPLATE = (contractText: string) => `Klassifiziere und extrahiere die Daten aus dem folgenden Dokument. Verwende deine Tools.

---
${contractText}
---

Gib ein JSON in exakt diesem Format zurück. Jedes Feld hat: value, source_text, note.

{
  "extraction_metadata": {
    "document_language": "<de|fr|it|en>",
    "fields_extracted": <Anzahl>,
    "fields_missing": <Anzahl>,
    "warnings": []
  },
  "contracts": {
    "employer": {
      "first_name": { "value": null, "source_text": "", "note": "Vorname der assistenznehmenden Person" },
      "last_name": { "value": null, "source_text": "", "note": "" },
      "street": { "value": null, "source_text": "", "note": "" },
      "zip": { "value": null, "source_text": "", "note": "" },
      "city": { "value": null, "source_text": "", "note": "" }
    },
    "assistant": {
      "first_name": { "value": null, "source_text": "", "note": "Vorname der Assistenzperson" },
      "last_name": { "value": null, "source_text": "", "note": "" },
      "street": { "value": null, "source_text": "", "note": "" },
      "house_number": { "value": null, "source_text": "", "note": "Hausnummer als Zahl" },
      "zip": { "value": null, "source_text": "", "note": "" },
      "city": { "value": null, "source_text": "", "note": "" },
      "country": { "value": null, "source_text": "", "note": "Land (z. B. CH)" },
      "phone": { "value": null, "source_text": "", "note": "Telefonnummer (mit Ländervorwahl)" },
      "email": { "value": null, "source_text": "", "note": "E-Mail-Adresse" },
      "birth_date": { "value": null, "source_text": "", "note": "Format: YYYY-MM-DD" },
      "gender": { "value": null, "source_text": "", "note": "male|female|diverse" },
      "civil_status": { "value": null, "source_text": "", "note": "" },
      "nationality": { "value": null, "source_text": "", "note": "ISO 3166-1 Alpha-2" },
      "residence_permit": { "value": null, "source_text": "", "note": "B, C, G, L, N, F, CH" },
      "ahv_number": { "value": null, "source_text": "", "note": "Format: 756.XXXX.XXXX.XX" }
    },
    "contract_terms": {
      "start_date": { "value": null, "source_text": "", "note": "YYYY-MM-DD" },
      "end_date": { "value": null, "source_text": "", "note": "YYYY-MM-DD, null wenn unbefristet" },
      "is_indefinite": { "value": null, "source_text": "", "note": "true = unbefristet" },
      "hours_per_week": { "value": null, "source_text": "", "note": "" },
      "hours_per_month": { "value": null, "source_text": "", "note": "" },
      "notice_period_days": { "value": null, "source_text": "", "note": "Kündigungsfrist in Tagen" }
    },
    "wage": {
      "wage_type": { "value": null, "source_text": "", "note": "hourly" },
      "hourly_rate": { "value": null, "source_text": "", "note": "CHF brutto" },
      "vacation_weeks": { "value": null, "source_text": "", "note": "4, 5 oder 6" },
      "holiday_supplement_pct": { "value": null, "source_text": "", "note": "0.0833=4W, 0.1064=5W, 0.1304=6W" },
      "payment_iban": { "value": null, "source_text": "", "note": "IBAN" }
    },
    "social_insurance": {
      "accounting_method": { "value": null, "source_text": "", "note": "ordinary" },
      "canton": { "value": null, "source_text": "", "note": "2-stelliges Kürzel" },
      "nbu_employer_pct": { "value": null, "source_text": "", "note": "Dezimal (0.005 = 0.5%)" },
      "nbu_employee_pct": { "value": null, "source_text": "", "note": "Dezimal" }
    }
  }
}`;

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
    maxRetries: 2,
    modelKwargs: {
      response_format: { type: 'json_object' },
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

  const response = await model.invoke(
    [new SystemMessage(SYSTEM_PROMPT), new HumanMessage({ content: userContent })],
    await getLangSmithInvokeConfig('agent-1-extractor', { mode: 'vision' }),
  );

  return { raw: parseResponse(response.content as string), toolCalls: [] };
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
