/**
 * LLM-as-a-Judge (Agent 2)
 * 
 * A separate model that evaluates the output of Agent 1 (the extractor).
 * It reviews each extracted field against the original contract text and
 * assigns confidence scores with justification.
 * 
 * Architecture (from Meeting Decision #4):
 *   Agent 1 extracts data as JSON →
 *   Agent 2 reviews extraction against original contract →
 *   Agent 2 assigns confidence scores + justification per field →
 *   Binary mapping: score >= 0.8 → "ok" (HOOTL), < 0.8 → "review_required" (HOTL/HITL)
 */

import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { getLangSmithInvokeConfig } from './langsmith';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_JUDGE_MODEL = 'anthropic/claude-sonnet-4.6';

export interface JudgeFieldResult {
  confidence: 'high' | 'medium' | 'low';
  confidence_score: number;
  status: 'ok' | 'review_required';
  justification: string;
  source_found: boolean;
  source_quote: string;
}

export interface JudgeResult {
  fields: Record<string, Record<string, JudgeFieldResult>>;
  overall_confidence: number;
  overall_status: 'ok' | 'review_required';
  review_required_fields: string[];
  summary: string;
}

const JUDGE_SYSTEM_PROMPT = `Du bist ein Qualitätsprüfer für Datenextraktionen aus Schweizer Arbeitsverträgen.

Deine Aufgabe: Prüfe jedes extrahierte Feld gegen den Originalvertrag und vergib einen confidence_score (0.0–1.0).

Prüfe pro Feld:
1. Korrektheit: Stimmt der extrahierte Wert mit dem Originaltext überein?
2. Vollständigkeit: Wurde der Wert vollständig erfasst?
3. Quellennachweis: Kannst du die Stelle im Original finden?

Scoring:
- 0.85–1.0 (high): Wert steht explizit und eindeutig im Vertrag, korrekt extrahiert
- 0.50–0.84 (medium): Wert interpretiert, abgeleitet oder teilweise korrekt
- 0.00–0.49 (low): Wert fehlt im Vertrag, falsch extrahiert oder widersprüchlich

Binäre Zuordnung (wird automatisch berechnet):
- confidence_score >= 0.8 → "ok"
- confidence_score < 0.8 → "review_required"

Regeln:
- Sei streng: lieber einmal zu viel "review_required" als einen Fehler durchlassen
- Wert null + Feld nicht im Vertrag → korrekt (0.95, high)
- Wert null + Feld steht im Vertrag → Fehler (0.2, low)
- Geschlecht: niemals aus Name oder Zivilstand ableiten. Null ist korrekt wenn nicht explizit im Vertrag (0.95)
- ISO-Übersetzungen erlaubt: "Schweiz"→CH, "Italien"→IT = korrekt (high)

Deine justification wird NICHT dem Endbenutzer angezeigt – sie dient rein der internen Nachvollziehbarkeit (Audit/Trace). Schreibe eine präzise, fachliche Begründung pro Feld. Zitiere die relevante Stelle aus dem Vertrag in source_quote.

Du gibst ausschliesslich ein JSON-Objekt zurück. Kein erklärender Text davor oder danach.`;

const JUDGE_USER_PROMPT = (
  originalText: string,
  extractedData: Record<string, unknown>,
) => `Bewerte die Extraktion. Vergib NUR confidence_scores.

=== VERTRAG ===
${originalText}
=== ENDE ===

=== EXTRAKTION ===
${JSON.stringify(extractedData, null, 2)}
=== ENDE ===

Bewerte JEDES Feld. Gib ein JSON in diesem Format zurück:

{
  "fields": {
    "employer": {
      "first_name": {
        "confidence": "high|medium|low",
        "confidence_score": 0.0-1.0,
        "status": "ok|review_required",
        "justification": "Fachliche Begründung (intern, nicht für Endbenutzer)",
        "source_found": true|false,
        "source_quote": "Zitat aus dem Vertrag"
      }
    },
    "assistant": { ... },
    "contract_terms": { ... },
    "wage": { ... },
    "social_insurance": { ... }
  },
  "overall_confidence": 0.0-1.0,
  "overall_status": "ok|review_required",
  "review_required_fields": ["section.field_name", ...],
  "summary": "Zusammenfassung der Bewertung"
}`;

function getApiKey(): string | null {
  return import.meta.env.VITE_OPENROUTER_API_KEY || null;
}

function getJudgeModelName(): string {
  return (
    import.meta.env.VITE_OPENROUTER_JUDGE_MODEL ||
    import.meta.env.VITE_OPENROUTER_MODEL ||
    DEFAULT_JUDGE_MODEL ||
    'anthropic/claude-opus-4.6'
  );
}

function getJudgeModel(apiKey: string): ChatOpenAI {
  return new ChatOpenAI({
    apiKey,
    configuration: {
      baseURL: OPENROUTER_API_URL,
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        'HTTP-Referer': window.location.origin,
        'X-Title': 'IV-Assistenzbeitrag Judge',
      },
    },
    modelName: getJudgeModelName(),
    temperature: 0.0,
    maxRetries: 2,
    modelKwargs: {
      response_format: { type: 'json_object' },
    },
  });
}

function parseJudgeResponse(content: unknown): JudgeResult {
  if (typeof content === 'object' && content !== null && !Array.isArray(content)) {
    return content as JudgeResult;
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
    .replace(/^\uFEFF/, '')
    .trim();

  if (!cleanedText) {
    throw new Error('Leere Judge-Antwort erhalten. Bitte erneut versuchen.');
  }

  const looksLikeHtml = /^<!doctype html|^<html\b/i.test(cleanedText);
  if (looksLikeHtml) {
    throw new Error(
      'Unerwartete HTML-Antwort vom Judge erhalten (wahrscheinlich API-Fehler/Rate-Limit/Auth). Bitte erneut versuchen.',
    );
  }

  const tryParse = (candidate: string): JudgeResult | null => {
    try {
      return JSON.parse(candidate) as JudgeResult;
    } catch {
      return null;
    }
  };

  const ensureShape = (parsed: any): JudgeResult => {
    if (parsed && typeof parsed === 'object' && ('error' in parsed || 'message' in parsed) && !('fields' in parsed)) {
      const msg = typeof parsed.message === 'string'
        ? parsed.message
        : typeof (parsed.error as any)?.message === 'string'
          ? (parsed.error as any).message
          : 'Unerwartete API-Antwort erhalten.';
      throw new Error(msg);
    }

    if (!parsed || typeof parsed !== 'object' || !('fields' in parsed) || !('overall_confidence' in parsed)) {
      throw new Error('Unerwartetes Antwortformat des Judge. Bitte erneut versuchen.');
    }
    return parsed as JudgeResult;
  };

  const direct = tryParse(cleanedText);
  if (direct) return ensureShape(direct as any);

  const extracted = extractFirstJsonObject(cleanedText);
  if (extracted) {
    const parsed = tryParse(extracted);
    if (parsed) return ensureShape(parsed as any);
  }

  const startIdx = cleanedText.indexOf('{');
  const endIdx = cleanedText.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const sliced = cleanedText.substring(startIdx, endIdx + 1);
    const parsed = tryParse(sliced);
    if (parsed) return ensureShape(parsed as any);
  }

  const snippet = cleanedText.slice(0, 400);
  throw new Error(
    `Judge-Antwort konnte nicht als JSON geparsed werden. (Antwortanfang: ${JSON.stringify(snippet)})`,
  );
}

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
 * Run the LLM-as-a-Judge evaluation.
 * Agent 2 reviews Agent 1's extraction against the original contract.
 */
export async function runJudge(
  originalText: string,
  extractedContracts: Record<string, unknown>,
): Promise<JudgeResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('VITE_OPENROUTER_API_KEY ist nicht konfiguriert.');
  }

  const model = getJudgeModel(apiKey);

  const response = await model.invoke(
    [
      new SystemMessage(JUDGE_SYSTEM_PROMPT),
      new HumanMessage(JUDGE_USER_PROMPT(originalText, extractedContracts)),
    ],
    await getLangSmithInvokeConfig('agent-2-judge', {
      fieldsToReview: Object.keys(extractedContracts),
    }),
  );

  const result = parseJudgeResponse(response.content);

  if (!result.review_required_fields) {
    result.review_required_fields = [];
  }
  if (result.fields) {
    for (const section of Object.values(result.fields)) {
      for (const [fieldName, field] of Object.entries(section as Record<string, JudgeFieldResult>)) {
        field.status = field.confidence_score >= 0.8 ? 'ok' : 'review_required';
        if (field.status === 'review_required') {
          const sectionName = Object.entries(result.fields).find(
            ([, v]) => v === section,
          )?.[0];
          const fullName = `${sectionName}.${fieldName}`;
          if (!result.review_required_fields.includes(fullName)) {
            result.review_required_fields.push(fullName);
          }
        }
      }
    }
  }

  result.overall_status =
    result.overall_confidence >= 0.8 ? 'ok' : 'review_required';

  return result;
}

/**
 * Run the Judge on vision-based extractions (scanned PDFs).
 * Uses a description of the images instead of raw text.
 */
export async function runJudgeForImages(
  imageDescriptions: string,
  extractedContracts: Record<string, unknown>,
): Promise<JudgeResult> {
  return runJudge(imageDescriptions, extractedContracts);
}
