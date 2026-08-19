import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useBusinessSettings } from "../lib/useBusinessSettings";
import { Card, PageTitle, SectionTitle, PrimaryButton, Badge, DataTable, BORDER, TEXT_MID, PRIMARY, PRIMARY_SOFT, DeleteButton } from "../components/ui";

const STAGES = [1, 2, 3, 4];

const emptyForm = {
  project_id: "",
  contractor_id: "",
  task_name: "",
  unit_id: "",
  dokumen_kerja_url: "",
  pic: "",
  tanggal_mulai: "",
  working_days: "",
  hari_garansi: "",
};

function fmt(d) {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString("id-ID") : "-";
}

export default function RencanaProyekPage() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailSaving, setDetailSaving] = useState(false);

  const picOptions = useBusinessSettings("pic");
  const jenisPekerjaan = useBusinessSettings("jenis_pekerjaan");

  async function fetchAll() {
    setLoading(true);
    const [{ data: t }, { data: p }, { data: u }, { data: c }] = await Promise.all([
      supabase.from("project_tasks").select("*, contractors(name), projects(name)").order("tanggal_mulai", { ascending: false }),
      supabase.from("projects").select("id, name").order("name"),
      supabase.from("units").select("id, unit_code, project_id").order("unit_code"),
      supabase.from("contractors").select("id, name").order("name"),
    ]);
    setTasks(t || []);
    setProjects(p || []);
    setUnits(u || []);
    setContractors(c || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
  }, []);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleAdd() {
    if (!form.task_name.trim() || !form.project_id) {
      setError("Proyek dan task wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    const { error } = await supabase.from("project_tasks").insert({
      project_id: form.project_id,
      contractor_id: form.contractor_id || null,
      task_name: form.task_name.trim(),
      unit_id: form.unit_id || null,
      dokumen_kerja_url: form.dokumen_kerja_url.trim() || null,
      pic: form.pic || null,
      tanggal_mulai: form.tanggal_mulai || null,
      working_days: form.working_days ? Number(form.working_days) : null,
      hari_garansi: form.hari_garansi ? Number(form.hari_garansi) : null,
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

  async function openDetail(task) {
    if (selectedId === task.id) {
      setSelectedId(null);
      setDetail(null);
      return;
    }
    setSelectedId(task.id);
    const { data: evals } = await supabase.from("task_evaluations").select("*").eq("task_id", task.id).order("tahap");
    const byStage = {};
    for (const e of evals || []) byStage[e.tahap] = e;
    setDetail({ ...task, _evals: byStage });
  }

  function setDetailField(k, v) {
    setDetail((d) => ({ ...d, [k]: v }));
  }

  function setEvalField(tahap, k, v) {
    setDetail((d) => ({ ...d, _evals: { ...d._evals, [tahap]: { ...(d._evals[tahap] || { tahap }), [k]: v } } }));
  }

  async function saveDetail() {
    setDetailSaving(true);
    setError("");

    const patch = {
      tahap_1: detail.tahap_1 || null,
      tahap_2: detail.tahap_2 || null,
      tahap_3: detail.tahap_3 || null,
      tahap_4: detail.tahap_4 || null,
      tanggal_realisasi_selesai: detail.tanggal_realisasi_selesai || null,
      tanggal_mulai: detail.tanggal_mulai || null,
      working_days: detail.working_days ? Number(detail.working_days) : null,
      hari_garansi: detail.hari_garansi ? Number(detail.hari_garansi) : null,
      dokumen_kerja_url: detail.dokumen_kerja_url || null,
      pic: detail.pic || null,
    };
    const { error: taskErr } = await supabase.from("project_tasks").update(patch).eq("id", detail.id);

    const rows = Object.values(detail._evals || {})
      .filter((e) => e.kerapian || e.spesifikasi || e.ketepatan_waktu)
      .map((e) => ({
        task_id: detail.id,
        tahap: e.tahap,
        kerapian: e.kerapian ? Number(e.kerapian) : null,
        spesifikasi: e.spesifikasi ? Number(e.spesifikasi) : null,
        ketepatan_waktu: e.ketepatan_waktu ? Number(e.ketepatan_waktu) : null,
        catatan: e.catatan || null,
      }));
    let evalErr = null;
    if (rows.length) {
      const res = await supabase.from("task_evaluations").upsert(rows, { onConflict: "task_id,tahap" });
      evalErr = res.error;
    }

    setDetailSaving(false);
    if (taskErr || evalErr) {
      setError((taskErr || evalErr).message);
      return;
    }
    await fetchAll();
    const { data: fresh } = await supabase.from("project_tasks").select("*, contractors(name), projects(name)").eq("id", detail.id).maybeSingle();
    if (fresh) setDetail((d) => ({ ...fresh, _evals: d._evals }));
  }

  const projectUnits = units.filter((u) => !form.project_id || u.project_id === form.project_id);

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.tanggal_realisasi_selesai).length;
  const overtimeTasks = tasks.filter((t) => t.overtime).length;

  return (
    <div>
      <PageTitle
        title="Rencana Proyek"
        subtitle="Rencana dan realisasi pembangunan per task, dengan deadline hari kerja dan masa garansi"
        action={<PrimaryButton onClick={() => setShowForm((v) => !v)}>+ Task Baru</PrimaryButton>}
      />

      <div className="rg-3" style={{ marginBottom: 16 }}>
        <Card>
          <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 8 }}>Total Task</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{totalTasks}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 8 }}>Selesai</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: PRIMARY }}>{doneTasks}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 8 }}>Overtime</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#c25b5b" }}>{overtimeTasks}</div>
        </Card>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 18 }}>
          <div className="rg-3" style={{ marginBottom: 12 }}>
            <select value={form.project_id} onChange={(e) => set("project_id", e.target.value)} style={inputStyle}>
              <option value="">Pilih Proyek *</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select value={form.contractor_id} onChange={(e) => set("contractor_id", e.target.value)} style={inputStyle}>
              <option value="">Kontraktor</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select value={form.pic} onChange={(e) => set("pic", e.target.value)} style={inputStyle}>
              <option value="">PIC</option>
              {picOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <select
              value={form.unit_id ? `unit:${form.unit_id}` : form.task_name ? `kerja:${form.task_name}` : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith("unit:")) {
                  const id = v.slice(5);
                  set("unit_id", id);
                  set("task_name", projectUnits.find((u) => u.id === id)?.unit_code || "");
                } else if (v.startsWith("kerja:")) {
                  set("unit_id", "");
                  set("task_name", v.slice(6));
                } else {
                  set("unit_id", "");
                  set("task_name", "");
                }
              }}
              style={{ ...inputStyle, gridColumn: "span 2" }}
            >
              <option value="">Task / Activities *</option>
              <optgroup label="Unit">
                {projectUnits.map((u) => (
                  <option key={u.id} value={`unit:${u.id}`}>{u.unit_code}</option>
                ))}
              </optgroup>
              <optgroup label="Pekerjaan Umum">
                {jenisPekerjaan.map((j) => (
                  <option key={j} value={`kerja:${j}`}>{j}</option>
                ))}
              </optgroup>
            </select>
            <input placeholder="Dokumen Kerja (link)" value={form.dokumen_kerja_url} onChange={(e) => set("dokumen_kerja_url", e.target.value)} style={inputStyle} />

            <div>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Tanggal Mulai</div>
              <input type="date" value={form.tanggal_mulai} onChange={(e) => set("tanggal_mulai", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Working Days</div>
              <input type="number" value={form.working_days} onChange={(e) => set("working_days", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Hari Garansi</div>
              <input type="number" value={form.hari_garansi} onChange={(e) => set("hari_garansi", e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 10 }}>
            Rencana deadline dihitung otomatis dari tanggal mulai + working days, mengikuti pengaturan hari libur dan kalender libur.
          </div>
          {error && <div style={{ color: "#c25b5b", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <PrimaryButton onClick={handleAdd} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan Task"}
          </PrimaryButton>
        </Card>
      )}

      <Card>
        <DataTable
          loading={loading}
          emptyLabel="Belum ada rencana proyek."
          columns={[
            { key: "task_name", label: "Task / Activities" },
            { key: "contractor", label: "Kontraktor", render: (r) => r.contractors?.name || "-" },
            { key: "pic", label: "PIC", render: (r) => r.pic || "-" },
            { key: "tanggal_mulai", label: "Mulai", render: (r) => fmt(r.tanggal_mulai) },
            { key: "working_days", label: "Hari Kerja", render: (r) => r.working_days ?? "-" },
            { key: "rencana_deadline", label: "Deadline", render: (r) => fmt(r.rencana_deadline) },
            { key: "realisasi", label: "Realisasi", render: (r) => fmt(r.tanggal_realisasi_selesai) },
            {
              key: "overtime",
              label: "Status",
              render: (r) =>
                !r.tanggal_realisasi_selesai ? <Badge value="berjalan" /> : r.overtime ? <Badge value="terlambat" /> : <Badge value="selesai" />,
            },
            { key: "garansi", label: "Akhir Garansi", render: (r) => fmt(r.akhir_masa_garansi) },
            {
              key: "aksi",
              label: "",
              render: (r) => (
                <button onClick={() => openDetail(r)} style={linkBtn}>
                  {selectedId === r.id ? "Tutup" : "Kelola"}
                </button>
              ),
            },
            {
              key: "hapus",
              label: "",
              render: (r) => (
                <DeleteButton
                  itemName={r.task_name}
                  warning="Seluruh evaluasi tahap untuk task ini ikut terhapus."
                  onDelete={() => supabase.from("project_tasks").delete().eq("id", r.id)}
                  onDone={() => {
                    if (selectedId === r.id) {
                      setSelectedId(null);
                      setDetail(null);
                    }
                    fetchAll();
                  }}
                />
              ),
            },
          ]}
          rows={tasks}
        />
      </Card>

      {detail && (
        <Card style={{ marginTop: 18 }}>
          <SectionTitle
            title={`${detail.task_name}`}
            action={
              detail.dokumen_kerja_url ? (
                <a href={detail.dokumen_kerja_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: PRIMARY }}>
                  Buka Dokumen Kerja
                </a>
              ) : null
            }
          />

          <div className="rg-4" style={{ marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Tanggal Mulai</div>
              <input type="date" value={detail.tanggal_mulai || ""} onChange={(e) => setDetailField("tanggal_mulai", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Working Days</div>
              <input type="number" value={detail.working_days || ""} onChange={(e) => setDetailField("working_days", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Rencana Deadline</div>
              <div style={{ ...inputStyle, background: PRIMARY_SOFT, borderColor: "transparent" }}>{fmt(detail.rencana_deadline)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Realisasi Selesai</div>
              <input
                type="date"
                value={detail.tanggal_realisasi_selesai || ""}
                onChange={(e) => setDetailField("tanggal_realisasi_selesai", e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_MID, marginBottom: 8 }}>Tahapan</div>
          <div className="rg-4" style={{ marginBottom: 16 }}>
            {STAGES.map((s) => (
              <div key={s}>
                <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Tahap {s}</div>
                <input type="date" value={detail[`tahap_${s}`] || ""} onChange={(e) => setDetailField(`tahap_${s}`, e.target.value)} style={inputStyle} />
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_MID, marginBottom: 8 }}>
            Evaluasi Kontraktor per Tahap <span style={{ fontWeight: 400 }}>(1–5)</span>
          </div>
          <div style={{ overflowX: "auto", marginBottom: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["Tahap", "Kerapian", "Spesifikasi", "Ketepatan Waktu", "Catatan"].map((h) => (
                    <th key={h} style={{ textAlign: "left", color: TEXT_MID, fontWeight: 500, fontSize: 12, padding: "8px 10px", borderBottom: `1px solid ${BORDER}` }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STAGES.map((s) => {
                  const e = detail._evals?.[s] || {};
                  return (
                    <tr key={s}>
                      <td style={cell}>Tahap {s}</td>
                      {["kerapian", "spesifikasi", "ketepatan_waktu"].map((k) => (
                        <td key={k} style={cell}>
                          <select value={e[k] ?? ""} onChange={(ev) => setEvalField(s, k, ev.target.value)} style={{ ...inputStyle, padding: "6px 8px" }}>
                            <option value="">-</option>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </td>
                      ))}
                      <td style={cell}>
                        <input value={e.catatan ?? ""} onChange={(ev) => setEvalField(s, "catatan", ev.target.value)} style={{ ...inputStyle, padding: "6px 8px" }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {error && <div style={{ color: "#c25b5b", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <PrimaryButton onClick={saveDetail} disabled={detailSaving}>
            {detailSaving ? "Menyimpan..." : "Simpan Perubahan"}
          </PrimaryButton>
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

const cell = { padding: "8px 10px", borderBottom: `1px solid ${BORDER}` };

const linkBtn = {
  border: `1px solid ${BORDER}`,
  background: "#fff",
  borderRadius: 9,
  padding: "5px 11px",
  fontSize: 11,
  cursor: "pointer",
};
