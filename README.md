# Asklepios

Webbasierte Verwaltungsplattform fuer den Schweizer IV-Assistenzbeitrag. Entstanden im Rahmen einer Kooperation zwischen HSG und IBM.

## Kontext

Personen, die ueber die Invalidenversicherung einen Assistenzbeitrag beziehen, werden formal zu Arbeitgebenden. Sie muessen Assistenzpersonen anstellen, Arbeitsvertraege verwalten, Arbeitszeiten dokumentieren und Lohnabrechnungen nach Schweizer Sozialversicherungsrecht erstellen. Das umfasst die korrekte Berechnung von AHV/IV/EO, ALV, FAK (kantonsabhaengig, 26 unterschiedliche Saetze), Verwaltungskosten, NBU, BVG und gegebenenfalls Quellensteuer.

Dieser buerokratische Aufwand faellt auf Privatpersonen, die in der Regel keine buchhalterische Vorbildung haben. Asklepios automatisiert die datenintensiven Schritte dieses Prozesses: Vertragsdatenerfassung via KI-gestuetzter Dokumentenextraktion, Zeiterfassung durch die Assistenzpersonen selbst und rechnerisch korrekte Lohnabrechnungen mit PDF-Export.

## Zielgruppe

Die Plattform ist derzeit fuer Szenarien konzipiert, in denen Assistenzpersonen ihre Arbeitszeit eigenstaendig erfassen. Die Arbeitgeberrolle kann durch die betroffene Person selbst oder durch eine unterstuetzende Person (Ehepartner, Elternteil, Beistand) ausgefuellt werden.

Die Assistenzpersonen erhalten einen passwortfreien Zugangslink und tragen ihre Schichten selbst ein. Eine Bestaetigung der erfassten Zeiten durch die arbeitgebende Person ist nicht erforderlich.

---

## Projektstruktur

```
.
├── apps/
│   └── prototyp-1-v2/     # Frontend (React, TypeScript, Vite)
├── packages/
│   └── shared-backend/    # Gemeinsame Logik: Agent, Payroll, PDF, Types, Supabase-Client
└── Demo_Dateien/           # Muster-Arbeitsvertraege (PDF) fuer Demos
```

### Module

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

Die Datenbank laeuft auf Supabase mit Row Level Security (RLS). Die Authentifizierung erfolgt ueber Supabase Auth (E-Mail/Passwort fuer Arbeitgebende, Token-basiert fuer Assistenzpersonen).

### employer

Stammdaten der arbeitgebenden Person (betroffene Person oder deren Vertretung).

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | uuid (PK) | Primaerschluessel |
| `name` | text | Anzeigename |
| `canton` | text (enum) | Kantonskuerzel, 2-stellig. Bestimmt den FAK-Satz. Zulaessige Werte: `AG`, `AI`, `AR`, `BE`, `BL`, `BS`, `FR`, `GE`, `GL`, `GR`, `JU`, `LU`, `NE`, `NW`, `OW`, `SG`, `SH`, `SO`, `SZ`, `TG`, `TI`, `UR`, `VD`, `VS`, `ZG`, `ZH` |
| `representation` | text (enum) | Art der Vertretung: `self` (betroffene Person selbst), `spouse`, `parent`, `guardian` |
| `iv_hours_day` | numeric | Von der IV bewilligte Tagesstunden |
| `iv_hours_night` | numeric | Von der IV bewilligte Nachtstunden |
| `iv_rate` | numeric | IV-Ansatz pro Stunde in CHF |
| `contact_data` | jsonb | Strukturiertes Objekt mit Adressdaten: `first_name`, `last_name`, `street`, `plz`, `city`. Bei `representation != 'self'` zusaetzlich `affected_first_name`, `affected_last_name`, `affected_street`, `affected_plz`, `affected_city` fuer die Daten der betroffenen Person |

### employer_access

Verknuepfungstabelle zwischen Supabase-Auth-User und `employer`. Ermoeglicht mehrere Zugaenge pro Arbeitgeber (z.B. betroffene Person und Beistand).

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | uuid (PK) | Primaerschluessel |
| `employer_id` | uuid (FK) | Referenz auf `employer.id` |
| `user_id` | uuid (FK) | Supabase Auth User ID |
| `role` | text (enum) | `admin_full` (Vollzugriff) oder `admin_limited` (eingeschraenkt) |
| `label` | text | Optionale Bezeichnung des Zugangs |
| `invited_email` | text | E-Mail-Adresse bei Einladung |

### assistant

Profil einer Assistenzperson, gebunden an genau einen Arbeitgeber.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | uuid (PK) | Primaerschluessel |
| `employer_id` | uuid (FK) | Referenz auf `employer.id` |
| `name` | text | Vollstaendiger Name |
| `email` | text (nullable) | Kontakt-E-Mail |
| `date_of_birth` | date (nullable) | Geburtsdatum |
| `hourly_rate` | numeric (nullable) | Brutto-Stundenlohn in CHF |
| `vacation_weeks` | integer (nullable) | Ferienanspruch: 4, 5 oder 6 Wochen. Bestimmt den Ferienzuschlag (8.33%, 10.64%, 13.04%) |
| `has_bvg` | boolean | BVG-pflichtig |
| `is_active` | boolean | Aktiv/Inaktiv-Status |
| `time_entry_mode` | text (enum) | `schedule` (Wochenplan) oder `manual` (freie Eingabe) |
| `access_token` | text (nullable) | Token fuer passwortfreien Login via `/t/:token`. Wird bei Erstellung generiert und kann vom Arbeitgeber geteilt werden |
| `contract_data` | jsonb (nullable) | Vom Agenten extrahierte Vertragsdaten. Enthaelt alle Felder aus der strukturierten Extraktion (vgl. Agent Skills, Abschnitt Vertragsanalyse) |

### time_entry

Einzelne Arbeitszeiteintraege. Werden in der Regel durch die Assistenzperson selbst erstellt.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | uuid (PK) | Primaerschluessel |
| `assistant_id` | uuid (FK) | Referenz auf `assistant.id` |
| `date` | date | Arbeitstag |
| `start_time` | time | Beginn der Schicht (HH:MM) |
| `end_time` | time | Ende der Schicht (HH:MM) |
| `is_night` | boolean | Nachtdienst-Markierung (MVP 1: wird nur angezeigt/mitexportiert, aber **nicht** als Nachtzuschlag berechnet; Nachtzuschlaege sind out of scope) |
| `entered_by` | text (enum) | `assistant` (Selbsterfassung), `admin` (durch Arbeitgeber) oder `system` (automatisch aus Wochenplan) |
| `confirmed` | boolean | Bestaetigungsstatus |
| `hours_decimal` | numeric (nullable) | Berechnete Stundenzahl als Dezimalwert |

### weekly_schedule

Optionaler Wochenplan fuer wiederkehrende Schichten. Wird bei `time_entry_mode = 'schedule'` verwendet.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | uuid (PK) | Primaerschluessel |
| `assistant_id` | uuid (FK) | Referenz auf `assistant.id` |
| `day_of_week` | integer | Wochentag (0 = Sonntag, 6 = Samstag) |
| `start_time` | time | Beginn der Schicht |
| `end_time` | time | Ende der Schicht |
| `is_night` | boolean | Nachtdienst-Markierung |

### payroll

Berechnete Lohnabrechnungsdaten pro Assistenzperson und Monat.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | uuid (PK) | Primaerschluessel |
| `assistant_id` | uuid (FK) | Referenz auf `assistant.id` |
| `month` | text | Abrechnungsmonat (Format: YYYY-MM) |
| `total_hours` | numeric | Gesamtstunden des Monats |
| `total_nights` | numeric | Davon Nachtstunden (MVP 1: nur Reporting/Export, keine Nachtzuschlaege) |
| `base_pay` | numeric | Grundlohn (Stundenlohn x Stunden) |
| `vacation_pay` | numeric | Ferienzuschlag in CHF |
| `gross_pay` | numeric | Bruttolohn (base_pay + vacation_pay) |
| `ahv_employee` | numeric | AHV/IV/EO-Abzug Arbeitnehmer |
| `alv_employee` | numeric | ALV-Abzug Arbeitnehmer |
| `nbu_employee` | numeric | NBU-Abzug Arbeitnehmer |
| `bvg_employee` | numeric | BVG-Abzug Arbeitnehmer |
| `net_pay` | numeric | Nettolohn |
| `ahv_employer` | numeric | AHV/IV/EO-Beitrag Arbeitgeber |
| `alv_employer` | numeric | ALV-Beitrag Arbeitgeber |
| `bu_employer` | numeric | BU-Beitrag Arbeitgeber |
| `total_cost` | numeric | Gesamtkosten Arbeitgeber (Nettolohn + AG-Beitraege) |
| `payslip_pdf_url` | text (nullable) | Pfad zur generierten Lohnabrechnung |
| `rapport_pdf_url` | text (nullable) | Pfad zum generierten Stundenzettel |

### payroll_confirmation

Freigabestatus einer Monatsabrechnung.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `assistant_id` | uuid (FK) | Referenz auf `assistant.id` |
| `month` | date | Erster Tag des Monats (z.B. 2026-03-01) |
| `confirmed` | boolean | Freigabestatus |
| `confirmed_at` | timestamptz | Zeitpunkt der Freigabe |

**Anlage in Supabase:** SQL-Migration `supabase/migrations/20260408120000_payroll_confirmation.sql` im SQL-Editor ausführen oder via Supabase CLI migrieren. Ohne diese Tabelle schlägt „Abrechnung bestätigen & freigeben“ mit einem Schema-Cache-Fehler fehl.

---

## Agent Skills

Der Agent laeuft vollstaendig im Browser (clientseitig, kein separates Backend). Er nutzt die OpenRouter API mit LangChain als Orchestrierungslayer.

### Skill 1: Document Ingestion (PDF-Extraktion)

Datei: `packages/shared-backend/src/agent/pdf-extractor.ts`

Liest hochgeladene Dateien und extrahiert deren Inhalt:

- Text-basierte PDFs: Textextraktion via `pdf.js`. Jede Seite wird separat verarbeitet.
- Gescannte PDFs / Bilder: Wenn weniger als 50 Zeichen Text extrahiert werden, rendert der Agent die Seiten als JPEG-Bilder (max. 5 Seiten, 2x Aufloesung) und gibt sie an das Vision-Modell weiter.
- Unterstuetzte Formate: PDF, JPG, PNG, TXT, DOCX.

### Skill 2: Structured Data Extraction (Vertragsanalyse)

Datei: `packages/shared-backend/src/agent/openrouter.ts`

Ein spezialisierter Prompt weist das Sprachmodell an, aus einem Schweizer Assistenzbeitrag-Arbeitsvertrag alle relevanten Felder zu extrahieren. Das Ergebnis ist ein streng typisiertes JSON-Objekt mit fuenf Abschnitten:

| Abschnitt | Extrahierte Felder |
|-----------|-------------------|
| `employer` | Vorname, Nachname, Strasse, PLZ, Ort |
| `assistant` | Vorname, Nachname, Adresse, Geburtsdatum, Zivilstand, Nationalitaet, Aufenthaltsstatus, AHV-Nummer |
| `contract_terms` | Vertragsbeginn, Vertragsende, Befristung, Stunden/Woche, Stunden/Monat, Kuendigungsfrist |
| `wage` | Lohnart, Stundenlohn, Ferienwochen, Ferienzuschlag, IBAN |
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

| Parameter | Wert |
|-----------|------|
| Text-Extraktion | `openrouter/auto` (automatische Modellauswahl) |
| Vision-Extraktion | `google/gemini-2.0-flash-001` |
| Temperatur | 0.1 (deterministische Ausgabe) |
| Response-Format | `json_object` (erzwingt JSON-Ausgabe) |

---

## Agentic Workflow

Der End-to-End-Ablauf von der Registrierung bis zur Lohnabrechnung:

```
1. Registrierung
   Arbeitgebende Person erstellt Konto (E-Mail/Passwort via Supabase Auth).
   System erstellt employer- und employer_access-Datensaetze.

2. Vertragsupload
   Arbeitgebende Person laedt Arbeitsvertrag hoch (PDF, Bild oder Textdatei).
   Agent extrahiert Vertragsdaten (IDP Pipeline):
     a) pdf-extractor: Text oder Seitenbilder aus Datei extrahieren
     b) openrouter: Strukturierte Datenextraktion via LLM
     c) pipeline: Klassifikation + Confidence-Pruefung

3. Daten-Review
   Extrahierte Felder werden im Formular angezeigt.
   Felder mit KI-Herkunft sind mit Badge markiert.
   Arbeitgebende Person korrigiert oder ergaenzt fehlende Felder.
   Speichern erstellt assistant-Datensatz in Supabase.

4. Token-Zugang
   System generiert einen access_token fuer die Assistenzperson.
   Arbeitgebende Person teilt den Link (/t/:token) mit der Assistenzperson.

5. Zeiterfassung (Assistenzperson)
   Assistenzperson oeffnet Link im Browser (kein Login noetig).
   Erfasst Datum, Start-/Endzeit und Nachtdienst-Markierung.
   Eintraege werden direkt in time_entry geschrieben.
   Keine Bestaetigung durch die arbeitgebende Person erforderlich.

6. Lohnabrechnung (arbeitgebende Person)
   PayrollPage aggregiert alle time_entry-Datensaetze pro Monat.
   Payroll-Engine berechnet:
     - Bruttolohn (Stundenlohn x Stunden + Ferienzuschlag)
     - AG-Beitraege: AHV/IV/EO (5.3%), ALV (1.1%), FAK (kantonal), VK, KTV, BU
     - AN-Abzuege: AHV/IV/EO, ALV, KTV, NBU
     - Nettolohn nach 5-Rappen-Rundung
   PDF-Export: Lohnabrechnung und Stundenzettel (lokal via jspdf).
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

### Kantonale FAK-Saetze

Die Engine enthaelt die FAK-Saetze aller 26 Kantone (z.B. ZH: 1.025%, BS: 1.65%, GE: 2.22%, JU: 2.75%).

### Abrechnungsverfahren

- Ordentlich: MVP Standardfall (aktuell einzig unterstuetztes Verfahren).

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

Beide PDF-Typen werden vollstaendig im Browser generiert (keine sensiblen Daten auf dem Server).

Lohnabrechnung (`payslip-pdf.ts`): Enthaelt Arbeitgeber-/Arbeitnehmer-Adressen, Grundlagen (Kanton, Verfahren, Stundenlohn, Stunden), Brutto-/Nettolohn-Tabelle, AG-/AN-Beitraege und Zahlungsadressaten.

Stundenzettel (`timesheet-pdf.ts`): Listet alle Zeiteintraege eines Monats mit Datum, Wochentag, Von/Bis, Stundenzahl, Nachtdienst-Markierung und Taetigkeitskategorie. Enthaelt Unterschriftsfelder fuer AG und AN.

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

# .env in apps/prototyp-1-v2 anlegen:
# VITE_SUPABASE_URL=https://<project>.supabase.co
# VITE_SUPABASE_ANON_KEY=<anon-key>
# VITE_OPENROUTER_API_KEY=<openrouter-key>

cd apps/prototyp-1-v2
npm run dev
```

---

HSG x IBM, 2026
