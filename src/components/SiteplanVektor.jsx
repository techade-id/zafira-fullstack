import React, { useEffect, useMemo, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { usePandangan, useRodaPeta, useSeretPeta, useSkalaLayar } from "./siteplan/usePandangan";
import { titikDari, pusatDari, ukuranDari, MODE_PETA, GAYA_FASILITAS, statusJual, holdAktif, sisaWaktu, atributRingkas } from "../lib/siteplan";
import { rupiah } from "../lib/format";
import { BORDER, SURFACE, TEXT_MID, TEXT_DARK, ACCENT } from "./ui";

/**
 * Siteplan sebagai peta vektor.
 *
 * Kavlingnya sendiri yang menjadi bentuk yang dapat diklik, dengan batas
 * persis seperti gambar kerja. Geometrinya kini datang dari database
 * (units.bentuk, migrasi 022) sehingga setiap siteplan — bukan hanya
 * Kaligangsa — tampil dengan cara yang sama, dan status dari database langsung
 * mewarnai petanya.
 *
 * Warna ditentukan `skema`: { kategori: [{ key, label, gaya }], golongkan(k),
 * sorot?(k), labelSorot? }. Bawaannya MODE_PETA[mode].
 */
export default function SiteplanVektor({
  siteplan,
  kavling = [],
  fasilitas = [],
  mode = "status",
  skema: skemaKustom,
  terpilih,
  onPilih,
  bisaDipilih,
  redup,
  kategoriAktif,
  onKategori,
  tooltip,
  lencana,
  fokus,
  tinggi = 460,
  legenda = true,
  kontrol = true,
  ariaLabel,
  sekarang,
  children,
}) {
  const lebar = Number(siteplan?.lebar) || 1000;
  const tinggiKanvas = Number(siteplan?.tinggi) || 700;
  const bingkai = useRef(null);
  const svgRef = useRef(null);
  const pandangan = usePandangan(lebar, tinggiKanvas);
  const seret = useSeretPeta(svgRef, pandangan);
  useRodaPeta(bingkai, svgRef, pandangan);
  const [hover, setHover] = useState(null);
  const sentuh = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches, []);

  const skema = skemaKustom || MODE_PETA[mode] || MODE_PETA.status;

  const daftar = useMemo(
    () =>
      kavling
        .filter((k) => k.bentuk)
        .map((k) => {
          const titik = titikDari(k.bentuk);
          const { a, b } = ukuranDari(titik);
          return { k, titik, pusat: pusatDari(titik), sisiPendek: Math.min(a, b) || 10 };
        }),
    [kavling]
  );

  const kunci = useMemo(() => {
    const m = new Map();
    for (const { k } of daftar) m.set(k.id ?? k.unit_code ?? k.kode, skema.golongkan(k, sekarang));
    return m;
  }, [daftar, skema, sekarang]);

  const jumlah = useMemo(() => {
    const h = {};
    for (const v of kunci.values()) h[v] = (h[v] || 0) + 1;
    return h;
  }, [kunci]);

  const setTerpilih = useMemo(() => {
    if (!terpilih) return new Set();
    if (terpilih instanceof Set) return terpilih;
    return new Set([terpilih]);
  }, [terpilih]);

  // Datang dari notifikasi atau tautan: kavling yang dituju dibawa ke tengah.
  useEffect(() => {
    if (!fokus) return;
    const d = daftar.find(({ k }) => k.id === fokus);
    if (d) pandangan.fokusKe(d.pusat, Math.min(6, Math.max(2.5, lebar / (d.sisiPendek * 14))));
    // pandangan.fokusKe stabil per ukuran kanvas
  }, [fokus, daftar.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const skala = useSkalaLayar(svgRef, pandangan.viewBox);
  const idKavling = (k) => k.id ?? k.unit_code ?? k.kode;

  function bolehPilih(k) {
    if (!onPilih) return false;
    return bisaDipilih ? bisaDipilih(k) : true;
  }

  function pilih(k, e) {
    if (seret.baruDiseret()) return;
    if (bolehPilih(k)) onPilih(k, e);
  }

  const info = hover;
  const adaGambar = Boolean(siteplan?.gambar_url);

  return (
    <div>
      {(legenda || kontrol) && (
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 9, flexWrap: "wrap" }}>
          {legenda ? (
            <div role={onKategori ? "group" : undefined} aria-label={onKategori ? "Saring menurut kategori" : undefined} style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11.5, color: TEXT_MID }}>
              {skema.kategori
                .filter((c) => jumlah[c.key] || c.key === skema.kategori[0].key)
                .map((c) => {
                  const aktif = !kategoriAktif || kategoriAktif.has(c.key);
                  const isi = (
                    <>
                      <Swatch gaya={c.gaya} />
                      <b style={{ color: TEXT_DARK }}>{jumlah[c.key] || 0}</b> {c.label}
                    </>
                  );
                  return onKategori ? (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => onKategori(c.key)}
                      aria-pressed={Boolean(kategoriAktif?.has(c.key))}
                      title={kategoriAktif?.has(c.key) ? "Klik untuk menampilkan semua" : `Sorot hanya: ${c.label}`}
                      style={{ ...gayaChip, opacity: aktif ? 1 : 0.45, borderColor: kategoriAktif?.has(c.key) ? TEXT_DARK : BORDER }}
                    >
                      {isi}
                    </button>
                  ) : (
                    <span key={c.key} style={{ ...gayaChip, cursor: "default" }}>
                      {isi}
                    </span>
                  );
                })}
              {skema.sorot && skema.labelSorot && daftar.some(({ k }) => skema.sorot(k)) && (
                <span style={{ ...gayaChip, cursor: "default" }}>
                  <span aria-hidden="true" style={{ width: 12, height: 10, borderRadius: 3, border: `2px dashed ${ACCENT}`, display: "inline-block" }} />
                  {skema.labelSorot}
                </span>
              )}
            </div>
          ) : (
            <span />
          )}

          {kontrol && (
            <div style={{ display: "flex", gap: 5 }}>
              <button type="button" onClick={() => pandangan.zoomDi(1.35)} aria-label="Perbesar" title="Perbesar" style={gayaZoom}>
                <ZoomIn size={14} />
              </button>
              <button type="button" onClick={() => pandangan.zoomDi(1 / 1.35)} aria-label="Perkecil" title="Perkecil" style={gayaZoom}>
                <ZoomOut size={14} />
              </button>
              <button type="button" onClick={pandangan.reset} aria-label="Tampilkan seluruh siteplan" title="Tampilkan seluruh siteplan" style={gayaZoom}>
                <Maximize2 size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      <div
        ref={bingkai}
        {...seret.handlers}
        style={{
          position: "relative",
          // "auto": tinggi mengikuti rasio kanvas, dibatasi layar. Tinggi tetap
          // membuat denah yang lebar-pendek tenggelam dalam ruang kosong di ponsel.
          ...(tinggi === "auto"
            ? { aspectRatio: `${lebar} / ${tinggiKanvas}`, maxHeight: "min(66vh, 620px)", minHeight: 240, width: "100%" }
            : { height: tinggi }),
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          overflow: "hidden",
          background: "#FBFCFE",
          cursor: "grab",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <svg
          ref={svgRef}
          viewBox={pandangan.viewBox}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={ariaLabel || `Peta siteplan${siteplan?.nama ? ` ${siteplan.nama}` : ""}`}
          style={{ display: "block" }}
        >
          {adaGambar && (
            <image href={siteplan.gambar_url} x="0" y="0" width={lebar} height={tinggiKanvas} preserveAspectRatio="none" opacity="0.55" style={{ pointerEvents: "none" }} />
          )}

          {fasilitas.map((f, i) => {
            const t = titikDari(f.bentuk);
            if (t.length < 3) return null;
            const gf = GAYA_FASILITAS[f.jenis] || GAYA_FASILITAS.fasum;
            const [cx, cy] = pusatDari(t);
            const { a, b } = ukuranDari(t);
            const font = Math.max(4, Math.min(a, b) * 0.32);
            return (
              <g key={f.id || i} style={{ pointerEvents: "none" }}>
                <polygon points={f.bentuk} fill={gf.isi} stroke={gf.garis} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
                {font * skala >= 7 && (
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" style={{ font: `600 ${font}px system-ui, sans-serif`, fill: gf.teks }}>
                    {f.label}
                  </text>
                )}
              </g>
            );
          })}

          {daftar.map(({ k, titik, pusat, sisiPendek }) => {
            const id = idKavling(k);
            const key = kunci.get(id);
            const gaya = skema.kategori.find((c) => c.key === key)?.gaya || skema.kategori[0].gaya;
            const bisa = bolehPilih(k);
            const dipilih = setTerpilih.has(id);
            const pudar = (kategoriAktif && !kategoriAktif.has(key)) || (redup && redup(k));
            const sorot = skema.sorot && skema.sorot(k);
            const font = Math.max(3, sisiPendek * 0.34);
            const tampilLabel = font * skala >= 8;
            const tanda = lencana ? lencana(k) : null;
            return (
              <g key={id} opacity={pudar ? 0.22 : 1}>
                <polygon
                  points={k.bentuk}
                  fill={gaya.isi}
                  fillOpacity={adaGambar ? 0.85 : 1}
                  stroke={sorot ? ACCENT : gaya.garis}
                  strokeWidth={sorot ? 2 : hover && idKavling(hover.k) === id ? 1.8 : 0.9}
                  strokeDasharray={sorot || gaya.putus ? "4 2.5" : undefined}
                  vectorEffect="non-scaling-stroke"
                  role={bisa ? "button" : undefined}
                  tabIndex={bisa ? 0 : undefined}
                  aria-label={`Kavling ${k.unit_code || k.kode}, ${skema.kategori.find((c) => c.key === key)?.label || key}`}
                  aria-pressed={bisa ? dipilih : undefined}
                  onMouseEnter={() => setHover({ k, titik })}
                  onMouseLeave={() => setHover((v) => (v && idKavling(v.k) === id ? null : v))}
                  onFocus={() => setHover({ k, titik })}
                  onBlur={() => setHover((v) => (v && idKavling(v.k) === id ? null : v))}
                  onClick={(e) => pilih(k, e)}
                  onKeyDown={(e) => {
                    if (bisa && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onPilih(k, e);
                    }
                  }}
                  style={{ cursor: bisa ? "pointer" : "inherit", outline: "none" }}
                />
                {tampilLabel && (
                  <text
                    x={pusat[0]}
                    y={pusat[1]}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ font: `600 ${font}px system-ui, sans-serif`, fill: gaya.teks, pointerEvents: "none" }}
                  >
                    {k.unit_code || k.kode}
                  </text>
                )}
                {tanda != null && (
                  <g style={{ pointerEvents: "none" }}>
                    <circle cx={pusat[0] + sisiPendek * 0.28} cy={pusat[1] - sisiPendek * 0.3} r={Math.max(2.4, sisiPendek * 0.2)} fill={TEXT_DARK} stroke="#fff" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                    {sisiPendek * 0.2 * skala >= 5 && (
                      <text
                        x={pusat[0] + sisiPendek * 0.28}
                        y={pusat[1] - sisiPendek * 0.3}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{ font: `700 ${Math.max(2.4, sisiPendek * 0.2) * 1.1}px system-ui, sans-serif`, fill: "#fff" }}
                      >
                        {tanda}
                      </text>
                    )}
                  </g>
                )}
              </g>
            );
          })}

          {/* Kavling terpilih digambar ulang paling atas: garis tebalnya tidak
              boleh tertutup kavling tetangga yang digambar sesudahnya. */}
          {daftar
            .filter(({ k }) => setTerpilih.has(idKavling(k)))
            .map(({ k }) => (
              <polygon key={`p-${idKavling(k)}`} points={k.bentuk} fill="none" stroke="#111B2E" strokeWidth={2.6} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
            ))}
        </svg>

        {info && (
          <div
            style={{
              position: "absolute",
              left: 10,
              bottom: 10,
              background: "rgba(17,27,46,0.94)",
              color: "#fff",
              borderRadius: 10,
              padding: "9px 13px",
              fontSize: 12,
              lineHeight: 1.55,
              pointerEvents: "none",
              maxWidth: "min(340px, 72%)",
            }}
          >
            {tooltip ? tooltip(info.k) : <InfoBawaan k={info.k} label={skema.kategori.find((c) => c.key === kunci.get(idKavling(info.k)))?.label} sekarang={sekarang} />}
          </div>
        )}

        {children}

        <div style={{ position: "absolute", right: 10, bottom: 8, fontSize: 10.5, color: TEXT_MID, pointerEvents: "none", background: "rgba(251,252,254,0.85)", borderRadius: 6, padding: "1px 6px" }}>
          {sentuh ? "Geser dengan satu jari · cubit untuk memperbesar" : "Seret untuk menggeser · ⌘/Ctrl + gulir untuk memperbesar"}
        </div>
      </div>
    </div>
  );
}

function InfoBawaan({ k, label, sekarang }) {
  const hold = holdAktif(k, sekarang);
  return (
    <>
      <b style={{ fontSize: 13 }}>{k.unit_code || k.kode}</b>
      {(k.block || k.blok) && <span style={{ opacity: 0.85 }}> · Blok {k.block || k.blok}</span>}
      {label && <span style={{ opacity: 0.85 }}> · {label}</span>}
      {atributRingkas(k) && <div style={{ opacity: 0.9 }}>{atributRingkas(k)}</div>}
      {k.price && statusJual(k, sekarang) !== "terjual" && <div style={{ opacity: 0.9 }}>{rupiah(k.price)}</div>}
      {k.konsumen?.nama && <div style={{ opacity: 0.9 }}>Konsumen: {k.konsumen.nama}</div>}
      {hold && <div style={{ opacity: 0.9 }}>Ditahan · sisa {sisaWaktu(hold.berakhir, sekarang)}</div>}
    </>
  );
}

/** Sampel warna legenda: isi + garis, persis seperti kavling di peta. */
export function Swatch({ gaya, ukuran = 11 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: ukuran,
        height: ukuran,
        borderRadius: 3,
        background: gaya.isi,
        border: `1.5px ${gaya.putus ? "dashed" : "solid"} ${gaya.garis}`,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

const gayaChip = {
  font: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "3px 9px",
  borderRadius: 999,
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  fontSize: 11.5,
  color: TEXT_MID,
  cursor: "pointer",
};

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
