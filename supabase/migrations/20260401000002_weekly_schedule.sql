-- Wochenplan pro Assistenzperson (Standardzeiten für Stundenerfassung)

CREATE TABLE IF NOT EXISTS public.weekly_schedule (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id  uuid NOT NULL REFERENCES public.assistant (id) ON DELETE CASCADE,
  day_of_week   int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sonntag
  start_time    text NOT NULL,
  end_time      text NOT NULL,
  is_night      boolean NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

GRANT ALL ON TABLE public.weekly_schedule TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.weekly_schedule TO anon, authenticated;
