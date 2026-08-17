import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, PageTitle, SectionTitle, PrimaryButton, DataTable, BORDER, TEXT_MID, PRIMARY, PRIMARY_SOFT } from "../components/ui";

function Stars({ value }) {
  if (value == null) return <span style={{ color: TEXT_MID }}>-</span>;
  const v = Number(value);
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <span style={{ color: PRIMARY, letterSpacing: 1 }}>{"★".repeat(Math.round(v))}</span>
      <span style={{ color: BORDER, letterSpacing: 1 }}>{"★".repeat(Math.max(0, 5 - Math.round(v)))}</span>
      <span style={{ marginLeft: 6, fontSize: 12 }}>{v.toFixed(2)}</span>
    </span>
  );
}

export default function KontraktorPage() {
  const [scores, setScores] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [penalti, setPenalti] = useState("0.5");

  const [filter, setFilter] = useState({ project_id: "", from: "", to: "" });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", specialization: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState(null);
  const [taskRows, setTaskRows] = useState([]);

  async function fetchScores() {
    setLoading(true);
    const [{ data: sc, error: scErr }, { data: c }, { data: p }, { data: st }] = await Promise.all([
      supabase.rpc("contractor_scorecard", {
        p_project_id: filter.project_id || null,
        p_from: filter.from || null,
        p_to: filter.to || null,
      }),
      supabase.from("contractors").select("*").order("name"),
      supabase.from("projects").select("id, name").order("name"),
      supabase.from("app_settings").select("value").eq("key", "penalti_per_bobot").maybeSingle(),
    ]);
    if (scErr) setError(scErr.message);
    setScores(sc || []);
    setContractors(c || []);
    setProjects(p || []);
    if (st?.value) setPenalti(st.value);
    setLoading(false);
  }

  useEffect(() => {
    fetchScores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.project_id, filter.from, filter.to]);

  async function openContractor(row) {
    if (selected?.contractor_id === row.contractor_id) {
      setSelected(null);
      setTaskRows([]);
      return;
    }
    setSelected(row);
    const { data } = await supabase
      .from("project_tasks")
      .select("id, task_name, rencana_deadline, tanggal_realisasi_selesai, overtime, task_evaluations(tahap, kerapian, spesifikasi, ketepatan_waktu)")
      .eq("contractor_id", row.contractor_id)
      .order("tanggal_mulai", { ascending: false });
    setTaskRows(data || []);
  }

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
    fetchScores();
  }

  return (
    <div>
      <PageTitle
        title="Evaluasi Kontraktor"
        subtitle="Nilai per tahap: kerapian, spesifikasi, ketepatan waktu — dikurangi bobot komplain"
        action={<PrimaryButton onClick={() => setShowForm((v) => !v)}>+ Kontraktor</PrimaryButton>}
      />

      {showForm && (
        <Card style={{ marginBottom: 18 }}>
          <div className="rg-4" style={{ marginBottom: 12 }}>
            <input placeholder="Nama kontraktor" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <input placeholder="Telepon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
            <input placeholder="Spesialisasi" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} style={inputStyle} />
            <input placeholder="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={inputStyle} />
          </div>
          {error && <div style={{ color: "#c25b5b", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <PrimaryButton onClick={handleAddContractor} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan Kontraktor"}
          </PrimaryButton>
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: TEXT_MID }}>Proyek</span>
          <select value={filter.project_id} onChange={(e) => setFilter({ ...filter, project_id: e.target.value })} style={inputStyle}>
            <option value="">Semua proyek</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <span style={{ fontSize: 12, color: TEXT_MID }}>Mulai</span>
          <input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} style={inputStyle} />
          <span style={{ fontSize: 12, color: TEXT_MID }}>s/d</span>
          <input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} style={inputStyle} />
        </div>
      </Card>

      <Card>
        <DataTable
          loading={loading}
          emptyLabel="Belum ada task yang dievaluasi."
          columns={[
            { key: "contractor_name", label: "Kontraktor" },
            { key: "jumlah_task", label: "Task", render: (r) => `${r.jumlah_selesai}/${r.jumlah_task}` },
            { key: "rata_kerapian", label: "Kerapian", render: (r) => <Stars value={r.rata_kerapian} /> },
            { key: "rata_spesifikasi", label: "Spesifikasi", render: (r) => <Stars value={r.rata_spesifikasi} /> },
            { key: "rata_ketepatan", label: "Ketepatan Waktu", render: (r) => <Stars value={r.rata_ketepatan} /> },
            { key: "jumlah_komplain", label: "Komplain", render: (r) => `${r.jumlah_komplain} (bobot ${Number(r.total_bobot || 0)})` },
            {
              key: "nilai_akhir",
              label: "Nilai Akhir",
              render: (r) => <span style={{ fontWeight: 700 }}>{r.nilai_akhir == null ? "-" : Number(r.nilai_akhir).toFixed(2)}</span>,
            },
            {
              key: "aksi",
              label: "",
              render: (r) => (
                <button onClick={() => openContractor(r)} style={linkBtn}>
                  {selected?.contractor_id === r.contractor_id ? "Tutup" : "Detail"}
                </button>
              ),
            },
          ]}
          rows={scores}
        />
        <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 12, background: PRIMARY_SOFT, padding: "10px 12px", borderRadius: 10 }}>
          Rata-rata tiap kriteria = total nilai ÷ (4 tahap × jumlah task), sesuai rumus di spreadsheet — task yang belum dievaluasi penuh
          otomatis bernilai lebih rendah. <b>Nilai Akhir</b> = rata-rata 3 kriteria − ({penalti} × total bobot komplain ÷ jumlah task).
          Faktor pengurang dapat diubah di Pengaturan Bisnis.
        </div>
      </Card>

      {selected && (
        <Card style={{ marginTop: 18 }}>
          <SectionTitle title={`Task — ${selected.contractor_name}`} />
          <DataTable
            emptyLabel="Belum ada task."
            columns={[
              { key: "task_name", label: "Task" },
              { key: "deadline", label: "Deadline", render: (r) => (r.rencana_deadline ? new Date(`${r.rencana_deadline}T00:00:00`).toLocaleDateString("id-ID") : "-") },
              {
                key: "realisasi",
                label: "Realisasi",
                render: (r) => (r.tanggal_realisasi_selesai ? new Date(`${r.tanggal_realisasi_selesai}T00:00:00`).toLocaleDateString("id-ID") : "-"),
              },
              { key: "ot", label: "Overtime", render: (r) => (r.overtime ? "Ya" : "-") },
              { key: "dinilai", label: "Tahap Dinilai", render: (r) => `${(r.task_evaluations || []).length}/4` },
            ]}
            rows={taskRows}
          />
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
};

const linkBtn = {
  border: `1px solid ${BORDER}`,
  background: "#fff",
  borderRadius: 9,
  padding: "5px 11px",
  fontSize: 11,
  cursor: "pointer",
};
