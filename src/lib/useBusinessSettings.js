import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

/**
 * Returns `options` guaranteed to contain `current`.
 *
 * Without this, a value that was removed from Pengaturan Bisnis renders as an
 * empty <select>, and the next save writes that blank back — so merely opening
 * a record's form would destroy the stored value.
 */
export function withCurrentValue(options, current) {
  if (!current || options.includes(current)) return options;
  return [...options, current];
}

export function useBusinessSettings(category) {
  const [values, setValues] = useState([]);

  useEffect(() => {
    let active = true;
    supabase
      .from("business_settings")
      .select("value")
      .eq("category", category)
      .order("sort_order")
      .then(({ data }) => {
        if (active) setValues((data || []).map((r) => r.value));
      });
    return () => {
      active = false;
    };
  }, [category]);

  return values;
}

/**
 * Kategori yang berbentuk kunci→teks, bukan daftar nilai.
 *
 * Dipakai template WhatsApp (migrasi 014), yang butuh penanda tahap milik tiap
 * kalimat. Mengembalikan objek `{ [label]: value }` supaya pemanggil bisa
 * mengambil satu baris langsung tanpa mencari di dalam array.
 *
 * Sebelum migrasi 014 dijalankan, kolom `label` belum ada dan kuerinya gagal —
 * hasilnya objek kosong, dan pemanggil jatuh ke kalimat bawaannya sendiri.
 */
export function useBusinessSettingsMap(category) {
  const [map, setMap] = useState({});

  useEffect(() => {
    let active = true;
    supabase
      .from("business_settings")
      .select("label, value")
      .eq("category", category)
      .not("label", "is", null)
      .order("sort_order")
      .then(({ data, error }) => {
        if (!active || error) return;
        setMap(Object.fromEntries((data || []).map((r) => [r.label, r.value])));
      });
    return () => {
      active = false;
    };
  }, [category]);

  return map;
}
