import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { Card, PageTitle, PrimaryButton, DataTable, BORDER, TEXT_MID, ORANGE } from "../components/ui";

const SORT_OPTIONS = [
  { value: "score_desc", label: "Skor Tertinggi" },
  { value: "score_asc", label: "Skor Terendah" },
  { value: "name", label: "Nama A-Z" },
];

function Stars({ value }) {
  return (
    <span style={{ color: ORANGE, letterSpacing: 1 }}>
      {"★".repeat(Math.round(value))}
      <span style={{ color: BORDER }}>{"★".repeat(5 - Math.round(value))}</span>
    </span>
  );
}

export default function KontraktorPage() {
  const { profile } = useAuth();
  const [contractors, setContractors] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("score_desc");
  const [minScore, setMinScore] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", specialization: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [evalForm, setEvalForm] = useState({ unit_id: "", score: "5", notes: "" });
  const [savingEval, setSavingEval] = useState(false);

  async function fetchAll() {
    setLoading(true);
    const [{ data: con }, { data: ev }, { data: unt }] = await Promise.all([
      supabase.from("contractors").select("*").order("name"),
      supabase.from("contractor_evaluations").select("*"),
      supabase.from("units").select("id, unit_code").order("unit_code"),
    ]);
    setContractors(con || []);
    setEvaluations(ev || []);
    setUnits(unt || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
  }, []);

  const contractorsWithScore = useMemo(() => {
    return contractors.map((c) => {
      const evals = evaluations.filter((e) => e.contractor_id === c.id);
      const avg = evals.length ? evals.reduce((sum, e) => sum + e.score, 0) / evals.length : 0;
      return { ...c, avgScore: avg, evalCount: evals.length };
    });
  }, [contractors, evaluations]);

  const filteredSorted = useMemo(() => {
    let list = contractorsWithScore.filter((c) => c.avgScore >= minScore);
    if (sortBy === "score_desc") list = [...list].sort((a, b) => b.avgScore - a.avgScore);
    if (sortBy === "score_asc") list = [...list].sort((a, b) => a.avgScore - b.avgScore);
    if (sortBy === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [contractorsWithScore, sortBy, minScore]);

  const selectedEvaluations = evaluations.filter((e) => e.contractor_id === selectedId);

  async function handleAddContractor() {
    if (!form.name.trim()) {
      setError("Nama kontraktor wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    const { error } = await supabase.from("contractors").insert({
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      specialization: form.specialization.trim() || null,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm({ name: "", phone: "", specialization: "", notes: "" });
    setShowForm(false);
    fetchAll();
  }

  async function handleAddEvaluation() {
    if (!selectedId) return;
    setSavingEval(true);
    await supabase.from("contractor_evaluations").insert({
      contractor_id: selectedId,
      unit_id: evalForm.unit_id || null,
      score: Number(evalForm.score),
      notes: evalForm.notes.trim() || null,
      evaluated_by: profile?.id || null,
    });
    setEvalForm({ unit_id: "", score: "5", notes: "" });
    setSavingEval(false);
    fetchAll();
  }

  return (
    <div>
      <PageTitle
        title="Kontraktor"
        subtitle={`${contractors.length} kontraktor terdaftar`}
        action={<PrimaryButton onClick={() => setShowForm((v) => !v)}>+ Kontraktor Baru</PrimaryButton>}
      />

      {showForm && (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <input placeholder="Nama kontraktor" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <input placeholder="Telepon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
            <input placeholder="Spesialisasi" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} style={inputStyle} />
            <input placeholder="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={inputStyle} />
          </div>
          {error && <div style={{ color: "#d94141", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <PrimaryButton onClick={handleAddContractor} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan Kontraktor"}
          </PrimaryButton>
        </Card>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: TEXT_MID }}>Urutkan:</span>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={inputStyle}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: TEXT_MID }}>Skor minimum:</span>
        <select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} style={inputStyle}>
          {[0, 1, 2, 3, 4, 5].map((s) => (
            <option key={s} value={s}>
              {s === 0 ? "Semua" : `≥ ${s}`}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <DataTable
          loading={loading}
          emptyLabel="Belum ada kontraktor."
          columns={[
            { key: "name", label: "Nama" },
            { key: "phone", label: "Telepon", render: (row) => row.phone || "-" },
            { key: "specialization", label: "Spesialisasi", render: (row) => row.specialization || "-" },
            {
              key: "score",
              label: "Skor",
              render: (row) => (row.evalCount ? <span><Stars value={row.avgScore} /> ({row.avgScore.toFixed(1)}, {row.evalCount} evaluasi)</span> : "Belum ada evaluasi"),
            },
            {
              key: "eval",
              label: "Evaluasi",
              render: (row) => (
                <button onClick={() => setSelectedId(selectedId === row.id ? null : row.id)} style={linkButtonStyle}>
                  {selectedId === row.id ? "Tutup" : "Kelola"}
                </button>
              ),
            },
          ]}
          rows={filteredSorted}
        />
      </Card>

      {selectedId && (
        <Card style={{ marginTop: 18 }}>
          <PageTitle title="Evaluasi Kontraktor" subtitle="Skor 1-5 per unit yang dikerjakan" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto", gap: 12, marginBottom: 14, alignItems: "center" }}>
            <select value={evalForm.unit_id} onChange={(e) => setEvalForm({ ...evalForm, unit_id: e.target.value })} style={inputStyle}>
              <option value="">Unit (opsional)</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_code}
                </option>
              ))}
            </select>
            <select value={evalForm.score} onChange={(e) => setEvalForm({ ...evalForm, score: e.target.value })} style={inputStyle}>
              {[5, 4, 3, 2, 1].map((s) => (
                <option key={s} value={s}>
                  {s} bintang
                </option>
              ))}
            </select>
            <input placeholder="Catatan evaluasi" value={evalForm.notes} onChange={(e) => setEvalForm({ ...evalForm, notes: e.target.value })} style={inputStyle} />
            <PrimaryButton onClick={handleAddEvaluation} disabled={savingEval}>
              {savingEval ? "..." : "Tambah"}
            </PrimaryButton>
          </div>

          <DataTable
            emptyLabel="Belum ada evaluasi."
            columns={[
              { key: "evaluated_at", label: "Tanggal", render: (row) => new Date(row.evaluated_at).toLocaleDateString("id-ID") },
              { key: "score", label: "Skor", render: (row) => <Stars value={row.score} /> },
              { key: "notes", label: "Catatan", render: (row) => row.notes || "-" },
            ]}
            rows={selectedEvaluations}
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
