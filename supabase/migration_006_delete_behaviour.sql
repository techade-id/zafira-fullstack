-- ============================================================
-- Griya Zafira — Migration 006
-- Makes deleting from the UI behave sensibly.
--
-- Before this, several foreign keys had no ON DELETE rule, so Postgres
-- blocked the delete outright:
--   * a prospek could not be deleted once it became a konsumen
--   * a konsumen could not be deleted if they had a komplain
--   * a unit could not be deleted if anything referenced it
--
-- Where the child record should outlive the parent, the reference is now set
-- to null instead of blocking. Where losing the link would destroy meaning
-- (a contractor's work history), the delete is still blocked on purpose and
-- the UI explains why.
--
-- Safe to re-run.
-- ============================================================

-- ---------- Links that should survive the parent being deleted ----------

alter table customers drop constraint if exists customers_lead_id_fkey;
alter table customers add constraint customers_lead_id_fkey
  foreign key (lead_id) references leads(id) on delete set null;

alter table customers drop constraint if exists customers_unit_id_fkey;
alter table customers add constraint customers_unit_id_fkey
  foreign key (unit_id) references units(id) on delete set null;

alter table complaints drop constraint if exists complaints_customer_id_fkey;
alter table complaints add constraint complaints_customer_id_fkey
  foreign key (customer_id) references customers(id) on delete set null;

alter table complaints drop constraint if exists complaints_unit_id_fkey;
alter table complaints add constraint complaints_unit_id_fkey
  foreign key (unit_id) references units(id) on delete set null;

alter table project_tasks drop constraint if exists project_tasks_unit_id_fkey;
alter table project_tasks add constraint project_tasks_unit_id_fkey
  foreign key (unit_id) references units(id) on delete set null;

alter table contractor_evaluations drop constraint if exists contractor_evaluations_unit_id_fkey;
alter table contractor_evaluations add constraint contractor_evaluations_unit_id_fkey
  foreign key (unit_id) references units(id) on delete set null;

alter table sales_targets drop constraint if exists sales_targets_agent_id_fkey;
alter table sales_targets add constraint sales_targets_agent_id_fkey
  foreign key (agent_id) references profiles(id) on delete set null;

alter table leads drop constraint if exists leads_project_id_fkey;
alter table leads add constraint leads_project_id_fkey
  foreign key (project_id) references projects(id) on delete set null;

-- ---------- Deliberately still blocked ----------
-- A contractor with tasks or field projects against them keeps their work
-- history; deleting them would leave unattributable evaluations. The UI turns
-- the resulting foreign-key error into a readable explanation.
--
--   project_tasks.contractor_id
--   field_projects.contractor_id

notify pgrst, 'reload schema';
