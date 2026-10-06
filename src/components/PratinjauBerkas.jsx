import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, X, FileText } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { jenisBerkas } from "../lib/berkas";
import { Modal, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PAGE_BG } from "./ui";

/**
 * Pratinjau berkas di dalam aplikasi.
 *
 * Sebelumnya setiap "Lihat" membuka tab baru. Memeriksa kelengkapan berkas
 * seorang konsumen — KTP, KK, slip gaji, rekening koran — berarti sembilan tab
 * yang harus ditutup satu per satu, dan berkas yang sedang diperiksa tidak
 * pernah bersebelahan dengan daftarnya. Di sini berkas dibuka di tempat,
 * dan ← → berpindah ke berkas berikutnya.
 *
 * Item: { bucket, path, judul, keterangan, nama }
 */
export default function PratinjauBerkas({ daftar, indeks, open, onClose, onPindah }) {
  const item = daftar[indeks] || null;
  const [url, setUrl] = useState(null);
  const [memuat, setMemuat] = useState(false);
  const [gagal, setGagal] = useState(false);
  const wadah = useRef(null);

  // Penampil PDF bawaan browser merebut fokus begitu iframe-nya selesai
  // dimuat, dan sejak itu Escape serta ← → tertelan di dalam iframe —
  // pratinjau tidak bisa ditutup atau digeser dari keyboard. Fokus diambil
  // kembali beberapa kali karena penampilnya memfokuskan diri tidak tepat
  // pada saat onLoad. Klik pengguna di dalam PDF tetap dihormati: yang diambil
  // kembali hanya fokus yang direbut tanpa diminta, dalam detik pertama.
  function rebutFokus() {
    for (const ms of [0, 150, 500, 1000]) {
      setTimeout(() => {
        if (document.activeElement?.tagName === "IFRAME" && !wadah.current?.dataset.diklik) wadah.current?.focus();
      }, ms);
    }
  }

  useEffect(() => {
    if (!open || !item) return undefined;
    let batal = false;
    setUrl(null);
    setGagal(false);
    setMemuat(true);
    if (wadah.current) delete wadah.current.dataset.diklik;
    supabase.storage
      .from(item.bucket)
      .createSignedUrl(item.path, 3600)
      .then(({ data }) => {
        if (batal) return;
        setMemuat(false);
        if (data?.signedUrl) setUrl(data.signedUrl);
        else setGagal(true);
      });
    return () => {
      batal = true;
    };
  }, [open, item?.bucket, item?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const pindah = useCallback(
    (arah) => {
      const i = indeks + arah;
      if (i >= 0 && i < daftar.length) onPindah(i);
    },
    [indeks, daftar.length, onPindah]
  );

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      // Panah di dalam kolom isian tetap milik kolomnya.
      if (e.target.closest?.("input, textarea, select")) return;
      if (e.key === "ArrowLeft") pindah(-1);
      if (e.key === "ArrowRight") pindah(1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pindah]);

  async function unduh() {
    const { data } = await supabase.storage
      .from(item.bucket)
      .createSignedUrl(item.path, 600, { download: item.nama || true });
    if (data?.signedUrl) window.location.assign(data.signedUrl);
  }

  if (!open || !item) return null;

  const jenis = jenisBerkas(item.nama || item.path);

  return (
    <Modal open labelledBy="pratinjau-judul" onClose={onClose} width={980}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div id="pratinjau-judul" style={{ fontSize: 16, fontWeight: 700, color: TEXT_DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.judul}
          </div>
          <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[item.keterangan, daftar.length > 1 ? `${indeks + 1} dari ${daftar.length}` : null].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {/* Tidak di-disable selagi memuat: tombol yang mendadak disabled
              melepaskan fokus keyboard ke tempat yang tidak terduga. */}
          <button onClick={() => url && window.open(url, "_blank", "noopener")} style={ikonTombol} title="Buka di tab baru" aria-label="Buka di tab baru">
            <ExternalLink size={15} />
          </button>
          <button onClick={unduh} style={ikonTombol} title="Unduh" aria-label="Unduh berkas">
            <Download size={15} />
          </button>
          <button onClick={onClose} style={ikonTombol} title="Tutup" aria-label="Tutup pratinjau">
            <X size={15} />
          </button>
        </div>
      </div>

      <div
        ref={wadah}
        tabIndex={-1}
        onPointerDown={() => {
          if (wadah.current) wadah.current.dataset.diklik = "1";
        }}
        style={{
          outline: "none",
          position: "relative",
          height: "min(68vh, 640px)",
          background: PAGE_BG,
          borderRadius: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {memuat && <div style={{ fontSize: 13, color: TEXT_MID }}>Memuat berkas…</div>}

        {!memuat && url && !gagal && jenis === "gambar" && (
          <img
            src={url}
            alt={item.judul}
            onError={() => setGagal(true)}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
          />
        )}

        {!memuat && url && !gagal && jenis === "pdf" && (
          <iframe src={url} title={item.judul} onLoad={rebutFokus} style={{ width: "100%", height: "100%", border: 0, background: SURFACE }} />
        )}

        {!memuat && (gagal || jenis === "lain") && (
          <div style={{ textAlign: "center", padding: 24, maxWidth: 360 }}>
            <FileText size={30} color={TEXT_MID} aria-hidden="true" />
            <div style={{ fontSize: 13, color: TEXT_DARK, fontWeight: 600, marginTop: 10 }}>
              {gagal && jenis !== "lain" ? "Berkas tidak dapat ditampilkan di sini" : "Pratinjau tidak tersedia untuk jenis berkas ini"}
            </div>
            <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 5, lineHeight: 1.5 }}>
              Unduh berkasnya, atau buka di tab baru.
            </div>
          </div>
        )}

        {daftar.length > 1 && (
          <>
            <button onClick={() => pindah(-1)} disabled={indeks === 0} style={{ ...panah, left: 10, opacity: indeks === 0 ? 0.35 : 1 }} aria-label="Berkas sebelumnya">
              <ChevronLeft size={20} />
            </button>
            <button onClick={() => pindah(1)} disabled={indeks === daftar.length - 1} style={{ ...panah, right: 10, opacity: indeks === daftar.length - 1 ? 0.35 : 1 }} aria-label="Berkas berikutnya">
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * `const [bukaPratinjau, pratinjau] = usePratinjau();`
 * lalu `bukaPratinjau(daftar, indeks)` dan render `{pratinjau}`.
 */
export function usePratinjau() {
  const [state, setState] = useState(null);
  const buka = useCallback((daftar, indeks = 0) => setState({ daftar, indeks }), []);
  const onPindah = useCallback((i) => setState((s) => (s ? { ...s, indeks: i } : s)), []);
  const elemen = (
    <PratinjauBerkas
      daftar={state?.daftar || []}
      indeks={state?.indeks || 0}
      open={Boolean(state)}
      onClose={() => setState(null)}
      onPindah={onPindah}
    />
  );
  return [buka, elemen];
}

const ikonTombol = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const panah = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  width: 38,
  height: 38,
  borderRadius: "50%",
  border: `1px solid ${BORDER}`,
  background: "rgba(255,255,255,0.92)",
  color: TEXT_DARK,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  boxShadow: "0 4px 14px rgba(15,42,92,0.12)",
};
