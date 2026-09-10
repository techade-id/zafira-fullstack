import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { SURFACE, BORDER, TEXT_DARK, TEXT_MID, PRIMARY, POSITIVE, NEGATIVE } from "../components/ui";

/**
 * Umpan balik singkat setelah sebuah aksi.
 *
 * Sebelum ini, menyimpan berhasil berarti formulir menutup diam-diam dan
 * menyimpan gagal kadang tidak terlihat sama sekali — beberapa halaman membuang
 * hasil `update()` begitu saja, sehingga penolakan RLS tampak seperti nilai
 * yang kembali sendiri tanpa sebab.
 *
 * Toast sukses menghilang sendiri; toast gagal TIDAK. Pesan kesalahan yang
 * lenyap sebelum sempat dibaca sama saja dengan tidak ada pesan.
 */

const ToastContext = createContext(null);

let urut = 0;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  const tutup = useCallback((id) => {
    setItems((v) => v.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const tampil = useCallback(
    (pesan, { jenis = "info", durasi } = {}) => {
      const id = ++urut;
      setItems((v) => [...v, { id, pesan, jenis }]);

      // Kesalahan bertahan sampai ditutup sendiri oleh pengguna.
      const hidup = durasi ?? (jenis === "gagal" ? 0 : 4000);
      if (hidup > 0) {
        timers.current.set(
          id,
          setTimeout(() => tutup(id), hidup)
        );
      }
      return id;
    },
    [tutup]
  );

  const api = useMemo(
    () => ({
      tampil,
      sukses: (pesan, opsi) => tampil(pesan, { ...opsi, jenis: "sukses" }),
      gagal: (pesan, opsi) => tampil(pesan, { ...opsi, jenis: "gagal" }),
      info: (pesan, opsi) => tampil(pesan, { ...opsi, jenis: "info" }),
      tutup,
    }),
    [tampil, tutup]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <TumpukanToast items={items} onTutup={tutup} />
    </ToastContext.Provider>
  );
}

/**
 * Selalu mengembalikan objek yang bisa dipanggil, bahkan di luar provider —
 * sebuah komponen tidak boleh gagal dirender hanya karena ingin memberi kabar.
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx || KOSONG;
}

const KOSONG = {
  tampil: () => {},
  sukses: () => {},
  gagal: () => {},
  info: () => {},
  tutup: () => {},
};

const GAYA = {
  sukses: { ikon: CheckCircle2, warna: POSITIVE },
  gagal: { ikon: AlertCircle, warna: NEGATIVE },
  info: { ikon: Info, warna: PRIMARY },
};

function TumpukanToast({ items, onTutup }) {
  if (items.length === 0) return null;
  return (
    <div
      // aria-live: pembaca layar mengumumkan isinya tanpa memindahkan fokus,
      // sehingga pengguna keyboard tidak terlempar keluar dari pekerjaannya.
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: "min(380px, calc(100vw - 36px))",
      }}
    >
      {items.map((t) => {
        const { ikon: Ikon, warna } = GAYA[t.jenis] || GAYA.info;
        return (
          <div
            key={t.id}
            role={t.jenis === "gagal" ? "alert" : "status"}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              background: SURFACE,
              border: `1px solid ${BORDER}`,
              borderLeft: `3px solid ${warna}`,
              borderRadius: 13,
              padding: "12px 14px",
              boxShadow: "0 12px 32px rgba(15,42,92,0.16)",
              fontSize: 13,
              color: TEXT_DARK,
              lineHeight: 1.5,
            }}
          >
            <Ikon size={17} color={warna} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ flex: 1, minWidth: 0 }}>{t.pesan}</span>
            <button
              onClick={() => onTutup(t.id)}
              aria-label="Tutup pemberitahuan"
              style={{ border: "none", background: "none", color: TEXT_MID, cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
