import React, { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import SiteplanVektor from "./SiteplanVektor";
import { SITEPLAN_KAVLING } from "../data/siteplanKaligangsa";
import { BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT } from "./ui";

/**
 * Memilih unit dari peta siteplan.
 *
 * Yang ada di kepala pembeli adalah *letak* unit — hook, dekat jalan masuk,
 * sebelah mana — bukan kodenya. Memaksa Sales menerjemahkan itu menjadi "A-14"
 * lewat dropdown sebelum bisa mencatat booking adalah beban yang tidak perlu,
 * sekaligus sumber salah pilih unit.
 *
 * Hanya unit `tersedia` yang bisa diklik. Sisanya tetap digambar dengan warna
 * statusnya: melihat kavling sebelah sudah terjual adalah konteks yang berguna,
 * sedangkan membiarkannya diklik lalu ditolak server hanya membingungkan.
 */
export default function SiteplanPicker({ unitTerpilihId, onPilih }) {
  const [projects, setProjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [projectAktif, setProjectAktif] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [cari, setCari] = useState("");

  useEffect(() => {
    let aktif = true;
    Promise.all([
      supabase.from("projects").select("id, name").order("created_at", { ascending: false }),
      supabase.from("units").select("id, project_id, unit_code, block, type, price, status").order("unit_code"),
    ]).then(([{ data: p }, { data: u }]) => {
      if (!aktif) return;
      setProjects(p || []);
      setUnits(u || []);
      // Proyek pertama yang benar-benar punya unit tersedia dibuka lebih dulu —
      // membuka peta pada proyek yang sudah habis bukan titik awal yang baik.
      const berguna = (p || []).find((pr) => (u || []).some((x) => x.project_id === pr.id && x.status === "tersedia"));
      setProjectAktif((berguna || (p || [])[0])?.id || null);
      setMemuat(false);
    });
    return () => {
      aktif = false;
    };
  }, []);

  const unitProyek = useMemo(() => units.filter((u) => u.project_id === projectAktif), [units, projectAktif]);
  const terpilih = units.find((u) => u.id === unitTerpilihId) || null;

  // Kavling yang ada di database tetapi tidak ada pada gambar siteplan tidak
  // boleh hilang dari pandangan — kalau tidak, memilih lewat peta justru
  // menyembunyikan sebagian barang dagangan.
  const kodePeta = useMemo(() => new Set(SITEPLAN_KAVLING.map((k) => k.kode.toUpperCase())), []);
  const luarPeta = unitProyek.filter((u) => u.status === "tersedia" && !kodePeta.has(String(u.unit_code || "").trim().toUpperCase()));

  if (memuat) return <div style={{ padding: 20, fontSize: 13, color: TEXT_MID }}>Memuat siteplan…</div>;

  if (projects.length === 0) {
    return <div style={{ padding: 16, fontSize: 12.5, color: TEXT_MID }}>Belum ada proyek. Buat proyek terlebih dahulu.</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 11, flexWrap: "wrap", alignItems: "center" }}>
        {projects.length > 1 &&
          projects.map((p) => {
            const aktif = p.id === projectAktif;
            const sisa = units.filter((u) => u.project_id === p.id && u.status === "tersedia").length;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setProjectAktif(p.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: `1px solid ${aktif ? PRIMARY : BORDER}`,
                  background: aktif ? PRIMARY : SURFACE,
                  color: aktif ? "#fff" : TEXT_MID,
                  fontSize: 12,
                  fontWeight: aktif ? 600 : 500,
                  cursor: "pointer",
                }}
              >
                {p.name} <span style={{ opacity: 0.75 }}>· {sisa} tersedia</span>
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

      <SiteplanVektor
        units={unitProyek}
        kodeTerpilih={unitTerpilihId}
        onPilih={(db) => onPilih(db)}
        hanyaTersedia
        sorotan={cari}
        tinggi={380}
      />

      {terpilih && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12.5, color: PRIMARY, background: PRIMARY_SOFT, borderRadius: 10, padding: "8px 12px" }}>
          <Check size={14} />
          Terpilih <b>{terpilih.unit_code}</b>
          {terpilih.type ? ` · ${terpilih.type}` : ""} — klik lagi pada peta untuk membatalkan.
        </div>
      )}

      {luarPeta.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 11, borderTop: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 11.5, color: TEXT_MID, marginBottom: 8 }}>
            {luarPeta.length} unit tersedia tidak ada pada gambar siteplan ini
          </div>
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
