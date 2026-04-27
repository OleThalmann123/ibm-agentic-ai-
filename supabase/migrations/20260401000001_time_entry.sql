-- Zeiterfassung pro Assistenzperson

CREATE TABLE IF NOT EXISTS public.time_entry (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id  uuid NOT NULL REFERENCES public.assistant (id) ON DELETE CASCADE,
  date          date NOT NULL,
  start_time    text NOT NULL,
  end_time      text NOT NULL,
  is_night      boolean NOT NULL DEFAULT false,
  entered_by    text NOT NULL DEFAULT 'assistant', -- 'assistant' | 'admin' | 'system'
  confirmed     boolean NOT NULL DEFAULT false,
  category      text,
  hours_decimal numeric GENERATED ALWAYS AS (
    CASE
      WHEN end_time = '24:00' THEN
        (24 * 60 - (
          EXTRACT(HOUR FROM start_time::time) * 60 +
          EXTRACT(MINUTE FROM start_time::time)
        )) / 60.0
      WHEN end_time::time > start_time::time THEN
        EXTRACT(EPOCH FROM (end_time::time - start_time::time)) / 3600.0
      ELSE 0
    END
  ) STORED,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS time_entry_assistant_id_date_idx
  ON public.time_entry (assistant_id, date);

GRANT ALL ON TABLE public.time_entry TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.time_entry TO anon, authenticated;
