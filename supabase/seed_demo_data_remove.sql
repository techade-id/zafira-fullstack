-- ============================================================
-- Griya Zafira — Remove all demo/seed data
--
-- Deletes every row created by seed_demo_data.sql. Those rows all have ids
-- beginning with 5eed, so nothing you entered yourself is affected.
-- Run this before handing the system over for real use.
-- ============================================================

delete from task_evaluations   where id::text like '5eed%';
delete from project_tasks      where id::text like '5eed%';
delete from complaints         where id::text like '5eed%';
delete from customer_transfers where id::text like '5eed%';
delete from cancellations      where id::text like '5eed%';
delete from payments           where id::text like '5eed%';
delete from customer_documents where id::text like '5eed%';
delete from customer_kpr       where id::text like '5eed%';
delete from customers          where id::text like '5eed%';
delete from leads              where id::text like '5eed%';
delete from sales_targets      where id::text like '5eed%';
delete from ads_analytics      where id::text like '5eed%';

-- put the demo units back to available
update units set status = 'tersedia'
where unit_code in ('A1','A2','B3','B7','C5','D2','D9','E4','F6','G3')
  and project_id = (select id from projects where name = 'Perumahan Zafira Permai Kaligangsa' limit 1);
