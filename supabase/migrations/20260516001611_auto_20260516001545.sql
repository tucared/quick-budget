alter table "public"."categories" drop constraint "categories_cap_both_or_neither";

alter table "public"."categories" drop constraint "categories_no_self_overflow";

alter table "public"."categories" drop constraint "categories_overflow_category_id_fkey";


alter table "public"."categories" drop column "overflow_category_id";

alter table "public"."categories" add constraint "categories_cap_positive" CHECK (((cap_amount IS NULL) OR (cap_amount > (0)::numeric))) not valid;

alter table "public"."categories" validate constraint "categories_cap_positive";


