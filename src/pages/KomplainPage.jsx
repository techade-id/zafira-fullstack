import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { uploadFile, getSignedUrl } from "../lib/storage";
import { Card, PageTitle, PrimaryButton, Badge, DataTable, BORDER } from "../components/ui";

const PRIORITY_OPTIONS = ["rendah", "sedang", "tinggi"];
const STATUS_OPTIONS = ["baru", "diproses", "selesai"];

export default function KomplainPage() {
  const [complaints, setComplaints] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [units, setUnits] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customer_id: "", unit_id: "", category: "", priority: "sedang", description: "" });
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchAll() {
    setLoading(true);
    const [{ data: comp }, { data: cust }, { data: unt }, { data: prof }] = await Promise.all([
      supabase.from("complaints").select("*, customers(name), units(unit_code), profiles(full_name)").order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name").order("name"),
      supabase.from("units").select("id, unit_code").order("unit_code"),
      supabase.from("profiles").select("id, full_name").order("full_name"),
    ]);
    setComplaints(comp || []);
    setCustomers(cust || []);
    setUnits(unt || []);
    setProfiles(prof || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
  }, []);

  async function handleAddComplaint() {
    if (!form.description.trim()) {
      setError("Deskripsi komplain wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    const { path } = await uploadFile("complaint-photos", "complaints", photo);
    const { error } = await supabase.from("complaints").insert({
      customer_id: form.customer_id || null,
      unit_id: form.unit_id || null,
      category: form.category.trim() || null,
      priority: form.priority,
      description: form.description.trim(),
      photo_url: path,
      status: "baru",
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm({ customer_id: "", unit_id: "", category: "", priority: "sedang", description: "" });
    setPhoto(null);
    setShowForm(false);
    fetchAll();
  }

  async function updateStatus(id, status) {
    const patch = { status };
    if (status === "selesai") patch.resolved_at = new Date().toISOString();
    await supabase.from("complaints").update(patch).eq("id", id);
    fetchAll();
  }

  async function assignTo(id, assignedTo) {
    await supabase.from("complaints").update({ assigned_to: assignedTo || null }).eq("id", id);
    fetchAll();
  }

  async function viewPhoto(path) {
    const url = await getSignedUrl("complaint-photos", path);
    if (url) window.open(url, "_blank");
  }

  return (
    <div>
      <PageTitle
        title="Komplain"
        subtitle={`${complaints.length} komplain tercatat`}
        action={<PrimaryButton onClick={() => setShowForm((v) => !v)}>+ Komplain Baru</PrimaryButton>}
      />

      {showForm && (
        <Card style={{ marginBottom: 18 }}>
          <div className="rg-3" style={{ marginBottom: 12 }}>
            <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} style={inputStyle}>
              <option value="">Konsumen (opsional)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })} style={inputStyle}>
              <option value="">Unit (opsional)</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_code}
                </option>
              ))}
            </select>
            <input placeholder="Kategori (mis. Kualitas Bangunan)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inputStyle} />
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={inputStyle}>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} style={{ fontSize: 13 }} />
            <textarea
              placeholder="Deskripsi komplain"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              style={{ ...inputStyle, gridColumn: "1 / -1", minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
          {error && <div style={{ color: "#c25b5b", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <PrimaryButton onClick={handleAddComplaint} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan Komplain"}
          </PrimaryButton>
        </Card>
      )}

      <Card>
        <DataTable
          loading={loading}
          emptyLabel="Belum ada komplain."
          columns={[
            { key: "target", label: "Konsumen/Unit", render: (row) => row.customers?.name || row.units?.unit_code || "-" },
            { key: "category", label: "Kategori", render: (row) => row.category || "-" },
            { key: "priority", label: "Prioritas", render: (row) => <Badge value={row.priority} /> },
            { key: "description", label: "Deskripsi", render: (row) => <span style={{ whiteSpace: "normal" }}>{row.description}</span> },
            {
              key: "photo",
              label: "Foto",
              render: (row) => (row.photo_url ? <button onClick={() => viewPhoto(row.photo_url)} style={linkButtonStyle}>Lihat</button> : "-"),
            },
            {
              key: "assigned_to",
              label: "PIC",
              render: (row) => (
                <select value={row.assigned_to || ""} onChange={(e) => assignTo(row.id, e.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: "5px 9px", fontSize: 12 }}>
                  <option value="">Belum ditugaskan</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              ),
            },
            {
              key: "status",
              label: "Status",
              render: (row) => (
                <select
                  value={row.status}
                  onChange={(e) => updateStatus(row.id, e.target.value)}
                  style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: "5px 9px", fontSize: 12 }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ),
            },
          ]}
          rows={complaints}
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

const linkButtonStyle = {
  border: `1px solid ${BORDER}`,
  background: "#fff",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 11,
  cursor: "pointer",
};
