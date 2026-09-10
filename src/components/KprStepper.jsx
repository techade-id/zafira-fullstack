import React, { useMemo, useState } from "react";
import { Check, Lock, AlertTriangle, ChevronDown } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useToast } from "../context/ToastContext";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { rupiah, rupiahInput, angkaDariRupiah, tanggal, selisihHari } from "../lib/format";
import {
  BORDER,
  SURFACE,
  TEXT_MID,
  TEXT_DARK,
  PRIMARY,
  PRIMARY_SOFT,
  ACCENT,
  ACCENT_SOFT,
  ACCENT_DARK,
  POSITIVE,
  NEGATIVE,
  inputStyle,
} from "./ui";

/**
 * Progres KPR sebagai tahapan, bukan formulir.
 *
 * Sebelumnya layar ini adalah tujuh belas kotak isian datar dalam satu grid,
 * padahal subjudulnya sendiri sudah menjanjikan sebuah alur
 * (Booking → DP → Bank → SP3K → Akad → Serah Terima → BPHTB → SHM). Yang hilang
 * bukan datanya, melainkan jawaban atas dua pertanyaan yang justru paling
 * sering ditanyakan Admin Marketing: *sekarang sampai mana* dan *berikutnya apa*.
 *
 * Tahap aktif dihitung dari tanggal yang sudah terisi — tidak ada kolom status
 * baru, sehingga tidak ada kemungkinan status dan tanggal saling bertentangan.
 */

const TAHAP = [
  {
    kunci: "booking",
    label: "Booking",
    selesai: (k) => Boolean(k.tanggal_booking),
    ringkas: (k) => [tanggal(k.tanggal_booking), rupiah(k.nominal_booking)].filter((v) => v !== "-").join(" · "),
    bidang: [
      { key: "tanggal_booking", label: "Tanggal Booking", tipe: "date" },
      { key: "nominal_booking", label: "Nominal Booking", tipe: "rupiah" },
    ],
  },
  {
    kunci: "dp",
    label: "DP",
    selesai: (k) => Boolean(k.tanggal_dp),
    ringkas: (k) => [tanggal(k.tanggal_dp), rupiah(k.nominal_total_dp || k.nominal_dp)].filter((v) => v !== "-").join(" · "),
    bidang: [
      { key: "tanggal_dp", label: "Tanggal Pembayaran DP", tipe: "date" },
      { key: "nominal_dp", label: "Nominal DP", tipe: "rupiah" },
      { key: "biaya_tambahan_tanah", label: "Biaya Tambahan Tanah", tipe: "rupiah" },
      { key: "nominal_total_dp", label: "Total DP (Promo + Tanah)", tipe: "rupiah" },
      { key: "dp_terbayar", label: "DP Terbayar", tipe: "rupiah" },
    ],
  },
  {
    kunci: "bank",
    label: "Bank",
    selesai: (k) => Boolean(k.tanggal_masuk_bank),
    ringkas: (k) => [k.nama_bank, tanggal(k.tanggal_masuk_bank), k.progres_berkas].filter((v) => v && v !== "-").join(" · "),
    bidang: [
      { key: "nama_bank", label: "Nama Bank", tipe: "bank" },
      { key: "tanggal_masuk_bank", label: "Tanggal Masuk Bank", tipe: "date" },
      { key: "progres_berkas", label: "Progres Berkas", tipe: "progres" },
    ],
  },
  {
    kunci: "sp3k",
    label: "SP3K",
    selesai: (k) => Boolean(k.tanggal_sp3k_terbit),
    ringkas: (k) =>
      [tanggal(k.tanggal_sp3k_terbit), k.tanggal_sp3k_expired ? `berlaku s/d ${tanggal(k.tanggal_sp3k_expired)}` : null]
        .filter((v) => v && v !== "-")
        .join(" · "),
    bidang: [
      { key: "tanggal_sp3k_terbit", label: "Tanggal SP3K Terbit", tipe: "date" },
      { key: "tanggal_sp3k_expired", label: "Tanggal SP3K Expired", tipe: "date" },
      { key: "tanggal_sp3k_perpanjangan", label: "Tanggal SP3K Perpanjangan", tipe: "date" },
    ],
  },
  {
    kunci: "akad",
    label: "Akad",
    selesai: (k) => Boolean(k.tanggal_akad),
    ringkas: (k) => tanggal(k.tanggal_akad),
    bidang: [{ key: "tanggal_akad", label: "Tanggal Akad", tipe: "date" }],
  },
  {
    kunci: "serah",
    label: "Serah Terima",
    selesai: (k) => Boolean(k.tanggal_serah_terima_kunci),
    ringkas: (k) => tanggal(k.tanggal_serah_terima_kunci),
    bidang: [{ key: "tanggal_serah_terima_kunci", label: "Tanggal Serah Terima Kunci", tipe: "date" }],
  },
  {
    kunci: "bphtb",
    label: "BPHTB",
    selesai: (k) => k.bphtb !== null && k.bphtb !== undefined && k.bphtb !== "",
    ringkas: (k) => rupiah(k.bphtb),
    bidang: [{ key: "bphtb", label: "BPHTB", tipe: "rupiah" }],
  },
  {
    kunci: "shm",
    label: "SHM",
    selesai: (k) => Boolean(k.shm),
    ringkas: (k) => k.shm || "-",
    bidang: [{ key: "shm", label: "Nomor SHM", tipe: "text" }],
  },
];

/** Peringatan yang selama ini tidak pernah dimunculkan meski datanya ada. */
function peringatan(kpr) {
  const hasil = [];

  if (kpr.tanggal_sp3k_expired && !kpr.tanggal_akad) {
    const sisa = selisihHari(kpr.tanggal_sp3k_expired);
    if (sisa !== null && sisa < 0) {
      hasil.push({ berat: true, teks: `SP3K sudah kedaluwarsa ${Math.abs(sisa)} hari lalu dan akad belum terjadi. Perlu perpanjangan.` });
    } else if (sisa !== null && sisa <= 14) {
      hasil.push({ berat: sisa <= 7, teks: `SP3K kedaluwarsa dalam ${sisa} hari. Pastikan akad terjadwal atau ajukan perpanjangan.` });
    }
  }

  if (kpr.tanggal_masuk_bank && !kpr.tanggal_sp3k_terbit) {
    const lama = -selisihHari(kpr.tanggal_masuk_bank);
    if (lama > 60) hasil.push({ berat: true, teks: `Berkas sudah ${lama} hari di bank tanpa SP3K terbit.` });
    else if (lama > 30) hasil.push({ berat: false, teks: `Berkas sudah ${lama} hari di bank. Perlu ditanyakan ke bank.` });
  }

  if (kpr.nominal_total_dp && kpr.dp_terbayar != null) {
    const sisa = Number(kpr.nominal_total_dp) - Number(kpr.dp_terbayar);
    if (sisa > 0) hasil.push({ berat: false, teks: `Sisa DP belum terbayar: ${rupiah(sisa)}.` });
  }

  return hasil;
}

export default function KprStepper({ kpr, customerId, editable, onChange }) {
  const toast = useToast();
  const banks = useBusinessSettings("bank");
  const progresBerkas = useBusinessSettings("progres_berkas");

  const [nilai, setNilai] = useState(kpr || {});
  const [dibuka, setDibuka] = useState(null);
  const [menyimpan, setMenyimpan] = useState(null);
  const [tersimpan, setTersimpan] = useState(null);

  // Cerminan nilai yang benar-benar ada di database. Membandingkan dengan prop
  // `kpr` tidak cukup: prop itu ikut basi begitu induk memuat ulang karena
  // sebab lain, dan sebuah kolom yang diubah lalu dikembalikan ke nilai
  // semula akan dikira tidak berubah — sehingga nilai antaranya tertinggal.
  const tersimpanRef = React.useRef({ ...(kpr || {}) });

  // Hanya berganti konsumen yang mengatur ulang keadaan.
  //
  // Sebelumnya `kpr` ikut menjadi dependensi, dan karena setiap penyimpanan
  // per kolom mengabarkan objek KPR baru ke induk, efek ini menyala kembali
  // dan menutup tahap yang sedang diisi — tepat setelah pengguna mengetik satu
  // kolom di dalamnya.
  React.useEffect(() => {
    setNilai(kpr || {});
    tersimpanRef.current = { ...(kpr || {}) };
    setDibuka(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const indeksAktif = useMemo(() => {
    const belum = TAHAP.findIndex((t) => !t.selesai(nilai));
    return belum === -1 ? TAHAP.length - 1 : belum;
  }, [nilai]);

  const terbuka = dibuka ?? TAHAP[indeksAktif]?.kunci;
  const catatan = peringatan(nilai);

  /**
   * Simpan per bidang saat fokus meninggalkannya.
   *
   * Tombol "Simpan Progres KPR" tunggal yang lama berarti berpindah konsumen
   * di tengah pengisian membuang seluruh isian tanpa peringatan apa pun.
   */
  async function simpanBidang(key, value) {
    if (!editable || !customerId) return;
    const asal = tersimpanRef.current[key] ?? null;
    const baru = value === "" ? null : value;
    if (String(asal ?? "") === String(baru ?? "")) return;

    setMenyimpan(key);
    const { error } = await supabase
      .from("customer_kpr")
      .upsert({ customer_id: customerId, [key]: baru, updated_at: new Date().toISOString() }, { onConflict: "customer_id" });
    setMenyimpan(null);

    if (error) {
      // Nilai dikembalikan ke keadaan tersimpan, supaya layar tidak menampilkan
      // sesuatu yang sebenarnya tidak ada di database.
      setNilai((v) => ({ ...v, [key]: asal }));
      toast.gagal(`Gagal menyimpan: ${error.message}`);
      return;
    }

    tersimpanRef.current = { ...tersimpanRef.current, [key]: baru };
    setTersimpan(key);
    setTimeout(() => setTersimpan((k) => (k === key ? null : k)), 1800);
    onChange?.({ ...nilai, [key]: baru });
  }

  function ubah(key, value) {
    setNilai((v) => ({ ...v, [key]: value }));
  }

  function renderBidang(b) {
    const v = nilai[b.key] ?? "";
    const gaya = { ...inputStyle, ...(editable ? null : { background: "#F4F6FA", color: TEXT_MID }) };

    if (b.tipe === "bank" || b.tipe === "progres") {
      const opsi = b.tipe === "bank" ? banks : progresBerkas;
      return (
        <select
          value={v}
          disabled={!editable}
          onChange={(e) => {
            ubah(b.key, e.target.value);
            simpanBidang(b.key, e.target.value);
          }}
          style={gaya}
        >
          <option value="">{b.tipe === "bank" ? "Pilih Bank" : "Pilih Progres"}</option>
          {withCurrentValue(opsi, v).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }

    if (b.tipe === "rupiah") {
      return (
        <input
          // type="text" + inputMode: angka besar jadi terbaca ("45.000.000"),
          // sementara papan tik ponsel tetap membuka mode angka.
          type="text"
          inputMode="numeric"
          value={rupiahInput(v)}
          disabled={!editable}
          onChange={(e) => ubah(b.key, angkaDariRupiah(e.target.value))}
          onBlur={(e) => simpanBidang(b.key, angkaDariRupiah(e.target.value))}
          style={gaya}
        />
      );
    }

    return (
      <input
        type={b.tipe}
        value={v}
        disabled={!editable}
        onChange={(e) => ubah(b.key, e.target.value)}
        onBlur={(e) => simpanBidang(b.key, e.target.value)}
        style={gaya}
      />
    );
  }

  return (
    <div>
      {/* Rel tahapan — satu pandangan untuk menjawab "sampai mana". */}
      <div className="kpr-rail" style={{ display: "flex", alignItems: "flex-start", marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
        {TAHAP.map((t, i) => {
          const selesai = t.selesai(nilai);
          const aktif = i === indeksAktif;
          return (
            <React.Fragment key={t.kunci}>
              {i > 0 && (
                <div
                  aria-hidden="true"
                  style={{ flex: 1, height: 2, background: selesai ? PRIMARY : BORDER, marginTop: 12, minWidth: 14 }}
                />
              )}
              <button
                onClick={() => setDibuka(t.kunci)}
                aria-current={aktif ? "step" : undefined}
                title={t.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 5,
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    background: selesai ? PRIMARY : aktif ? ACCENT : SURFACE,
                    color: selesai || aktif ? "#fff" : TEXT_MID,
                    border: selesai || aktif ? "none" : `1.5px solid ${BORDER}`,
                  }}
                >
                  {selesai ? <Check size={14} /> : i + 1}
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: aktif ? 700 : 500,
                    color: aktif ? ACCENT_DARK : selesai ? TEXT_DARK : TEXT_MID,
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.label}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Peringatan. Tanggal SP3K expired sudah lama tersimpan tetapi tidak
          pernah dipakai untuk apa pun — inilah gunanya. */}
      {catatan.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {catatan.map((c, i) => (
            <div
              key={i}
              role={c.berat ? "alert" : undefined}
              style={{
                display: "flex",
                gap: 9,
                alignItems: "flex-start",
                background: c.berat ? "#FBE9E8" : ACCENT_SOFT,
                border: `1px solid ${c.berat ? "#F2D3D1" : "#F6CDB8"}`,
                borderRadius: 12,
                padding: "10px 13px",
                fontSize: 12.5,
                color: c.berat ? NEGATIVE : ACCENT_DARK,
                lineHeight: 1.5,
              }}
            >
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
              <span>{c.teks}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tahap. Yang selesai terlipat jadi satu baris, yang aktif terbuka. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {TAHAP.map((t, i) => {
          const selesai = t.selesai(nilai);
          const aktif = i === indeksAktif;
          const buka = terbuka === t.kunci;
          const mendatang = i > indeksAktif;
          const prasyarat = mendatang ? TAHAP[indeksAktif]?.label : null;

          return (
            <div
              key={t.kunci}
              style={{
                border: `1px solid ${buka ? (aktif ? ACCENT : PRIMARY_SOFT) : BORDER}`,
                borderRadius: 14,
                background: mendatang && !buka ? "#FBFCFE" : SURFACE,
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => setDibuka(buka ? "__tidak_ada__" : t.kunci)}
                aria-expanded={buka}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "12px 15px",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  font: "inherit",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: mendatang ? TEXT_MID : TEXT_DARK }}>
                    {t.label}
                  </span>
                  {selesai && <Check size={14} color={POSITIVE} aria-label="selesai" />}
                  {aktif && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: ACCENT_SOFT, color: ACCENT_DARK, padding: "2px 8px", borderRadius: 999 }}>
                      TAHAP AKTIF
                    </span>
                  )}
                  {mendatang && <Lock size={12} color={TEXT_MID} aria-label="belum sampai tahap ini" />}
                </span>

                {!buka && (
                  <span style={{ fontSize: 12, color: TEXT_MID, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "48%" }}>
                    {selesai ? t.ringkas(nilai) : mendatang ? `Menunggu ${prasyarat}` : "Belum diisi"}
                  </span>
                )}

                <ChevronDown
                  size={15}
                  color={TEXT_MID}
                  aria-hidden="true"
                  style={{ flexShrink: 0, transform: buka ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}
                />
              </button>

              {buka && (
                <div style={{ padding: "0 15px 15px" }}>
                  <div className="rg-3">
                    {t.bidang.map((b) => (
                      <div key={b.key}>
                        <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 }}>
                          {b.label}
                          {menyimpan === b.key && <span style={{ fontWeight: 500, color: TEXT_MID }}> · menyimpan…</span>}
                          {tersimpan === b.key && <span style={{ fontWeight: 500, color: POSITIVE }}> · tersimpan</span>}
                        </label>
                        {renderBidang(b)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Dua bidang yang tidak termasuk tahap mana pun. */}
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 }}>
            Alamat KTP
            {tersimpan === "alamat_ktp" && <span style={{ fontWeight: 500, color: POSITIVE }}> · tersimpan</span>}
          </label>
          <input
            value={nilai.alamat_ktp ?? ""}
            disabled={!editable}
            onChange={(e) => ubah("alamat_ktp", e.target.value)}
            onBlur={(e) => simpanBidang("alamat_ktp", e.target.value)}
            style={{ ...inputStyle, ...(editable ? null : { background: "#F4F6FA", color: TEXT_MID }) }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 }}>
            Kendala atau Catatan
            {tersimpan === "kendala" && <span style={{ fontWeight: 500, color: POSITIVE }}> · tersimpan</span>}
          </label>
          <textarea
            value={nilai.kendala ?? ""}
            disabled={!editable}
            onChange={(e) => ubah("kendala", e.target.value)}
            onBlur={(e) => simpanBidang("kendala", e.target.value)}
            style={{ ...inputStyle, minHeight: 62, resize: "vertical", fontFamily: "inherit", ...(editable ? null : { background: "#F4F6FA", color: TEXT_MID }) }}
          />
        </div>
      </div>

      {editable && (
        <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 12, lineHeight: 1.5 }}>
          Perubahan tersimpan sendiri begitu Anda berpindah dari sebuah kolom — tidak ada tombol simpan yang perlu ditekan.
        </div>
      )}
    </div>
  );
}
