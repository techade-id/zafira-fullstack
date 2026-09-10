import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { useAuth } from "../context/AuthContext";
import { canWrite } from "../lib/permissions";
import FollowUpTimeline from "../components/FollowUpTimeline";
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
  DeleteButton,
  EditButton,
  RowActions,
  ReadOnlyBanner,
} from "../components/ui";

/**
 * PRD §4.2 funnel. The first four stages are set by Sales; the rest are written
 * by database triggers from the booking receipt, KPR dates and handover, so
 * they render as read-only badges — letting someone pick them by hand would
 * just undo what the trigger recorded a moment earlier.
 */
const MANUAL_STAGES = ["leads", "cold", "warm", "hot"];
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

const SOURCE_TYPES = [
  { value: "ads", label: "Ads" },
  { value: "freelance", label: "Freelance / Kemitraan" },
  { value: "organik", label: "Organik" },
];

const MARITAL_OPTIONS = ["Nikah", "Janda/Duda", "Single"];
const PEKERJAAN_OPTIONS = ["Karyawan Swasta", "PNS/ASN", "Wirausaha"];

const emptyForm = {
  // PRD §4.1 minimal intake
  name: "",
  phone: "",
  source_type: "",
  campaign_id: "",
  partner_id: "",
  organik_kategori: "",
  source: "",
  // everything below is progressive
  username_sosmed: "",
  usia: "",
  marital_status: "",
  pekerjaan: "",
  perusahaan_tempat_kerja: "",
  gaji: "",
  domisili: "",
  kabupaten: "",
  kecamatan: "",
  kelurahan: "",
  rencana_selanjutnya: "",
  kategori_rencana: "",
  tanggal_rencana: "",
  notes: "",
};

export default function ProspekPage() {
  const { profile } = useAuth();
  const [params] = useSearchParams();

  const [leads, setLeads] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState(params.get("cari") || "");
  const [openLeadId, setOpenLeadId] = useState(params.get("sorot") || null);

  const sources = useBusinessSettings("lead_source");
  const followupCategories = useBusinessSettings("followup_category");
  const organikCategories = useBusinessSettings("organik_kategori");

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

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setShowDetail(false);
    setError("");
  }

  function startEdit(row) {
    setForm(Object.fromEntries(Object.keys(emptyForm).map((k) => [k, row[k] ?? ""])));
    setEditingId(row.id);
    setShowForm(true);
    // A record being corrected usually needs the full form, not the intake one.
    setShowDetail(true);
    setError("");
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError("Nama atau username wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      username_sosmed: form.username_sosmed.trim() || null,
      source_type: form.source_type || null,
      campaign_id: form.source_type === "ads" ? form.campaign_id || null : null,
      partner_id: form.source_type === "freelance" ? form.partner_id || null : null,
      organik_kategori: form.source_type === "organik" ? form.organik_kategori || null : null,
      source: form.source || null,
      usia: form.usia ? Number(form.usia) : null,
      marital_status: form.marital_status || null,
      pekerjaan: form.pekerjaan || null,
      perusahaan_tempat_kerja: form.perusahaan_tempat_kerja.trim() || null,
      gaji: form.gaji ? Number(form.gaji) : null,
      domisili: form.domisili.trim() || null,
      kabupaten: form.kabupaten.trim() || null,
      kecamatan: form.kecamatan.trim() || null,
      kelurahan: form.kelurahan.trim() || null,
      rencana_selanjutnya: form.rencana_selanjutnya.trim() || null,
      kategori_rencana: form.kategori_rencana || null,
      tanggal_rencana: form.tanggal_rencana || null,
      notes: form.notes.trim() || null,
    };

    // Status is set on create only — afterwards it moves through the funnel
    // select or the database triggers, so editing must never reset a lead.
    // assigned_to has to be stamped as well, otherwise RLS hides the row from
    // the very person who just created it.
    const { error: saveError } = editingId
      ? await supabase.from("leads").update(payload).eq("id", editingId)
      : await supabase.from("leads").insert({ ...payload, status: "leads", assigned_to: profile?.id || null });

    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    resetForm();
    fetchLeads();
  }

  async function updateStatus(leadId, status) {
    const { error: statusError } = await supabase.from("leads").update({ status }).eq("id", leadId);
    if (statusError) setError(statusError.message);
    fetchLeads();
  }

  /** Filters the loaded list; the header box searches the whole database. */
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((row) =>
      [row.name, row.phone, row.username_sosmed, row.notes, row.rencana_selanjutnya, row.source, row.domisili, row.kecamatan]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [leads, query]);

  function sourceLabel(row) {
    if (row.source_type === "ads") {
      const c = campaigns.find((x) => x.id === row.campaign_id);
      return c ? `Ads · ${c.name}` : "Ads";
    }
    if (row.source_type === "freelance") {
      const p = partners.find((x) => x.id === row.partner_id);
      return p ? `Mitra · ${p.name}` : "Freelance";
    }
    if (row.source_type === "organik") {
      return row.organik_kategori ? `Organik · ${row.organik_kategori}` : "Organik";
    }
    return row.source || "-";
  }

  const openLead = leads.find((l) => l.id === openLeadId) || null;

  return (
    <div>
      <PageTitle
        title="Prospek"
        subtitle={`${leads.length} prospek tercatat`}
        action={
          <PrimaryButton subject="lead" onClick={() => (showForm ? resetForm() : setShowForm(true))}>
            {showForm ? "Tutup" : "+ Prospek Baru"}
          </PrimaryButton>
        }
      />

      <ReadOnlyBanner />

      {showForm && (
        <Card style={{ marginBottom: 18 }}>
          {/* PRD §4.1: three fields to capture a lead. Everything else waits
              until there is something worth qualifying. */}
          <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_MID, marginBottom: 8 }}>Data Awal</div>
          <div className="rg-3" style={{ marginBottom: 12 }}>
            <input placeholder="Nama / Username *" value={form.name} onChange={(e) => set("name", e.target.value)} style={inputStyle} />
            <input placeholder="Nomor Telepon" value={form.phone} onChange={(e) => set("phone", e.target.value)} style={inputStyle} />
            <select value={form.source_type} onChange={(e) => set("source_type", e.target.value)} style={inputStyle}>
              <option value="">Sumber Leads</option>
              {SOURCE_TYPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {form.source_type && (
            <div className="rg-3" style={{ marginBottom: 12 }}>
              {form.source_type === "ads" && (
                <select value={form.campaign_id} onChange={(e) => set("campaign_id", e.target.value)} style={inputStyle}>
                  <option value="">Pilih Campaign</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.platform} — {c.name}
                    </option>
                  ))}
                </select>
              )}
              {form.source_type === "freelance" && (
                <select value={form.partner_id} onChange={(e) => set("partner_id", e.target.value)} style={inputStyle}>
                  <option value="">Pilih Mitra / Freelance</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.type})
                    </option>
                  ))}
                </select>
              )}
              {form.source_type === "organik" && (
                <select value={form.organik_kategori} onChange={(e) => set("organik_kategori", e.target.value)} style={inputStyle}>
                  <option value="">Kategori Organik</option>
                  {withCurrentValue(organikCategories, form.organik_kategori).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <button
            onClick={() => setShowDetail((v) => !v)}
            style={{ border: "none", background: "none", color: PRIMARY, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "4px 0", marginBottom: showDetail ? 12 : 0 }}
          >
            {showDetail ? "− Sembunyikan data lengkap" : "+ Lengkapi data prospek (opsional)"}
          </button>

          {showDetail && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_MID, marginBottom: 8 }}>Data Diri</div>
              <div className="rg-3" style={{ marginBottom: 14 }}>
                <input placeholder="Username Sosial Media" value={form.username_sosmed} onChange={(e) => set("username_sosmed", e.target.value)} style={inputStyle} />
                <input placeholder="Usia" type="number" value={form.usia} onChange={(e) => set("usia", e.target.value)} style={inputStyle} />
                <select value={form.marital_status} onChange={(e) => set("marital_status", e.target.value)} style={inputStyle}>
                  <option value="">Status Pernikahan</option>
                  {MARITAL_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <select value={form.pekerjaan} onChange={(e) => set("pekerjaan", e.target.value)} style={inputStyle}>
                  <option value="">Pekerjaan</option>
                  {PEKERJAAN_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <input placeholder="Perusahaan Tempat Kerja" value={form.perusahaan_tempat_kerja} onChange={(e) => set("perusahaan_tempat_kerja", e.target.value)} style={inputStyle} />
                <input placeholder="Gaji (Rp)" type="number" value={form.gaji} onChange={(e) => set("gaji", e.target.value)} style={inputStyle} />
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_MID, marginBottom: 8 }}>Domisili</div>
              <div className="rg-4" style={{ marginBottom: 14 }}>
                <input placeholder="Domisili" value={form.domisili} onChange={(e) => set("domisili", e.target.value)} style={inputStyle} />
                <input placeholder="Kabupaten/Kota" value={form.kabupaten} onChange={(e) => set("kabupaten", e.target.value)} style={inputStyle} />
                <input placeholder="Kecamatan" value={form.kecamatan} onChange={(e) => set("kecamatan", e.target.value)} style={inputStyle} />
                <input placeholder="Kelurahan/Desa" value={form.kelurahan} onChange={(e) => set("kelurahan", e.target.value)} style={inputStyle} />
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_MID, marginBottom: 8 }}>Rencana &amp; Catatan</div>
              <div className="rg-4" style={{ marginBottom: 12 }}>
                <select value={form.kategori_rencana} onChange={(e) => set("kategori_rencana", e.target.value)} style={inputStyle}>
                  <option value="">Kategori Rencana</option>
                  {withCurrentValue(followupCategories, form.kategori_rencana).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input placeholder="Rencana Selanjutnya" value={form.rencana_selanjutnya} onChange={(e) => set("rencana_selanjutnya", e.target.value)} style={inputStyle} />
                <input type="date" value={form.tanggal_rencana} onChange={(e) => set("tanggal_rencana", e.target.value)} style={inputStyle} title="Tanggal rencana selanjutnya" />
                <select value={form.source} onChange={(e) => set("source", e.target.value)} style={inputStyle} title="Label sumber versi lama, dipertahankan agar laporan historis tetap cocok">
                  <option value="">Sumber (label lama)</option>
                  {withCurrentValue(sources, form.source).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <textarea
                  placeholder="Catatan — seluruh teks ini dapat ditemukan lewat kotak pencarian di header"
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  style={{ ...inputStyle, gridColumn: "1 / -1", minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
                />
              </div>
            </>
          )}

          {error && <div style={{ color: "#C2413B", fontSize: 12, margin: "10px 0" }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
            <PrimaryButton subject="lead" onClick={handleSave} disabled={saving}>
              {saving ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Simpan Prospek"}
            </PrimaryButton>
            <button onClick={resetForm} style={{ border: `1px solid ${BORDER}`, background: "#fff", color: TEXT_MID, borderRadius: 999, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Batal
            </button>
          </div>
        </Card>
      )}

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "0 12px", marginBottom: 14, maxWidth: 380 }}>
          <Search size={15} color={TEXT_MID} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Saring daftar — nama, telepon, catatan…"
            style={{ flex: 1, border: "none", outline: "none", padding: "10px 0", fontSize: 13, color: TEXT_DARK }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ border: "none", background: "none", color: TEXT_MID, cursor: "pointer", fontSize: 12 }}>
              ✕
            </button>
          )}
        </div>

        <DataTable
          loading={loading}
          emptyLabel={query ? "Tidak ada prospek yang cocok dengan pencarian." : "Belum ada prospek."}
          columns={[
            { key: "name", label: "Nama / Username" },
            { key: "phone", label: "Telepon", render: (row) => row.phone || "-" },
            { key: "source", label: "Sumber", render: sourceLabel },
            { key: "domisili", label: "Domisili", render: (row) => row.kecamatan || row.domisili || "-" },
            {
              key: "status",
              label: "Tahap",
              render: (row) =>
                AUTO_STAGES.includes(row.status) || !mayWrite ? (
                  <Badge value={STAGE_LABELS[row.status] || row.status} />
                ) : (
                  <select
                    value={MANUAL_STAGES.includes(row.status) ? row.status : "leads"}
                    onChange={(e) => updateStatus(row.id, e.target.value)}
                    style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: "5px 9px", fontSize: 12 }}
                  >
                    {[...MANUAL_STAGES, "cancel"].map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                ),
            },
            {
              key: "followup",
              label: "Follow Up",
              render: (row) => (
                <button
                  onClick={() => setOpenLeadId(openLeadId === row.id ? null : row.id)}
                  style={{ border: `1px solid ${BORDER}`, background: "#fff", borderRadius: 9, padding: "5px 11px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  {openLeadId === row.id ? "Tutup" : "Riwayat"}
                </button>
              ),
            },
            { key: "created_at", label: "Dibuat", render: (row) => new Date(row.created_at).toLocaleDateString("id-ID") },
            {
              key: "aksi",
              label: "",
              render: (row) => (
                <RowActions>
                  <EditButton subject="lead" onClick={() => startEdit(row)} />
                  <DeleteButton
                    subject="lead"
                    itemName={row.name}
                    warning="Riwayat follow-up prospek ini ikut terhapus. Konsumen yang sudah dibuat dari prospek ini tetap ada, hanya kehilangan kaitannya."
                    onDelete={() => supabase.from("leads").delete().eq("id", row.id)}
                    onDone={fetchLeads}
                  />
                </RowActions>
              ),
            },
          ]}
          rows={shown}
        />
      </Card>

      {openLead && <FollowUpTimeline leadId={openLead.id} title={`Riwayat Follow Up — ${openLead.name}`} />}
    </div>
  );
}

const inputStyle = {
  padding: "10px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};
