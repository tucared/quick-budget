-- ============================================================================
-- 04_seed_exchange_rates.sql - EUR/BRL Exchange Rates
-- ============================================================================
-- Generates ~60 weekday rates for the past 3 months relative to today.
-- rate_to_eur = how many EUR per 1 BRL (inverse of EUR/BRL quote).
-- ============================================================================

DO $$
DECLARE
  d DATE;
  base_rate DECIMAL(12,6) := 0.162500;  -- ~EUR/BRL 6.15
  jitter DECIMAL(12,6);
BEGIN
  -- Generate a rate for each weekday in the past 90 days
  FOR d IN SELECT generate_series(
    CURRENT_DATE - interval '90 days',
    CURRENT_DATE,
    interval '1 day'
  )::date
  LOOP
    -- Skip weekends
    IF EXTRACT(DOW FROM d) IN (0, 6) THEN
      CONTINUE;
    END IF;

    -- Deterministic pseudo-random jitter based on day of year
    jitter := (EXTRACT(DOY FROM d)::int % 17 - 8) * 0.000200;

    INSERT INTO public.exchange_rates (currency, rate_date, rate_to_eur)
    VALUES ('BRL', d, base_rate + jitter)
    ON CONFLICT (currency, rate_date) DO NOTHING;
  END LOOP;
END $$;
