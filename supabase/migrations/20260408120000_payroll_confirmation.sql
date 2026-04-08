-- Freigabestatus Lohnabrechnung pro Assistenzperson und Monat (siehe README: payroll_confirmation)
-- Upsert im Frontend: onConflict assistant_id, month

CREATE TABLE IF NOT EXISTS public.payroll_confirmation (
  assistant_id uuid NOT NULL REFERENCES public.assistant (id) ON DELETE CASCADE,
  month date NOT NULL,
  confirmed boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,
  PRIMARY KEY (assistant_id, month)
);

COMMENT ON TABLE public.payroll_confirmation IS 'Monatliche Freigabe der Lohnabrechnung pro Assistenzperson';

-- API-Zugriff (analog zu anderen public-Tabellen in Supabase)
GRANT ALL ON TABLE public.payroll_confirmation TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payroll_confirmation TO anon, authenticated;
