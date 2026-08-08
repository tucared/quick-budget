

  create table "public"."household_hdk_wrap" (
    "id" uuid not null default gen_random_uuid(),
    "household_id" uuid not null,
    "user_id" uuid not null,
    "ephemeral_public_key" text not null,
    "wrapped_hdk" text not null,
    "wrap_nonce" text not null,
    "wrap_scheme" text not null default 'ECDH-P256-HKDF-SHA256-AESGCM'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."household_hdk_wrap" enable row level security;


  create table "public"."user_key_material" (
    "user_id" uuid not null,
    "household_id" uuid not null,
    "kdf_params" jsonb not null,
    "kdf_salt" text not null,
    "public_key" text not null,
    "enc_private_key" text not null,
    "enc_private_key_nonce" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."user_key_material" enable row level security;

alter table "public"."expenses" add column "enc_blob" jsonb;

CREATE UNIQUE INDEX household_hdk_wrap_household_id_user_id_key ON public.household_hdk_wrap USING btree (household_id, user_id);

CREATE UNIQUE INDEX household_hdk_wrap_pkey ON public.household_hdk_wrap USING btree (id);

CREATE INDEX idx_household_hdk_wrap_user ON public.household_hdk_wrap USING btree (user_id);

CREATE INDEX idx_user_key_material_household ON public.user_key_material USING btree (household_id);

CREATE UNIQUE INDEX user_key_material_pkey ON public.user_key_material USING btree (user_id);

alter table "public"."household_hdk_wrap" add constraint "household_hdk_wrap_pkey" PRIMARY KEY using index "household_hdk_wrap_pkey";

alter table "public"."user_key_material" add constraint "user_key_material_pkey" PRIMARY KEY using index "user_key_material_pkey";

alter table "public"."household_hdk_wrap" add constraint "household_hdk_wrap_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE not valid;

alter table "public"."household_hdk_wrap" validate constraint "household_hdk_wrap_household_id_fkey";

alter table "public"."household_hdk_wrap" add constraint "household_hdk_wrap_household_id_user_id_key" UNIQUE using index "household_hdk_wrap_household_id_user_id_key";

alter table "public"."household_hdk_wrap" add constraint "household_hdk_wrap_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."household_hdk_wrap" validate constraint "household_hdk_wrap_user_id_fkey";

alter table "public"."user_key_material" add constraint "user_key_material_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE not valid;

alter table "public"."user_key_material" validate constraint "user_key_material_household_id_fkey";

alter table "public"."user_key_material" add constraint "user_key_material_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_key_material" validate constraint "user_key_material_user_id_fkey";

grant delete on table "public"."household_hdk_wrap" to "authenticated";

grant insert on table "public"."household_hdk_wrap" to "authenticated";

grant select on table "public"."household_hdk_wrap" to "authenticated";

grant update on table "public"."household_hdk_wrap" to "authenticated";

grant delete on table "public"."household_hdk_wrap" to "service_role";

grant insert on table "public"."household_hdk_wrap" to "service_role";

grant select on table "public"."household_hdk_wrap" to "service_role";

grant update on table "public"."household_hdk_wrap" to "service_role";

grant delete on table "public"."user_key_material" to "authenticated";

grant insert on table "public"."user_key_material" to "authenticated";

grant select on table "public"."user_key_material" to "authenticated";

grant update on table "public"."user_key_material" to "authenticated";

grant delete on table "public"."user_key_material" to "service_role";

grant insert on table "public"."user_key_material" to "service_role";

grant select on table "public"."user_key_material" to "service_role";

grant update on table "public"."user_key_material" to "service_role";


  create policy "Household members can delete hdk wraps"
  on "public"."household_hdk_wrap"
  as permissive
  for delete
  to public
using ((household_id = private.get_my_household_id()));



  create policy "Household members can insert hdk wraps"
  on "public"."household_hdk_wrap"
  as permissive
  for insert
  to public
with check ((household_id = private.get_my_household_id()));



  create policy "Household members can update hdk wraps"
  on "public"."household_hdk_wrap"
  as permissive
  for update
  to public
using ((household_id = private.get_my_household_id()));



  create policy "Household members can view hdk wraps"
  on "public"."household_hdk_wrap"
  as permissive
  for select
  to public
using ((household_id = private.get_my_household_id()));



  create policy "Members can view household key material"
  on "public"."user_key_material"
  as permissive
  for select
  to public
using (((user_id = ( SELECT auth.uid() AS uid)) OR (household_id = private.get_my_household_id())));



  create policy "Users can delete own key material"
  on "public"."user_key_material"
  as permissive
  for delete
  to public
using ((user_id = ( SELECT auth.uid() AS uid)));



  create policy "Users can insert own key material"
  on "public"."user_key_material"
  as permissive
  for insert
  to public
with check (((user_id = ( SELECT auth.uid() AS uid)) AND (household_id = private.get_my_household_id())));



  create policy "Users can update own key material"
  on "public"."user_key_material"
  as permissive
  for update
  to public
using ((user_id = ( SELECT auth.uid() AS uid)))
with check (((user_id = ( SELECT auth.uid() AS uid)) AND (household_id = private.get_my_household_id())));


CREATE TRIGGER update_household_hdk_wrap_updated_at BEFORE UPDATE ON public.household_hdk_wrap FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_key_material_updated_at BEFORE UPDATE ON public.user_key_material FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


