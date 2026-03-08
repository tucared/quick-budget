drop policy "Authenticated users can insert exchange rates" on "public"."exchange_rates";

drop policy "Authenticated users can view exchange rates" on "public"."exchange_rates";

drop index if exists "public"."idx_budget_allocations_category";

drop index if exists "public"."idx_budget_allocations_household";

drop index if exists "public"."idx_expenses_household";


  create policy "Authenticated users can insert exchange rates"
  on "public"."exchange_rates"
  as permissive
  for insert
  to public
with check ((( SELECT auth.uid() AS uid) IS NOT NULL));



  create policy "Authenticated users can view exchange rates"
  on "public"."exchange_rates"
  as permissive
  for select
  to public
using ((( SELECT auth.uid() AS uid) IS NOT NULL));



