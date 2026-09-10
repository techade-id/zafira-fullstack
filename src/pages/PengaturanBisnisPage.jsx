import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useToast } from "../context/ToastContext";
import { TEMPLATE_BAWAAN, isiPenanda } from "../lib/waTemplates";
import { labelTahap } from "../lib/format";
import { Card, PageTitle, SectionTitle, PrimaryButton, DataTable, Badge, BORDER, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, POSITIVE, ReadOnlyBanner } from "../components/ui";

/** Urutan tahap pada panel template WhatsApp — mengikuti alur funnel. */
const TAHAP_WA = ["leads", "cold", "warm", "hot", "booking", "kpr", "akad", "aftersales"];

const CATEGORIES = [
  { key: "lead_source", label: "Sumber Informasi Leads", hint: "Label lama; sumber baru dipilih relasional di halaman Prospek" },
  { key: "organik_kategori", label: "Kategori Leads Organik", hint: "OTS, Event, Brosur — dipakai saat sumber leads Organik" },
  { key: "hasil_followup", label: "Hasil Follow Up" },
  { key: "bank", label: "Nama Bank" },
  { key: "cancel_reason", label: "Alasan Pembatalan" },
  { key: "followup_category", label: "Kategori Rencana Selanjutnya" },
  { key: "progres_berkas", label: "Progres Berkas" },
  { key: "pic", label: "PIC / Karyawan Lapangan" },
  { key: "jenis_pekerjaan", label: "Jenis Pekerjaan Umum" },
  { key: "bobot_komplain", label: "Bobot Komplain", hint: 'Format "Nama:bobot", mis. Berat:3' },
];

export default function PengaturanBisnisPage() {
  const toast = useToast();
  const [settings, setSettings] = useState([]);
  const [appSettings, setAppSettings] = useState({});
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newValues, setNewValues] = useState({});
  const [newHoliday, setNewHoliday] = useState({ tanggal: "", keterangan: "" });
  const [error, setError] = useState("");

  // Relational lead sources (PRD §4.1). Without somewhere to create these, the
  // Ads and Freelance dropdowns on Prospek would have nothing to offer.
  const [campaigns, setCampaigns] = useState([]);
  const [partners, setPartners] = useState([]);
  const [newCampaign, setNewCampaign] = useState({ platform: "", name: "", code: "", budget: "" });
  const [newPartner, setNewPartner] = useState({ name: "", type: "freelance", phone: "" });

  async function fetchAll() {
    setLoading(true);
    const [{ data: bs }, { data: as }, { data: h }, camp, part] = await Promise.all([
      supabase.from("business_settings").select("*").order("category").order("sort_order"),
      supabase.from("app_settings").select("*"),
      supabase.from("holidays").select("*").order("tanggal"),
      supabase.from("ads_campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("partners").select("*").order("name"),
    ]);
    setSettings(bs || []);
    const map = {};
    for (const r of as || []) map[r.key] = r.value;
    setAppSettings(map);
    setHolidays(h || []);
    // Both arrive with migration_009; the page still renders before it runs.
    setCampaigns(camp.data || []);
    setPartners(part.data || []);
    setLoading(false);
  }

  async function addCampaign() {
    if (!newCampaign.platform.trim() || !newCampaign.name.trim()) {
      setError("Platform dan nama campaign wajib diisi.");
      return;
    }
    const { error: e } = await supabase.from("ads_campaigns").insert({
      platform: newCampaign.platform.trim(),
      name: newCampaign.name.trim(),
      code: newCampaign.code.trim() || null,
      budget: newCampaign.budget ? Number(newCampaign.budget) : null,
    });
    if (e) return setError(e.message);
    setNewCampaign({ platform: "", name: "", code: "", budget: "" });
    setError("");
    fetchAll();
  }

  async function addPartner() {
    if (!newPartner.name.trim()) {
      setError("Nama mitra wajib diisi.");
      return;
    }
    const { error: e } = await supabase.from("partners").insert({
      name: newPartner.name.trim(),
      type: newPartner.type,
      phone: newPartner.phone.trim() || null,
    });
    if (e) return setError(e.message);
    setNewPartner({ name: "", type: "freelance", phone: "" });
    setError("");
    fetchAll();
  }

  /** Deactivating keeps history intact; deleting would orphan the leads. */
  async function toggleActive(table, row) {
    const { error: e } = await supabase.from(table).update({ is_active: !row.is_active }).eq("id", row.id);
    if (e) return setError(e.message);
    fetchAll();
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

  /**
   * Menyimpan satu template WhatsApp.
   *
   * Baris ditulis dengan `label` terisi, sehingga masuk ke indeks unik
   * (category, label) dari migrasi 014 — satu template per tahap.
   */
  async function saveTemplate(tahap, teks) {
    const nilai = (teks || "").trim();
    const adaBaris = settings.find((s) => s.category === "wa_template" && s.label === tahap);

    if (!nilai) {
      // Dikosongkan berarti kembali ke kalimat bawaan aplikasi, bukan tidak ada
      // pesan sama sekali — aksi WhatsApp tidak boleh berhenti bekerja.
      if (adaBaris) {
        const { error: e } = await supabase.from("business_settings").delete().eq("id", adaBaris.id);
        if (e) return toast.gagal(e.message);
        toast.info(`Template ${labelTahap(tahap)} dikembalikan ke kalimat bawaan.`);
        fetchAll();
      }
      return;
    }

    if (adaBaris && adaBaris.value === nilai) return;

    const { error: e } = adaBaris
      ? await supabase.from("business_settings").update({ value: nilai }).eq("id", adaBaris.id)
      : await supabase
          .from("business_settings")
          .insert({ category: "wa_template", label: tahap, value: nilai, sort_order: TAHAP_WA.indexOf(tahap) + 1 });

    if (e) {
      // Sebelum migrasi 014, kolom `label` belum ada.
      const belumMigrasi = /column .*label|schema cache/i.test(e.message || "");
      toast.gagal(belumMigrasi ? "Jalankan migration_014_wa_templates.sql terlebih dahulu." : e.message);
      return;
    }
    toast.sukses(`Template ${labelTahap(tahap)} tersimpan.`);
    fetchAll();
  }

  return (
    <div>
      <PageTitle title="Pengaturan Bisnis" subtitle="Daftar pilihan, sumber leads relasional, kalender kerja, dan parameter penilaian" />

      <ReadOnlyBanner />
      {error && <div style={{ color: "#C2413B", fontSize: 12, marginBottom: 10 }}>{error}</div>}

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
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>
              Domain email yang boleh mendaftar (pisahkan dengan koma, kosongkan untuk mengizinkan semua)
            </div>
            <input
              defaultValue={appSettings.domain_email_diizinkan || ""}
              onBlur={(e) => saveAppSetting("domain_email_diizinkan", e.target.value)}
              placeholder="zafiraproperty.id"
              style={{ ...inputStyle, width: "100%" }}
            />
            <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 4 }}>
              Ditegakkan di database, bukan di formulir — pendaftaran dari domain lain ditolak sebelum akunnya terbuat.
            </div>
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
          <PrimaryButton subject="config" onClick={addHoliday}>Tambah</PrimaryButton>
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
                <button onClick={() => removeHoliday(r.tanggal)} style={{ border: "none", background: "none", color: "#C2413B", cursor: "pointer", fontSize: 12 }}>
                  Hapus
                </button>
              ),
            },
          ]}
          rows={holidays}
        />
      </Card>

      <Card style={{ marginBottom: 18 }}>
        <SectionTitle
          title="Template Pesan WhatsApp"
          action={<span style={{ fontSize: 12, color: TEXT_MID }}>{TAHAP_WA.length} tahap</span>}
        />
        <div style={{ fontSize: 11.5, color: TEXT_MID, marginBottom: 14, lineHeight: 1.6 }}>
          Kalimat pembuka yang terisi otomatis saat tombol WhatsApp ditekan, berbeda per tahap prospek. Kosongkan sebuah
          kolom untuk mengembalikannya ke kalimat bawaan.
          <br />
          Penanda yang dikenali:{" "}
          {["{nama}", "{agen}", "{unit}"].map((p) => (
            <code key={p} style={{ background: PRIMARY_SOFT, color: PRIMARY, padding: "1px 6px", borderRadius: 5, marginRight: 5, fontSize: 11 }}>
              {p}
            </code>
          ))}
        </div>

        <div className="rg-2" style={{ rowGap: 16 }}>
          {TAHAP_WA.map((tahap) => {
            const baris = settings.find((s) => s.category === "wa_template" && s.label === tahap);
            const nilai = baris?.value ?? TEMPLATE_BAWAAN[tahap] ?? "";
            const kustom = Boolean(baris);
            return (
              <div key={tahap} style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_DARK }}>{labelTahap(tahap)}</span>
                  {kustom ? (
                    <span style={{ fontSize: 10, fontWeight: 700, color: POSITIVE, background: "#E4F2E8", padding: "2px 7px", borderRadius: 999 }}>
                      DISESUAIKAN
                    </span>
                  ) : (
                    <span style={{ fontSize: 10.5, color: TEXT_MID }}>bawaan</span>
                  )}
                </div>
                <textarea
                  defaultValue={nilai}
                  onBlur={(e) => saveTemplate(tahap, e.target.value)}
                  aria-label={`Template WhatsApp tahap ${labelTahap(tahap)}`}
                  style={{ ...inputStyle, width: "100%", minHeight: 84, resize: "vertical", fontFamily: "inherit", lineHeight: 1.55 }}
                />
                {/* Pratinjau: penanda yang salah ketik baru ketahuan setelah
                    pesan terkirim, dan saat itu sudah terlambat. */}
                <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 5, lineHeight: 1.5, fontStyle: "italic" }}>
                  {isiPenanda(nilai, { nama: "Budi", agen: "Sales A", unit: "A-01" })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card style={{ marginBottom: 18 }}>
        <SectionTitle title="Ads Campaign" />
        <div style={{ fontSize: 11.5, color: TEXT_MID, marginBottom: 12 }}>
          Dikelola tim digital. Prospek bersumber Ads dikaitkan ke campaign di sini, sehingga biaya per lead dapat dihitung per campaign.
        </div>
        <div className="rg-4" style={{ marginBottom: 12 }}>
          <input placeholder="Platform (Instagram, Meta Ads…)" value={newCampaign.platform} onChange={(e) => setNewCampaign({ ...newCampaign, platform: e.target.value })} style={inputStyle} />
          <input placeholder="Nama Campaign" value={newCampaign.name} onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })} style={inputStyle} />
          <input placeholder="Kode / UTM (opsional)" value={newCampaign.code} onChange={(e) => setNewCampaign({ ...newCampaign, code: e.target.value })} style={inputStyle} />
          <input placeholder="Budget (Rp)" type="number" value={newCampaign.budget} onChange={(e) => setNewCampaign({ ...newCampaign, budget: e.target.value })} style={inputStyle} />
        </div>
        <PrimaryButton subject="ads" onClick={addCampaign} style={{ marginBottom: 14 }}>+ Tambah Campaign</PrimaryButton>
        <DataTable
          loading={loading}
          emptyLabel="Belum ada campaign. Jalankan migration_009_pipeline.sql bila tabel belum dibuat."
          columns={[
            { key: "platform", label: "Platform" },
            { key: "name", label: "Campaign" },
            { key: "code", label: "Kode", render: (r) => r.code || "-" },
            { key: "budget", label: "Budget", render: (r) => (r.budget ? `Rp${Number(r.budget).toLocaleString("id-ID")}` : "-") },
            {
              key: "is_active",
              label: "Status",
              render: (r) => (
                <button onClick={() => toggleActive("ads_campaigns", r)} style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }}>
                  <Badge value={r.is_active ? "aktif" : "batal"} />
                </button>
              ),
            },
          ]}
          rows={campaigns}
        />
      </Card>

      <Card style={{ marginBottom: 18 }}>
        <SectionTitle title="Mitra & Freelance" />
        <div style={{ fontSize: 11.5, color: TEXT_MID, marginBottom: 12 }}>
          Basis data mitra untuk prospek bersumber Freelance / Kemitraan.
        </div>
        <div className="rg-4" style={{ marginBottom: 12 }}>
          <input placeholder="Nama Mitra" value={newPartner.name} onChange={(e) => setNewPartner({ ...newPartner, name: e.target.value })} style={inputStyle} />
          <select value={newPartner.type} onChange={(e) => setNewPartner({ ...newPartner, type: e.target.value })} style={inputStyle}>
            <option value="freelance">Freelance</option>
            <option value="kemitraan">Kemitraan</option>
          </select>
          <input placeholder="Telepon" value={newPartner.phone} onChange={(e) => setNewPartner({ ...newPartner, phone: e.target.value })} style={inputStyle} />
          <PrimaryButton subject="config" onClick={addPartner}>+ Tambah Mitra</PrimaryButton>
        </div>
        <DataTable
          loading={loading}
          emptyLabel="Belum ada mitra terdaftar."
          columns={[
            { key: "name", label: "Nama" },
            { key: "type", label: "Tipe", render: (r) => <span style={{ textTransform: "capitalize" }}>{r.type}</span> },
            { key: "phone", label: "Telepon", render: (r) => r.phone || "-" },
            {
              key: "is_active",
              label: "Status",
              render: (r) => (
                <button onClick={() => toggleActive("partners", r)} style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }}>
                  <Badge value={r.is_active ? "aktif" : "batal"} />
                </button>
              ),
            },
          ]}
          rows={partners}
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
                      <button onClick={() => removeValue(item.id)} style={{ border: "none", background: "none", color: "#C2413B", cursor: "pointer", fontSize: 12 }}>
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
                  <PrimaryButton subject="config" onClick={() => addValue(cat.key)} style={{ padding: "9px 15px" }}>
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
