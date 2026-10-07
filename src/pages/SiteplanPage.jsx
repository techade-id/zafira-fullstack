import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Map as MapIcon, Presentation, Share2, Pencil, Plus, Settings2, RefreshCw, Search, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { canWrite, roleOf } from "../lib/permissions";
import { fetchAllRows } from "../lib/fetchAllRows";
import { useDaftarSiteplan, usePetaSiteplan, useSekarang } from "../lib/useSiteplan";
import { MODE_PETA, URUTAN_MODE, POSISI, ringkasKavling, statusJual, urutKode } from "../lib/siteplan";
import { rupiahSingkat } from "../lib/format";
import SiteplanVektor from "../components/SiteplanVektor";
import PanelKavling from "../components/siteplan/PanelKavling";
import { KpiSiteplan, PerluPerhatian, StokPerTipe, StokPerBlok, LajuPenjualan, PerbandinganSiteplan, daftarPerhatian } from "../components/siteplan/RingkasanSiteplan";
import ModalSiteplan from "../components/siteplan/ModalSiteplan";
import BagikanSiteplan from "../components/siteplan/BagikanSiteplan";
import PresentasiSiteplan from "../components/siteplan/PresentasiSiteplan";
import EditorSiteplan from "../components/siteplan/EditorSiteplan";
import KonversiBookingModal from "../components/KonversiBookingModal";
import { Card, PageTitle, EmptyState, PrimaryButton, BORDER, BORDER_SOFT, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, NEGATIVE } from "../components/ui";

/**
 * Siteplan — pusat visual penjualan.
 *
 * Satu peta menjawab pertanyaan yang biasanya tersebar di lima halaman: unit
 * mana yang masih bisa dijual, mana yang sedang dijanjikan ke siapa, mana yang
 * diperebutkan, mana yang tersendat di bank, mana yang belum membayar, dan
 * mana yang bangunannya terlambat. Mode peta mengganti pertanyaannya; datanya
 * tetap satu (siteplan_peta, migrasi 022).
 *
 * Menu lama "Siteplan Digital" tetap ada di grup Proyek dan membaca data yang
 * sama — keduanya tidak mungkin berbeda isi.
 */

/** Mode bawaan per peran: tiap orang membuka peta pada pertanyaannya sendiri. */
const MODE_PERAN = { finance: "bayar", tim_lapangan: "progres" };

const SARING_KOSONG = { tipe: "", posisi: "", hargaMaks: "", blok: "", cari: "" };

export default function SiteplanPage() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const sekarang = useSekarang();
  const daftar = useDaftarSiteplan();
  const bisaAtur = canWrite(profile, "siteplan");

  const [ringkasUnit, setRingkasUnit] = useState([]);
  const [mode, setMode] = useState(() => (MODE_PETA[params.get("mode")] ? params.get("mode") : MODE_PERAN[roleOf(profile)] || "status"));
  const [kategori, setKategori] = useState(null);
  const [saring, setSaring] = useState(SARING_KOSONG);
  const [panelId, setPanelId] = useState(params.get("unit"));
  const [fokus, setFokus] = useState(params.get("unit"));
  const [editor, setEditor] = useState(null);
  const [presentasi, setPresentasi] = useState(false);
  const [bagikan, setBagikan] = useState(false);
  const [modalSp, setModalSp] = useState(null);
  const [booking, setBooking] = useState(null);
  const [laju, setLaju] = useState(null);

  /* ---------------- pilihan proyek & siteplan ---------------- */

  const { proyek, siteplans } = daftar;
  const spParam = params.get("sp");
  const dariParam = siteplans.find((s) => s.id === spParam);
  const proyekId =
    params.get("p") ||
    dariParam?.project_id ||
    siteplans[0]?.project_id ||
    proyek[0]?.id ||
    null;
  const siteplanProyek = siteplans.filter((s) => s.project_id === proyekId);
  const aktif = siteplanProyek.find((s) => s.id === spParam) || siteplanProyek[0] || null;
  const proyekAktif = proyek.find((p) => p.id === proyekId) || null;

  const peta = usePetaSiteplan(aktif?.id);
  const kavling = peta.kavling;

  function pilihSiteplan(id, projectId = proyekId) {
    const baru = new URLSearchParams();
    if (projectId) baru.set("p", projectId);
    if (id) baru.set("sp", id);
    if (mode !== (MODE_PERAN[roleOf(profile)] || "status")) baru.set("mode", mode);
    setParams(baru, { replace: true });
  }

  // Ganti siteplan: saringan dan sorotan milik siteplan lama dibuang. Panel
  // tidak perlu ditutup di sini — ia hanya terbuka bila kavlingnya ada di
  // siteplan aktif, dan menutupnya di sini justru membatalkan tautan
  // ?sorot= dari notifikasi sebelum kavlingnya selesai dimuat.
  useEffect(() => {
    setKategori(null);
    setSaring(SARING_KOSONG);
  }, [aktif?.id]);

  /* ---------------- ?sorot=<unit> dari notifikasi ---------------- */

  const sorot = params.get("sorot");
  useEffect(() => {
    if (!sorot) return;
    supabase
      .from("units")
      .select("id, siteplan_id, project_id")
      .eq("id", sorot)
      .maybeSingle()
      .then(({ data }) => {
        const baru = new URLSearchParams();
        if (data?.siteplan_id) {
          baru.set("p", data.project_id);
          baru.set("sp", data.siteplan_id);
          setPanelId(data.id);
          setFokus(data.id);
        }
        setParams(baru, { replace: true });
      });
  }, [sorot]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- ringkasan lintas siteplan & laju ---------------- */

  const muatRingkas = useCallback(async () => {
    const { data } = await fetchAllRows(() => supabase.from("units").select("id, siteplan_id, status, price").not("siteplan_id", "is", null).not("bentuk", "is", null));
    setRingkasUnit(data || []);
  }, []);

  const muatLaju = useCallback(async () => {
    if (!aktif?.id) return setLaju(null);
    const { data } = await supabase.rpc("siteplan_penjualan_bulanan", { p_siteplan_id: aktif.id, p_bulan: 6 });
    setLaju(data || null);
  }, [aktif?.id]);

  useEffect(() => {
    muatRingkas();
  }, [muatRingkas]);

  useEffect(() => {
    muatLaju();
  }, [muatLaju]);

  const muatSemua = useCallback(async () => {
    await Promise.all([peta.muatUlang(), muatRingkas(), muatLaju()]);
  }, [peta.muatUlang, muatRingkas, muatLaju]); // eslint-disable-line react-hooks/exhaustive-deps

  const perSiteplan = useMemo(() => {
    const m = new Map();
    for (const u of ringkasUnit) {
      if (!m.has(u.siteplan_id)) m.set(u.siteplan_id, { total: 0, tersedia: 0, booking: 0, terjual: 0, nilaiStok: 0 });
      const r = m.get(u.siteplan_id);
      r.total += 1;
      r[u.status] = (r[u.status] || 0) + 1;
      if (u.status === "tersedia") r.nilaiStok += Number(u.price) || 0;
    }
    return m;
  }, [ringkasUnit]);

  const barisBanding = useMemo(
    () =>
      siteplans.map((s) => ({
        id: s.id,
        nama: s.nama,
        proyek: proyek.find((p) => p.id === s.project_id)?.name || "",
        ...(perSiteplan.get(s.id) || { total: 0, tersedia: 0, booking: 0, terjual: 0, nilaiStok: 0 }),
      })),
    [siteplans, proyek, perSiteplan]
  );

  /* ---------------- saringan ---------------- */

  const r = useMemo(() => ringkasKavling(kavling, sekarang), [kavling, sekarang]);
  const perhatian = useMemo(() => daftarPerhatian(kavling, sekarang), [kavling, sekarang]);
  const daftarTipe = useMemo(() => [...new Set(kavling.map((k) => k.type).filter(Boolean))].sort(urutKode), [kavling]);
  const adaPosisi = useMemo(() => POSISI.filter((p) => kavling.some((k) => k.posisi === p.value)), [kavling]);
  const ambangHarga = useMemo(() => {
    const harga = kavling.map((k) => Number(k.price)).filter((h) => h > 0).sort((a, b) => a - b);
    if (harga.length < 2) return [];
    const langkah = [0.25, 0.5, 0.75, 1].map((q) => Math.ceil(harga[Math.min(harga.length - 1, Math.floor(q * (harga.length - 1)))] / 5e6) * 5e6);
    return [...new Set(langkah)];
  }, [kavling]);

  const cari = saring.cari.trim().toLowerCase();
  const cocok = useCallback(
    (k) =>
      (!saring.tipe || k.type === saring.tipe) &&
      (!saring.posisi || k.posisi === saring.posisi) &&
      (!saring.hargaMaks || (Number(k.price) > 0 && Number(k.price) <= Number(saring.hargaMaks))) &&
      (!saring.blok || (k.block || "Tanpa blok") === saring.blok) &&
      (!cari || String(k.unit_code).toLowerCase().includes(cari) || String(k.konsumen?.nama || "").toLowerCase().includes(cari) || String(k.hold?.lead_nama || "").toLowerCase().includes(cari)),
    [saring, cari]
  );
  const menyaring = Object.values(saring).some(Boolean) || Boolean(kategori);
  const jumlahCocok = kavling.filter((k) => cocok(k) && (!kategori || kategori.has(MODE_PETA[mode].golongkan(k, sekarang)))).length;

  function gantiMode(m) {
    setMode(m);
    setKategori(null);
    const baru = new URLSearchParams(params);
    baru.set("mode", m);
    setParams(baru, { replace: true });
  }

  function bukaKavling(k) {
    setPanelId(k.id);
  }

  function lompatKe(k) {
    setPanelId(k.id);
    setFokus(null);
    setTimeout(() => setFokus(k.id), 0);
  }

  const kavlingPanel = kavling.find((k) => k.id === panelId) || null;
  const adaKavling = kavling.some((k) => k.bentuk);

  /* ---------------- render ---------------- */

  const aksi = (
    <div className="sp-aksi">
      {aktif && adaKavling && (
        <button type="button" onClick={() => setPresentasi(true)} style={gayaTombol}>
          <Presentation size={15} /> Presentasi
        </button>
      )}
      {aktif && (
        <button type="button" onClick={() => setBagikan(true)} style={gayaTombol}>
          <Share2 size={15} /> Bagikan
        </button>
      )}
      {aktif && bisaAtur && (
        <button type="button" onClick={() => setEditor({ fokusId: null })} style={gayaTombol}>
          <Pencil size={15} /> Edit kavling
        </button>
      )}
      {bisaAtur && proyek.length > 0 && (
        <PrimaryButton onClick={() => setModalSp("baru")} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Plus size={15} /> Siteplan
        </PrimaryButton>
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageTitle title="Siteplan" subtitle="Stok, hold, KPR, pembayaran, dan progres bangun — dalam satu peta yang selalu terbaru" action={aksi} />

      {daftar.galat && (
        <Card style={{ borderColor: "#F2D3D1" }}>
          <div style={{ fontSize: 13, color: NEGATIVE, lineHeight: 1.55 }}>{daftar.galat}</div>
        </Card>
      )}

      {!daftar.memuat && !daftar.galat && proyek.length === 0 && (
        <Card>
          <EmptyState icon={MapIcon} label="Belum ada proyek" hint="Siteplan dibuat per proyek. Buat proyeknya dulu di halaman Proyek." />
        </Card>
      )}

      {proyek.length > 0 && !daftar.galat && (
        <>
          {/* ---------- Pemilih proyek & siteplan ---------- */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {proyek.length > 1 && (
              <select
                value={proyekId || ""}
                onChange={(e) => pilihSiteplan(null, e.target.value)}
                aria-label="Proyek"
                style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: "9px 12px", fontSize: 13, fontWeight: 600, color: TEXT_DARK, background: SURFACE, maxWidth: "100%" }}
              >
                {proyek.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <div role="tablist" aria-label="Siteplan" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {siteplanProyek.map((s) => {
                const pilih = s.id === aktif?.id;
                const st = perSiteplan.get(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={pilih}
                    onClick={() => pilihSiteplan(s.id)}
                    style={{
                      font: "inherit",
                      padding: "8px 14px",
                      borderRadius: 999,
                      border: `1px solid ${pilih ? PRIMARY : BORDER}`,
                      background: pilih ? PRIMARY : SURFACE,
                      color: pilih ? "#fff" : TEXT_DARK,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {s.nama}
                    {st && <span style={{ fontWeight: 500, opacity: 0.8 }}> · {st.tersedia} tersedia</span>}
                  </button>
                );
              })}
            </div>
            {aktif && bisaAtur && (
              <button type="button" onClick={() => setModalSp("ubah")} aria-label={`Pengaturan ${aktif.nama}`} title="Pengaturan siteplan" style={{ ...gayaTombol, padding: "0 10px" }}>
                <Settings2 size={15} />
              </button>
            )}
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, color: TEXT_MID }}>
              {aktif?.publik && <span style={{ color: PRIMARY, background: PRIMARY_SOFT, borderRadius: 999, padding: "3px 9px", fontWeight: 600 }}>Publik</span>}
              <button type="button" onClick={muatSemua} aria-label="Muat ulang data" title="Muat ulang" style={{ border: "none", background: "none", color: TEXT_MID, cursor: "pointer", padding: 4, lineHeight: 0 }}>
                <RefreshCw size={14} className={peta.memuat ? "sp-putar" : undefined} />
              </button>
            </span>
          </div>

          {!daftar.memuat && !aktif && (
            <Card>
              <EmptyState
                icon={MapIcon}
                label={`${proyekAktif?.name || "Proyek ini"} belum punya siteplan`}
                hint={bisaAtur ? "Buat siteplan, unggah denahnya bila ada, lalu gambar kavling baris demi baris di editor." : "Minta Admin Marketing membuat siteplan untuk proyek ini."}
                action={bisaAtur && <PrimaryButton onClick={() => setModalSp("baru")}>Buat siteplan</PrimaryButton>}
              />
            </Card>
          )}

          {peta.galat && (
            <Card style={{ borderColor: "#F2D3D1" }}>
              <div style={{ fontSize: 13, color: NEGATIVE }}>{peta.galat}</div>
            </Card>
          )}

          {aktif && !peta.galat && (
            <>
              <KpiSiteplan r={r} laju={laju} />

              <div className="sp-utama">
                <Card style={{ borderColor: BORDER_SOFT, padding: 18, minWidth: 0 }}>
                  {/* ---------- Mode & saringan ---------- */}
                  <div role="radiogroup" aria-label="Mode peta" className="sp-mode">
                    {URUTAN_MODE.map((m) => {
                      const pilih = mode === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          role="radio"
                          aria-checked={pilih}
                          onClick={() => gantiMode(m)}
                          style={{
                            font: "inherit",
                            padding: "7px 12px",
                            borderRadius: 9,
                            border: "none",
                            background: pilih ? SURFACE : "transparent",
                            boxShadow: pilih ? "0 1px 3px rgba(15,42,92,0.14)" : "none",
                            color: pilih ? TEXT_DARK : TEXT_MID,
                            fontSize: 12.5,
                            fontWeight: pilih ? 600 : 500,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {MODE_PETA[m].label}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "12px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${BORDER}`, borderRadius: 11, padding: "0 10px", flex: "1 1 190px", maxWidth: 260 }}>
                      <Search size={14} color={TEXT_MID} aria-hidden="true" />
                      <input
                        value={saring.cari}
                        onChange={(e) => setSaring((s) => ({ ...s, cari: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          const kena = kavling.filter(cocok);
                          if (kena.length) lompatKe(kena[0]);
                        }}
                        placeholder="Kode kavling atau nama"
                        aria-label="Cari kode kavling, nama konsumen, atau prospek"
                        style={{ border: "none", outline: "none", padding: "8px 0", fontSize: 12.5, flex: 1, minWidth: 0, background: "transparent", color: TEXT_DARK }}
                      />
                    </div>
                    {daftarTipe.length > 1 && (
                      <Pilihan label="Tipe" value={saring.tipe} onChange={(v) => setSaring((s) => ({ ...s, tipe: v }))} opsi={daftarTipe.map((t) => ({ value: t, label: `Tipe ${t}` }))} />
                    )}
                    {adaPosisi.length > 0 && (
                      <Pilihan label="Posisi" value={saring.posisi} onChange={(v) => setSaring((s) => ({ ...s, posisi: v }))} opsi={adaPosisi} />
                    )}
                    {ambangHarga.length > 0 && (
                      <Pilihan
                        label="Harga"
                        value={saring.hargaMaks}
                        onChange={(v) => setSaring((s) => ({ ...s, hargaMaks: v }))}
                        opsi={ambangHarga.map((h) => ({ value: String(h), label: `≤ ${rupiahSingkat(h)}` }))}
                      />
                    )}
                    {menyaring && (
                      <button
                        type="button"
                        onClick={() => {
                          setSaring(SARING_KOSONG);
                          setKategori(null);
                        }}
                        style={{ font: "inherit", display: "inline-flex", alignItems: "center", gap: 4, border: "none", background: "none", color: PRIMARY, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        <X size={13} /> Reset ({jumlahCocok} cocok)
                      </button>
                    )}
                  </div>

                  {adaKavling ? (
                    <SiteplanVektor
                      siteplan={aktif}
                      kavling={kavling}
                      fasilitas={peta.fasilitas}
                      mode={mode}
                      terpilih={panelId}
                      onPilih={bukaKavling}
                      redup={(k) => !cocok(k)}
                      kategoriAktif={kategori}
                      onKategori={(key) => setKategori((s) => (s?.has(key) && s.size === 1 ? null : new Set([key])))}
                      lencana={mode === "minat" ? (k) => (Number(k.minat) > 0 && ["tersedia", "ditahan"].includes(statusJual(k, sekarang)) ? k.minat : null) : undefined}
                      fokus={fokus}
                      sekarang={sekarang}
                      tinggi="auto"
                    />
                  ) : (
                    <EmptyState
                      icon={MapIcon}
                      label={peta.memuat ? "Memuat siteplan…" : "Belum ada kavling di siteplan ini"}
                      hint={peta.memuat ? undefined : bisaAtur ? "Buka editor dan gambar baris kavling pertama — unit yang sudah ada di Proyek bisa langsung ditempatkan." : "Kavling belum digambar oleh Admin Marketing."}
                      action={!peta.memuat && bisaAtur && <PrimaryButton onClick={() => setEditor({ fokusId: null })}>Buka editor</PrimaryButton>}
                    />
                  )}
                </Card>

                <div className="sp-samping">
                  <PerluPerhatian items={perhatian} onPilih={lompatKe} />
                  <StokPerTipe kavling={kavling} sekarang={sekarang} />
                </div>
              </div>

              <div className="sp-bawah">
                <StokPerBlok kavling={kavling} sekarang={sekarang} onBlok={(b) => setSaring((s) => ({ ...s, blok: s.blok === b ? "" : b }))} />
                <LajuPenjualan laju={laju} />
              </div>

              <PerbandinganSiteplan
                baris={barisBanding}
                aktifId={aktif?.id}
                onPilih={(id) => {
                  const s = siteplans.find((x) => x.id === id);
                  if (s) pilihSiteplan(s.id, s.project_id);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </>
          )}
        </>
      )}

      {/* ---------- Lapisan ---------- */}
      <PanelKavling
        kavling={kavlingPanel}
        siteplan={aktif}
        proyek={proyekAktif}
        open={Boolean(kavlingPanel)}
        onClose={() => setPanelId(null)}
        onBerubah={muatSemua}
        onBooking={(lead, k) => {
          setPanelId(null);
          setBooking({ lead, unitId: k.id });
        }}
        onUbah={(k) => {
          setPanelId(null);
          setEditor({ fokusId: k.id });
        }}
        sekarang={sekarang}
      />

      <KonversiBookingModal
        lead={booking?.lead}
        open={Boolean(booking)}
        unitAwal={booking?.unitId}
        onClose={() => setBooking(null)}
        onSelesai={muatSemua}
      />

      <EditorSiteplan
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        siteplan={aktif}
        proyek={proyekAktif}
        kavling={kavling}
        fasilitas={peta.fasilitas}
        fokusId={editor?.fokusId}
        onBerubah={muatSemua}
        onPengaturan={() => setModalSp("ubah")}
      />

      <PresentasiSiteplan open={presentasi} onClose={() => setPresentasi(false)} siteplan={aktif} proyek={proyekAktif} kavling={kavling} fasilitas={peta.fasilitas} sekarang={sekarang} />

      <BagikanSiteplan
        open={bagikan}
        onClose={() => setBagikan(false)}
        siteplan={aktif}
        proyek={proyekAktif}
        kavling={kavling}
        fasilitas={peta.fasilitas}
        bisaAtur={bisaAtur}
        onBerubah={daftar.muatUlang}
        sekarang={sekarang}
      />

      <ModalSiteplan
        open={Boolean(modalSp)}
        siteplan={modalSp === "ubah" ? aktif : null}
        proyek={proyek}
        proyekAwal={proyekId}
        jumlahKavling={modalSp === "ubah" ? kavling.filter((k) => k.bentuk).length : 0}
        onClose={() => setModalSp(null)}
        onSimpan={async (data) => {
          const baru = modalSp === "baru";
          setModalSp(null);
          await daftar.muatUlang();
          if (data) pilihSiteplan(data.id, data.project_id);
          // Siteplan baru langsung dibawa ke editor — langkah berikutnya
          // memang menggambar kavlingnya.
          if (baru) setEditor({ fokusId: null });
        }}
        onHapus={async () => {
          setModalSp(null);
          setEditor(null);
          await daftar.muatUlang();
          pilihSiteplan(null);
          muatRingkas();
        }}
      />
    </div>
  );
}

function Pilihan({ label, value, onChange, opsi }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      style={{ border: `1px solid ${value ? PRIMARY : BORDER}`, borderRadius: 11, padding: "8px 10px", fontSize: 12.5, color: value ? PRIMARY : TEXT_DARK, background: value ? PRIMARY_SOFT : SURFACE, fontWeight: value ? 600 : 400 }}
    >
      <option value="">{label}: semua</option>
      {opsi.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const gayaTombol = {
  font: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 38,
  padding: "0 14px",
  borderRadius: 999,
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
