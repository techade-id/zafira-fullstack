-- ============================================================
-- Ringkasan hasil. Keluar dengan status gagal bila ada uji yang tidak lulus,
-- sehingga runner dan CI bisa membedakan lulus dari gagal.
-- ============================================================

\pset pager off

\echo ''
\echo '───────────────────────── UJI YANG GAGAL ─────────────────────────'
select bagian, label, detail
from test.results
where not lulus
order by urut;

\echo ''
\echo '───────────────────────── RINGKASAN PER BAGIAN ─────────────────────────'
select bagian,
       count(*) filter (where lulus)     as lulus,
       count(*) filter (where not lulus) as gagal,
       count(*)                          as total
from test.results
group by bagian
order by min(urut);

do $$
declare
  v_lulus int;
  v_gagal int;
begin
  select count(*) filter (where lulus), count(*) filter (where not lulus)
    into v_lulus, v_gagal
  from test.results;

  if v_lulus + v_gagal = 0 then
    raise exception 'Tidak ada uji yang berjalan — kemungkinan berkas uji gagal dimuat.';
  end if;

  raise notice '';
  raise notice '  %  dari %  uji lulus', v_lulus, v_lulus + v_gagal;

  if v_gagal > 0 then
    raise exception '% uji GAGAL', v_gagal;
  end if;
end $$;
