import React, { useMemo, useState } from "react";
import { MessageCircle, X, Check } from "lucide-react";
import SiteplanVektor from "../SiteplanVektor";
import SimulasiKpr from "./SimulasiKpr";
import { STATUS_PUBLIK, POSISI, atributRingkas, labelPosisi, labelHadap, urutKode } from "../../lib/siteplan";
import { rupiah, rupiahSingkat, nomorWa } from "../../lib/format";
import { BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, POSITIVE } from "../ui";

const SKEMA_PUBLIK = {
  kategori: STATUS_PUBLIK,
  golongkan: (k) => k.status_publik,
};

/**
 * Siteplan seperti dilihat calon pembeli — dipakai mode Presentasi di kantor
 * dan halaman publik tanpa login, supaya yang ditunjukkan sales di meja sama
 * persis dengan yang dibuka pembeli di rumah.
 *
 * Kavling yang diterima sudah "versi publik": { id, unit_code, block, type,
 * price, status_publik, luas_tanah, luas_bangunan, posisi, hadap, bentuk }.
 * Tidak ada konsumen, sales, atau hold di sini.
 */
export default function PenjelajahSiteplan({ siteplan, proyek, kavling, fasilitas, kontakWa, tinggiPeta = "auto", tampilHarga = true }) {
  const [terpilih, setTerpilih] = useState(null);
  const [tipe, setTipe] = useState("");
  const [posisi, setPosisi] = useState("");
  const [hanyaTersedia, setHanyaTersedia] = useState(false);
  const [fokus, setFokus] = useState(null);

  const daftarTipe = useMemo(() => [...new Set(kavling.map((k) => k.type).filter(Boolean))].sort(urutKode), [kavling]);
  const adaPosisi = useMemo(() => POSISI.filter((p) => p.value !== "standar" && kavling.some((k) => k.posisi === p.value)), [kavling]);

  const cocok = (k) => (!tipe || k.type === tipe) && (!posisi || k.posisi === posisi) && (!hanyaTersedia || k.status_publik === "tersedia");
  const tersedia = kavling.filter((k) => k.status_publik === "tersedia" && cocok(k)).sort((a, b) => urutKode(a.unit_code, b.unit_code));
  const k = terpilih ? kavling.find((x) => x.id === terpilih) : null;
  const wa = nomorWa(kontakWa);

  function pilih(x) {
    setTerpilih(x.id);
  }

  function tanyaWa(x) {
    const pesan = `Halo, saya tertarik dengan unit ${x.unit_code} di ${[proyek, siteplan?.nama].filter(Boolean).join(" ")}. ${atributRingkas(x)}. Apakah masih tersedia?`;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(pesan)}`, "_blank", "noopener");
  }

  return (
    <div className="sp-jelajah">
      <div style={{ minWidth: 0 }}>
        <div role="group" aria-label="Saring kavling" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <Chip aktif={!tipe} onClick={() => setTipe("")}>
            Semua tipe
          </Chip>
          {daftarTipe.map((t) => (
            <Chip key={t} aktif={tipe === t} onClick={() => setTipe(tipe === t ? "" : t)}>
              Tipe {t}
            </Chip>
          ))}
          {adaPosisi.map((p) => (
            <Chip key={p.value} aktif={posisi === p.value} onClick={() => setPosisi(posisi === p.value ? "" : p.value)}>
              {p.label}
            </Chip>
          ))}
          <Chip aktif={hanyaTersedia} onClick={() => setHanyaTersedia((v) => !v)}>
            {hanyaTersedia && <Check size={12} aria-hidden="true" />} Hanya tersedia
          </Chip>
        </div>

        <SiteplanVektor
          siteplan={siteplan}
          kavling={kavling}
          fasilitas={fasilitas}
          skema={SKEMA_PUBLIK}
          terpilih={terpilih}
          onPilih={pilih}
          redup={(x) => !cocok(x)}
          fokus={fokus}
          tinggi={tinggiPeta}
          tooltip={(x) => (
            <>
              <b style={{ fontSize: 13 }}>{x.unit_code}</b>
              <span style={{ opacity: 0.85 }}> · {STATUS_PUBLIK.find((s) => s.key === x.status_publik)?.label}</span>
              {atributRingkas(x) && <div style={{ opacity: 0.9 }}>{atributRingkas(x)}</div>}
              {tampilHarga && x.status_publik === "tersedia" && x.price && <div style={{ opacity: 0.9 }}>{rupiah(x.price)}</div>}
            </>
          )}
        />
      </div>

      <aside aria-live="polite" style={{ minWidth: 0 }}>
        {k ? (
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 18, padding: 18, background: SURFACE }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: TEXT_DARK }}>Unit {k.unit_code}</div>
                <div style={{ fontSize: 12.5, color: TEXT_MID }}>{[k.block && `Blok ${k.block}`, k.type && `Tipe ${k.type}`].filter(Boolean).join(" · ")}</div>
              </div>
              <button type="button" onClick={() => setTerpilih(null)} aria-label="Tutup detail unit" style={{ border: "none", background: "none", color: TEXT_MID, cursor: "pointer", padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <StatusPil status={k.status_publik} />

            {tampilHarga && k.status_publik === "tersedia" && k.price && <div style={{ fontSize: 24, fontWeight: 700, color: TEXT_DARK, margin: "12px 0 4px", letterSpacing: "-0.02em" }}>{rupiah(k.price)}</div>}

            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", fontSize: 13, margin: "12px 0 14px" }}>
              {k.luas_tanah && <Baris label="Luas tanah" nilai={`${Number(k.luas_tanah).toLocaleString("id-ID")} m²`} />}
              {k.luas_bangunan && <Baris label="Luas bangunan" nilai={`${Number(k.luas_bangunan).toLocaleString("id-ID")} m²`} />}
              {k.posisi && <Baris label="Posisi" nilai={labelPosisi(k.posisi)} />}
              {k.hadap && <Baris label="Hadap" nilai={labelHadap(k.hadap)} />}
            </dl>

            {k.status_publik === "tersedia" && tampilHarga && k.price && <SimulasiKpr harga={k.price} ringkas />}

            {wa && k.status_publik === "tersedia" && (
              <button
                type="button"
                onClick={() => tanyaWa(k)}
                style={{ font: "inherit", marginTop: 12, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 16px", borderRadius: 999, border: "none", background: POSITIVE, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                <MessageCircle size={17} /> Tanya unit ini via WhatsApp
              </button>
            )}
          </div>
        ) : (
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 18, padding: 16, background: SURFACE }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_DARK, marginBottom: 2 }}>{tersedia.length} unit tersedia</div>
            <div style={{ fontSize: 12, color: TEXT_MID, marginBottom: 10 }}>Pilih kavling di peta atau dari daftar ini.</div>
            <div style={{ maxHeight: "min(52vh, 480px)", overflowY: "auto", margin: "0 -6px" }}>
              {tersedia.length === 0 && <div style={{ fontSize: 12.5, color: TEXT_MID, padding: "6px" }}>Tidak ada unit tersedia yang cocok dengan saringan.</div>}
              {tersedia.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => {
                    setTerpilih(x.id);
                    setFokus(null);
                    setTimeout(() => setFokus(x.id), 0);
                  }}
                  className="sp-baris"
                  style={{ font: "inherit", display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: "none", borderRadius: 10, background: "none", padding: "8px 6px", cursor: "pointer" }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: TEXT_DARK, minWidth: 46 }}>{x.unit_code}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: TEXT_MID, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{atributRingkas(x) || "-"}</span>
                  {tampilHarga && x.price && <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT_DARK, whiteSpace: "nowrap" }}>{rupiahSingkat(x.price)}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function StatusPil({ status }) {
  const s = STATUS_PUBLIK.find((x) => x.key === status);
  if (!s) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12, fontWeight: 600, color: TEXT_DARK, border: `1px solid ${BORDER}`, borderRadius: 999, padding: "3px 10px" }}>
      <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: s.gaya.isi, border: `1.5px solid ${s.gaya.garis}` }} />
      {s.label}
    </span>
  );
}

function Baris({ label, nilai }) {
  return (
    <>
      <dt style={{ color: TEXT_MID }}>{label}</dt>
      <dd style={{ margin: 0, color: TEXT_DARK, fontWeight: 600 }}>{nilai}</dd>
    </>
  );
}

function Chip({ aktif, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktif}
      style={{
        font: "inherit",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "6px 12px",
        borderRadius: 999,
        border: `1px solid ${aktif ? PRIMARY : BORDER}`,
        background: aktif ? PRIMARY_SOFT : SURFACE,
        color: aktif ? PRIMARY : TEXT_MID,
        fontSize: 12.5,
        fontWeight: aktif ? 600 : 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
