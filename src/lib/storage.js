import { supabase } from "./supabaseClient";

/** Sama dengan file_size_limit setiap bucket di supabase/storage.sql. */
export const BATAS_BERKAS_MB = 10;

/**
 * Satu-satunya jalan mengunggah berkas di aplikasi ini.
 *
 * Galat dari Storage diterjemahkan di sini, sekali untuk semua pemanggil:
 * "Bucket not found" tidak memberi tahu siapa pun bahwa obatnya adalah
 * menjalankan storage.sql, dan batas ukuran/jenis yang ditegakkan bucket
 * harus terbaca sebagai aturan, bukan kerusakan.
 */
export async function uploadFile(bucket, folder, file) {
  if (!file) return { path: null, error: null };
  // Diperiksa sebelum dikirim: berkas 30 MB tidak perlu menunggu terunggah
  // penuh hanya untuk ditolak server.
  if (file.size > BATAS_BERKAS_MB * 1024 * 1024) {
    return { path: null, error: { message: `"${file.name}" lebih dari ${BATAS_BERKAS_MB} MB — perkecil atau kompres dulu.` } };
  }
  const ext = file.name.split(".").pop();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file);
  if (error) return { path: null, error: { ...error, message: pesanGalat(error, bucket, file) } };
  return { path, error: null };
}

function pesanGalat(error, bucket, file) {
  const asli = error?.message || String(error || "");
  if (/bucket not found/i.test(asli)) {
    return `Tempat penyimpanan "${bucket}" belum dibuat di Supabase. Minta admin menjalankan supabase/storage.sql.`;
  }
  if (/maximum allowed size|too large|payload too large/i.test(asli)) {
    return `"${file.name}" lebih dari ${BATAS_BERKAS_MB} MB — perkecil atau kompres dulu.`;
  }
  if (/mime type|not supported|invalid_mime_type/i.test(asli)) {
    return `Jenis berkas "${file.name}" tidak diterima. Gunakan gambar${bucket === "siteplan-images" || bucket.endsWith("-photos") ? "" : " atau PDF"}.`;
  }
  return asli;
}

export function getPublicUrl(bucket, path) {
  if (!path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function getSignedUrl(bucket, path, expiresIn = 3600) {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl || null;
}
