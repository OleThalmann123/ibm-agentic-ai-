# Asklepios

Verwaltungstool fuer den Schweizer IV-Assistenzbeitrag. Gebaut im Rahmen einer Kooperation von HSG und IBM.

## Zielgruppe

Asklepios richtet sich an betroffene Personen (oder deren gesetzliche Vertretung), die ueber die Invalidenversicherung einen Assistenzbeitrag beziehen und dadurch formal zu Arbeitgebenden werden. Sie muessen Assistenzpersonen anstellen, deren Arbeitszeit dokumentieren und Lohnabrechnungen nach Schweizer Sozialversicherungsrecht erstellen.

Die Assistenzpersonen erfassen ihre Arbeitszeit selbststaendig ueber einen passwortfreien Zugangslink. Eine Bestaetigung der erfassten Zeiten durch den Arbeitgeber ist nicht erforderlich.

---

## Projektstruktur

Das Repository ist als Monorepo organisiert:

```
.
├── apps/
│   ├── prototyp-1-v1/     # Frontend V1 (mit separater Onboarding-Seite)
│   └── prototyp-1-v2/     # Frontend V2 (vereinfachter Flow ohne separate Onboarding-Route)
├── packages/
│   └── shared-backend/    # Gemeinsame Logik: Agent, Payroll, PDF, Types, Supabase-Client
├── Demo_Dateien/           # Muster-Arbeitsvertraege (PDF) fuer Demos
└── screenshots_asklepios/  # UI-Screenshots beider Prototypen
```

### Zwei Frontends

Beide Prototypen teilen denselben Backend-Code (`@asklepios/backend`) und dieselbe Supabase-Datenbank. Sie unterscheiden sich in der UI-Struktur:

**prototyp-1-v1**: Enthaelt eine eigene `/onboarding`-Route mit separater Seite fuer Arbeitgeber-Einrichtung und Assistenz-Erfassung. Der Onboarding-Flow ist als mehrstufiger Wizard aufgebaut.

**prototyp-1-v2**: Verzichtet auf die separate Onboarding-Route. Assistenzpersonen werden direkt aus der Assistenten-Uebersicht heraus erfasst (Inline-Onboarding). Der Flow ist kompakter.

Beide Varianten enthalten dieselben Kernmodule:

| Modul | Pfad | Funktion |
|-------|------|----------|
| LoginPage | `auth/LoginPage.tsx` | E-Mail/Passwort-Login fuer Arbeitgebende |
| RegisterPage | `auth/RegisterPage.tsx` | Registrierung neuer Arbeitgebender |
| TokenLoginPage | `auth/TokenLoginPage.tsx` | Passwortfreier Zugang fuer Assistenzpersonen via `/t/:token` |
| DashboardPage | `dashboard/DashboardPage.tsx` | Uebersicht mit Kennzahlen und integriertem Lohnbudgetrechner |
| AssistantsPage | `assistants/AssistantsPage.tsx` | Verwaltung aller Assistenzpersonen |
| AssistantOnboarding | `onboarding/AssistantOnboarding.tsx` | Vertragsupload, Datenextraktion, Review-Formular |
| PayrollPage | `payroll/PayrollPage.tsx` | Monatsweise Lohnabrechnung mit PDF-Export |
| SettingsPage | `settings/SettingsPage.tsx` | Kontoeinstellungen, Onboarding-Reset |
| AppShell | `layout/AppShell.tsx` | Navigationslayout mit Sidebar |

---

## Datenmodell (Supabase / PostgreSQL)

Die Datenbank laeuft auf Supabase mit Row Level Security (RLS). Folgende Tabellen bilden das Kerndatenmodell:

### employer

Repraesentiert die arbeitgebende Person (betroffene Person oder deren Vertretung).

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | uuid (PK) | Primaerschluessel |
| `name` | text | Anzeigename |
| `canton` | text | Kantonskuerzel (2-stellig, z.B. ZH, BS) |
| `representation` | text | Art der Vertretung: `self`, `spouse`, `parent`, `guardian` |
| `iv_hours_day` | numeric | Bewilligte IV-Tagesstunden |
| `iv_hours_night` | numeric | Bewilligte IV-Nachtstunden |
| `iv_rate` | numeric | IV-Ansatz pro Stunde |
| `contact_data` | jsonb | Adressdaten (Vorname, Nachname, Strasse, PLZ, Ort). Bei Vertretung zusaetzlich Daten der betroffenen Person (`affected_first_name`, etc.) |

### employer_access

Verknuepft Supabase-Auth-User mit einem Employer. Ermoeglicht mehrere Zugaenge pro Arbeitgeber (z.B. Vertretungspersonen).

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | uuid (PK) | Primaerschluessel |
| `employer_id` | uuid (FK) | Referenz auf `employer` |
| `user_id` | uuid (FK) | Supabase Auth User ID |
| `role` | text | `admin_full` oder `admin_limited` |
| `label` | text | Optionale Bezeichnung |
| `invited_email` | text | E-Mail bei Einladung |

### assistant

Profil einer Assistenzperson, gebunden an einen Arbeitgeber.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | uuid (PK) | Primaerschluessel |
| `employer_id` | uuid (FK) | Referenz auf `employer` |
| `name` | text | Vollstaendiger Name |
| `email` | text | Kontakt-E-Mail (optional) |
| `date_of_birth` | date | Geburtsdatum |
| `hourly_rate` | numeric | Brutto-Stundenlohn in CHF |
| `vacation_weeks` | integer | Ferienanspruch in Wochen (4, 5 oder 6) |
| `has_withholding_tax` | boolean | Quellensteuer-pflichtig |
| `has_bvg` | boolean | BVG-pflichtig |
| `is_active` | boolean | Aktiv/Inaktiv-Status |
| `time_entry_mode` | text | `schedule` oder `manual` |
| `access_token` | text | Token fuer passwortfreien Login via `/t/:token` |
| `contract_data` | jsonb | Vom Agenten extrahierte Vertragsdaten (Adresse, AHV-Nr., Lohn, Kanton, Versicherungsdaten etc.) |

### time_entry

Einzelne Arbeitszeiteintraege, erfasst durch die Assistenzperson.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | uuid (PK) | Primaerschluessel |
| `assistant_id` | uuid (FK) | Referenz auf `assistant` |
| `date` | date | Arbeitstag |
| `start_time` | time | Beginn der Schicht (HH:MM) |
| `end_time` | time | Ende der Schicht (HH:MM) |
| `is_night` | boolean | Nachtdienst-Markierung |
| `entered_by` | text | Wer den Eintrag erstellt hat: `assistant`, `admin`, `system` |
| `confirmed` | boolean | Bestaetigungsstatus |
| `hours_decimal` | numeric | Berechnete Stundenzahl als Dezimalwert |

### payroll_confirmation

Speichert, ob eine Monatsabrechnung vom Arbeitgeber freigegeben wurde.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `assistant_id` | uuid (FK) | Referenz auf `assistant` |
| `month` | date | Erster Tag des Monats (z.B. 2026-03-01) |
| `confirmed` | boolean | Freigabestatus |
| `confirmed_at` | timestamptz | Zeitpunkt der Freigabe |

---

## Agent Skills

Der Agent laeuft vollstaendig im Browser (kein separates Backend). Er nutzt die OpenRouter API mit LangChain als Orchestrierungslayer.

### Skill 1: Document Ingestion (PDF-Extraktion)

Datei: `packages/shared-backend/src/agent/pdf-extractor.ts`

Liest hochgeladene Dateien und extrahiert deren Inhalt:

- **Text-basierte PDFs**: Textextraktion via `pdf.js`. Jede Seite wird separat verarbeitet.
- **Gescannte PDFs / Bilder**: Wenn weniger als 50 Zeichen Text extrahiert werden, rendert der Agent die Seiten als JPEG-Bilder (max. 5 Seiten, 2x Aufloesung) und gibt sie an das Vision-Modell weiter.
- **Unterstuetzte Formate**: PDF, JPG, PNG, TXT, DOCX.

### Skill 2: Structured Data Extraction (Vertragsanalyse)

Datei: `packages/shared-backend/src/agent/openrouter.ts`

Ein spezialisierter Prompt weist das Sprachmodell an, aus einem Schweizer Assistenzbeitrag-Arbeitsvertrag alle relevanten Felder zu extrahieren. Das Ergebnis ist ein streng typisiertes JSON-Objekt mit fuenf Abschnitten:

| Abschnitt | Extrahierte Felder |
|-----------|-------------------|
| `employer` | Vorname, Nachname, Strasse, PLZ, Ort |
| `assistant` | Vorname, Nachname, Adresse, Geburtsdatum, Zivilstand, Nationalitaet, Aufenthaltsstatus, AHV-Nummer |
| `contract_terms` | Vertragsbeginn, Vertragsende, Befristung, Stunden/Woche, Stunden/Monat, Kuendigungsfrist |
| `wage` | Lohnart, Stundenlohn, Monatslohn, Ferienwochen, Ferienzuschlag, IBAN |
| `social_insurance` | Abrechnungsverfahren, Kanton, NBU-Saetze (AG/AN) |

Jedes extrahierte Feld enthaelt:
- `value`: Der extrahierte Wert (oder `null` wenn nicht gefunden)
- `confidence`: `high`, `medium` oder `low`
- `confidence_score`: Numerischer Wert zwischen 0.0 und 1.0
- `source_text`: Originalstelle im Vertrag
- `note`: Begruendung bei Unsicherheit

Das Modell leitet fehlende Werte regelbasiert ab (z.B. Kanton aus PLZ, Ferienzuschlag aus Ferienwochen) und setzt die Konfidenz entsprechend auf `medium`.

### Skill 3: Document Classification

Datei: `packages/shared-backend/src/agent/pipeline.ts`

Die Pipeline klassifiziert das Dokument als `contract`, `invoice` oder `other`. Nur bei `contract` wird die Extraktion ausgefuehrt. Die Pipeline prueft ausserdem, ob ein manuelles Review noetig ist (Konfidenz unter 0.85 oder fehlende Pflichtfelder wie AHV-Nummer oder Vorname).

### Modelle

- **Text-Extraktion**: `openrouter/auto` (automatische Modellauswahl)
- **Vision-Extraktion** (gescannte Dokumente): `google/gemini-2.0-flash-001`
- **Temperatur**: 0.1 (deterministische Ausgabe)
- **Response-Format**: `json_object` (erzwingt JSON-Ausgabe)

---

## Agentic Workflow

Der End-to-End-Ablauf von der Registrierung bis zur Lohnabrechnung:

```
1. Registrierung
   Arbeitgebende Person erstellt Konto (E-Mail/Passwort via Supabase Auth).
   System erstellt employer- und employer_access-Datensaetze.

2. Vertragsupload
   Arbeitgeber laedt Arbeitsvertrag hoch (PDF, Bild oder Textdatei).
   Agent extrahiert Vertragsdaten (IDP Pipeline):
     a) pdf-extractor: Text oder Seitenbilder aus Datei extrahieren
     b) openrouter: Strukturierte Datenextraktion via LLM
     c) pipeline: Klassifikation + Confidence-Pruefung

3. Daten-Review
   Extrahierte Felder werden im Formular angezeigt.
   Felder mit KI-Herkunft sind mit "KI"-Badge markiert.
   Arbeitgeber korrigiert/ergaenzt fehlende Felder.
   Speichern erstellt assistant-Datensatz in Supabase.

4. Token-Zugang
   System generiert einen access_token fuer die Assistenzperson.
   Arbeitgeber teilt den Link (/t/:token) per WhatsApp/SMS.

5. Zeiterfassung (Assistenzperson)
   Assistenzperson oeffnet Link im Browser (kein Login noetig).
   Erfasst Datum, Start-/Endzeit und Nachtdienst-Markierung.
   Eintraege werden direkt in time_entry geschrieben.
   Keine Bestaetigung durch den Arbeitgeber erforderlich.

6. Lohnabrechnung (Arbeitgeber)
   PayrollPage aggregiert alle time_entry-Datensaetze pro Monat.
   Payroll-Engine berechnet:
     - Bruttolohn (Stundenlohn x Stunden + Ferienzuschlag)
     - AG-Beitraege: AHV/IV/EO (5.3%), ALV (1.1%), FAK (kantonal), VK, KTV, BU
     - AN-Abzuege: AHV/IV/EO, ALV, KTV, NBU, Quellensteuer
     - Nettolohn nach 5-Rappen-Rundung
   PDF-Export: Lohnabrechnung und Stundenzettel (lokal via jspdf, kein Server-Rendering).
```

---

## Payroll-Engine

Datei: `packages/shared-backend/src/backend/payroll.ts`

Die Lohnberechnung folgt den Bundesvorgaben fuer das Schweizer Sozialversicherungsrecht:

### Feste Saetze (Bund)

| Beitrag | Satz |
|---------|------|
| AHV/IV/EO | 5.30% (AG und AN je haelftig) |
| ALV | 1.10% (AG und AN je haelftig) |
| Verwaltungskosten (VK) | 0.5275% (nur AG) |
| Quellensteuer (vereinfacht) | 5.00% (nur AN) |
| FAK AN Wallis | 0.17% (nur Kanton VS) |

### Kantonale FAK-Saetze

Die Engine enthaelt die FAK-Saetze aller 26 Kantone (z.B. ZH: 1.025%, BS: 1.65%, GE: 2.22%, JU: 2.75%).

### Abrechnungsverfahren

- **Vereinfacht**: Pauschale Quellensteuer von 5% wird direkt abgezogen.
- **Ordentlich**: Keine pauschale Quellensteuer.
- **Ordentlich mit Quellensteuer**: Individueller Quellensteuersatz wird angewendet.

### Ferienzuschlag

| Ferienwochen | Zuschlag |
|-------------|----------|
| 4 Wochen | 8.33% |
| 5 Wochen | 10.64% |
| 6 Wochen | 13.04% |

### Rundung

Alle Betraege werden auf 5 Rappen gerundet (kaufmaennische Rundung): `Math.round(value * 20) / 20`.

---

## PDF-Generierung

Beide PDF-Typen werden vollstaendig im Browser generiert (Datenschutz: keine sensiblen Daten auf dem Server).

**Lohnabrechnung** (`payslip-pdf.ts`): Enthalt Arbeitgeber-/Arbeitnehmer-Adressen, Grundlagen (Kanton, Verfahren, Stundenlohn, Stunden), Brutto-/Nettolohn-Tabelle, AG-/AN-Beitraege und Zahlungsadressaten.

**Stundenzettel** (`timesheet-pdf.ts`): Listet alle Zeiteintraege eines Monats mit Datum, Wochentag, Von/Bis, Stundenzahl, Nachtdienst-Markierung und Taetigkeitskategorie. Enthaelt Unterschriftsfelder fuer AG und AN.

---

## Tech-Stack

| Komponente | Technologie |
|-----------|-------------|
| Frontend | React 18, TypeScript, Vite 6, TailwindCSS 3 |
| Routing | react-router-dom 6 |
| Backend / Datenbank | Supabase (PostgreSQL, Auth, RLS) |
| LLM-Orchestrierung | LangChain (OpenAI-Adapter) via OpenRouter API |
| PDF-Extraktion | pdf.js (pdfjs-dist) |
| PDF-Generierung | jspdf + jspdf-autotable |
| UI-Komponenten | lucide-react (Icons), sonner (Toasts), recharts (Charts) |
| Monorepo | npm workspaces |

---

## Setup

```bash
git clone https://github.com/ChristofAgentic/Agentic-AI.git
cd Agentic-AI

npm install

# .env im Root und/oder in apps/prototyp-1-v2 anlegen:
# VITE_SUPABASE_URL=https://<project>.supabase.co
# VITE_SUPABASE_ANON_KEY=<anon-key>
# VITE_OPENROUTER_API_KEY=<openrouter-key>

# Prototyp V2 starten:
cd apps/prototyp-1-v2
npm run dev
```

---

HSG x IBM, 2026
