import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

/**
 * Satu sumber angka untuk lonceng dan blok "Fokus Hari Ini".
 *
 * RPC `my_notifications()` berjalan SECURITY INVOKER, jadi penyaringan datang
 * dari RLS: Sales melihat prospeknya sendiri, Finance melihat antrean
 * verifikasinya, peran monitoring melihat semuanya — tanpa satu pun cabang
 * peran di sisi klien.
 *
 * Karena kedua pemakainya memanggil hook ini, hasil terakhir disimpan di
 * modul: lonceng dan dashboard yang tampil bersamaan tidak menembak dua kali,
 * dan angkanya dijamin sama. Mengejar notifikasi yang jumlahnya berbeda dengan
 * isi daftarnya adalah cara cepat kehilangan kepercayaan pada fitur ini.
 */

const KOSONG = { total: 0, tinggi: 0, per_kategori: [], items: [] };

let cache = null;
let cacheWaktu = 0;
let sedangJalan = null;
const pendengar = new Set();

const JEDA_MS = 60000;

async function ambil(paksa = false) {
  if (!paksa && cache && Date.now() - cacheWaktu < JEDA_MS) return cache;
  if (sedangJalan) return sedangJalan;

  sedangJalan = supabase
    .rpc("my_notifications")
    .then(({ data, error }) => {
      sedangJalan = null;
      if (error) {
        // Sebelum migrasi 013 dijalankan, fungsinya belum ada. Itu bukan
        // keadaan darurat — lonceng cukup diam, sisa aplikasi tetap jalan.
        cache = { ...KOSONG, error: error.message };
      } else {
        cache = { ...KOSONG, ...(data || {}) };
      }
      cacheWaktu = Date.now();
      pendengar.forEach((f) => f(cache));
      return cache;
    })
    .catch((e) => {
      sedangJalan = null;
      cache = { ...KOSONG, error: String(e) };
      cacheWaktu = Date.now();
      pendengar.forEach((f) => f(cache));
      return cache;
    });

  return sedangJalan;
}

export function useNotifications() {
  const [data, setData] = useState(cache || KOSONG);
  const [memuat, setMemuat] = useState(!cache);

  const segarkan = useCallback(async () => {
    setMemuat(true);
    await ambil(true);
    setMemuat(false);
  }, []);

  useEffect(() => {
    let aktif = true;
    const dengar = (v) => aktif && setData(v);
    pendengar.add(dengar);

    ambil().then(() => aktif && setMemuat(false));

    const timer = setInterval(() => ambil(true), JEDA_MS);

    // Tab yang ditinggalkan setengah jam tidak perlu terus menembak; yang
    // dibutuhkan adalah angka yang segar begitu orang kembali melihatnya.
    function onVisible() {
      if (document.visibilityState === "visible") ambil(true);
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      aktif = false;
      pendengar.delete(dengar);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return { ...data, memuat, segarkan };
}

/** Dipakai setelah sebuah aksi yang jelas mengubah antrean (mis. follow-up selesai). */
export function segarkanNotifikasi() {
  return ambil(true);
}

/**
 * Dibuang saat sesi berganti.
 *
 * Cache ini hidup di tingkat modul, bukan komponen, supaya lonceng dan
 * dashboard berbagi satu hasil. Tanpa pembersihan ini, pengguna berikutnya di
 * komputer yang sama akan sempat melihat antrean milik pengguna sebelumnya —
 * data yang RLS justru dirancang untuk menyembunyikan.
 */
export function bersihkanNotifikasi() {
  cache = null;
  cacheWaktu = 0;
  sedangJalan = null;
  pendengar.forEach((f) => f(KOSONG));
}

export const LABEL_KATEGORI = {
  followup: "Follow-up jatuh tempo",
  dingin: "Prospek mulai dingin",
  sp3k: "SP3K mendekati kedaluwarsa",
  mandek: "Berkas mengendap di bank",
  verifikasi: "Menunggu verifikasi",
};
