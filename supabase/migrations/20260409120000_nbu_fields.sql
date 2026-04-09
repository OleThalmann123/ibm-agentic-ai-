-- NBU (Nichtberufsunfallversicherung) Erweiterung
-- Erweitert die contract_data JSONB-Struktur um folgende Felder:
--   nbu_total          TEXT    Gesamtprämiensatz in % (z.B. "1.50")
--   nbu_employer       TEXT    AG-Anteil in %
--   nbu_employee       TEXT    AN-Anteil in %
--   nbu_employer_voluntary  BOOLEAN  AG übernimmt freiwillig
--   nbu_insurer_name   TEXT    Name des Versicherers
--   nbu_policy_number  TEXT    Policennummer
--   nbu_eligible       BOOLEAN  Berechneter NBU-Status
--   nbu_calculated_date TEXT   Datum der letzten Berechnung
--   nbu_avg_hours_3m   NUMERIC Ø Wochenstunden 3 Monate
--   nbu_avg_hours_12m  NUMERIC Ø Wochenstunden 12 Monate
--   nbu_weeks_above_8h_ratio NUMERIC
--   nbu_borderline_warning   BOOLEAN
--   nbu_manually_confirmed   BOOLEAN

-- Alle NBU-Felder werden in assistant.contract_data (JSONB) gespeichert.
-- Keine Schemaänderung an der Tabelle selbst erforderlich.
-- Diese Migration dient als Dokumentation der neuen Felder.

COMMENT ON COLUMN public.assistant.contract_data IS
  'Vom Agenten extrahierte und manuell ergänzte Vertragsdaten (JSONB). '
  'Enthält u.a. NBU-Felder: nbu_total, nbu_employer, nbu_employee, '
  'nbu_employer_voluntary, nbu_insurer_name, nbu_policy_number, '
  'nbu_eligible, nbu_calculated_date, nbu_avg_hours_3m, nbu_avg_hours_12m, '
  'nbu_weeks_above_8h_ratio, nbu_borderline_warning, nbu_manually_confirmed';
