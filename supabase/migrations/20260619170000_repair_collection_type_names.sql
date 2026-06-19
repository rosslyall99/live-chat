begin;

with retail_collection_categories as (
  select id
  from public.appointment_categories
  where lower(coalesce(code, '')) = 'retail_collection'
     or lower(name) in ('retail collection', 'collection')
),
repair_map(current_name, restored_name, restored_code) as (
  values
    ('full kilt outfit', 'Retail Collection - Full Kilt Outfit', 'retail_collection_full_kilt_outfit'),
    ('kilt only', 'Retail Collection - Kilt Only', 'retail_collection_kilt_only'),
    ('trousers', 'Retail Collection - Trousers', 'retail_collection_trousers'),
    ('jacket & waistcoat', 'Retail Collection - Jacket & Waistcoat', 'retail_collection_jacket_waistcoat'),
    ('accessories', 'Retail Collection - Accessories', 'retail_collection_accessories')
)
update public.appointment_types t
set
  name = m.restored_name,
  code = coalesce(nullif(btrim(t.code), ''), m.restored_code)
from retail_collection_categories c
join repair_map m
  on true
where t.category_id = c.id
  and lower(t.name) = m.current_name;

commit;
