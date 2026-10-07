import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

/**
 * Data siteplan untuk halaman Siteplan, Siteplan Digital, dan pemilih unit
 * di modal Booking — satu sumber, sehingga ketiganya tidak mungkin berbeda.
 */

/** Tabel/fungsi migrasi 022 belum ada: sebut migrasinya, jangan pesan Postgres mentah. */
export function pesanGalatSiteplan(error) {
  if (!error) return "";
  const pesan = error.message || "";
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202" || /does not exist|could not find/i.test(pesan)) {
    return "Fitur Siteplan membutuhkan migrasi supabase/migration_022_siteplan.sql. Jalankan di Supabase SQL Editor, lalu muat ulang halaman ini.";
  }
  return pesan;
}

export function useDaftarSiteplan() {
  const [keadaan, setKeadaan] = useState({ proyek: [], siteplans: [], memuat: true, galat: "" });

  const muat = useCallback(async () => {
    const [p, s] = await Promise.all([
      supabase.from("projects").select("id, name, location").order("created_at", { ascending: false }),
      supabase.from("siteplans").select("*").order("urutan").order("created_at"),
    ]);
    setKeadaan({
      proyek: p.data || [],
      siteplans: s.data || [],
      memuat: false,
      galat: pesanGalatSiteplan(s.error),
    });
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  return { ...keadaan, muatUlang: muat };
}

/**
 * Isi satu siteplan: kavling beserta konsumen/KPR/pembayaran/progres/hold
 * (siteplan_peta), dan fasilitasnya.
 *
 * Dimuat ulang saat tab kembali aktif — hold dan booking berubah sepanjang
 * hari oleh orang lain, dan peta yang basi adalah peta yang menjanjikan
 * kavling yang sudah terjual.
 */
export function usePetaSiteplan(siteplanId) {
  const [keadaan, setKeadaan] = useState({ kavling: [], fasilitas: [], memuat: false, galat: "" });
  const permintaan = useRef(0);

  const muat = useCallback(async () => {
    if (!siteplanId) {
      setKeadaan({ kavling: [], fasilitas: [], memuat: false, galat: "" });
      return;
    }
    const nomor = ++permintaan.current;
    setKeadaan((v) => ({ ...v, memuat: true }));
    const [peta, fas] = await Promise.all([
      supabase.rpc("siteplan_peta", { p_siteplan_id: siteplanId }),
      supabase.from("siteplan_fasilitas").select("*").eq("siteplan_id", siteplanId).order("created_at"),
    ]);
    // Jawaban siteplan sebelumnya yang tiba belakangan tidak boleh menimpa.
    if (nomor !== permintaan.current) return;
    setKeadaan({
      kavling: peta.data || [],
      fasilitas: fas.data || [],
      memuat: false,
      galat: pesanGalatSiteplan(peta.error || fas.error),
    });
  }, [siteplanId]);

  useEffect(() => {
    muat();
  }, [muat]);

  useEffect(() => {
    function saatTerlihat() {
      if (document.visibilityState === "visible") muat();
    }
    document.addEventListener("visibilitychange", saatTerlihat);
    return () => document.removeEventListener("visibilitychange", saatTerlihat);
  }, [muat]);

  return { ...keadaan, muatUlang: muat };
}

/** Jam yang berdetak — untuk hitung mundur hold tanpa memuat ulang data. */
export function useSekarang(selang = 30000) {
  const [sekarang, setSekarang] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setSekarang(Date.now()), selang);
    return () => clearInterval(t);
  }, [selang]);
  return sekarang;
}
