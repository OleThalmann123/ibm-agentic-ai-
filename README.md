# Asklepios

Webbasierte Verwaltungsplattform fuer den Schweizer IV-Assistenzbeitrag. Entstanden im Rahmen einer Kooperation zwischen HSG und IBM.

## Projektstruktur

```
.
├── apps/
│   └── prototyp-1-v2/     # Frontend (React, TypeScript, Vite)
├── packages/
│   └── core/              # Kernlogik: Agent, Payroll, PDF, Types, Supabase-Client
└── supabase/              # SQL Migration(en) fuer DB-Schema
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
| `vacation_weeks` | integer (nullable) | Ferienanspruch: 4, 5, 6 oder 7 Wochen. Bestimmt den Ferienzuschlag (8.33%, 10.64%, 13.04%, 15.56%) |
| `has_bvg` | boolean | BVG-pflichtig |
| `is_active` | boolean | Aktiv/Inaktiv-Status |
| `time_entry_mode` | text (enum) | `schedule` (Wochenplan) oder `manual` (freie Eingabe) |
| `access_token` | text (nullable) | Token fuer passwortfreien Login via `/t/:token`. Wird bei Erstellung generiert und kann vom Arbeitgeber geteilt werden |
| `contract_data` | jsonb (nullable) | Vom Agenten extrahierte Vertragsdaten (strukturierte Felder inkl. Quelltext/Notizen pro Feld) |

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

## Setup

```bash
git clone https://github.com/ChristofAgentic/Agentic-AI.git
cd Agentic-AI

npm install

# .env im Monorepo-Root anlegen (nicht nur unter apps/prototyp-1-v2):
# Vite laedt Env aus dem Root (siehe apps/prototyp-1-v2/vite.config.ts envDir).
# Vollstaendige Vorlage: .env.example
#
# VITE_SUPABASE_URL=https://<project>.supabase.co
# VITE_SUPABASE_ANON_KEY=<anon-key>
# VITE_OPENROUTER_API_KEY=<openrouter-key>
#
# Optional LangSmith: LANGSMITH_TRACING=true, LANGSMITH_API_KEY, LANGSMITH_PROJECT, …
# Der Browser sendet Traces ueber den Proxy /api/langsmith (Vite dev proxy lokal,
# Vercel Serverless in Production). Dafuer muss LANGSMITH_API_KEY serverseitig gesetzt sein.
# `npm run preview` startet keinen Proxy und keine API-Routen — LangSmith-Traces kommen dort nicht an.

cd apps/prototyp-1-v2
npm run dev
```

---

HSG x IBM, 2026
