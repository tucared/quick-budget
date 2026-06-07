

  create table "public"."tricount_entry_map" (
    "id" uuid not null default gen_random_uuid(),
    "household_id" uuid not null,
    "link_id" uuid not null,
    "tricount_entry_id" bigint not null,
    "expense_id" uuid not null,
    "content_hash" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."tricount_entry_map" enable row level security;


  create table "public"."tricount_links" (
    "id" uuid not null default gen_random_uuid(),
    "household_id" uuid not null,
    "public_identifier_token" text not null,
    "title" text,
    "default_category_id" uuid,
    "members" jsonb not null default '[]'::jsonb,
    "member_map" jsonb not null default '{}'::jsonb,
    "is_active" boolean not null default true,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."tricount_links" enable row level security;

CREATE INDEX idx_tricount_entry_map_expense ON public.tricount_entry_map USING btree (expense_id);

CREATE INDEX idx_tricount_entry_map_link ON public.tricount_entry_map USING btree (link_id);

CREATE INDEX idx_tricount_links_household ON public.tricount_links USING btree (household_id);

CREATE UNIQUE INDEX tricount_entry_map_link_id_tricount_entry_id_key ON public.tricount_entry_map USING btree (link_id, tricount_entry_id);

CREATE UNIQUE INDEX tricount_entry_map_pkey ON public.tricount_entry_map USING btree (id);

CREATE UNIQUE INDEX tricount_links_household_id_public_identifier_token_key ON public.tricount_links USING btree (household_id, public_identifier_token);

CREATE UNIQUE INDEX tricount_links_pkey ON public.tricount_links USING btree (id);

alter table "public"."tricount_entry_map" add constraint "tricount_entry_map_pkey" PRIMARY KEY using index "tricount_entry_map_pkey";

alter table "public"."tricount_links" add constraint "tricount_links_pkey" PRIMARY KEY using index "tricount_links_pkey";

alter table "public"."tricount_entry_map" add constraint "tricount_entry_map_expense_id_fkey" FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE CASCADE not valid;

alter table "public"."tricount_entry_map" validate constraint "tricount_entry_map_expense_id_fkey";

alter table "public"."tricount_entry_map" add constraint "tricount_entry_map_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE not valid;

alter table "public"."tricount_entry_map" validate constraint "tricount_entry_map_household_id_fkey";

alter table "public"."tricount_entry_map" add constraint "tricount_entry_map_link_id_fkey" FOREIGN KEY (link_id) REFERENCES public.tricount_links(id) ON DELETE CASCADE not valid;

alter table "public"."tricount_entry_map" validate constraint "tricount_entry_map_link_id_fkey";

alter table "public"."tricount_entry_map" add constraint "tricount_entry_map_link_id_tricount_entry_id_key" UNIQUE using index "tricount_entry_map_link_id_tricount_entry_id_key";

alter table "public"."tricount_links" add constraint "tricount_links_default_category_id_fkey" FOREIGN KEY (default_category_id) REFERENCES public.categories(id) ON DELETE SET NULL not valid;

alter table "public"."tricount_links" validate constraint "tricount_links_default_category_id_fkey";

alter table "public"."tricount_links" add constraint "tricount_links_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE not valid;

alter table "public"."tricount_links" validate constraint "tricount_links_household_id_fkey";

alter table "public"."tricount_links" add constraint "tricount_links_household_id_public_identifier_token_key" UNIQUE using index "tricount_links_household_id_public_identifier_token_key";

grant delete on table "public"."tricount_entry_map" to "authenticated";

grant insert on table "public"."tricount_entry_map" to "authenticated";

grant select on table "public"."tricount_entry_map" to "authenticated";

grant update on table "public"."tricount_entry_map" to "authenticated";

grant delete on table "public"."tricount_entry_map" to "service_role";

grant insert on table "public"."tricount_entry_map" to "service_role";

grant select on table "public"."tricount_entry_map" to "service_role";

grant update on table "public"."tricount_entry_map" to "service_role";

grant delete on table "public"."tricount_links" to "authenticated";

grant insert on table "public"."tricount_links" to "authenticated";

grant select on table "public"."tricount_links" to "authenticated";

grant update on table "public"."tricount_links" to "authenticated";

grant delete on table "public"."tricount_links" to "service_role";

grant insert on table "public"."tricount_links" to "service_role";

grant select on table "public"."tricount_links" to "service_role";

grant update on table "public"."tricount_links" to "service_role";


  create policy "Household members can delete tricount entry map"
  on "public"."tricount_entry_map"
  as permissive
  for delete
  to public
using ((household_id = private.get_my_household_id()));



  create policy "Household members can insert tricount entry map"
  on "public"."tricount_entry_map"
  as permissive
  for insert
  to public
with check ((household_id = private.get_my_household_id()));



  create policy "Household members can update tricount entry map"
  on "public"."tricount_entry_map"
  as permissive
  for update
  to public
using ((household_id = private.get_my_household_id()));



  create policy "Household members can view tricount entry map"
  on "public"."tricount_entry_map"
  as permissive
  for select
  to public
using ((household_id = private.get_my_household_id()));



  create policy "Household members can delete tricount links"
  on "public"."tricount_links"
  as permissive
  for delete
  to public
using ((household_id = private.get_my_household_id()));



  create policy "Household members can insert tricount links"
  on "public"."tricount_links"
  as permissive
  for insert
  to public
with check ((household_id = private.get_my_household_id()));



  create policy "Household members can update tricount links"
  on "public"."tricount_links"
  as permissive
  for update
  to public
using ((household_id = private.get_my_household_id()));



  create policy "Household members can view tricount links"
  on "public"."tricount_links"
  as permissive
  for select
  to public
using ((household_id = private.get_my_household_id()));


CREATE TRIGGER update_tricount_entry_map_updated_at BEFORE UPDATE ON public.tricount_entry_map FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tricount_links_updated_at BEFORE UPDATE ON public.tricount_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


