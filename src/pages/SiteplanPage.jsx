import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { uploadFile, getPublicUrl } from "../lib/storage";
import { Card, PageTitle, PrimaryButton, Badge, TEXT_MID, BORDER, ORANGE, ORANGE_LIGHT } from "../components/ui";

const PIN_COLORS = {
  tersedia: "#28864a",
  booking: "#e8630a",
  terjual: "#185fa5",
  batal: "#c23b3b",
};

export default function SiteplanPage() {
  const [projects, setProjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [placingUnitId, setPlacingUnitId] = useState("");
  const [modalUnit, setModalUnit] = useState(null);
  const [modalCustomer, setModalCustomer] = useState(null);
  const [modalFieldProject, setModalFieldProject] = useState(null);

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

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const projectUnits = units.filter((u) => u.project_id === activeProjectId);
  const placedUnits = projectUnits.filter((u) => u.pos_x != null && u.pos_y != null);
  const unplacedUnits = projectUnits.filter((u) => u.pos_x == null || u.pos_y == null);

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !activeProjectId) return;
    setUploading(true);
    const { path, error } = await uploadFile("siteplan-images", activeProjectId, file);
    if (!error && path) {
      const url = getPublicUrl("siteplan-images", path);
      await supabase.from("projects").update({ siteplan_image_url: url }).eq("id", activeProjectId);
      fetchAll();
    }
    setUploading(false);
  }

  async function handleImageClick(e) {
    if (!placingUnitId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos_x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const pos_y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    await supabase.from("units").update({ pos_x, pos_y }).eq("id", placingUnitId);
    setPlacingUnitId("");
    fetchAll();
  }

  async function openUnit(unit) {
    setModalUnit(unit);
    const [{ data: cust }, { data: fp }] = await Promise.all([
      supabase.from("customers").select("*").eq("unit_id", unit.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("field_projects").select("*").eq("unit_id", unit.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setModalCustomer(cust || null);
    setModalFieldProject(fp || null);
  }

  function closeModal() {
    setModalUnit(null);
    setModalCustomer(null);
    setModalFieldProject(null);
  }

  return (
    <div>
      <PageTitle title="Siteplan Digital" subtitle="Klik unit pada peta untuk melihat konsumen dan progres pembangunan" />

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setActiveProjectId(p.id);
              setPlacingUnitId("");
            }}
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
          <div style={{ fontSize: 13, color: TEXT_MID }}>Belum ada proyek. Buat proyek terlebih dahulu di halaman Proyek.</div>
        </Card>
      )}

      {activeProject && (
        <div className="siteplan-layout">
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 13, color: TEXT_MID }}>
                {placingUnitId ? "Klik pada gambar untuk menempatkan unit terpilih." : "Peta siteplan — klik pin untuk detail unit."}
              </div>
              <label style={{ fontSize: 12, cursor: "pointer", color: ORANGE, fontWeight: 600 }}>
                {uploading ? "Mengunggah..." : activeProject.siteplan_image_url ? "Ganti Gambar Siteplan" : "Unggah Gambar Siteplan"}
                <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} disabled={uploading} />
              </label>
            </div>

            {activeProject.siteplan_image_url ? (
              <div
                onClick={handleImageClick}
                style={{
                  position: "relative",
                  width: "100%",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  overflow: "hidden",
                  cursor: placingUnitId ? "crosshair" : "default",
                }}
              >
                <img src={activeProject.siteplan_image_url} alt="Siteplan" style={{ width: "100%", display: "block" }} />
                {placedUnits.map((u) => (
                  <button
                    key={u.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      openUnit(u);
                    }}
                    title={u.unit_code}
                    style={{
                      position: "absolute",
                      left: `${u.pos_x * 100}%`,
                      top: `${u.pos_y * 100}%`,
                      transform: "translate(-50%, -50%)",
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      border: "2px solid #fff",
                      background: PIN_COLORS[u.status] || "#5f5e5a",
                      color: "#fff",
                      fontSize: 9,
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                    }}
                  >
                    {u.unit_code.slice(-2)}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ padding: 40, textAlign: "center", color: TEXT_MID, fontSize: 13, border: `1px dashed ${BORDER}`, borderRadius: 10 }}>
                Belum ada gambar siteplan untuk proyek ini. Unggah gambar untuk mulai menempatkan unit.
              </div>
            )}

            <div style={{ display: "flex", gap: 14, marginTop: 14, fontSize: 12, color: TEXT_MID, flexWrap: "wrap" }}>
              {Object.entries(PIN_COLORS).map(([status, color]) => (
                <div key={status} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
                  {status}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Unit Belum Ditempatkan ({unplacedUnits.length})</div>
            {unplacedUnits.length === 0 && <div style={{ fontSize: 12, color: TEXT_MID }}>Semua unit sudah ditempatkan di peta.</div>}
            {unplacedUnits.map((u) => (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: `1px solid ${BORDER}`,
                  fontSize: 12,
                }}
              >
                <span>{u.unit_code}</span>
                <button
                  onClick={() => setPlacingUnitId(placingUnitId === u.id ? "" : u.id)}
                  style={{
                    border: `1px solid ${BORDER}`,
                    background: placingUnitId === u.id ? ORANGE : "#fff",
                    color: placingUnitId === u.id ? "#fff" : TEXT_MID,
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {placingUnitId === u.id ? "Batal" : "Tempatkan"}
                </button>
              </div>
            ))}
          </Card>
        </div>
      )}

      {modalUnit && (
        <div
          onClick={closeModal}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 22, width: 380, maxWidth: "90vw" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Unit {modalUnit.unit_code}</div>
              <Badge value={modalUnit.status} />
            </div>
            <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 12 }}>
              {modalUnit.block ? `Blok ${modalUnit.block} · ` : ""}
              {modalUnit.type ? `Tipe ${modalUnit.type} · ` : ""}
              {modalUnit.price ? `Rp${Number(modalUnit.price).toLocaleString("id-ID")}` : ""}
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: TEXT_MID, marginBottom: 6 }}>Konsumen</div>
            {modalCustomer ? (
              <div style={{ fontSize: 13, marginBottom: 14 }}>
                <div>{modalCustomer.name}</div>
                <div style={{ color: TEXT_MID }}>{modalCustomer.phone || "-"}</div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 14 }}>Belum ada konsumen untuk unit ini.</div>
            )}

            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: TEXT_MID, marginBottom: 6 }}>Progres Pembangunan</div>
            {modalFieldProject ? (
              <div style={{ fontSize: 13 }}>
                <div style={{ background: BORDER, borderRadius: 20, height: 8, marginBottom: 6, overflow: "hidden" }}>
                  <div style={{ background: ORANGE, height: "100%", width: `${modalFieldProject.progress_percent}%` }} />
                </div>
                <div style={{ color: TEXT_MID }}>
                  {modalFieldProject.progress_percent}% · <Badge value={modalFieldProject.status} />
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: TEXT_MID }}>Belum ada data monitoring lapangan untuk unit ini.</div>
            )}

            <PrimaryButton onClick={closeModal} style={{ marginTop: 18, width: "100%", background: "#fff", color: TEXT_MID, border: `1px solid ${BORDER}` }}>
              Tutup
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
