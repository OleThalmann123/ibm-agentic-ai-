# LangChain im Stammdatenextraktions-Agent: Technische Dokumentation

## 1. Was ist LangChain?

LangChain ist ein Open-Source-Framework, das die Arbeit mit Large Language Models (LLMs) vereinfacht. Es bietet standardisierte Schnittstellen, um mit verschiedenen KI-Modellen zu kommunizieren, ohne den HTTP-Client selber bauen zu müssen.

In unserem Projekt verwenden wir **zwei LangChain-Pakete**:

| Paket | Version | Zweck |
|-------|---------|-------|
| `@langchain/openai` | ^0.4.4 | Stellt die `ChatOpenAI`-Klasse bereit (LLM-Client) |
| `@langchain/core` | ^0.3.40 | Stellt `SystemMessage` und `HumanMessage` bereit (Nachrichten-Typen) |

Diese werden in der `package.json` von `@asklepios/backend` deklariert:

```json
{
  "dependencies": {
    "@langchain/core": "^0.3.40",
    "@langchain/openai": "^0.4.4",
    "@supabase/supabase-js": "^2.39.3",
    "pdfjs-dist": "^4.10.38"
  }
}
```

---

## 2. Wo kommt LangChain im Code vor?

LangChain wird ausschliesslich in **einer einzigen Datei** verwendet:

**Datei:** `packages/shared-backend/src/agent/openrouter.ts`

### 2.1 Die Imports (Zeile 13-14)

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
```

- **`ChatOpenAI`**: Ein LLM-Client, der normalerweise für die OpenAI API gebaut ist. Wir nutzen ihn "umgeleitet" auf die OpenRouter API (dazu gleich mehr).
- **`SystemMessage`**: Wrapper-Klasse für System-Prompts (Instruktionen an das LLM).
- **`HumanMessage`**: Wrapper-Klasse für User-Prompts (die Frage/Anfrage vom Benutzer).

---

## 3. Wie wird LangChain konfiguriert?

### 3.1 Die `getModel()`-Funktion (Zeile 142-160)

Das ist die zentrale Stelle, wo LangChain konfiguriert wird:

```typescript
function getModel(apiKey: string, modelName: string = 'openrouter/auto'): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: apiKey,
    configuration: {
      baseURL: OPENROUTER_API_URL,              // ← "https://openrouter.ai/api/v1"
      dangerouslyAllowBrowser: true,             // ← Erlaubt Browser-Ausführung
      defaultHeaders: {
        'HTTP-Referer': window.location.origin,  // ← Pflicht-Header für OpenRouter
        'X-Title': 'IV-Assistenzbeitrag Vertragsextraktion',  // ← App-Name
      }
    },
    modelName: modelName,         // ← Welches KI-Modell
    temperature: 0.1,             // ← Sehr deterministisch (wenig Kreativität)
    maxRetries: 2,                // ← Bei Fehler 2x nochmal versuchen
    modelKwargs: {
      response_format: { type: 'json_object' }  // ← Erzwingt JSON-Antwort
    }
  });
}
```

### 3.2 Erklärung jeder Einstellung

#### `apiKey`
Der OpenRouter API-Key aus der `.env`-Datei:
```
VITE_OPENROUTER_API_KEY=sk-or-v1-d6a8fa4a...
```
Wird über `import.meta.env.VITE_OPENROUTER_API_KEY` gelesen. Das `VITE_`-Prefix sorgt dafür, dass Vite die Variable im Browser verfügbar macht.

#### `baseURL: 'https://openrouter.ai/api/v1'`
**Das ist der Trick:** `ChatOpenAI` ist eigentlich für die OpenAI API gebaut (`https://api.openai.com/v1`). Aber weil OpenRouter die gleiche API-Schnittstelle nachbaut (OpenAI-kompatibel), können wir einfach die URL umleiten. LangChain merkt keinen Unterschied.

```
Normalerweise:  ChatOpenAI → api.openai.com → GPT-4, GPT-3.5
Bei uns:        ChatOpenAI → openrouter.ai  → beliebiges Modell
```

#### `dangerouslyAllowBrowser: true`
Normalerweise verhindert LangChain Aufrufe aus dem Browser (weil API-Keys im Frontend sichtbar sind). Diese Einstellung überschreibt diese Sicherheitssperre, weil unser gesamtes System im Browser läuft (kein Backend-Server).

#### `defaultHeaders`
OpenRouter verlangt zwei Custom-Headers:
- `HTTP-Referer`: Woher die Anfrage kommt (z.B. `http://localhost:5173`)
- `X-Title`: Name der Anwendung (für OpenRouter-Dashboard)

#### `modelName`
Welches LLM-Modell verwendet wird:
- **`'openrouter/auto'`**: OpenRouter wählt automatisch das beste Preis-Leistungs-Modell. Wird für Text-basierte Verträge verwendet.
- **`'google/gemini-2.0-flash-001'`**: Google Gemini mit Vision-Fähigkeit. Wird für gescannte PDFs und Bilder verwendet.

#### `temperature: 0.1`
Wert zwischen 0.0 und 2.0. Je niedriger, desto deterministischer (gleicher Input → gleicher Output). 0.1 ist bewusst niedrig gewählt, weil bei Datenextraktion Konsistenz wichtiger ist als Kreativität.

#### `maxRetries: 2`
Bei Netzwerkfehlern oder Rate-Limits wird der Aufruf bis zu 2x wiederholt. LangChain handhabt das automatisch mit exponentiellem Backoff.

#### `response_format: { type: 'json_object' }`
Zwingt das LLM, ausschliesslich gültiges JSON zurückzugeben. Ohne diese Einstellung könnte das Modell erklärenden Text vor oder nach dem JSON einfügen.

---

## 4. Wie wird LangChain aufgerufen?

Es gibt **zwei Aufruf-Funktionen**, die sich im Modell und Input-Format unterscheiden:

### 4.1 Text-Extraktion: `extractContractData()` (Zeile 191-209)

Für **Text-basierte PDFs** und **eingefügten Vertragstext**:

```typescript
export async function extractContractData(contractText: string): Promise<ExtractionResult> {
  // 1. API-Key prüfen
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('VITE_OPENROUTER_API_KEY ist nicht konfiguriert.');

  // 2. LangChain-Modell erstellen (openrouter/auto)
  const model = getModel(apiKey, 'openrouter/auto');
  
  // 3. LangChain-Aufruf mit zwei Nachrichten
  const response = await model.invoke([
    new SystemMessage(SYSTEM_PROMPT),                    // Instruktionen
    new HumanMessage(USER_PROMPT_TEMPLATE(contractText)) // Vertragstext + Schema
  ]);
  
  // 4. Antwort parsen
  return parseResponse(response.content as string);
}
```

**Was passiert bei `model.invoke()`?**

LangChain baut intern einen HTTP POST Request:

```
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer sk-or-v1-d6a8fa4a...
Content-Type: application/json
HTTP-Referer: http://localhost:5173
X-Title: IV-Assistenzbeitrag Vertragsextraktion

{
  "model": "openrouter/auto",
  "temperature": 0.1,
  "response_format": { "type": "json_object" },
  "messages": [
    { "role": "system", "content": "Du bist ein spezialisierter..." },
    { "role": "user", "content": "Extrahiere die Daten aus folgendem Arbeitsvertrag..." }
  ]
}
```

LangChain übernimmt dabei:
- Das korrekte Formatieren der Messages als `role`/`content`-Paare
- Das Setzen aller Headers
- Retry-Logik bei Fehlern
- Das Parsen der API-Antwort zurück in ein `AIMessage`-Objekt

### 4.2 Bild-Extraktion: `extractContractFromImages()` (Zeile 215-245)

Für **gescannte PDFs** und **Foto-Uploads**:

```typescript
export async function extractContractFromImages(images: string[]): Promise<ExtractionResult> {
  // 1. Multi-Modal Content aufbauen
  const userContent = [
    { type: 'text', text: USER_PROMPT_TEMPLATE('[Siehe beigefügte Bilder...]') },
  ];
  // Jedes Bild als image_url hinzufügen
  for (const img of images) {
    userContent.push({
      type: 'image_url',
      image_url: { url: img },  // ← Base64 Data-URL
    });
  }

  // 2. Vision-fähiges Modell verwenden
  const model = getModel(apiKey, 'google/gemini-2.0-flash-001');

  // 3. LangChain-Aufruf mit multimodalem Content
  const response = await model.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage({ content: userContent })  // ← Objekt statt String!
  ]);
  
  return parseResponse(response.content as string);
}
```

**Der Unterschied zu Text-Extraktion:**

| Aspekt | Text-Extraktion | Bild-Extraktion |
|--------|----------------|-----------------|
| Modell | `openrouter/auto` | `google/gemini-2.0-flash-001` |
| HumanMessage-Inhalt | Einfacher String | Array mit Text + Bildern |
| Bild-Format | - | Base64 JPEG Data-URLs |
| Fähigkeit | Nur Text | Text + Vision (Bildanalyse) |

Bei der Bild-Extraktion nutzt LangChain das **OpenAI Vision-Format**:
```json
{
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "Extrahiere die Daten..." },
      { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,/9j/4A..." } },
      { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,/9j/4B..." } }
    ]
  }]
}
```

---

## 5. Was macht LangChain mit der LLM-Antwort?

### 5.1 Das `response`-Objekt

`model.invoke()` gibt ein `AIMessage`-Objekt zurück mit:
- `response.content`: Der Antwort-Text (in unserem Fall JSON)
- `response.response_metadata`: Token-Verbrauch, Modell-Info, etc.

### 5.2 Das `parseResponse()` (Zeile 162-185)

Weil LLM-Antworten nicht immer 100% sauber sind, gibt es eine robuste Parse-Funktion:

```typescript
function parseResponse(content: any): ExtractionResult {
  // Fall 1: LangChain hat die Antwort schon als Objekt geparsed
  if (typeof content === 'object' && content !== null) {
    return content as ExtractionResult;
  }

  // Fall 2: String-Antwort bereinigen
  let cleaned = text
    .replace(/```json\n?/gi, '')   // Markdown-Wrapper entfernen
    .replace(/```\n?/g, '')
    .trim();

  // Fall 3: Robustes JSON-Finden (erstes { bis letztes })
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }

  // Fall 4: Parsen
  return JSON.parse(cleaned) as ExtractionResult;
}
```

---

## 6. Was LangChain tut vs. was es NICHT tut

### Was LangChain in diesem Projekt übernimmt:

| Aufgabe | Ohne LangChain | Mit LangChain |
|---------|---------------|---------------|
| HTTP-Request bauen | `fetch()` mit manuellem Body | `model.invoke([messages])` |
| Headers setzen | Manuell in fetch-Options | `configuration.defaultHeaders` |
| Retry bei Fehlern | Eigene Retry-Logik programmieren | `maxRetries: 2` (automatisch) |
| Message-Formatierung | Manuelles JSON `{role, content}` | `new SystemMessage(...)`, `new HumanMessage(...)` |
| Response-Parsing | Manuelles Lesen der API-Antwort | `response.content` direkt verfügbar |
| Multimodale Inhalte | Manuelles Array-Building | `HumanMessage({ content: [...] })` |
| JSON-Mode erzwingen | Manuell im Body | `modelKwargs.response_format` |

### Was LangChain NICHT tut (aber eigentlich könnte):

| LangChain Feature | Status | Erklärung |
|-------------------|--------|-----------|
| **Chains** (verkettete Aufrufe) | ❌ Nicht genutzt | Wir machen nur einen einzigen LLM-Aufruf pro Extraktion |
| **Agents** (Tool-Calling) | ❌ Nicht genutzt | Das LLM ruft keine externen Tools auf |
| **Memory** (Gesprächsverlauf) | ❌ Nicht genutzt | Jede Extraktion ist ein einzelner, kontextloser Aufruf |
| **RAG** (Retrieval Augmented Generation) | ❌ Nicht genutzt | Keine Vektor-Datenbank, kein Dokumenten-Retrieval |
| **Streaming** | ❌ Nicht genutzt | Die Antwort wird komplett abgewartet, nicht gestreamt |
| **Output Parser** | ❌ Nicht genutzt | Wir parsen die JSON-Antwort manuell in `parseResponse()` |
| **Structured Output** | ❌ Nicht genutzt | Könnte ein Zod-Schema verwenden, nutzt aber rohes JSON |

**Fazit:** LangChain wird als **schlanke HTTP-Abstraktionsschicht** verwendet. Es vereinfacht den API-Aufruf, aber die erweiterten agentic Features (Chains, Agents, RAG, Memory) werden nicht eingesetzt.

---

## 7. Architektur-Diagramm: Wo sitzt LangChain?

```
┌─────────────────────────────────────────────────────────┐
│                     BROWSER (localhost:5173)              │
│                                                          │
│  ┌──────────────────┐    ┌────────────────────────────┐  │
│  │  AssistantOn-     │    │  packages/shared-backend/  │  │
│  │  boarding.tsx     │    │  src/agent/                │  │
│  │                   │    │                            │  │
│  │  handleUpload()  ─┼──▶│  pdf-extractor.ts          │  │
│  │                   │    │    └─ extractPdfContent()  │  │
│  │                   │    │    └─ readFileContent()    │  │
│  │                   │    │           │                │  │
│  │                   │    │           ▼                │  │
│  │                   │    │  openrouter.ts             │  │
│  │                   │    │  ┌─────────────────────┐   │  │
│  │                   │    │  │ ★ LANGCHAIN HIER ★  │   │  │
│  │                   │    │  │                     │   │  │
│  │                   │    │  │ ChatOpenAI          │   │  │
│  │                   │    │  │ SystemMessage       │   │  │
│  │                   │    │  │ HumanMessage        │   │  │
│  │                   │    │  │                     │   │  │
│  │                   │    │  │ model.invoke([...]) ─┼───┼──▶ OpenRouter API
│  │                   │    │  │                     │   │  │   (openrouter.ai)
│  │                   │    │  └─────────────────────┘   │  │       │
│  │                   │    │           │                │  │       ▼
│  │                   │    │           ▼                │  │  ┌─────────┐
│  │                   │    │  parseResponse()          │  │  │ LLM     │
│  │                   │    │           │                │  │  │ (auto   │
│  │                   │    │           ▼                │  │  │  oder   │
│  │  ◀────────────────┼────┤  ExtractionResult         │  │  │ Gemini) │
│  │  populateFrom-    │    │                            │  │  └─────────┘
│  │  Extraction()     │    └────────────────────────────┘  │
│  │                   │                                    │
│  │  MiniField-       │    ┌────────────────────────────┐  │
│  │  Komponenten      │    │  Supabase                  │  │
│  │  (Ampelsystem)    │    │  assistant-Tabelle         │  │
│  │                   │    │                            │  │
│  │  handleSave() ────┼──▶ │  INSERT contract_data     │  │
│  └──────────────────┘    └────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 8. Der komplette Datenfluss in einem Beispiel

### Eingabe: Benutzer lädt einen Arbeitsvertrag hoch (PDF)

**Schritt 1: PDF-Extraktion (pdf-extractor.ts)**
```
PDF-Datei (500 KB)
  → pdfjs-dist liest die Datei
  → Extrahiert Text von 3 Seiten
  → Text = 2'400 Zeichen (> 50 → kein Scan)
  → Rückgabe: { text: "--- Seite 1 ---\nArbeitgeber: Anna Meier..." }
```

**Schritt 2: LangChain-Aufruf (openrouter.ts)**
```
getModel('sk-or-v1-...', 'openrouter/auto')
  → new ChatOpenAI({ baseURL: 'openrouter.ai/api/v1', temperature: 0.1 })

model.invoke([
  new SystemMessage("Du bist ein spezialisierter Datenextraktions-Agent..."),
  new HumanMessage("Extrahiere die Daten aus folgendem Arbeitsvertrag:\n---\nArbeitgeber: Anna Meier...")
])

  → LangChain baut intern:
    POST https://openrouter.ai/api/v1/chat/completions
    Body: { model: "openrouter/auto", messages: [...], temperature: 0.1 }

  → OpenRouter routet zum besten Modell (z.B. Claude 3.5 Sonnet)
  → LLM analysiert den Vertragstext
  → Antwort: AIMessage mit JSON-Content
```

**Schritt 3: Response-Parsing**
```
response.content = '{
  "extraction_metadata": {
    "overall_confidence": 0.87,
    "fields_extracted": 20,
    "fields_missing": 5,
    "warnings": ["KANTON_ABGELEITET"]
  },
  "contracts": {
    "employer": {
      "first_name": {
        "value": "Anna",
        "confidence": "high",
        "confidence_score": 0.95,
        "source_text": "Arbeitgeber: Anna Meier",
        "note": ""
      },
      ...
    }
  }
}'

parseResponse() → JSON.parse() → ExtractionResult-Objekt
```

**Schritt 4: Frontend zeigt Ergebnis**
```
populateFromExtraction(result)
  → setFirstName("Anna")     [🟢 high, 95%]
  → setLastName("Meier")     [🟢 high, 95%]
  → setAhvNumber("")          [🔴 low, 0%]
  → setCanton("BS")           [🟠 medium, 70%]
  → ...

Benutzer sieht:
  ┌──🟢 Vorname──────┐  ┌──🟢 Nachname──────┐  ┌──🔴 AHV-Nr────────┐
  │ Anna             │  │ Meier             │  │ [Bitte ergänzen]  │
  └──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## 9. Warum LangChain und nicht direkte API-Aufrufe?

### Alternative ohne LangChain (mit `fetch`)

So würde der gleiche Aufruf ohne LangChain aussehen:

```typescript
async function extractContractData(contractText: string) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'IV-Assistenzbeitrag Vertragsextraktion',
    },
    body: JSON.stringify({
      model: 'openrouter/auto',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT_TEMPLATE(contractText) },
      ],
    }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return parseResponse(data.choices[0].message.content);
}
```

### Vergleich

| Aspekt | Mit LangChain | Ohne LangChain (fetch) |
|--------|---------------|----------------------|
| Code-Zeilen | ~8 Zeilen | ~25 Zeilen |
| Retry-Logik | Automatisch (`maxRetries: 2`) | Muss selbst gebaut werden |
| Error Handling | Eingebaut (Rate Limits, Timeouts) | Manuell |
| Response-Objekt | Typisiert (`AIMessage`) | Rohes JSON |
| Multimodal (Bilder) | `HumanMessage({ content: [...] })` | Manuelles Array-Building |
| Anbieter-Wechsel | Nur `baseURL` ändern | Neuen Client schreiben |
| Bundle-Grösse | Grösser (~200KB mehr) | Keine Dependencies |

**Vorteil von LangChain:** Weniger Boilerplate, automatische Retries, einfacher Anbieterwechsel.
**Nachteil von LangChain:** Grösseres Bundle, Overhead für einfache Anwendungsfälle.

---

## 10. Zusammenfassung

LangChain wird in diesem Projekt als **leichtgewichtige Abstraktionsschicht** für LLM-Aufrufe eingesetzt. Es vereinfacht die Kommunikation mit der OpenRouter API, bringt automatische Retry-Logik und typisierte Message-Objekte. Die erweiterten Features von LangChain (Chains, Agents mit Tool-Calling, Memory, RAG, Streaming) werden bewusst nicht eingesetzt, da der Anwendungsfall (ein einzelner Extraktions-Aufruf pro Vertrag) diese nicht erfordert.

---

## 11. Die zwei Nachrichten im Detail: SystemMessage und HumanMessage

Bei jedem LLM-Aufruf werden genau **zwei Nachrichten** gesendet. Zusammen bilden sie die komplette Instruktion an das KI-Modell:

```
model.invoke([
  new SystemMessage(SYSTEM_PROMPT),                      ← Nachricht 1: WER bist du?
  new HumanMessage(USER_PROMPT_TEMPLATE(contractText))   ← Nachricht 2: WAS sollst du tun?
])
```

### 11.1 Nachricht 1: Die SystemMessage (SYSTEM_PROMPT)

Die SystemMessage definiert die **Identität, Rolle und Regeln** des Agents. Sie wird bei jedem Aufruf mitgeschickt, egal ob Text- oder Bild-Extraktion. Sie ändert sich nie.

Hier ist der **exakte, vollständige Text** der SystemMessage, Zeile für Zeile erklärt:

---

#### Rollenanweisung

```
Du bist ein spezialisierter Datenextraktions-Agent für Schweizer
Assistenzbeitrag-Arbeitsverträge. Deine Aufgabe ist es, aus einem
hochgeladenen oder eingefügten Arbeitsvertrag alle relevanten Felder
zu extrahieren und diese strukturiert zurückzugeben.
```

**Was das macht:** Definiert die Identität des LLM. Es soll sich als Spezialist für genau einen Dokumenttyp verhalten: Schweizer Assistenzbeitrag-Arbeitsverträge (das sind Verträge zwischen IV-beziehenden Personen und ihren Assistenzpersonen). Durch diese enge Rolleneingrenzung werden die Antworten präziser als wenn das LLM als "allgemeiner Assistent" agieren würde.

---

#### Konfidenz-Grundregel

```
Für jeden extrahierten Wert gibst du ein Konfidenz-Level an, das
beschreibt, wie sicher du dir bei der Extraktion bist. Du erfindest
niemals Werte. Wenn ein Wert unklar oder nicht vorhanden ist, gibst
du null zurück und begründest dies.
```

**Was das macht:** Zwei kritische Anweisungen:
1. **Konfidenz-Pflicht:** Jedes Feld muss eine Sicherheitsbewertung haben, nicht nur den Wert.
2. **Anti-Halluzinations-Regel:** "Du erfindest niemals Werte." Das ist die wichtigste Schutzmaßnahme gegen LLM-Halluzinationen. Wenn etwas nicht im Vertrag steht, soll `null` zurückgegeben werden statt ein erfundener Wert.

---

#### Konfidenz-Definitionen (Ampelsystem)

```
Konfidenz-Definitionen:
- high (0.85–1.0): Wert steht explizit und eindeutig im Vertrag
- medium (0.50–0.84): Wert ist implizit, muss interpretiert werden oder ist teilweise lesbar
- low (0.0–0.49): Wert fehlt, ist widersprüchlich, oder stark interpretiert
```

**Was das macht:** Definiert drei exakte Stufen mit numerischen Schwellenwerten:

| Stufe | Score-Bereich | Frontend-Farbe | Wann wird sie vergeben? | Beispiel |
|-------|---------------|----------------|------------------------|----------|
| `high` | 0.85 - 1.00 | 🟢 Grün | Wert steht wortwörtlich im Vertrag | `"Stundenlohn: CHF 30.00"` → `hourly_rate: 30.00` |
| `medium` | 0.50 - 0.84 | 🟠 Orange | Wert muss aus Kontext abgeleitet werden | PLZ `4051 Basel` → `canton: "BS"` (abgeleitet) |
| `low` | 0.00 - 0.49 | 🔴 Rot | Wert fehlt komplett oder ist widersprüchlich | Keine AHV-Nummer im Vertrag → `ahv_number: null` |

Das Frontend verwendet den Schwellenwert `0.85` auch direkt: Wenn die `overall_confidence` unter 0.85 liegt, wird ein manueller Review erzwungen (siehe `pipeline.ts`, Zeile 68).

---

#### Extraktionsregeln (7 spezifische Regeln)

```
Extraktionsregeln:
- Extrahiere nur was explizit im Vertrag steht. Keine Annahmen ohne note.
```

**Regel 1 - Keine Annahmen:** Verstärkt nochmals die Anti-Halluzinations-Anweisung. Wenn das LLM etwas ableitet (z.B. Kanton aus PLZ), muss es das in der `note` begründen.

```
- Daten immer als YYYY-MM-DD formatieren.
```

**Regel 2 - Datumsformat:** Schweizer Verträge schreiben Daten als `01.03.2026` oder `1. März 2026`. Das LLM soll diese in das ISO-Format `2026-03-01` konvertieren, weil die Datenbank dieses Format erwartet.

```
- Prozentsätze immer als Dezimal: 5.3% → 0.053
```

**Regel 3 - Prozentformat:** Verträge schreiben `8.33%` oder `8,33 Prozent`. Das LLM soll das in `0.0833` umrechnen, weil die Lohnberechnung im Code mit Dezimalwerten arbeitet (z.B. `bruttolohn * 0.0833`).

```
- Kantonskürzel: Grossbuchstaben, 2-stellig (ZH, BE, BS, BL, AG, etc.)
```

**Regel 4 - Kanton-Format:** Stellt sicher, dass immer das offizielle 2-Buchstaben-Kürzel verwendet wird, nicht "Zürich" oder "zürich" oder "zh".

```
- holiday_supplement_pct aus vacation_weeks ableiten wenn nicht explizit:
  4W→0.0833, 5W→0.1064, 6W→0.1304 → confidence: "medium"
```

**Regel 5 - Ferienzuschlag-Logik:** Das ist eine **domain-spezifische Ableitungsregel**. Im Schweizer Stundenlohnmodell wird der Ferienanspruch als prozentualer Zuschlag auf den Bruttolohn bezahlt. Die Formel ist:
- 4 Wochen Ferien: `4 / (52 - 4) = 0.0833` (8.33%)
- 5 Wochen Ferien: `5 / (52 - 5) = 0.1064` (10.64%)
- 6 Wochen Ferien: `6 / (52 - 6) = 0.1304` (13.04%)

Wenn der Vertrag nur "4 Wochen Ferien" erwähnt, soll das LLM den Prozentsatz selbst berechnen, aber die Konfidenz auf `medium` setzen, weil es eine Ableitung ist.

```
- canton aus PLZ/Adresse ableiten wenn nicht explizit → confidence: "medium"
```

**Regel 6 - Kanton-Ableitung:** Wenn der Vertrag keinen Kanton nennt, soll das LLM ihn aus der PLZ oder Adresse des Arbeitgebers ableiten (z.B. PLZ 4051 → Basel → Kanton BS). Auch hier: `medium` Konfidenz, weil abgeleitet.

```
- is_indefinite: true wenn «unbefristet», false wenn end_date vorhanden
```

**Regel 7 - Unbefristet-Logik:** Simplifiziert die Vertragsart-Erkennung: Steht "unbefristet" oder "auf unbestimmte Zeit" im Vertrag → `is_indefinite: true`, gibt es ein Enddatum → `is_indefinite: false`.

```
- accounting_method: Aus «Vereinfachtes Verfahren», «Ordentliches Verfahren»
  oder «Ordentliches Verfahren mit Quellensteuer» ableiten
```

**Regel 8 - Abrechnungsverfahren (MVP Scope):** Aktuell wird in der Software nur `ordinary` (Ordentlich) unterstützt. Das LLM soll deshalb `accounting_method` immer als `ordinary` extrahieren, falls im Vertrag ein Abrechnungsverfahren erwähnt wird.

---

#### Warnungs-Definitionen

```
Warnungen (warnings) einfügen wenn zutreffend:
- "FEHLENDE_AHV_NUMMER": ahv_number nicht vorhanden
- "KANTON_ABGELEITET": canton aus Adresse/PLZ abgeleitet
- "FEHLENDE_SOZIALVERSICHERUNGSANGABEN": NBU/KTV/BU fehlen
- "KEIN_LOHN_ANGEGEBEN": weder hourly_rate noch monthly_rate
- "MUSTERVERTRAG_NICHT_AUSGEFUELLT": Mustervertrag ohne ausgefüllte Werte
```

**Was das macht:** Definiert 5 standardisierte Warn-Codes, die das LLM ins `warnings`-Array schreiben soll. Das Frontend zeigt diese als orangene Badges an. Jede Warnung hat einen spezifischen Auslöser:

| Warn-Code | Wird ausgelöst wenn... | Warum wichtig? |
|-----------|----------------------|----------------|
| `FEHLENDE_AHV_NUMMER` | `ahv_number` ist `null` | AHV-Nr. ist Pflicht für Lohnabrechnung; ohne geht keine Sozialversicherungsmeldung |
| `KANTON_ABGELEITET` | Kanton wurde aus PLZ erraten | Kanton bestimmt Steuertarife und NBU-Sätze; falsche Ableitung = falsche Abrechnung |
| `FEHLENDE_SOZIALVERSICHERUNGSANGABEN` | NBU/KTV/BVG fehlen | Für die Lohnabrechnung müssen SUVA/NBU-Sätze bekannt sein |
| `KEIN_LOHN_ANGEGEBEN` | Weder Stunden- noch Monatslohn | Ohne Lohn kann keine Abrechnung erstellt werden |
| `MUSTERVERTRAG_NICHT_AUSGEFUELLT` | Blanko-Vorlage hochgeladen | Erkennt, wenn jemand die leere Vertragsvorlage statt den ausgefüllten Vertrag hochlädt |

---

#### Output-Format-Anweisung

```
Du gibst ausschliesslich ein JSON-Objekt zurück. Kein erklärender Text davor oder danach.
```

**Was das macht:** Letzte Instruktion, die sicherstellt, dass die Antwort ausschliesslich valides JSON ist. Ohne diese Anweisung würde das LLM möglicherweise schreiben: "Hier ist das Ergebnis der Extraktion: ```json { ... } ``` Ich hoffe, das hilft Ihnen weiter."

Diese Anweisung wird doppelt abgesichert durch `response_format: { type: 'json_object' }` in der LangChain-Konfiguration (Zeile 157).

---

### 11.2 Nachricht 2: Die HumanMessage (USER_PROMPT_TEMPLATE)

Die HumanMessage enthält **den konkreten Arbeitsauftrag plus den Vertragstext**. Sie ändert sich bei jedem Aufruf, weil der Vertragstext unterschiedlich ist.

#### Aufbau der HumanMessage:

```
Extrahiere die Daten aus folgendem Arbeitsvertrag und gib sie als JSON zurück:

---
[HIER WIRD DER VERTRAGSTEXT EINGEFÜGT]
---

Gib ein JSON in exakt diesem Format zurück. Jedes Feld hat:
value, confidence, confidence_score, source_text, note.

{
  "extraction_metadata": { ... },
  "contracts": {
    "employer": { ... },
    "assistant": { ... },
    "contract_terms": { ... },
    "wage": { ... },
    "social_insurance": { ... }
  }
}
```

Die HumanMessage besteht aus drei Teilen:

---

#### Teil 1: Auftrag

```
Extrahiere die Daten aus folgendem Arbeitsvertrag und gib sie als JSON zurück:
```

Klare, einzeilige Anweisung. Sagt dem LLM genau, was es tun soll.

---

#### Teil 2: Der Vertragstext (dynamisch)

```
---
[Der tatsächliche Vertragstext, z.B. 2-3 Seiten aus dem PDF]
---
```

Dieser Teil wird dynamisch eingefügt via Template-Funktion:
```typescript
const USER_PROMPT_TEMPLATE = (contractText: string) => `
  ...
  ---
  ${contractText}    // ← Hier wird der echte Vertragstext eingesetzt
  ---
  ...
`;
```

Die `---`-Trennlinien helfen dem LLM, den Vertragstext klar vom Rest der Anweisung zu unterscheiden.

Bei **Bild-Extraktion** wird stattdessen ein Platzhalter verwendet:
```
[Siehe beigefügte Bilder des Arbeitsvertrags]
```
Die Bilder werden dann als separate `image_url`-Blöcke in der HumanMessage mitgeliefert.

---

#### Teil 3: Das JSON-Schema (Vorlage)

Das ist das Herzstück: Eine komplette **Vorlage mit allen 27 Feldern**, die dem LLM exakt zeigt, welche Felder es extrahieren soll und in welchem Format. Jedes Feld hat 5 Attribute:

| Attribut | Typ | Beschreibung |
|----------|-----|------------|
| `value` | `any` | Der extrahierte Wert (oder `null` wenn nicht gefunden) |
| `confidence` | `string` | `"high"`, `"medium"` oder `"low"` |
| `confidence_score` | `number` | Numerischer Wert zwischen 0.0 und 1.0 |
| `source_text` | `string` | Wortwörtliches Zitat aus dem Vertrag |
| `note` | `string` | Erklärende Anmerkung des LLM |

Hier das **vollständige JSON-Schema** mit Erklärungen:

```json
{
  "extraction_metadata": {
    "document_language": "<de|fr|it|en>",
    "overall_confidence": "<0.0-1.0 Durchschnitt>",
    "fields_extracted": "<Anzahl>",
    "fields_missing": "<Anzahl>",
    "warnings": []
  },
```

**`extraction_metadata`** ist der Metadaten-Block:
- `document_language`: Sprache des Vertrags (de=Deutsch, fr=Französisch, it=Italienisch). Die Schweiz hat 4 Amtssprachen.
- `overall_confidence`: Durchschnittliche Konfidenz über alle extrahierten Felder.
- `fields_extracted`: Wie viele Felder erfolgreich extrahiert wurden.
- `fields_missing`: Wie viele Felder nicht gefunden wurden.
- `warnings`: Array der Warn-Codes (definiert in der SystemMessage).

```json
  "contracts": {
    "employer": {
      "first_name":  { "value": null, "confidence": "low", "confidence_score": 0.0,
                       "source_text": "", "note": "Vorname der assistenznehmenden Person" },
      "last_name":   { ... },
      "street":      { ... },
      "zip":         { ... },
      "city":        { ... }
    },
```

**`employer`** = die assistenznehmende Person (Arbeitgeber, Person mit IV-Assistenzbeitrag). Hat 5 Felder: Name, Strasse, PLZ, Ort.

```json
    "assistant": {
      "first_name":       { ..., "note": "Vorname der Assistenzperson (Arbeitnehmerin)" },
      "last_name":        { ... },
      "street":           { ... },
      "zip":              { ... },
      "city":             { ... },
      "birth_date":       { ..., "note": "Format: YYYY-MM-DD" },
      "civil_status":     { ..., "note": "ledig, verheiratet, geschieden, verwitwet,
                                          eingetragene Partnerschaft" },
      "nationality":      { ..., "note": "ISO 3166-1 Alpha-2" },
      "residence_permit": { ..., "note": "B, C, G, L, N, F, CH" },
      "ahv_number":       { ..., "note": "Format: 756.XXXX.XXXX.XX" }
    },
```

**`assistant`** = die Assistenzperson (Arbeitnehmerin). Hat 10 Felder inkl. Geburtsdatum, Zivilstand, Nationalität, Aufenthaltsbewilligung und AHV-Nummer. Die `note`-Felder in der Vorlage geben dem LLM Hinweise zum erwarteten Format (z.B. "ISO 3166-1 Alpha-2" für Nationalität: "CH", "DE", "FR" etc.).

```json
    "contract_terms": {
      "start_date":         { ..., "note": "YYYY-MM-DD" },
      "end_date":           { ..., "note": "YYYY-MM-DD, null wenn unbefristet" },
      "is_indefinite":      { ..., "note": "true = unbefristet" },
      "hours_per_week":     { ... },
      "hours_per_month":    { ... },
      "notice_period_days": { ..., "note": "Kündigungsfrist in Tagen" }
    },
```

**`contract_terms`** = Vertragsbedingungen. 6 Felder: Start/Ende, Befristung, Pensum, Kündigungsfrist.

```json
    "wage": {
      "wage_type":            { ..., "note": "hourly oder monthly" },
      "hourly_rate":          { ..., "note": "CHF brutto" },
      "monthly_rate":         { ..., "note": "CHF brutto" },
      "vacation_weeks":       { ..., "note": "4, 5 oder 6" },
      "holiday_supplement_pct": { ..., "note": "0.0833=4W, 0.1064=5W, 0.1304=6W" },
      "payment_iban":         { ..., "note": "IBAN" }
    },
```

**`wage`** = Lohnangaben. 6 Felder: Lohnart, Stunden-/Monatslohn, Ferien, Ferienzuschlag, IBAN. Die `note` bei `holiday_supplement_pct` gibt dem LLM direkt die Ableitungs-Tabelle mit.

```json
    "social_insurance": {
      "accounting_method": { ..., "note": "ordinary" },
      "canton":            { ..., "note": "2-stelliges Kürzel" },
      "nbu_employer_pct":  { ..., "note": "Dezimal (0.005 = 0.5%)" },
      "nbu_employee_pct":  { ..., "note": "Dezimal" }
    }
  }
}
```

**`social_insurance`** = Sozialversicherungs-Angaben. 4 Felder: Abrechnungsverfahren, Kanton, NBU-Anteile Arbeitgeber und Arbeitnehmer.

---

### 11.3 Warum diese Prompt-Strategie funktioniert

Die Kombination aus SystemMessage + HumanMessage folgt bewährten Prompt-Engineering-Mustern:

| Technik | Wo eingesetzt | Warum effektiv |
|---------|--------------|----------------|
| **Rollen-Prompt** | "Du bist ein spezialisierter..." | Fokussiert das LLM auf die Domäne, reduziert irrelevante Antworten |
| **Anti-Halluzinations-Anweisung** | "Du erfindest niemals Werte" | Verhindert, dass das LLM fehlende Daten erfindet |
| **Structured Output / JSON-Schema** | Das vollständige JSON-Template | Gibt dem LLM eine exakte Vorlage; es muss nur die `null`-Werte ersetzen |
| **Few-Shot durch Notes** | `"note": "Format: YYYY-MM-DD"` | Die notes in der Vorlage sind implizite Beispiele, die das Format vorgeben |
| **Konstanten-Vorgabe** | `"confidence": "low"` als Default | Alle Felder starten mit `low`; das LLM muss bewusst hochstufen |
| **Domain-Regeln** | Ferienzuschlag-Tabelle, Kanton-Ableitung | Gibt dem LLM spezifisches Fachwissen, das es sonst nicht sicher wüsste |
| **Output-Eingrenzung** | "Kein erklärender Text davor oder danach" | Stellt sicher, dass die Antwort direkt parsbar ist |

### 11.4 Was das LLM tatsächlich tut

Zusammengefasst: Das LLM erhält einen Arbeitsvertrag und eine leere JSON-Vorlage mit 27 Feldern (alle auf `null`/`low`). Es soll:

1. Den Vertragstext lesen
2. Jedes der 27 Felder im Vertragstext suchen
3. Gefundene Werte in die Vorlage eintragen
4. Die Konfidenz für jedes Feld bewerten
5. Das originale Zitat aus dem Vertrag in `source_text` festhalten
6. Bei Ableitungen eine Begründung in `note` schreiben
7. Metadaten (Sprache, Gesamtkonfidenz, Zähler, Warnungen) berechnen
8. Das ausgefüllte JSON zurückgeben

Das ist im Kern eine **Formular-Ausfüllung durch KI**: Das LLM bekommt ein leeres Formular und einen Text, und füllt das Formular anhand des Textes aus.
