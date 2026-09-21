import React, { useEffect, useMemo, useState } from "react";
import { FileText, Upload, Check, AlertTriangle, Landmark } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { uploadFile, getSignedUrl } from "../lib/storage";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canWrite } from "../lib/permissions";
import { useSyaratBerkas, cocokkanBerkas } from "../lib/useSyaratBerkas";
import { tanggalWaktu } from "../lib/format";
import {
  BORDER,
  SURFACE,
  TEXT_MID,
  TEXT_DARK,
  PRIMARY,
  PRIMARY_SOFT,
  ACCENT,
  ACCENT_SOFT,
  ACCENT_DARK,
  POSITIVE,
  NEGATIVE,
} from "./ui";

const STATUS_DOK = ["menunggu", "terverifikasi", "ditolak"];

/**
 * Daftar berkas bank — yang kurang di atas, yang sudah ada di bawah.
 *
 * BRIEF §Bank, hampir kata per kata: "tambahkan list dokumen yang perlu di
 * upload & penomoran … dokumen yang belum di upload itu berada di atas section
 * dokumen yang sudah kita upload … terletak di bawahnya nama bank, dan juga
 * berikan Notifikasi jika belum mengupload berkas yang kurang."
 *
 * Urutannya adalah seluruh isi permintaan itu. Daftar yang mengurut menurut
 * nomor syarat membuat orang memindai empat belas baris untuk menemukan tiga
 * yang belum ada; daftar yang menaruh kekurangan di depan menjawabnya tanpa
 * dibaca. Penomoran tetap mengikuti nomor syarat aslinya, bukan urutan
 * tampilan — supaya nomor yang disebut di telepon dengan pihak bank tidak
 * berubah-ubah tergantung berapa yang sudah diunggah.
 */
export default function BerkasBankPanel({ customerId, bank, editable, onChange }) {
  const { profile } = useAuth();
  const toast = useToast();
  const bolehHapus = canWrite(profile, "document_delete");

  const { syarat, pakaiBawaan } = useSyaratBerkas(bank);
  const [dokumen, setDokumen] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [unggah, setUnggah] = useState(null);

  async function muat() {
    if (!customerId) return;
    setMemuat(true);
    const { data } = await supabase
      .from("customer_documents")
      .select("*")
      .eq("customer_id", customerId)
      .order("uploaded_at", { ascending: false });
    setDokumen(data || []);
    setMemuat(false);
  }

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const rekap = useMemo(() => cocokkanBerkas(syarat, dokumen), [syarat, dokumen]);

  // Nomor melekat pada syaratnya, bukan pada posisinya di layar.
  const bernomor = useMemo(
    () => rekap.baris.map((b, i) => ({ ...b, nomor: i + 1 })),
    [rekap.baris]
  );
  // Yang menahan "Proses Bank" hanyalah dokumen WAJIB — itulah aturan yang
  // ditegakkan tandai_proses_bank() di server. Menghitung dokumen opsional
  // sebagai kurang membuat layar menyalakan peringatan untuk berkas yang
  // sebenarnya sudah boleh diproses, dan peringatan yang tidak bisa
  // dituntaskan adalah peringatan yang berhenti dibaca.
  const belum = bernomor.filter((b) => (b.keadaan === "belum" && b.wajib) || b.keadaan === "ditolak");
  const opsionalKosong = bernomor.filter((b) => b.keadaan === "belum" && !b.wajib);
  const sudah = bernomor.filter((b) => b.keadaan !== "belum" && b.keadaan !== "ditolak");

  async function kirim(baris, file) {
    if (!file) return;
    setUnggah(baris.doc_type);
    const { path, error: upErr } = await uploadFile("customer-documents", customerId, file);
    if (upErr) {
      setUnggah(null);
      toast.gagal(`Gagal mengunggah: ${upErr.message}`);
      return;
    }
    const { error } = await supabase
      .from("customer_documents")
      .insert({ customer_id: customerId, doc_type: baris.doc_type, file_url: path, status: "menunggu" });
    setUnggah(null);
    if (error) {
      toast.gagal(`Gagal menyimpan dokumen: ${error.message}`);
      return;
    }
    toast.sukses(`${baris.doc_type} terunggah dan menunggu verifikasi.`);
    muat();
    onChange?.();
  }

  async function ubahStatus(id, status) {
    const { error } = await supabase.from("customer_documents").update({ status }).eq("id", id);
    if (error) {
      toast.gagal(`Status dokumen gagal diubah: ${error.message}`);
      return;
    }
    muat();
    onChange?.();
  }

  async function hapus(id) {
    const { error } = await supabase.from("customer_documents").delete().eq("id", id);
    if (error) {
      toast.gagal(`Gagal menghapus: ${error.message}`);
      return;
    }
    muat();
    onChange?.();
  }

  async function buka(path) {
    const url = await getSignedUrl("customer-documents", path);
    if (url) window.open(url, "_blank", "noopener");
    else toast.gagal("Tautan dokumen tidak dapat dibuka.");
  }

  if (rekap.baris.length === 0) {
    return (
      <div style={{ fontSize: 12, color: TEXT_MID, lineHeight: 1.5 }}>
        Belum ada syarat berkas tersimpan. Aturlah di Pengaturan Bisnis, atau jalankan{" "}
        <code style={{ fontSize: 11 }}>migration_015_pemberkasan.sql</code>.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 11 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT_DARK, display: "inline-flex", alignItems: "center", gap: 7 }}>
          <Landmark size={14} color={PRIMARY} aria-hidden="true" />
          Dokumen yang perlu diunggah
          <span style={{ fontWeight: 500, color: TEXT_MID }}>
            · {rekap.lengkapWajib}/{rekap.totalWajib} wajib terverifikasi
          </span>
        </div>
        <div style={{ fontSize: 11, color: TEXT_MID }}>
          {bank ? (
            pakaiBawaan ? (
              <>
                <b style={{ color: TEXT_DARK }}>{bank}</b> — syarat bawaan
              </>
            ) : (
              <>
                Syarat khusus <b style={{ color: TEXT_DARK }}>{bank}</b>
              </>
            )
          ) : (
            "Bank belum dipilih — menampilkan syarat bawaan"
          )}
        </div>
      </div>

      {/* BRIEF: "berikan Notifikasi jika belum mengupload berkas yang kurang". */}
      {belum.length > 0 && (
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
            marginBottom: 12,
            fontSize: 12.5,
            color: ACCENT_DARK,
            lineHeight: 1.55,
          }}
        >
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
          <span>
            Sudah {sudah.length} dokumen, masih kurang <b>{belum.length}</b> yang wajib:{" "}
            {belum.map((b) => `${b.nomor}. ${b.doc_type}`).join(" · ")}
          </span>
        </div>
      )}

      {belum.length === 0 && !memuat && (
        <div
          style={{
            display: "flex",
            gap: 9,
            alignItems: "center",
            background: "#E4F2E8",
            border: "1px solid #C6E3D0",
            borderRadius: 12,
            padding: "10px 13px",
            marginBottom: 12,
            fontSize: 12.5,
            color: "#166534",
          }}
        >
          <Check size={15} aria-hidden="true" />
          <span>
            Seluruh {rekap.totalWajib} dokumen wajib sudah diunggah — berkas siap diproses ke bank.
            {opsionalKosong.length > 0 && ` ${opsionalKosong.length} dokumen opsional belum ada.`}
          </span>
        </div>
      )}

      {/* Yang kurang, lebih dulu. */}
      {belum.length > 0 && (
        <Bagian judul={`Belum diunggah (${belum.length})`} sorot>
          {belum.map((b) => (
            <BarisBerkas
              key={b.doc_type}
              baris={b}
              editable={editable}
              unggah={unggah === b.doc_type}
              onUnggah={(f) => kirim(b, f)}
              onBuka={buka}
              onStatus={ubahStatus}
              onHapus={bolehHapus ? hapus : null}
            />
          ))}
        </Bagian>
      )}

      {opsionalKosong.length > 0 && (
        <Bagian judul={`Opsional, belum diunggah (${opsionalKosong.length})`}>
          {opsionalKosong.map((b) => (
            <BarisBerkas
              key={b.doc_type}
              baris={b}
              editable={editable}
              unggah={unggah === b.doc_type}
              onUnggah={(f) => kirim(b, f)}
              onBuka={buka}
              onStatus={ubahStatus}
              onHapus={bolehHapus ? hapus : null}
            />
          ))}
        </Bagian>
      )}

      {sudah.length > 0 && (
        <Bagian judul={`Sudah diunggah (${sudah.length})`}>
          {sudah.map((b) => (
            <BarisBerkas
              key={b.doc_type}
              baris={b}
              editable={editable}
              unggah={unggah === b.doc_type}
              onUnggah={(f) => kirim(b, f)}
              onBuka={buka}
              onStatus={ubahStatus}
              onHapus={bolehHapus ? hapus : null}
            />
          ))}
        </Bagian>
      )}

      {rekap.ekstra.length > 0 && (
        <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 10, lineHeight: 1.5 }}>
          Di luar daftar syarat: {rekap.ekstra.map((d) => d.doc_type).join(", ")}.
        </div>
      )}
    </div>
  );
}

function Bagian({ judul, sorot, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.03em",
          color: sorot ? ACCENT_DARK : TEXT_MID,
          marginBottom: 7,
          textTransform: "uppercase",
        }}
      >
        {judul}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

function BarisBerkas({ baris, editable, unggah, onUnggah, onBuka, onStatus, onHapus }) {
  const ditolak = baris.keadaan === "ditolak";
  const belum = baris.keadaan === "belum";
  const warna =
    baris.keadaan === "terverifikasi" ? POSITIVE : ditolak ? NEGATIVE : belum ? TEXT_MID : ACCENT_DARK;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        border: `1px ${belum ? "dashed" : "solid"} ${ditolak ? "#F2D3D1" : BORDER}`,
        borderRadius: 11,
        padding: "9px 12px",
        background: ditolak ? "#FBE9E8" : belum ? "#FBFCFE" : SURFACE,
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          background: belum ? "#fff" : PRIMARY_SOFT,
          color: belum ? TEXT_MID : PRIMARY,
          border: belum ? `1.5px solid ${BORDER}` : "none",
        }}
      >
        {baris.nomor}
      </span>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: TEXT_DARK, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          {baris.doc_type}
          {!baris.wajib && (
            <span style={{ fontSize: 10, fontWeight: 600, color: TEXT_MID, background: "#F7F9FC", padding: "1px 7px", borderRadius: 999 }}>
              opsional
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: warna, marginTop: 2 }}>
          {belum
            ? baris.catatan || "Belum diunggah"
            : `${baris.keadaan}${baris.doc?.uploaded_at ? ` · ${tanggalWaktu(baris.doc.uploaded_at)}` : ""}`}
        </div>
      </div>

      {baris.doc?.file_url && (
        <button onClick={() => onBuka(baris.doc.file_url)} style={gayaKecil} title="Buka berkas">
          <FileText size={11} style={{ marginRight: 4, verticalAlign: -2 }} aria-hidden="true" />
          Lihat
        </button>
      )}

      {baris.doc && editable && (
        <select
          value={baris.doc.status}
          onChange={(e) => onStatus(baris.doc.id, e.target.value)}
          aria-label={`Status dokumen ${baris.doc_type}`}
          style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: "4px 8px", fontSize: 11.5 }}
        >
          {STATUS_DOK.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}

      {editable && (
        <label
          style={{
            ...gayaKecil,
            border: `1px solid ${belum ? ACCENT : BORDER}`,
            color: belum ? "#fff" : TEXT_DARK,
            background: belum ? ACCENT : "#fff",
            cursor: unggah ? "default" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Upload size={11} aria-hidden="true" />
          {unggah ? "…" : belum ? "Unggah" : "Ganti"}
          <input
            type="file"
            disabled={unggah}
            onChange={(e) => {
              onUnggah(e.target.files?.[0]);
              e.target.value = "";
            }}
            style={{ display: "none" }}
          />
        </label>
      )}

      {baris.doc && onHapus && editable && (
        <button
          onClick={() => onHapus(baris.doc.id)}
          aria-label={`Hapus ${baris.doc_type}`}
          style={{ ...gayaKecil, color: NEGATIVE, borderColor: "#F2D3D1" }}
        >
          Hapus
        </button>
      )}
    </div>
  );
}

const gayaKecil = {
  border: `1px solid ${BORDER}`,
  background: "#fff",
  color: TEXT_DARK,
  borderRadius: 9,
  padding: "4px 10px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};
