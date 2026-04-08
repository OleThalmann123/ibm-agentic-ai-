export type UserRole = 'admin_full' | 'admin_limited';
export type ShiftType = 'day' | 'night';
export type TimeEntryMode = 'schedule' | 'manual';
export type EnteredBy = 'assistant' | 'admin' | 'system';
export type Canton = 'AG' | 'AI' | 'AR' | 'BE' | 'BL' | 'BS' | 'FR' | 'GE' | 'GL' | 'GR' | 'JU' | 'LU' | 'NE' | 'NW' | 'OW' | 'SG' | 'SH' | 'SO' | 'SZ' | 'TG' | 'TI' | 'UR' | 'VD' | 'VS' | 'ZG' | 'ZH';
export type Representation = 'self' | 'spouse' | 'parent' | 'guardian';

export interface Employer {
  id: string;
  name: string;
  canton?: Canton;
  representation?: Representation;
  iv_hours_day?: number;
  iv_hours_night?: number;
  iv_rate?: number;
  contact_data?: {
    first_name?: string;
    last_name?: string;
    street?: string;
    plz?: string;
    city?: string;
    // Supporter mode: affected person data
    affected_first_name?: string;
    affected_last_name?: string;
    affected_street?: string;
    affected_plz?: string;
    affected_city?: string;
  };
}

export interface EmployerAccess {
  id: string;
  employer_id: string;
  user_id: string;
  role: UserRole;
  label?: string;
  invited_email: string;
}


export interface Assistant {
  id: string;
  employer_id: string;
  name: string;
  email?: string;
  date_of_birth?: string;
  hourly_rate?: number;
  vacation_weeks?: number;
  has_bvg?: boolean;
  is_active: boolean;
  time_entry_mode?: TimeEntryMode;
  access_token?: string;
  contract_data?: any;
}

export interface TimeEntry {
  id: string;
  assistant_id: string;
  date: string;
  start_time: string;
  end_time: string;
  is_night: boolean;
  entered_by: EnteredBy;
  confirmed: boolean;
  hours_decimal?: number;
}

export interface WeeklySchedule {
  id: string;
  assistant_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_night: boolean;
}

export interface Payroll {
  id: string;
  assistant_id: string;
  month: string;
  total_hours: number;
  total_nights: number;
  base_pay: number;
  vacation_pay: number;
  gross_pay: number;
  ahv_employee: number;
  alv_employee: number;
  nbu_employee: number;
  bvg_employee: number;
  net_pay: number;
  ahv_employer: number;
  alv_employer: number;
  bu_employer: number;
  total_cost: number;
  payslip_pdf_url?: string;
  rapport_pdf_url?: string;
}

// Join types for UI
export interface TimeEntryWithAssistant extends TimeEntry {
  assistant: Pick<Assistant, 'name'>;
}
