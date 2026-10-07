import React, { useMemo, useState } from "react";
import { AlertTriangle, Clock, Flame, Wallet, FileWarning, HardHat, ChevronDown } from "lucide-react";
import { rupiah, rupiahSingkat, selisihHari } from "../../lib/format";
import { statusJual, holdAktif, sisaWaktu, kelompokkan, urutKode } from "../../lib/siteplan";
import { Card, BarChart, BORDER, BORDER_SOFT, SURFACE, TEXT_MID, TEXT_DARK, ACCENT_SOFT, ACCENT_DARK, PRIMARY, PRIMARY_SOFT } from "../ui";

/* Warna tanda untuk grafik stok — divalidasi validator palet dataviz
   (urutan bersebelahan lolos CVD dan normal-vision), dan sekeluarga dengan
   warna kavling di peta: hijau tersedia, ungu ditahan, oranye booking, biru
   terjual. */
const WARNA_STOK = [
  { key: "tersedia", label: "Tersedia", warna: "#15803D" },
  { key: "ditahan", label: "Ditahan", warna: "#8256B8" },
  { key: "booking", label: "Booking", warna: "#E2571F" },
  { key: "terjual", label: "Terjual", warna: "#2B5CA8" },
];

const KARTU = { borderColor: BORDER_SOFT };

function Judul({ judul, keterangan }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
      <span style={{ fontSize: 14.5, fontWeight: 600, color: TEXT_DARK }}>{judul}</span>
      {keterangan && <span style={{ fontSize: 12, color: TEXT_MID }}>{keterangan}</span>}
    </div>
  );
}

/* ============================================================
   Angka utama
   ============================================================ */

function Angka({ label, value, sub }) {
  return (
    <Card style={{ ...KARTU, padding: "16px 18px" }}>
      <div style={{ fontSize: 12.5, color: TEXT_MID, marginBottom: 7 }}>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: "-0.02em", color: TEXT_DARK, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 7, lineHeight: 1.4 }}>{sub}</div>}
    </Card>
  );
}

export function KpiSiteplan({ r, laju }) {
  const rata = Number(laju?.rata_per_bulan) || 0;
  const sisaBulan = rata > 0 ? (r.tersedia + r.ditahan) / rata : null;
  return (
    <div className="sp-kpi">
      <Angka label="Tersedia" value={r.tersedia} sub={`dari ${r.total} kavling · stok ${rupiahSingkat(r.nilaiStok, { kosong: "Rp0" })}`} />
      <Angka label="Ditahan" value={r.ditahan} sub={r.ditahan ? "hold aktif, menunggu booking" : "tidak ada hold aktif"} />
      <Angka label="Terjual" value={r.laku} sub={`${Math.round(r.terserap * 100)}% terserap · ${r.booking} masih booking`} />
      <Angka label="Nilai penjualan" value={rupiahSingkat(r.nilaiTerjual, { kosong: "Rp0" })} sub="harga kavling booking + terjual" />
      <Angka
        label="Laju penjualan"
        value={laju ? `${rata.toLocaleString("id-ID")}/bln` : "–"}
        sub={laju ? (sisaBulan !== null ? `stok habis ±${sisaBulan < 1 ? "<1" : Math.round(sisaBulan)} bulan lagi` : "belum ada booking 90 hari terakhir") : "rata-rata 90 hari"}
      />
    </div>
  );
}

/* ============================================================
   Perlu perhatian
   ============================================================ */

const IKON = { hold: Clock, panas: Flame, verifikasi: Wallet, bayar: Wallet, sp3k: FileWarning, bangun: HardHat };

/**
 * Pekerjaan yang terlihat dari peta tetapi mudah terlewat dari tabel:
 * hold yang hampir habis, kavling yang diperebutkan tanpa ada yang menahan,
 * booking fee yang belum masuk, SP3K yang hampir kedaluwarsa, bangunan
 * terlambat. Diklik → kavlingnya terbuka.
 */
export function daftarPerhatian(kavling, sekarang) {
  const hasil = [];
  for (const k of kavling) {
    const hold = holdAktif(k, sekarang);
    if (hold) {
      const jam = (new Date(hold.berakhir).getTime() - sekarang) / 3600000;
      if (jam <= 12) hasil.push({ k, jenis: "hold", mendesak: jam <= 3, teks: `Hold berakhir ${sisaWaktu(hold.berakhir, sekarang)} lagi`, rinci: hold.lead_nama ? `untuk ${hold.lead_nama}` : `oleh ${hold.penahan || "tim"}` });
    }
    if (statusJual(k, sekarang) === "tersedia" && Number(k.minat) >= 2) {
      hasil.push({ k, jenis: "panas", mendesak: Number(k.minat) >= 3, teks: `Diminati ${k.minat} prospek, belum ada yang menahan`, rinci: "tawarkan sekarang" });
    }
    if (Number(k.bayar?.menunggu_verifikasi) > 0) {
      hasil.push({ k, jenis: "verifikasi", mendesak: false, teks: "Pembayaran menunggu verifikasi Finance", rinci: k.konsumen?.nama });
    }
    if (k.konsumen && k.bayar && !k.bayar.booking_terverifikasi && k.kpr?.tanggal_booking) {
      const hari = -selisihHari(k.kpr.tanggal_booking);
      if (hari >= 7) hasil.push({ k, jenis: "bayar", mendesak: hari >= 14, teks: `Booking fee belum terverifikasi ${hari} hari`, rinci: k.konsumen.nama });
    }
    if (k.kpr?.tanggal_sp3k_expired && !k.kpr.tanggal_akad) {
      const sisa = selisihHari(k.kpr.tanggal_sp3k_expired);
      if (sisa <= 14) hasil.push({ k, jenis: "sp3k", mendesak: sisa <= 7, teks: sisa < 0 ? `SP3K kedaluwarsa ${-sisa} hari lalu` : `SP3K kedaluwarsa dalam ${sisa} hari`, rinci: k.konsumen?.nama });
    }
    if (k.progres?.status === "terlambat") {
      hasil.push({ k, jenis: "bangun", mendesak: false, teks: `Pembangunan terlambat (${Number(k.progres.persen) || 0}%)`, rinci: k.progres.target ? `target lewat` : null });
    }
  }
  return hasil.sort((a, b) => Number(b.mendesak) - Number(a.mendesak) || urutKode(a.k.unit_code, b.k.unit_code));
}

export function PerluPerhatian({ items, onPilih }) {
  const [semua, setSemua] = useState(false);
  const tampil = semua ? items : items.slice(0, 6);
  return (
    <Card style={KARTU}>
      <Judul judul="Perlu perhatian" keterangan={items.length ? `${items.length} hal` : null} />
      {items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: TEXT_MID, lineHeight: 1.55 }}>Tidak ada hold yang hampir habis, pembayaran tertunda, atau bangunan terlambat di siteplan ini.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {tampil.map((it, i) => {
            const Ikon = IKON[it.jenis] || AlertTriangle;
            return (
              <button
                key={`${it.jenis}-${it.k.id}`}
                type="button"
                onClick={() => onPilih(it.k)}
                className="sp-baris"
                style={{
                  font: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  borderTop: i === 0 ? "none" : `1px solid ${BORDER_SOFT}`,
                  background: "none",
                  padding: "9px 4px",
                  cursor: "pointer",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: it.mendesak ? ACCENT_SOFT : PRIMARY_SOFT, color: it.mendesak ? ACCENT_DARK : PRIMARY }}
                >
                  <Ikon size={15} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, color: TEXT_DARK, lineHeight: 1.35 }}>
                    <b>{it.k.unit_code}</b> · {it.teks}
                  </span>
                  {it.rinci && <span style={{ display: "block", fontSize: 11.5, color: TEXT_MID }}>{it.rinci}</span>}
                </span>
              </button>
            );
          })}
          {items.length > 6 && (
            <button type="button" onClick={() => setSemua((v) => !v)} style={{ font: "inherit", border: "none", background: "none", color: PRIMARY, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "8px 4px 0", display: "inline-flex", alignItems: "center", gap: 4, alignSelf: "flex-start" }}>
              {semua ? "Ringkas" : `Tampilkan ${items.length - 6} lainnya`}
              <ChevronDown size={13} style={{ transform: semua ? "rotate(180deg)" : "none" }} />
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

/* ============================================================
   Stok per tipe dan per blok
   ============================================================ */

export function StokPerTipe({ kavling, sekarang }) {
  const baris = useMemo(() => kelompokkan(kavling, "tipe", sekarang), [kavling, sekarang]);
  if (!baris.length) return null;
  return (
    <Card style={KARTU}>
      <Judul judul="Stok per tipe" />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ color: TEXT_MID, textAlign: "left" }}>
              <th style={th}>Tipe</th>
              <th style={{ ...th, textAlign: "right" }} title="Tersedia + ditahan">Sisa</th>
              <th style={{ ...th, textAlign: "right" }} title="Booking + terjual">Laku</th>
              <th style={{ ...th, textAlign: "right" }} title="Harga unit yang masih tersedia">Harga</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((r) => (
              <tr key={r.nama} style={{ borderTop: `1px solid ${BORDER_SOFT}` }}>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <b style={{ color: TEXT_DARK, display: "block" }}>{r.nama}</b>
                  <span style={{ fontSize: 11, color: TEXT_MID }}>{r.total} unit</span>
                </td>
                <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: TEXT_DARK, fontWeight: 600 }}>{r.tersedia + r.ditahan}</td>
                <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.booking + r.terjual}</td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }} title={r.hargaMin === null ? undefined : `${rupiah(r.hargaMin)} – ${rupiah(r.hargaMaks)}`}>
                  {rentangHarga(r.hargaMin, r.hargaMaks)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** "Rp166–178 jt" — satu satuan di belakang supaya muat di kolom sempit. */
function rentangHarga(min, maks) {
  if (min === null) return "-";
  if (min === maks) return rupiahSingkat(min);
  const a = rupiahSingkat(min);
  const b = rupiahSingkat(maks);
  const satuan = a.split(" ")[1];
  return satuan && satuan === b.split(" ")[1] ? `${a.split(" ")[0]}–${b.replace("Rp", "")}` : `${a}–${b.replace("Rp", "")}`;
}

/**
 * Stok per blok sebagai batang bertumpuk horizontal. Celah 2px warna
 * permukaan memisahkan segmen; ujung data membulat 4px; label hanya di ujung
 * batang (sisa tersedia) — angka per segmen ada di tooltip dan tabel.
 */
export function StokPerBlok({ kavling, sekarang, onBlok }) {
  const baris = useMemo(() => kelompokkan(kavling, "blok", sekarang), [kavling, sekarang]);
  const maks = Math.max(1, ...baris.map((r) => r.total));
  if (baris.length < 2) return null;
  return (
    <Card style={KARTU}>
      <Judul judul="Stok per blok" keterangan="klik blok untuk menyorot di peta" />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12, fontSize: 11.5, color: TEXT_MID }}>
        {WARNA_STOK.map((w) => (
          <span key={w.key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 2, background: w.warna }} />
            {w.label}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {baris.map((r) => (
          <button
            key={r.nama}
            type="button"
            onClick={() => onBlok?.(r.nama)}
            className="sp-baris"
            aria-label={`Blok ${r.nama}: ${r.tersedia} tersedia, ${r.ditahan} ditahan, ${r.booking} booking, ${r.terjual} terjual dari ${r.total}`}
            style={{ font: "inherit", display: "grid", gridTemplateColumns: "54px 1fr 74px", alignItems: "center", gap: 10, border: "none", background: "none", padding: "2px 4px", borderRadius: 8, cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT_DARK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.nama}</span>
            <span style={{ display: "flex", gap: 2, height: 14, width: `${(r.total / maks) * 100}%`, minWidth: 6 }}>
              {WARNA_STOK.filter((w) => r[w.key] > 0).map((w, i, arr) => (
                <span
                  key={w.key}
                  title={`${w.label}: ${r[w.key]}`}
                  style={{
                    flex: r[w.key],
                    background: w.warna,
                    borderRadius: i === arr.length - 1 ? (arr.length === 1 ? 4 : "0 4px 4px 0") : i === 0 ? "4px 0 0 4px" : 0,
                  }}
                />
              ))}
            </span>
            <span style={{ fontSize: 11.5, color: TEXT_MID, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
              {r.tersedia}/{r.total} sisa
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ============================================================
   Laju penjualan
   ============================================================ */

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function LajuPenjualan({ laju }) {
  if (!laju?.per_bulan?.length) return null;
  const data = laju.per_bulan.map((b) => ({ label: BULAN[new Date(`${b.bulan}T00:00:00`).getMonth()], value: Number(b.jumlah) || 0 }));
  const kosong = data.every((d) => d.value === 0);
  return (
    <Card style={KARTU}>
      <Judul judul="Booking per bulan" keterangan={kosong ? "6 bulan terakhir" : `rata-rata ${Number(laju.rata_per_bulan || 0).toLocaleString("id-ID")} unit/bulan (90 hari)`} />
      {/* Enam batang nol bukan grafik — itu kalimat yang menyamar. */}
      {kosong ? (
        <div style={{ fontSize: 12.5, color: TEXT_MID, lineHeight: 1.55 }}>Belum ada booking di siteplan ini dalam enam bulan terakhir.</div>
      ) : (
        <BarChart data={data} highlightIndex={data.length - 1} height={150} />
      )}
    </Card>
  );
}

/* ============================================================
   Perbandingan antar siteplan
   ============================================================ */

export function PerbandinganSiteplan({ baris, aktifId, onPilih }) {
  if (baris.length < 2) return null;
  return (
    <Card style={KARTU}>
      <Judul judul="Perbandingan siteplan" keterangan="semua proyek" />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 560 }}>
          <thead>
            <tr style={{ color: TEXT_MID, textAlign: "left" }}>
              <th style={th}>Siteplan</th>
              <th style={{ ...th, width: "32%" }}>Komposisi</th>
              <th style={{ ...th, textAlign: "right" }}>Tersedia</th>
              <th style={{ ...th, textAlign: "right" }}>Terserap</th>
              <th style={{ ...th, textAlign: "right" }}>Nilai stok</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((r) => {
              const aktif = r.id === aktifId;
              return (
                <tr
                  key={r.id}
                  onClick={() => onPilih(r.id)}
                  className="dt-row-klik"
                  style={{ borderTop: `1px solid ${BORDER_SOFT}`, cursor: "pointer", background: aktif ? "#F8FAFD" : undefined }}
                >
                  <td style={td}>
                    <b style={{ color: TEXT_DARK }}>{r.nama}</b>
                    <div style={{ fontSize: 11.5, color: TEXT_MID }}>{r.proyek}</div>
                  </td>
                  <td style={td}>
                    <span style={{ display: "flex", gap: 2, height: 10 }} aria-label={`${r.tersedia} tersedia, ${r.booking} booking, ${r.terjual} terjual`}>
                      {[
                        ["tersedia", "#15803D"],
                        ["booking", "#E2571F"],
                        ["terjual", "#2B5CA8"],
                      ]
                        .filter(([key]) => r[key] > 0)
                        .map(([key, warna], i, arr) => (
                          <span
                            key={key}
                            title={`${key}: ${r[key]}`}
                            style={{ flex: r[key], background: warna, borderRadius: arr.length === 1 ? 4 : i === 0 ? "4px 0 0 4px" : i === arr.length - 1 ? "0 4px 4px 0" : 0 }}
                          />
                        ))}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: TEXT_DARK }}>
                    {r.tersedia}
                    <span style={{ color: TEXT_MID, fontWeight: 400 }}>/{r.total}</span>
                  </td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.total ? Math.round(((r.booking + r.terjual) / r.total) * 100) : 0}%</td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }} title={rupiah(r.nilaiStok)}>
                    {rupiahSingkat(r.nilaiStok, { kosong: "Rp0" })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const th = { padding: "6px 8px", fontWeight: 500, fontSize: 11.5, whiteSpace: "nowrap", borderBottom: `1px solid ${BORDER}`, background: SURFACE };
const td = { padding: "9px 8px", color: TEXT_MID };
