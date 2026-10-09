import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileCheck, ArrowRight } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { canWrite } from "../lib/permissions";
import { tanggalWaktu } from "../lib/format";
import { usePratinjau } from "../components/PratinjauBerkas";
import {
  EVENT_PENGAJUAN,
  SELECT_PENGAJUAN,
  LABEL_STATUS,
  PerbandinganCatatan,
  HasilKeputusan,
  TombolKeputusan,
} from "../components/TinjauPengajuan";
import { Card, PageTitle, Badge, EmptyState, ReadOnlyBanner, BORDER, TEXT_MID, TEXT_DARK, PRIMARY, ACCENT, NEGATIVE } from "../components/ui";

/**
 * Persetujuan Catatan — tempat Admin Sistem memutuskan pengajuan perubahan
 * catatan follow-up (migrasi 025).
 *
 * Satu halaman berisi semua yang menunggu, setiap pengajuan dengan
 * sebelum/sesudahnya berdampingan — persetujuan yang diberikan tanpa melihat
 * apa yang berubah bukan persetujuan. Pengajuan yang sama juga bisa diputuskan
 * langsung dari lonceng, pop-up, dan Riwayat prospek (TinjauPengajuan).
 *
 * Pengawas dan Supervisor ikut bisa membuka halaman ini, hanya baca.
 */

const SARINGAN = [
  { kunci: "menunggu", label: "Menunggu" },
  { kunci: "disetujui", label: "Disetujui" },
  { kunci: "ditolak", label: "Ditolak" },
  { kunci: "semua", label: "Semua" },
];

export default function PersetujuanPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const bolehPutus = canWrite(profile, "catatan_putus");

  const [baris, setBaris] = useState([]);
  const [bukti, setBukti] = useState(new Map());
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const [saringan, setSaringan] = useState("menunggu");
  const [bukaPratinjau, pratinjau] = usePratinjau();

  const sorotId = params.get("sorot");
  const sudahSorot = useRef(false);

  async function muat() {
    const { data, error } = await supabase.from("lead_activity_edits").select(SELECT_PENGAJUAN).order("diajukan_at", { ascending: false }).limit(300);
    if (error) {
      // Sebelum migrasi 025 tabelnya belum ada.
      setGalat(error.message);
      setBaris([]);
      setMemuat(false);
      return;
    }
    setGalat("");
    setBaris(data || []);

    const ids = (data || []).map((e) => e.id);
    const peta = new Map();
    if (ids.length) {
      const { data: lampiran } = await supabase.from("berkas_lampiran").select("id, edit_id, file_url, file_name").in("edit_id", ids);
      for (const b of lampiran || []) {
        if (!peta.has(b.edit_id)) peta.set(b.edit_id, []);
        peta.get(b.edit_id).push(b);
      }
    }
    setBukti(peta);
    setMemuat(false);
  }

  useEffect(() => {
    muat();
    // Diputuskan dari lonceng atau pop-up, atau pengajuan baru masuk lewat
    // Realtime: daftar di halaman ini ikut segar.
    const segarkan = () => muat();
    window.addEventListener(EVENT_PENGAJUAN, segarkan);
    return () => window.removeEventListener(EVENT_PENGAJUAN, segarkan);
  }, []);

  // Datang dari lonceng atau "Semua pengajuan →": kartu yang dimaksud
  // disorot dan digulir ke tengah, di saringan yang memang memuatnya.
  useEffect(() => {
    if (!sorotId || memuat || sudahSorot.current) return;
    sudahSorot.current = true;
    const target = baris.find((e) => e.id === sorotId);
    if (!target) return;
    if (target.status !== "menunggu") setSaringan("semua");
    setTimeout(() => document.getElementById(`pengajuan-${sorotId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }, [sorotId, memuat, baris]);

  const tampil = useMemo(() => (saringan === "semua" ? baris : baris.filter((e) => e.status === saringan)), [baris, saringan]);
  const jumlahMenunggu = baris.filter((e) => e.status === "menunggu").length;

  return (
    <div>
      <PageTitle
        title="Persetujuan Catatan"
        subtitle={
          jumlahMenunggu > 0
            ? `${jumlahMenunggu} pengajuan perubahan catatan follow-up menunggu keputusan`
            : "Pengajuan perubahan catatan follow-up dari Sales"
        }
      />

      <ReadOnlyBanner />

      <Card style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: TEXT_MID, marginRight: 2 }}>Tampilkan</span>
          {SARINGAN.map((s) => {
            const aktif = saringan === s.kunci;
            return (
              <button
                key={s.kunci}
                onClick={() => setSaringan(s.kunci)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 999,
                  border: `1px solid ${aktif ? PRIMARY : BORDER}`,
                  background: aktif ? PRIMARY : "#fff",
                  color: aktif ? "#fff" : TEXT_MID,
                  fontSize: 12.5,
                  fontWeight: aktif ? 600 : 500,
                  cursor: "pointer",
                }}
              >
                {s.label}
                {s.kunci === "menunggu" && jumlahMenunggu > 0 ? ` · ${jumlahMenunggu}` : ""}
              </button>
            );
          })}
        </div>
      </Card>

      {galat && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: NEGATIVE }}>Data persetujuan belum bisa dimuat: {galat}. Pastikan migration_025 sudah dijalankan.</div>
        </Card>
      )}

      {memuat && <div style={{ fontSize: 13, color: TEXT_MID, padding: "8px 2px" }}>Memuat pengajuan…</div>}

      {!memuat && !galat && tampil.length === 0 && (
        <Card>
          <EmptyState
            icon={FileCheck}
            label={saringan === "menunggu" ? "Tidak ada pengajuan yang menunggu" : "Belum ada pengajuan di sini"}
            hint="Sales mengajukan perubahan lewat ikon pensil pada catatan di kartu Riwayat prospek."
          />
        </Card>
      )}

      {tampil.map((e) => {
        const disorot = e.id === sorotId;
        return (
          <div key={e.id} id={`pengajuan-${e.id}`} style={{ marginBottom: 14 }}>
            <Card style={disorot ? { borderColor: ACCENT, boxShadow: `0 0 0 1px ${ACCENT}` } : undefined}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <button
                      onClick={() => navigate(`/follow-up?sorot=${e.lead_id}`)}
                      title="Buka prospek di Follow Up Leads"
                      style={{ border: "none", background: "none", padding: 0, fontSize: 15, fontWeight: 700, color: TEXT_DARK, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      {e.leads?.name || "Prospek"} <ArrowRight size={13} style={{ verticalAlign: -2, color: TEXT_MID }} aria-hidden="true" />
                    </button>
                    <Badge value={e.status === "disetujui" ? "terverifikasi" : e.status} label={LABEL_STATUS[e.status]} />
                  </div>
                  <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 4 }}>
                    Diajukan {e.pengaju?.full_name || "-"} · {tanggalWaktu(e.diajukan_at)}
                  </div>
                </div>
                {bolehPutus && e.status === "menunggu" && <TombolKeputusan edit={e} />}
              </div>

              <PerbandinganCatatan edit={e} bukti={bukti.get(e.id) || []} onBukaBukti={bukaPratinjau} />
              <HasilKeputusan edit={e} />
            </Card>
          </div>
        );
      })}

      {pratinjau}
    </div>
  );
}
