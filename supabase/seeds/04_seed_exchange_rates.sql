-- ============================================================================
-- 04_seed_exchange_rates.sql - Exchange Rates (EUR-pivoted)
-- ============================================================================
-- Generates ~60 weekday rates for the past 3 months relative to today.
-- rate_to_eur = how many EUR per 1 unit of the currency. The exchange_rates
-- table is global and always EUR-pivoted; conversion into a household's base
-- currency is derived as a cross-rate (rate_to_eur(input) / rate_to_eur(base)).
--
-- BRL is the secondary currency for the default 'Home' household (EUR base).
-- GBP is seeded too so a local GBP-base household (see 01_create_users.sql)
-- can resolve BRL→GBP and EUR→GBP cross-rates offline — Dev/Prod hit live
-- Frankfurter, so this block is only needed for `supabase db reset`.
-- ============================================================================

DO $$
DECLARE
  d DATE;
  brl_base_rate DECIMAL(12,6) := 0.162500;  -- ~EUR/BRL 6.15
  gbp_base_rate DECIMAL(12,6) := 1.170000;  -- ~1 GBP = 1.17 EUR
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
    VALUES
      ('BRL', d, brl_base_rate + jitter),
      ('GBP', d, gbp_base_rate + jitter)
    ON CONFLICT (currency, rate_date) DO NOTHING;
  END LOOP;
END $$;
