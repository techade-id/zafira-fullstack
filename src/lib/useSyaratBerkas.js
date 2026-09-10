import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

/**
 * Syarat dokumen KPR yang berlaku untuk sebuah bank (PRD §1.4).
 *
 * Sebelum ini daftar dokumen ditulis mati di frontend — lima jenis, sama untuk
 * kesembilan bank mitra. Padahal justru di situ letak pekerjaan Admin
 * Marketing: BTN meminta berkas yang tidak diminta BRI, dan checklist yang
 * benar-benar dipakai akhirnya hidup di kertas.
 *
 * Baris dengan `bank = '*'` adalah syarat bawaan. Sebuah bank yang punya
 * barisnya sendiri memakai daftar itu sepenuhnya, bukan menambahkannya ke
 * bawaan — kalau tidak, mustahil menghapus satu syarat untuk satu bank saja.
 */

export const BANK_BAWAAN = "*";

export function useSyaratBerkas(bank) {
  const [semua, setSemua] = useState([]);
  const [memuat, setMemuat] = useState(true);

  useEffect(() => {
    let aktif = true;
    supabase
      .from("bank_doc_requirements")
      .select("bank, doc_type, wajib, catatan, sort_order")
      .order("sort_order")
      .then(({ data, error }) => {
        if (!aktif) return;
        // Sebelum migrasi 015 tabelnya belum ada. Itu bukan keadaan darurat:
        // checklist cukup kosong, unggah dokumen tetap berjalan.
        setSemua(error ? [] : data || []);
        setMemuat(false);
      });
    return () => {
      aktif = false;
    };
  }, []);

  const syarat = useMemo(() => {
    if (semua.length === 0) return [];
    const khusus = bank ? semua.filter((s) => s.bank === bank) : [];
    return (khusus.length > 0 ? khusus : semua.filter((s) => s.bank === BANK_BAWAAN)).slice().sort(
      (a, b) => a.sort_order - b.sort_order
    );
  }, [semua, bank]);

  const pakaiBawaan = useMemo(
    () => Boolean(bank) && !semua.some((s) => s.bank === bank),
    [semua, bank]
  );

  return { syarat, pakaiBawaan, memuat, semua };
}

/**
 * Menyandingkan syarat dengan dokumen yang sudah diunggah.
 *
 * Yang dicari Admin Marketing selalu hal yang sama: apa yang BELUM ada. Karena
 * itu kekurangan dihitung di sini, bukan diserahkan kepada pemanggil.
 */
export function cocokkanBerkas(syarat, dokumen) {
  const perJenis = new Map();
  for (const d of dokumen || []) {
    const k = String(d.doc_type || "").trim().toLowerCase();
    // Bila satu jenis diunggah berkali-kali, yang terverifikasi menang.
    const lama = perJenis.get(k);
    if (!lama || (d.status === "terverifikasi" && lama.status !== "terverifikasi")) perJenis.set(k, d);
  }

  const baris = (syarat || []).map((s) => {
    const doc = perJenis.get(s.doc_type.trim().toLowerCase()) || null;
    return {
      ...s,
      doc,
      keadaan: !doc ? "belum" : doc.status === "terverifikasi" ? "terverifikasi" : doc.status === "ditolak" ? "ditolak" : "menunggu",
    };
  });

  const wajib = baris.filter((b) => b.wajib);
  return {
    baris,
    // Dokumen di luar daftar syarat tetap ditampilkan — bank kadang meminta
    // tambahan mendadak, dan menyembunyikannya membuat berkas tampak hilang.
    ekstra: (dokumen || []).filter(
      (d) => !(syarat || []).some((s) => s.doc_type.trim().toLowerCase() === String(d.doc_type || "").trim().toLowerCase())
    ),
    kurang: wajib.filter((b) => b.keadaan === "belum"),
    ditolak: baris.filter((b) => b.keadaan === "ditolak"),
    lengkapWajib: wajib.filter((b) => b.keadaan === "terverifikasi").length,
    totalWajib: wajib.length,
  };
}
