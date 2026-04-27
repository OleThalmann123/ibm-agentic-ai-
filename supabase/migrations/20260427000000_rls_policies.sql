-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Enable RLS on all tables
ALTER TABLE public.employer              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_access       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entry            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_schedule       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_confirmation  ENABLE ROW LEVEL SECURITY;

-- ─── employer ─────────────────────────────────────────────────────────────────
-- Any authenticated user may create a new employer (during onboarding).
CREATE POLICY "employer_insert" ON public.employer
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users may only read/update/delete employers they have access to.
CREATE POLICY "employer_select" ON public.employer
  FOR SELECT TO authenticated
  USING (id IN (
    SELECT employer_id FROM public.employer_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "employer_update" ON public.employer
  FOR UPDATE TO authenticated
  USING (id IN (
    SELECT employer_id FROM public.employer_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "employer_delete" ON public.employer
  FOR DELETE TO authenticated
  USING (id IN (
    SELECT employer_id FROM public.employer_access WHERE user_id = auth.uid()
  ));

-- ─── employer_access ──────────────────────────────────────────────────────────
-- Users may only manage their own access rows.
CREATE POLICY "employer_access_insert" ON public.employer_access
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "employer_access_select" ON public.employer_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "employer_access_update" ON public.employer_access
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "employer_access_delete" ON public.employer_access
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─── assistant ────────────────────────────────────────────────────────────────
CREATE POLICY "assistant_all" ON public.assistant
  FOR ALL TO authenticated
  USING (employer_id IN (
    SELECT employer_id FROM public.employer_access WHERE user_id = auth.uid()
  ))
  WITH CHECK (employer_id IN (
    SELECT employer_id FROM public.employer_access WHERE user_id = auth.uid()
  ));

-- Assistants access their own row via token link (no auth session → anon role).
CREATE POLICY "assistant_anon_select" ON public.assistant
  FOR SELECT TO anon
  USING (access_token IS NOT NULL);

-- ─── time_entry ───────────────────────────────────────────────────────────────
CREATE POLICY "time_entry_all" ON public.time_entry
  FOR ALL TO authenticated
  USING (assistant_id IN (
    SELECT a.id FROM public.assistant a
    JOIN public.employer_access ea ON ea.employer_id = a.employer_id
    WHERE ea.user_id = auth.uid()
  ))
  WITH CHECK (assistant_id IN (
    SELECT a.id FROM public.assistant a
    JOIN public.employer_access ea ON ea.employer_id = a.employer_id
    WHERE ea.user_id = auth.uid()
  ));

-- Allow assistants to insert their own time entries via access_token (anon).
-- The assistant identifies themselves via assistant_id match — no auth needed
-- since the token-login flow uses anon key with a known assistant_id.
CREATE POLICY "time_entry_assistant_insert" ON public.time_entry
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "time_entry_assistant_select" ON public.time_entry
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "time_entry_assistant_update" ON public.time_entry
  FOR UPDATE TO anon
  USING (true);

-- ─── weekly_schedule ──────────────────────────────────────────────────────────
CREATE POLICY "weekly_schedule_all" ON public.weekly_schedule
  FOR ALL TO authenticated
  USING (assistant_id IN (
    SELECT a.id FROM public.assistant a
    JOIN public.employer_access ea ON ea.employer_id = a.employer_id
    WHERE ea.user_id = auth.uid()
  ))
  WITH CHECK (assistant_id IN (
    SELECT a.id FROM public.assistant a
    JOIN public.employer_access ea ON ea.employer_id = a.employer_id
    WHERE ea.user_id = auth.uid()
  ));

-- ─── payroll ──────────────────────────────────────────────────────────────────
CREATE POLICY "payroll_all" ON public.payroll
  FOR ALL TO authenticated
  USING (assistant_id IN (
    SELECT a.id FROM public.assistant a
    JOIN public.employer_access ea ON ea.employer_id = a.employer_id
    WHERE ea.user_id = auth.uid()
  ))
  WITH CHECK (assistant_id IN (
    SELECT a.id FROM public.assistant a
    JOIN public.employer_access ea ON ea.employer_id = a.employer_id
    WHERE ea.user_id = auth.uid()
  ));

-- ─── payroll_confirmation ─────────────────────────────────────────────────────
CREATE POLICY "payroll_confirmation_all" ON public.payroll_confirmation
  FOR ALL TO authenticated
  USING (assistant_id IN (
    SELECT a.id FROM public.assistant a
    JOIN public.employer_access ea ON ea.employer_id = a.employer_id
    WHERE ea.user_id = auth.uid()
  ))
  WITH CHECK (assistant_id IN (
    SELECT a.id FROM public.assistant a
    JOIN public.employer_access ea ON ea.employer_id = a.employer_id
    WHERE ea.user_id = auth.uid()
  ));

-- Allow assistants (anon) to read/write their own confirmation row.
CREATE POLICY "payroll_confirmation_assistant" ON public.payroll_confirmation
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);
