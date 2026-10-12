import React, { useEffect, useState } from "react";
import { ShieldCheck, AlertTriangle, Clock } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { canWrite } from "../lib/permissions";
import { hariIni } from "../lib/format";
import { kabarkanRiwayat } from "./FollowUpTimeline";
import LampiranTahap from "./LampiranTahap";
import { Modal, PrimaryButton, BORDER, SURFACE, TEXT_MID, TEXT_DARK, NEGATIVE, POSITIVE, ACCENT_DARK, ACCENT_SOFT, inputStyle } from "./ui";

/**
 * BI Checking (SLIK) — langkah terakhir sebelum booking.
 *
 * Berdiri sendiri, terpisah dari survei: yang dibawa ke bank adalah KTP calon
 * pembeli, dan yang kembali adalah hasil SLIK — Lolos atau Tidak Lolos —
 * beserta keterangannya. Prospek yang tidak lolos tidak bisa dikonversi ke
 * booking (convert_lead_to_customer), supaya uang booking tidak telanjur
 * diterima dari pembeli yang pasti ditolak bank.
 *
 * KTP dan hasil BI diunggah langsung ke lampiran prospek, lalu ikut pindah ke
 * berkas konsumen saat booking. Hasilnya disimpan catat_bi_checking(), yang
 * juga menambah satu baris riwayat — perubahan hasil BI terlihat di Chat
 * Follow Up, bukan menimpa diam-diam.
 */

const PILIHAN = [
  { nilai: "lolos", label: "Lolos", ikon: ShieldCheck, warna: POSITIVE, latar: "#E4F2E8" },
  { nilai: "tidak_lolos", label: "Tidak Lolos", ikon: AlertTriangle, warna: NEGATIVE, latar: "#FBE9E8" },
  { nilai: "menunggu", label: "Menunggu hasil", ikon: Clock, warna: ACCENT_DARK, latar: ACCENT_SOFT },
];

export default function BiCheckingModal({ lead, open, onClose, onSelesai }) {
  const toast = useToast();
  const { profile } = useAuth();
  // berkas_lampiran_insert untuk lampiran prospek berbunyi owns_lead():
  // peran yang hanya memantau tidak ditawari tombol unggah yang pasti ditolak.
  const bolehUnggah = canWrite(profile, "lead");

  const [status, setStatus] = useState("");
  const [tgl, setTgl] = useState(hariIni());
  const [keterangan, setKeterangan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!open || !lead) return;
    setStatus(lead.bi_checking_status || "");
    setTgl(lead.bi_checking_tanggal || hariIni());
    setKeterangan(lead.bi_checking_catatan || "");
    setGalat("");
    setKirim(false);
  }, [open, lead]);

  async function simpan() {
    if (!status) {
      setGalat("Pilih hasil BI Checking: Lolos, Tidak Lolos, atau Menunggu hasil.");
      return;
    }
    if (!tgl) {
      setGalat("Isi tanggal pemeriksaan.");
      return;
    }
    if (tgl > hariIni()) {
      setGalat("Tanggal pemeriksaan tidak boleh melewati hari ini.");
      return;
    }
    if (status !== "menunggu" && !keterangan.trim()) {
      setGalat("Tulis keterangan hasil BI Checking — mis. kolektibilitas, nama bank, alasan tidak lolos.");
      return;
    }

    setKirim(true);
    setGalat("");
    const { error } = await supabase.rpc("catat_bi_checking", {
      p_lead_id: lead.id,
      p_status: status,
      p_tanggal: tgl,
      p_catatan: keterangan.trim() || null,
    });
    setKirim(false);
    if (error) {
      setGalat(error.message);
      return;
    }

    kabarkanRiwayat({ leadId: lead.id });
    toast.sukses(
      status === "lolos"
        ? `${lead.name} lolos BI Checking — siap dikonversi ke Booking.`
        : status === "tidak_lolos"
        ? `${lead.name} ditandai tidak lolos BI Checking.`
        : `BI Checking ${lead.name} dicatat, menunggu hasil.`
    );
    onSelesai?.();
    onClose?.();
  }

  if (!lead) return null;

  return (
    <Modal open={open} labelledBy="bi-judul" onClose={() => !kirim && onClose?.()} width={520}>
      <>
        <div id="bi-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          BI Checking — {lead.name}
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 16, lineHeight: 1.5 }}>
          Pemeriksaan SLIK di bank, dikerjakan <b style={{ color: TEXT_DARK }}>sebelum</b> booking. KTP dan hasilnya ikut ke
          berkas KPR begitu prospek ini dikonversi.
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={labelGaya}>Hasil BI Checking</span>
          <div role="radiogroup" aria-label="Hasil BI Checking" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PILIHAN.map((p) => {
              const aktif = status === p.nilai;
              return (
                <button
                  key={p.nilai}
                  type="button"
                  role="radio"
                  aria-checked={aktif}
                  onClick={() => setStatus(p.nilai)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: `1px solid ${aktif ? p.warna : BORDER}`,
                    background: aktif ? p.latar : SURFACE,
                    color: aktif ? p.warna : TEXT_MID,
                    fontSize: 12.5,
                    fontWeight: aktif ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  <p.ikon size={13} aria-hidden="true" />
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rg-2" style={{ marginBottom: 14 }}>
          <div>
            <label htmlFor="bi-tgl" style={labelGaya}>
              Tanggal Pemeriksaan
            </label>
            <input id="bi-tgl" type="date" value={tgl} max={hariIni()} onChange={(e) => setTgl(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label htmlFor="bi-ket" style={labelGaya}>
            Keterangan Hasil BI Checking
          </label>
          <textarea
            id="bi-ket"
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            placeholder="mis. Kolektibilitas 1 di BTN · atau: ada tunggakan kartu kredit, kol 3"
            style={{ ...inputStyle, minHeight: 64, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
          <LampiranTahap slot="ktp" leadId={lead.id} label="KTP" hint="Foto KTP calon pembeli yang dibawa ke bank." editable={bolehUnggah} />
          <LampiranTahap slot="bi_checking" leadId={lead.id} label="Hasil BI Checking" hint="Hasil pemeriksaan SLIK dari bank." editable={bolehUnggah} />
        </div>

        {status === "tidak_lolos" && (
          <div role="alert" style={{ ...kotakPesan, background: "#FBE9E8", borderColor: "#F2D3D1", color: NEGATIVE }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <span>Konversi ke Booking akan ditolak selama hasilnya tidak lolos. Selesaikan dulu masalahnya, atau batalkan prospek beserta alasannya.</span>
          </div>
        )}
        {status === "lolos" && (
          <div style={{ ...kotakPesan, background: "#E4F2E8", borderColor: "#C6E3D0", color: POSITIVE }}>
            <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <span>Lolos BI Checking — prospek ini siap dikonversi ke Booking.</span>
          </div>
        )}

        {galat && (
          <div role="alert" style={{ fontSize: 12.5, color: NEGATIVE, marginBottom: 14, lineHeight: 1.5 }}>
            {galat}
          </div>
        )}

        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={kirim} style={gayaSekunder}>
            Tutup
          </button>
          <PrimaryButton subject="lead" onClick={simpan} disabled={kirim}>
            {kirim ? "Menyimpan…" : "Simpan BI Checking"}
          </PrimaryButton>
        </div>
      </>
    </Modal>
  );
}

const labelGaya = { display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 };

const kotakPesan = {
  display: "flex",
  gap: 9,
  alignItems: "flex-start",
  border: "1px solid",
  borderRadius: 12,
  padding: "10px 13px",
  marginBottom: 16,
  fontSize: 12.5,
  lineHeight: 1.5,
};

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
