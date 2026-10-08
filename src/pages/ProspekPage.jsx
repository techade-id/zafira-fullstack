import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Target, PanelRight, Pencil, Trash2, MessageSquare, X, ArrowRight } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canWrite } from "../lib/permissions";
import { tanggal, telepon } from "../lib/format";
import ModalProspek, { SOURCE_TYPES, EVENT_TERSIMPAN } from "../components/ModalProspek";
import { Rincian } from "../components/PanelProspek";
import {
  Card,
  PageTitle,
  PrimaryButton,
  DataTable,
  Drawer,
  BORDER,
  SURFACE,
  TEXT_MID,
  TEXT_DARK,
  RowActions,
  MenuAksi,
  ConfirmDialog,
  ReadOnlyBanner,
} from "../components/ui";

/**
 * Leads — data mentah prospek, apa adanya seperti saat pertama dicatat.
 *
 * Halaman ini tidak menjalankan proses apa pun. Tahap, jadwal, catatan
 * follow-up, survei, BI-Checking, booking, pengalihan, dan pembatalan
 * seluruhnya dikerjakan Sales di menu Follow Up Leads, yang membaca tabel yang
 * sama: setiap prospek yang dicatat di sini langsung masuk antreannya.
 *
 * Yang tersisa di sini hanya pengelolaan datanya sendiri — menambah,
 * mengoreksi salah ketik, dan menghapus data ganda.
 */

const SOURCE_LABELS = { ads: "Ads", freelance: "Freelance", kemitraan: "Kemitraan", organik: "Organik" };

export default function ProspekPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [leads, setLeads] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);

  // null = tertutup, { lead: null } = prospek baru, { lead } = ubah data.
  const [formulir, setFormulir] = useState(null);

  const [panelLead, setPanelLead] = useState(null);
  const [hapusLead, setHapusLead] = useState(null);
  const [hapusSibuk, setHapusSibuk] = useState(false);
  const [hapusGalat, setHapusGalat] = useState("");

  const mayWrite = canWrite(profile, "lead");

  async function fetchLeads() {
    setLoading(true);
    const [{ data, error: leadError }, campaignRes, partnerRes] = await Promise.all([
      fetchAllRows(() => supabase.from("leads").select("*").order("created_at", { ascending: false })),
      supabase.from("ads_campaigns").select("id, name, platform").eq("is_active", true).order("name"),
      supabase.from("partners").select("id, name, type").eq("is_active", true).order("name"),
    ]);
    if (!leadError) setLeads(data);
    // These two tables arrive with migration_009; until it runs the page still
    // works, it just has no relational sources to offer.
    setCampaigns(campaignRes.data || []);
    setPartners(partnerRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchLeads();
  }, []);

  // "Simpan & tambah lagi" tidak menutup formulir, jadi tidak memanggil
  // onSaved — daftarnya disegarkan lewat event yang dikirim setiap simpanan.
  useEffect(() => {
    const segarkan = () => fetchLeads();
    window.addEventListener(EVENT_TERSIMPAN, segarkan);
    return () => window.removeEventListener(EVENT_TERSIMPAN, segarkan);
  }, []);

  // "Ubah Data" dari panel Follow Up Leads datang sebagai ?ubah=<id>: formulir
  // langsung terbuka, tanpa harus mencari barisnya lagi.
  const ubahId = params.get("ubah");
  useEffect(() => {
    if (!ubahId || loading) return;
    const lead = leads.find((l) => l.id === ubahId);
    if (lead && mayWrite) setFormulir({ lead });
    const p = new URLSearchParams(params);
    p.delete("ubah");
    p.set("sorot", ubahId);
    setParams(p, { replace: true });
  }, [ubahId, loading]);

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

  const keFollowUp = (id) => navigate(`/follow-up?sorot=${id}`);
  // Panel membaca baris terbaru dari daftar, bukan salinan saat baris diklik:
  // setelah data dikoreksi, panel yang masih terbuka harus ikut berubah.
  const panelSegar = panelLead ? leads.find((l) => l.id === panelLead.id) || panelLead : null;

  return (
    <div>
      <PageTitle
        title="Leads"
        subtitle={`${leads.length} prospek tercatat · data awal saja — tindak lanjutnya ada di menu Follow Up Leads`}
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
          searchExtra={(row) => [row.notes, row.username_sosmed, row.domisili, row.kecamatan].filter(Boolean).join(" ")}
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
              // Nomor saja, tanpa tombol WhatsApp: menghubungi prospek adalah
              // follow-up, dan follow-up dicatat di Follow Up Leads.
              render: (row) => <span style={{ whiteSpace: "nowrap" }}>{telepon(row.phone)}</span>,
            },
            { key: "source", label: "Sumber", sortValue: sourceLabel, render: sourceLabel },
            { key: "domisili", label: "Domisili", sortValue: (row) => row.kecamatan || row.domisili, render: (row) => row.kecamatan || row.domisili || "-" },
            { key: "created_at", label: "Dibuat", render: (row) => tanggal(row.created_at) },
            {
              key: "aksi",
              label: "",
              sortable: false,
              render: (row) => (
                <RowActions>
                  {mayWrite ? (
                    <button onClick={() => setFormulir({ lead: row })} style={gayaKecil}>
                      Ubah
                    </button>
                  ) : (
                    <button onClick={() => setPanelLead(row)} style={gayaKecil}>
                      Buka
                    </button>
                  )}
                  <MenuAksi
                    items={[
                      { label: "Lihat rincian", ikon: PanelRight, onClick: () => setPanelLead(row) },
                      { label: "Buka di Follow Up Leads", ikon: MessageSquare, onClick: () => keFollowUp(row.id) },
                      mayWrite && { label: "Hapus permanen", ikon: Trash2, onClick: () => setHapusLead(row), pisah: true, rusak: true },
                    ]}
                  />
                </RowActions>
              ),
            },
          ]}
          rows={leads}
        />
      </Card>

      <PanelDataLead
        lead={panelSegar}
        open={Boolean(panelLead)}
        onClose={() => setPanelLead(null)}
        sumberLabel={panelSegar ? sourceLabel(panelSegar) : ""}
        bolehUbah={mayWrite}
        bolehTindakLanjut={canWrite(profile, "followup_lead")}
        onUbah={() => {
          setFormulir({ lead: panelSegar });
          setPanelLead(null);
        }}
        onFollowUp={() => keFollowUp(panelSegar.id)}
      />

      <ModalProspek open={Boolean(formulir)} lead={formulir?.lead || null} onClose={() => setFormulir(null)} onSaved={sorot} />

      <ConfirmDialog
        open={Boolean(hapusLead)}
        title="Hapus prospek ini?"
        message={hapusLead ? `“${hapusLead.name}” akan dihapus permanen dan tidak bisa dikembalikan.` : ""}
        warning="Riwayat follow-up prospek ini ikut terhapus. Untuk menutup prospek tanpa kehilangan jejaknya, pakai Batalkan Prospek di menu Follow Up Leads — alasannya akan tercatat."
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

/**
 * Rincian data awal satu prospek — hanya baca.
 *
 * Sengaja bukan PanelProspek: panel itu tempat bekerja (jadwal, catatan,
 * booking), dan tempatnya di Follow Up Leads. Di sini satu-satunya jalan
 * menuju proses adalah tombol yang membawa ke sana.
 */
function PanelDataLead({ lead, open, onClose, sumberLabel, bolehUbah, bolehTindakLanjut, onUbah, onFollowUp }) {
  if (!lead) return null;
  return (
    <Drawer open={open} labelledBy="panel-lead-judul" onClose={onClose} width={440}>
      <>
        <div style={{ position: "sticky", top: 0, background: SURFACE, borderBottom: `1px solid ${BORDER}`, padding: "18px 20px 14px", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 id="panel-lead-judul" style={{ fontSize: 18, margin: "0 0 6px", letterSpacing: "-0.01em" }}>
                {lead.name}
              </h2>
              <div style={{ fontSize: 12.5, color: TEXT_MID }}>{telepon(lead.phone)}</div>
            </div>
            <button
              onClick={onClose}
              aria-label="Tutup panel"
              style={{ border: "none", background: "none", color: TEXT_MID, cursor: "pointer", padding: 4, flexShrink: 0 }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div style={{ padding: "16px 20px 24px" }}>
          <div style={{ marginBottom: 18 }}>
            <PrimaryButton onClick={onFollowUp} style={{ width: "100%" }}>
              {bolehTindakLanjut ? "Tindak lanjuti di Follow Up Leads" : "Lihat di Follow Up Leads"}
              <ArrowRight size={14} style={{ marginLeft: 5, verticalAlign: -2 }} />
            </PrimaryButton>
            {bolehUbah && (
              <button onClick={onUbah} style={{ ...gayaKecil, marginTop: 9, padding: "8px 14px", fontSize: 12.5, borderRadius: 999 }}>
                <Pencil size={12} style={{ marginRight: 5, verticalAlign: -2 }} />
                Ubah Data
              </button>
            )}
          </div>

          <Rincian lead={lead} sumberLabel={sumberLabel} />
        </div>
      </>
    </Drawer>
  );
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
