import React, { useEffect, useMemo, useState } from "react";
import { Upload, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useToast } from "../context/ToastContext";
import { segarkanNotifikasi } from "../lib/useNotifications";
import { catatPembayaran, ubahPembayaran } from "../lib/berkas";
import { rupiah, labelJenisBayar, hariIni } from "../lib/format";
import InputRupiah from "./InputRupiah";
import { Modal, Field, PrimaryButton, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT } from "./ui";

/**
 * Satu-satunya formulir pembayaran: catat dan ubah, dari halaman konsumen,
 * halaman Pembayaran, dan tahap Booking/DP di Progres KPR.
 *
 * Dari halaman konsumen dan Progres KPR, konsumennya sudah pasti dan dikunci.
 * Hanya halaman Pembayaran yang memilih konsumen dari daftar — dulu itulah
 * satu-satunya jalan, dan memilih satu nama dari ratusan nama adalah tempat
 * paling mudah salah catat.
 *
 * Bukti transfer boleh ikut saat mencatat: pembayaran langsung masuk antrean
 * verifikasi Finance tanpa langkah kedua.
 */

export const JENIS_BAYAR = ["booking", "dp", "termin", "pelunasan", "dana_talangan", "lainnya"];

/**
 * @param konsumen   { id, name } bila sudah pasti; null → pilih dari daftar
 * @param pembayaran baris yang diubah, atau null untuk pembayaran baru
 * @param jenisAwal  jenis bawaan untuk pembayaran baru
 */
export default function ModalPembayaran({ open, konsumen = null, pembayaran = null, jenisAwal = "dp", onClose, onSaved }) {
  const toast = useToast();
  const ubah = Boolean(pembayaran);
  // Nilai, bukan objek: pemanggil biasanya menulis konsumen={{ id, name }}
  // inline, dan objek baru di setiap render akan mengosongkan formulir yang
  // sedang diketik.
  const idKonsumen = konsumen?.id || null;
  const namaDiberi = konsumen?.name || "";

  const [form, setForm] = useState({});
  const [awal, setAwal] = useState({});
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [daftarKonsumen, setDaftarKonsumen] = useState([]);
  const [namaKonsumen, setNamaKonsumen] = useState("");
  const [konteks, setKonteks] = useState({ kpr: null, bayar: [] });

  useEffect(() => {
    if (!open) return;
    const isi = pembayaran
      ? {
          customer_id: pembayaran.customer_id,
          payment_type: pembayaran.payment_type,
          amount: pembayaran.amount ?? "",
          payment_date: pembayaran.payment_date || hariIni(),
          notes: pembayaran.notes || "",
        }
      : { customer_id: idKonsumen || "", payment_type: jenisAwal, amount: "", payment_date: hariIni(), notes: "" };
    setForm(isi);
    setAwal(isi);
    setFile(null);
    setError("");
    setNamaKonsumen(namaDiberi);
  }, [open, pembayaran, idKonsumen, namaDiberi, jenisAwal]);

  // Halaman Pembayaran: daftar konsumen untuk dipilih. Dari tempat lain cukup
  // namanya, bila pemanggil hanya tahu id-nya.
  useEffect(() => {
    if (!open) return;
    if (!idKonsumen && !pembayaran) {
      supabase.from("customers").select("id, name").order("name").then(({ data }) => setDaftarKonsumen(data || []));
    } else if (!namaDiberi && form.customer_id) {
      supabase.from("customers").select("name").eq("id", form.customer_id).maybeSingle().then(({ data }) => setNamaKonsumen(data?.name || ""));
    }
  }, [open, idKonsumen, namaDiberi, pembayaran, form.customer_id]);

  // Saran nominal: sisa Booking dan sisa DP terhadap angka di Progres KPR.
  useEffect(() => {
    if (!open || !form.customer_id) {
      setKonteks({ kpr: null, bayar: [] });
      return;
    }
    let batal = false;
    Promise.all([
      supabase.from("customer_kpr").select("nominal_booking, nominal_total_dp, nominal_dp").eq("customer_id", form.customer_id).maybeSingle(),
      supabase.from("payments").select("id, payment_type, amount").eq("customer_id", form.customer_id),
    ]).then(([k, p]) => {
      if (!batal) setKonteks({ kpr: k.data || null, bayar: p.data || [] });
    });
    return () => {
      batal = true;
    };
  }, [open, form.customer_id]);

  const saran = useMemo(() => {
    const target = {
      booking: Number(konteks.kpr?.nominal_booking) || 0,
      dp: Number(konteks.kpr?.nominal_total_dp || konteks.kpr?.nominal_dp) || 0,
    }[form.payment_type];
    if (!target) return null;
    const sudah = konteks.bayar
      .filter((b) => b.payment_type === form.payment_type && b.id !== pembayaran?.id)
      .reduce((s, b) => s + Number(b.amount || 0), 0);
    const sisa = target - sudah;
    return { target, sudah, sisa };
  }, [konteks, form.payment_type, pembayaran]);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setError("");
  }

  const kotor = file || Object.keys(form).some((k) => String(form[k] ?? "") !== String(awal[k] ?? ""));

  async function simpan() {
    if (!form.customer_id) return setError("Pilih konsumennya.");
    if (!Number(form.amount) || Number(form.amount) <= 0) return setError("Nominal wajib diisi.");
    if (!form.payment_date) return setError("Tanggal pembayaran wajib diisi.");

    setSaving(true);
    const isi = {
      payment_type: form.payment_type,
      amount: Number(form.amount),
      payment_date: form.payment_date,
      notes: form.notes.trim() || null,
    };
    const hasil = ubah ? await ubahPembayaran(pembayaran, isi) : await catatPembayaran({ customer_id: form.customer_id, ...isi, file });
    setSaving(false);
    if (hasil.error) {
      setError(hasil.error);
      return;
    }

    const nama = `${labelJenisBayar(isi.payment_type)} ${rupiah(isi.amount)}`;
    toast.sukses(
      ubah
        ? `${nama} — perubahan tersimpan.`
        : file
          ? `${nama} tercatat dan masuk antrean verifikasi Finance.`
          : `${nama} tercatat. Unggah bukti transfernya agar Finance bisa memverifikasi.`
    );
    segarkanNotifikasi();
    onClose();
    onSaved?.(hasil.id || pembayaran?.id || null);
  }

  return (
    // Klik di luar atau Escape tidak menutup formulir yang sudah terisi.
    <Modal open={open} labelledBy="bayar-judul" onClose={() => !saving && !kotor && onClose()} width={520}>
      <div id="bayar-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
        {ubah ? "Ubah Pembayaran" : "Catat Pembayaran"}
        {namaKonsumen && <span style={{ fontWeight: 500, color: TEXT_MID }}> — {namaKonsumen}</span>}
      </div>
      <div style={{ fontSize: 12.5, color: TEXT_MID, marginBottom: 18, lineHeight: 1.55 }}>
        {ubah
          ? "Status verifikasi tidak berubah dari sini."
          : "Verifikasi dan kuitansi resmi tetap wewenang Finance. Lampirkan bukti transfer agar pembayaran langsung masuk antreannya."}
      </div>

      {!idKonsumen && !ubah && (
        <Field label="Konsumen" wajib style={{ marginBottom: 14 }}>
          <select value={form.customer_id || ""} onChange={(e) => set("customer_id", e.target.value)}>
            <option value="">— pilih —</option>
            {daftarKonsumen.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div style={{ marginBottom: 14 }}>
        <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 6 }}>Jenis Pembayaran</span>
        <div role="group" aria-label="Jenis pembayaran" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {JENIS_BAYAR.map((j) => {
            const aktif = form.payment_type === j;
            return (
              <button
                key={j}
                type="button"
                onClick={() => set("payment_type", j)}
                aria-pressed={aktif}
                style={{
                  padding: "7px 13px",
                  borderRadius: 999,
                  border: `1px solid ${aktif ? PRIMARY : BORDER}`,
                  background: aktif ? PRIMARY : SURFACE,
                  color: aktif ? "#fff" : TEXT_MID,
                  fontSize: 12.5,
                  fontWeight: aktif ? 600 : 500,
                  cursor: "pointer",
                }}
              >
                {labelJenisBayar(j)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rg-2" style={{ marginBottom: saran ? 8 : 14 }}>
        <Field label="Nominal" wajib>
          <InputRupiah
            value={form.amount}
            onChange={(n) => set("amount", n)}
            pilihanCepat={form.payment_type === "booking" ? [3e6, 5e6, 7e6, 10e6] : undefined}
          />
        </Field>
        <Field label="Tanggal Pembayaran" wajib>
          <input type="date" value={form.payment_date || ""} onChange={(e) => set("payment_date", e.target.value)} />
        </Field>
      </div>

      {/* Sisa terhadap angka di Progres KPR — DP sering dibayar dicicil, dan
          menghitung sisanya di kepala adalah tempat salah ketik terjadi. */}
      {saran && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            justifyContent: "space-between",
            flexWrap: "wrap",
            background: PRIMARY_SOFT,
            borderRadius: 11,
            padding: "9px 12px",
            marginBottom: 14,
            fontSize: 12,
            color: TEXT_DARK,
            lineHeight: 1.5,
          }}
        >
          <span>
            {labelJenisBayar(form.payment_type)} {rupiah(saran.target)} · sudah dicatat {rupiah(saran.sudah)} ·{" "}
            <b>{saran.sisa > 0 ? `sisa ${rupiah(saran.sisa)}` : "sudah lunas"}</b>
          </span>
          {saran.sisa > 0 && Number(form.amount) !== saran.sisa && (
            <button
              type="button"
              onClick={() => set("amount", saran.sisa)}
              style={{ border: "none", background: "none", color: PRIMARY, fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 }}
            >
              Pakai sisa
            </button>
          )}
        </div>
      )}

      {!ubah && (
        <div style={{ marginBottom: 14 }}>
          <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 6 }}>Bukti Transfer (opsional)</span>
          {file ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${BORDER}`, borderRadius: 11, padding: "8px 11px", fontSize: 12.5 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: TEXT_DARK }} title={file.name}>
                {file.name}
              </span>
              <button type="button" onClick={() => setFile(null)} aria-label="Lepas berkas" style={{ border: "none", background: "none", color: TEXT_MID, cursor: "pointer", padding: 2, lineHeight: 0 }}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: `1px dashed #C7D3EA`,
                background: "#FBFCFE",
                color: PRIMARY,
                borderRadius: 11,
                padding: "9px 13px",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Upload size={13} aria-hidden="true" />
              Pilih berkas — foto atau PDF
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) setFile(f);
                }}
                style={{ display: "none" }}
              />
            </label>
          )}
        </div>
      )}

      <Field label="Catatan" style={{ marginBottom: 6 }}>
        <input value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} placeholder="mis. Transfer dari rekening suami" />
      </Field>

      {error && (
        <div role="alert" style={{ fontSize: 12.5, color: "#C2413B", marginTop: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 18 }}>
        <button type="button" onClick={onClose} disabled={saving} style={sekunder}>
          Batal
        </button>
        <PrimaryButton subject="payment" onClick={simpan} disabled={saving}>
          {saving ? "Menyimpan…" : ubah ? "Simpan Perubahan" : "Simpan Pembayaran"}
        </PrimaryButton>
      </div>
    </Modal>
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
