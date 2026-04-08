# UI Flows Documentation

## Phase 1: Employer Onboarding (`onboarding_employer`)
**Goal: Establish the employer profile and basic preferences.**

*   **Authenticate User:** Access the platform via secure email or direct login interface.
*   **Initiate Employer Setup:** Start the basic configuration wizard for the employer profile.
*   **Input Personal Data:** Enter mandatory master data such as name, date of birth, and residential address.
*   **Define Workforce Size:** Specify the anticipated number of assistants to be managed in the system.
*   **Establish Work Regularity:** Indicate whether the assistant(s) operate on a regular or irregular schedule.
*   **Assign Time Tracking Responsibility:** Decide who is responsible for logging work hours (employer vs. assistant).
*   **Finalize Configuration:** Complete the initial setup sequence and transition to the assistant management dashboard.

---

## Phase 2: Assistant Onboarding (`onboarding_assistant`)
**Goal: Digitize employment contracts and configure payroll parameters.**

*   **Upload Employment Contract:** Upload the physical or digital employment contract for automated processing.
*   **Execute AI Extraction:** The integrated AI agent parses the document to structure master and payroll data.
*   **Validate Incomplete Master Data:** Review initial extraction results; system explicitly flags missing fields for manual entry.
*   **Complete Master Data:** Provide missing required inputs (e.g., email address) to finalize the profile.
*   **Verify Payroll Configurations:** Cross-check extracted wage terms, holiday allowances, insurance inputs, and tax procedures.
*   **Confirm Profile Creation:** Receive a success confirmation alongside a distinct access link to share with the assistant.
*   **Monitor Assistant Roster:** Review the updated overview dashboard to track all registered assistants and their statuses.

---

## Phase 3: Assistant Time Tracking (`time_tracking_assistant`)
**Goal: Enable mobile-first time entry and transparent payroll tracking.**

*   **Log Working Hours:** Enter daily start and end times and (optional) activity descriptors via the mobile interface.  
    **Note (MVP 1 / out of scope):** Night surcharges are not implemented yet. The “Nachtdienst” toggle is intentionally shown but disabled/greyed out in MVP 1. Night markings may still appear in exported timesheets.
*   **Review Time Logs:** Check the weekly overview of submitted time entries and verify transmission status to the employer.
*   **Audit Monthly Payroll:** Access the preliminary monthly payslip detailing working hours, base wage, deductions, and net pay before employer confirmation.
