import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { Card, PageTitle, PrimaryButton, DataTable, BORDER } from "../components/ui";

const STATUS_OPTIONS = ["leads", "cold", "warm", "appointment", "deal", "cancel"];
const MARITAL_OPTIONS = ["Nikah", "Janda/Duda", "Single"];
const PEKERJAAN_OPTIONS = ["Karyawan Swasta", "PNS/ASN", "Wirausaha"];

const emptyForm = {
  name: "",
  phone: "",
  usia: "",
  marital_status: "",
  pekerjaan: "",
  perusahaan_tempat_kerja: "",
  gaji: "",
  domisili: "",
  kabupaten: "",
  kecamatan: "",
  kelurahan: "",
  source: "",
  rencana_selanjutnya: "",
  kategori_rencana: "",
  tanggal_rencana: "",
  notes: "",
};

export default function ProspekPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const sources = useBusinessSettings("lead_source");
  const followupCategories = useBusinessSettings("followup_category");

  async function fetchLeads() {
    setLoading(true);
    const { data, error } = await fetchAllRows(() => supabase.from("leads").select("*").order("created_at", { ascending: false }));
    if (!error) setLeads(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchLeads();
  }, []);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleAddLead() {
    if (!form.name.trim()) {
      setError("Nama wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    const { error } = await supabase.from("leads").insert({
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      usia: form.usia ? Number(form.usia) : null,
      marital_status: form.marital_status || null,
      pekerjaan: form.pekerjaan || null,
      perusahaan_tempat_kerja: form.perusahaan_tempat_kerja.trim() || null,
      gaji: form.gaji ? Number(form.gaji) : null,
      domisili: form.domisili.trim() || null,
      kabupaten: form.kabupaten.trim() || null,
      kecamatan: form.kecamatan.trim() || null,
      kelurahan: form.kelurahan.trim() || null,
      source: form.source || null,
      rencana_selanjutnya: form.rencana_selanjutnya.trim() || null,
      kategori_rencana: form.kategori_rencana || null,
      tanggal_rencana: form.tanggal_rencana || null,
      notes: form.notes.trim() || null,
      status: "leads",
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm(emptyForm);
    setShowForm(false);
    fetchLeads();
  }

  async function updateStatus(leadId, status) {
    await supabase.from("leads").update({ status }).eq("id", leadId);
    fetchLeads();
  }

  return (
    <div>
      <PageTitle
        title="Prospek"
        subtitle={`${leads.length} prospek tercatat`}
        action={<PrimaryButton onClick={() => setShowForm((v) => !v)}>+ Prospek Baru</PrimaryButton>}
      />

      {showForm && (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#79837a", marginBottom: 8 }}>Data Diri</div>
          <div className="rg-3" style={{ marginBottom: 14 }}>
            <input placeholder="Nama *" value={form.name} onChange={(e) => set("name", e.target.value)} style={inputStyle} />
            <input placeholder="Nomor Telepon" value={form.phone} onChange={(e) => set("phone", e.target.value)} style={inputStyle} />
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

          <div style={{ fontSize: 12, fontWeight: 600, color: "#79837a", marginBottom: 8 }}>Domisili</div>
          <div className="rg-4" style={{ marginBottom: 14 }}>
            <input placeholder="Domisili" value={form.domisili} onChange={(e) => set("domisili", e.target.value)} style={inputStyle} />
            <input placeholder="Kabupaten/Kota" value={form.kabupaten} onChange={(e) => set("kabupaten", e.target.value)} style={inputStyle} />
            <input placeholder="Kecamatan" value={form.kecamatan} onChange={(e) => set("kecamatan", e.target.value)} style={inputStyle} />
            <input placeholder="Kelurahan/Desa" value={form.kelurahan} onChange={(e) => set("kelurahan", e.target.value)} style={inputStyle} />
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, color: "#79837a", marginBottom: 8 }}>Sumber & Rencana</div>
          <div className="rg-4" style={{ marginBottom: 12 }}>
            <select value={form.source} onChange={(e) => set("source", e.target.value)} style={inputStyle}>
              <option value="">Sumber Informasi Leads</option>
              {withCurrentValue(sources, form.source).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select value={form.kategori_rencana} onChange={(e) => set("kategori_rencana", e.target.value)} style={inputStyle}>
              <option value="">Kategori Rencana</option>
              {withCurrentValue(followupCategories, form.kategori_rencana).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <input placeholder="Rencana Selanjutnya" value={form.rencana_selanjutnya} onChange={(e) => set("rencana_selanjutnya", e.target.value)} style={inputStyle} />
            <input type="date" value={form.tanggal_rencana} onChange={(e) => set("tanggal_rencana", e.target.value)} style={inputStyle} title="Tanggal rencana selanjutnya" />
            <input placeholder="Catatan" value={form.notes} onChange={(e) => set("notes", e.target.value)} style={{ ...inputStyle, gridColumn: "1 / -1" }} />
          </div>
          {error && <div style={{ color: "#c25b5b", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <PrimaryButton onClick={handleAddLead} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan Prospek"}
          </PrimaryButton>
        </Card>
      )}

      <Card>
        <DataTable
          loading={loading}
          columns={[
            { key: "name", label: "Nama" },
            { key: "phone", label: "Telepon", render: (row) => row.phone || "-" },
            { key: "pekerjaan", label: "Pekerjaan", render: (row) => row.pekerjaan || "-" },
            { key: "domisili", label: "Domisili", render: (row) => row.kecamatan || row.domisili || "-" },
            { key: "source", label: "Sumber", render: (row) => row.source || "-" },
            { key: "kategori_rencana", label: "Rencana", render: (row) => row.kategori_rencana || "-" },
            {
              key: "status",
              label: "Status",
              render: (row) => (
                <select
                  value={STATUS_OPTIONS.includes(row.status) ? row.status : "leads"}
                  onChange={(e) => updateStatus(row.id, e.target.value)}
                  style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: "5px 9px", fontSize: 12, textTransform: "capitalize" }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ),
            },
            { key: "created_at", label: "Dibuat", render: (row) => new Date(row.created_at).toLocaleDateString("id-ID") },
          ]}
          rows={leads}
        />
      </Card>
    </div>
  );
}

const inputStyle = {
  padding: "10px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  fontSize: 13,
  outline: "none",
};
