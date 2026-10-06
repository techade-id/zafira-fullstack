import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Target, PanelRight, History, ClipboardCheck, Pencil, ArrowRightLeft, Ban, Trash2, MessageSquare } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canWrite } from "../lib/permissions";
import { tanggal, tanggalRelatif, labelTahap } from "../lib/format";
import FollowUpTimeline from "../components/FollowUpTimeline";
import KontakAksi from "../components/KontakAksi";
import KonversiBookingModal from "../components/KonversiBookingModal";
import CatatFollowUpModal from "../components/CatatFollowUpModal";
import SaringanAwalModal from "../components/SaringanAwalModal";
import ModalProspek, { SOURCE_TYPES, EVENT_TERSIMPAN } from "../components/ModalProspek";
import PanelProspek, { ModalBatal, ModalAlih } from "../components/PanelProspek";
import {
  Card,
  PageTitle,
  PrimaryButton,
  DataTable,
  Badge,
  BORDER,
  TEXT_MID,
  TEXT_DARK,
  PRIMARY,
  ACCENT,
  ACCENT_DARK,
  NEGATIVE,
  RowActions,
  MenuAksi,
  ConfirmDialog,
  PRIMARY_MUTED,
  ReadOnlyBanner,
} from "../components/ui";

/**
 * Funnel PRD §4.2 — seluruhnya kini ditulis sistem.
 *
 * Tahap Booking ke atas sudah sejak dulu datang dari trigger (kuitansi, tanggal
 * KPR, handover). Yang berubah dengan BRIEF §Leads adalah empat tahap pertama:
 * suhu prospek tidak lagi dipilih Sales dari dropdown, melainkan dibaca sistem
 * dari riwayat follow-up — "agar mengurangi human error dalam kategorisasi".
 *
 * Karena itu halaman ini tidak lagi punya satu pun kontrol pengubah tahap.
 * Yang menggerakkannya ada di menu Follow Up Leads, tempat catatannya ditulis.
 */
const SUHU_OTOMATIS = ["leads", "baru", "cold", "warm", "hot", "dihubungi", "appointment"];
const AUTO_STAGES = ["booking", "kpr", "akad", "aftersales"];

const STAGE_LABELS = {
  leads: "New Lead",
  cold: "Cold",
  warm: "Warm Lead",
  hot: "Hot Lead",
  booking: "Booking",
  kpr: "KPR",
  akad: "Akad",
  aftersales: "Aftersales",
  cancel: "Cancel",
  // Retired values that may still sit on old rows.
  baru: "New Lead",
  dihubungi: "Warm Lead",
  appointment: "Hot Lead",
  deal: "Booking",
  closing: "Booking",
};

const SOURCE_LABELS = { ads: "Ads", freelance: "Freelance", kemitraan: "Kemitraan", organik: "Organik" };

export default function ProspekPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [leads, setLeads] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [partners, setPartners] = useState([]);
  const [terkonversi, setTerkonversi] = useState(new Map());
  const [loading, setLoading] = useState(true);

  // null = tertutup, { lead: null } = prospek baru, { lead } = ubah data.
  const [formulir, setFormulir] = useState(null);

  const [openLeadId, setOpenLeadId] = useState(params.get("sorot") || null);
  const [konversiLead, setKonversiLead] = useState(null);
  const [tahapLead, setTahapLead] = useState(null);
  const [saringLead, setSaringLead] = useState(null);
  const [panelLead, setPanelLead] = useState(null);
  const [panelAksi, setPanelAksi] = useState(null);
  const [hapusLead, setHapusLead] = useState(null);
  const [hapusSibuk, setHapusSibuk] = useState(false);
  const [hapusGalat, setHapusGalat] = useState("");

  const mayWrite = canWrite(profile, "lead");

  async function fetchLeads() {
    setLoading(true);
    const [{ data, error: leadError }, campaignRes, partnerRes, custRes] = await Promise.all([
      fetchAllRows(() => supabase.from("leads").select("*").order("created_at", { ascending: false })),
      supabase.from("ads_campaigns").select("id, name, platform").eq("is_active", true).order("name"),
      supabase.from("partners").select("id, name, type").eq("is_active", true).order("name"),
      // Prospek yang sudah punya konsumen tidak boleh ditawari konversi lagi —
      // RPC-nya memang menolak, tetapi menawarkan tombol yang pasti gagal itu
      // sendiri sudah salah.
      supabase.from("customers").select("id, lead_id").not("lead_id", "is", null),
    ]);
    if (!leadError) setLeads(data);
    // These two tables arrive with migration_009; until it runs the page still
    // works, it just has no relational sources to offer.
    setCampaigns(campaignRes.data || []);
    setPartners(partnerRes.data || []);
    setTerkonversi(new Map((custRes.data || []).map((c) => [c.lead_id, c.id])));
    setLoading(false);
  }

  useEffect(() => {
    fetchLeads();
  }, []);

  // Prospek bisa dicatat dari tombol + di header saat halaman ini terbuka;
  // daftarnya ikut segar dari mana pun simpanannya datang.
  useEffect(() => {
    const segarkan = () => fetchLeads();
    window.addEventListener(EVENT_TERSIMPAN, segarkan);
    return () => window.removeEventListener(EVENT_TERSIMPAN, segarkan);
  }, []);

  /** Sorot baris yang baru disimpan — DataTable membawa ke halamannya dan menggulirnya. */
  function sorot(id) {
    if (!id) return;
    const p = new URLSearchParams(params);
    p.set("sorot", id);
    setParams(p, { replace: true });
  }

  function sourceLabel(row) {
    if (row.source_type === "ads") {
      const c = campaigns.find((x) => x.id === row.campaign_id);
      return c ? `Ads · ${c.name}` : "Ads";
    }
    if (row.source_type === "freelance" || row.source_type === "kemitraan") {
      const p = partners.find((x) => x.id === row.partner_id);
      return p ? `${SOURCE_LABELS[row.source_type]} · ${p.name}` : SOURCE_LABELS[row.source_type];
    }
    if (row.source_type === "organik") {
      // Keterangan detail lebih berguna daripada kategorinya: "Event" ada di
      // mana-mana, "Pameran Kota Tegal Mei" hanya sekali.
      const detail = row.organik_detail || row.organik_kategori;
      return detail ? `Organik · ${detail}` : "Organik";
    }
    return row.source || "-";
  }

  const openLead = leads.find((l) => l.id === openLeadId) || null;
  // Panel membaca baris terbaru dari daftar, bukan salinan saat baris diklik:
  // setelah Catat Follow Up, jadwal dan tahapnya harus langsung berubah di
  // panel yang masih terbuka.
  const panelSegar = panelLead ? leads.find((l) => l.id === panelLead.id) || panelLead : null;

  return (
    <div>
      <PageTitle
        title="Leads"
        subtitle={`${leads.length} prospek tercatat · tindak lanjutnya ada di menu Follow Up Leads`}
        action={
          <PrimaryButton subject="lead" onClick={() => setFormulir({ lead: null })}>
            + Prospek Baru
          </PrimaryButton>
        }
      />

      <ReadOnlyBanner />

      <Card>
        <DataTable
          loading={loading}
          sortable
          searchable
          searchPlaceholder="Saring daftar — nama, telepon, catatan…"
          searchExtra={(row) => [row.notes, row.username_sosmed, row.domisili, row.kecamatan, row.rencana_selanjutnya].filter(Boolean).join(" ")}
          // Datang dari hasil pencarian global: kata kuncinya diteruskan ke
          // saringan daftar, supaya baris yang dicari langsung terlihat.
          initialSearch={params.get("cari") || ""}
          highlightId={params.get("sorot") || undefined}
          onRowClick={(row) => setPanelLead(row)}
          pageSize={25}
          defaultSort={{ key: "created_at", arah: "desc" }}
          emptyIcon={Target}
          emptyLabel="Belum ada prospek"
          emptyHint="Cukup tiga hal untuk memulai: nama, nomor telepon, dan dari mana prospek ini datang."
          filters={[
            {
              key: "status",
              label: "Semua tahap",
              options: [...SUHU_OTOMATIS.filter((x) => !["baru", "dihubungi", "appointment"].includes(x)), ...AUTO_STAGES, "cancel"].map(
                (x) => ({ value: x, label: STAGE_LABELS[x] })
              ),
            },
            {
              key: "source_type",
              label: "Semua sumber",
              options: SOURCE_TYPES.map((x) => ({ value: x.value, label: x.label })),
            },
          ]}
          columns={[
            { key: "name", label: "Nama / Username" },
            {
              key: "phone",
              label: "Kontak",
              sortable: false,
              render: (row) => (
                <KontakAksi phone={row.phone} nama={row.name} tahap={row.status} leadId={row.id} onCatat={fetchLeads} />
              ),
            },
            { key: "source", label: "Sumber", sortValue: sourceLabel, render: sourceLabel },
            { key: "domisili", label: "Domisili", sortValue: (row) => row.kecamatan || row.domisili, render: (row) => row.kecamatan || row.domisili || "-" },
            {
              key: "status",
              label: "Tahap",
              // Tidak ada satu pun kontrol di sini. Tahap Booking ke atas
              // ditulis trigger dari kuitansi dan tanggal KPR; suhu di
              // bawahnya dibaca sistem dari riwayat follow-up. Menyediakan
              // dropdown akan mengembalikan persis kesalahan kategorisasi yang
              // BRIEF minta dihapus.
              render: (row) => (
                <span
                  title={
                    AUTO_STAGES.includes(row.status)
                      ? "Ditulis sistem dari kuitansi dan tanggal KPR"
                      : "Ditentukan sistem dari riwayat follow-up"
                  }
                >
                  <Badge value={row.status} label={STAGE_LABELS[row.status] || labelTahap(row.status)} />
                </span>
              ),
            },
            {
              key: "tanggal_rencana",
              label: "Follow Up",
              render: (row) =>
                row.tanggal_rencana ? (
                  <span
                    title={row.rencana_selanjutnya || ""}
                    style={{ fontSize: 12, fontWeight: 600, color: warnaJadwal(row.tanggal_rencana), whiteSpace: "nowrap" }}
                  >
                    {tanggalRelatif(row.tanggal_rencana)}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: TEXT_MID }}>belum dijadwalkan</span>
                ),
            },
            { key: "created_at", label: "Dibuat", render: (row) => tanggal(row.created_at) },
            {
              key: "aksi",
              label: "",
              sortable: false,
              // Satu aksi utama di baris, sisanya turun ke menu. Empat tombol
              // per baris berarti enam puluh tombol pada satu layar, dan mata
              // berhenti bisa menemukan mana yang utama — sementara "Hapus"
              // berdiri sebobot "Ubah", padahal ia permanen.
              render: (row) => {
                const sudah = terkonversi.get(row.id);
                const dibatalkan = row.status === "cancel";
                const bisaKonversi = mayWrite && !sudah && !dibatalkan;
                return (
                  <RowActions>
                    {sudah ? (
                      <button onClick={() => navigate(`/konsumen/${sudah}`)} style={{ ...gayaKecil, color: PRIMARY, borderColor: PRIMARY_MUTED }}>
                        Lihat Konsumen
                      </button>
                    ) : bisaKonversi ? (
                      <button onClick={() => setKonversiLead(row)} style={gayaKonversi} title="Buat konsumen, reserve unit, dan catat booking fee sekaligus">
                        + Booking
                      </button>
                    ) : (
                      <button onClick={() => setPanelLead(row)} style={gayaKecil}>
                        Buka
                      </button>
                    )}
                    <MenuAksi
                      items={[
                        { label: "Buka panel", ikon: PanelRight, onClick: () => setPanelLead(row) },
                        { label: "Riwayat follow-up", ikon: History, onClick: () => setOpenLeadId(openLeadId === row.id ? null : row.id) },
                        mayWrite && !dibatalkan && { label: "Catat follow-up", ikon: MessageSquare, onClick: () => setTahapLead(row) },
                        mayWrite && !dibatalkan && { label: "Survei & BI-Checking", ikon: ClipboardCheck, onClick: () => setSaringLead(row) },
                        mayWrite && { label: "Ubah data", ikon: Pencil, onClick: () => setFormulir({ lead: row }) },
                        mayWrite && !dibatalkan && { label: "Alihkan ke agen lain", ikon: ArrowRightLeft, onClick: () => setPanelAksi({ lead: row, aksi: "alih" }) },
                        mayWrite && !dibatalkan && { label: "Batalkan prospek", ikon: Ban, onClick: () => setPanelAksi({ lead: row, aksi: "batal" }), pisah: true, rusak: true },
                        mayWrite && { label: "Hapus permanen", ikon: Trash2, onClick: () => setHapusLead(row), rusak: true },
                      ]}
                    />
                  </RowActions>
                );
              },
            },
          ]}
          rows={leads}
        />
      </Card>

      {openLead && <FollowUpTimeline leadId={openLead.id} title={`Riwayat Follow Up — ${openLead.name}`} />}

      <KonversiBookingModal
        lead={konversiLead}
        open={Boolean(konversiLead)}
        onClose={() => setKonversiLead(null)}
        onSelesai={fetchLeads}
      />

      <CatatFollowUpModal
        lead={tahapLead}
        open={Boolean(tahapLead)}
        onClose={() => setTahapLead(null)}
        onSelesai={fetchLeads}
      />

      <SaringanAwalModal
        lead={saringLead}
        open={Boolean(saringLead)}
        onClose={() => setSaringLead(null)}
        onSelesai={fetchLeads}
      />

      <PanelProspek
        lead={panelSegar}
        open={Boolean(panelLead)}
        onClose={() => setPanelLead(null)}
        onSelesai={fetchLeads}
        konsumenId={panelSegar ? terkonversi.get(panelSegar.id) : null}
        sumberLabel={panelSegar ? sourceLabel(panelSegar) : ""}
        onKonversi={() => setKonversiLead(panelSegar)}
        onUbahTahap={() => setTahapLead(panelSegar)}
        onUbahData={() => {
          setFormulir({ lead: panelSegar });
          setPanelLead(null);
        }}
      />

      <ModalProspek open={Boolean(formulir)} lead={formulir?.lead || null} onClose={() => setFormulir(null)} onSaved={sorot} />

      {/* Aksi dari menu baris memanggil modal yang sama dengan yang dipakai
          panel, langsung pada operasinya — tanpa memaksa membuka panel dulu. */}
      <ModalBatal
        open={panelAksi?.aksi === "batal"}
        lead={panelAksi?.lead || null}
        onClose={() => setPanelAksi(null)}
        onSelesai={fetchLeads}
      />
      <ModalAlih
        open={panelAksi?.aksi === "alih"}
        lead={panelAksi?.lead || null}
        onClose={() => setPanelAksi(null)}
        onSelesai={fetchLeads}
      />

      <ConfirmDialog
        open={Boolean(hapusLead)}
        title="Hapus prospek ini?"
        message={hapusLead ? `\u201c${hapusLead.name}\u201d akan dihapus permanen dan tidak bisa dikembalikan.` : ""}
        warning="Riwayat follow-up prospek ini ikut terhapus. Untuk menutup prospek tanpa kehilangan jejaknya, pakai Batalkan Prospek — alasannya akan tercatat."
        busy={hapusSibuk}
        error={hapusGalat}
        onCancel={() => {
          if (!hapusSibuk) {
            setHapusLead(null);
            setHapusGalat("");
          }
        }}
        onConfirm={async () => {
          setHapusSibuk(true);
          const { error: e } = await supabase.from("leads").delete().eq("id", hapusLead.id);
          setHapusSibuk(false);
          if (e) {
            setHapusGalat(e.message);
            return;
          }
          setHapusLead(null);
          setPanelLead(null);
          toast.sukses("Prospek dihapus.");
          fetchLeads();
        }}
      />
    </div>
  );
}

/** Jadwal yang lewat harus terbaca sebagai utang pekerjaan, bukan sekadar tanggal. */
function warnaJadwal(tgl) {
  const d = new Date(`${tgl}T00:00:00`);
  const hariIni = new Date();
  hariIni.setHours(0, 0, 0, 0);
  const selisih = Math.round((d - hariIni) / 86400000);
  if (selisih < 0) return NEGATIVE;
  if (selisih <= 2) return ACCENT_DARK;
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

const gayaKonversi = {
  ...gayaKecil,
  border: "none",
  background: ACCENT,
  color: "#fff",
};
