import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarClock, PanelRight, Ban, MessageSquare, Thermometer, ClipboardCheck, ArrowRightLeft, FilePen, MapPin, ShieldCheck, UserPlus } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import { useAuth } from "../context/AuthContext";
import { canWrite } from "../lib/permissions";
import { tanggal, tanggalRelatif, labelTahap, selisihHari } from "../lib/format";
import KontakAksi from "../components/KontakAksi";
import CatatFollowUpModal from "../components/CatatFollowUpModal";
import SurveiModal from "../components/SurveiModal";
import BiCheckingModal from "../components/BiCheckingModal";
import PilihLeadFollowUp from "../components/PilihLeadFollowUp";
import { EVENT_PENGAJUAN } from "../components/TinjauPengajuan";
import KonversiBookingModal from "../components/KonversiBookingModal";
import PanelProspek, { ModalBatal, ModalAlih } from "../components/PanelProspek";
import {
  Card,
  PageTitle,
  PrimaryButton,
  DataTable,
  Badge,
  StatCard,
  MenuAksi,
  RowActions,
  ReadOnlyBanner,
  BORDER,
  TEXT_MID,
  TEXT_DARK,
  PRIMARY,
  PRIMARY_SOFT,
  ACCENT,
  ACCENT_SOFT,
  ACCENT_DARK,
  NEGATIVE,
  POSITIVE,
} from "../components/ui";

/**
 * Follow Up Leads — tempat proses berlangsung.
 *
 * Leads hanya menyimpan data mentah; di sinilah setiap prospek naik level,
 * mengikuti alur klien:
 *
 *   Leads masuk → Chat (follow up) → Survei → BI Checking → Booking
 *
 * Kolom Progres membaca level itu langsung dari data — hasil chat terakhir,
 * lalu "Sudah Survei", lalu hasil BI Checking — sehingga saringan awal tidak
 * perlu kolom sendiri. Status Warm/Hot/Cold tetap ditentukan sistem dari
 * riwayat follow-up.
 *
 * Setiap langkah punya jendelanya sendiri (menu titik tiga): Chat Follow Up
 * (catatan + riwayat chat), Survei (tanggal, foto, catatan), BI Checking (KTP,
 * hasil, Lolos/Tidak Lolos), dan Konversi ke Booking. Semuanya pekerjaan Sales —
 * Admin Marketing melihat antrean ini tetapi tidak menambahkan apa pun
 * (migrasi 023).
 *
 * Lead yang belum pernah disentuh terlihat lewat saringan "Belum di-follow
 * up"; follow-up pertamanya yang memindahkannya ke antrean aktif.
 */

const SARINGAN = [
  { kunci: "hari_ini", label: "Jatuh tempo hari ini" },
  { kunci: "terlewat", label: "Terlewat" },
  { kunci: "belum_fu", label: "Belum di-follow up" },
  { kunci: "belum_dijadwalkan", label: "Belum dijadwalkan" },
  { kunci: "semua", label: "Semua aktif" },
  { kunci: "selesai", label: "Selesai (Booking/Batal)" },
];

const TAHAP_AKTIF = ["leads", "baru", "cold", "warm", "hot", "dihubungi", "appointment"];

/**
 * Catatan yang bukan hasil menghubungi prospek: pengalihan antaragen dan
 * pemindahan jadwal. Lead yang hanya punya catatan seperti ini masih belum
 * di-follow up.
 */
const BUKAN_KONTAK = ["Prospek dialihkan", "Follow-up dijadwal ulang"];

/** Catatan yang mewakili langkahnya sendiri, bukan isi chat. */
const BUKAN_CHAT = [...BUKAN_KONTAK, "Survei Lokasi", "BI Checking"];

/** Baris pertama catatan, tanpa "Rencana: …" yang ditambahkan catat_followup(). */
function ringkasCatatan(note) {
  const baris = String(note || "")
    .split("\n")
    .map((b) => b.trim())
    .filter((b) => b && !b.startsWith("Rencana:"));
  return baris[0] || "";
}

/**
 * Level progres satu prospek. Yang lebih tinggi menang: prospek yang sudah
 * BI Checking tidak lagi ditampilkan sebagai "Sudah Survei", meski benar.
 */
function bacaProgres(row) {
  if (!row.aktif) return { level: -1, label: labelTahap(row.status), nada: "redup" };
  if (row.bi_checking_status === "lolos") return { level: 4, label: "BI Checking · Lolos", nada: "positif" };
  if (row.bi_checking_status === "tidak_lolos") return { level: 4, label: "BI Checking · Tidak Lolos", nada: "negatif" };
  if (row.bi_checking_status === "menunggu") return { level: 3, label: "BI Checking · Menunggu hasil", nada: "aksen" };
  if (row.tanggal_survei) return { level: 2, label: "Sudah Survei", nada: "primer" };
  if (row.chat_terakhir) return { level: 1, label: row.chat_terakhir, nada: "netral" };
  if (row.sudah_fu) return { level: 1, label: "Sudah di-follow up", nada: "netral" };
  return { level: 0, label: "Belum di-follow up", nada: "aksen" };
}

const WARNA_NADA = {
  positif: { bg: "#E4F2E8", fg: POSITIVE },
  negatif: { bg: "#FBE9E8", fg: NEGATIVE },
  aksen: { bg: ACCENT_SOFT, fg: ACCENT_DARK },
  primer: { bg: PRIMARY_SOFT, fg: PRIMARY },
};

export default function FollowUpPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [leads, setLeads] = useState([]);
  const [aktivitas, setAktivitas] = useState(new Map());
  const [chat, setChat] = useState(new Map());
  const [terkonversi, setTerkonversi] = useState(new Map());
  const [pengajuan, setPengajuan] = useState(new Map());
  const [loading, setLoading] = useState(true);
  // Lonceng dan pengingat jadwal terlewat membuka halaman ini lewat
  // ?saringan=terlewat — langsung ke daftar yang dimaksud.
  const [saringan, setSaringan] = useState(() => (SARINGAN.some((s) => s.kunci === params.get("saringan")) ? params.get("saringan") : "hari_ini"));

  // Sudah di halaman ini lalu datang lagi dari lonceng atau pengingat.
  const saringanUrl = params.get("saringan");
  useEffect(() => {
    if (SARINGAN.some((s) => s.kunci === saringanUrl)) setSaringan(saringanUrl);
  }, [saringanUrl]);

  const [fuLead, setFuLead] = useState(null);
  const [surveiLead, setSurveiLead] = useState(null);
  const [biLead, setBiLead] = useState(null);
  const [konversiLead, setKonversiLead] = useState(null);
  const [panelLead, setPanelLead] = useState(null);
  const [panelAksi, setPanelAksi] = useState(null);
  const [pilihBuka, setPilihBuka] = useState(false);

  const mayWrite = canWrite(profile, "followup_lead");
  const bolehPutus = canWrite(profile, "catatan_putus");

  /**
   * Prospek yang punya pengajuan perubahan catatan menunggu (migrasi 025),
   * supaya terlihat langsung dari antrean. Sebelum migrasinya jalan, peta kosong.
   */
  async function muatPengajuan() {
    const { data, error } = await supabase.from("lead_activity_edits").select("lead_id").eq("status", "menunggu");
    const peta = new Map();
    for (const e of error ? [] : data || []) peta.set(e.lead_id, (peta.get(e.lead_id) || 0) + 1);
    setPengajuan(peta);
  }

  useEffect(() => {
    muatPengajuan();
    window.addEventListener(EVENT_PENGAJUAN, muatPengajuan);
    return () => window.removeEventListener(EVENT_PENGAJUAN, muatPengajuan);
  }, []);

  async function muat() {
    setLoading(true);

    // Suhu yang bergantung pada waktu — "didiamkan dua minggu menjadi dingin" —
    // tidak punya peristiwa yang bisa memicunya. Disapu di sini, saat antrean
    // dibuka, karena di sinilah hasilnya akan dibaca.
    await supabase.rpc("refresh_lead_temperature");

    const [{ data, error }, custRes] = await Promise.all([
      fetchAllRows(() => supabase.from("leads").select("*").order("tanggal_rencana", { ascending: true, nullsFirst: false })),
      supabase.from("customers").select("id, lead_id").not("lead_id", "is", null),
    ]);

    const semua = error ? [] : data || [];
    if (!error) setLeads(semua);
    setTerkonversi(new Map((custRes.data || []).map((c) => [c.lead_id, c.id])));
    const daftar = semua.filter((l) => TAHAP_AKTIF.includes(l.status));

    // Kontak terakhir dan chat terakhir per prospek — disaring pada prospek
    // yang benar-benar tampil, supaya segelintir prospek yang sangat aktif
    // tidak menghabiskan seluruh jatah baris.
    const petaKontak = new Map();
    const petaChat = new Map();
    if (daftar.length > 0) {
      const ids = daftar.map((l) => l.id);
      const { data: akt } = await fetchAllRows(() =>
        supabase
          .from("lead_activities")
          .select("lead_id, tanggal_followup, created_at, hasil, activity, note")
          .in("lead_id", ids)
          // Menurut kapan prospek dihubungi, bukan kapan catatannya diketik
          // (migrasi 024).
          .order("tanggal_followup", { ascending: false })
          .order("created_at", { ascending: false })
      );
      for (const a of akt || []) {
        if (BUKAN_KONTAK.includes(a.activity)) continue;
        if (!petaKontak.has(a.lead_id)) petaKontak.set(a.lead_id, a);
        if (!BUKAN_CHAT.includes(a.activity) && !petaChat.has(a.lead_id)) petaChat.set(a.lead_id, a);
      }
    }
    setAktivitas(petaKontak);
    setChat(petaChat);
    setLoading(false);
  }

  useEffect(() => {
    muat();
  }, []);

  const baris = useMemo(
    () =>
      leads.map((l) => {
        const terakhir = aktivitas.get(l.id);
        const c = chat.get(l.id);
        const aktif = TAHAP_AKTIF.includes(l.status);
        // Jadwal prospek yang sudah selesai bukan lagi utang pekerjaan.
        const sisa = aktif && l.tanggal_rencana ? selisihHari(l.tanggal_rencana) : null;
        const r = {
          ...l,
          aktif,
          sudah_fu: Boolean(terakhir),
          kontak_terakhir: terakhir ? terakhir.tanggal_followup || terakhir.created_at : null,
          chat_terakhir: c ? c.hasil || ringkasCatatan(c.note) || c.activity : null,
          chat_lengkap: c ? [c.activity, c.hasil, ringkasCatatan(c.note)].filter(Boolean).join(" · ") : null,
          sisa_hari: sisa,
          diam_hari: terakhir ? -selisihHari(terakhir.tanggal_followup || terakhir.created_at) : null,
        };
        return { ...r, progres: bacaProgres(r) };
      }),
    [leads, aktivitas, chat]
  );

  // Pengajuan terakhir sudah diputuskan: tombol saringannya hilang, jadi
  // jangan tinggalkan tabel kosong di saringan yang tidak lagi terlihat.
  useEffect(() => {
    if (saringan === "pengajuan" && pengajuan.size === 0) setSaringan("semua");
  }, [saringan, pengajuan]);

  const tersaring = useMemo(() => {
    if (saringan === "pengajuan") return baris.filter((r) => pengajuan.has(r.id));
    if (saringan === "selesai") return baris.filter((r) => !r.aktif);
    if (saringan === "belum_fu") return baris.filter((r) => r.aktif && !r.sudah_fu);
    const aktif = baris.filter((r) => r.aktif && r.sudah_fu);
    if (saringan === "semua") return aktif;
    if (saringan === "belum_dijadwalkan") return aktif.filter((r) => !r.tanggal_rencana);
    if (saringan === "terlewat") return aktif.filter((r) => r.sisa_hari !== null && r.sisa_hari < 0);
    return aktif.filter((r) => r.sisa_hari !== null && r.sisa_hari <= 0);
  }, [baris, saringan, pengajuan]);

  // Kolam lead yang belum pernah di-follow up — isi daftar "+ Follow Up Lead".
  const belumFu = useMemo(
    () => baris.filter((r) => r.aktif && !r.sudah_fu).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
    [baris]
  );

  const hitung = useMemo(() => {
    const aktif = baris.filter((r) => r.aktif && r.sudah_fu);
    return {
      terlewat: aktif.filter((r) => r.sisa_hari !== null && r.sisa_hari < 0).length,
      hari_ini: aktif.filter((r) => r.sisa_hari === 0).length,
      belum_dijadwalkan: aktif.filter((r) => !r.tanggal_rencana).length,
      panas: aktif.filter((r) => r.status === "hot").length,
    };
  }, [baris]);

  const angkaSaringan = { terlewat: hitung.terlewat, belum_fu: belumFu.length, belum_dijadwalkan: hitung.belum_dijadwalkan };

  // Datang dari Leads ("Tindak lanjuti di Follow Up Leads"). Lead yang belum
  // pernah di-follow up langsung dibukakan Chat Follow Up. Selebihnya panel
  // prospek terbuka, dengan saringan yang memang memuat barisnya.
  const sorotId = params.get("sorot");
  const sudahSorot = useRef(false);
  useEffect(() => {
    if (!sorotId || loading || sudahSorot.current) return;
    sudahSorot.current = true;
    const lead = baris.find((l) => l.id === sorotId);
    if (!lead) return;
    if (lead.aktif && !lead.sudah_fu) {
      setSaringan("belum_fu");
      if (mayWrite) setFuLead(lead);
      else setPanelLead(lead);
      return;
    }
    setSaringan(lead.aktif ? "semua" : "selesai");
    setPanelLead(lead);
  }, [sorotId, loading, baris]);

  // Panel membaca baris terbaru: setelah sebuah langkah tersimpan, status dan
  // progresnya harus langsung berubah di panel yang masih terbuka.
  const panelSegar = panelLead ? baris.find((l) => l.id === panelLead.id) || panelLead : null;

  /** Survei dan Cancel dipilih dari dalam Chat Follow Up: jendelanya berganti. */
  function pindahDariChat(lead, langkah) {
    setFuLead(null);
    if (langkah === "survei") setSurveiLead(lead);
    if (langkah === "batal") setPanelAksi({ lead, aksi: "batal" });
  }

  return (
    <div>
      <PageTitle
        title="Follow Up Leads"
        subtitle="Leads → Chat → Survei → BI Checking → Booking. Status Warm/Hot/Cold dibaca sistem dari riwayat follow-up."
        action={
          mayWrite && (
            <PrimaryButton onClick={() => setPilihBuka(true)} title="Pilih lead yang belum pernah di-follow up">
              + Follow Up Lead
              {belumFu.length > 0 && (
                <span style={{ marginLeft: 8, background: "rgba(255,255,255,0.25)", borderRadius: 999, padding: "1px 8px", fontSize: 12 }}>
                  {belumFu.length}
                </span>
              )}
            </PrimaryButton>
          )
        }
      />

      <ReadOnlyBanner />

      <div className="rg-4" style={{ marginBottom: 16 }}>
        <StatCard icon={CalendarClock} label="Terlewat" value={hitung.terlewat} sub="perlu dikejar hari ini" />
        <StatCard icon={MessageSquare} label="Jatuh Tempo Hari Ini" value={hitung.hari_ini} />
        <StatCard icon={UserPlus} label="Belum Di-follow Up" value={belumFu.length} sub="lead baru dari menu Leads" />
        <StatCard icon={Thermometer} label="Hot Lead" value={hitung.panas} sub="dibaca dari progres interaksi" />
      </div>

      <Card style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: TEXT_MID, marginRight: 2 }}>Tampilkan</span>
          {/* Saringan khusus penyetuju, dan hanya bila ada yang perlu diputuskan. */}
          {[...SARINGAN, ...(bolehPutus && pengajuan.size > 0 ? [{ kunci: "pengajuan", label: `Ada pengajuan · ${pengajuan.size}` }] : [])].map((s) => {
            const aktif = saringan === s.kunci;
            const angka = angkaSaringan[s.kunci];
            return (
              <button
                key={s.kunci}
                onClick={() => setSaringan(s.kunci)}
                aria-pressed={aktif}
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
                {angka > 0 ? ` · ${angka}` : ""}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <DataTable
          loading={loading}
          sortable
          searchable
          searchPlaceholder="Cari prospek — nama, telepon, isi chat…"
          searchExtra={(row) => [row.notes, row.rencana_selanjutnya, row.chat_lengkap, row.unit_diminati, row.progres.label].filter(Boolean).join(" ")}
          highlightId={params.get("sorot") || undefined}
          onRowClick={(row) => setPanelLead(row)}
          pageSize={25}
          emptyIcon={CalendarClock}
          emptyLabel={
            saringan === "selesai"
              ? "Belum ada prospek yang selesai"
              : saringan === "belum_fu"
              ? "Semua lead sudah di-follow up"
              : "Tidak ada yang perlu ditindaklanjuti"
          }
          emptyHint={
            saringan === "selesai"
              ? "Prospek yang sudah booking atau dibatalkan akan muncul di sini."
              : saringan === "belum_fu"
              ? "Lead baru dari menu Leads akan muncul di sini sampai follow-up pertamanya dicatat."
              : saringan === "semua"
              ? "Belum ada prospek yang sedang di-follow up. Mulai dari saringan Belum di-follow up."
              : "Antrean kosong berarti setiap prospek yang sedang di-follow up sudah punya jadwal di masa depan."
          }
          columns={[
            {
              key: "name",
              label: "Nama / Username",
              render: (row) => (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  {row.name}
                  {pengajuan.has(row.id) && (
                    <span
                      title={`${pengajuan.get(row.id)} pengajuan catatan menunggu persetujuan Admin`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, background: ACCENT_SOFT, color: ACCENT_DARK, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}
                    >
                      <FilePen size={10} aria-hidden="true" />
                      Pengajuan
                    </span>
                  )}
                </span>
              ),
            },
            {
              key: "phone",
              label: "Kontak",
              sortable: false,
              render: (row) => <KontakAksi phone={row.phone} nama={row.name} tahap={row.status} leadId={row.id} onCatat={muat} />,
            },
            {
              key: "status",
              label: "Status",
              // Dibaca, bukan dipilih: suhu ditentukan sistem dari riwayat.
              render: (row) => (
                <span title="Ditentukan sistem dari riwayat follow-up">
                  <Badge value={row.status} label={labelTahap(row.status)} />
                </span>
              ),
            },
            {
              key: "progres",
              label: "Progres",
              sortValue: (row) => row.progres.level,
              render: (row) => <SelProgres row={row} />,
            },
            {
              // Paling kanan, tepat di samping aksinya: yang dibaca terakhir
              // sebelum menekan Chat Follow Up adalah kapan seharusnya.
              key: "tanggal_rencana",
              label: "Jadwal",
              render: (row) =>
                !row.aktif ? (
                  <span style={{ fontSize: 12, color: TEXT_MID }}>-</span>
                ) : row.tanggal_rencana ? (
                  <span
                    title={row.rencana_selanjutnya || ""}
                    style={{ fontSize: 12, fontWeight: 600, color: warnaJadwal(row.sisa_hari), whiteSpace: "nowrap" }}
                  >
                    {tanggalRelatif(row.tanggal_rencana)}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: ACCENT_DARK, fontWeight: 600, whiteSpace: "nowrap" }}>belum dijadwalkan</span>
                ),
            },
            {
              key: "aksi",
              label: "",
              sortable: false,
              render: (row) => {
                const konsumenId = terkonversi.get(row.id);
                const bisaAksi = mayWrite && row.aktif;
                return (
                  <RowActions>
                    {bisaAksi ? (
                      <button onClick={() => setFuLead(row)} style={gayaUtama} title="Riwayat chat dan catat follow-up berikutnya">
                        Chat Follow Up
                      </button>
                    ) : konsumenId ? (
                      <button onClick={() => navigate(`/konsumen/${konsumenId}`)} style={gayaKecil}>
                        Lihat Konsumen
                      </button>
                    ) : null}
                    <MenuAksi
                      items={[
                        { label: "Buka panel", ikon: PanelRight, onClick: () => setPanelLead(row) },
                        bisaAksi && { label: "Chat Follow Up", ikon: MessageSquare, onClick: () => setFuLead(row) },
                        bisaAksi && { label: "Survei", ikon: MapPin, onClick: () => setSurveiLead(row) },
                        bisaAksi && { label: "BI Checking", ikon: ShieldCheck, onClick: () => setBiLead(row) },
                        bisaAksi && !konsumenId && { label: "Konversi ke Booking", ikon: ClipboardCheck, onClick: () => setKonversiLead(row), pisah: true },
                        bisaAksi && { label: "Alihkan ke agen lain", ikon: ArrowRightLeft, onClick: () => setPanelAksi({ lead: row, aksi: "alih" }), pisah: true },
                        bisaAksi && { label: "Batalkan prospek", ikon: Ban, onClick: () => setPanelAksi({ lead: row, aksi: "batal" }), rusak: true },
                      ]}
                    />
                  </RowActions>
                );
              },
            },
          ]}
          rows={tersaring}
        />
      </Card>

      <PilihLeadFollowUp
        open={pilihBuka}
        leads={belumFu}
        onClose={() => setPilihBuka(false)}
        onPilih={(lead) => {
          setPilihBuka(false);
          setFuLead(lead);
        }}
      />

      <CatatFollowUpModal
        lead={fuLead}
        open={Boolean(fuLead)}
        onClose={() => setFuLead(null)}
        onPindah={(langkah) => pindahDariChat(fuLead, langkah)}
        onSelesai={() => {
          // Follow-up pertama biasanya dijadwalkan ke hari lain, sehingga lead
          // yang baru masuk antrean tidak tampak di saringan "jatuh tempo" —
          // tanpa ini ia terlihat seperti hilang.
          if (fuLead && !fuLead.sudah_fu) setSaringan("semua");
          muat();
        }}
      />

      <SurveiModal lead={surveiLead} open={Boolean(surveiLead)} onClose={() => setSurveiLead(null)} onSelesai={muat} />
      <BiCheckingModal lead={biLead} open={Boolean(biLead)} onClose={() => setBiLead(null)} onSelesai={muat} />

      <KonversiBookingModal
        lead={konversiLead}
        open={Boolean(konversiLead)}
        onClose={() => setKonversiLead(null)}
        onSelesai={muat}
      />

      <PanelProspek
        lead={panelSegar}
        open={Boolean(panelLead)}
        onClose={() => setPanelLead(null)}
        onSelesai={muat}
        konsumenId={panelSegar ? terkonversi.get(panelSegar.id) : null}
        sumberLabel={panelSegar?.source_type || ""}
        onKonversi={() => setKonversiLead(panelSegar)}
        onUbahTahap={() => setFuLead(panelSegar)}
        onSurvei={() => setSurveiLead(panelSegar)}
        onBiChecking={() => setBiLead(panelSegar)}
        // Data awal dikoreksi di Leads — formulirnya langsung terbuka di sana.
        onUbahData={() => navigate(`/prospek?ubah=${panelSegar.id}`)}
      />

      <ModalBatal
        open={panelAksi?.aksi === "batal"}
        lead={panelAksi?.lead || null}
        onClose={() => setPanelAksi(null)}
        onSelesai={muat}
      />
      <ModalAlih
        open={panelAksi?.aksi === "alih"}
        lead={panelAksi?.lead || null}
        onClose={() => setPanelAksi(null)}
        onSelesai={muat}
      />
    </div>
  );
}

/**
 * Progres satu prospek: label levelnya, dan di bawahnya kapan terakhir
 * dihubungi — yang dulu satu kolom sendiri, "Kontak Terakhir". Diam lebih
 * dari dua minggu ditulis merah: itulah batas prospek menjadi dingin.
 */
function SelProgres({ row }) {
  const p = row.progres;
  const w = WARNA_NADA[p.nada];
  return (
    <div style={{ minWidth: 0, maxWidth: 260 }}>
      {w ? (
        <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, background: w.bg, color: w.fg, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>
          {p.label}
        </span>
      ) : (
        <span
          title={row.chat_lengkap || ""}
          style={{ display: "block", fontSize: 12, color: p.nada === "redup" ? TEXT_MID : TEXT_DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {p.level === 1 && <MessageSquare size={11} style={{ marginRight: 5, verticalAlign: -1, color: TEXT_MID }} aria-hidden="true" />}
          {p.label}
        </span>
      )}
      {row.aktif && row.kontak_terakhir && (
        <div style={{ fontSize: 11, color: row.diam_hari > 14 ? NEGATIVE : TEXT_MID, marginTop: 3, whiteSpace: "nowrap" }}>
          kontak {tanggal(row.kontak_terakhir)}
          {row.diam_hari != null && ` · ${row.diam_hari} hr`}
        </div>
      )}
    </div>
  );
}

/** Jadwal yang lewat harus terbaca sebagai utang pekerjaan, bukan sekadar tanggal. */
function warnaJadwal(sisa) {
  if (sisa === null || sisa === undefined) return TEXT_MID;
  if (sisa < 0) return NEGATIVE;
  if (sisa <= 2) return ACCENT_DARK;
  return TEXT_DARK;
}

const gayaKecil = {
  border: `1px solid ${BORDER}`,
  background: "#fff",
  color: TEXT_DARK,
  borderRadius: 9,
  padding: "5px 11px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const gayaUtama = {
  border: "none",
  background: ACCENT,
  color: "#fff",
  borderRadius: 9,
  padding: "5px 11px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
