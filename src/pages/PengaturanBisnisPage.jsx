import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, PageTitle, SectionTitle, PrimaryButton, DataTable, BORDER, TEXT_MID } from "../components/ui";

const CATEGORIES = [
  { key: "lead_source", label: "Sumber Informasi Leads" },
  { key: "bank", label: "Nama Bank" },
  { key: "cancel_reason", label: "Alasan Pembatalan" },
  { key: "followup_category", label: "Kategori Rencana Selanjutnya" },
  { key: "progres_berkas", label: "Progres Berkas" },
  { key: "pic", label: "PIC / Karyawan Lapangan" },
  { key: "jenis_pekerjaan", label: "Jenis Pekerjaan Umum" },
  { key: "bobot_komplain", label: "Bobot Komplain", hint: 'Format "Nama:bobot", mis. Berat:3' },
];

export default function PengaturanBisnisPage() {
  const [settings, setSettings] = useState([]);
  const [appSettings, setAppSettings] = useState({});
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newValues, setNewValues] = useState({});
  const [newHoliday, setNewHoliday] = useState({ tanggal: "", keterangan: "" });
  const [error, setError] = useState("");

  async function fetchAll() {
    setLoading(true);
    const [{ data: bs }, { data: as }, { data: h }] = await Promise.all([
      supabase.from("business_settings").select("*").order("category").order("sort_order"),
      supabase.from("app_settings").select("*"),
      supabase.from("holidays").select("*").order("tanggal"),
    ]);
    setSettings(bs || []);
    const map = {};
    for (const r of as || []) map[r.key] = r.value;
    setAppSettings(map);
    setHolidays(h || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
  }, []);

  async function addValue(category) {
    const value = (newValues[category] || "").trim();
    if (!value) return;
    const maxOrder = settings.filter((s) => s.category === category).reduce((m, s) => Math.max(m, s.sort_order), 0);
    const { error } = await supabase.from("business_settings").insert({ category, value, sort_order: maxOrder + 1 });
    if (error) return setError(error.message);
    setNewValues((v) => ({ ...v, [category]: "" }));
    fetchAll();
  }

  async function renameValue(item, next) {
    const value = (next || "").trim();
    if (!value || value === item.value) return;
    const { error } = await supabase.from("business_settings").update({ value }).eq("id", item.id);
    if (error) return setError(error.message);
    fetchAll();
  }

  async function removeValue(id) {
    await supabase.from("business_settings").delete().eq("id", id);
    fetchAll();
  }

  async function saveAppSetting(key, value) {
    const { error } = await supabase.from("app_settings").upsert({ key, value: String(value) }, { onConflict: "key" });
    if (error) return setError(error.message);
    setAppSettings((m) => ({ ...m, [key]: String(value) }));
  }

  async function addHoliday() {
    if (!newHoliday.tanggal) return;
    const { error } = await supabase.from("holidays").insert({ tanggal: newHoliday.tanggal, keterangan: newHoliday.keterangan || null });
    if (error) return setError(error.message);
    setNewHoliday({ tanggal: "", keterangan: "" });
    fetchAll();
  }

  async function removeHoliday(tanggal) {
    await supabase.from("holidays").delete().eq("tanggal", tanggal);
    fetchAll();
  }

  return (
    <div>
      <PageTitle title="Pengaturan Bisnis" subtitle="Daftar pilihan, kalender kerja, dan parameter penilaian" />
      {error && <div style={{ color: "#c25b5b", fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <Card style={{ marginBottom: 18 }}>
        <SectionTitle title="Kalender Kerja & Penilaian" />
        <div className="rg-4" style={{ marginBottom: 14 }}>
          {[
            { key: "sabtu_libur", label: "Sabtu dihitung libur" },
            { key: "minggu_libur", label: "Minggu dihitung libur" },
          ].map((cfg) => (
            <label key={cfg.key} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={appSettings[cfg.key] === "true"}
                onChange={(e) => saveAppSetting(cfg.key, e.target.checked)}
              />
              {cfg.label}
            </label>
          ))}
          <div>
            <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Masa garansi standar (hari)</div>
            <input
              type="number"
              defaultValue={appSettings.hari_garansi_default || ""}
              onBlur={(e) => saveAppSetting("hari_garansi_default", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Pengurang nilai per bobot komplain</div>
            <input
              type="number"
              step="0.1"
              defaultValue={appSettings.penalti_per_bobot || ""}
              onBlur={(e) => saveAppSetting("penalti_per_bobot", e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ fontSize: 11, color: TEXT_MID }}>
          Pengaturan ini dipakai untuk menghitung rencana deadline task (hari kerja), akhir masa garansi, dan Nilai Akhir kontraktor.
        </div>
      </Card>

      <Card style={{ marginBottom: 18 }}>
        <SectionTitle title="Kalender Libur" />
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <input type="date" value={newHoliday.tanggal} onChange={(e) => setNewHoliday({ ...newHoliday, tanggal: e.target.value })} style={inputStyle} />
          <input
            placeholder="Keterangan (mis. Idul Fitri)"
            value={newHoliday.keterangan}
            onChange={(e) => setNewHoliday({ ...newHoliday, keterangan: e.target.value })}
            style={{ ...inputStyle, flex: 1, minWidth: 180 }}
          />
          <PrimaryButton onClick={addHoliday}>Tambah</PrimaryButton>
        </div>
        <DataTable
          loading={loading}
          emptyLabel="Belum ada hari libur tercatat."
          columns={[
            { key: "tanggal", label: "Tanggal", render: (r) => new Date(`${r.tanggal}T00:00:00`).toLocaleDateString("id-ID") },
            { key: "keterangan", label: "Keterangan", render: (r) => r.keterangan || "-" },
            {
              key: "aksi",
              label: "",
              render: (r) => (
                <button onClick={() => removeHoliday(r.tanggal)} style={{ border: "none", background: "none", color: "#c25b5b", cursor: "pointer", fontSize: 12 }}>
                  Hapus
                </button>
              ),
            },
          ]}
          rows={holidays}
        />
      </Card>

      {loading ? (
        <Card><div style={{ fontSize: 13, color: TEXT_MID }}>Memuat data...</div></Card>
      ) : (
        <div className="rg-2">
          {CATEGORIES.map((cat) => {
            const items = settings.filter((s) => s.category === cat.key);
            return (
              <Card key={cat.key}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{cat.label}</div>
                {cat.hint && <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 10 }}>{cat.hint}</div>}
                <div style={{ marginBottom: 12, marginTop: cat.hint ? 0 : 10 }}>
                  {items.length === 0 && <div style={{ fontSize: 12, color: TEXT_MID }}>Belum ada pilihan.</div>}
                  {items.map((item) => (
                    <div
                      key={item.id}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${BORDER}`, fontSize: 13 }}
                    >
                      <input
                        defaultValue={item.value}
                        onBlur={(e) => renameValue(item, e.target.value)}
                        style={{ flex: 1, marginRight: 10, border: "1px solid transparent", borderRadius: 8, padding: "4px 8px", fontSize: 13, outline: "none", background: "transparent" }}
                        onFocus={(e) => (e.target.style.border = `1px solid ${BORDER}`)}
                      />
                      <button onClick={() => removeValue(item.id)} style={{ border: "none", background: "none", color: "#c25b5b", cursor: "pointer", fontSize: 12 }}>
                        Hapus
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    placeholder={`Tambah ${cat.label.toLowerCase()}`}
                    value={newValues[cat.key] || ""}
                    onChange={(e) => setNewValues((v) => ({ ...v, [cat.key]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && addValue(cat.key)}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <PrimaryButton onClick={() => addValue(cat.key)} style={{ padding: "9px 15px" }}>
                    Tambah
                  </PrimaryButton>
                </div>
              </Card>
            );
          })}
        </div>
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
