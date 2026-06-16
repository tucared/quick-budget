
alter table "public"."households" add constraint "households_currencies_distinct" CHECK ((base_currency <> secondary_currency)) not valid;

alter table "public"."households" validate constraint "households_currencies_distinct";


