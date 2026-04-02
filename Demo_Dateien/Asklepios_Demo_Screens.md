# Asklepios IV-Assistenzbeitrag: Demo Screen Flow

User flow: Betroffene Person (affected person managing their own care).
Assistants log their own hours. No supervisor approval required.

---

## 01 — Login

**Action:** User authenticates with email and password.
- Clean login screen showing role-based access.
- Single entry point for all user types (Arbeitgeber: "Betroffene Person" oder "Unterstützende Person", sowie als Arbeitnehmer: Assistenzperson).
- These role distinctions can be used later to facilitate a "Freigabeflow" (approval workflow) between the Betroffene Person and their Unterstützende Person.

---

## 02 — Betroffenen-Onboarding: Role Selection

**Action:** User selects "Betroffene Person selbst" (affected person, self-managing).
- First step of the Betroffenen-Onboarding (Employer setup).
- Presents two options: self-managing or supported by a third party.
- Selection determines the data flow and permissions downstream.

---

## 03 — Betroffenen-Onboarding: Personal Data (Empty)

**Action:** User enters employer master data (name, address, AHV number, IBAN).
- Displays empty form with Swiss-specific field validations.
- PLZ auto-maps to the correct canton.
- AHV number uses EAN-13 check digit validation.
- IBAN is verified against the Swiss format.

---

## 04 — Betroffenen-Onboarding: Personal Data (Filled)

**Action:** User completes all required employer fields.
- Form is fully filled out by the user.
- Displays green validation indicators on the PLZ and IBAN fields.
- Data is stored as the employer record in Supabase.

---

## 05 — Betroffenen-Onboarding: Time Tracking Configuration

**Action:** User selects who logs working hours.
- Two options shown: "Ich selbst (Arbeitgeber)" or "Die Assistenzperson".
- Determines whether assistants receive a personal time-tracking link.

---

## 06 — Betroffenen-Onboarding Complete

**Action:** System confirms setup and redirects to the main dashboard.
- Displays the Assistants page in an empty state.
- Shows a green success toast: "Einrichtung abgeschlossen!".
- User is now fully operational and ready to add their first assistant.

---

## 07 — Assistenz-Onboarding: Contract Upload

**Action:** User clicks "Vertrag hochladen & scannen" to add a new assistant.
- Upload screen specifically for the Assistant Onboarding.
- Accepts PDF, PNG, JPG, and Word formats.
- Indicates that the AI agent will extract all contract data automatically.

---

## 08 — Assistenz-Onboarding: AI Extraction of Master Data

**Action:** AI pipeline processes the uploaded document and pre-fills personal data.
- Over 10 fields auto-populated from the contract (name, address, date of birth, etc.).
- Each pre-filled field is tagged with a blue "KI" badge.
- A banner prompts the user: "KI-Daten bitte überprüfen" (please verify AI data).

---

## 09 — Assistenz-Onboarding: AI Extraction of Payroll Data

**Action:** User proceeds to Step 2 to review extracted payroll and contract terms.
- Displays key terms: contract start date, weekly/monthly hours, hourly wage (CHF 30), and monthly salary estimate (CHF 2,580).
- Shows details like vacation weeks, vacation surcharge (8.33%), IBAN, billing method (Vereinfacht), and canton (Basel-Stadt).
- All shown data was extracted by the AI from the uploaded document.

---

## 10 — Assistenz-Onboarding: Assistant Created & Sharing

**Action:** System saves the assistant record and generates a sharing link.
- Success confirmation is shown for the new assistant ("Sara Keller").
- Generates and displays a personal access link.
- Provides two quick-sharing options: WhatsApp (one tap) or copy link.
- Instructions explain that the assistant simply opens the link on their phone to log hours.

---

## 11 — Assistants Dashboard (Populated)

**Action:** User returns to the assistants overview panel.
- Shows the newly added assistant ("Sara Keller") with their email.
- Quick actions available: Share via WhatsApp, copy link, edit.
- Central management view is ready for adding more care staff.

---

## 12 — Payroll Overview

**Action:** User navigates to the "Lohnabrechnung" (payroll) tab.
- Monthly payroll dashboard for the selected period (e.g., April 2026).
- Summary cards display: 1 person, 0.00 hours logged, 0/1 confirmed.
- "Sara Keller" is listed with "Keine Stunden" (no hours yet).
- Pay components automatically calculate based on logged hours and contract terms (AHV/IV/EO, FAK, vacation surcharge, BU/NBU).
