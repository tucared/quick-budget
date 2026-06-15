
alter table "public"."households" add column "base_currency" text not null default 'EUR'::text;

alter table "public"."households" add column "secondary_currency" text not null default 'BRL'::text;

alter table "public"."households" add constraint "households_base_currency_check" CHECK ((base_currency ~ '^[A-Z]{3}$'::text)) not valid;

alter table "public"."households" validate constraint "households_base_currency_check";

alter table "public"."households" add constraint "households_secondary_currency_check" CHECK ((secondary_currency ~ '^[A-Z]{3}$'::text)) not valid;

alter table "public"."households" validate constraint "households_secondary_currency_check";


