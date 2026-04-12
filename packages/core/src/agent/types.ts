/**
 * Agent Types
 * 
 * Binary status model (Meeting Decision #2):
 *   Internal confidence scores (0.0–1.0) are preserved
 *   Display maps to binary: "ok" or "review_required"
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type BinaryStatus = 'ok' | 'review_required';

/** Human-in-the-Loop review type: verify = Prüfen, supplement = Ergänzen */
export type ReviewType = 'verify' | 'supplement';

export type DocumentClassification = 'contract' | 'invoice' | 'other';

export interface IDPField<T = any> {
  value: T | null;
  confidence: ConfidenceLevel;
  confidence_score: number;
  status?: BinaryStatus;
  /** 'verify' = Prüfen (Wert da, unsicher), 'supplement' = Ergänzen (Wert fehlt) */
  review_type?: ReviewType;
  source_text: string;
  note: string;
  judge_justification?: string;
}

export interface IDPMetadata {
  document_language: string;
  overall_confidence: number;
  overall_status?: BinaryStatus;
  fields_extracted: number;
  fields_missing: number;
  fields_requiring_review?: number;
  warnings: string[];
  review_required_fields?: string[];
  /** Fields where value exists but is uncertain → human verifies (Prüfen) */
  review_verify_fields?: string[];
  /** Fields where value is missing → human must add (Ergänzen) */
  review_supplement_fields?: string[];
}

export interface ContractSchema {
  employer: {
    first_name: IDPField<string>;
    last_name: IDPField<string>;
    street: IDPField<string>;
    zip: IDPField<string>;
    city: IDPField<string>;
  };
  assistant: {
    first_name: IDPField<string>;
    last_name: IDPField<string>;
    street: IDPField<string>;
    zip: IDPField<string>;
    city: IDPField<string>;
    country: IDPField<string>;
    phone: IDPField<string>;
    email: IDPField<string>;
    birth_date: IDPField<string>;
    gender: IDPField<string>;
    civil_status: IDPField<string>;
    residence_permit: IDPField<string>;
    ahv_number: IDPField<string>;
  };
  contract_terms: {
    start_date: IDPField<string>;
    end_date: IDPField<string>;
    is_indefinite: IDPField<boolean>;
    hours_per_week: IDPField<number>;
    notice_period_days: IDPField<number>;
  };
  wage: {
    wage_type: IDPField<string>;
    hourly_rate: IDPField<number>;
    vacation_weeks: IDPField<number>;
    holiday_supplement_pct: IDPField<number>;
    payment_iban: IDPField<string>;
  };
  social_insurance: {
    accounting_method: IDPField<string>;
    canton: IDPField<string>;
    nbu_total_rate_pct: IDPField<number>;
    nbu_employer_pct: IDPField<number>;
    nbu_employee_pct: IDPField<number>;
    nbu_employer_voluntary: IDPField<boolean>;
    nbu_insurer_name: IDPField<string>;
    nbu_policy_number: IDPField<string>;
  };
}

export interface ContractExtractionResult {
  extraction_metadata: IDPMetadata;
  contracts: ContractSchema;
}

export type IDPState =
  | 'idle'
  | 'uploading'
  | 'extracting'
  | 'judging'
  | 'review_needed'
  | 'rejected'
  | 'approved';
