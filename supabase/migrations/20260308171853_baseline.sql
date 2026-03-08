


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."get_my_household_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT household_id FROM users WHERE id = auth.uid() LIMIT 1;
$$;


ALTER FUNCTION "public"."get_my_household_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  new_household_id UUID;
BEGIN
  -- Create a household for this user
  INSERT INTO public.households (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email) || '''s Household')
  RETURNING id INTO new_household_id;

  -- Insert user profile with household_id
  INSERT INTO public.users (id, email, full_name, household_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    new_household_id
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

-- Auth trigger (not captured by pg_dump since it's on auth.users)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


CREATE OR REPLACE FUNCTION "public"."rebalance_budget"("p_household_id" "uuid", "p_budget_month" "date", "p_source_category_id" "uuid", "p_dest_category_id" "uuid", "p_amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_source_allocated DECIMAL(12, 2);
BEGIN
  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be positive';
  END IF;

  IF p_source_category_id = p_dest_category_id THEN
    RAISE EXCEPTION 'Source and destination must be different';
  END IF;

  -- Get current source allocation and lock the row
  SELECT allocated_amount INTO v_source_allocated
  FROM budget_allocations
  WHERE household_id = p_household_id
    AND category_id = p_source_category_id
    AND budget_month = p_budget_month
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source budget allocation not found';
  END IF;

  -- Guard against negative resulting allocation
  IF v_source_allocated - p_amount < 0 THEN
    RAISE EXCEPTION 'Transfer would result in negative source allocation';
  END IF;

  -- Update or delete source depending on remaining amount
  IF v_source_allocated - p_amount = 0 THEN
    DELETE FROM budget_allocations
    WHERE household_id = p_household_id
      AND category_id = p_source_category_id
      AND budget_month = p_budget_month;
  ELSE
    UPDATE budget_allocations
    SET allocated_amount = allocated_amount - p_amount
    WHERE household_id = p_household_id
      AND category_id = p_source_category_id
      AND budget_month = p_budget_month;
  END IF;

  -- Upsert destination (add)
  INSERT INTO budget_allocations (household_id, category_id, budget_month, allocated_amount, currency)
  VALUES (p_household_id, p_dest_category_id, p_budget_month, p_amount, 'EUR')
  ON CONFLICT (household_id, category_id, budget_month)
  DO UPDATE SET allocated_amount = budget_allocations.allocated_amount + p_amount;
END;
$$;


ALTER FUNCTION "public"."rebalance_budget"("p_household_id" "uuid", "p_budget_month" "date", "p_source_category_id" "uuid", "p_dest_category_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_budget"("p_household_id" "uuid", "p_budget_month" "date", "p_allocations" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_alloc JSONB;
  v_category_id UUID;
  v_amount DECIMAL(12, 2);
  v_upserted_category_ids UUID[] := '{}';
BEGIN
  -- Validate input
  IF p_allocations IS NULL OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'Allocations array must not be empty';
  END IF;

  -- Lock existing rows for this household/month to prevent concurrent edits
  PERFORM 1 FROM budget_allocations
  WHERE household_id = p_household_id AND budget_month = p_budget_month
  FOR UPDATE;

  -- Validate no negative amounts
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_allocations) AS elem
    WHERE (elem->>'amount')::DECIMAL < 0
  ) THEN
    RAISE EXCEPTION 'Allocation amounts must not be negative';
  END IF;

  -- Process each allocation
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_category_id := (v_alloc->>'category_id')::UUID;
    v_amount := (v_alloc->>'amount')::DECIMAL(12, 2);

    IF v_amount > 0 THEN
      INSERT INTO budget_allocations (household_id, category_id, budget_month, allocated_amount, currency)
      VALUES (p_household_id, v_category_id, p_budget_month, v_amount, 'EUR')
      ON CONFLICT (household_id, category_id, budget_month)
      DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;

      v_upserted_category_ids := v_upserted_category_ids || v_category_id;
    END IF;
  END LOOP;

  -- Delete allocations for categories that were zeroed out (sent with amount=0 or not in upserted list)
  DELETE FROM budget_allocations
  WHERE household_id = p_household_id
    AND budget_month = p_budget_month
    AND category_id = ANY(
      SELECT (elem->>'category_id')::UUID
      FROM jsonb_array_elements(p_allocations) AS elem
      WHERE (elem->>'amount')::DECIMAL <= 0
    );
END;
$$;


ALTER FUNCTION "public"."save_budget"("p_household_id" "uuid", "p_budget_month" "date", "p_allocations" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."top_categories_by_usage"("p_household_id" "uuid", "p_limit" integer DEFAULT 5) RETURNS TABLE("category_id" "uuid", "expense_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT e.category_id, COUNT(*) AS expense_count
  FROM expenses e
  JOIN categories c ON c.id = e.category_id AND c.is_active = TRUE
  WHERE e.household_id = p_household_id
    AND e.category_id IS NOT NULL
    AND e.expense_date >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY e.category_id
  ORDER BY expense_count DESC
  LIMIT p_limit;
$$;


ALTER FUNCTION "public"."top_categories_by_usage"("p_household_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."budget_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "household_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "budget_month" "date" NOT NULL,
    "allocated_amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "budget_allocations_allocated_amount_check" CHECK (("allocated_amount" <> (0)::numeric)),
    CONSTRAINT "budget_allocations_currency_check" CHECK (("length"("currency") = 3))
);

ALTER TABLE ONLY "public"."budget_allocations" REPLICA IDENTITY FULL;


ALTER TABLE "public"."budget_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "household_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "exclude_from_budget_total" boolean DEFAULT false NOT NULL,
    "icon" "text",
    "color" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."categories" REPLICA IDENTITY FULL;


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "logged_by_user_id" "uuid" NOT NULL,
    "household_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "is_cash" boolean DEFAULT false NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "converted_amount" numeric(12,2) NOT NULL,
    "converted_currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "exchange_rate" numeric(12,6) DEFAULT 1.0 NOT NULL,
    "expense_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expenses_amount_check" CHECK (("amount" <> (0)::numeric)),
    CONSTRAINT "expenses_converted_amount_check" CHECK (("converted_amount" <> (0)::numeric)),
    CONSTRAINT "expenses_converted_currency_check" CHECK (("length"("converted_currency") = 3)),
    CONSTRAINT "expenses_currency_check" CHECK (("length"("currency") = 3)),
    CONSTRAINT "expenses_exchange_rate_check" CHECK (("exchange_rate" > (0)::numeric))
);

ALTER TABLE ONLY "public"."expenses" REPLICA IDENTITY FULL;


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."budget_summary" WITH ("security_invoker"='true') AS
 WITH "category_months" AS (
         SELECT "budget_allocations"."household_id",
            "budget_allocations"."category_id",
            "budget_allocations"."budget_month"
           FROM "public"."budget_allocations"
        UNION
         SELECT "expenses"."household_id",
            "expenses"."category_id",
            ("date_trunc"('month'::"text", ("expenses"."expense_date")::timestamp with time zone))::"date" AS "budget_month"
           FROM "public"."expenses"
          WHERE ("expenses"."category_id" IS NOT NULL)
        )
 SELECT "ba"."id",
    "cm"."household_id",
    "cm"."budget_month",
    "cm"."category_id",
    "c"."name" AS "category_name",
    "c"."icon" AS "category_icon",
    "c"."color" AS "category_color",
    "c"."exclude_from_budget_total",
    COALESCE("ba"."allocated_amount", (0)::numeric) AS "allocated_amount",
    COALESCE("ba"."currency", 'EUR'::"text") AS "currency",
    COALESCE("sum"("e"."converted_amount"), (0)::numeric) AS "spent_amount",
    (COALESCE("ba"."allocated_amount", (0)::numeric) - COALESCE("sum"("e"."converted_amount"), (0)::numeric)) AS "remaining_amount",
        CASE
            WHEN (COALESCE("ba"."allocated_amount", (0)::numeric) > (0)::numeric) THEN ((COALESCE("sum"("e"."converted_amount"), (0)::numeric) / "ba"."allocated_amount") * (100)::numeric)
            ELSE (0)::numeric
        END AS "percent_spent"
   FROM ((("category_months" "cm"
     JOIN "public"."categories" "c" ON (("c"."id" = "cm"."category_id")))
     LEFT JOIN "public"."budget_allocations" "ba" ON ((("ba"."household_id" = "cm"."household_id") AND ("ba"."category_id" = "cm"."category_id") AND ("ba"."budget_month" = "cm"."budget_month"))))
     LEFT JOIN "public"."expenses" "e" ON ((("e"."category_id" = "cm"."category_id") AND ("e"."household_id" = "cm"."household_id") AND ("date_trunc"('month'::"text", ("e"."expense_date")::timestamp with time zone) = "cm"."budget_month"))))
  GROUP BY "ba"."id", "cm"."household_id", "cm"."budget_month", "cm"."category_id", "c"."name", "c"."icon", "c"."color", "c"."exclude_from_budget_total", "ba"."allocated_amount", "ba"."currency";


ALTER VIEW "public"."budget_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exchange_rates" (
    "currency" "text" NOT NULL,
    "rate_date" "date" NOT NULL,
    "rate_to_eur" numeric(12,6) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exchange_rates_currency_check" CHECK (("length"("currency") = 3)),
    CONSTRAINT "exchange_rates_rate_to_eur_check" CHECK (("rate_to_eur" > (0)::numeric))
);


ALTER TABLE "public"."exchange_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."households" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."households" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "household_id" "uuid" NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."budget_allocations"
    ADD CONSTRAINT "budget_allocations_household_id_category_id_budget_month_key" UNIQUE ("household_id", "category_id", "budget_month");



ALTER TABLE ONLY "public"."budget_allocations"
    ADD CONSTRAINT "budget_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exchange_rates"
    ADD CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("currency", "rate_date");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."households"
    ADD CONSTRAINT "households_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_budget_allocations_category" ON "public"."budget_allocations" USING "btree" ("category_id");



CREATE INDEX "idx_budget_allocations_household" ON "public"."budget_allocations" USING "btree" ("household_id");



CREATE INDEX "idx_budget_allocations_household_month" ON "public"."budget_allocations" USING "btree" ("household_id", "budget_month" DESC);



CREATE INDEX "idx_categories_household" ON "public"."categories" USING "btree" ("household_id");



CREATE INDEX "idx_categories_household_active" ON "public"."categories" USING "btree" ("household_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_exchange_rates_currency_date" ON "public"."exchange_rates" USING "btree" ("currency", "rate_date" DESC);



CREATE INDEX "idx_expenses_category" ON "public"."expenses" USING "btree" ("category_id");



CREATE INDEX "idx_expenses_date" ON "public"."expenses" USING "btree" ("expense_date" DESC);



CREATE INDEX "idx_expenses_household" ON "public"."expenses" USING "btree" ("household_id");



CREATE INDEX "idx_expenses_household_date" ON "public"."expenses" USING "btree" ("household_id", "expense_date" DESC);



CREATE INDEX "idx_expenses_logged_by" ON "public"."expenses" USING "btree" ("logged_by_user_id");



CREATE INDEX "idx_users_household" ON "public"."users" USING "btree" ("household_id");



CREATE OR REPLACE TRIGGER "update_budget_allocations_updated_at" BEFORE UPDATE ON "public"."budget_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_categories_updated_at" BEFORE UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_exchange_rates_updated_at" BEFORE UPDATE ON "public"."exchange_rates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_expenses_updated_at" BEFORE UPDATE ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_households_updated_at" BEFORE UPDATE ON "public"."households" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."budget_allocations"
    ADD CONSTRAINT "budget_allocations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_allocations"
    ADD CONSTRAINT "budget_allocations_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_logged_by_user_id_fkey" FOREIGN KEY ("logged_by_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Authenticated users can insert exchange rates" ON "public"."exchange_rates" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can view exchange rates" ON "public"."exchange_rates" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Household members can delete budget allocations" ON "public"."budget_allocations" FOR DELETE USING (("household_id" = "public"."get_my_household_id"()));



CREATE POLICY "Household members can delete categories" ON "public"."categories" FOR DELETE USING (("household_id" = "public"."get_my_household_id"()));



CREATE POLICY "Household members can delete expenses" ON "public"."expenses" FOR DELETE USING (("household_id" = "public"."get_my_household_id"()));



CREATE POLICY "Household members can insert budget allocations" ON "public"."budget_allocations" FOR INSERT WITH CHECK (("household_id" = "public"."get_my_household_id"()));



CREATE POLICY "Household members can insert categories" ON "public"."categories" FOR INSERT WITH CHECK (("household_id" = "public"."get_my_household_id"()));



CREATE POLICY "Household members can insert expenses" ON "public"."expenses" FOR INSERT WITH CHECK ((("household_id" = "public"."get_my_household_id"()) AND ("logged_by_user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Household members can update budget allocations" ON "public"."budget_allocations" FOR UPDATE USING (("household_id" = "public"."get_my_household_id"()));



CREATE POLICY "Household members can update categories" ON "public"."categories" FOR UPDATE USING (("household_id" = "public"."get_my_household_id"()));



CREATE POLICY "Household members can update expenses" ON "public"."expenses" FOR UPDATE USING (("household_id" = "public"."get_my_household_id"()));



CREATE POLICY "Household members can view budget allocations" ON "public"."budget_allocations" FOR SELECT USING (("household_id" = "public"."get_my_household_id"()));



CREATE POLICY "Household members can view categories" ON "public"."categories" FOR SELECT USING (("household_id" = "public"."get_my_household_id"()));



CREATE POLICY "Household members can view expenses" ON "public"."expenses" FOR SELECT USING (("household_id" = "public"."get_my_household_id"()));



CREATE POLICY "No one can delete exchange rates" ON "public"."exchange_rates" FOR DELETE USING (false);



CREATE POLICY "No one can update exchange rates" ON "public"."exchange_rates" FOR UPDATE USING (false);



CREATE POLICY "Users can delete own profile" ON "public"."users" FOR DELETE USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view household members" ON "public"."users" FOR SELECT USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ("household_id" = "public"."get_my_household_id"())));



CREATE POLICY "Users can view own household" ON "public"."households" FOR SELECT USING (("id" = "public"."get_my_household_id"()));



ALTER TABLE "public"."budget_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exchange_rates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."households" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."budget_allocations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."categories";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."expenses";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."get_my_household_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_household_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_household_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rebalance_budget"("p_household_id" "uuid", "p_budget_month" "date", "p_source_category_id" "uuid", "p_dest_category_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."rebalance_budget"("p_household_id" "uuid", "p_budget_month" "date", "p_source_category_id" "uuid", "p_dest_category_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rebalance_budget"("p_household_id" "uuid", "p_budget_month" "date", "p_source_category_id" "uuid", "p_dest_category_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."save_budget"("p_household_id" "uuid", "p_budget_month" "date", "p_allocations" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."save_budget"("p_household_id" "uuid", "p_budget_month" "date", "p_allocations" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_budget"("p_household_id" "uuid", "p_budget_month" "date", "p_allocations" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."top_categories_by_usage"("p_household_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."top_categories_by_usage"("p_household_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."top_categories_by_usage"("p_household_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."budget_allocations" TO "anon";
GRANT ALL ON TABLE "public"."budget_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."budget_summary" TO "anon";
GRANT ALL ON TABLE "public"."budget_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_summary" TO "service_role";



GRANT ALL ON TABLE "public"."exchange_rates" TO "anon";
GRANT ALL ON TABLE "public"."exchange_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."exchange_rates" TO "service_role";



GRANT ALL ON TABLE "public"."households" TO "anon";
GRANT ALL ON TABLE "public"."households" TO "authenticated";
GRANT ALL ON TABLE "public"."households" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































