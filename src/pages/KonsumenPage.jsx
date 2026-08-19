import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import { uploadFile, getSignedUrl } from "../lib/storage";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { useAuth } from "../context/AuthContext";
import { Card, PageTitle, PrimaryButton, DataTable, BORDER, TEXT_MID, DeleteButton } from "../components/ui";

const CUSTOMER_STATUS_OPTIONS = ["proses", "aktif", "selesai", "batal"];
const DOC_TYPES = ["KTP", "KK", "NPWP", "Slip Gaji", "Akad"];
const DOC_STATUS_OPTIONS = ["menunggu", "terverifikasi", "ditolak"];

function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
}

function durationLabel(startedAt, completedAt) {
  const days = daysBetween(startedAt, completedAt || new Date());
  return completedAt ? `${days} hari (selesai)` : `${days} hari (berjalan)`;
}

const KPR_FIELDS = [
  { key: "tanggal_booking", label: "Tanggal Booking", type: "date" },
  { key: "nominal_booking", label: "Nominal Booking", type: "number" },
  { key: "tanggal_dp", label: "Tanggal Pembayaran DP", type: "date" },
  { key: "nominal_dp", label: "Nominal DP", type: "number" },
  { key: "biaya_tambahan_tanah", label: "Biaya Tambahan Tanah", type: "number" },
  { key: "nominal_total_dp", label: "Total DP (Promo + Tanah)", type: "number" },
  { key: "dp_terbayar", label: "DP Terbayar", type: "number" },
  { key: "nama_bank", label: "Nama Bank", type: "bank" },
  { key: "tanggal_masuk_bank", label: "Tanggal Masuk Bank", type: "date" },
  { key: "progres_berkas", label: "Progres Berkas", type: "progres" },
  { key: "tanggal_sp3k_terbit", label: "Tanggal SP3K Terbit", type: "date" },
  { key: "tanggal_sp3k_expired", label: "Tanggal SP3K Expired", type: "date" },
  { key: "tanggal_sp3k_perpanjangan", label: "Tanggal SP3K Perpanjangan", type: "date" },
  { key: "tanggal_akad", label: "Tanggal Akad", type: "date" },
  { key: "tanggal_serah_terima_kunci", label: "Tanggal Serah Terima Kunci", type: "date" },
  { key: "bphtb", label: "BPHTB", type: "number" },
  { key: "shm", label: "SHM", type: "text" },
];

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
  const [kpr, setKpr] = useState(null);
  const [kprSaving, setKprSaving] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [docFile, setDocFile] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const banks = useBusinessSettings("bank");
  const progresBerkasOptions = useBusinessSettings("progres_berkas");

  async function fetchAll() {
    setLoading(true);
    const [{ data: cust }, { data: unt }, { data: ld }] = await Promise.all([
      fetchAllRows(() => supabase.from("customers").select("*, units(unit_code)").order("created_at", { ascending: false })),
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

  async function openCustomer(customerId) {
    if (selectedCustomerId === customerId) {
      setSelectedCustomerId(null);
      setKpr(null);
      setDocuments([]);
      return;
    }
    setSelectedCustomerId(customerId);
    const [{ data: kprRow }, { data: docs }] = await Promise.all([
      supabase.from("customer_kpr").select("*").eq("customer_id", customerId).maybeSingle(),
      supabase.from("customer_documents").select("*").eq("customer_id", customerId).order("uploaded_at", { ascending: false }),
    ]);
    setKpr(kprRow || { customer_id: customerId });
    setDocuments(docs || []);
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
    const current = customers.find((c) => c.id === customerId);
    const patch = { status };
    // Stamp the completion date the first time a customer reaches "selesai",
    // and never clear it afterwards — it's the basis of the duration reports,
    // so an accidental status toggle must not destroy it.
    if (status === "selesai" && !current?.process_completed_at) {
      patch.process_completed_at = new Date().toISOString();
    }
    await supabase.from("customers").update(patch).eq("id", customerId);
    fetchAll();
  }

  function setKprField(key, value) {
    setKpr((k) => ({ ...k, [key]: value }));
  }

  async function saveKpr() {
    setKprSaving(true);
    const payload = { ...kpr, customer_id: selectedCustomerId, updated_at: new Date().toISOString() };
    // normalize empty strings to null
    for (const k of Object.keys(payload)) {
      if (payload[k] === "") payload[k] = null;
    }
    const { error } = await supabase.from("customer_kpr").upsert(payload, { onConflict: "customer_id" });
    setKprSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    const { data } = await supabase.from("customer_kpr").select("*").eq("customer_id", selectedCustomerId).maybeSingle();
    setKpr(data || { customer_id: selectedCustomerId });
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
    await supabase.from("customer_documents").insert({ customer_id: selectedCustomerId, doc_type: docType, file_url: path, status: "menunggu" });
    setDocFile(null);
    setUploadingDoc(false);
    const { data } = await supabase.from("customer_documents").select("*").eq("customer_id", selectedCustomerId).order("uploaded_at", { ascending: false });
    setDocuments(data || []);
  }

  async function fetchDocumentsFor(customerId) {
    const { data } = await supabase.from("customer_documents").select("*").eq("customer_id", customerId).order("uploaded_at", { ascending: false });
    setDocuments(data || []);
  }

  async function fetchDocumentsFor(customerId) {
    const { data } = await supabase.from("customer_documents").select("*").eq("customer_id", customerId).order("uploaded_at", { ascending: false });
    setDocuments(data || []);
  }

  async function updateDocStatus(docId, status) {
    await supabase.from("customer_documents").update({ status }).eq("id", docId);
    const { data } = await supabase.from("customer_documents").select("*").eq("customer_id", selectedCustomerId).order("uploaded_at", { ascending: false });
    setDocuments(data || []);
  }

  async function viewDoc(path) {
    const url = await getSignedUrl("customer-documents", path);
    if (url) window.open(url, "_blank");
  }

  function renderKprInput(field) {
    const value = kpr?.[field.key] ?? "";
    if (field.type === "bank") {
      return (
        <select value={value} onChange={(e) => setKprField(field.key, e.target.value)} style={inputStyle}>
          <option value="">Pilih Bank</option>
          {withCurrentValue(banks, value).map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      );
    }
    if (field.type === "progres") {
      return (
        <select value={value} onChange={(e) => setKprField(field.key, e.target.value)} style={inputStyle}>
          <option value="">Pilih Progres</option>
          {withCurrentValue(progresBerkasOptions, value).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      );
    }
    return <input type={field.type} value={value} onChange={(e) => setKprField(field.key, e.target.value)} style={inputStyle} />;
  }

  const durations = kpr
    ? {
        berkas: daysBetween(kpr.tanggal_masuk_bank, kpr.tanggal_sp3k_terbit),
        sp3k: daysBetween(kpr.tanggal_sp3k_terbit, kpr.tanggal_akad),
        akad: daysBetween(kpr.tanggal_dp, kpr.tanggal_akad),
        serah: daysBetween(kpr.tanggal_akad, kpr.tanggal_serah_terima_kunci),
      }
    : {};

  return (
    <div>
      <PageTitle
        title="Konsumen"
        subtitle={`${customers.length} konsumen tercatat`}
        action={<PrimaryButton onClick={() => setShowForm((v) => !v)}>+ Konsumen Baru</PrimaryButton>}
      />

      {showForm && (
        <Card style={{ marginBottom: 18 }}>
          <div className="rg-3" style={{ marginBottom: 12 }}>
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
          {error && <div style={{ color: "#c25b5b", fontSize: 12, marginBottom: 10 }}>{error}</div>}
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
                  style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: "5px 9px", fontSize: 12 }}
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
              key: "kpr",
              label: "Progres KPR",
              render: (row) => (
                <button onClick={() => openCustomer(row.id)} style={linkButtonStyle}>
                  {selectedCustomerId === row.id ? "Tutup" : "Kelola"}
                </button>
              ),
            },
            {
              key: "aksi",
              label: "",
              render: (row) => (
                <DeleteButton
                  itemName={row.name}
                  warning="Progres KPR, dokumen, riwayat pembayaran dan pembatalan milik konsumen ini ikut terhapus permanen. Komplain yang sudah ada tetap tersimpan tanpa kaitan konsumen."
                  onDelete={() => supabase.from("customers").delete().eq("id", row.id)}
                  onDone={() => {
                    if (selectedCustomerId === row.id) {
                      setSelectedCustomerId(null);
                      setKpr(null);
                      setDocuments([]);
                    }
                    fetchAll();
                  }}
                />
              ),
            },
            {
              key: "aksi",
              label: "",
              render: (row) => (
                <DeleteButton
                  itemName={row.name}
                  warning="Progres KPR, dokumen, riwayat pembayaran dan pembatalan milik konsumen ini ikut terhapus permanen. Komplain yang sudah ada tetap tersimpan tanpa kaitan konsumen."
                  onDelete={() => supabase.from("customers").delete().eq("id", row.id)}
                  onDone={() => {
                    if (selectedCustomerId === row.id) {
                      setSelectedCustomerId(null);
                      setKpr(null);
                      setDocuments([]);
                    }
                    fetchAll();
                  }}
                />
              ),
            },
          ]}
          rows={customers}
        />
      </Card>

      {selectedCustomerId && kpr && (
        <Card style={{ marginTop: 18 }}>
          <PageTitle title="Progres KPR" subtitle="Booking → DP → Bank → SP3K → Akad → Serah Terima Kunci → BPHTB → SHM" />
          <div className="rg-3" style={{ marginBottom: 14 }}>
            {KPR_FIELDS.map((field) => (
              <div key={field.key}>
                <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>{field.label}</div>
                {renderKprInput(field)}
              </div>
            ))}
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Kendala atau Catatan</div>
              <textarea value={kpr.kendala ?? ""} onChange={(e) => setKprField("kendala", e.target.value)} style={{ ...inputStyle, width: "100%", minHeight: 56, resize: "vertical", fontFamily: "inherit" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Alamat KTP</div>
              <input value={kpr.alamat_ktp ?? ""} onChange={(e) => setKprField("alamat_ktp", e.target.value)} style={{ ...inputStyle, width: "100%" }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, fontSize: 12, color: TEXT_MID, marginBottom: 14, flexWrap: "wrap" }}>
            {durations.berkas != null && <span>Pengumpulan berkas: <b>{durations.berkas} hari</b></span>}
            {durations.sp3k != null && <span>SP3K → Akad: <b>{durations.sp3k} hari</b></span>}
            {durations.akad != null && <span>Persiapan akad: <b>{durations.akad} hari</b></span>}
            {durations.serah != null && <span>Persiapan serah terima: <b>{durations.serah} hari</b></span>}
          </div>

          <PrimaryButton onClick={saveKpr} disabled={kprSaving}>
            {kprSaving ? "Menyimpan..." : "Simpan Progres KPR"}
          </PrimaryButton>

          <div style={{ marginTop: 22, borderTop: `1px solid ${BORDER}`, paddingTop: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Dokumen Administrasi</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
              <select value={docType} onChange={(e) => setDocType(e.target.value)} style={inputStyle}>
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
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
                    <select value={row.status} onChange={(e) => updateDocStatus(row.id, e.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: "5px 9px", fontSize: 12 }}>
                      {DOC_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  ),
                },
                {
                  key: "aksi",
                  label: "",
                  render: (row) => (
                    <DeleteButton
                      itemName={row.doc_type}
                      onDelete={() => supabase.from("customer_documents").delete().eq("id", row.id)}
                      onDone={() => fetchDocumentsFor(selectedCustomerId)}
                    />
                  ),
                },
                {
                  key: "aksi",
                  label: "",
                  render: (row) => (
                    <DeleteButton
                      itemName={row.doc_type}
                      onDelete={() => supabase.from("customer_documents").delete().eq("id", row.id)}
                      onDone={() => fetchDocumentsFor(selectedCustomerId)}
                    />
                  ),
                },
              ]}
              rows={documents}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

const inputStyle = {
  padding: "10px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const linkButtonStyle = {
  border: `1px solid ${BORDER}`,
  background: "#fff",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 11,
  cursor: "pointer",
};
