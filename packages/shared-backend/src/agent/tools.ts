/**
 * Agent Tools – LangChain Tool definitions
 * 
 * These are the two core tools from the Agent Canvas:
 * 
 * 1. Document Classification Tool
 *    Validates whether the uploaded document is a relevant employment
 *    contract and provides a classification.
 * 
 * 2. Contract Data Submission Tool
 *    Transfers all extracted contract data in a structured and standardized
 *    format to the backend for storage and further processing.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// ─── Swiss Reference Data ────────────────────────────────

const SWISS_CANTONS: Record<string, string> = {
  ZH: 'Zürich', BE: 'Bern', LU: 'Luzern', UR: 'Uri', SZ: 'Schwyz',
  OW: 'Obwalden', NW: 'Nidwalden', GL: 'Glarus', ZG: 'Zug', FR: 'Freiburg',
  SO: 'Solothurn', BS: 'Basel-Stadt', BL: 'Basel-Landschaft', SH: 'Schaffhausen',
  AR: 'Appenzell Ausserrhoden', AI: 'Appenzell Innerrhoden', SG: 'St. Gallen',
  GR: 'Graubünden', AG: 'Aargau', TG: 'Thurgau', TI: 'Tessin', VD: 'Waadt',
  VS: 'Wallis', NE: 'Neuenburg', GE: 'Genf', JU: 'Jura',
};

const ZIP_TO_CANTON: Record<string, string> = {
  '1': 'VD', '10': 'VD', '11': 'VD', '12': 'GE', '13': 'VD', '14': 'VD',
  '15': 'FR', '16': 'FR', '17': 'FR', '18': 'VS', '19': 'VS',
  '20': 'VS', '21': 'VS', '22': 'FR', '23': 'FR', '24': 'NE', '25': 'NE',
  '26': 'JU', '27': 'JU', '28': 'BE', '29': 'BE',
  '30': 'BE', '31': 'BE', '32': 'SO', '33': 'BE', '34': 'BE', '35': 'BE',
  '36': 'BE', '37': 'BE', '38': 'BE', '39': 'BE',
  '40': 'SO', '41': 'AG', '42': 'AG', '43': 'SO', '44': 'BL', '45': 'BL',
  '46': 'BS', '47': 'BL', '48': 'SO', '49': 'AG',
  '50': 'AG', '51': 'AG', '52': 'AG', '53': 'AG', '54': 'LU', '55': 'LU',
  '56': 'ZG', '57': 'NW', '58': 'OW', '59': 'NW',
  '60': 'LU', '61': 'LU', '62': 'UR', '63': 'SZ', '64': 'GL', '65': 'SZ',
  '66': 'SZ', '67': 'SZ', '68': 'SZ', '69': 'SZ',
  '70': 'SG', '71': 'SG', '72': 'SG', '73': 'SG', '74': 'TG', '75': 'GR',
  '76': 'GR', '77': 'GR', '78': 'GR',
  '80': 'ZH', '81': 'ZH', '82': 'ZH', '83': 'ZH', '84': 'ZH', '85': 'ZH',
  '86': 'TG', '87': 'TG', '88': 'TG', '89': 'SH',
  '90': 'SG', '91': 'AR', '92': 'AI', '93': 'SG', '94': 'SG', '95': 'SG',
  '96': 'SG', '97': 'AI',
};

// ─── Tool 1: Document Classification ─────────────────────

/**
 * Document Classification Tool
 * 
 * Validates whether the uploaded document is a relevant Swiss employment
 * contract (Arbeitsvertrag für Assistenzbeitrag) and provides a classification.
 * 
 * Checks for key indicators:
 * - Contract-related keywords (Arbeitsvertrag, Anstellungsvertrag, etc.)
 * - Swiss-specific terms (AHV, Assistenzbeitrag, IV, Kantone)
 * - Employment data fields (Lohn, Ferien, Kündigungsfrist)
 * - Parties (Arbeitgeber, Arbeitnehmer/Assistenzperson)
 */
export const documentClassificationTool = tool(
  async ({ documentText, documentType }: { documentText: string; documentType: string }) => {
    const text = documentText.toLowerCase();

    const contractKeywords = [
      'arbeitsvertrag', 'anstellungsvertrag', 'anstellung', 'arbeitsverhältnis',
      'arbeitgeber', 'arbeitnehmer', 'assistenzperson', 'assistenzbeitrag',
    ];
    const swissKeywords = [
      'ahv', 'iv', 'schweiz', 'chf', 'kanton', 'bvg', 'nbu', 'uvg',
      'sozialversicherung', 'quellensteuer', 'fak',
    ];
    const employmentKeywords = [
      'lohn', 'stundenlohn', 'monatslohn', 'ferien', 'ferienanspruch',
      'kündigungsfrist', 'pensum', 'arbeitszeit', 'iban',
    ];

    const contractScore = contractKeywords.filter((k) => text.includes(k)).length;
    const swissScore = swissKeywords.filter((k) => text.includes(k)).length;
    const employmentScore = employmentKeywords.filter((k) => text.includes(k)).length;

    const totalScore = contractScore + swissScore + employmentScore;
    const maxScore = contractKeywords.length + swissKeywords.length + employmentKeywords.length;
    const confidence = Math.min(totalScore / 8, 1.0);

    let classification: 'swiss_employment_contract' | 'generic_contract' | 'other_document';
    let isRelevant: boolean;

    if (contractScore >= 2 && swissScore >= 1) {
      classification = 'swiss_employment_contract';
      isRelevant = true;
    } else if (contractScore >= 1 || employmentScore >= 3) {
      classification = 'generic_contract';
      isRelevant = true;
    } else {
      classification = 'other_document';
      isRelevant = false;
    }

    const detectedKeywords = [
      ...contractKeywords.filter((k) => text.includes(k)),
      ...swissKeywords.filter((k) => text.includes(k)),
      ...employmentKeywords.filter((k) => text.includes(k)),
    ];

    return JSON.stringify({
      classification,
      is_relevant: isRelevant,
      confidence: Math.round(confidence * 100) / 100,
      document_type: documentType,
      analysis: {
        contract_indicators: contractScore,
        swiss_indicators: swissScore,
        employment_indicators: employmentScore,
        total_score: totalScore,
        max_possible_score: maxScore,
      },
      detected_keywords: detectedKeywords,
      recommendation: isRelevant
        ? 'Document is a relevant employment contract. Proceed with data extraction.'
        : 'Document does not appear to be a Swiss employment contract. Extraction may yield incomplete results.',
    });
  },
  {
    name: 'document_classification',
    description:
      'Validates whether the uploaded document is a relevant Swiss employment contract (Arbeitsvertrag für Assistenzbeitrag) and provides a classification. Analyzes the document text for contract keywords, Swiss-specific terms, and employment data indicators. Returns classification (swiss_employment_contract, generic_contract, other_document), confidence score, and detected keywords.',
    schema: z.object({
      documentText: z.string().describe('The full text content of the uploaded document'),
      documentType: z
        .enum(['pdf_text', 'pdf_scanned', 'image', 'text_file'])
        .describe('The type/format of the source document'),
    }),
  },
);

// ─── Tool 2: Contract Data Submission ────────────────────

/**
 * Contract Data Submission Tool
 * 
 * Transfers all extracted contract data in a structured and standardized
 * format to the backend for storage and further processing.
 * 
 * Performs:
 * - Data validation (AHV format, IBAN format, canton codes, PLZ)
 * - Canton derivation from ZIP code when not explicitly provided
 * - Holiday supplement calculation from vacation weeks
 * - Standardized formatting of all fields
 */
export const contractDataSubmissionTool = tool(
  async ({
    employer,
    assistant,
    contract_terms,
    wage,
    social_insurance,
  }: {
    employer: string;
    assistant: string;
    contract_terms: string;
    wage: string;
    social_insurance: string;
  }) => {
    const validationErrors: string[] = [];
    const corrections: string[] = [];

    let employerData: Record<string, any>;
    let assistantData: Record<string, any>;
    let contractData: Record<string, any>;
    let wageData: Record<string, any>;
    let insuranceData: Record<string, any>;

    try {
      employerData = JSON.parse(employer);
      assistantData = JSON.parse(assistant);
      contractData = JSON.parse(contract_terms);
      wageData = JSON.parse(wage);
      insuranceData = JSON.parse(social_insurance);
    } catch {
      return JSON.stringify({
        status: 'error',
        message: 'Invalid JSON in one or more data sections. All sections must be valid JSON strings.',
      });
    }

    const SUPPORTED_CANTONS = new Set(['LU', 'BE', 'ZH']);

    const normalizeCountry = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      return String(v).trim().toUpperCase();
    };
    const isSwissCountry = (countryValue: unknown): boolean => {
      const c = normalizeCountry(countryValue);
      if (!c) return true; // default: assume CH if unknown
      return c === 'CH' || c === 'CHE' || c === 'SCHWEIZ' || c === 'SWITZERLAND';
    };

    // Validate/standardize assistant house number
    if (assistantData.house_number?.value !== null && assistantData.house_number?.value !== undefined) {
      const n = Number(String(assistantData.house_number.value).trim());
      if (!Number.isFinite(n)) {
        validationErrors.push('Assistant house_number invalid (expected a number)');
      } else if (assistantData.house_number.value !== n) {
        corrections.push(`House number standardized: ${assistantData.house_number.value} → ${n}`);
        assistantData.house_number.value = n;
      }
    }

    // De-duplicate street vs house number (common: "Musterstrasse 12" + house_number=12)
    if (assistantData.street?.value) {
      const streetRaw = String(assistantData.street.value).trim();
      const m = streetRaw.match(/^(.*\D)\s+(\d+)$/); // only handle purely numeric house numbers
      if (m) {
        const streetName = (m[1] ?? '').trim();
        const hnFromStreetRaw = (m[2] ?? '').trim();
        const hnFromStreet = Number(hnFromStreetRaw);
        if (!streetName || !hnFromStreetRaw) {
          // ignore
        } else {
        const hnExisting = assistantData.house_number?.value;

        if ((hnExisting === null || hnExisting === undefined || hnExisting === '') && Number.isFinite(hnFromStreet)) {
          if (!assistantData.house_number) assistantData.house_number = {};
          assistantData.house_number.value = hnFromStreet;
          corrections.push(`House number derived from street: "${streetRaw}" → street="${streetName}", house_number=${hnFromStreet}`);
          assistantData.street.value = streetName;
        } else if (Number(hnExisting) === hnFromStreet) {
          // Same number is present in both places → remove from street to avoid redundancy
          corrections.push(`Street normalized (removed duplicate house number): "${streetRaw}" → "${streetName}"`);
          assistantData.street.value = streetName;
        } else {
          // Conflicting numbers → keep but flag
          validationErrors.push('Assistant street appears to include a house number that differs from house_number');
        }
        }
      }
    }

    // Validate assistant phone (soft)
    if (assistantData.phone?.value) {
      const phone = String(assistantData.phone.value).trim();
      if (!/^\+\d[\d\s().-]{5,}$/.test(phone)) {
        validationErrors.push('Assistant phone format suspicious (expected +CC …)');
      }
    }

    // Validate assistant email (soft)
    if (assistantData.email?.value) {
      const email = String(assistantData.email.value).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        validationErrors.push('Assistant email format invalid');
      }
    }

    // Validate assistant gender (soft)
    if (assistantData.gender?.value) {
      const g = String(assistantData.gender.value).trim().toLowerCase();
      if (!['male', 'female', 'diverse', 'männlich', 'weiblich', 'divers'].includes(g)) {
        validationErrors.push('Assistant gender value not recognized (expected male|female|diverse)');
      }
    }

    // Validate accounting method (only ordinary supported)
    if (insuranceData.accounting_method?.value) {
      const m = String(insuranceData.accounting_method.value).trim().toLowerCase();
      const allowed = new Set(['ordinary']);
      if (!allowed.has(m)) {
        validationErrors.push(`Unknown accounting_method: ${insuranceData.accounting_method.value}`);
      }
      if (insuranceData.accounting_method.value !== m) {
        corrections.push(`Accounting method standardized: ${insuranceData.accounting_method.value} → ${m}`);
        insuranceData.accounting_method.value = m;
      }
    }

    // Validate AHV number
    if (assistantData.ahv_number?.value) {
      const digits = String(assistantData.ahv_number.value).replace(/[.\s-]/g, '');
      if (!/^756\d{10}$/.test(digits)) {
        validationErrors.push('AHV number format invalid (expected: 756.XXXX.XXXX.XX)');
      } else {
        const formatted = `${digits.slice(0, 3)}.${digits.slice(3, 7)}.${digits.slice(7, 11)}.${digits.slice(11)}`;
        if (assistantData.ahv_number.value !== formatted) {
          corrections.push(`AHV number reformatted: ${assistantData.ahv_number.value} → ${formatted}`);
          assistantData.ahv_number.value = formatted;
        }
      }
    }

    // Validate IBAN
    if (wageData.payment_iban?.value) {
      const cleaned = String(wageData.payment_iban.value).replace(/\s/g, '').toUpperCase();
      if (!/^CH\d{19}$/.test(cleaned) && !/^LI\d{19}$/.test(cleaned)) {
        validationErrors.push('IBAN format invalid (expected: CH followed by 19 digits)');
      }
    }

    // Validate and standardize canton
    if (insuranceData.canton?.value) {
      const upper = String(insuranceData.canton.value).toUpperCase().trim();
      if (!(upper in SWISS_CANTONS)) {
        validationErrors.push(`Unknown canton code: ${insuranceData.canton.value}`);
      } else if (insuranceData.canton.value !== upper) {
        corrections.push(`Canton standardized: ${insuranceData.canton.value} → ${upper}`);
        insuranceData.canton.value = upper;
      }
      if (upper in SWISS_CANTONS && !SUPPORTED_CANTONS.has(upper)) {
        validationErrors.push(`Canton not supported (only LU/BE/ZH): ${upper}`);
        insuranceData.canton.note = insuranceData.canton.note || 'Aktuell nur LU/BE/ZH unterstützt';
      }
    }

    // Derive canton from ZIP if not provided
    if (!insuranceData.canton?.value && (assistantData.zip?.value || employerData.zip?.value)) {
      const zip = String(assistantData.zip?.value || employerData.zip?.value);
      const prefix2 = zip.substring(0, 2);
      const prefix1 = zip.substring(0, 1);
      const derivedCanton = ZIP_TO_CANTON[prefix2] || ZIP_TO_CANTON[prefix1];
      if (derivedCanton) {
        if (SUPPORTED_CANTONS.has(derivedCanton)) {
          corrections.push(`Canton derived from ZIP ${zip}: ${derivedCanton} (${SWISS_CANTONS[derivedCanton]})`);
          if (!insuranceData.canton) insuranceData.canton = {};
          insuranceData.canton.value = derivedCanton;
          insuranceData.canton.note = `Abgeleitet aus PLZ ${zip}`;
        } else {
          validationErrors.push(`Canton derived from ZIP ${zip} is not supported (only LU/BE/ZH): ${derivedCanton}`);
        }
      }
    }

    // Calculate holiday supplement from vacation weeks if missing
    if (!wageData.holiday_supplement_pct?.value && wageData.vacation_weeks?.value) {
      const weeks = Number(wageData.vacation_weeks.value);
      const supplementMap: Record<number, number> = { 4: 0.0833, 5: 0.1064, 6: 0.1304 };
      const supplement = supplementMap[weeks];
      if (supplement) {
        corrections.push(`Holiday supplement derived from ${weeks} weeks: ${(supplement * 100).toFixed(2)}%`);
        if (!wageData.holiday_supplement_pct) wageData.holiday_supplement_pct = {};
        wageData.holiday_supplement_pct.value = supplement;
        wageData.holiday_supplement_pct.note = `Berechnet aus ${weeks} Ferienwochen`;
      }
    }

    // Validate PLZ
    for (const [label, data] of [['Employer', employerData], ['Assistant', assistantData]] as const) {
      if (data.zip?.value) {
        if (label === 'Assistant' && !isSwissCountry(assistantData.country?.value)) {
          continue;
        }
        const plz = String(data.zip.value).trim();
        const num = parseInt(plz, 10);
        if (plz.length !== 4 || isNaN(num) || num < 1000 || num > 9699) {
          validationErrors.push(`${label} PLZ invalid: ${plz} (expected: 4 digits, 1000-9699)`);
        }
      }
    }

    const submissionPayload = {
      employer: employerData,
      assistant: assistantData,
      contract_terms: contractData,
      wage: wageData,
      social_insurance: insuranceData,
    };

    return JSON.stringify({
      status: validationErrors.length === 0 ? 'success' : 'warning',
      message: validationErrors.length === 0
        ? 'All contract data validated and ready for submission to backend.'
        : `Data has ${validationErrors.length} validation issue(s). Review recommended.`,
      validation_errors: validationErrors,
      corrections_applied: corrections,
      data: submissionPayload,
      field_count: Object.values(submissionPayload).reduce(
        (sum, section) => sum + Object.keys(section).length, 0,
      ),
    });
  },
  {
    name: 'contract_data_submission',
    description:
      'Transfers all extracted contract data in a structured and standardized format to the backend for storage and further processing. Validates Swiss-specific formats (AHV numbers, IBANs, canton codes, PLZ), derives missing fields (canton from ZIP, holiday supplement from vacation weeks), and returns the validated payload. Pass each section as a JSON string.',
    schema: z.object({
      employer: z.string().describe('JSON string with employer fields: {first_name, last_name, street, zip, city}'),
      assistant: z.string().describe('JSON string with assistant fields: {first_name, last_name, street, house_number, zip, city, country, phone, email, birth_date, gender, ahv_number, civil_status, nationality, residence_permit}'),
      contract_terms: z.string().describe('JSON string with contract fields: {start_date, end_date, is_indefinite, hours_per_week, hours_per_month, notice_period_days}'),
      wage: z.string().describe('JSON string with wage fields: {wage_type, hourly_rate, monthly_rate, vacation_weeks, holiday_supplement_pct, payment_iban}'),
      social_insurance: z.string().describe('JSON string with insurance fields: {accounting_method, canton, nbu_employer_pct, nbu_employee_pct}'),
    }),
  },
);

// ─── Export ──────────────────────────────────────────────

export const agentTools = [documentClassificationTool, contractDataSubmissionTool];
