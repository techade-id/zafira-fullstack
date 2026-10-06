import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canWrite } from "../lib/permissions";
import { putuskanBerkas } from "../lib/berkas";
import { Modal, BORDER, SURFACE, TEXT_MID, TEXT_DARK, NEGATIVE, inputStyle } from "./ui";

/**
 * Verifikasi dan penolakan berkas syarat bank — satu perilaku untuk kartu
 * Dokumen Konsumen, layar pratinjau, dan tahap Bank di Progres KPR.
 *
 * Wewenangnya Admin dan Admin Marketing (document_verify); server menegakkan
 * hal yang sama lewat guard_document_verification (migration_021).
 *
 * `tolak(doc)` mengembalikan Promise<boolean>: penolakan butuh alasan, dan
 * alasannya diminta lewat dialog — pemanggil cukup menunggu hasilnya.
 */
export function useVerifikasiBerkas() {
  const { profile } = useAuth();
  const toast = useToast();
  const boleh = canWrite(profile, "document_verify");
  const [sibuk, setSibuk] = useState(null);
  const [penolakan, setPenolakan] = useState(null); // { doc, selesai(bool) }

  async function verifikasi(doc) {
    setSibuk(doc.id);
    const { error } = await putuskanBerkas(doc, "terverifikasi");
    setSibuk(null);
    if (error) {
      toast.gagal(error);
      return false;
    }
    toast.sukses(`${doc.doc_type} terverifikasi.`);
    return true;
  }

  function tolak(doc) {
    return new Promise((selesai) => setPenolakan({ doc, selesai }));
  }

  const elemen = (
    <ModalTolakBerkas
      open={Boolean(penolakan)}
      namaBerkas={penolakan?.doc.doc_type}
      onBatal={() => {
        penolakan?.selesai(false);
        setPenolakan(null);
      }}
      onKirim={async (alasan) => {
        const { error } = await putuskanBerkas(penolakan.doc, "ditolak", alasan);
        if (error) return error;
        toast.sukses(`${penolakan.doc.doc_type} ditolak — alasannya terlihat oleh pengunggah.`);
        penolakan.selesai(true);
        setPenolakan(null);
        return null;
      }}
    />
  );

  return { boleh, sibuk, verifikasi, tolak, elemen };
}

/** Alasan yang paling sering — satu ketukan, lalu boleh dilengkapi. */
const ALASAN_CEPAT = ["Foto buram / tidak terbaca", "Dokumen kedaluwarsa", "Bukan dokumen yang diminta", "Halaman tidak lengkap", "Data tidak sesuai dengan KTP"];

function ModalTolakBerkas({ open, namaBerkas, onBatal, onKirim }) {
  const [alasan, setAlasan] = useState("");
  const [galat, setGalat] = useState("");
  const [kirim, setKirim] = useState(false);
  const kolom = useRef(null);

  useEffect(() => {
    if (!open) return;
    setAlasan("");
    setGalat("");
    setKirim(false);
    setTimeout(() => kolom.current?.focus(), 60);
  }, [open]);

  async function jalankan() {
    if (!alasan.trim()) {
      setGalat("Tuliskan alasannya — itulah yang dibaca pengunggah untuk memperbaiki berkasnya.");
      kolom.current?.focus();
      return;
    }
    setKirim(true);
    const e = await onKirim(alasan.trim());
    setKirim(false);
    if (e) setGalat(e);
  }

  return (
    <Modal open={open} labelledBy="tolak-judul" onClose={() => !kirim && onBatal()} width={460}>
      <div id="tolak-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
        Tolak {namaBerkas}?
      </div>
      <div style={{ fontSize: 12.5, color: TEXT_MID, marginBottom: 14, lineHeight: 1.55 }}>
        Berkas ditandai ditolak dan harus diunggah ulang. Alasannya tampil di daftar berkas.
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {ALASAN_CEPAT.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => {
              setAlasan(a);
              setGalat("");
              kolom.current?.focus();
            }}
            aria-pressed={alasan === a}
            style={{
              border: `1px solid ${alasan === a ? NEGATIVE : BORDER}`,
              background: alasan === a ? "#FBE9E8" : SURFACE,
              color: alasan === a ? NEGATIVE : TEXT_DARK,
              borderRadius: 999,
              padding: "5px 11px",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {a}
          </button>
        ))}
      </div>

      <label htmlFor="tolak-alasan" style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 }}>
        Alasan penolakan <span style={{ color: NEGATIVE }}>*</span>
      </label>
      <textarea
        id="tolak-alasan"
        ref={kolom}
        value={alasan}
        onChange={(e) => {
          setAlasan(e.target.value);
          setGalat("");
        }}
        placeholder="mis. Foto KTP terpotong di bagian bawah, NIK tidak terbaca"
        style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
      />

      {galat && (
        <div role="alert" style={{ fontSize: 12.5, color: NEGATIVE, marginTop: 8 }}>
          {galat}
        </div>
      )}

      <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 16, flexWrap: "wrap" }}>
        <button type="button" onClick={onBatal} disabled={kirim} style={sekunder}>
          Batal
        </button>
        <button type="button" onClick={jalankan} disabled={kirim} style={{ ...sekunder, background: NEGATIVE, borderColor: NEGATIVE, color: "#fff" }}>
          {kirim ? "Menyimpan…" : "Tolak berkas"}
        </button>
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
