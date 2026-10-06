import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useToast } from "../context/ToastContext";
import { rupiah } from "../lib/format";
import InputRupiah from "./InputRupiah";
import { PeringatanGanda } from "./ModalProspek";
import { Card, Field, PrimaryButton, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT } from "./ui";

/**
 * Data diri konsumen — dibaca, dan diubah di tempat.
 *
 * Mengubah sebelumnya hanya bisa dari form di atas tabel daftar Konsumen,
 * jauh dari kartu ini. Kini tombol Ubah mengubah kartu ini sendiri menjadi
 * formulir, dengan Simpan/Batal — pola yang sama dengan Progres KPR: tidak ada
 * yang tersimpan sebelum Simpan ditekan.
 *
 * Unit sengaja tidak ikut. Mengganti unit bukan koreksi data diri: status unit
 * lama dan baru di siteplan tidak ikut berpindah bila hanya kolomnya yang
 * diubah.
 *
 * Nama dan telepon yang dikoreksi ikut ke prospek asal lewat trigger
 * customers_sync_prospek_asal (migration_020). Setiap perubahan tercatat di
 * Log Aktivitas oleh trigger audit.
 */

const KOLOM_KONSUMEN = ["name", "phone", "email", "username_sosmed", "ktp_number", "address", "penghasilan"];

function teks(v) {
  return v === null || v === undefined ? "" : String(v);
}

function isiAwal(konsumen, kpr) {
  return {
    ...Object.fromEntries(KOLOM_KONSUMEN.map((k) => [k, konsumen[k] ?? ""])),
    alamat_ktp: kpr?.alamat_ktp ?? "",
  };
}

export default function DataDiriKonsumen({ konsumen, kpr, bolehUbah, awalUbah = false, onTersimpan }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [ubah, setUbah] = useState(false);
  const [form, setForm] = useState(() => isiAwal(konsumen, kpr));
  const [awal, setAwal] = useState(() => isiAwal(konsumen, kpr));
  const [saving, setSaving] = useState(false);
  const [galat, setGalat] = useState({});
  const [ganda, setGanda] = useState([]);

  function mulai() {
    const isi = isiAwal(konsumen, kpr);
    setForm(isi);
    setAwal(isi);
    setGalat({});
    setGanda([]);
    setUbah(true);
  }

  // Datang dari tombol Ubah di daftar Konsumen (?ubah=1).
  useEffect(() => {
    if (awalUbah && bolehUbah) mulai();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awalUbah, bolehUbah]);

  const kotor = ubah && Object.keys(form).some((k) => teks(form[k]) !== teks(awal[k]));

  // Menutup atau memuat ulang tab browser membuang perubahan; browser yang bertanya.
  useEffect(() => {
    if (!kotor) return undefined;
    const cegah = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", cegah);
    return () => window.removeEventListener("beforeunload", cegah);
  }, [kotor]);

  // Nomor ganda, sama seperti formulir prospek — kecuali prospek asal
  // konsumen ini sendiri. Hanya peringatan, tidak menghalangi simpan.
  useEffect(() => {
    if (!ubah || teks(form.phone) === teks(awal.phone) || form.phone.replace(/\D/g, "").length < 9) {
      setGanda([]);
      return undefined;
    }
    let batal = false;
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("cek_nomor_prospek", { p_phone: form.phone, p_kecuali: konsumen.lead_id || null });
      if (!batal) setGanda(error ? [] : data || []);
    }, 400);
    return () => {
      batal = true;
      clearTimeout(t);
    };
  }, [ubah, form.phone, awal.phone, konsumen.lead_id]);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setGalat((g) => ({ ...g, [k]: undefined }));
  }

  function periksa() {
    const g = {};
    if (!form.name.trim()) g.name = "Nama wajib diisi.";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) g.email = "Format email tidak dikenali.";
    // NIK selalu 16 digit. Hanya diperiksa bila diubah: data lama yang
    // formatnya lain tidak boleh menghalangi koreksi kolom lain.
    const nik = form.ktp_number.replace(/\s/g, "");
    if (teks(form.ktp_number) !== teks(awal.ktp_number) && nik && !/^\d{16}$/.test(nik)) g.ktp_number = "No. KTP (NIK) terdiri dari 16 digit angka.";
    setGalat(g);
    return Object.keys(g).length === 0;
  }

  async function simpan() {
    if (!periksa()) return;
    setSaving(true);

    const rapi = (k) => {
      if (k === "penghasilan") return form.penghasilan === "" || form.penghasilan === null ? null : Number(form.penghasilan);
      if (k === "ktp_number") return form.ktp_number.replace(/\s/g, "") || null;
      return String(form[k] ?? "").trim() || null;
    };
    const ubahan = Object.fromEntries(KOLOM_KONSUMEN.filter((k) => teks(form[k]) !== teks(awal[k])).map((k) => [k, rapi(k)]));

    if (Object.keys(ubahan).length > 0) {
      // .select(): RLS yang menolak tidak melempar galat — pembaruannya hanya
      // mengenai nol baris, dan tanpa pemeriksaan ini layar akan mengabarkan
      // sesuatu yang tidak pernah tersimpan.
      const { data, error } = await supabase.from("customers").update(ubahan).eq("id", konsumen.id).select("id");
      if (error || !data?.length) {
        setSaving(false);
        toast.gagal(error ? `Gagal menyimpan: ${error.message}` : "Perubahan tidak tersimpan — Anda tidak punya akses untuk mengubah konsumen ini.");
        return;
      }
    }

    // Alamat KTP tinggal di customer_kpr, bukan di customers.
    if (teks(form.alamat_ktp) !== teks(awal.alamat_ktp)) {
      const { error } = await supabase
        .from("customer_kpr")
        .upsert({ customer_id: konsumen.id, alamat_ktp: form.alamat_ktp.trim() || null, updated_at: new Date().toISOString() }, { onConflict: "customer_id" });
      if (error) {
        setSaving(false);
        toast.gagal(`Data diri tersimpan, tetapi Alamat KTP gagal: ${error.message}`);
        onTersimpan?.();
        return;
      }
    }

    setSaving(false);
    setUbah(false);
    toast.sukses(
      "name" in ubahan || "phone" in ubahan
        ? "Data diri tersimpan — nama dan telepon di prospek asal ikut diperbarui."
        : "Data diri tersimpan."
    );
    onTersimpan?.();
  }

  if (!ubah) {
    return (
      <Card key="lihat">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Data Diri</div>
          {bolehUbah && (
            <button onClick={mulai} style={sekunder}>
              <Pencil size={12} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden="true" />
              Ubah
            </button>
          )}
        </div>
        <div className="rg-3" style={{ rowGap: 14 }}>
          <Baris label="Nama" nilai={konsumen.name} />
          <Baris label="Telepon" nilai={konsumen.phone} />
          <Baris label="Email" nilai={konsumen.email} />
          <Baris label="Username Sosial Media" nilai={konsumen.username_sosmed} />
          <Baris label="No. KTP" nilai={konsumen.ktp_number} />
          <Baris label="Penghasilan Terverifikasi / bulan" nilai={konsumen.penghasilan ? rupiah(konsumen.penghasilan) : null} />
          <Baris label="Alamat" nilai={konsumen.address} />
          <Baris label="Alamat KTP" nilai={kpr?.alamat_ktp} />
          <Baris label="Unit" nilai={konsumen.units?.unit_code ? `${konsumen.units.unit_code}${konsumen.units.price ? ` · ${rupiah(konsumen.units.price)}` : ""}` : null} />
        </div>
      </Card>
    );
  }

  return (
    // Shorthand `border`, bukan `borderColor`: mencampur keduanya membuat React
    // mengosongkan warna tepi saat kembali ke mode lihat, dan tepinya jatuh ke
    // currentColor yang gelap. `key` memisahkan kedua kartu sepenuhnya.
    <Card key="ubah" style={{ border: `1px solid ${PRIMARY_SOFT}`, boxShadow: "0 0 0 3px #EEF2FA" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Data Diri</div>
        <span style={{ fontSize: 12, color: TEXT_MID }}>· mengubah</span>
      </div>

      <div className="rg-3" style={{ rowGap: 14 }}>
        <Field label="Nama" wajib error={galat.name}>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
        </Field>
        <Field label="Telepon">
          <input type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="08…" />
        </Field>
        <Field label="Email" error={galat.email}>
          <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="nama@contoh.com" />
        </Field>
        <Field label="Username Sosial Media">
          <input value={form.username_sosmed} onChange={(e) => set("username_sosmed", e.target.value)} placeholder="mis. @rina.k" />
        </Field>
        <Field label="No. KTP (NIK)" error={galat.ktp_number}>
          <input inputMode="numeric" value={form.ktp_number} onChange={(e) => set("ktp_number", e.target.value)} placeholder="16 digit" maxLength={20} />
        </Field>
        <Field label="Penghasilan Terverifikasi / bulan" hint="Dipakai peringatan rasio angsuran di Progres KPR.">
          <InputRupiah value={form.penghasilan} onChange={(n) => set("penghasilan", n)} placeholder="mis. 5jt" />
        </Field>
        <Field label="Alamat" style={{ gridColumn: "span 1" }}>
          <input value={form.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <div style={{ minWidth: 0 }}>
          <Field label="Alamat KTP">
            <input value={form.alamat_ktp} onChange={(e) => set("alamat_ktp", e.target.value)} />
          </Field>
          {form.address.trim() && form.address.trim() !== form.alamat_ktp.trim() && (
            <button
              type="button"
              onClick={() => set("alamat_ktp", form.address.trim())}
              style={{ border: "none", background: "none", color: PRIMARY, fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: "5px 0 0" }}
            >
              Samakan dengan alamat
            </button>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 }}>Unit</div>
          <div style={{ fontSize: 13, color: TEXT_DARK, padding: "10px 0 0" }}>{konsumen.units?.unit_code || "-"}</div>
          <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 4, lineHeight: 1.45 }}>Ganti unit tidak dilakukan dari sini.</div>
        </div>
      </div>

      {ganda.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <PeringatanGanda baris={ganda} onBuka={(lid) => navigate(`/prospek?sorot=${lid}`)} />
        </div>
      )}

      <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
        <button onClick={() => setUbah(false)} disabled={saving} style={sekunder}>
          Batal
        </button>
        <PrimaryButton subject="customer" onClick={simpan} disabled={saving || !kotor}>
          {saving ? "Menyimpan…" : "Simpan Perubahan"}
        </PrimaryButton>
      </div>
    </Card>
  );
}

function Baris({ label, nilai }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: TEXT_MID, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: nilai ? TEXT_DARK : TEXT_MID, wordBreak: "break-word" }}>{nilai || "-"}</div>
    </div>
  );
}

const sekunder = {
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  borderRadius: 999,
  padding: "8px 15px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};
