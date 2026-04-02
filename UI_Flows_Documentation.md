# UI Flows Documentation

## Phase 1: Employer Onboarding (`onboarding_employer`)
**Goal: Establish the employer profile and basic preferences.**

*   **Authenticate User:** Access the platform via secure email or direct login interface (`01_login.png`).
*   **Initiate Employer Setup:** Start the basic configuration wizard for the employer profile (`02_employer_setup_intro.png`).
*   **Input Personal Data:** Enter mandatory master data such as name, date of birth, and residential address (`03_employer_details.png`).
*   **Define Workforce Size:** Specify the anticipated number of assistants to be managed in the system (`04_number_of_assistants.png`).
*   **Establish Work Regularity:** Indicate whether the assistant(s) operate on a regular or irregular schedule (`05_employment_regularity.png`).
*   **Assign Time Tracking Responsibility:** Decide who is responsible for logging work hours (employer vs. assistant) (`06_time_tracking_preference.png`).
*   **Finalize Configuration:** Complete the initial setup sequence and transition to the assistant management dashboard (`07_setup_complete.png`).

---

## Phase 2: Assistant Onboarding (`onboarding_assistant`)
**Goal: Digitize employment contracts and configure payroll parameters.**

*   **Upload Employment Contract:** Upload the physical or digital employment contract for automated processing (`01_upload_contract.png`).
*   **Execute AI Extraction:** The integrated AI agent parses the document to structure master and payroll data (`02_ai_analysis_loading.png`).
*   **Validate Incomplete Master Data:** Review initial extraction results; system explicitly flags missing fields for manual entry (`03_extracted_master_data_1.png`).
*   **Complete Master Data:** Provide missing required inputs (e.g., email address) to finalize the profile (`04_extracted_master_data_2.png`).
*   **Verify Payroll Configurations:** Cross-check extracted wage terms, holiday allowances, insurance inputs, and tax procedures (`05_extracted_payroll_data.png`).
*   **Confirm Profile Creation:** Receive a success confirmation alongside a distinct access link to share with the assistant (`06_assistant_created_success.png`).
*   **Monitor Assistant Roster:** Review the updated overview dashboard to track all registered assistants and their statuses (`07_assistant_overview.png`).

---

## Phase 3: Assistant Time Tracking (`time_tracking_assistant`)
**Goal: Enable mobile-first time entry and transparent payroll tracking.**

*   **Log Working Hours:** Enter daily start and end times, activity descriptors, and specific modifiers (e.g., night shift) via the mobile interface (`01_time_entry_mobile.png`).
*   **Review Time Logs:** Check the weekly overview of submitted time entries and verify transmission status to the employer (`02_time_log_mobile.png`).
*   **Audit Monthly Payroll:** Access the preliminary monthly payslip detailing working hours, base wage, deductions, and net pay before employer confirmation (`03_payroll_mobile.png`).
