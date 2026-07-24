import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, PageTitle, PrimaryButton, BORDER, TEXT_MID } from "../components/ui";

const CATEGORIES = [
  { key: "lead_source", label: "Sumber Informasi Leads" },
  { key: "bank", label: "Nama Bank" },
  { key: "cancel_reason", label: "Alasan Pembatalan" },
  { key: "followup_category", label: "Kategori Rencana Selanjutnya" },
  { key: "progres_berkas", label: "Progres Berkas" },
  { key: "jenis_perusahaan", label: "Jenis Perusahaan" },
];

export default function PengaturanBisnisPage() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newValues, setNewValues] = useState({});
  const [error, setError] = useState("");

  async function fetchSettings() {
    setLoading(true);
    const { data } = await supabase.from("business_settings").select("*").order("category").order("sort_order");
    setSettings(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchSettings();
  }, []);

  async function addValue(category) {
    const value = (newValues[category] || "").trim();
    if (!value) return;
    const maxOrder = settings.filter((s) => s.category === category).reduce((m, s) => Math.max(m, s.sort_order), 0);
    const { error } = await supabase.from("business_settings").insert({ category, value, sort_order: maxOrder + 1 });
    if (error) {
      setError(error.message);
      return;
    }
    setNewValues((v) => ({ ...v, [category]: "" }));
    fetchSettings();
  }

  async function removeValue(id) {
    await supabase.from("business_settings").delete().eq("id", id);
    fetchSettings();
  }

  return (
    <div>
      <PageTitle title="Pengaturan Bisnis" subtitle="Kelola daftar pilihan (dropdown) yang dipakai di seluruh sistem" />
      {error && <div style={{ color: "#d94141", fontSize: 12, marginBottom: 10 }}>{error}</div>}
      {loading ? (
        <Card><div style={{ fontSize: 13, color: TEXT_MID }}>Memuat data...</div></Card>
      ) : (
        <div className="rg-2">
          {CATEGORIES.map((cat) => {
            const items = settings.filter((s) => s.category === cat.key);
            return (
              <Card key={cat.key}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{cat.label}</div>
                <div style={{ marginBottom: 12 }}>
                  {items.length === 0 && <div style={{ fontSize: 12, color: TEXT_MID }}>Belum ada pilihan.</div>}
                  {items.map((item) => (
                    <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${BORDER}`, fontSize: 13 }}>
                      <span>{item.value}</span>
                      <button onClick={() => removeValue(item.id)} style={{ border: "none", background: "none", color: "#c23b3b", cursor: "pointer", fontSize: 12 }}>
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
                    style={{ flex: 1, padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: "none" }}
                  />
                  <PrimaryButton onClick={() => addValue(cat.key)} style={{ padding: "8px 14px" }}>
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
