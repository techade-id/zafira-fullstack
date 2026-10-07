import React, { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useDaftarSiteplan, usePetaSiteplan, useSekarang } from "../lib/useSiteplan";
import { statusJual, holdAktif, urutKode } from "../lib/siteplan";
import SiteplanVektor from "./SiteplanVektor";
import { BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT } from "./ui";

/**
 * Memilih unit dari peta siteplan.
 *
 * Yang ada di kepala pembeli adalah *letak* unit — hook, dekat jalan masuk,
 * sebelah mana — bukan kodenya. Memaksa Sales menerjemahkan itu menjadi "A-14"
 * lewat dropdown sebelum bisa mencatat booking adalah beban yang tidak perlu,
 * sekaligus sumber salah pilih unit.
 *
 * Hanya unit `tersedia` yang bisa diklik — dan bila sedang ditahan, hanya
 * oleh prospek penahannya sendiri. Sisanya tetap digambar dengan warna
 * statusnya: melihat kavling sebelah sudah terjual adalah konteks yang berguna,
 * sedangkan membiarkannya diklik lalu ditolak server hanya membingungkan.
 *
 * Siteplannya sama dengan halaman Siteplan (migrasi 022): satu sumber geometri
 * untuk semua proyek, bukan lagi satu gambar Kaligangsa yang ditulis di kode.
 */
export default function SiteplanPicker({ unitTerpilihId, onPilih, leadId }) {
  const { proyek, siteplans, memuat, galat } = useDaftarSiteplan();
  const sekarang = useSekarang();
  const [stok, setStok] = useState(null);
  const [aktifId, setAktifId] = useState(null);
  const [luarPeta, setLuarPeta] = useState([]);
  const [cari, setCari] = useState("");

  // Unit tersedia per siteplan — untuk label tab, dan untuk membuka siteplan
  // yang benar-benar masih punya stok lebih dulu.
  useEffect(() => {
    let hidup = true;
    supabase
      .from("units")
      .select("id, siteplan_id, status")
      .eq("status", "tersedia")
      .not("siteplan_id", "is", null)
      .then(({ data }) => hidup && setStok(data || []));
    return () => {
      hidup = false;
    };
  }, []);

  const tersediaPer = useMemo(() => {
    const m = new Map();
    for (const u of stok || []) m.set(u.siteplan_id, (m.get(u.siteplan_id) || 0) + 1);
    return m;
  }, [stok]);

  // Menunggu stok termuat: memilih lebih dulu berarti kavling yang sudah
  // terpilih (dibuka dari Siteplan) tampil di siteplan yang salah.
  useEffect(() => {
    if (aktifId || !siteplans.length || stok === null) return;
    const pemilik = unitTerpilihId && stok.find((u) => u.id === unitTerpilihId)?.siteplan_id;
    const berguna = siteplans.find((s) => tersediaPer.get(s.id) > 0);
    setAktifId(pemilik || berguna?.id || siteplans[0].id);
  }, [siteplans, stok, tersediaPer, unitTerpilihId, aktifId]);

  // Unit terpilih bisa tiba sesudah siteplan awal dipilih (modal Booking
  // mengisinya lewat effect). Peta pindah ke siteplan pemiliknya — memilih
  // kavling di siteplan yang sedang tampil tidak mengubah apa pun.
  useEffect(() => {
    if (!unitTerpilihId || !stok) return;
    const pemilik = stok.find((u) => u.id === unitTerpilihId)?.siteplan_id;
    if (pemilik) setAktifId(pemilik);
  }, [unitTerpilihId, stok]);

  const aktif = siteplans.find((s) => s.id === aktifId) || null;
  const { kavling, fasilitas, memuat: memuatPeta } = usePetaSiteplan(aktifId);

  // Unit tersedia di proyek yang sama tetapi belum digambar tidak boleh hilang
  // dari pandangan — kalau tidak, memilih lewat peta justru menyembunyikan
  // sebagian barang dagangan.
  useEffect(() => {
    if (!aktif?.project_id) return setLuarPeta([]);
    let hidup = true;
    supabase
      .from("units")
      .select("id, unit_code, block, type, price, status")
      .eq("project_id", aktif.project_id)
      .eq("status", "tersedia")
      .is("bentuk", null)
      .then(({ data }) => hidup && setLuarPeta((data || []).sort((a, b) => urutKode(a.unit_code, b.unit_code))));
    return () => {
      hidup = false;
    };
  }, [aktif?.project_id]);

  const bisa = (k) => {
    if (statusJual(k, sekarang) === "tersedia") return true;
    const hold = holdAktif(k, sekarang);
    return k.status === "tersedia" && hold && hold.lead_id === leadId;
  };

  const terpilih = kavling.find((k) => k.id === unitTerpilihId) || luarPeta.find((u) => u.id === unitTerpilihId) || null;
  const q = cari.trim().toUpperCase();

  if (memuat) return <div style={{ padding: 20, fontSize: 13, color: TEXT_MID }}>Memuat siteplan…</div>;
  if (galat) return <div style={{ padding: 16, fontSize: 12.5, color: TEXT_MID, lineHeight: 1.5 }}>{galat} Sementara itu, pilih unit lewat mode Daftar.</div>;
  if (!siteplans.length) {
    return <div style={{ padding: 16, fontSize: 12.5, color: TEXT_MID }}>Belum ada siteplan. Pilih unit lewat mode Daftar, atau minta Admin Marketing menggambar siteplannya.</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 11, flexWrap: "wrap", alignItems: "center" }}>
        {siteplans.length > 1 &&
          siteplans.map((s) => {
            const pilih = s.id === aktifId;
            const namaProyek = proyek.find((p) => p.id === s.project_id)?.name;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setAktifId(s.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: `1px solid ${pilih ? PRIMARY : BORDER}`,
                  background: pilih ? PRIMARY : SURFACE,
                  color: pilih ? "#fff" : TEXT_MID,
                  fontSize: 12,
                  fontWeight: pilih ? 600 : 500,
                  cursor: "pointer",
                }}
              >
                {namaProyek ? `${namaProyek} · ` : ""}
                {s.nama} <span style={{ opacity: 0.75 }}>· {tersediaPer.get(s.id) || 0} tersedia</span>
              </button>
            );
          })}
        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari kavling (mis. C12)"
          aria-label="Cari kavling"
          style={{ marginLeft: "auto", padding: "7px 13px", border: `1px solid ${BORDER}`, borderRadius: 999, fontSize: 12, outline: "none", width: 165 }}
        />
      </div>

      {memuatPeta && !kavling.length ? (
        <div style={{ padding: 20, fontSize: 13, color: TEXT_MID }}>Memuat kavling…</div>
      ) : kavling.some((k) => k.bentuk) ? (
        <SiteplanVektor
          siteplan={aktif}
          kavling={kavling}
          fasilitas={fasilitas}
          mode="status"
          terpilih={unitTerpilihId}
          onPilih={(k) => onPilih(k)}
          bisaDipilih={bisa}
          redup={(k) => (q ? !String(k.unit_code).toUpperCase().includes(q) : false)}
          fokus={unitTerpilihId}
          sekarang={sekarang}
          tinggi={380}
        />
      ) : (
        <div style={{ padding: 16, fontSize: 12.5, color: TEXT_MID }}>Siteplan ini belum punya kavling yang digambar.</div>
      )}

      {terpilih && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12.5, color: PRIMARY, background: PRIMARY_SOFT, borderRadius: 10, padding: "8px 12px" }}>
          <Check size={14} />
          Terpilih <b>{terpilih.unit_code}</b>
          {terpilih.type ? ` · ${terpilih.type}` : ""} — klik lagi pada peta untuk membatalkan.
        </div>
      )}

      {luarPeta.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 11, borderTop: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 11.5, color: TEXT_MID, marginBottom: 8 }}>{luarPeta.length} unit tersedia belum tergambar di siteplan</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {luarPeta.map((u) => {
              const dipilih = u.id === unitTerpilihId;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => onPilih(u)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "5px 11px",
                    borderRadius: 999,
                    border: `1px solid ${dipilih ? PRIMARY : BORDER}`,
                    background: dipilih ? PRIMARY_SOFT : SURFACE,
                    color: dipilih ? PRIMARY : TEXT_DARK,
                    fontSize: 12,
                    fontWeight: dipilih ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {dipilih && <Check size={12} />}
                  {u.unit_code}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
