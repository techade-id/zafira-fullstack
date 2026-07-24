import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { uploadFile, getSignedUrl } from "../lib/storage";
import { useAuth } from "../context/AuthContext";
import { Card, PageTitle, PrimaryButton, DataTable, BORDER } from "../components/ui";

const CUSTOMER_STATUS_OPTIONS = ["proses", "aktif", "selesai", "batal"];
const DOC_TYPES = ["KTP", "KK", "NPWP", "Slip Gaji", "Akad"];
const DOC_STATUS_OPTIONS = ["menunggu", "terverifikasi", "ditolak"];

function durationLabel(startedAt, completedAt) {
  const start = new Date(startedAt);
  const end = completedAt ? new Date(completedAt) : new Date();
  const days = Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  return completedAt ? `${days} hari (selesai)` : `${days} hari (berjalan)`;
}

export default function KonsumenPage() {
  const { profile } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [units, setUnits] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", ktp_number: "", address: "", unit_id: "", lead_id: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [docFile, setDocFile] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  async function fetchAll() {
    setLoading(true);
    const [{ data: cust }, { data: unt }, { data: ld }] = await Promise.all([
      supabase.from("customers").select("*, units(unit_code)").order("created_at", { ascending: false }),
      supabase.from("units").select("id, unit_code, status").order("unit_code"),
      supabase.from("leads").select("id, name").order("name"),
    ]);
    setCustomers(cust || []);
    setUnits(unt || []);
    setLeads(ld || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchDocuments(customerId) {
    const { data } = await supabase.from("customer_documents").select("*").eq("customer_id", customerId).order("uploaded_at", { ascending: false });
    setDocuments(data || []);
  }

  function toggleCustomer(id) {
    if (selectedCustomerId === id) {
      setSelectedCustomerId(null);
      setDocuments([]);
    } else {
      setSelectedCustomerId(id);
      fetchDocuments(id);
    }
  }

  async function handleAddCustomer() {
    if (!form.name.trim()) {
      setError("Nama wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    const { error } = await supabase.from("customers").insert({
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      ktp_number: form.ktp_number.trim() || null,
      address: form.address.trim() || null,
      unit_id: form.unit_id || null,
      lead_id: form.lead_id || null,
      sales_agent_id: profile?.id || null,
      status: "proses",
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm({ name: "", phone: "", email: "", ktp_number: "", address: "", unit_id: "", lead_id: "" });
    setShowForm(false);
    fetchAll();
  }

  async function updateStatus(customerId, status) {
    const patch = { status };
    if (status === "selesai") patch.process_completed_at = new Date().toISOString();
    if (status !== "selesai") patch.process_completed_at = null;
    await supabase.from("customers").update(patch).eq("id", customerId);
    fetchAll();
  }

  async function handleUploadDoc() {
    if (!docFile || !selectedCustomerId) return;
    setUploadingDoc(true);
    const { path, error: upErr } = await uploadFile("customer-documents", selectedCustomerId, docFile);
    if (upErr) {
      setError(upErr.message);
      setUploadingDoc(false);
      return;
    }
    await supabase.from("customer_documents").insert({
      customer_id: selectedCustomerId,
      doc_type: docType,
      file_url: path,
      status: "menunggu",
    });
    setDocFile(null);
    setUploadingDoc(false);
    fetchDocuments(selectedCustomerId);
  }

  async function updateDocStatus(docId, status) {
    await supabase.from("customer_documents").update({ status }).eq("id", docId);
    fetchDocuments(selectedCustomerId);
  }

  async function viewDoc(path) {
    const url = await getSignedUrl("customer-documents", path);
    if (url) window.open(url, "_blank");
  }

  return (
    <div>
      <PageTitle
        title="Konsumen"
        subtitle={`${customers.length} konsumen tercatat`}
        action={<PrimaryButton onClick={() => setShowForm((v) => !v)}>+ Konsumen Baru</PrimaryButton>}
      />

      {showForm && (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <input placeholder="Nama" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <input placeholder="Telepon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
            <input placeholder="No. KTP" value={form.ktp_number} onChange={(e) => setForm({ ...form, ktp_number: e.target.value })} style={inputStyle} />
            <input placeholder="Alamat" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={inputStyle} />
            <select value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })} style={inputStyle}>
              <option value="">Pilih Unit (opsional)</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_code} ({u.status})
                </option>
              ))}
            </select>
            <select value={form.lead_id} onChange={(e) => setForm({ ...form, lead_id: e.target.value })} style={inputStyle}>
              <option value="">Dari Prospek (opsional)</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          {error && <div style={{ color: "#d94141", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <PrimaryButton onClick={handleAddCustomer} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan Konsumen"}
          </PrimaryButton>
        </Card>
      )}

      <Card>
        <DataTable
          loading={loading}
          emptyLabel="Belum ada konsumen."
          columns={[
            { key: "name", label: "Nama" },
            { key: "unit", label: "Unit", render: (row) => row.units?.unit_code || "-" },
            { key: "duration", label: "Lama Proses", render: (row) => durationLabel(row.process_started_at, row.process_completed_at) },
            {
              key: "status",
              label: "Status",
              render: (row) => (
                <select
                  value={row.status}
                  onChange={(e) => updateStatus(row.id, e.target.value)}
                  style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 8px", fontSize: 12 }}
                >
                  {CUSTOMER_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ),
            },
            {
              key: "docs",
              label: "Dokumen",
              render: (row) => (
                <button onClick={() => toggleCustomer(row.id)} style={linkButtonStyle}>
                  {selectedCustomerId === row.id ? "Tutup" : "Lihat Dokumen"}
                </button>
              ),
            },
          ]}
          rows={customers}
        />
      </Card>

      {selectedCustomerId && (
        <Card style={{ marginTop: 18 }}>
          <PageTitle title="Dokumen Administrasi" subtitle="KTP, KK, NPWP, Akad, dll dengan status verifikasi" />
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <select value={docType} onChange={(e) => setDocType(e.target.value)} style={inputStyle}>
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input type="file" onChange={(e) => setDocFile(e.target.files?.[0] || null)} style={{ fontSize: 13 }} />
            <PrimaryButton onClick={handleUploadDoc} disabled={uploadingDoc || !docFile}>
              {uploadingDoc ? "Mengunggah..." : "Unggah"}
            </PrimaryButton>
          </div>

          <DataTable
            emptyLabel="Belum ada dokumen diunggah."
            columns={[
              { key: "doc_type", label: "Jenis" },
              { key: "file_url", label: "File", render: (row) => (row.file_url ? <button onClick={() => viewDoc(row.file_url)} style={linkButtonStyle}>Lihat</button> : "-") },
              { key: "uploaded_at", label: "Diunggah", render: (row) => new Date(row.uploaded_at).toLocaleDateString("id-ID") },
              {
                key: "status",
                label: "Status",
                render: (row) => (
                  <select
                    value={row.status}
                    onChange={(e) => updateDocStatus(row.id, e.target.value)}
                    style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 8px", fontSize: 12 }}
                  >
                    {DOC_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ),
              },
            ]}
            rows={documents}
          />
        </Card>
      )}
    </div>
  );
}

const inputStyle = {
  padding: "10px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  fontSize: 13,
  outline: "none",
};

const linkButtonStyle = {
  border: `1px solid ${BORDER}`,
  background: "#fff",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 11,
  cursor: "pointer",
};
