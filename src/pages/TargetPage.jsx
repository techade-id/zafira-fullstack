import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, PageTitle, PrimaryButton, DataTable, BORDER } from "../components/ui";

const emptyForm = {
  agent_id: "",
  periode_start: "",
  periode_end: "",
  target_total_prospek: "",
  target_total_closing: "",
  target_prospek_per_hari: "",
  target_closing_per_hari: "",
  target_deal_value: "",
};

export default function TargetPage() {
  const [targets, setTargets] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchAll() {
    setLoading(true);
    const [{ data: t }, { data: a }] = await Promise.all([
      supabase.from("sales_targets").select("*, profiles(full_name)").order("periode_start", { ascending: false }),
      supabase.from("profiles").select("id, full_name").order("full_name"),
    ]);
    setTargets(t || []);
    setAgents(a || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
  }, []);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleAdd() {
    if (!form.periode_start || !form.periode_end) {
      setError("Periode awal dan akhir wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    const { error } = await supabase.from("sales_targets").insert({
      agent_id: form.agent_id || null,
      periode_start: form.periode_start,
      periode_end: form.periode_end,
      target_total_prospek: Number(form.target_total_prospek) || 0,
      target_total_closing: Number(form.target_total_closing) || 0,
      target_prospek_per_hari: Number(form.target_prospek_per_hari) || 0,
      target_closing_per_hari: Number(form.target_closing_per_hari) || 0,
      target_deal_value: Number(form.target_deal_value) || 0,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm(emptyForm);
    setShowForm(false);
    fetchAll();
  }

  return (
    <div>
      <PageTitle
        title="Penetapan Target"
        subtitle={`${targets.length} target tercatat`}
        action={<PrimaryButton onClick={() => setShowForm((v) => !v)}>+ Target Baru</PrimaryButton>}
      />

      {showForm && (
        <Card style={{ marginBottom: 18 }}>
          <div className="rg-3" style={{ marginBottom: 12 }}>
            <select value={form.agent_id} onChange={(e) => set("agent_id", e.target.value)} style={inputStyle}>
              <option value="">Semua Agen / Umum</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.full_name}</option>
              ))}
            </select>
            <input type="date" value={form.periode_start} onChange={(e) => set("periode_start", e.target.value)} style={inputStyle} title="Periode awal" />
            <input type="date" value={form.periode_end} onChange={(e) => set("periode_end", e.target.value)} style={inputStyle} title="Periode akhir" />
            <input placeholder="Target Total Prospek" type="number" value={form.target_total_prospek} onChange={(e) => set("target_total_prospek", e.target.value)} style={inputStyle} />
            <input placeholder="Target Total Closing" type="number" value={form.target_total_closing} onChange={(e) => set("target_total_closing", e.target.value)} style={inputStyle} />
            <input placeholder="Target Deal Value (Rp)" type="number" value={form.target_deal_value} onChange={(e) => set("target_deal_value", e.target.value)} style={inputStyle} />
            <input placeholder="Target Prospek / Hari" type="number" value={form.target_prospek_per_hari} onChange={(e) => set("target_prospek_per_hari", e.target.value)} style={inputStyle} />
            <input placeholder="Target Closing / Hari" type="number" value={form.target_closing_per_hari} onChange={(e) => set("target_closing_per_hari", e.target.value)} style={inputStyle} />
          </div>
          {error && <div style={{ color: "#d94141", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <PrimaryButton onClick={handleAdd} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan Target"}
          </PrimaryButton>
        </Card>
      )}

      <Card>
        <DataTable
          loading={loading}
          emptyLabel="Belum ada target."
          columns={[
            { key: "agent", label: "Agen", render: (row) => row.profiles?.full_name || "Umum" },
            {
              key: "periode",
              label: "Periode",
              render: (row) => `${new Date(row.periode_start).toLocaleDateString("id-ID")} – ${new Date(row.periode_end).toLocaleDateString("id-ID")}`,
            },
            { key: "target_total_prospek", label: "Prospek" },
            { key: "target_total_closing", label: "Closing" },
            { key: "target_prospek_per_hari", label: "Prospek/Hari" },
            { key: "target_closing_per_hari", label: "Closing/Hari" },
            { key: "target_deal_value", label: "Deal Value", render: (row) => `Rp${Number(row.target_deal_value).toLocaleString("id-ID")}` },
          ]}
          rows={targets}
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
