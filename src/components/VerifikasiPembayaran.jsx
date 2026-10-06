import React, { useCallback, useEffect, useState } from "react";
import { Wallet, Upload, Check, Clock, Send } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { unggahBuktiTransfer, unggahKuitansi, dengarBerkas } from "../lib/berkas";
import { usePratinjau } from "./PratinjauBerkas";
import ModalPembayaran from "./ModalPembayaran";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canWrite } from "../lib/permissions";
import { segarkanNotifikasi } from "../lib/useNotifications";
import { rupiah, tanggal, labelJenisBayar } from "../lib/format";
import { BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, POSITIVE, ACCENT, ACCENT_SOFT, ACCENT_DARK, NEGATIVE } from "./ui";

/**
 * Pembayaran sebuah tahap, beserta jalur verifikasinya.
 *
 * BRIEF §Leads dan §DP meminta satu hal yang sama dari dua arah: setiap
 * pembayaran — booking sekalipun — harus melewati fase menunggu verifikasi
 * Finance, dan bukti transfer dari konsumen harus punya tempat untuk diunggah.
 *
 * Sebelumnya hanya kuitansi resmi yang bisa diunggah, dan itu wewenang
 * Finance. Akibatnya bukti transfer dari konsumen hidup di WhatsApp, dan
 * Finance memverifikasi sesuatu yang tidak bisa dilihatnya di layar yang sama.
 *
 * Dua berkas, dua pemilik, dan urutannya tidak bisa dibalik:
 *
 *   bukti transfer  → Admin Marketing/Sales. Memindahkan pembayaran ke
 *                     "menunggu verifikasi" — sebuah permintaan, bukan
 *                     keputusan.
 *   kuitansi resmi  → Finance. Menutup pembayaran, dan untuk Booking Fee
 *                     memicu Handover Hard-Lock.
 */
export default function VerifikasiPembayaran({ customerId, jenis, editable = true, onChange }) {
  const { profile } = useAuth();
  const toast = useToast();
  const bolehVerifikasi = canWrite(profile, "payment_verify");
  const bolehCatat = canWrite(profile, "payment");
  const [catat, setCatat] = useState(false);

  const [rows, setRows] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [sibuk, setSibuk] = useState(null);
  const [bukaPratinjau, pratinjau] = usePratinjau();

  const muat = useCallback(async () => {
    if (!customerId) return;
    setMemuat(true);
    const { data } = await supabase
      .from("payments")
      .select("*")
      .eq("customer_id", customerId)
      .eq("payment_type", jenis)
      .order("payment_date", { ascending: false });
    setRows(data || []);
    setMemuat(false);
  }, [customerId, jenis]);

  useEffect(() => {
    muat();
  }, [muat]);

  // Bukti dan kuitansi bisa juga diunggah dari Dokumen Konsumen di Ringkasan.
  useEffect(() => dengarBerkas(customerId, muat), [customerId, muat]);

  /** Unggah bukti transfer dan dengan itu meminta verifikasi Finance. */
  async function kirimBukti(row, file) {
    if (!file) return;
    setSibuk(row.id);
    const { error } = await unggahBuktiTransfer(row, file);
    setSibuk(null);
    if (error) {
      toast.gagal(error);
      return;
    }
    toast.sukses("Bukti transfer terkirim — menunggu verifikasi pembayaran dari Finance.");
    segarkanNotifikasi();
    onChange?.();
  }

  /** Verifikasi = melampirkan kuitansi resmi. Tidak ada jalan lain. */
  async function verifikasi(row, file) {
    if (!file) return;
    setSibuk(row.id);
    const { error } = await unggahKuitansi(row, file);
    setSibuk(null);
    if (error) {
      toast.gagal(error);
      return;
    }
    toast.sukses("Pembayaran terverifikasi dan kuitansi tersimpan.");
    segarkanNotifikasi();
    onChange?.();
  }

  function buka(bucket, path) {
    const daftar = rows.flatMap((r) => [
      r.bukti_transfer_url && { bucket: "payment-proofs", path: r.bukti_transfer_url, judul: `Bukti transfer ${labelJenisBayar(r.payment_type)}`, keterangan: `${rupiah(r.amount)} · ${tanggal(r.payment_date)}` },
      r.proof_url && { bucket: "payment-receipts", path: r.proof_url, judul: `Kuitansi ${labelJenisBayar(r.payment_type)}`, keterangan: `${rupiah(r.amount)} · ${tanggal(r.payment_date)}` },
    ].filter(Boolean));
    bukaPratinjau(daftar, Math.max(0, daftar.findIndex((x) => x.bucket === bucket && x.path === path)));
  }

  if (memuat) {
    return <div style={{ fontSize: 12, color: TEXT_MID }}>Memuat pembayaran…</div>;
  }

  // Dicatat dari sini, bukan lagi "catat di modul Pembayaran": keluar dari
  // tahap ini untuk memilih nama konsumen yang sama dari daftar seluruh
  // konsumen adalah tempat salah catat paling mudah terjadi.
  const tombolCatat = bolehCatat && (
    <button onClick={() => setCatat(true)} style={{ ...gayaKecil, color: PRIMARY, borderStyle: "dashed", borderColor: "#C7D3EA", background: "#FBFCFE" }}>
      + Catat {labelJenisBayar(jenis)}
      {rows.length > 0 ? " lagi" : ""}
    </button>
  );
  const modal = (
    <ModalPembayaran open={catat} konsumen={{ id: customerId }} jenisAwal={jenis} onClose={() => setCatat(false)} />
  );

  if (rows.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap", fontSize: 12, color: TEXT_MID, lineHeight: 1.5, border: `1px dashed ${BORDER}`, borderRadius: 12, padding: "11px 13px" }}>
        <span>Belum ada {labelJenisBayar(jenis)} yang dicatat.</span>
        {tombolCatat}
        {modal}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {rows.map((row) => {
        const tervalidasi = row.status === "terverifikasi";
        const menunggu = row.status === "menunggu_verifikasi";
        return (
          <div key={row.id} style={{ border: `1px solid ${menunggu ? "#F6CDB8" : BORDER}`, borderRadius: 12, padding: "11px 13px", background: menunggu ? ACCENT_SOFT : SURFACE }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 9 }}>
              <Wallet size={14} color={tervalidasi ? POSITIVE : menunggu ? ACCENT_DARK : TEXT_MID} aria-hidden="true" />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: TEXT_DARK }}>{rupiah(row.amount)}</span>
              <span style={{ fontSize: 11.5, color: TEXT_MID }}>{tanggal(row.payment_date)}</span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  fontWeight: 700,
                  color: tervalidasi ? POSITIVE : menunggu ? ACCENT_DARK : TEXT_MID,
                }}
              >
                {tervalidasi ? <Check size={12} /> : <Clock size={12} />}
                {tervalidasi ? "Terverifikasi" : menunggu ? "Menunggu verifikasi Finance" : "Bukti transfer belum ada"}
              </span>
            </div>

            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
              {/* Bukti transfer — dari konsumen, lewat Admin Marketing. */}
              {row.bukti_transfer_url ? (
                <button onClick={() => buka("payment-proofs", row.bukti_transfer_url)} style={gayaKecil}>
                  Lihat bukti transfer
                </button>
              ) : (
                <span style={{ fontSize: 11.5, color: TEXT_MID }}>Bukti transfer belum diunggah</span>
              )}

              {editable && !tervalidasi && (
                <label style={{ ...gayaKecil, cursor: sibuk === row.id ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Upload size={11} aria-hidden="true" />
                  {sibuk === row.id ? "Mengunggah…" : row.bukti_transfer_url ? "Ganti bukti" : "Unggah bukti transfer"}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    disabled={sibuk === row.id}
                    onChange={(e) => {
                      kirimBukti(row, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                    style={{ display: "none" }}
                  />
                </label>
              )}

              {/* Kuitansi resmi — hanya Finance. */}
              {row.proof_url && (
                <button onClick={() => buka("payment-receipts", row.proof_url)} style={gayaKecil}>
                  Lihat kuitansi resmi
                </button>
              )}

              {bolehVerifikasi && !tervalidasi && (
                <label
                  style={{
                    ...gayaKecil,
                    border: `1px solid ${ACCENT}`,
                    color: "#fff",
                    background: ACCENT,
                    cursor: sibuk === row.id ? "default" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                  title="Unggah kuitansi resmi untuk memverifikasi pembayaran ini"
                >
                  <Check size={11} aria-hidden="true" />
                  Verifikasi + Kuitansi
                  <input
                    type="file"
                    disabled={sibuk === row.id}
                    onChange={(e) => {
                      verifikasi(row, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                    style={{ display: "none" }}
                  />
                </label>
              )}
            </div>

            {menunggu && !bolehVerifikasi && (
              <div style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 11.5, color: ACCENT_DARK, marginTop: 9, lineHeight: 1.5 }}>
                <Send size={12} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                <span>
                  Instruksi verifikasi sudah terkirim. Statusnya menunggu verifikasi pembayaran dari Finance —
                  tidak ada lagi yang perlu dikerjakan dari sisi ini.
                </span>
              </div>
            )}

            {tervalidasi && !row.proof_url && (
              <div style={{ fontSize: 11.5, color: NEGATIVE, marginTop: 8, lineHeight: 1.5 }}>
                Tervalidasi tanpa kuitansi — baris lama dari sebelum aturan kuitansi berlaku. Perlu dirapikan Finance.
              </div>
            )}
          </div>
        );
      })}
      {/* DP sering dicicil: pembayaran berikutnya dicatat dari tempat yang sama. */}
      {tombolCatat && <div>{tombolCatat}</div>}
      {modal}
      {pratinjau}
    </div>
  );
}

const gayaKecil = {
  border: `1px solid ${BORDER}`,
  background: "#fff",
  color: TEXT_DARK,
  borderRadius: 9,
  padding: "5px 11px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
