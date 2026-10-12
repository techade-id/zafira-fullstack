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
import { EVENT_STATUS, SELECT_STATUS, KartuPengajuanStatus } from "../components/PengajuanStatus";
import { EVENT_BI, SELECT_PERCOBAAN, KartuPengganti } from "../components/PenggantiBi";
import { Card, PageTitle, Badge, EmptyState, ReadOnlyBanner, BORDER, TEXT_MID, TEXT_DARK, PRIMARY, ACCENT, ACCENT_SOFT, ACCENT_DARK, NEGATIVE } from "../components/ui";

/**
 * Persetujuan — tempat Admin Sistem memutuskan pengajuan atas data penting:
 * perubahan dan penghapusan catatan follow-up (migrasi 025, 027), serta
 * perubahan status konsumen (migrasi 027). Yang sudah diputuskan tetap di
 * sini sebagai jejak audit: siapa mengajukan, kapan, apa, dan siapa memutuskan.
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
  const [tab, setTab] = useState(["status", "bi"].includes(params.get("tab")) ? params.get("tab") : "catatan");
  const [barisBi, setBarisBi] = useState([]);
  const [galatBi, setGalatBi] = useState("");
  const [barisStatus, setBarisStatus] = useState([]);
  const [galatStatus, setGalatStatus] = useState("");
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

  async function muatStatus() {
    const { data, error } = await supabase.from("customer_status_edits").select(SELECT_STATUS).order("diajukan_at", { ascending: false }).limit(300);
    // Sebelum migrasi 027 tabelnya belum ada.
    setGalatStatus(error ? error.message : "");
    setBarisStatus(error ? [] : data || []);
  }

  // Pengajuan pemohon pengganti BI Checking (migrasi 028): percobaan ke-2
  // sampai ke-4. Percobaan pertama adalah data asli dan tidak diajukan.
  async function muatBi() {
    const { data, error } = await supabase
      .from("bi_checking_percobaan")
      .select(SELECT_PERCOBAAN)
      .gt("urutan", 1)
      .order("diajukan_at", { ascending: false })
      .limit(300);
    setGalatBi(error ? error.message : "");
    setBarisBi(error ? [] : data || []);
  }

  useEffect(() => {
    muatBi();
    window.addEventListener(EVENT_BI, muatBi);
    return () => window.removeEventListener(EVENT_BI, muatBi);
  }, []);

  useEffect(() => {
    muat();
    muatStatus();
    // Diputuskan dari lonceng atau pop-up, atau pengajuan baru masuk lewat
    // Realtime: daftar di halaman ini ikut segar.
    const segarkan = () => muat();
    window.addEventListener(EVENT_PENGAJUAN, segarkan);
    window.addEventListener(EVENT_STATUS, muatStatus);
    return () => {
      window.removeEventListener(EVENT_PENGAJUAN, segarkan);
      window.removeEventListener(EVENT_STATUS, muatStatus);
    };
  }, []);

  // Datang dari lonceng atau "Semua pengajuan →": kartu yang dimaksud
  // disorot dan digulir ke tengah, di saringan yang memang memuatnya.
  useEffect(() => {
    if (!sorotId || memuat || sudahSorot.current) return;
    const sumber = { status: barisStatus, bi: barisBi, catatan: baris }[tab];
    const target = sumber.find((e) => e.id === sorotId);
    if (!target) return;
    sudahSorot.current = true;
    if ((target.status || target.persetujuan) !== "menunggu") setSaringan("semua");
    const elemen = { status: `pengajuan-status-${sorotId}`, bi: `pengajuan-bi-${sorotId}`, catatan: `pengajuan-${sorotId}` }[tab];
    setTimeout(() => document.getElementById(elemen)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }, [sorotId, memuat, baris, barisStatus, barisBi, tab]);

  const tampil = useMemo(() => (saringan === "semua" ? baris : baris.filter((e) => e.status === saringan)), [baris, saringan]);
  const tampilStatus = useMemo(() => (saringan === "semua" ? barisStatus : barisStatus.filter((e) => e.status === saringan)), [barisStatus, saringan]);
  const menungguCatatan = baris.filter((e) => e.status === "menunggu").length;
  const menungguStatus = barisStatus.filter((e) => e.status === "menunggu").length;
  const tampilBi = useMemo(() => (saringan === "semua" ? barisBi : barisBi.filter((e) => e.persetujuan === saringan)), [barisBi, saringan]);
  const menungguBi = barisBi.filter((e) => e.persetujuan === "menunggu").length;
  const jumlahMenunggu = { status: menungguStatus, bi: menungguBi, catatan: menungguCatatan }[tab];

  return (
    <div>
      <PageTitle
        title="Persetujuan"
        subtitle={
          menungguCatatan + menungguStatus + menungguBi > 0
            ? `${menungguCatatan + menungguStatus + menungguBi} pengajuan menunggu keputusan`
            : "Catatan follow-up, pemohon pengganti BI Checking, dan status konsumen"
        }
      />

      <ReadOnlyBanner />

      <div role="tablist" aria-label="Jenis pengajuan" style={{ display: "flex", gap: 4, marginBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
        {[
          { k: "catatan", label: "Catatan Follow Up", n: menungguCatatan },
          { k: "bi", label: "Pemohon BI Checking", n: menungguBi },
          { k: "status", label: "Status Konsumen", n: menungguStatus },
        ].map((t) => {
          const aktif = tab === t.k;
          return (
            <button
              key={t.k}
              role="tab"
              aria-selected={aktif}
              onClick={() => setTab(t.k)}
              style={{
                border: "none",
                borderBottom: `2px solid ${aktif ? ACCENT : "transparent"}`,
                background: "none",
                padding: "9px 14px",
                marginBottom: -1,
                fontSize: 13.5,
                fontWeight: aktif ? 700 : 500,
                color: aktif ? TEXT_DARK : TEXT_MID,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t.label}
              {t.n > 0 && (
                <span style={{ marginLeft: 7, fontSize: 11, fontWeight: 700, background: ACCENT_SOFT, color: ACCENT_DARK, borderRadius: 999, padding: "1px 7px" }}>{t.n}</span>
              )}
            </button>
          );
        })}
      </div>

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

      {tab === "bi" && (
        <>
          {galatBi && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: NEGATIVE }}>Pengajuan pemohon pengganti belum bisa dimuat: {galatBi}. Pastikan migration_028 sudah dijalankan.</div>
            </Card>
          )}
          {!galatBi && tampilBi.length === 0 && (
            <Card>
              <EmptyState
                icon={FileCheck}
                label={saringan === "menunggu" ? "Tidak ada pemohon pengganti yang menunggu" : "Belum ada pengajuan pemohon pengganti di sini"}
                hint="Sales mengajukan pemohon pengganti dari jendela BI Checking setelah hasilnya Tidak Lolos — paling banyak 3 kali per prospek."
              />
            </Card>
          )}
          {tampilBi.map((e) => (
            <KartuPengganti key={e.id} edit={e} disorot={e.id === sorotId} />
          ))}
        </>
      )}

      {tab === "status" && (
        <>
          {galatStatus && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: NEGATIVE }}>Pengajuan status belum bisa dimuat: {galatStatus}. Pastikan migration_027 sudah dijalankan.</div>
            </Card>
          )}
          {!galatStatus && tampilStatus.length === 0 && (
            <Card>
              <EmptyState
                icon={FileCheck}
                label={saringan === "menunggu" ? "Tidak ada pengajuan status yang menunggu" : "Belum ada pengajuan status di sini"}
                hint="Pemegang konsumen mengajukan perubahan status dari kartu konsumen."
              />
            </Card>
          )}
          {tampilStatus.map((e) => (
            <KartuPengajuanStatus key={e.id} edit={e} disorot={e.id === sorotId} />
          ))}
        </>
      )}

      {tab === "catatan" && galat && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: NEGATIVE }}>Data persetujuan belum bisa dimuat: {galat}. Pastikan migration_025 sudah dijalankan.</div>
        </Card>
      )}

      {tab === "catatan" && memuat && <div style={{ fontSize: 13, color: TEXT_MID, padding: "8px 2px" }}>Memuat pengajuan…</div>}

      {tab === "catatan" && !memuat && !galat && tampil.length === 0 && (
        <Card>
          <EmptyState
            icon={FileCheck}
            label={saringan === "menunggu" ? "Tidak ada pengajuan yang menunggu" : "Belum ada pengajuan di sini"}
            hint="Sales mengajukan perubahan (ikon pensil) atau penghapusan (ikon tempat sampah) pada catatan di kartu Riwayat prospek."
          />
        </Card>
      )}

      {tab === "catatan" && tampil.map((e) => {
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
                    {e.jenis === "hapus" && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: NEGATIVE, background: "#FBE9E8", borderRadius: 999, padding: "3px 9px" }}>Hapus catatan</span>
                    )}
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
