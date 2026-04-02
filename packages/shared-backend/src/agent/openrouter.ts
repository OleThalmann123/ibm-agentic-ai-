/**
 * OpenRouter API - Arbeitsvertrag Datenextraktion
 * 
 * Uses the OpenRouter REST API (browser-compatible) with the full
 * extraction schema for Swiss Assistenzbeitrag employment contracts.
 * 
 * Field confidence → Ampelsystem:
 *   🟢 high   (0.85–1.0) → green  → explicitly stated in contract
 *   🟠 medium (0.50–0.84) → orange → interpreted / derived
 *   🔴 low    (0.00–0.49) → red    → missing / unclear
 */

import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

// ─── Types ──────────────────────────────────────────────

export interface ExtractionField {
  value: string | number | boolean | null;
  confidence: 'high' | 'medium' | 'low';
  confidence_score: number;
  source_text: string;
  note: string;
}

export interface ExtractionResult {
  extraction_metadata: {
    document_language: string;
    overall_confidence: number;
    fields_extracted: number;
    fields_missing: number;
    warnings: string[];
  };
  contracts: {
    employer: Record<string, ExtractionField>;
    assistant: Record<string, ExtractionField>;
    contract_terms: Record<string, ExtractionField>;
    wage: Record<string, ExtractionField>;
    social_insurance: Record<string, ExtractionField>;
  };
}

// ─── Prompt ─────────────────────────────────────────────

const SYSTEM_PROMPT = `Du bist ein spezialisierter Datenextraktions-Agent für Schweizer Assistenzbeitrag-Arbeitsverträge. Deine Aufgabe ist es, aus einem hochgeladenen oder eingefügten Arbeitsvertrag alle relevanten Felder zu extrahieren und diese strukturiert zurückzugeben.

Für jeden extrahierten Wert gibst du ein Konfidenz-Level an, das beschreibt, wie sicher du dir bei der Extraktion bist. Du erfindest niemals Werte. Wenn ein Wert unklar oder nicht vorhanden ist, gibst du null zurück und begründest dies.

Konfidenz-Definitionen:
- high (0.85–1.0): Wert steht explizit und eindeutig im Vertrag
- medium (0.50–0.84): Wert ist implizit, muss interpretiert werden oder ist teilweise lesbar
- low (0.0–0.49): Wert fehlt, ist widersprüchlich, oder stark interpretiert

Extraktionsregeln:
- Extrahiere nur was explizit im Vertrag steht. Keine Annahmen ohne note.
- Daten immer als YYYY-MM-DD formatieren.
- Prozentsätze immer als Dezimal: 5.3% → 0.053
- Kantonskürzel: Grossbuchstaben, 2-stellig (ZH, BE, BS, BL, AG, etc.)
- holiday_supplement_pct aus vacation_weeks ableiten wenn nicht explizit: 4W→0.0833, 5W→0.1064, 6W→0.1304 → confidence: "medium"
- canton aus PLZ/Adresse ableiten wenn nicht explizit → confidence: "medium"
- is_indefinite: true wenn «unbefristet», false wenn end_date vorhanden
- accounting_method: Aus «Vereinfachtes Verfahren», «Ordentliches Verfahren» oder «Ordentliches Verfahren mit Quellensteuer» ableiten

Warnungen (warnings) einfügen wenn zutreffend:
- "FEHLENDE_AHV_NUMMER": ahv_number nicht vorhanden
- "KANTON_ABGELEITET": canton aus Adresse/PLZ abgeleitet
- "FEHLENDE_SOZIALVERSICHERUNGSANGABEN": NBU/KTV/BU fehlen
- "KEIN_LOHN_ANGEGEBEN": weder hourly_rate noch monthly_rate
- "MUSTERVERTRAG_NICHT_AUSGEFUELLT": Mustervertrag ohne ausgefüllte Werte

Du gibst ausschliesslich ein JSON-Objekt zurück. Kein erklärender Text davor oder danach.`;

const USER_PROMPT_TEMPLATE = (contractText: string) => `Extrahiere die Daten aus folgendem Arbeitsvertrag und gib sie als JSON zurück:

---
${contractText}
---

Gib ein JSON in exakt diesem Format zurück. Jedes Feld hat: value, confidence, confidence_score, source_text, note.

{
  "extraction_metadata": {
    "document_language": "<de|fr|it|en>",
    "overall_confidence": <0.0-1.0 Durchschnitt>,
    "fields_extracted": <Anzahl>,
    "fields_missing": <Anzahl>,
    "warnings": []
  },
  "contracts": {
    "employer": {
      "first_name": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "Vorname der assistenznehmenden Person" },
      "last_name": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "" },
      "street": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "" },
      "zip": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "" },
      "city": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "" }
    },
    "assistant": {
      "first_name": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "Vorname der Assistenzperson (Arbeitnehmerin)" },
      "last_name": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "" },
      "street": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "" },
      "zip": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "" },
      "city": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "" },
      "birth_date": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "Format: YYYY-MM-DD" },
      "civil_status": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "ledig, verheiratet, geschieden, verwitwet, eingetragene Partnerschaft" },
      "nationality": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "ISO 3166-1 Alpha-2" },
      "residence_permit": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "B, C, G, L, N, F, CH" },
      "ahv_number": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "Format: 756.XXXX.XXXX.XX" }
    },
    "contract_terms": {
      "start_date": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "YYYY-MM-DD" },
      "end_date": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "YYYY-MM-DD, null wenn unbefristet" },
      "is_indefinite": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "true = unbefristet" },
      "hours_per_week": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "" },
      "hours_per_month": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "" },
      "notice_period_days": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "Kündigungsfrist in Tagen" }
    },
    "wage": {
      "wage_type": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "hourly oder monthly" },
      "hourly_rate": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "CHF brutto" },
      "monthly_rate": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "CHF brutto" },
      "vacation_weeks": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "4, 5 oder 6" },
      "holiday_supplement_pct": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "0.0833=4W, 0.1064=5W, 0.1304=6W" },
      "payment_iban": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "IBAN" }
    },
    "social_insurance": {
      "accounting_method": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "simplified, ordinary, ordinary_quellensteuer" },
      "canton": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "2-stelliges Kürzel" },
      "nbu_employer_pct": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "Dezimal (0.005 = 0.5%)" },
      "nbu_employee_pct": { "value": null, "confidence": "low", "confidence_score": 0.0, "source_text": "", "note": "Dezimal" }
    }
  }
}`;

// ─── API Calls ───────────────────────────────────────────

function getApiKey(): string | null {
  return import.meta.env.VITE_OPENROUTER_API_KEY || null;
}

function getModel(apiKey: string, modelName: string = 'openrouter/auto'): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: apiKey,
    configuration: {
      baseURL: OPENROUTER_API_URL,
      dangerouslyAllowBrowser: true, // Required for frontend client usage
      defaultHeaders: {
        'HTTP-Referer': window.location.origin,
        'X-Title': 'IV-Assistenzbeitrag Vertragsextraktion',
      }
    },
    modelName: modelName,
    temperature: 0.1,
    maxRetries: 2,
    modelKwargs: {
      response_format: { type: 'json_object' }
    }
  });
}

function parseResponse(content: any): ExtractionResult {
  // LangChain sometimes returns an object directly if it parsed it or used tools
  if (typeof content === 'object' && content !== null && !Array.isArray(content)) {
    return content as ExtractionResult;
  }

  const text = typeof content === 'string' ? content : JSON.stringify(content);
  let cleaned = text.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();

  // Robust parsing: find the first { and the last }
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      cleaned = cleaned.substring(startIdx, endIdx + 1);
  }

  try {
    return JSON.parse(cleaned) as ExtractionResult;
  } catch (error) {
    console.error('Failed to parse extraction response:', text);
    throw new Error('KI-Antwort konnte nicht als JSON geparsed werden. Bitte erneut versuchen.');
  }
}

/**
 * Extract contract data from TEXT content.
 * Best for text-based PDFs and pasted contract text.
 */
export async function extractContractData(contractText: string): Promise<ExtractionResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('VITE_OPENROUTER_API_KEY ist nicht konfiguriert. Bitte in .env setzen.');
  }

  const model = getModel(apiKey, 'openrouter/auto');
  
  try {
    const response = await model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(USER_PROMPT_TEMPLATE(contractText))
    ]);
    
    return parseResponse(response.content as string);
  } catch (error: any) {
    throw new Error(`OpenRouter API Fehler: ${error?.message || 'Unbekannter Fehler'}`);
  }
}

/**
 * Extract contract data from IMAGES (scanned PDFs, photos).
 * Uses a vision-capable model via OpenRouter.
 */
export async function extractContractFromImages(images: string[]): Promise<ExtractionResult> {
  // Build multi-modal content: text prompt + images
  const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: 'text', text: USER_PROMPT_TEMPLATE('[Siehe beigefügte Bilder des Arbeitsvertrags]') },
  ];

  for (const img of images) {
    userContent.push({
      type: 'image_url',
      image_url: { url: img },
    });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('VITE_OPENROUTER_API_KEY ist nicht konfiguriert. Bitte in .env setzen.');
  }

  const model = getModel(apiKey, 'google/gemini-2.0-flash-001');

  try {
    const response = await model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage({ content: userContent })
    ]);
    
    return parseResponse(response.content as string);
  } catch (error: any) {
    throw new Error(`OpenRouter API Fehler: ${error?.message || 'Unbekannter Fehler'}`);
  }
}

// ─── Ampelsystem Helpers ────────────────────────────────

/** Map confidence → status color */
export function confidenceToStatus(confidence: string): 'success' | 'warning' | 'error' {
  if (confidence === 'high') return 'success';   // 🟢
  if (confidence === 'medium') return 'warning';  // 🟠
  return 'error';                                  // 🔴
}

/** Get human-readable message based on confidence */
export function confidenceMessage(field: ExtractionField): string | undefined {
  if (field.confidence === 'high' && field.value !== null) return undefined; // No message needed
  if (field.confidence === 'medium') return field.note || 'Unsicher, bitte prüfen';
  if (field.value === null) return field.note || 'Nicht im Vertrag gefunden';
  return field.note || 'Bitte ergänzen';
}

/** Get a tooltip with the source text quote */
export function fieldSourceTooltip(field: ExtractionField): string | undefined {
  if (!field.source_text) return undefined;
  return `Quelle: «${field.source_text}» (${Math.round(field.confidence_score * 100)}%)`;
}
