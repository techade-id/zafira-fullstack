import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { POSISI, labelPosisi } from "../lib/siteplan";
import { rupiah } from "../lib/format";
import InputRupiah from "../components/InputRupiah";
import { Card, PageTitle, PrimaryButton, DataTable, BORDER, TEXT_MID, ORANGE_LIGHT, DeleteButton, EditButton, RowActions } from "../components/ui";

const UNIT_STATUS_OPTIONS = ["tersedia", "booking", "terjual", "batal"];

export default function ProyekPage() {
  const [projects, setProjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeProjectId, setActiveProjectId] = useState(null);

  const [showProjectForm, setShowProjectForm] = useState(false);
  const formProyekKosong = { name: "", location: "", description: "", tarif_tanah_per_m2: "1000000", biaya_kavling_strategis: "0" };
  const [projectForm, setProjectForm] = useState(formProyekKosong);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [savingProject, setSavingProject] = useState(false);

  const [showUnitForm, setShowUnitForm] = useState(false);
  const formUnitKosong = { unit_code: "", block: "", type: "", price: "", luas_tanah: "", posisi: "standar" };
  const [unitForm, setUnitForm] = useState(formUnitKosong);
  const [editingUnitId, setEditingUnitId] = useState(null);

  function resetProjectForm() {
    setProjectForm(formProyekKosong);
    setEditingProjectId(null);
    setShowProjectForm(false);
    setError("");
  }

  function startEditProject(proj) {
    setProjectForm({
      name: proj.name || "",
      location: proj.location || "",
      description: proj.description || "",
      tarif_tanah_per_m2: proj.tarif_tanah_per_m2 ?? "1000000",
      biaya_kavling_strategis: proj.biaya_kavling_strategis ?? "0",
    });
    setEditingProjectId(proj.id);
    setShowProjectForm(true);
    setError("");
  }

  function resetUnitForm() {
    setUnitForm(formUnitKosong);
    setEditingUnitId(null);
    setShowUnitForm(false);
    setError("");
  }

  function startEditUnit(u) {
    setUnitForm({
      unit_code: u.unit_code || "",
      block: u.block || "",
      type: u.type || "",
      price: u.price ?? "",
      luas_tanah: u.luas_tanah ?? "",
      posisi: u.posisi || "standar",
    });
    setEditingUnitId(u.id);
    setShowUnitForm(true);
    setError("");
  }
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
    const payload = {
      name: projectForm.name.trim(),
      location: projectForm.location.trim() || null,
      description: projectForm.description.trim() || null,
      // Kolom migrasi 027 — dasar hitungan tambahan tanah dan kavling hook.
      tarif_tanah_per_m2: Number(projectForm.tarif_tanah_per_m2) || 0,
      biaya_kavling_strategis: Number(projectForm.biaya_kavling_strategis) || 0,
    };
    const { error } = editingProjectId
      ? await supabase.from("projects").update(payload).eq("id", editingProjectId)
      : await supabase.from("projects").insert(payload);
    setSavingProject(false);
    if (error) {
      setError(error.message);
      return;
    }
    resetProjectForm();
    fetchAll();
  }

  async function handleAddUnit() {
    if (!activeProjectId || !unitForm.unit_code.trim()) {
      setError("Pilih proyek dan isi kode unit.");
      return;
    }
    setSavingUnit(true);
    setError("");
    const payload = {
      unit_code: unitForm.unit_code.trim(),
      block: unitForm.block.trim() || null,
      type: unitForm.type.trim() || null,
      price: unitForm.price ? Number(unitForm.price) : null,
      luas_tanah: unitForm.luas_tanah ? Number(unitForm.luas_tanah) : null,
      posisi: unitForm.posisi || null,
    };
    const { error } = editingUnitId
      ? await supabase.from("units").update(payload).eq("id", editingUnitId)
      : await supabase.from("units").insert({ ...payload, project_id: activeProjectId });
    setSavingUnit(false);
    if (error) {
      setError(error.message);
      return;
    }
    resetUnitForm();
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
        action={<PrimaryButton subject="project" onClick={() => setShowProjectForm((v) => !v)}>+ Proyek Baru</PrimaryButton>}
      />

      {showProjectForm && (
        <Card style={{ marginBottom: 18 }}>
          <div className="rg-3" style={{ marginBottom: 12 }}>
            <input placeholder="Nama proyek" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} style={inputStyle} />
            <input placeholder="Lokasi" value={projectForm.location} onChange={(e) => setProjectForm({ ...projectForm, location: e.target.value })} style={inputStyle} />
            <input placeholder="Deskripsi singkat" value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} style={inputStyle} />
          </div>
          {/* Dibaca otomatis saat Konversi ke Booking: kavling yang lebih
              luas dari tipenya membayar kelebihannya, kavling hook membayar
              biaya strategis. */}
          <div className="rg-2" style={{ marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Tarif kelebihan tanah per m²</div>
              <InputRupiah value={projectForm.tarif_tanah_per_m2} onChange={(v) => setProjectForm({ ...projectForm, tarif_tanah_per_m2: v })} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Biaya kavling strategis (hook)</div>
              <InputRupiah value={projectForm.biaya_kavling_strategis} onChange={(v) => setProjectForm({ ...projectForm, biaya_kavling_strategis: v })} />
            </div>
          </div>
          {error && <div style={{ color: "#C2413B", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <PrimaryButton subject="project" onClick={handleAddProject} disabled={savingProject}>
              {savingProject ? "Menyimpan..." : editingProjectId ? "Simpan Perubahan" : "Simpan Proyek"}
            </PrimaryButton>
            {editingProjectId && (
              <button onClick={resetProjectForm} style={{ border: `1px solid ${BORDER}`, background: "#fff", color: TEXT_MID, borderRadius: 999, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Batal
              </button>
            )}
          </div>
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
            subtitle={[
              activeProject.location,
              `Kelebihan tanah ${rupiah(activeProject.tarif_tanah_per_m2, { kosong: "Rp0" })}/m²`,
              `Kavling hook ${rupiah(activeProject.biaya_kavling_strategis, { kosong: "Rp0" })}`,
            ]
              .filter(Boolean)
              .join(" · ")}
            action={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <EditButton label="Ubah Proyek" onClick={() => startEditProject(activeProject)} />
                <DeleteButton
                  subject="project_delete"
                  label="Hapus Proyek"
                  itemName={activeProject.name}
                  warning={`Seluruh ${projectUnits.length} unit di proyek ini ikut terhapus permanen, termasuk posisinya pada Siteplan Digital.`}
                  onDelete={() => supabase.from("projects").delete().eq("id", activeProject.id)}
                  onDone={() => {
                    setActiveProjectId(null);
                    fetchAll();
                  }}
                />
                <PrimaryButton subject="project" onClick={() => setShowUnitForm((v) => !v)}>+ Unit</PrimaryButton>
              </div>
            }
          />

          {showUnitForm && (
            <div className="rg-4" style={{ marginBottom: 14 }}>
              <input placeholder="Kode unit (mis. A-01)" value={unitForm.unit_code} onChange={(e) => setUnitForm({ ...unitForm, unit_code: e.target.value })} style={inputStyle} />
              <input placeholder="Blok" value={unitForm.block} onChange={(e) => setUnitForm({ ...unitForm, block: e.target.value })} style={inputStyle} />
              <input placeholder="Tipe (mis. 36/72)" value={unitForm.type} onChange={(e) => setUnitForm({ ...unitForm, type: e.target.value })} style={inputStyle} />
              <input placeholder="Harga (Rp)" type="number" value={unitForm.price} onChange={(e) => setUnitForm({ ...unitForm, price: e.target.value })} style={inputStyle} />
              <input
                placeholder="Luas tanah kavling (m²)"
                type="number"
                min="0"
                value={unitForm.luas_tanah}
                onChange={(e) => setUnitForm({ ...unitForm, luas_tanah: e.target.value })}
                title="Luas tanah sebenarnya. Kelebihan dari angka tanah pada tipe (mis. 36/72 → 72 m²) dihitung sebagai tambahan tanah."
                style={inputStyle}
              />
              <select value={unitForm.posisi} onChange={(e) => setUnitForm({ ...unitForm, posisi: e.target.value })} aria-label="Posisi kavling" style={inputStyle}>
                {POSISI.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <div style={{ gridColumn: "1 / -1" }}>
                {error && <div style={{ color: "#C2413B", fontSize: 12, marginBottom: 8 }}>{error}</div>}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <PrimaryButton subject="project" onClick={handleAddUnit} disabled={savingUnit}>
                    {savingUnit ? "Menyimpan..." : editingUnitId ? "Simpan Perubahan" : "Simpan Unit"}
                  </PrimaryButton>
                  {editingUnitId && (
                    <button onClick={resetUnitForm} style={{ border: `1px solid ${BORDER}`, background: "#fff", color: TEXT_MID, borderRadius: 999, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      Batal
                    </button>
                  )}
                </div>
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
              { key: "luas_tanah", label: "Luas Tanah", render: (row) => (row.luas_tanah ? `${Number(row.luas_tanah)} m²` : "-") },
              { key: "posisi", label: "Posisi", render: (row) => labelPosisi(row.posisi) || "-" },
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
                  <RowActions>
                    <EditButton onClick={() => startEditUnit(row)} />
                    <DeleteButton
                      subject="project"
                      itemName={`Unit ${row.unit_code}`}
                      warning="Posisi unit pada Siteplan Digital ikut hilang. Konsumen dan komplain yang terkait tetap ada, hanya kehilangan kaitan unitnya."
                      onDelete={() => supabase.from("units").delete().eq("id", row.id)}
                      onDone={fetchAll}
                    />
                  </RowActions>
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
