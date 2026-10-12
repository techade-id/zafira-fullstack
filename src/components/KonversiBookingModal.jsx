import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { List, Map as MapIcon, Paperclip, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useToast } from "../context/ToastContext";
import { rupiah, telepon, hariIni } from "../lib/format";
import { unggahBuktiTransfer } from "../lib/berkas";
import InputRupiah from "./InputRupiah";
import SiteplanPicker from "./SiteplanPicker";
import { labelHubungan } from "./PenggantiBi";
import {
  Modal,
  PrimaryButton,
  BORDER,
  SURFACE,
  TEXT_MID,
  TEXT_DARK,
  PRIMARY,
  PRIMARY_SOFT,
  ACCENT_SOFT,
  ACCENT_DARK,
  NEGATIVE,
  inputStyle,
} from "./ui";

/**
 * Booking sebagai satu peristiwa.
 *
 * Urutannya mengikuti cara klien menjual: nama konsumen → pilih perumahan →
 * pilih unit → Booking Fee (otomatis Rp700.000, diatur di Pengaturan Bisnis)
 * → tambahan tanah dan kavling strategis (otomatis dari unitnya) → DP (diketik)
 * → bukti transfer.
 *
 * Tambahan tanah: kavling yang lebih luas dari tipe unitnya membayar
 * selisihnya — tipe 36/70 di kavling 80 m² berarti 10 m² × tarif perumahan.
 * Kavling hook membayar biaya kavling strategis perumahannya. Keduanya
 * dihitung server (hitung_biaya_kavling) dan ditulis server saat konversi;
 * layar ini hanya menampilkan pratinjaunya, supaya angka yang menentukan uang
 * tidak bisa diubah dari peramban.
 *
 * Konversi tetap satu RPC atomik. Bukti transfer diunggah sesudahnya ke folder
 * konsumen yang baru lahir — bucket bukti transfer berpemilik konsumen, bukan
 * prospek — dan pembayaran Booking Fee langsung masuk antrean verifikasi
 * Finance.
 */
export default function KonversiBookingModal({ lead, open, onClose, onSelesai, unitAwal }) {
  const toast = useToast();
  const navigate = useNavigate();

  const [proyek, setProyek] = useState([]);
  const [units, setUnits] = useState([]);
  const [proyekId, setProyekId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [bookingFee, setBookingFee] = useState(700000);
  const [tanggalBooking, setTanggalBooking] = useState(hariIni());
  const [dp, setDp] = useState("");
  const [bukti, setBukti] = useState(null);
  const [biaya, setBiaya] = useState(null);
  // Pemohon BI Checking yang berjalan (migrasi 028): menentukan atas nama
  // siapa konsumen dibuat, dan apakah booking sudah boleh dicatat.
  const [pemohon, setPemohon] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [mode, setMode] = useState("peta");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!open) return;
    setGalat("");
    setKirim(false);
    setMode("peta");
    setMemuat(true);
    setDp("");
    setBukti(null);
    setBiaya(null);
    setPemohon(null);
    setTanggalBooking(hariIni());
    if (lead?.id) {
      supabase
        .from("bi_checking_percobaan")
        .select("urutan, nama_pemohon, hubungan, persetujuan, hasil")
        .eq("lead_id", lead.id)
        .neq("persetujuan", "ditolak")
        .order("urutan", { ascending: false })
        .limit(1)
        .maybeSingle()
        // Sebelum migrasi 028 tabelnya belum ada — atas nama prospek.
        .then(({ data, error }) => setPemohon(error ? null : data || null));
    }
    // Hanya unit tersedia yang ditawarkan, dan bukan yang sedang ditahan untuk
    // prospek lain (migrasi 022).
    Promise.all([
      supabase.from("projects").select("id, name, tarif_tanah_per_m2, biaya_kavling_strategis").order("name"),
      supabase
        .from("units")
        .select("id, project_id, unit_code, block, type, price, luas_tanah, posisi")
        .eq("status", "tersedia")
        .order("unit_code"),
      supabase.from("unit_holds").select("unit_id, lead_id").is("dilepas_at", null).gt("berakhir", new Date().toISOString()),
      supabase.from("app_settings").select("value").eq("key", "booking_fee").maybeSingle(),
    ]).then(([p, u, holds, fee]) => {
      const ditahanLain = new Set((holds.data || []).filter((h) => h.lead_id !== lead?.id).map((h) => h.unit_id));
      const tersedia = (u.data || []).filter((x) => !ditahanLain.has(x.id));
      setProyek(p.data || []);
      setUnits(tersedia);
      const nilaiFee = Number(fee.data?.value);
      setBookingFee(Number.isFinite(nilaiFee) && nilaiFee > 0 ? nilaiFee : 700000);

      // Unit awal: dari Siteplan (sudah dipilih di peta), atau Unit/Blok yang
      // disebut prospek sejak di menu Leads bila kodenya cocok persis.
      const diminati = String(lead?.unit_diminati || "").trim().toUpperCase();
      const awal =
        tersedia.find((x) => x.id === unitAwal) || (diminati ? tersedia.find((x) => String(x.unit_code).toUpperCase() === diminati) : null);
      setUnitId(awal?.id || "");
      const berstok = (p.data || []).find((pr) => tersedia.some((x) => x.project_id === pr.id));
      setProyekId(awal?.project_id || berstok?.id || "");
      setMemuat(false);
    });
  }, [open, unitAwal, lead?.id]);

  const unitProyek = useMemo(() => units.filter((u) => u.project_id === proyekId), [units, proyekId]);
  const stokPer = useMemo(() => {
    const m = new Map();
    for (const u of units) m.set(u.project_id, (m.get(u.project_id) || 0) + 1);
    return m;
  }, [units]);

  const perBlok = useMemo(() => {
    const peta = new Map();
    for (const u of unitProyek) {
      const blok = u.block || "Tanpa Blok";
      if (!peta.has(blok)) peta.set(blok, []);
      peta.get(blok).push(u);
    }
    return [...peta.entries()];
  }, [unitProyek]);

  const unitTerpilih = units.find((u) => u.id === unitId) || null;

  // Rincian biaya kavling dari server — satu rumus untuk pratinjau dan untuk
  // yang benar-benar ditulis saat konversi.
  useEffect(() => {
    if (!unitId) {
      setBiaya(null);
      return undefined;
    }
    let hidup = true;
    supabase.rpc("hitung_biaya_kavling", { p_unit_id: unitId }).then(({ data, error }) => {
      if (hidup) setBiaya(error ? { galat: error.message } : data);
    });
    return () => {
      hidup = false;
    };
  }, [unitId]);

  const biayaTanah = Number(biaya?.biaya_tanah) || 0;
  const biayaStrategis = Number(biaya?.biaya_strategis) || 0;
  const nominalDp = dp === "" ? 0 : Number(dp) || 0;
  const totalDp = nominalDp + biayaTanah + biayaStrategis;

  function gantiProyek(id) {
    setProyekId(id);
    // Unit dari perumahan lain tidak boleh ikut terbawa diam-diam.
    if (unitTerpilih && unitTerpilih.project_id !== id) setUnitId("");
  }

  const pengganti = pemohon && pemohon.urutan > 1 && pemohon.persetujuan === "disetujui" && pemohon.hasil === "lolos";
  // Pesan yang sama dengan penolakan server, ditampilkan sebelum tombol ditekan.
  const terhalang =
    pemohon?.persetujuan === "menunggu"
      ? `Pemohon pengganti ${pemohon.nama_pemohon} masih menunggu persetujuan Admin Sistem.`
      : pemohon && pemohon.urutan > 1 && pemohon.hasil !== "lolos"
      ? `BI Checking pemohon pengganti ${pemohon.nama_pemohon} belum lolos.`
      : lead?.bi_checking_status === "tidak_lolos"
      ? "BI Checking prospek ini tidak lolos. Ajukan pemohon pengganti dari menu BI Checking, atau batalkan prospek."
      : "";
  const namaKonsumen = pengganti ? pemohon.nama_pemohon : lead?.name;

  async function jalankan() {
    if (!unitId) {
      setGalat("Pilih unit yang dibooking.");
      return;
    }
    if (!tanggalBooking) {
      setGalat("Isi tanggal booking.");
      return;
    }
    if (!bukti) {
      setGalat("Lampirkan bukti transfer Booking Fee.");
      return;
    }

    setKirim(true);
    setGalat("");

    const { data: konsumenId, error } = await supabase.rpc("convert_lead_to_customer", {
      p_lead_id: lead.id,
      p_unit_id: unitId,
      p_nominal_booking: bookingFee,
      p_tanggal_booking: tanggalBooking,
      p_nominal_dp: dp === "" ? null : Number(dp),
    });

    if (error) {
      setKirim(false);
      // Pesan dari RPC sudah berbahasa Indonesia dan menyebut sebabnya.
      setGalat(error.message);
      return;
    }

    // Konsumen sudah lahir; bukti transfer menyusul ke foldernya. Kalau yang
    // ini gagal, booking tetap sah — buktinya bisa diunggah ulang dari menu
    // Pembayaran, dan pesannya mengatakan itu.
    const { data: bayar } = await supabase
      .from("payments")
      .select("*")
      .eq("customer_id", konsumenId)
      .eq("payment_type", "booking")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const hasilBukti = bayar ? await unggahBuktiTransfer(bayar, bukti) : { error: "baris pembayaran Booking Fee tidak ditemukan" };

    setKirim(false);
    if (hasilBukti.error) {
      toast.gagal(`${namaKonsumen} terbooking, tetapi bukti transfer belum tersimpan (${hasilBukti.error}). Unggah ulang dari menu Pembayaran.`);
    } else {
      toast.sukses(`${namaKonsumen} terbooking — Booking Fee masuk antrean verifikasi Finance.`);
    }
    onSelesai?.();
    onClose?.();
    navigate(`/konsumen/${konsumenId}`);
  }

  if (!lead) return null;

  return (
    <Modal open={open} labelledBy="konversi-judul" onClose={() => !kirim && onClose?.()} width={mode === "peta" ? 720 : 540}>
      <>
        <div id="konversi-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          Konversi ke Booking
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 18, lineHeight: 1.5 }}>
          Data prospek terbawa otomatis. Booking Fee, tambahan tanah, dan kavling strategis dihitung sistem — yang diketik hanya DP.
        </div>

        {/* 1. Nama konsumen — dibaca saja, ini konfirmasi atas data yang ada. */}
        <div style={{ background: PRIMARY_SOFT, borderRadius: 13, padding: "13px 15px", marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: PRIMARY, letterSpacing: "0.04em", marginBottom: 3 }}>NAMA KONSUMEN</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_DARK, marginBottom: 2 }}>{namaKonsumen}</div>
          <div style={{ fontSize: 12, color: TEXT_MID }}>
            {pengganti ? `${labelHubungan(pemohon.hubungan)} dari ${lead.name} · ` : ""}
            {telepon(lead.phone)}
            {lead.unit_diminati ? ` · minat ${lead.unit_diminati}` : ""}
          </div>
          {pengganti && (
            <div style={{ fontSize: 11.5, color: PRIMARY, marginTop: 6, lineHeight: 1.45 }}>
              Atas nama pemohon pengganti yang lolos BI Checking — SPR, akad kredit, dan SHM nanti atas nama ini. Kontak dan riwayat
              tetap dari prospek {lead.name}.
            </div>
          )}
        </div>

        {terhalang && (
          <div role="alert" style={{ fontSize: 12.5, color: NEGATIVE, background: "#FBE9E8", border: "1px solid #F2D3D1", borderRadius: 12, padding: "10px 13px", marginBottom: 16, lineHeight: 1.5 }}>
            {terhalang} Booking belum bisa dicatat.
          </div>
        )}

        {/* 2. Perumahan */}
        <div style={{ marginBottom: 14 }}>
          <label htmlFor="kv-proyek" style={labelGaya}>
            Pilih Perumahan
          </label>
          <select id="kv-proyek" value={proyekId} onChange={(e) => gantiProyek(e.target.value)} style={inputStyle} disabled={memuat}>
            <option value="">{memuat ? "Memuat perumahan…" : "— pilih perumahan —"}</option>
            {proyek.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {stokPer.get(p.id) || 0} unit tersedia
              </option>
            ))}
          </select>
        </div>

        {/* 3. Unit */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 7 }}>
            <span style={{ ...labelGaya, marginBottom: 0 }}>Pilih Unit</span>
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { k: "peta", label: "Peta", ikon: MapIcon },
                { k: "daftar", label: "Daftar", ikon: List },
              ].map((m) => {
                const aktif = mode === m.k;
                return (
                  <button
                    key={m.k}
                    type="button"
                    onClick={() => setMode(m.k)}
                    aria-pressed={aktif}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 11px",
                      borderRadius: 999,
                      border: `1px solid ${aktif ? PRIMARY : BORDER}`,
                      background: aktif ? PRIMARY : SURFACE,
                      color: aktif ? "#fff" : TEXT_MID,
                      fontSize: 11.5,
                      fontWeight: aktif ? 600 : 500,
                      cursor: "pointer",
                    }}
                  >
                    <m.ikon size={12} aria-hidden="true" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {!proyekId ? (
            <div style={{ fontSize: 12.5, color: TEXT_MID, padding: "10px 2px" }}>Pilih perumahan lebih dulu.</div>
          ) : mode === "peta" ? (
            <SiteplanPicker
              proyekId={proyekId}
              unitTerpilihId={unitId}
              leadId={lead.id}
              onPilih={(u) => setUnitId((v) => (v === u.id ? "" : u.id))}
            />
          ) : (
            <select id="kv-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)} style={inputStyle} disabled={memuat}>
              <option value="">{memuat ? "Memuat unit…" : "— pilih unit —"}</option>
              {perBlok.map(([blok, daftar]) => (
                <optgroup key={blok} label={`Blok ${blok}`}>
                  {daftar.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unit_code}
                      {u.type ? ` — ${u.type}` : ""}
                      {u.luas_tanah ? ` — ${Number(u.luas_tanah)} m²` : ""}
                      {u.posisi === "hook" ? " — hook" : ""}
                      {u.price ? ` — ${rupiah(u.price)}` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}

          <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 7, lineHeight: 1.45 }}>
            {proyekId && !memuat && unitProyek.length === 0
              ? "Tidak ada unit tersedia di perumahan ini."
              : unitTerpilih
              ? `Terpilih: ${unitTerpilih.unit_code}${unitTerpilih.type ? ` · tipe ${unitTerpilih.type}` : ""}${unitTerpilih.price ? ` · ${rupiah(unitTerpilih.price)}` : ""}`
              : "Hanya unit tersedia yang bisa dipilih."}
          </div>
        </div>

        {/* 4. Booking Fee dan tanggal */}
        <div className="rg-2" style={{ marginBottom: 14 }}>
          <div>
            <span style={labelGaya}>Booking Fee</span>
            <div style={{ ...inputStyle, background: "#F7F9FC", fontWeight: 700, color: TEXT_DARK }} title="Nilai tetap — diatur Admin di Pengaturan Bisnis">
              {rupiah(bookingFee)}
            </div>
          </div>
          <div>
            <label htmlFor="kv-tanggal" style={labelGaya}>
              Tanggal Booking
            </label>
            <input id="kv-tanggal" type="date" value={tanggalBooking} max={hariIni()} onChange={(e) => setTanggalBooking(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {/* 5. Biaya kavling — otomatis */}
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 13, padding: "12px 14px", marginBottom: 14 }}>
          <BarisBiaya
            label="Tambahan Tanah"
            nilai={unitTerpilih ? biayaTanah : null}
            keterangan={!unitTerpilih ? "pilih unit" : keteranganTanah(biaya, unitTerpilih)}
          />
          <BarisBiaya
            label="Kavling Strategis"
            nilai={unitTerpilih ? biayaStrategis : null}
            keterangan={!unitTerpilih ? "pilih unit" : biaya?.strategis ? "kavling hook" : "bukan hook"}
          />
          {biaya?.galat && <div style={{ fontSize: 11.5, color: NEGATIVE, marginTop: 6 }}>Biaya kavling belum bisa dihitung: {biaya.galat}</div>}
        </div>

        {/* 6. DP — satu-satunya angka yang diketik */}
        <div style={{ marginBottom: 14 }}>
          <label htmlFor="kv-dp" style={labelGaya}>
            DP <span style={{ fontWeight: 400 }}>(diisi manual, boleh menyusul)</span>
          </label>
          <InputRupiah id="kv-dp" value={dp} onChange={setDp} />
          {(nominalDp > 0 || biayaTanah > 0 || biayaStrategis > 0) && (
            <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 6 }}>
              Total DP = DP + tambahan tanah + kavling strategis = <b style={{ color: TEXT_DARK }}>{rupiah(totalDp)}</b>
            </div>
          )}
        </div>

        {/* 7. Bukti transfer */}
        <div
          style={{
            border: `1px ${bukti ? "solid" : "dashed"} ${bukti ? BORDER : "#C7D3EA"}`,
            borderRadius: 12,
            padding: "11px 13px",
            marginBottom: 18,
            background: bukti ? SURFACE : "#FBFCFE",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Paperclip size={13} color={TEXT_MID} aria-hidden="true" />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: TEXT_MID }}>
              Bukti Transfer Booking Fee<span style={{ color: NEGATIVE }} aria-hidden="true"> *</span>
            </span>
            {bukti ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: TEXT_DARK, minWidth: 0 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{bukti.name}</span>
                <button type="button" onClick={() => setBukti(null)} disabled={kirim} aria-label="Lepas bukti" style={{ border: "none", background: "none", color: TEXT_MID, cursor: "pointer", padding: 2, lineHeight: 0 }}>
                  <X size={13} />
                </button>
              </span>
            ) : (
              <span style={{ fontSize: 11, color: TEXT_MID }}>belum ada</span>
            )}
            <label style={{ marginLeft: "auto", border: `1px solid ${BORDER}`, background: "#fff", color: TEXT_DARK, borderRadius: 9, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: kirim ? "default" : "pointer", whiteSpace: "nowrap" }}>
              {bukti ? "Ganti" : "+ Pilih berkas"}
              <input
                type="file"
                accept="image/*,application/pdf"
                disabled={kirim}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setBukti(f);
                  e.target.value = "";
                }}
                style={{ display: "none" }}
              />
            </label>
          </div>
          <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 6, lineHeight: 1.45 }}>Screenshot atau foto bukti transfer dari konsumen. Finance memverifikasinya dengan kuitansi resmi.</div>
        </div>

        {/* Akibat dijabarkan sebelum tombol ditekan — konversi menyentuh
            banyak tabel sekaligus, dan tak satu pun terlihat dari layar ini. */}
        <div style={{ background: ACCENT_SOFT, border: "1px solid #F6CDB8", borderRadius: 13, padding: "13px 15px", marginBottom: 18 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: ACCENT_DARK, marginBottom: 8, letterSpacing: "0.03em" }}>YANG AKAN TERJADI</div>
          <ul style={{ margin: 0, paddingLeft: 17, fontSize: 12.5, color: ACCENT_DARK, lineHeight: 1.75 }}>
            <li>
              Konsumen <b>{namaKonsumen}</b> dibuat dari prospek ini
            </li>
            <li>
              {unitTerpilih ? (
                <>
                  Unit <b>{unitTerpilih.unit_code}</b> ter-<i>reserve</i> dan tidak bisa dibooking orang lain
                </>
              ) : (
                <>Unit belum dipilih</>
              )}
            </li>
            <li>
              Booking Fee <b>{rupiah(bookingFee)}</b> beserta bukti transfernya masuk antrean verifikasi Finance
            </li>
            {totalDp > 0 && (
              <li>
                Total DP <b>{rupiah(totalDp)}</b> tercatat di berkas KPR
              </li>
            )}
            <li>Tahap prospek naik menjadi Booking</li>
          </ul>
        </div>

        {galat && (
          <div role="alert" style={{ fontSize: 12.5, color: NEGATIVE, background: "#FBE9E8", border: "1px solid #F2D3D1", borderRadius: 12, padding: "10px 13px", marginBottom: 16, lineHeight: 1.5 }}>
            {galat}
          </div>
        )}

        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={kirim} style={gayaSekunder}>
            Batal
          </button>
          <PrimaryButton onClick={jalankan} disabled={kirim || memuat || Boolean(terhalang)}>
            {kirim ? "Memproses…" : "Konversi ke Booking"}
          </PrimaryButton>
        </div>
      </>
    </Modal>
  );
}

/** "80 m² − standar 70 m² = 10 m² × Rp1.000.000" — atau sebab angkanya nol. */
function keteranganTanah(biaya, unit) {
  if (!biaya || biaya.galat) return "menghitung…";
  if (biaya.luas_tanah == null) return "luas kavling belum diisi di siteplan";
  if (biaya.luas_standar == null) return `tipe "${unit.type || "-"}" tanpa angka luas tanah`;
  const lebih = Number(biaya.kelebihan_m2) || 0;
  if (lebih <= 0) return `${Number(biaya.luas_tanah)} m², sesuai standar ${Number(biaya.luas_standar)} m²`;
  return `${Number(biaya.luas_tanah)} m² − standar ${Number(biaya.luas_standar)} m² = ${lebih} m² × ${rupiah(biaya.tarif_per_m2)}`;
}

function BarisBiaya({ label, nilai, keterangan }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "4px 0" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: TEXT_DARK }}>
          {label} <span style={{ fontSize: 10.5, fontWeight: 600, color: PRIMARY, background: PRIMARY_SOFT, borderRadius: 999, padding: "1px 7px", marginLeft: 4 }}>otomatis</span>
        </div>
        <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 1 }}>{keterangan}</div>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: TEXT_DARK, whiteSpace: "nowrap" }}>{nilai == null ? "—" : rupiah(nilai, { kosong: "Rp0" })}</div>
    </div>
  );
}

const labelGaya = { display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 };

const gayaSekunder = {
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  borderRadius: 999,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
