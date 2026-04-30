-- Idempotente Re-Anwendung aller RLS-Policies.
-- Nutzt DROP IF EXISTS vor jedem CREATE, damit die Migration sicher
-- auch dann durchläuft wenn Policies bereits (teilweise) existieren.

-- ─── RLS aktivieren (no-op wenn bereits aktiv) ────────────────────────────────
ALTER TABLE public.employer              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_access       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entry            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_schedule       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_confirmation  ENABLE ROW LEVEL SECURITY;

-- ─── employer ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "employer_insert" ON public.employer;
CREATE POLICY "employer_insert" ON public.employer
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "employer_select" ON public.employer;
CREATE POLICY "employer_select" ON public.employer
  FOR SELECT TO authenticated
  USING (id IN (
    SELECT employer_id FROM public.employer_access WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "employer_update" ON public.employer;
CREATE POLICY "employer_update" ON public.employer
  FOR UPDATE TO authenticated
  USING (id IN (
    SELECT employer_id FROM public.employer_access WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "employer_delete" ON public.employer;
CREATE POLICY "employer_delete" ON public.employer
  FOR DELETE TO authenticated
  USING (id IN (
    SELECT employer_id FROM public.employer_access WHERE user_id = auth.uid()
  ));

-- ─── employer_access ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "employer_access_insert" ON public.employer_access;
CREATE POLICY "employer_access_insert" ON public.employer_access
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "employer_access_select" ON public.employer_access;
CREATE POLICY "employer_access_select" ON public.employer_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "employer_access_update" ON public.employer_access;
CREATE POLICY "employer_access_update" ON public.employer_access
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "employer_access_delete" ON public.employer_access;
CREATE POLICY "employer_access_delete" ON public.employer_access
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─── assistant ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "assistant_all" ON public.assistant;
CREATE POLICY "assistant_all" ON public.assistant
  FOR ALL TO authenticated
  USING (employer_id IN (
    SELECT employer_id FROM public.employer_access WHERE user_id = auth.uid()
  ))
  WITH CHECK (employer_id IN (
    SELECT employer_id FROM public.employer_access WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "assistant_anon_select" ON public.assistant;
CREATE POLICY "assistant_anon_select" ON public.assistant
  FOR SELECT TO anon
  USING (access_token IS NOT NULL);

-- ─── time_entry ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "time_entry_all" ON public.time_entry;
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

DROP POLICY IF EXISTS "time_entry_assistant_insert" ON public.time_entry;
CREATE POLICY "time_entry_assistant_insert" ON public.time_entry
  FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "time_entry_assistant_select" ON public.time_entry;
CREATE POLICY "time_entry_assistant_select" ON public.time_entry
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "time_entry_assistant_update" ON public.time_entry;
CREATE POLICY "time_entry_assistant_update" ON public.time_entry
  FOR UPDATE TO anon
  USING (true);

-- ─── weekly_schedule ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "weekly_schedule_all" ON public.weekly_schedule;
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
DROP POLICY IF EXISTS "payroll_all" ON public.payroll;
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
DROP POLICY IF EXISTS "payroll_confirmation_all" ON public.payroll_confirmation;
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

DROP POLICY IF EXISTS "payroll_confirmation_assistant" ON public.payroll_confirmation;
CREATE POLICY "payroll_confirmation_assistant" ON public.payroll_confirmation
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);
