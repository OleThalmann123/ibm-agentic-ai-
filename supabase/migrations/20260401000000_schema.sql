-- ─── employer ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employer (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  canton         text,
  representation text DEFAULT 'self',
  iv_hours_day   numeric,
  iv_hours_night numeric,
  iv_rate        numeric,
  contact_data   jsonb,
  created_at     timestamptz DEFAULT now()
);

-- ─── employer_access ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employer_access (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id   uuid NOT NULL REFERENCES public.employer (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'admin_full',
  label         text,
  invited_email text NOT NULL DEFAULT '',
  created_at    timestamptz DEFAULT now()
);

-- ─── assistant ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id     uuid NOT NULL REFERENCES public.employer (id) ON DELETE CASCADE,
  name            text NOT NULL,
  email           text,
  date_of_birth   date,
  hourly_rate     numeric,
  vacation_weeks  int,
  has_bvg         boolean DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  time_entry_mode text DEFAULT 'manual',
  access_token    text UNIQUE,
  contract_data   jsonb,
  created_at      timestamptz DEFAULT now()
);

-- ─── time_entry ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_entry (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id uuid NOT NULL REFERENCES public.assistant (id) ON DELETE CASCADE,
  date         date NOT NULL,
  start_time   text NOT NULL,
  end_time     text NOT NULL,
  is_night     boolean NOT NULL DEFAULT false,
  entered_by   text NOT NULL DEFAULT 'assistant',
  confirmed    boolean NOT NULL DEFAULT false,
  category     text,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS time_entry_assistant_id_date_idx ON public.time_entry (assistant_id, date);

-- ─── weekly_schedule ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.weekly_schedule (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id uuid NOT NULL REFERENCES public.assistant (id) ON DELETE CASCADE,
  day_of_week  int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   text NOT NULL,
  end_time     text NOT NULL,
  is_night     boolean NOT NULL DEFAULT false
);

-- ─── payroll ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id    uuid NOT NULL REFERENCES public.assistant (id) ON DELETE CASCADE,
  month           date NOT NULL,
  total_hours     numeric NOT NULL DEFAULT 0,
  total_nights    numeric NOT NULL DEFAULT 0,
  base_pay        numeric NOT NULL DEFAULT 0,
  vacation_pay    numeric NOT NULL DEFAULT 0,
  gross_pay       numeric NOT NULL DEFAULT 0,
  ahv_employee    numeric NOT NULL DEFAULT 0,
  alv_employee    numeric NOT NULL DEFAULT 0,
  nbu_employee    numeric NOT NULL DEFAULT 0,
  bvg_employee    numeric NOT NULL DEFAULT 0,
  net_pay         numeric NOT NULL DEFAULT 0,
  ahv_employer    numeric NOT NULL DEFAULT 0,
  alv_employer    numeric NOT NULL DEFAULT 0,
  bu_employer     numeric NOT NULL DEFAULT 0,
  total_cost      numeric NOT NULL DEFAULT 0,
  payslip_pdf_url text,
  rapport_pdf_url text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (assistant_id, month)
);

-- ─── payroll_confirmation ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_confirmation (
  assistant_id uuid NOT NULL REFERENCES public.assistant (id) ON DELETE CASCADE,
  month        date NOT NULL,
  confirmed    boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,
  PRIMARY KEY (assistant_id, month)
);

-- ─── Grants ───────────────────────────────────────────────────────────────────
GRANT ALL ON public.employer, public.employer_access, public.assistant,
             public.time_entry, public.weekly_schedule,
             public.payroll, public.payroll_confirmation
  TO postgres, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.employer, public.employer_access, public.assistant,
  public.time_entry, public.weekly_schedule,
  public.payroll, public.payroll_confirmation
  TO anon, authenticated;
