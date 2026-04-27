-- Berechnete Lohnabrechnung pro Assistenzperson und Monat

CREATE TABLE IF NOT EXISTS public.payroll (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id     uuid NOT NULL REFERENCES public.assistant (id) ON DELETE CASCADE,
  month            date NOT NULL,
  total_hours      numeric NOT NULL DEFAULT 0,
  total_nights     numeric NOT NULL DEFAULT 0,
  base_pay         numeric NOT NULL DEFAULT 0,
  vacation_pay     numeric NOT NULL DEFAULT 0,
  gross_pay        numeric NOT NULL DEFAULT 0,
  ahv_employee     numeric NOT NULL DEFAULT 0,
  alv_employee     numeric NOT NULL DEFAULT 0,
  nbu_employee     numeric NOT NULL DEFAULT 0,
  bvg_employee     numeric NOT NULL DEFAULT 0,
  net_pay          numeric NOT NULL DEFAULT 0,
  ahv_employer     numeric NOT NULL DEFAULT 0,
  alv_employer     numeric NOT NULL DEFAULT 0,
  bu_employer      numeric NOT NULL DEFAULT 0,
  total_cost       numeric NOT NULL DEFAULT 0,
  payslip_pdf_url  text,
  rapport_pdf_url  text,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (assistant_id, month)
);

GRANT ALL ON TABLE public.payroll TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payroll TO anon, authenticated;
