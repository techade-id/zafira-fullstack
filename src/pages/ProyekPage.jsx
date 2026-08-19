import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, PageTitle, PrimaryButton, DataTable, BORDER, TEXT_MID, ORANGE_LIGHT, DeleteButton } from "../components/ui";

const UNIT_STATUS_OPTIONS = ["tersedia", "booking", "terjual", "batal"];

export default function ProyekPage() {
  const [projects, setProjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeProjectId, setActiveProjectId] = useState(null);

  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "", location: "", description: "" });
  const [savingProject, setSavingProject] = useState(false);

  const [showUnitForm, setShowUnitForm] = useState(false);
  const [unitForm, setUnitForm] = useState({ unit_code: "", block: "", type: "", price: "" });
  const [savingUnit, setSavingUnit] = useState(false);

  const [error, setError] = useState("");

  async function fetchAll() {
    setLoading(true);
    const [{ data: proj }, { data: unt }] = await Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      supabase.from("units").select("*").order("unit_code"),
    ]);
    setProjects(proj || []);
    setUnits(unt || []);
    if (!activeProjectId && proj?.length) setActiveProjectId(proj[0].id);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
  }, []);

  async function handleAddProject() {
    if (!projectForm.name.trim()) {
      setError("Nama proyek wajib diisi.");
      return;
    }
    setSavingProject(true);
    setError("");
    const { error } = await supabase.from("projects").insert({
      name: projectForm.name.trim(),
      location: projectForm.location.trim() || null,
      description: projectForm.description.trim() || null,
    });
    setSavingProject(false);
    if (error) {
      setError(error.message);
      return;
    }
    setProjectForm({ name: "", location: "", description: "" });
    setShowProjectForm(false);
    fetchAll();
  }

  async function handleAddUnit() {
    if (!activeProjectId || !unitForm.unit_code.trim()) {
      setError("Pilih proyek dan isi kode unit.");
      return;
    }
    setSavingUnit(true);
    setError("");
    const { error } = await supabase.from("units").insert({
      project_id: activeProjectId,
      unit_code: unitForm.unit_code.trim(),
      block: unitForm.block.trim() || null,
      type: unitForm.type.trim() || null,
      price: unitForm.price ? Number(unitForm.price) : null,
    });
    setSavingUnit(false);
    if (error) {
      setError(error.message);
      return;
    }
    setUnitForm({ unit_code: "", block: "", type: "", price: "" });
    setShowUnitForm(false);
    fetchAll();
  }

  async function updateUnitStatus(unitId, status) {
    await supabase.from("units").update({ status }).eq("id", unitId);
    fetchAll();
  }

  const projectUnits = units.filter((u) => u.project_id === activeProjectId);
  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <div>
      <PageTitle
        title="Proyek"
        subtitle={`${projects.length} proyek terdaftar`}
        action={<PrimaryButton onClick={() => setShowProjectForm((v) => !v)}>+ Proyek Baru</PrimaryButton>}
      />

      {showProjectForm && (
        <Card style={{ marginBottom: 18 }}>
          <div className="rg-3" style={{ marginBottom: 12 }}>
            <input placeholder="Nama proyek" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} style={inputStyle} />
            <input placeholder="Lokasi" value={projectForm.location} onChange={(e) => setProjectForm({ ...projectForm, location: e.target.value })} style={inputStyle} />
            <input placeholder="Deskripsi singkat" value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} style={inputStyle} />
          </div>
          {error && <div style={{ color: "#c25b5b", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <PrimaryButton onClick={handleAddProject} disabled={savingProject}>
            {savingProject ? "Menyimpan..." : "Simpan Proyek"}
          </PrimaryButton>
        </Card>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => setActiveProjectId(p.id)}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${BORDER}`,
              background: activeProjectId === p.id ? ORANGE_LIGHT : "#fff",
              fontWeight: activeProjectId === p.id ? 600 : 400,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      {!loading && projects.length === 0 && (
        <Card>
          <div style={{ fontSize: 13, color: TEXT_MID }}>Belum ada proyek. Tambahkan proyek pertama Anda.</div>
        </Card>
      )}

      {activeProject && (
        <Card>
          <PageTitle
            title={`Unit — ${activeProject.name}`}
            subtitle={activeProject.location}
            action={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <DeleteButton
                  label="Hapus Proyek"
                  itemName={activeProject.name}
                  warning={`Seluruh ${projectUnits.length} unit di proyek ini ikut terhapus permanen, termasuk posisinya pada Siteplan Digital.`}
                  onDelete={() => supabase.from("projects").delete().eq("id", activeProject.id)}
                  onDone={() => {
                    setActiveProjectId(null);
                    fetchAll();
                  }}
                />
                <PrimaryButton onClick={() => setShowUnitForm((v) => !v)}>+ Unit</PrimaryButton>
              </div>
            }
          />

          {showUnitForm && (
            <div className="rg-4" style={{ marginBottom: 14 }}>
              <input placeholder="Kode unit (mis. A-01)" value={unitForm.unit_code} onChange={(e) => setUnitForm({ ...unitForm, unit_code: e.target.value })} style={inputStyle} />
              <input placeholder="Blok" value={unitForm.block} onChange={(e) => setUnitForm({ ...unitForm, block: e.target.value })} style={inputStyle} />
              <input placeholder="Tipe (mis. 36/72)" value={unitForm.type} onChange={(e) => setUnitForm({ ...unitForm, type: e.target.value })} style={inputStyle} />
              <input placeholder="Harga (Rp)" type="number" value={unitForm.price} onChange={(e) => setUnitForm({ ...unitForm, price: e.target.value })} style={inputStyle} />
              <div style={{ gridColumn: "1 / -1" }}>
                {error && <div style={{ color: "#c25b5b", fontSize: 12, marginBottom: 8 }}>{error}</div>}
                <PrimaryButton onClick={handleAddUnit} disabled={savingUnit}>
                  {savingUnit ? "Menyimpan..." : "Simpan Unit"}
                </PrimaryButton>
              </div>
            </div>
          )}

          <DataTable
            loading={loading}
            emptyLabel="Belum ada unit di proyek ini."
            columns={[
              { key: "unit_code", label: "Kode Unit" },
              { key: "block", label: "Blok", render: (row) => row.block || "-" },
              { key: "type", label: "Tipe", render: (row) => row.type || "-" },
              { key: "price", label: "Harga", render: (row) => (row.price ? `Rp${Number(row.price).toLocaleString("id-ID")}` : "-") },
              {
                key: "status",
                label: "Status",
                render: (row) => (
                  <select
                    value={row.status}
                    onChange={(e) => updateUnitStatus(row.id, e.target.value)}
                    style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: "5px 9px", fontSize: 12 }}
                  >
                    {UNIT_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ),
              },
              {
                key: "hapus",
                label: "",
                render: (row) => (
                  <DeleteButton
                    itemName={`Unit ${row.unit_code}`}
                    warning="Posisi unit pada Siteplan Digital ikut hilang. Konsumen dan komplain yang terkait tetap ada, hanya kehilangan kaitan unitnya."
                    onDelete={() => supabase.from("units").delete().eq("id", row.id)}
                    onDone={fetchAll}
                  />
                ),
              },
            ]}
            rows={projectUnits}
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
