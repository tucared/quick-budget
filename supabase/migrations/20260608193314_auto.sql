
alter table "public"."categories" alter column "icon" set not null;

alter table "public"."categories" add constraint "categories_icon_not_empty" CHECK ((btrim(icon) <> ''::text)) not valid;

alter table "public"."categories" validate constraint "categories_icon_not_empty";


