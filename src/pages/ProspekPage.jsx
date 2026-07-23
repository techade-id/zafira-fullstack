import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, PageTitle, PrimaryButton, Badge, DataTable, ORANGE_PALE, BORDER } from "../components/ui";

const STATUS_OPTIONS = ["baru", "dihubungi", "appointment", "closing", "cancel"];

export default function ProspekPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", source: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchLeads() {
    setLoading(true);
    const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (!error) setLeads(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchLeads();
  }, []);

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
      email: form.email.trim() || null,
      source: form.source.trim() || null,
      status: "baru",
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm({ name: "", phone: "", email: "", source: "" });
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <input placeholder="Nama" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <input placeholder="Telepon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
            <input placeholder="Sumber (Website, Referral, dll)" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} style={inputStyle} />
          </div>
          {error && <div style={{ color: "#d94141", fontSize: 12, marginBottom: 10 }}>{error}</div>}
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
            { key: "phone", label: "Telepon" },
            { key: "source", label: "Sumber" },
            {
              key: "status",
              label: "Status",
              render: (row) => (
                <select
                  value={row.status}
                  onChange={(e) => updateStatus(row.id, e.target.value)}
                  style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 8px", fontSize: 12 }}
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
  borderRadius: 8,
  fontSize: 13,
  outline: "none",
};
