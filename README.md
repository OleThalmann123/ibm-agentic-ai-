# Asklepios – Die smarte IV-Assistenzbeitrag Lösung

> **Agentic AI Prototype:** Ein vollständig digitalisiertes, KI-gestütztes System zur Verwaltung des Schweizer IV-Assistenzbeitrags. Erstellt im Rahmen einer Kooperation von **HSG × IBM**.

---

## 🎯 Was wir bauen (Vision)

**Asklepios** ist eine intelligente Plattform, die den massiven bürokratischen Overhead für Menschen mit Assistenzbedarf fast vollständig eliminiert. Wer Assistenzbeiträge der IV (Invalidenversicherung) bezieht, wird formal zum Arbeitgeber und muss komplexe administrative Pflichten gegenüber seinen Assistenzpersonen erfüllen.
Dieses Tool ersetzt Zettelwirtschaft und Excel-Chaos durch einen reibungslosen, KI-gestützten Workflow. Unsere Plattform übernimmt das Onboarding von Assistenzpersonen per KI, die rechtssichere Zeiterfassung (gekoppelt an offizielle Hilfekategorien) sowie die automatisierte Berechnung von Löhnen und Sozialversicherungsabzügen nach strikten Schweizer Vorgaben. 

---

## 🔄 Der chronologische "Agentic" Userflow

Asklepios orchestriert die Verwaltung reibungslos zwischen den zwei Hauptakteuren (Arbeitgeber und Assistenz):

### Schritt 1: Employer Setup
Die betroffene Person (Arbeitgeber) registriert sich und richtet ihr geschütztes Dashboard ein, über das das Assistenzbudget (inklusive verbleibender IV-Rapport-Stunden) zentral verwaltet wird.

### Schritt 2: Agentic Onboarding der Assistenzen
Um eine neue Assistenzperson einzustellen, drückt der Arbeitgeber nicht auf "Zahlen abtippen". Er lädt stattdessen lediglich ein Foto oder Scan des Arbeitsvertrags hoch. 
Die **Agentic AI** extrahiert alle Lohndaten, Pflichten und Ferienvereinbarungen vollautomatisch. Der Arbeitgeber prüft die von der KI extrahierten Daten nur noch intuitiv durch ein visuelles **Traffic-Light-System** (Grün/Gelb/Rot) und bestätigt sie.

### Schritt 3: Magic-Token & Mobile Tracker
Nachdem der Vertrag verifiziert wurde, generiert das System einen "Magic-Link", der direkt per WhatsApp oder SMS an die Assistenzseite gesendet werden kann.
Die Assistenzperson nutzt diesen Link als Passwort-freien Login auf ihrem Smartphone und landet direkt in der Stempeluhr-App. Sie trackt ihre Schichten live und muss bei Arbeitsende zwingend per Drop-Down bestätigen, welche der 9 offiziellen IV-Kategorien (z.B. "Haushaltsführung" oder "Freizeitgestaltung") geleistet wurden.

### Schritt 4: Monatsende & Automatisierte Payroll
Sobald der Monat vorbei ist, greift der Arbeitgeber über das Dashboard ein. Asklepios addiert alle live-getrackten Stunden und berechnet sekundengenau die dynamische **Schweizer Lohnabrechnung** unter Anwendung der gesetzlich fixierten **5-Rappen-Rundung**. 
Zudem generiert das System automatisiert die Pflicht-Rapporte für die kantonale IV-Stelle. Fertige, formelle PDF-Stundenrapporte und Lohnzettel fallen auf Knopfdruck heraus – unterschriftsbereit für die Behörde (SVA/IV-Stelle).

---

## 🤖 Eingesetzte Agent Skills (KI-Kernfunktionen)

Der Prototyp nutzt modernste "Agentic AI"-Ansätze (via OpenRouter und LLMs wie Claude/GPT) um als administrativer Copilot zu agieren:

1. **Document Understanding & OCR (Computer Vision)**
   Der Agent liest fotografierte Arbeitsverträge präzise aus und interpretiert komplexe juristische Klauseln inhaltlich.
2. **Structured Data Extraction (JSON Schema Mapping)**
   Die KI extrahiert unstrukturierten Freitext und mappt diese vollautomatisch in unser proprietäres, strenges JSON-Schema (Stundenlohn, Ferienzuschläge NBU-Abzüge, PLZ etc.). 
3. **KI-Self-Validation & Evaluierung**
   Nach der Extraktion bewertet der KI-Agent seine eigenen Ergebnisse algorithmisch (Confidence Scores), welche das oben beschriebene Traffic-Light-System für den "Human-in-the-Loop" Arbeitgeber speisen.
4. **Automated Compliance Check**
   Der Agent prüft extrahierte Vertragsbestandteile autark gegen das offizielle Regelwerk des Assistenzzulagen-Gesetzes.

---

## ⚙️ Technische Features & Besonderheiten

* **Schweizer Lohnberechnungs-Engine:** Eine strikte, lokal entwickelte Berechnungsschicht. Sie berechnet brutto und netto, appliziert Kantonal-spezifische FAK-Sätze, addiert korrekte AHV/ALV-Abzüge und erzwingt am Ende perfekte kaufmännische Rappenrundungen.
* **Client-Side PDF Erstellung (`jspdf`):** Aus Datenschutzgründen werden hochsensible PDF-Dokumente zu Lohnabrechnungen komplett lokal auf dem Endgerät generiert – das backend hostet keinerlei steuerrelevante fertige PDFs.
* **Magic Link Authentifizierung:** Supabase verwaltet Single-Use Zugriffstokens, welche den klassischen, passwortbasierten und oft blockierenden Login für Assistenzen komplett ablösen.

---

## 🗄️ Erweiterte Datenmodelle (Supabase)

Das relationale PostgreSQL-Backend ist hochsicher über Row Level Security (RLS) abgeschirmt.

| Tabelle | Funktion / Beschreibung |
|--------|----------|
| `employer` | Das "Admin"-Konto der Person mit Behinderung (Arbeitgeber). Beherbergt Metadaten (Name, Adresse) im `contact_data` JSON. |
| `assistant` | Das Profil eines Arbeitnehmers, direkt gebunden an eine `employer_id`. Beinhaltet Lohn-Stammdaten (Ferien, Stundenlohn) und das von der KI befüllte `contract_data`. |
| `time_entry` | Die granulare Erfassung aller Schichten (mit Start-/Endzeiten). Beherbergt Flags für bestätigte IV-Kategorien und Referenzen zur Assistenz. |

---

## 🚀 Setup & Installation

```bash
# Repository klonen
git clone https://github.com/ChristofAgentic/Agentic-AI.git
cd Agentic-AI

# Abhängigkeiten installieren
npm install

# Environment-Variablen konfigurieren (siehe .env.example)
# Benötigt: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY und VITE_OPENROUTER_API_KEY

# Lokalen Entwicklungsserver starten
npm run dev
```

Asklepios – Wir nehmen die Bürokratie aus dem Weg, damit der Mensch im Mittelpunkt steht.
