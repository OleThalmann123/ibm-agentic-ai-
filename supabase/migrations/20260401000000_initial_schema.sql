-- ─── Core schema: employer, employer_access, assistant ───────────────────────

CREATE TABLE IF NOT EXISTS public.employer (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  canton        text,
  representation text DEFAULT 'self',
  iv_hours_day  numeric,
  iv_hours_night numeric,
  iv_rate       numeric,
  contact_data  jsonb,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employer_access (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id    uuid NOT NULL REFERENCES public.employer (id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role           text NOT NULL DEFAULT 'admin_full',
  label          text,
  invited_email  text NOT NULL DEFAULT '',
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assistant (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id       uuid NOT NULL REFERENCES public.employer (id) ON DELETE CASCADE,
  name              text NOT NULL,
  email             text,
  date_of_birth     date,
  hourly_rate       numeric,
  vacation_weeks    int,
  has_bvg           boolean DEFAULT false,
  is_active         boolean NOT NULL DEFAULT true,
  time_entry_mode   text DEFAULT 'manual',
  access_token      text UNIQUE,
  contract_data     jsonb,
  created_at        timestamptz DEFAULT now()
);

-- RLS & grants
GRANT ALL ON TABLE public.employer        TO postgres, service_role;
GRANT ALL ON TABLE public.employer_access TO postgres, service_role;
GRANT ALL ON TABLE public.assistant       TO postgres, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employer        TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employer_access TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assistant       TO anon, authenticated;
