import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Maximize } from "lucide-react";
import PenjelajahSiteplan from "./PenjelajahSiteplan";
import { statusPublikDari } from "../../lib/siteplan";
import { PAGE_BG, BORDER, SURFACE, TEXT_MID, TEXT_DARK } from "../ui";

/**
 * Mode presentasi: siteplan untuk diputar menghadap calon pembeli di meja
 * marketing atau layar pameran.
 *
 * Data internal dibuang sebelum sampai ke layar — bukan sekadar disembunyikan
 * — sehingga tidak ada nama konsumen yang bisa muncul lewat tooltip, dan hold
 * tampil sebagai "sudah dipesan" seperti di halaman publik.
 */
export default function PresentasiSiteplan({ open, onClose, siteplan, proyek, kavling, fasilitas, sekarang }) {
  const kotak = useRef(null);

  const publik = useMemo(
    () =>
      kavling.map((k) => {
        const status_publik = statusPublikDari(k, sekarang);
        return {
          id: k.id,
          unit_code: k.unit_code,
          block: k.block,
          type: k.type,
          price: status_publik === "tersedia" ? k.price : null,
          status_publik,
          luas_tanah: k.luas_tanah,
          luas_bangunan: k.luas_bangunan,
          posisi: k.posisi,
          hadap: k.hadap,
          bentuk: k.bentuk,
        };
      }),
    [kavling, sekarang]
  );

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    }
    document.addEventListener("keydown", onKey);
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = lama;
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [open, onClose]);

  if (!open || !siteplan) return null;

  const tersedia = publik.filter((k) => k.status_publik === "tersedia").length;

  return createPortal(
    <div ref={kotak} role="dialog" aria-modal="true" aria-label={`Presentasi ${siteplan.nama}`} style={{ position: "fixed", inset: 0, zIndex: 80, background: PAGE_BG, overflowY: "auto" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "18px 20px 24px" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12.5, color: TEXT_MID }}>{proyek?.location || "Zafira Property"}</div>
            <h2 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.02em", color: TEXT_DARK }}>
              {proyek?.name} · {siteplan.nama}
            </h2>
            <div style={{ fontSize: 13, color: TEXT_MID, marginTop: 2 }}>
              <b style={{ color: TEXT_DARK }}>{tersedia}</b> dari {publik.length} unit masih tersedia
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {document.fullscreenEnabled && (
              <button type="button" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : kotak.current?.requestFullscreen?.())} style={gayaTombol}>
                <Maximize size={15} /> Layar penuh
              </button>
            )}
            <button type="button" onClick={onClose} style={gayaTombol} autoFocus>
              <X size={15} /> Keluar presentasi
            </button>
          </div>
        </header>

        <PenjelajahSiteplan siteplan={siteplan} proyek={proyek?.name} kavling={publik} fasilitas={fasilitas} tinggiPeta="calc(100vh - 190px)" />
      </div>
    </div>,
    document.body
  );
}

const gayaTombol = {
  font: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "9px 15px",
  borderRadius: 999,
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
