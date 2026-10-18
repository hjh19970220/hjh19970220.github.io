grant usage on schema ninety_core to service_role;
grant select, insert, update, delete on all tables in schema ninety_core to service_role;
grant usage, select on all sequences in schema ninety_core to service_role;
alter default privileges in schema ninety_core grant select, insert, update, delete on tables to service_role;
alter default privileges in schema ninety_core grant usage, select on sequences to service_role;
