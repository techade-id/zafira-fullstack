import { supabase } from "./supabaseClient";
import { uploadFile } from "./storage";

/**
 * Operasi berkas konsumen, dipakai bersama oleh tahap KPR (BerkasBankPanel,
 * LampiranTahap, VerifikasiPembayaran) dan bagian Dokumen Konsumen di
 * Ringkasan.
 *
 * Berkas yang sama kini bisa diunggah dari dua tempat. Aturannya — bucket,
 * status awal, dan terutama perpindahan status pembayaran yang dijaga trigger
 * guard_payment_verification — hanya boleh ditulis sekali, di sini. Dua
 * salinan aturan yang sama lambat laun akan berbeda.
 *
 * Setiap operasi yang berhasil mengirim event `berkas-berubah`, sehingga
 * daftar di tempat lain ikut segar tanpa memuat ulang halaman.
 */

export const EVENT_BERKAS = "berkas-berubah";

/** Untuk operasi di luar modul ini (ubah status, hapus) yang juga mengubah daftar berkas. */
export function kabarkanBerkas(customerId) {
  kabarkan(customerId);
}

function kabarkan(customerId) {
  window.dispatchEvent(new CustomEvent(EVENT_BERKAS, { detail: { customerId } }));
}

/** Panggil `muat` setiap kali berkas konsumen ini berubah dari tempat lain. */
export function dengarBerkas(customerId, muat) {
  function segarkan(e) {
    if (!customerId || e.detail?.customerId === customerId) muat();
  }
  window.addEventListener(EVENT_BERKAS, segarkan);
  return () => window.removeEventListener(EVENT_BERKAS, segarkan);
}

/** Dokumen syarat bank (KTP, KK, slip gaji, …). Masuk sebagai 'menunggu' verifikasi. */
// uploadFile() tanpa berkas mengembalikan path kosong TANPA galat — tanpa
// penjaga ini, dialog pilih berkas yang dibatalkan akan menyimpan baris
// dokumen yang tidak punya berkas.
const TANPA_BERKAS = { error: "Tidak ada berkas yang dipilih." };

export async function unggahBerkasBank(customerId, docType, file) {
  if (!file) return TANPA_BERKAS;
  const { path, error: upErr } = await uploadFile("customer-documents", customerId, file);
  if (upErr) return { error: `Gagal mengunggah: ${upErr.message}` };
  const { error } = await supabase
    .from("customer_documents")
    .insert({ customer_id: customerId, doc_type: docType, file_url: path, status: "menunggu" });
  if (error) return { error: `Gagal menyimpan dokumen: ${error.message}` };
  kabarkan(customerId);
  return { error: null };
}

/** Lampiran sebuah tahap (foto survei, SP3K, berita acara, …). */
export async function unggahLampiran({ customerId = null, leadId = null, slot, file }) {
  if (!file) return TANPA_BERKAS;
  const { path, error: upErr } = await uploadFile("berkas-lampiran", `${customerId || leadId}/${slot}`, file);
  if (upErr) return { error: `Gagal mengunggah: ${upErr.message}` };
  const { error } = await supabase.from("berkas_lampiran").insert({
    slot,
    customer_id: customerId,
    lead_id: leadId,
    file_url: path,
    file_name: file.name,
  });
  if (error) return { error: `Gagal menyimpan lampiran: ${error.message}` };
  kabarkan(customerId);
  return { error: null };
}

/** Bukti transfer dari konsumen — memindahkan pembayaran ke 'menunggu_verifikasi'. */
export async function unggahBuktiTransfer(pembayaran, file) {
  if (!file) return TANPA_BERKAS;
  const { path, error: upErr } = await uploadFile("payment-proofs", pembayaran.customer_id, file);
  if (upErr) return { error: `Gagal mengunggah bukti: ${upErr.message}` };
  // Status dan bukti dikirim bersama: trigger guard_payment_verification
  // hanya mengizinkan perpindahan ke 'menunggu_verifikasi' bila buktinya ikut
  // dalam baris yang sama.
  const { error } = await supabase
    .from("payments")
    .update({
      bukti_transfer_url: path,
      status: pembayaran.status === "terverifikasi" ? pembayaran.status : "menunggu_verifikasi",
    })
    .eq("id", pembayaran.id);
  if (error) return { error: `Gagal menyimpan bukti: ${error.message}` };
  kabarkan(pembayaran.customer_id);
  return { error: null };
}

/** Verifikasi = melampirkan kuitansi resmi. Tidak ada jalan lain — dan hanya Finance. */
export async function unggahKuitansi(pembayaran, file) {
  if (!file) return TANPA_BERKAS;
  const { path, error: upErr } = await uploadFile("payment-receipts", pembayaran.customer_id, file);
  if (upErr) return { error: `Gagal mengunggah kuitansi: ${upErr.message}` };
  const { error } = await supabase
    .from("payments")
    .update({ status: "terverifikasi", proof_url: path })
    .eq("id", pembayaran.id);
  if (error) return { error: `Gagal memverifikasi: ${error.message}` };
  kabarkan(pembayaran.customer_id);
  return { error: null };
}

/**
 * Mencatat pembayaran, sekalian dengan bukti transfernya bila ada.
 *
 * Tanpa bukti → 'menunggu'. Dengan bukti → 'menunggu_verifikasi', langsung di
 * antrean Finance. Untuk selain Finance trigger guard_payment_verification
 * menegakkan hal yang sama di server; status dikirim eksplisit supaya baris
 * yang dicatat Finance sendiri pun tidak berstatus 'menunggu' padahal
 * buktinya sudah ada.
 */
export async function catatPembayaran({ customer_id, payment_type, amount, payment_date, notes, file }) {
  let bukti = null;
  if (file) {
    const { path, error: upErr } = await uploadFile("payment-proofs", customer_id, file);
    if (upErr) return { error: `Gagal mengunggah bukti: ${upErr.message}` };
    bukti = path;
  }
  const { data, error } = await supabase
    .from("payments")
    .insert({
      customer_id,
      payment_type,
      amount,
      payment_date,
      notes: notes || null,
      bukti_transfer_url: bukti,
      status: bukti ? "menunggu_verifikasi" : "menunggu",
    })
    .select("id")
    .maybeSingle();
  if (error) return { error: `Gagal menyimpan pembayaran: ${error.message}` };
  kabarkan(customer_id);
  return { error: null, id: data?.id || null };
}

/** Koreksi jenis, nominal, tanggal, atau catatan. Status tidak pernah disentuh dari sini. */
export async function ubahPembayaran(pembayaran, patch) {
  const { data, error } = await supabase.from("payments").update(patch).eq("id", pembayaran.id).select("id");
  if (error) return { error: `Gagal menyimpan: ${error.message}` };
  // RLS yang menolak tidak melempar galat — pembaruannya mengenai nol baris.
  if (!data?.length) return { error: "Perubahan tidak tersimpan — Anda tidak punya akses untuk mengubah pembayaran ini." };
  kabarkan(pembayaran.customer_id);
  return { error: null };
}

export async function hapusPembayaran(pembayaran) {
  const { error } = await supabase.from("payments").delete().eq("id", pembayaran.id);
  if (error) return { error };
  kabarkan(pembayaran.customer_id);
  return { error: null };
}

/** "gambar" | "pdf" | "lain", dari nama berkas atau path-nya. */
export function jenisBerkas(nama) {
  const n = String(nama || "").toLowerCase();
  if (/\.(png|jpe?g|webp|gif|bmp|heic|heif)(\?|$)/.test(n)) return "gambar";
  if (/\.pdf(\?|$)/.test(n)) return "pdf";
  return "lain";
}
