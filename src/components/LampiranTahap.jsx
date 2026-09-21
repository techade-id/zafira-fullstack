import React, { useCallback, useEffect, useState } from "react";
import { Paperclip, FileText, Image as ImageIcon, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { uploadFile, getSignedUrl } from "../lib/storage";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { canWrite } from "../lib/permissions";
import { tanggal } from "../lib/format";
import { BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, NEGATIVE } from "./ui";

/**
 * Lampiran sebuah tahap berkas.
 *
 * BRIEF §Konsumen meminta lampiran di hampir setiap tahap: kwitansi dan bukti
 * transfer pada Booking, bukti transfer pada DP, hasil BI-Checking, foto
 * survei, SP3K terbit dan perpanjangan, dokumentasi akad, berita acara serah
 * terima, bukti BPHTB, sertifikat. Sebelas tempat, satu kebutuhan yang persis
 * sama — jadi satu komponen, bukan sebelas potong kode yang lambat laun akan
 * berbeda satu sama lain.
 *
 * Sebuah tahap boleh punya lebih dari satu berkas. Foto survei jarang hanya
 * satu, dan sebuah kolom URL tunggal akan membuat foto kedua menimpa yang
 * pertama tanpa jejak.
 */
export default function LampiranTahap({
  slot,
  customerId,
  leadId,
  label = "Lampiran",
  hint,
  editable = true,
  wajib = false,
  onChange,
}) {
  const toast = useToast();
  const { profile } = useAuth();
  // Kebijakan berkas_lampiran_delete berbunyi is_admin() or can_write_berkas().
  // Menampilkan tombol hapus kepada Sales berarti menawarkan tindakan yang
  // akan mengenai nol baris tanpa melempar galat — lampirannya tetap ada, dan
  // layar seolah mengatakan sebaliknya.
  const bolehHapus = canWrite(profile, "document_delete");
  const [rows, setRows] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [unggah, setUnggah] = useState(false);

  const muat = useCallback(async () => {
    if (!customerId && !leadId) return;
    setMemuat(true);
    let q = supabase.from("berkas_lampiran").select("*").eq("slot", slot).order("uploaded_at", { ascending: false });
    q = customerId ? q.eq("customer_id", customerId) : q.eq("lead_id", leadId);
    const { data, error } = await q;
    setMemuat(false);
    // Sebelum migrasi 017 tabelnya belum ada. Itu bukan keadaan darurat: tahap
    // tetap bisa diisi, hanya lampirannya yang belum punya tempat.
    setRows(error ? [] : data || []);
  }, [slot, customerId, leadId]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function kirim(file) {
    if (!file) return;
    setUnggah(true);
    const folder = customerId || leadId;
    const { path, error: upErr } = await uploadFile("berkas-lampiran", `${folder}/${slot}`, file);
    if (upErr) {
      setUnggah(false);
      toast.gagal(`Gagal mengunggah: ${upErr.message}`);
      return;
    }
    const { error } = await supabase.from("berkas_lampiran").insert({
      slot,
      customer_id: customerId || null,
      lead_id: leadId || null,
      file_url: path,
      file_name: file.name,
    });
    setUnggah(false);
    if (error) {
      toast.gagal(`Gagal menyimpan lampiran: ${error.message}`);
      return;
    }
    toast.sukses(`${label} terunggah.`);
    muat();
    onChange?.();
  }

  async function buka(path) {
    const url = await getSignedUrl("berkas-lampiran", path);
    if (url) window.open(url, "_blank", "noopener");
    else toast.gagal("Tautan lampiran tidak dapat dibuka.");
  }

  async function hapus(row) {
    const { error } = await supabase.from("berkas_lampiran").delete().eq("id", row.id);
    if (error) {
      toast.gagal(`Gagal menghapus: ${error.message}`);
      return;
    }
    muat();
    onChange?.();
  }

  const kosong = !memuat && rows.length === 0;

  return (
    <div
      style={{
        border: `1px ${kosong && wajib ? "dashed" : "solid"} ${kosong && wajib ? "#C7D3EA" : BORDER}`,
        borderRadius: 12,
        padding: "11px 13px",
        background: kosong && wajib ? "#FBFCFE" : SURFACE,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: rows.length ? 9 : 0 }}>
        <Paperclip size={13} color={TEXT_MID} aria-hidden="true" />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: TEXT_MID }}>
          {label}
          {wajib && <span style={{ color: NEGATIVE }} aria-hidden="true"> *</span>}
        </span>
        <span style={{ fontSize: 11, color: TEXT_MID }}>
          {memuat ? "memuat…" : rows.length > 0 ? `${rows.length} berkas` : "belum ada"}
        </span>

        {editable && (
          <label
            style={{
              marginLeft: "auto",
              border: `1px solid ${BORDER}`,
              background: "#fff",
              color: TEXT_DARK,
              borderRadius: 9,
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: unggah ? "default" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {unggah ? "Mengunggah…" : "+ Unggah"}
            <input
              type="file"
              accept="image/*,application/pdf"
              disabled={unggah}
              onChange={(e) => {
                kirim(e.target.files?.[0]);
                // Memilih berkas yang sama dua kali berturut-turut tidak
                // memicu onChange kalau nilainya tidak dikosongkan dulu.
                e.target.value = "";
              }}
              style={{ display: "none" }}
            />
          </label>
        )}
      </div>

      {hint && rows.length === 0 && (
        <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 6, lineHeight: 1.45 }}>{hint}</div>
      )}

      {rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {rows.map((r) => {
            const gambar = /\.(png|jpe?g|webp|gif|heic)$/i.test(r.file_name || r.file_url || "");
            const Ikon = gambar ? ImageIcon : FileText;
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 7,
                    background: PRIMARY_SOFT,
                    color: PRIMARY,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Ikon size={11} aria-hidden="true" />
                </span>
                <button
                  onClick={() => buka(r.file_url)}
                  title={r.file_name || "Buka lampiran"}
                  style={{
                    border: "none",
                    background: "none",
                    padding: 0,
                    color: TEXT_DARK,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  {r.file_name || "Lampiran"}
                </button>
                <span style={{ fontSize: 10.5, color: TEXT_MID, whiteSpace: "nowrap" }}>{tanggal(r.uploaded_at)}</span>
                {editable && bolehHapus && (
                  <button
                    onClick={() => hapus(r)}
                    aria-label={`Hapus ${r.file_name || "lampiran"}`}
                    style={{ border: "none", background: "none", color: TEXT_MID, cursor: "pointer", padding: 2, lineHeight: 0 }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
