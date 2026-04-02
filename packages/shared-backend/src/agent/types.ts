export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type DocumentClassification = 'contract' | 'invoice' | 'other';

export interface IDPField<T = any> {
  value: T | null;
  confidence: ConfidenceLevel;
  confidence_score: number;
  source_text: string;
  note: string;
}

export interface IDPMetadata {
  document_language: string;
  overall_confidence: number;
  fields_extracted: number;
  fields_missing: number;
  warnings: string[];
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
    birth_date: IDPField<string>;
    civil_status: IDPField<string>;
    nationality: IDPField<string>;
    residence_permit: IDPField<string>;
    ahv_number: IDPField<string>;
  };
  contract_terms: {
    start_date: IDPField<string>;
    end_date: IDPField<string>;
    is_indefinite: IDPField<boolean>;
    hours_per_week: IDPField<number>;
    hours_per_month: IDPField<number>;
    notice_period_days: IDPField<number>;
  };
  wage: {
    wage_type: IDPField<string>;
    hourly_rate: IDPField<number>;
    monthly_rate: IDPField<number>;
    vacation_weeks: IDPField<number>;
    holiday_supplement_pct: IDPField<number>;
    payment_iban: IDPField<string>;
  };
  social_insurance: {
    accounting_method: IDPField<string>;
    canton: IDPField<string>;
    nbu_employer_pct: IDPField<number>;
    nbu_employee_pct: IDPField<number>;
  };
}

export interface ContractExtractionResult {
  extraction_metadata: IDPMetadata;
  contracts: ContractSchema;
}

export type IDPState = 
  | 'idle' 
  | 'uploading' 
  | 'classifying' 
  | 'extracting' 
  | 'review_needed' 
  | 'rejected' // if classification is 'other' or unsupported
  | 'approved';
