
alter table "public"."tricount_entry_map" add column "entry_date" date not null default '1970-01-01'::date;

alter table "public"."tricount_entry_map" add column "paid_converted_amount" numeric(12,2) not null default 0;

alter table "public"."tricount_entry_map" add column "share_converted_amount" numeric(12,2) not null default 0;

alter table "public"."tricount_entry_map" alter column "expense_id" drop not null;


