-- Stage 3B cleanup: deactivate duplicate "Column N" rows
-- Run this only after confirming equivalent "Area N" rows exist for the same branch.

select branch, id, name, is_active, sort_order
from public.appointment_areas
order by branch, sort_order, name;

update public.appointment_areas col
set is_active = false
where lower(col.name) like 'column %'
  and exists (
    select 1
    from public.appointment_areas area
    where area.branch = col.branch
      and area.is_active = true
      and lower(area.name) = replace(lower(col.name), 'column', 'area')
  );

select branch, id, name, is_active, sort_order
from public.appointment_areas
order by branch, sort_order, name;
