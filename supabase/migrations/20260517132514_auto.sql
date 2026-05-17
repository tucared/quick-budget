drop policy "Users can update own profile" on "public"."users";



  create policy "Users can update own profile"
  on "public"."users"
  as permissive
  for update
  to public
using ((id = ( SELECT auth.uid() AS uid)))
with check (((id = ( SELECT auth.uid() AS uid)) AND (household_id = private.get_my_household_id())));



