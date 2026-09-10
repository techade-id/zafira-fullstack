import React, { useMemo, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { SITEPLAN_VIEWBOX, SITEPLAN_KAVLING, SITEPLAN_FASILITAS } from "../data/siteplanKaligangsa";
import { BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, POSITIVE, NEGATIVE, ACCENT } from "./ui";

/**
 * Siteplan sebagai peta vektor.
 *
 * Sebelumnya siteplan adalah gambar JPEG dengan pin persegi kecil yang
 * ditempelkan satu per satu lewat koordinat pos_x/pos_y — artinya seseorang
 * harus mengklik 158 kali untuk menempatkannya, pin tidak pernah benar-benar
 * berimpit dengan kotak kavling di gambar, dan yang bisa diklik hanyalah pin
 * itu, bukan kavlingnya.
 *
 * Sekarang kavlingnya sendiri yang menjadi bentuk yang dapat diklik, dengan
 * batas persis seperti pada gambar kerja. Geometrinya dihasilkan
 * tools/siteplan_ke_vektor.py dan `kode` di dalamnya cocok dengan
 * units.unit_code, sehingga status dari database langsung mewarnai petanya.
 */

const WARNA = {
  tersedia: { isi: "#DCF0E3", garis: POSITIVE, teks: "#14532D" },
  booking: { isi: "#FDE3D5", garis: ACCENT, teks: "#8A2F0B" },
  terjual: { isi: "#DBE5F5", garis: "#2B5CA8", teks: "#1B3E73" },
  batal: { isi: "#F9DEDC", garis: NEGATIVE, teks: "#8A2620" },
  // Kavling yang ada pada gambar tetapi belum ada barisnya di database.
  tak_terdaftar: { isi: "#F1F4F9", garis: "#C7D3EA", teks: TEXT_MID },
};

const URUT_STATUS = ["tersedia", "booking", "terjual", "batal"];

export default function SiteplanVektor({
  units = [],
  kodeTerpilih,
  onPilih,
  hanyaTersedia = false,
  sorotan = "",
  tinggi = 460,
}) {
  const [zoom, setZoom] = useState(1);
  const [geser, setGeser] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState(null);
  const seret = useRef(null);
  const bingkai = useRef(null);

  // Status dari database ditempelkan ke geometri lewat unit_code.
  const perKode = useMemo(() => {
    const m = new Map();
    for (const u of units) if (u.unit_code) m.set(String(u.unit_code).trim().toUpperCase(), u);
    return m;
  }, [units]);

  const kavling = useMemo(
    () =>
      SITEPLAN_KAVLING.map((k) => {
        const db = perKode.get(k.kode.toUpperCase()) || null;
        const status = db ? db.status : "tak_terdaftar";
        return { ...k, db, status };
      }),
    [perKode]
  );

  const jumlah = useMemo(() => {
    const h = {};
    for (const k of kavling) h[k.status] = (h[k.status] || 0) + 1;
    return h;
  }, [kavling]);

  const cari = sorotan.trim().toUpperCase();

  function bisaDipilih(k) {
    if (!onPilih) return false;
    if (!k.db) return false;
    if (hanyaTersedia) return k.status === "tersedia" || k.db.id === kodeTerpilih;
    return true;
  }

  function mulaiSeret(e) {
    if (e.button !== 0) return;
    seret.current = { x: e.clientX, y: e.clientY, awal: { ...geser } };
  }
  function saatSeret(e) {
    if (!seret.current) return;
    const dx = e.clientX - seret.current.x;
    const dy = e.clientY - seret.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) e.currentTarget.style.cursor = "grabbing";
    setGeser({ x: seret.current.awal.x + dx, y: seret.current.awal.y + dy });
  }
  function selesaiSeret(e) {
    seret.current = null;
    e.currentTarget.style.cursor = "grab";
  }

  function roda(e) {
    // Perbesar hanya bila Ctrl/⌘ ditahan, supaya gulir halaman biasa tidak
    // ikut tertahan peta — pola yang sama dengan peta web pada umumnya.
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setZoom((z) => Math.min(6, Math.max(1, z * (e.deltaY < 0 ? 1.12 : 0.89))));
  }

  const info = hover || kavling.find((k) => k.db && k.db.id === kodeTerpilih) || null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 9, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11.5, color: TEXT_MID }}>
          {URUT_STATUS.map((s) => (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: WARNA[s].isi, border: `1px solid ${WARNA[s].garis}` }} aria-hidden="true" />
              <b style={{ color: TEXT_DARK }}>{jumlah[s] || 0}</b> {s}
            </span>
          ))}
          {jumlah.tak_terdaftar > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }} title="Ada di gambar kerja tetapi belum ada barisnya di database">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: WARNA.tak_terdaftar.isi, border: `1px solid ${WARNA.tak_terdaftar.garis}` }} aria-hidden="true" />
              <b style={{ color: TEXT_DARK }}>{jumlah.tak_terdaftar}</b> belum terdaftar
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 5 }}>
          <button onClick={() => setZoom((z) => Math.min(6, z * 1.3))} aria-label="Perbesar" style={gayaZoom}>
            <ZoomIn size={14} />
          </button>
          <button onClick={() => setZoom((z) => Math.max(1, z / 1.3))} aria-label="Perkecil" style={gayaZoom}>
            <ZoomOut size={14} />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setGeser({ x: 0, y: 0 });
            }}
            aria-label="Kembalikan tampilan"
            style={gayaZoom}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      <div
        ref={bingkai}
        onWheel={roda}
        onPointerDown={mulaiSeret}
        onPointerMove={saatSeret}
        onPointerUp={selesaiSeret}
        onPointerLeave={selesaiSeret}
        style={{
          position: "relative",
          height: tinggi,
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          overflow: "hidden",
          background: "#FBFCFE",
          cursor: "grab",
          touchAction: "none",
        }}
      >
        <svg
          viewBox={SITEPLAN_VIEWBOX}
          width="100%"
          height="100%"
          role="group"
          aria-label="Peta siteplan Zafira Kaligangsa"
          style={{
            display: "block",
            transform: `translate(${geser.x}px, ${geser.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: seret.current ? "none" : "transform 0.12s ease-out",
          }}
        >
          {SITEPLAN_FASILITAS.map((f) => (
            <g key={f.kode}>
              <polygon points={f.titik} fill="#E8EDF7" stroke={PRIMARY} strokeWidth="0.9" />
              <text x={f.pusat[0]} y={f.pusat[1]} textAnchor="middle" dominantBaseline="central" style={{ font: "600 7px system-ui, sans-serif", fill: PRIMARY, pointerEvents: "none" }}>
                {f.label}
              </text>
            </g>
          ))}

          {kavling.map((k) => {
            const w = WARNA[k.status] || WARNA.tak_terdaftar;
            const pilih = bisaDipilih(k);
            const terpilih = k.db && k.db.id === kodeTerpilih;
            const cocok = cari && k.kode.toUpperCase().includes(cari);
            const redup = cari && !cocok;

            return (
              <g key={k.kode}>
                <polygon
                  points={k.titik}
                  fill={w.isi}
                  stroke={terpilih ? "#111B2E" : cocok ? "#111B2E" : w.garis}
                  strokeWidth={terpilih ? 2.4 : cocok ? 1.8 : 0.8}
                  opacity={redup ? 0.25 : 1}
                  role={pilih ? "button" : undefined}
                  tabIndex={pilih ? 0 : undefined}
                  aria-label={`Kavling ${k.kode}, ${k.status}`}
                  onMouseEnter={() => setHover(k)}
                  onMouseLeave={() => setHover((v) => (v === k ? null : v))}
                  onFocus={() => setHover(k)}
                  onBlur={() => setHover((v) => (v === k ? null : v))}
                  onClick={() => pilih && onPilih(k.db, k)}
                  onKeyDown={(e) => {
                    if (pilih && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onPilih(k.db, k);
                    }
                  }}
                  style={{ cursor: pilih ? "pointer" : "default", outline: "none" }}
                />
                {/* Kode kavling hanya muncul saat diperbesar. Pada tampilan
                    penuh, 158 label sekaligus justru menutupi petanya. */}
                {zoom >= 2 && (
                  <text
                    x={k.pusat[0]}
                    y={k.pusat[1]}
                    textAnchor="middle"
                    dominantBaseline="central"
                    opacity={redup ? 0.25 : 1}
                    style={{ font: `600 ${6 / Math.sqrt(zoom) + 2}px system-ui, sans-serif`, fill: w.teks, pointerEvents: "none" }}
                  >
                    {k.kode}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {info && (
          <div
            style={{
              position: "absolute",
              left: 10,
              bottom: 10,
              background: "rgba(17,27,46,0.93)",
              color: "#fff",
              borderRadius: 10,
              padding: "9px 13px",
              fontSize: 12,
              lineHeight: 1.55,
              pointerEvents: "none",
              maxWidth: "min(340px, 72%)",
            }}
          >
            <b style={{ fontSize: 13 }}>{info.kode}</b>
            <span style={{ opacity: 0.85 }}> · Blok {info.blok}</span>
            <div style={{ opacity: 0.9 }}>
              {info.db ? (
                <>
                  {info.db.type ? `${info.db.type} · ` : ""}
                  {info.status}
                  {info.db.price ? ` · Rp${Number(info.db.price).toLocaleString("id-ID")}` : ""}
                </>
              ) : (
                "Belum terdaftar di database"
              )}
            </div>
          </div>
        )}

        <div style={{ position: "absolute", right: 10, bottom: 10, fontSize: 10.5, color: TEXT_MID, pointerEvents: "none" }}>
          Seret untuk menggeser · ⌘/Ctrl + gulir untuk memperbesar
        </div>
      </div>
    </div>
  );
}

const gayaZoom = {
  width: 30,
  height: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  borderRadius: 9,
  cursor: "pointer",
};
