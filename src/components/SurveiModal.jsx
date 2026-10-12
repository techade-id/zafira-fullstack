import React, { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useToast } from "../context/ToastContext";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { hariIni, tanggal } from "../lib/format";
import { uploadFile } from "../lib/storage";
import { kabarkanRiwayat } from "./FollowUpTimeline";
import { PemilihBukti } from "./CatatFollowUpModal";
import LampiranTahap from "./LampiranTahap";
import { Modal, PrimaryButton, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, NEGATIVE, inputStyle } from "./ui";

/**
 * Survei lokasi — langkah kedua alur klien: Leads → Chat → Survei → BI Checking.
 *
 * Dipisah dari Chat Follow Up karena isinya berbeda: tanggal survei, foto
 * dokumentasi di lokasi bersama calon pembeli, dan catatan survei. Ketiganya
 * mengisi Saringan Awal dan ikut ke berkas KPR saat booking — tanpa diketik
 * ulang oleh Admin Marketing.
 *
 * Disimpan lewat catat_followup() sebagai "Survei Lokasi": satu transaksi
 * untuk riwayat, foto, tanggal survei, dan jadwal berikutnya. Begitu tersimpan,
 * kolom Progres di Follow Up Leads berubah menjadi "Sudah Survei".
 */

const SURVEI = "Survei Lokasi";

/** Tanggal lokal perangkat, bukan UTC — lihat hariIni(). */
function tanggalPlus(hari) {
  const d = new Date();
  d.setDate(d.getDate() + hari);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SurveiModal({ lead, open, onClose, onSelesai }) {
  const toast = useToast();
  const hasilOptions = useBusinessSettings("hasil_followup");

  const [tanggalSurvei, setTanggalSurvei] = useState(hariIni());
  const [hasil, setHasil] = useState("");
  const [catatan, setCatatan] = useState("");
  const [foto, setFoto] = useState([]);
  const [tanggalRencana, setTanggalRencana] = useState("");
  const [rencana, setRencana] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!open || !lead) return;
    setTanggalSurvei(hariIni());
    setHasil("");
    setCatatan("");
    setFoto([]);
    // Sesudah survei, langkah wajarnya BI Checking — dua hari cukup untuk
    // mengumpulkan KTP.
    setTanggalRencana(tanggalPlus(2));
    setRencana("BI Checking");
    setGalat("");
    setKirim(false);
  }, [open, lead]);

  async function simpan() {
    if (!tanggalSurvei) {
      setGalat("Isi tanggal survei.");
      return;
    }
    if (tanggalSurvei > hariIni()) {
      setGalat("Tanggal survei tidak boleh melewati hari ini — catat survei setelah terjadi.");
      return;
    }
    if (!catatan.trim() && !hasil) {
      setGalat("Isi catatan survei — mis. blok yang disukai, keberatan, siapa yang ikut.");
      return;
    }
    if (foto.length === 0) {
      setGalat("Lampirkan foto dokumentasi survei.");
      return;
    }
    if (!tanggalRencana) {
      setGalat("Tentukan kapan prospek ini dihubungi lagi.");
      return;
    }

    setKirim(true);
    setGalat("");

    const unggahan = await Promise.all(foto.map((f) => uploadFile("berkas-lampiran", `${lead.id}/survei`, f)));
    const gagal = unggahan.findIndex((u) => u.error || !u.path);
    if (gagal >= 0) {
      setKirim(false);
      setGalat(`Foto "${foto[gagal].name}" gagal diunggah: ${unggahan[gagal].error?.message || "coba lagi."}`);
      return;
    }

    const { error } = await supabase.rpc("catat_followup", {
      p_lead_id: lead.id,
      p_tanggal: tanggalSurvei,
      p_aktivitas: SURVEI,
      p_hasil: hasil || null,
      p_catatan: catatan.trim() || null,
      p_lampiran: unggahan.map((u, i) => ({ path: u.path, nama: foto[i].name })),
      p_tanggal_rencana: tanggalRencana,
      p_rencana: rencana.trim() || null,
      p_kategori: null,
    });

    setKirim(false);
    if (error) {
      setGalat(error.message);
      return;
    }

    kabarkanRiwayat({ leadId: lead.id });
    toast.sukses(`Survei ${lead.name} tercatat — progresnya kini "Sudah Survei".`);
    onSelesai?.();
    onClose?.();
  }

  if (!lead) return null;

  return (
    <Modal open={open} labelledBy="survei-judul" onClose={() => !kirim && onClose?.()} width={520}>
      <>
        <div id="survei-judul" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          <MapPin size={17} color={PRIMARY} aria-hidden="true" />
          Survei — {lead.name}
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 16, lineHeight: 1.5 }}>
          {lead.tanggal_survei ? (
            <>
              Survei terakhir <b style={{ color: TEXT_DARK }}>{tanggal(lead.tanggal_survei)}</b>. Survei baru ditambahkan ke
              riwayat; foto lama tetap tersimpan.
            </>
          ) : (
            "Tanggal, foto, dan catatan survei ini mengisi Saringan Awal dan ikut ke berkas KPR saat booking."
          )}
        </div>

        {lead.tanggal_survei && (
          <div style={{ marginBottom: 14 }}>
            <LampiranTahap slot="survei" leadId={lead.id} label="Foto survei sebelumnya" editable={false} />
          </div>
        )}

        <div className="rg-2" style={{ marginBottom: 14 }}>
          <div>
            <label htmlFor="sv-tanggal" style={labelGaya}>
              Tanggal Survei
            </label>
            <input id="sv-tanggal" type="date" value={tanggalSurvei} max={hariIni()} onChange={(e) => setTanggalSurvei(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="sv-hasil" style={labelGaya}>
              Hasil <span style={{ fontWeight: 400 }}>(opsional)</span>
            </label>
            <select id="sv-hasil" value={hasil} onChange={(e) => setHasil(e.target.value)} style={inputStyle}>
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
          <label htmlFor="sv-catatan" style={labelGaya}>
            Catatan Survei
          </label>
          <textarea
            id="sv-catatan"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="mis. Survei bersama istri, suka blok C dekat taman, minta simulasi KPR"
            style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        <PemilihBukti
          bukti={foto}
          onUbah={setFoto}
          disabled={kirim}
          wajib
          judul="Foto Dokumentasi Survei"
          petunjuk="Foto di lokasi bersama calon pembeli. Boleh lebih dari satu."
        />

        <div style={{ background: PRIMARY_SOFT, borderRadius: 13, padding: "14px 15px", marginBottom: 18 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: PRIMARY, marginBottom: 10, letterSpacing: "0.03em" }}>LANGKAH BERIKUTNYA</div>
          <div className="rg-2">
            <div>
              <label htmlFor="sv-rencana-tgl" style={labelGaya}>
                Dihubungi lagi pada
              </label>
              <input id="sv-rencana-tgl" type="date" value={tanggalRencana} onChange={(e) => setTanggalRencana(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="sv-rencana" style={labelGaya}>
                Yang akan dilakukan
              </label>
              <input id="sv-rencana" value={rencana} onChange={(e) => setRencana(e.target.value)} style={inputStyle} />
            </div>
          </div>
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
            {kirim ? "Menyimpan…" : "Simpan Survei"}
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
