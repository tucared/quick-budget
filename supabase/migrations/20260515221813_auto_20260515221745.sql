
alter table "public"."categories" add column "cap_amount" numeric(12,2);

alter table "public"."categories" add column "overflow_category_id" uuid;

alter table "public"."expenses" add column "split_group_id" uuid;

CREATE INDEX idx_expenses_split_group ON public.expenses USING btree (split_group_id) WHERE (split_group_id IS NOT NULL);

alter table "public"."categories" add constraint "categories_cap_both_or_neither" CHECK ((((cap_amount IS NULL) AND (overflow_category_id IS NULL)) OR ((cap_amount IS NOT NULL) AND (overflow_category_id IS NOT NULL) AND (cap_amount > (0)::numeric)))) not valid;

alter table "public"."categories" validate constraint "categories_cap_both_or_neither";

alter table "public"."categories" add constraint "categories_no_self_overflow" CHECK (((overflow_category_id IS NULL) OR (overflow_category_id <> id))) not valid;

alter table "public"."categories" validate constraint "categories_no_self_overflow";

alter table "public"."categories" add constraint "categories_overflow_category_id_fkey" FOREIGN KEY (overflow_category_id) REFERENCES public.categories(id) ON DELETE SET NULL not valid;

alter table "public"."categories" validate constraint "categories_overflow_category_id_fkey";


