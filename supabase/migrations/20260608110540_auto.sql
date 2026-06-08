
CREATE INDEX idx_tricount_entry_map_household ON public.tricount_entry_map USING btree (household_id);

CREATE INDEX idx_tricount_links_default_category ON public.tricount_links USING btree (default_category_id);


