import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarClock, PanelRight, History, Ban, MessageSquare, Thermometer, ClipboardCheck, ArrowRightLeft } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import { useAuth } from "../context/AuthContext";
import { canWrite } from "../lib/permissions";
import { tanggal, tanggalRelatif, labelTahap, selisihHari } from "../lib/format";
import KontakAksi from "../components/KontakAksi";
import FollowUpTimeline from "../components/FollowUpTimeline";
import CatatFollowUpModal from "../components/CatatFollowUpModal";
import PilihLeadFollowUp from "../components/PilihLeadFollowUp";
import SaringanAwalModal from "../components/SaringanAwalModal";
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
  ACCENT,
  ACCENT_DARK,
  NEGATIVE,
} from "../components/ui";

/**
 * Follow Up Leads — menu tersendiri, terpisah dari input prospek.
 *
 * BRIEF §Leads: "Meminta pemisahan menu input antara 'Leads' murni dari menu
 * 'Follow Up Leads'."
 *
 * Pemisahannya bukan sekadar kerapian menu. Keduanya adalah dua pekerjaan yang
 * berbeda bentuknya: memasukkan prospek adalah mengetik data baru, satu orang
 * satu kali; menindaklanjuti adalah menyisir antrean — puluhan orang, masing-
 * masing beberapa detik, dan yang dicari selalu sama, yaitu siapa yang harus
 * dihubungi hari ini. Satu halaman yang melayani keduanya akan selalu salah
 * untuk salah satunya.
 *
 * Karena itu halaman ini tidak punya formulir sama sekali. Ia sebuah antrean.
 *
 * Sejak Leads menjadi data mentah saja, seluruh aksi atas prospek tinggal di
 * sini: catat follow-up, survei & BI-Checking, booking, alihkan, batalkan.
 * Semuanya pekerjaan Sales — Admin Marketing melihat antrean ini tetapi tidak
 * menambahkan apa pun (migrasi 023); bagiannya adalah memverifikasi berkas.
 *
 * Antreannya hanya berisi prospek yang sudah pernah di-follow up. Lead yang
 * belum disentuh tetap tinggal di Leads, dan diambil dari sana lewat tombol
 * "+ Follow Up Lead" — follow-up pertamanya yang memindahkannya ke sini.
 */

const SARINGAN = [
  { kunci: "hari_ini", label: "Jatuh tempo hari ini" },
  { kunci: "terlewat", label: "Terlewat" },
  { kunci: "belum_dijadwalkan", label: "Belum dijadwalkan" },
  { kunci: "semua", label: "Semua aktif" },
  { kunci: "selesai", label: "Selesai (Booking/Batal)" },
];

const TAHAP_AKTIF = ["leads", "baru", "cold", "warm", "hot", "dihubungi", "appointment"];

/**
 * Catatan yang bukan hasil menghubungi prospek: pengalihan antaragen dan
 * pemindahan jadwal. Lead yang hanya punya catatan seperti ini masih belum
 * di-follow up, dan "Kontak Terakhir"-nya tidak ikut bergeser.
 */
const BUKAN_KONTAK = ["Prospek dialihkan", "Follow-up dijadwal ulang"];

export default function FollowUpPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [leads, setLeads] = useState([]);
  const [aktivitas, setAktivitas] = useState(new Map());
  const [terkonversi, setTerkonversi] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [saringan, setSaringan] = useState("hari_ini");

  const [fuLead, setFuLead] = useState(null);
  const [saringLead, setSaringLead] = useState(null);
  const [konversiLead, setKonversiLead] = useState(null);
  const [panelLead, setPanelLead] = useState(null);
  const [panelAksi, setPanelAksi] = useState(null);
  const [riwayatId, setRiwayatId] = useState(null);
  const [pilihBuka, setPilihBuka] = useState(false);

  const mayWrite = canWrite(profile, "followup_lead");

  async function muat() {
    setLoading(true);

    // Suhu yang bergantung pada waktu — "didiamkan dua minggu menjadi dingin" —
    // tidak punya peristiwa yang bisa memicunya. Disapu di sini, saat antrean
    // dibuka, karena di sinilah hasilnya akan dibaca.
    await supabase.rpc("refresh_lead_temperature");

    // Seluruh prospek dari Leads, bukan hanya yang aktif: yang sudah booking
    // atau batal tetap harus bisa ditemukan di saringan Selesai, karena di
    // halaman Leads tahapnya tidak lagi ditampilkan.
    const [{ data, error }, custRes] = await Promise.all([
      fetchAllRows(() => supabase.from("leads").select("*").order("tanggal_rencana", { ascending: true, nullsFirst: false })),
      supabase.from("customers").select("id, lead_id").not("lead_id", "is", null),
    ]);

    const semua = error ? [] : data || [];
    if (!error) setLeads(semua);
    setTerkonversi(new Map((custRes.data || []).map((c) => [c.lead_id, c.id])));
    const daftar = semua.filter((l) => TAHAP_AKTIF.includes(l.status));

    // Kontak terakhir per prospek: kolom yang paling sering ditanyakan di
    // antrean ini, dan satu-satunya yang tidak ada di tabel leads.
    //
    // Disaring pada prospek yang benar-benar tampil, bukan diambil seribu baris
    // terbaru lalu disortir di sini. Seribu baris terbaru bisa habis oleh
    // segelintir prospek yang sangat aktif, dan sisanya akan tertulis "belum
    // pernah" padahal riwayatnya ada — kesalahan yang tidak mungkin dikenali
    // dari layar.
    const peta = new Map();
    if (daftar.length > 0) {
      const ids = daftar.map((l) => l.id);
      const { data: akt } = await fetchAllRows(() =>
        supabase
          .from("lead_activities")
          .select("lead_id, tanggal_followup, created_at, hasil, activity")
          .in("lead_id", ids)
          // Menurut kapan prospek dihubungi, bukan kapan catatannya diketik
          // (migrasi 024) — follow-up yang dicatat mundur tidak boleh tampil
          // sebagai kontak terbaru.
          .order("tanggal_followup", { ascending: false })
          .order("created_at", { ascending: false })
      );
      for (const a of akt || []) {
        if (BUKAN_KONTAK.includes(a.activity)) continue;
        if (!peta.has(a.lead_id)) peta.set(a.lead_id, a);
      }
    }
    setAktivitas(peta);
    setLoading(false);
  }

  useEffect(() => {
    muat();
  }, []);

  const baris = useMemo(
    () =>
      leads.map((l) => {
        const terakhir = aktivitas.get(l.id);
        const aktif = TAHAP_AKTIF.includes(l.status);
        // Jadwal prospek yang sudah selesai bukan lagi utang pekerjaan.
        const sisa = aktif && l.tanggal_rencana ? selisihHari(l.tanggal_rencana) : null;
        return {
          ...l,
          aktif,
          sudah_fu: Boolean(terakhir),
          kontak_terakhir: terakhir ? terakhir.tanggal_followup || terakhir.created_at : null,
          hasil_terakhir: terakhir?.hasil || null,
          sisa_hari: sisa,
          diam_hari: terakhir ? -selisihHari(terakhir.tanggal_followup || terakhir.created_at) : null,
        };
      }),
    [leads, aktivitas]
  );

  const tersaring = useMemo(() => {
    if (saringan === "selesai") return baris.filter((r) => !r.aktif);
    const aktif = baris.filter((r) => r.aktif && r.sudah_fu);
    if (saringan === "semua") return aktif;
    if (saringan === "belum_dijadwalkan") return aktif.filter((r) => !r.tanggal_rencana);
    if (saringan === "terlewat") return aktif.filter((r) => r.sisa_hari !== null && r.sisa_hari < 0);
    return aktif.filter((r) => r.sisa_hari !== null && r.sisa_hari <= 0);
  }, [baris, saringan]);

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
      belum: aktif.filter((r) => !r.tanggal_rencana).length,
      panas: aktif.filter((r) => r.status === "hot").length,
    };
  }, [baris]);

  // Datang dari Leads ("Tindak lanjuti di Follow Up Leads"). Lead yang belum
  // pernah di-follow up belum punya baris di antrean, jadi Catat Follow Up
  // langsung terbuka untuknya. Selebihnya panel prospek terbuka, dengan
  // saringan yang memang memuat barisnya — jika tidak, sorotan tabel tidak
  // akan menemukan apa pun.
  const sorotId = params.get("sorot");
  const sudahSorot = useRef(false);
  useEffect(() => {
    if (!sorotId || loading || sudahSorot.current) return;
    sudahSorot.current = true;
    const lead = baris.find((l) => l.id === sorotId);
    if (!lead) return;
    if (lead.aktif && !lead.sudah_fu) {
      if (mayWrite) setFuLead(lead);
      else setPanelLead(lead);
      return;
    }
    setSaringan(lead.aktif ? "semua" : "selesai");
    setPanelLead(lead);
  }, [sorotId, loading, baris]);

  const riwayatLead = baris.find((l) => l.id === riwayatId) || null;
  // Panel membaca baris terbaru: setelah Catat Follow Up, status dan jadwalnya
  // harus langsung berubah di panel yang masih terbuka.
  const panelSegar = panelLead ? baris.find((l) => l.id === panelLead.id) || panelLead : null;

  return (
    <div>
      <PageTitle
        title="Follow Up Leads"
        subtitle="Prospek yang sedang diproses — lead dari menu Leads masuk ke sini setelah follow-up pertamanya"
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
        <StatCard icon={Thermometer} label="Hot Lead" value={hitung.panas} sub="dibaca dari progres interaksi" />
        <StatCard icon={ClipboardCheck} label="Belum Dijadwalkan" value={hitung.belum} sub="tidak akan muncul di lonceng" />
      </div>

      <Card style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: TEXT_MID, marginRight: 2 }}>Tampilkan</span>
          {SARINGAN.map((s) => (
            <button
              key={s.kunci}
              onClick={() => setSaringan(s.kunci)}
              style={{
                padding: "7px 14px",
                borderRadius: 999,
                border: `1px solid ${saringan === s.kunci ? PRIMARY : BORDER}`,
                background: saringan === s.kunci ? PRIMARY : "#fff",
                color: saringan === s.kunci ? "#fff" : TEXT_MID,
                fontSize: 12.5,
                fontWeight: saringan === s.kunci ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <DataTable
          loading={loading}
          sortable
          searchable
          searchPlaceholder="Cari prospek — nama, telepon, rencana…"
          searchExtra={(row) => [row.notes, row.rencana_selanjutnya, row.hasil_terakhir].filter(Boolean).join(" ")}
          highlightId={params.get("sorot") || undefined}
          onRowClick={(row) => setPanelLead(row)}
          pageSize={25}
          emptyIcon={CalendarClock}
          emptyLabel={saringan === "selesai" ? "Belum ada prospek yang selesai" : "Tidak ada yang perlu ditindaklanjuti"}
          emptyHint={
            saringan === "selesai"
              ? "Prospek yang sudah booking atau dibatalkan akan muncul di sini."
              : saringan === "semua"
                ? "Belum ada prospek yang sedang di-follow up. Mulai dengan tombol + Follow Up Lead."
                : "Antrean kosong berarti setiap prospek yang sedang di-follow up sudah punya jadwal di masa depan."
          }
          columns={[
            { key: "name", label: "Nama / Username" },
            {
              key: "phone",
              label: "Kontak",
              sortable: false,
              render: (row) => <KontakAksi phone={row.phone} nama={row.name} tahap={row.status} leadId={row.id} onCatat={muat} />,
            },
            {
              key: "status",
              label: "Status",
              // Dibaca, bukan dipilih. Sebuah dropdown di sini akan
              // mengembalikan persis kesalahan yang brief minta dihilangkan.
              render: (row) => (
                <span title="Ditentukan sistem dari riwayat follow-up">
                  <Badge value={row.status} label={labelTahap(row.status)} />
                </span>
              ),
            },
            {
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
                  <span style={{ fontSize: 12, color: ACCENT_DARK, fontWeight: 600 }}>belum dijadwalkan</span>
                ),
            },
            {
              key: "kontak_terakhir",
              label: "Kontak Terakhir",
              render: (row) =>
                // Kontak terakhir hanya dimuat untuk prospek aktif; yang sudah
                // selesai tidak boleh tertulis "belum pernah".
                !row.aktif ? (
                  <span style={{ fontSize: 12, color: TEXT_MID }}>-</span>
                ) : row.kontak_terakhir ? (
                  <span style={{ fontSize: 12, color: row.diam_hari > 14 ? NEGATIVE : TEXT_MID, whiteSpace: "nowrap" }}>
                    {tanggal(row.kontak_terakhir)}
                    {row.diam_hari != null && ` · ${row.diam_hari} hr`}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: TEXT_MID }}>belum pernah</span>
                ),
            },
            { key: "hasil_terakhir", label: "Hasil Terakhir", render: (row) => row.hasil_terakhir || "-" },
            {
              key: "saringan",
              label: "Saringan Awal",
              sortable: false,
              // Survei dan BI-Checking sebelum booking (BRIEF §Progres KPR).
              // Ditampilkan di antrean ini karena di sinilah keputusannya lahir.
              render: (row) => (
                <span style={{ display: "inline-flex", gap: 5, whiteSpace: "nowrap" }}>
                  <Tanda aktif={Boolean(row.tanggal_survei)} label="Survei" />
                  <Tanda
                    aktif={row.bi_checking_status === "lolos"}
                    gagal={row.bi_checking_status === "tidak_lolos"}
                    label="BI"
                  />
                </span>
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
                      <button onClick={() => setFuLead(row)} style={gayaUtama} title="Catat hasil follow-up dan jadwalkan langkah berikutnya">
                        Catat Follow Up
                      </button>
                    ) : konsumenId ? (
                      <button onClick={() => navigate(`/konsumen/${konsumenId}`)} style={gayaKecil}>
                        Lihat Konsumen
                      </button>
                    ) : null}
                    <MenuAksi
                      items={[
                        { label: "Buka panel", ikon: PanelRight, onClick: () => setPanelLead(row) },
                        { label: "Riwayat komunikasi", ikon: History, onClick: () => setRiwayatId(riwayatId === row.id ? null : row.id) },
                        bisaAksi && { label: "Survei & BI-Checking", ikon: ClipboardCheck, onClick: () => setSaringLead(row) },
                        bisaAksi && !konsumenId && { label: "Konversi ke Booking", ikon: ClipboardCheck, onClick: () => setKonversiLead(row) },
                        bisaAksi && { label: "Alihkan ke agen lain", ikon: ArrowRightLeft, onClick: () => setPanelAksi({ lead: row, aksi: "alih" }) },
                        bisaAksi && { label: "Batalkan prospek", ikon: Ban, onClick: () => setPanelAksi({ lead: row, aksi: "batal" }), pisah: true, rusak: true },
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

      {riwayatLead && <FollowUpTimeline leadId={riwayatLead.id} title={`Riwayat Komunikasi — ${riwayatLead.name}`} />}

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
        onSelesai={() => {
          // Follow-up pertama biasanya dijadwalkan ke hari lain, sehingga lead
          // yang baru masuk antrean tidak tampak di saringan "jatuh tempo" —
          // tanpa ini ia terlihat seperti hilang.
          if (fuLead && !fuLead.sudah_fu) setSaringan("semua");
          muat();
        }}
      />

      <SaringanAwalModal lead={saringLead} open={Boolean(saringLead)} onClose={() => setSaringLead(null)} onSelesai={muat} />

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

function Tanda({ aktif, gagal, label }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        background: gagal ? "#FBE9E8" : aktif ? "#E4F2E8" : "#F1F4F9",
        color: gagal ? NEGATIVE : aktif ? "#166534" : TEXT_MID,
      }}
    >
      {label}
    </span>
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
