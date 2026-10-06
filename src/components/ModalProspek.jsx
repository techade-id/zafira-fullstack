import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { segarkanNotifikasi } from "../lib/useNotifications";
import { labelTahap } from "../lib/format";
import InputRupiah from "./InputRupiah";
import { Modal, Field, PrimaryButton, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, ACCENT_SOFT, ACCENT_DARK } from "./ui";

/**
 * Satu-satunya formulir prospek: tambah dan ubah, dari halaman Leads maupun
 * tombol + di header.
 *
 * Sebelumnya ada dua. Formulir cepat di header tidak bisa memilih campaign
 * atau mitra ("dipilih nanti dari halaman Leads"), sehingga prospek Ads yang
 * dicatat dari sana mudah kehilangan campaign-nya — dan laporan Digital Ads
 * menghitung biaya per lead dari kolom itu. Formulir di halaman Leads tampil
 * di atas tabel, sehingga "Ubah data" pada baris ke-20 membukanya di luar
 * pandangan.
 *
 * Setiap simpanan mengirim event `prospek-tersimpan` ke window: halaman Leads
 * mendengarkannya, sehingga daftarnya ikut segar dari mana pun prospek dicatat.
 */

/**
 * BRIEF §Leads: "Memisahkan opsi sumber leads menjadi: Ads, Freelance,
 * Kemitraan, dan Organik."
 *
 * Freelance dan Kemitraan sebelumnya berbagi satu nilai. Keduanya memang
 * sama-sama diwakili tabel partners, tetapi biaya, perjanjian, dan cara
 * evaluasinya berbeda — dan begitu digabung, pertanyaan "kemitraan mana yang
 * menghasilkan" tidak bisa dijawab lagi.
 */
export const SOURCE_TYPES = [
  { value: "ads", label: "Ads" },
  { value: "freelance", label: "Freelance" },
  { value: "kemitraan", label: "Kemitraan" },
  { value: "organik", label: "Organik" },
];

const MARITAL_OPTIONS = ["Nikah", "Janda/Duda", "Single"];
const PEKERJAAN_OPTIONS = ["Karyawan Swasta", "PNS/ASN", "Wirausaha"];

const emptyForm = {
  // PRD §4.1 minimal intake
  name: "",
  phone: "",
  source_type: "",
  campaign_id: "",
  partner_id: "",
  organik_kategori: "",
  organik_detail: "",
  source: "",
  // everything below is progressive
  username_sosmed: "",
  usia: "",
  marital_status: "",
  pekerjaan: "",
  perusahaan_tempat_kerja: "",
  gaji: "",
  domisili: "",
  kabupaten: "",
  kecamatan: "",
  kelurahan: "",
  rencana_selanjutnya: "",
  kategori_rencana: "",
  tanggal_rencana: "",
  notes: "",
};

/** Bidang sumber ikut terbawa saat "Simpan & tambah lagi": di pameran, prospek berikutnya datang dari event yang sama. */
const KUNCI_SUMBER = ["source_type", "campaign_id", "partner_id", "organik_kategori", "organik_detail", "source"];

export const EVENT_TERSIMPAN = "prospek-tersimpan";

/**
 * @param lead   baris prospek yang diubah, atau null untuk prospek baru
 * @param onSaved(id) dipanggil setelah simpanan yang menutup formulir
 */
export default function ModalProspek({ open, lead, onClose, onSaved }) {
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const sources = useBusinessSettings("lead_source");
  const followupCategories = useBusinessSettings("followup_category");
  const organikCategories = useBusinessSettings("organik_kategori");

  const [form, setForm] = useState(emptyForm);
  const [awal, setAwal] = useState(emptyForm);
  const [showDetail, setShowDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [campaigns, setCampaigns] = useState(null);
  const [partners, setPartners] = useState([]);
  const [ganda, setGanda] = useState([]);
  const namaRef = useRef(null);

  const ubah = Boolean(lead);

  useEffect(() => {
    if (!open) return;
    const isi = lead ? Object.fromEntries(Object.keys(emptyForm).map((k) => [k, lead[k] ?? ""])) : emptyForm;
    setForm(isi);
    setAwal(isi);
    // Data yang dikoreksi biasanya butuh formulir lengkap, bukan formulir intake.
    setShowDetail(Boolean(lead));
    setError("");
    setGanda([]);
    // Fokus langsung ke nama: di lapangan, setiap ketukan tambahan berarti
    // menahan calon pembeli menunggu.
    setTimeout(() => namaRef.current?.focus(), 60);
  }, [open, lead]);

  // Campaign dan mitra baru dimuat saat formulir pertama kali dibuka — tombol
  // + di header ada di setiap halaman, dan sebagian besar kunjungan tidak
  // pernah menekannya.
  useEffect(() => {
    if (!open || campaigns) return;
    Promise.all([
      supabase.from("ads_campaigns").select("id, name, platform").eq("is_active", true).order("name"),
      supabase.from("partners").select("id, name, type").eq("is_active", true).order("name"),
    ]).then(([c, p]) => {
      // Dua tabel ini datang dengan migration_009; sebelum itu daftarnya kosong.
      setCampaigns(c.data || []);
      setPartners(p.data || []);
    });
  }, [open, campaigns]);

  // Nomor ganda, dicek di server (migration_018) karena RLS menyembunyikan
  // prospek agen lain dari Sales. Hanya peringatan — tidak menghalangi simpan.
  useEffect(() => {
    if (!open || form.phone.replace(/\D/g, "").length < 9) {
      setGanda([]);
      return undefined;
    }
    let batal = false;
    const t = setTimeout(async () => {
      const { data, error: e } = await supabase.rpc("cek_nomor_prospek", { p_phone: form.phone, p_kecuali: lead?.id || null });
      // Sebelum migrasi 018 dijalankan fungsinya belum ada — diam saja.
      if (!batal) setGanda(e ? [] : data || []);
    }, 400);
    return () => {
      batal = true;
      clearTimeout(t);
    };
  }, [open, form.phone, lead]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const kotor = Object.keys(emptyForm).some((k) => String(form[k] ?? "") !== String(awal[k] ?? ""));

  async function simpan(lanjutkan) {
    if (!form.name.trim()) {
      setError("Nama atau username wajib diisi.");
      namaRef.current?.focus();
      return;
    }
    // BRIEF §Leads: "Khusus Organik … Wajib ada kolom isian tambahan untuk
    // keterangan Detail (mis. nama event apa)." Tanpa itu, "Organik" tidak
    // memberi tahu siapa pun apa yang harus diulang bulan depan.
    if (form.source_type === "organik" && !form.organik_detail.trim()) {
      setError("Sumber Organik wajib disertai keterangan detail — nama event, lokasi OTS, atau nama perujuk.");
      return;
    }
    setSaving(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      username_sosmed: form.username_sosmed.trim() || null,
      source_type: form.source_type || null,
      campaign_id: form.source_type === "ads" ? form.campaign_id || null : null,
      partner_id: ["freelance", "kemitraan"].includes(form.source_type) ? form.partner_id || null : null,
      organik_kategori: form.source_type === "organik" ? form.organik_kategori || null : null,
      organik_detail: form.source_type === "organik" ? form.organik_detail.trim() || null : null,
      source: form.source || null,
      usia: form.usia ? Number(form.usia) : null,
      marital_status: form.marital_status || null,
      pekerjaan: form.pekerjaan || null,
      perusahaan_tempat_kerja: form.perusahaan_tempat_kerja.trim() || null,
      gaji: form.gaji ? Number(form.gaji) : null,
      domisili: form.domisili.trim() || null,
      kabupaten: form.kabupaten.trim() || null,
      kecamatan: form.kecamatan.trim() || null,
      kelurahan: form.kelurahan.trim() || null,
      rencana_selanjutnya: form.rencana_selanjutnya.trim() || null,
      kategori_rencana: form.kategori_rencana || null,
      tanggal_rencana: form.tanggal_rencana || null,
      notes: form.notes.trim() || null,
    };

    // BRIEF §Leads: "status default harus langsung masuk ke Warm secara
    // otomatis oleh sistem, bukan dipilih manual oleh sales". Dikirim di sini
    // dan dipaksakan sekali lagi oleh trigger leads_default_temperature.
    //
    // Sesudah itu status tidak pernah lagi ditulis dari formulir ini: yang
    // menggerakkannya adalah catatan follow-up dan trigger KPR.
    // assigned_to harus ikut dicap, kalau tidak RLS menyembunyikan baris dari
    // orang yang baru saja membuatnya.
    const { data, error: saveError } = ubah
      ? await supabase.from("leads").update(payload).eq("id", lead.id).select("id").maybeSingle()
      : await supabase.from("leads").insert({ ...payload, status: "warm", assigned_to: profile?.id || null }).select("id").maybeSingle();

    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }

    const id = data?.id || lead?.id || null;
    toast.sukses(ubah ? "Perubahan tersimpan." : `${payload.name} ditambahkan sebagai prospek — status awal Warm Lead.`);
    segarkanNotifikasi();
    window.dispatchEvent(new CustomEvent(EVENT_TERSIMPAN, { detail: { id } }));

    if (lanjutkan) {
      const berikut = { ...emptyForm, ...Object.fromEntries(KUNCI_SUMBER.map((k) => [k, form[k]])) };
      setForm(berikut);
      setAwal(berikut);
      setShowDetail(false);
      setGanda([]);
      namaRef.current?.focus();
      return;
    }

    onClose();
    onSaved?.(id);
  }

  function bukaGanda(id) {
    onClose();
    navigate(`/prospek?sorot=${id}`);
  }

  return (
    // Klik di luar atau Escape tidak menutup formulir yang sudah terisi:
    // dua puluh bidang yang hilang karena salah klik terlalu mahal. Tombol
    // Batal tetap menutupnya kapan saja.
    <Modal open={open} labelledBy="prospek-judul" onClose={() => !saving && !kotor && onClose()} width={640}>
      <div id="prospek-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
        {ubah ? "Ubah Data Prospek" : "Prospek Baru"}
      </div>
      <div style={{ fontSize: 12.5, color: TEXT_MID, marginBottom: 18, lineHeight: 1.55 }}>
        {ubah
          ? "Tahap prospek tidak diubah di sini — ia dibaca sistem dari riwayat follow-up."
          : "Cukup nama, nomor, dan sumbernya. Status awal Warm Lead, ditetapkan sistem."}
      </div>

      {/* PRD §4.1: three fields to capture a lead. Everything else waits
          until there is something worth qualifying. */}
      <div className="rg-2" style={{ marginBottom: 14 }}>
        <Field label="Nama / Username" wajib>
          <input
            ref={namaRef}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && simpan(false)}
            placeholder="mis. Budi Santoso"
          />
        </Field>
        <Field label="Nomor Telepon">
          <input
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && simpan(false)}
            placeholder="08…"
          />
        </Field>
      </div>

      {ganda.length > 0 && <PeringatanGanda baris={ganda} onBuka={bukaGanda} />}

      <div style={{ marginBottom: 14 }}>
        <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 6 }}>Sumber Leads</span>
        <div role="group" aria-label="Sumber leads" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SOURCE_TYPES.map((s) => {
            const aktif = form.source_type === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => set("source_type", aktif ? "" : s.value)}
                aria-pressed={aktif}
                style={{
                  padding: "7px 14px",
                  borderRadius: 999,
                  border: `1px solid ${aktif ? PRIMARY : BORDER}`,
                  background: aktif ? PRIMARY : SURFACE,
                  color: aktif ? "#fff" : TEXT_MID,
                  fontSize: 12.5,
                  fontWeight: aktif ? 600 : 500,
                  cursor: "pointer",
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {form.source_type === "ads" && (
          <Field label="Campaign" style={{ marginTop: 10 }}>
            <select value={form.campaign_id} onChange={(e) => set("campaign_id", e.target.value)}>
              <option value="">Pilih campaign</option>
              {(campaigns || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.platform} — {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {(form.source_type === "freelance" || form.source_type === "kemitraan") && (
          <Field label={form.source_type === "kemitraan" ? "Mitra" : "Freelance"} style={{ marginTop: 10 }}>
            <select value={form.partner_id} onChange={(e) => set("partner_id", e.target.value)}>
              <option value="">Pilih {form.source_type === "kemitraan" ? "mitra" : "freelance"}</option>
              {partners
                // Daftarnya disaring menurut jenis mitra, bukan ditampilkan
                // seluruhnya: memisahkan dua sumber lalu menawarkan pilihan
                // yang sama untuk keduanya hanya memindahkan kekeliruannya.
                .filter((p) => (form.source_type === "kemitraan" ? p.type === "kemitraan" : p.type !== "kemitraan"))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Field>
        )}

        {form.source_type === "organik" && (
          <div className="rg-2" style={{ marginTop: 10 }}>
            <Field label="Kategori Organik">
              <select value={form.organik_kategori} onChange={(e) => set("organik_kategori", e.target.value)}>
                <option value="">Pilih kategori</option>
                {withCurrentValue(organikCategories, form.organik_kategori).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </Field>
            {/* BRIEF §Leads: keterangan detail wajib untuk sumber Organik. */}
            <Field label="Keterangan Detail" wajib>
              <input
                value={form.organik_detail}
                onChange={(e) => set("organik_detail", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && simpan(false)}
                placeholder="mis. Pameran Kota Tegal Mei 2026"
              />
            </Field>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowDetail((v) => !v)}
        aria-expanded={showDetail}
        style={{ border: "none", background: "none", color: PRIMARY, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "4px 0", marginBottom: showDetail ? 14 : 0 }}
      >
        {showDetail ? "− Sembunyikan data lengkap" : "+ Lengkapi data prospek (opsional)"}
      </button>

      {showDetail && (
        <>
          <Judul>Data Diri</Judul>
          <div className="rg-2" style={{ marginBottom: 16 }}>
            <Field label="Username Sosial Media">
              <input value={form.username_sosmed} onChange={(e) => set("username_sosmed", e.target.value)} placeholder="mis. @budi.s" />
            </Field>
            <Field label="Usia">
              <input type="number" value={form.usia} onChange={(e) => set("usia", e.target.value)} />
            </Field>
            <Field label="Status Pernikahan">
              <select value={form.marital_status} onChange={(e) => set("marital_status", e.target.value)}>
                <option value="">Pilih status</option>
                {withCurrentValue(MARITAL_OPTIONS, form.marital_status).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </Field>
            <Field label="Pekerjaan">
              <select value={form.pekerjaan} onChange={(e) => set("pekerjaan", e.target.value)}>
                <option value="">Pilih pekerjaan</option>
                {withCurrentValue(PEKERJAAN_OPTIONS, form.pekerjaan).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </Field>
            <Field label="Perusahaan Tempat Kerja">
              <input value={form.perusahaan_tempat_kerja} onChange={(e) => set("perusahaan_tempat_kerja", e.target.value)} />
            </Field>
            <Field label="Gaji per Bulan">
              <InputRupiah value={form.gaji} onChange={(v) => set("gaji", v)} placeholder="mis. 5jt" />
            </Field>
          </div>

          <Judul>Domisili</Judul>
          <div className="rg-2" style={{ marginBottom: 16 }}>
            <Field label="Domisili">
              <input value={form.domisili} onChange={(e) => set("domisili", e.target.value)} />
            </Field>
            <Field label="Kabupaten/Kota">
              <input value={form.kabupaten} onChange={(e) => set("kabupaten", e.target.value)} />
            </Field>
            <Field label="Kecamatan">
              <input value={form.kecamatan} onChange={(e) => set("kecamatan", e.target.value)} />
            </Field>
            <Field label="Kelurahan/Desa">
              <input value={form.kelurahan} onChange={(e) => set("kelurahan", e.target.value)} />
            </Field>
          </div>

          <Judul>Rencana &amp; Catatan</Judul>
          <div className="rg-2" style={{ marginBottom: 4 }}>
            <Field label="Kategori Rencana">
              <select value={form.kategori_rencana} onChange={(e) => set("kategori_rencana", e.target.value)}>
                <option value="">Pilih kategori</option>
                {withCurrentValue(followupCategories, form.kategori_rencana).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Tanggal Rencana">
              <input type="date" value={form.tanggal_rencana} onChange={(e) => set("tanggal_rencana", e.target.value)} />
            </Field>
            <Field label="Rencana Selanjutnya" style={{ gridColumn: "1 / -1" }}>
              <input value={form.rencana_selanjutnya} onChange={(e) => set("rencana_selanjutnya", e.target.value)} placeholder="mis. Survei lokasi hari Sabtu" />
            </Field>
            <Field label="Sumber (label lama)" hint="Dipertahankan agar laporan historis tetap cocok.">
              <select value={form.source} onChange={(e) => set("source", e.target.value)}>
                <option value="">—</option>
                {withCurrentValue(sources, form.source).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Catatan" hint="Seluruh teks ini dapat ditemukan lewat kotak pencarian di header." style={{ gridColumn: "1 / -1" }}>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                style={{ minHeight: 64, resize: "vertical", fontFamily: "inherit" }}
              />
            </Field>
          </div>
        </>
      )}

      {/* Menempel di dasar dialog: dengan data lengkap terbuka, tombol simpan
          tidak boleh tenggelam di bawah dua puluh bidang. */}
      <div
        style={{
          position: "sticky",
          bottom: -24,
          margin: "18px -24px -24px",
          padding: "14px 24px 20px",
          background: SURFACE,
          borderTop: `1px solid ${BORDER}`,
        }}
      >
        {error && (
          <div role="alert" style={{ fontSize: 12.5, color: "#C2413B", marginBottom: 12 }}>
            {error}
          </div>
        )}
        {/* row-reverse: di layar ponsel ketiga tombol tidak muat satu baris,
            dan yang terlempar ke baris kedua harus tombol sekunder — bukan
            tombol simpan. */}
        <div style={{ display: "flex", flexDirection: "row-reverse", gap: 9, justifyContent: "flex-start", flexWrap: "wrap" }}>
          <PrimaryButton subject="lead" onClick={() => simpan(false)} disabled={saving}>
            {saving ? "Menyimpan…" : ubah ? "Simpan Perubahan" : "Simpan Prospek"}
          </PrimaryButton>
          {!ubah && (
            <button type="button" onClick={() => simpan(true)} disabled={saving} style={{ ...sekunder, borderColor: PRIMARY, color: PRIMARY }}>
              Simpan &amp; tambah lagi
            </button>
          )}
          <button type="button" onClick={onClose} disabled={saving} style={sekunder}>
            Batal
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Judul({ children }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_DARK, marginBottom: 10 }}>{children}</div>;
}

/**
 * Nomor yang sudah tercatat. Prospek yang boleh dilihat pengguna ditampilkan
 * dengan nama dan tombol Buka; milik agen lain cukup disebut agennya.
 */
function PeringatanGanda({ baris, onBuka }) {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        gap: 9,
        alignItems: "flex-start",
        background: ACCENT_SOFT,
        border: "1px solid #F6CDB8",
        borderRadius: 12,
        padding: "10px 13px",
        marginBottom: 14,
        fontSize: 12.5,
        color: ACCENT_DARK,
        lineHeight: 1.5,
      }}
    >
      <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Nomor ini sudah tercatat</div>
        {baris.map((b, i) => (
          <div key={b.lead_id || `agen-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
            <span style={{ color: TEXT_DARK }}>
              {b.lead_id ? (
                <>
                  <b>{b.nama}</b> · {labelTahap(b.tahap)} · {b.milik_saya ? "prospek Anda" : `agen ${b.agen || "-"}`}
                </>
              ) : (
                <>Dipegang agen {b.agen || "lain"}</>
              )}
            </span>
            {b.lead_id && (
              <button
                type="button"
                onClick={() => onBuka(b.lead_id)}
                style={{ border: "none", background: "none", color: PRIMARY, fontWeight: 600, fontSize: 12, cursor: "pointer", padding: 0 }}
              >
                Buka →
              </button>
            )}
          </div>
        ))}
        <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 4 }}>Tetap bisa disimpan bila memang orang yang berbeda.</div>
      </div>
    </div>
  );
}

const sekunder = {
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  borderRadius: 999,
  padding: "10px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
