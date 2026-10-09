import React, { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { roleOf } from "../lib/permissions";
import { hariIni } from "../lib/format";
import { uploadFile } from "../lib/storage";
import { kabarkanPengajuan } from "./TinjauPengajuan";
import { JENIS_FOLLOWUP, PemilihBukti } from "./CatatFollowUpModal";
import { Modal, PrimaryButton, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, ACCENT_SOFT, ACCENT_DARK, NEGATIVE, inputStyle } from "./ui";

const SURVEI = "Survei Lokasi";

/**
 * Mengajukan perubahan atas catatan follow-up sendiri (migrasi 025).
 *
 * Catatan follow-up adalah jejak — status prospek, Kontak Terakhir, dan
 * Saringan Awal dibaca darinya — jadi perubahan dari penulisnya baru berlaku
 * setelah Admin Sistem menyetujuinya. Admin Sistem sendiri adalah
 * penyetujunya: perubahannya langsung berlaku, tetapi tetap tercatat sebagai
 * pengajuan yang disetujui.
 *
 * Bukti lama tidak bisa dihapus dari sini, hanya ditambah.
 */
export default function AjukanUbahCatatan({ catatan, open, onClose, onSelesai }) {
  const { profile } = useAuth();
  const toast = useToast();
  const hasilOptions = useBusinessSettings("hasil_followup");
  const langsung = roleOf(profile) === "admin";

  const [aktivitas, setAktivitas] = useState("");
  const [tanggal, setTanggal] = useState("");
  const [hasil, setHasil] = useState("");
  const [teks, setTeks] = useState("");
  const [bukti, setBukti] = useState([]);
  const [alasan, setAlasan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!open || !catatan) return;
    setAktivitas(catatan.activity || "");
    setTanggal(catatan.tanggal_followup || hariIni());
    setHasil(catatan.hasil || "");
    setTeks(catatan.note || "");
    setBukti([]);
    setAlasan("");
    setGalat("");
    setKirim(false);
  }, [open, catatan]);

  if (!catatan) return null;

  // Catatan lama bisa berjenis teks bebas ("Follow-up selesai", "Telepon
  // sore"): tetap ditawarkan, supaya membuka formulir tidak diam-diam
  // mengganti jenisnya.
  const pilihanJenis = JENIS_FOLLOWUP.some((j) => j.nilai === catatan.activity)
    ? JENIS_FOLLOWUP.map((j) => j.nilai)
    : [catatan.activity, ...JENIS_FOLLOWUP.map((j) => j.nilai)].filter(Boolean);
  const gantiSurvei = (catatan.activity === SURVEI) !== (aktivitas === SURVEI);

  async function simpan() {
    if (!aktivitas) {
      setGalat("Pilih jenis follow-up.");
      return;
    }
    if (!tanggal) {
      setGalat("Isi tanggal follow-up.");
      return;
    }
    if (tanggal > hariIni()) {
      setGalat("Tanggal follow-up tidak boleh melewati hari ini.");
      return;
    }
    if (!hasil && !teks.trim()) {
      setGalat("Isi hasil follow-up atau catatannya.");
      return;
    }
    if (!alasan.trim()) {
      setGalat("Tuliskan alasan perubahannya — itulah yang dibaca Admin saat memutuskan.");
      return;
    }

    setKirim(true);
    setGalat("");

    // Bukti tambahan masuk folder follow-up dulu; slotnya baru dipindah ke
    // survei bila perubahan ini disetujui sebagai Survei Lokasi.
    const unggahan = await Promise.all(bukti.map((f) => uploadFile("berkas-lampiran", `${catatan.lead_id}/followup`, f)));
    const gagal = unggahan.findIndex((u) => u.error || !u.path);
    if (gagal >= 0) {
      setKirim(false);
      setGalat(`Bukti "${bukti[gagal].name}" gagal diunggah: ${unggahan[gagal].error?.message || "coba lagi."}`);
      return;
    }

    const { data, error } = await supabase.rpc("ajukan_ubah_catatan", {
      p_activity_id: catatan.id,
      p_aktivitas: aktivitas,
      p_tanggal: tanggal,
      p_hasil: hasil || null,
      p_catatan: teks.trim() || null,
      p_alasan: alasan.trim(),
      p_lampiran: unggahan.map((u, i) => ({ path: u.path, nama: bukti[i].name })),
    });

    setKirim(false);
    if (error) {
      setGalat(error.message);
      return;
    }

    toast.sukses(data?.status === "disetujui" ? "Perubahan catatan tersimpan." : "Perubahan diajukan — menunggu persetujuan Admin.");
    // Riwayat, lonceng, angka di menu, dan penanda di Follow Up Leads.
    kabarkanPengajuan(catatan.lead_id);
    onSelesai?.();
    onClose?.();
  }

  return (
    <Modal open={open} labelledBy="ubah-catatan-judul" onClose={() => !kirim && onClose?.()} width={520}>
      <>
        <div id="ubah-catatan-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          {langsung ? "Ubah Catatan" : "Ajukan Perubahan Catatan"}
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 18, lineHeight: 1.5 }}>
          {langsung
            ? "Sebagai Admin Sistem, perubahan Anda langsung berlaku dan tetap tercatat beserta alasannya."
            : "Catatan tidak berubah sampai Admin Sistem menyetujui. Sementara itu catatan ini ditandai “menunggu persetujuan”."}
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={labelGaya}>Jenis Follow Up</span>
          <div role="group" aria-label="Jenis follow up" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {pilihanJenis.map((j) => {
              const aktif = aktivitas === j;
              return (
                <button
                  key={j}
                  type="button"
                  onClick={() => setAktivitas(j)}
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
                  {j}
                </button>
              );
            })}
          </div>
          {gantiSurvei && (
            <div style={{ display: "flex", gap: 7, alignItems: "flex-start", marginTop: 9, fontSize: 11.5, color: ACCENT_DARK, background: ACCENT_SOFT, borderRadius: 10, padding: "8px 11px", lineHeight: 1.5 }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
              <span>
                {aktivitas === SURVEI
                  ? "Menjadi Survei Lokasi: setelah disetujui, tanggal dan buktinya ikut mengisi Survei di Saringan Awal."
                  : "Tidak lagi Survei Lokasi: setelah disetujui, tanggal survei di Saringan Awal dihitung ulang dan buktinya keluar dari lampiran survei."}
              </span>
            </div>
          )}
        </div>

        <div className="rg-2" style={{ marginBottom: 14 }}>
          <div>
            <label htmlFor="uc-tanggal" style={labelGaya}>
              Tanggal Follow Up
            </label>
            <input id="uc-tanggal" type="date" value={tanggal} max={hariIni()} onChange={(e) => setTanggal(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="uc-hasil" style={labelGaya}>
              Hasil Follow Up
            </label>
            <select id="uc-hasil" value={hasil} onChange={(e) => setHasil(e.target.value)} style={inputStyle}>
              <option value="">— pilih —</option>
              {withCurrentValue(hasilOptions, hasil).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label htmlFor="uc-catatan" style={labelGaya}>
            Catatan Komunikasi
          </label>
          <textarea
            id="uc-catatan"
            value={teks}
            onChange={(e) => setTeks(e.target.value)}
            style={{ ...inputStyle, minHeight: 80, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        <PemilihBukti
          bukti={bukti}
          onUbah={setBukti}
          disabled={kirim}
          judul="Bukti Tambahan"
          petunjuk="Opsional. Bukti yang sudah ada tetap tersimpan dan tidak bisa dihapus dari sini."
        />

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="uc-alasan" style={labelGaya}>
            Alasan Perubahan<span style={{ color: NEGATIVE }} aria-hidden="true"> *</span>
          </label>
          <input
            id="uc-alasan"
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            placeholder="mis. Salah pilih tanggal — chatnya kemarin sore"
            style={inputStyle}
          />
        </div>

        {galat && (
          <div role="alert" style={{ fontSize: 12.5, color: NEGATIVE, marginBottom: 14, lineHeight: 1.5 }}>
            {galat}
          </div>
        )}

        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={kirim} style={gayaSekunder}>
            Batal
          </button>
          <PrimaryButton onClick={simpan} disabled={kirim}>
            {kirim ? "Menyimpan…" : langsung ? "Simpan Perubahan" : "Ajukan Perubahan"}
          </PrimaryButton>
        </div>
      </>
    </Modal>
  );
}

const labelGaya = { display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 };

const gayaSekunder = {
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  borderRadius: 999,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
