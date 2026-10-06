import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, X, FileText, Check, Ban } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { jenisBerkas } from "../lib/berkas";
import { Modal, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PAGE_BG, POSITIVE, NEGATIVE, ACCENT_DARK } from "./ui";

/**
 * Pratinjau berkas di dalam aplikasi.
 *
 * Sebelumnya setiap "Lihat" membuka tab baru. Memeriksa kelengkapan berkas
 * seorang konsumen — KTP, KK, slip gaji, rekening koran — berarti sembilan tab
 * yang harus ditutup satu per satu, dan berkas yang sedang diperiksa tidak
 * pernah bersebelahan dengan daftarnya. Di sini berkas dibuka di tempat,
 * dan ← → berpindah ke berkas berikutnya.
 *
 * Item: { bucket, path, judul, keterangan, nama, verifikasi? }
 *
 * `verifikasi` — { keadaan, setuju(): Promise<bool>, tolak(): Promise<bool> }
 * — menampilkan tombol Verifikasi/Tolak di bawah berkas. Memeriksa berkas
 * dan memutuskannya terjadi di layar yang sama: tidak ada lagi menutup
 * pratinjau, mencari barisnya, lalu memilih status dari dropdown.
 */

const LABEL_KEADAAN = {
  terverifikasi: { label: "Terverifikasi", warna: POSITIVE },
  menunggu: { label: "Menunggu verifikasi", warna: ACCENT_DARK },
  ditolak: { label: "Ditolak", warna: NEGATIVE },
};
export default function PratinjauBerkas({ daftar, indeks, open, onClose, onPindah }) {
  const item = daftar[indeks] || null;
  const [url, setUrl] = useState(null);
  const [memuat, setMemuat] = useState(false);
  const [gagal, setGagal] = useState(false);
  // Keputusan yang diambil di layar ini. Daftarnya salinan saat pratinjau
  // dibuka, jadi tanpa ini status berkas yang baru diverifikasi tetap
  // terbaca "menunggu" ketika pengguna kembali ke berkas itu dengan ←.
  const [keputusan, setKeputusan] = useState({});
  const [memutus, setMemutus] = useState(false);
  const wadah = useRef(null);

  useEffect(() => {
    if (open) setKeputusan({});
  }, [open]);

  // Penampil PDF bawaan browser merebut fokus begitu iframe-nya selesai
  // dimuat, dan sejak itu Escape serta ← → tertelan di dalam iframe —
  // pratinjau tidak bisa ditutup atau digeser dari keyboard. Rebutannya tidak
  // terjadi tepat pada onLoad, jadi yang dipasang adalah jendela 1,5 detik:
  // setiap kali fokus pindah ke iframe dalam rentang itu, fokus dikembalikan.
  // Di luar rentang itu fokus di dalam PDF adalah pilihan pengguna sendiri.
  const batasRebut = useRef(0);
  function rebutFokus() {
    batasRebut.current = Date.now() + 1500;
    kembalikanFokus();
  }
  function kembalikanFokus() {
    if (Date.now() > batasRebut.current) return;
    for (const ms of [0, 50]) {
      setTimeout(() => {
        if (document.activeElement?.tagName === "IFRAME") wadah.current?.focus();
      }, ms);
    }
  }
  useEffect(() => {
    if (!open) return undefined;
    // Jendela induk kehilangan fokus tepat saat iframe merebutnya.
    window.addEventListener("blur", kembalikanFokus);
    return () => window.removeEventListener("blur", kembalikanFokus);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !item) return undefined;
    let batal = false;
    setUrl(null);
    setGagal(false);
    setMemuat(true);
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
      {item.verifikasi && (
        <BarisKeputusan
          keadaan={keputusan[item.path] || item.verifikasi.keadaan}
          memutus={memutus}
          onSetuju={async () => {
            setMemutus(true);
            const ok = await item.verifikasi.setuju();
            setMemutus(false);
            if (!ok) return;
            setKeputusan((k) => ({ ...k, [item.path]: "terverifikasi" }));
            // Lanjut ke berkas berikutnya yang masih menunggu — memeriksa
            // sembilan berkas adalah sembilan keputusan berturut-turut.
            const berikut = daftar.findIndex((d, i) => i > indeks && d.verifikasi && (keputusan[d.path] || d.verifikasi.keadaan) === "menunggu");
            if (berikut >= 0) onPindah(berikut);
          }}
          onTolak={async () => {
            const ok = await item.verifikasi.tolak();
            if (ok) setKeputusan((k) => ({ ...k, [item.path]: "ditolak" }));
          }}
        />
      )}
    </Modal>
  );
}

function BarisKeputusan({ keadaan, memutus, onSetuju, onTolak }) {
  const k = LABEL_KEADAAN[keadaan] || LABEL_KEADAAN.menunggu;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap", marginTop: 14 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: k.warna }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: k.warna }} />
        {k.label}
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        {keadaan !== "ditolak" && (
          <button onClick={onTolak} disabled={memutus} style={{ ...tombolKeputusan, color: NEGATIVE, borderColor: "#F2D3D1" }}>
            <Ban size={14} aria-hidden="true" /> Tolak
          </button>
        )}
        {keadaan !== "terverifikasi" && (
          <button onClick={onSetuju} disabled={memutus} style={{ ...tombolKeputusan, background: POSITIVE, borderColor: POSITIVE, color: "#fff" }}>
            <Check size={14} aria-hidden="true" /> {memutus ? "Menyimpan…" : "Verifikasi"}
          </button>
        )}
      </div>
    </div>
  );
}

const tombolKeputusan = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  borderRadius: 999,
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

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
