import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { uploadFile, getSignedUrl } from "../lib/storage";
import { useAuth } from "../context/AuthContext";
import { Card, PageTitle, PrimaryButton, DataTable, BORDER, TEXT_MID, ORANGE } from "../components/ui";

const FIELD_STATUS_OPTIONS = ["belum_mulai", "berjalan", "terlambat", "selesai"];

export default function MonitoringLapanganPage() {
  const { profile } = useAuth();
  const [fieldProjects, setFieldProjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ unit_id: "", contractor_id: "", start_date: "", target_end_date: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [reports, setReports] = useState([]);
  const [reportForm, setReportForm] = useState({ progress_percent: "", kendala: "", solusi: "", notes: "" });
  const [photoBefore, setPhotoBefore] = useState(null);
  const [photoAfter, setPhotoAfter] = useState(null);
  const [savingReport, setSavingReport] = useState(false);

  async function fetchAll() {
    setLoading(true);
    const [{ data: fp }, { data: unt }, { data: con }] = await Promise.all([
      supabase.from("field_projects").select("*, units(unit_code), contractors(name)").order("created_at", { ascending: false }),
      supabase.from("units").select("id, unit_code").order("unit_code"),
      supabase.from("contractors").select("id, name").order("name"),
    ]);
    setFieldProjects(fp || []);
    setUnits(unt || []);
    setContractors(con || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchReports(fieldProjectId) {
    const { data } = await supabase.from("field_reports").select("*").eq("field_project_id", fieldProjectId).order("report_date", { ascending: false });
    setReports(data || []);
  }

  function toggleSelected(id) {
    if (selectedId === id) {
      setSelectedId(null);
      setReports([]);
    } else {
      setSelectedId(id);
      fetchReports(id);
    }
  }

  async function handleAddFieldProject() {
    if (!form.unit_id) {
      setError("Pilih unit terlebih dahulu.");
      return;
    }
    setSaving(true);
    setError("");
    const { error } = await supabase.from("field_projects").insert({
      unit_id: form.unit_id,
      contractor_id: form.contractor_id || null,
      start_date: form.start_date || null,
      target_end_date: form.target_end_date || null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm({ unit_id: "", contractor_id: "", start_date: "", target_end_date: "" });
    setShowForm(false);
    fetchAll();
  }

  async function updateProgress(id, progress_percent, status) {
    const patch = { progress_percent };
    if (status) patch.status = status;
    if (progress_percent >= 100) patch.status = "selesai";
    await supabase.from("field_projects").update(patch).eq("id", id);
    fetchAll();
  }

  async function updateFieldStatus(id, status) {
    await supabase.from("field_projects").update({ status }).eq("id", id);
    fetchAll();
  }

  async function handleAddReport() {
    if (!selectedId) return;
    setSavingReport(true);
    const [{ path: beforePath }, { path: afterPath }] = await Promise.all([
      uploadFile("field-report-photos", selectedId, photoBefore),
      uploadFile("field-report-photos", selectedId, photoAfter),
    ]);
    await supabase.from("field_reports").insert({
      field_project_id: selectedId,
      reporter_id: profile?.id || null,
      progress_percent: reportForm.progress_percent ? Number(reportForm.progress_percent) : null,
      kendala: reportForm.kendala.trim() || null,
      solusi: reportForm.solusi.trim() || null,
      notes: reportForm.notes.trim() || null,
      photo_before_url: beforePath,
      photo_after_url: afterPath,
    });
    if (reportForm.progress_percent) {
      await supabase.from("field_projects").update({ progress_percent: Number(reportForm.progress_percent) }).eq("id", selectedId);
    }
    setReportForm({ progress_percent: "", kendala: "", solusi: "", notes: "" });
    setPhotoBefore(null);
    setPhotoAfter(null);
    setSavingReport(false);
    fetchReports(selectedId);
    fetchAll();
  }

  async function viewPhoto(path) {
    const url = await getSignedUrl("field-report-photos", path);
    if (url) window.open(url, "_blank");
  }

  return (
    <div>
      <PageTitle
        title="Monitoring Lapangan"
        subtitle={`${fieldProjects.length} unit dalam pemantauan`}
        action={<PrimaryButton onClick={() => setShowForm((v) => !v)}>+ Mulai Monitoring Unit</PrimaryButton>}
      />

      {showForm && (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <select value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })} style={inputStyle}>
              <option value="">Pilih Unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_code}
                </option>
              ))}
            </select>
            <select value={form.contractor_id} onChange={(e) => setForm({ ...form, contractor_id: e.target.value })} style={inputStyle}>
              <option value="">Pilih Kontraktor (opsional)</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} style={inputStyle} />
            <input type="date" value={form.target_end_date} onChange={(e) => setForm({ ...form, target_end_date: e.target.value })} style={inputStyle} />
          </div>
          {error && <div style={{ color: "#d94141", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <PrimaryButton onClick={handleAddFieldProject} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan"}
          </PrimaryButton>
        </Card>
      )}

      <Card>
        <DataTable
          loading={loading}
          emptyLabel="Belum ada unit dalam pemantauan."
          columns={[
            { key: "unit", label: "Unit", render: (row) => row.units?.unit_code || "-" },
            { key: "contractor", label: "Kontraktor", render: (row) => row.contractors?.name || "-" },
            {
              key: "progress",
              label: "Progres",
              render: (row) => (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ background: BORDER, borderRadius: 20, height: 8, width: 100, overflow: "hidden" }}>
                    <div style={{ background: ORANGE, height: "100%", width: `${row.progress_percent}%` }} />
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={row.progress_percent}
                    onBlur={(e) => updateProgress(row.id, Number(e.target.value))}
                    style={{ width: 50, padding: "3px 6px", border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 12 }}
                  />
                </div>
              ),
            },
            {
              key: "status",
              label: "Status",
              render: (row) => (
                <select
                  value={row.status}
                  onChange={(e) => updateFieldStatus(row.id, e.target.value)}
                  style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 8px", fontSize: 12 }}
                >
                  {FIELD_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ),
            },
            {
              key: "reports",
              label: "Laporan",
              render: (row) => (
                <button onClick={() => toggleSelected(row.id)} style={linkButtonStyle}>
                  {selectedId === row.id ? "Tutup" : "Lihat Laporan"}
                </button>
              ),
            },
          ]}
          rows={fieldProjects}
        />
      </Card>

      {selectedId && (
        <Card style={{ marginTop: 18 }}>
          <PageTitle title="Laporan Lapangan" subtitle="Kendala, solusi, dan foto sebelum/sesudah" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <input
              placeholder="Progres saat ini (%)"
              type="number"
              min={0}
              max={100}
              value={reportForm.progress_percent}
              onChange={(e) => setReportForm({ ...reportForm, progress_percent: e.target.value })}
              style={inputStyle}
            />
            <input placeholder="Catatan (opsional)" value={reportForm.notes} onChange={(e) => setReportForm({ ...reportForm, notes: e.target.value })} style={inputStyle} />
            <textarea
              placeholder="Kendala"
              value={reportForm.kendala}
              onChange={(e) => setReportForm({ ...reportForm, kendala: e.target.value })}
              style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
            />
            <textarea
              placeholder="Solusi"
              value={reportForm.solusi}
              onChange={(e) => setReportForm({ ...reportForm, solusi: e.target.value })}
              style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
            />
            <div>
              <div style={{ fontSize: 12, color: TEXT_MID, marginBottom: 4 }}>Foto Sebelum</div>
              <input type="file" accept="image/*" onChange={(e) => setPhotoBefore(e.target.files?.[0] || null)} style={{ fontSize: 12 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: TEXT_MID, marginBottom: 4 }}>Foto Sesudah</div>
              <input type="file" accept="image/*" onChange={(e) => setPhotoAfter(e.target.files?.[0] || null)} style={{ fontSize: 12 }} />
            </div>
          </div>
          <PrimaryButton onClick={handleAddReport} disabled={savingReport}>
            {savingReport ? "Menyimpan..." : "Simpan Laporan"}
          </PrimaryButton>

          <div style={{ marginTop: 18 }}>
            <DataTable
              emptyLabel="Belum ada laporan lapangan."
              columns={[
                { key: "report_date", label: "Tanggal", render: (row) => new Date(row.report_date).toLocaleDateString("id-ID") },
                { key: "progress_percent", label: "Progres", render: (row) => (row.progress_percent != null ? `${row.progress_percent}%` : "-") },
                { key: "kendala", label: "Kendala", render: (row) => row.kendala || "-" },
                { key: "solusi", label: "Solusi", render: (row) => row.solusi || "-" },
                {
                  key: "photos",
                  label: "Foto",
                  render: (row) => (
                    <div style={{ display: "flex", gap: 6 }}>
                      {row.photo_before_url && (
                        <button onClick={() => viewPhoto(row.photo_before_url)} style={linkButtonStyle}>
                          Sebelum
                        </button>
                      )}
                      {row.photo_after_url && (
                        <button onClick={() => viewPhoto(row.photo_after_url)} style={linkButtonStyle}>
                          Sesudah
                        </button>
                      )}
                      {!row.photo_before_url && !row.photo_after_url && "-"}
                    </div>
                  ),
                },
              ]}
              rows={reports}
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
